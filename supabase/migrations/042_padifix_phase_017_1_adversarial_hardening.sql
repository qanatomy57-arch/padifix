-- ============================================================================
-- PADIFIX PHASE 017.1: ADVERSARIAL PLATFORM PROTECTION & FAIL-CLOSED HARDENING
-- Migration: 042_padifix_phase_017_1_adversarial_hardening.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HARDEN RLS & REVOKE DIRECT WRITE PRIVILEGES ON QUOTA & RATE LIMIT TABLES
-- ----------------------------------------------------------------------------

-- Revoke all direct modification privileges from anon and authenticated
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.daily_sms_quotas FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rate_limit_events FROM anon, authenticated, public;

-- Grant SELECT only for read operations
GRANT SELECT ON public.daily_sms_quotas TO anon, authenticated;
GRANT SELECT ON public.rate_limit_events TO anon, authenticated;

-- Grant full management privileges exclusively to service_role
GRANT ALL ON public.daily_sms_quotas TO service_role;
GRANT ALL ON public.rate_limit_events TO service_role;

-- Drop insecure open-write policies from previous migration
DROP POLICY IF EXISTS "Allow backend managing daily sms quotas" ON public.daily_sms_quotas;
DROP POLICY IF EXISTS "Allow backend rate limit operations" ON public.rate_limit_events;

-- Re-enable Row Level Security explicitly
ALTER TABLE public.daily_sms_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- Allow only service_role to insert/update/delete directly on tables
CREATE POLICY "Service role full access on daily sms quotas"
  ON public.daily_sms_quotas FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on rate limit events"
  ON public.rate_limit_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- 2. HARDENED ATOMIC SMS RESERVATION RPC (SEARCH_PATH & CEILING ENFORCEMENT)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_daily_sms(
  p_scope TEXT,
  p_date DATE,
  p_cap INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
  v_allowed BOOLEAN := FALSE;
  v_sanitized_cap INT;
  v_max_platform_ceiling CONSTANT INT := 5000;
  v_max_artisan_ceiling CONSTANT INT := 50;
BEGIN
  -- Strict Scope Validation: reject arbitrary injection namespaces
  IF p_scope IS NULL OR NOT (p_scope = 'platform' OR p_scope ~ '^artisan:[0-9]+$') THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'INVALID_SCOPE_NAMESPACE',
      'scope', p_scope
    );
  END IF;

  -- Server-Authoritative Cap Clamping: prevent caller-controlled cap tampering
  IF p_scope = 'platform' THEN
    v_sanitized_cap := LEAST(GREATEST(COALESCE(p_cap, 1000), 1), v_max_platform_ceiling);
  ELSE
    v_sanitized_cap := LEAST(GREATEST(COALESCE(p_cap, 10), 1), v_max_artisan_ceiling);
  END IF;

  -- Validate Date
  IF p_date IS NULL THEN
    p_date := CURRENT_DATE;
  END IF;

  -- Attempt atomic conditional update with strict ceiling
  INSERT INTO public.daily_sms_quotas (window_date, scope, dispatched_count, max_cap, updated_at)
  VALUES (p_date, p_scope, 1, v_sanitized_cap, NOW())
  ON CONFLICT (window_date, scope)
  DO UPDATE SET 
    dispatched_count = public.daily_sms_quotas.dispatched_count + 1,
    max_cap = v_sanitized_cap,
    updated_at = NOW()
  WHERE public.daily_sms_quotas.dispatched_count < v_sanitized_cap
  RETURNING dispatched_count INTO v_count;

  IF v_count IS NOT NULL THEN
    v_allowed := TRUE;
  ELSE
    -- Quota exhausted: read current count without mutating
    SELECT dispatched_count INTO v_count
    FROM public.daily_sms_quotas
    WHERE window_date = p_date AND scope = p_scope;
    v_allowed := FALSE;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current_count', COALESCE(v_count, v_sanitized_cap),
    'max_cap', v_sanitized_cap,
    'scope', p_scope,
    'window_date', p_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_daily_sms(TEXT, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_daily_sms(TEXT, DATE, INT) TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. HARDENED RATE LIMIT RPC (SEARCH_PATH & KEY VALIDATION)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max_hits INT,
  p_window_seconds INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := date_trunc('second', NOW());
  v_expires_at TIMESTAMPTZ;
  v_current_hits INT;
  v_allowed BOOLEAN := FALSE;
  v_retry_after INT := 0;
  v_sanitized_hits INT;
  v_sanitized_window INT;
BEGIN
  -- Strict key length limit
  IF p_key IS NULL OR char_length(p_key) > 128 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'INVALID_LIMITER_KEY',
      'retry_after', 60
    );
  END IF;

  v_sanitized_hits := LEAST(GREATEST(COALESCE(p_max_hits, 5), 1), 1000);
  v_sanitized_window := LEAST(GREATEST(COALESCE(p_window_seconds, 60), 1), 86400);
  v_expires_at := NOW() + (v_sanitized_window || ' seconds')::INTERVAL;

  -- Clean up expired buckets for this key
  DELETE FROM public.rate_limit_events 
  WHERE limiter_key = p_key AND expires_at < NOW();

  -- Sum active hits
  SELECT COALESCE(SUM(hit_count), 0) INTO v_current_hits
  FROM public.rate_limit_events
  WHERE limiter_key = p_key AND expires_at >= NOW();

  IF v_current_hits < v_sanitized_hits THEN
    INSERT INTO public.rate_limit_events (limiter_key, window_start, hit_count, expires_at)
    VALUES (p_key, v_window_start, 1, v_expires_at);
    v_current_hits := v_current_hits + 1;
    v_allowed := TRUE;
  ELSE
    v_allowed := FALSE;
    SELECT COALESCE(EXTRACT(EPOCH FROM (MAX(expires_at) - NOW()))::INT, v_sanitized_window)
    INTO v_retry_after
    FROM public.rate_limit_events
    WHERE limiter_key = p_key AND expires_at >= NOW();
    IF v_retry_after < 1 THEN v_retry_after := 1; END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current_hits', v_current_hits,
    'max_hits', v_sanitized_hits,
    'retry_after', v_retry_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO anon, authenticated, service_role;

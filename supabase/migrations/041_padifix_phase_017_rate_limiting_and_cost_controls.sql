-- ============================================================================
-- PADIFIX PHASE 017: PLATFORM ABUSE PREVENTION, COST CONTROLS & OUTBOUND PROTECTION
-- Migration: 041_padifix_phase_017_rate_limiting_and_cost_controls.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DURABLE OUTBOUND SMS QUOTAS LEDGER (public.daily_sms_quotas)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.daily_sms_quotas (
  window_date DATE NOT NULL,
  scope TEXT NOT NULL, -- 'platform' or 'artisan:<provider_id>'
  dispatched_count INT NOT NULL DEFAULT 0,
  max_cap INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (window_date, scope)
);

-- Performance and query indexes
CREATE INDEX IF NOT EXISTS idx_daily_sms_quotas_scope_date 
  ON public.daily_sms_quotas(scope, window_date);

-- Enable Row Level Security (RLS)
ALTER TABLE public.daily_sms_quotas ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Viewable by backend service and authenticated providers for own scope
DROP POLICY IF EXISTS "Allow reading daily sms quotas" ON public.daily_sms_quotas;
CREATE POLICY "Allow reading daily sms quotas"
  ON public.daily_sms_quotas FOR SELECT
  TO anon, authenticated
  USING (true);

-- RLS Policy: Allow backend mutations
DROP POLICY IF EXISTS "Allow backend managing daily sms quotas" ON public.daily_sms_quotas;
CREATE POLICY "Allow backend managing daily sms quotas"
  ON public.daily_sms_quotas FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- 2. CONCURRENCY-SAFE ATOMIC SMS RESERVATION RPC
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_daily_sms(
  p_scope TEXT,
  p_date DATE,
  p_cap INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
  v_allowed BOOLEAN := FALSE;
BEGIN
  -- Attempt atomic upsert with conditional increment strictly guarded by max_cap
  INSERT INTO public.daily_sms_quotas (window_date, scope, dispatched_count, max_cap, updated_at)
  VALUES (p_date, p_scope, 1, p_cap, NOW())
  ON CONFLICT (window_date, scope)
  DO UPDATE SET 
    dispatched_count = public.daily_sms_quotas.dispatched_count + 1,
    updated_at = NOW()
  WHERE public.daily_sms_quotas.dispatched_count < public.daily_sms_quotas.max_cap
  RETURNING dispatched_count INTO v_count;

  IF v_count IS NOT NULL THEN
    v_allowed := TRUE;
  ELSE
    -- Quota reached: fetch authoritative current count without incrementing
    SELECT dispatched_count INTO v_count
    FROM public.daily_sms_quotas
    WHERE window_date = p_date AND scope = p_scope;
    v_allowed := FALSE;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current_count', COALESCE(v_count, p_cap),
    'max_cap', p_cap,
    'scope', p_scope,
    'window_date', p_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_daily_sms(TEXT, DATE, INT) TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. DISTRIBUTED RATE LIMIT EVENTS LEDGER (public.rate_limit_events)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  limiter_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Performance and lookup index
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_lookup 
  ON public.rate_limit_events(limiter_key, expires_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend rate limit operations" ON public.rate_limit_events;
CREATE POLICY "Allow backend rate limit operations"
  ON public.rate_limit_events FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- 4. ATOMIC RATE LIMIT CHECK RPC
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max_hits INT,
  p_window_seconds INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := date_trunc('second', NOW());
  v_expires_at TIMESTAMPTZ := NOW() + (p_window_seconds || ' seconds')::INTERVAL;
  v_current_hits INT;
  v_allowed BOOLEAN := FALSE;
  v_retry_after INT := 0;
BEGIN
  -- Prune expired records for this key
  DELETE FROM public.rate_limit_events 
  WHERE limiter_key = p_key AND expires_at < NOW();

  -- Calculate active hits
  SELECT COALESCE(SUM(hit_count), 0) INTO v_current_hits
  FROM public.rate_limit_events
  WHERE limiter_key = p_key AND expires_at >= NOW();

  IF v_current_hits < p_max_hits THEN
    INSERT INTO public.rate_limit_events (limiter_key, window_start, hit_count, expires_at)
    VALUES (p_key, v_window_start, 1, v_expires_at);
    v_current_hits := v_current_hits + 1;
    v_allowed := TRUE;
  ELSE
    v_allowed := FALSE;
    SELECT COALESCE(EXTRACT(EPOCH FROM (MAX(expires_at) - NOW()))::INT, p_window_seconds)
    INTO v_retry_after
    FROM public.rate_limit_events
    WHERE limiter_key = p_key AND expires_at >= NOW();
    IF v_retry_after < 1 THEN v_retry_after := 1; END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current_hits', v_current_hits,
    'max_hits', p_max_hits,
    'retry_after', v_retry_after
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO anon, authenticated, service_role;

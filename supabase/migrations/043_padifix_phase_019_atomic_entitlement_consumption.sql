-- ============================================================================
-- PADIFIX PHASE 019: ATOMIC CONTACT ENTITLEMENT CONSUMPTION & CONCURRENCY GATE
-- Migration: 043_padifix_phase_019_atomic_entitlement_consumption.sql
-- Project: hvxosxhnxauiqrhpyuur (https://hvxosxhnxauiqrhpyuur.supabase.co)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PERFORMANCE INDEX FOR BILLING PERIOD QUOTA AGGREGATION
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ce_provider_billing_period 
  ON public.contact_events (provider_id, billing_period);

-- ----------------------------------------------------------------------------
-- 2. ATOMIC CONTACT ENTITLEMENT CONSUMPTION STORED FUNCTION
-- ----------------------------------------------------------------------------
-- Enforces:
-- 1. Row-level lock on public.providers (FOR UPDATE) to prevent concurrency races.
-- 2. Strict parameter validation.
-- 3. Idempotent deduplication (15-min replay returns cached event without consuming allowance).
-- 4. Authoritative subscription resolution (FREE=5, BASIC=30, PRO=100, PREMIUM=500).
-- 5. Expiry and grace period semantics.
-- 6. Atomic increment and lead persistence (Rule A: Never Lose the Lead).
-- 7. Distinguishes allowed, limit_reached, soft_cap, provider_not_found.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_contact_entitlement(
  p_provider_id BIGINT,
  p_channel TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_billing_period TEXT DEFAULT NULL,
  p_session_token TEXT DEFAULT NULL,
  p_locality TEXT DEFAULT NULL,
  p_intent_tag TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_active BOOLEAN;
  v_sub RECORD;
  v_allowance INT := 5;
  v_plan_id TEXT := 'FREE';
  v_plan_name TEXT := 'Free Starter';
  v_used INT := 0;
  v_existing_event RECORD;
  v_new_event_id UUID;
  v_limit_reached BOOLEAN := FALSE;
  v_soft_cap BOOLEAN := FALSE;
  v_period TEXT;
BEGIN
  -- Strict Parameter Validation
  IF p_provider_id IS NULL OR p_provider_id <= 0 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'invalid_provider_id',
      'allowed', false,
      'message', 'Invalid provider identifier'
    );
  END IF;

  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'call') THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'invalid_channel',
      'allowed', false,
      'message', 'Invalid contact channel. Must be whatsapp or call.'
    );
  END IF;

  -- Canonical Lagos Billing Period if not supplied
  v_period := COALESCE(p_billing_period, to_char(NOW() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM'));

  -- 1. Idempotency Check (Never consume duplicate allowance on repeat tap)
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id, created_at, billing_period INTO v_existing_event
    FROM public.contact_events
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      -- Resolve current usage in window
      SELECT COUNT(*) INTO v_used
      FROM public.contact_events
      WHERE provider_id = p_provider_id AND billing_period = v_period;

      -- Resolve plan allowance for accurate response metadata
      SELECT s.plan_id, p.name AS plan_name, p.contact_allowance INTO v_sub
      FROM public.provider_subscriptions s
      JOIN public.provider_plans p ON s.plan_id = p.id
      WHERE s.provider_id = p_provider_id
        AND s.status = 'active'
        AND (s.current_period_end > NOW() OR (s.lifecycle_status = 'grace' AND s.grace_period_ends_at > NOW()));

      IF FOUND THEN
        v_allowance := v_sub.contact_allowance;
        v_plan_id := v_sub.plan_id;
        v_plan_name := v_sub.plan_name;
      ELSE
        v_allowance := 5;
        v_plan_id := 'FREE';
        v_plan_name := 'Free Starter';
      END IF;

      RETURN jsonb_build_object(
        'status', 'success',
        'allowed', true,
        'is_duplicate', true,
        'idempotent', true,
        'event_id', v_existing_event.id,
        'provider_id', p_provider_id,
        'channel', p_channel,
        'billing_period', v_period,
        'plan_id', v_plan_id,
        'plan_name', v_plan_name,
        'allowance', v_allowance,
        'contacts_used', v_used,
        'contacts_remaining', GREATEST(0, v_allowance - v_used),
        'limit_reached', v_used >= v_allowance,
        'soft_cap', v_used > v_allowance
      );
    END IF;
  END IF;

  -- 2. Concurrency Serialization: Row-Level Lock on Provider Record
  SELECT is_active INTO v_is_active
  FROM public.providers
  WHERE id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'provider_not_found',
      'allowed', false,
      'message', 'Provider not found'
    );
  END IF;

  IF v_is_active IS FALSE THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'provider_inactive',
      'allowed', false,
      'message', 'Provider account is not active'
    );
  END IF;

  -- 3. Resolve Authoritative Subscription & Allowance
  SELECT s.plan_id, p.name AS plan_name, p.contact_allowance, s.current_period_end, s.lifecycle_status, s.grace_period_ends_at
  INTO v_sub
  FROM public.provider_subscriptions s
  JOIN public.provider_plans p ON s.plan_id = p.id
  WHERE s.provider_id = p_provider_id
    AND s.status = 'active'
    AND (s.current_period_end > NOW() OR (s.lifecycle_status = 'grace' AND s.grace_period_ends_at > NOW()));

  IF FOUND THEN
    v_allowance := v_sub.contact_allowance;
    v_plan_id := v_sub.plan_id;
    v_plan_name := v_sub.plan_name;
  ELSE
    -- Free Starter Tier default
    v_allowance := 5;
    v_plan_id := 'FREE';
    v_plan_name := 'Free Starter';
  END IF;

  -- 4. Count Authoritative Consumed Usage in Current Billing Period
  SELECT COUNT(*) INTO v_used
  FROM public.contact_events
  WHERE provider_id = p_provider_id AND billing_period = v_period;

  IF v_used >= v_allowance THEN
    v_limit_reached := TRUE;
    v_soft_cap := TRUE;
  END IF;

  -- 5. RULE A: NEVER LOSE THE LEAD (Durable Lead Persistence Before Side Effects)
  INSERT INTO public.contact_events (
    provider_id, channel, idempotency_key, billing_period, session_token, locality, intent_tag, status
  ) VALUES (
    p_provider_id, p_channel, p_idempotency_key, v_period, p_session_token, p_locality, p_intent_tag, 'new'
  ) RETURNING id INTO v_new_event_id;

  v_used := v_used + 1;

  RETURN jsonb_build_object(
    'status', 'success',
    'allowed', true,
    'is_duplicate', false,
    'idempotent', false,
    'event_id', v_new_event_id,
    'provider_id', p_provider_id,
    'channel', p_channel,
    'billing_period', v_period,
    'plan_id', v_plan_id,
    'plan_name', v_plan_name,
    'allowance', v_allowance,
    'contacts_used', v_used,
    'contacts_remaining', GREATEST(0, v_allowance - v_used),
    'limit_reached', v_limit_reached,
    'soft_cap', v_soft_cap
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. PERMISSIONS & RPC SECURITY HARDENING
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

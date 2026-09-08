-- ============================================================================
-- PADIFIX PHASE 019.2R: ATOMIC ENTITLEMENT PRIVILEGED SERVER-ONLY BOUNDARY
-- Migration: 043_padifix_phase_019_atomic_entitlement_consumption.sql
-- Project: hvxosxhnxauiqrhpyuur (https://hvxosxhnxauiqrhpyuur.supabase.co)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SCHEMA HARDENING & SINGLE-ROW ACCOUNTING (Rule A: Never Lose the Lead)
-- ----------------------------------------------------------------------------
-- Adds is_quota_consumed flag so non-billable / quota-exhausted leads are
-- durably saved in contact_events for the artisan without poisoning quota counters.
ALTER TABLE public.contact_events 
  ADD COLUMN IF NOT EXISTS is_quota_consumed BOOLEAN NOT NULL DEFAULT TRUE;

-- Enforce database-level uniqueness on idempotency_key to prevent concurrent race inserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_contact_events_idempotency_key'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ce_idempotency_key_unique'
    ) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_idempotency_key_unique 
        ON public.contact_events (idempotency_key) 
        WHERE idempotency_key IS NOT NULL;
    END IF;
  END IF;
END $$;

-- Partial index for high-speed quota consumption accounting
CREATE INDEX IF NOT EXISTS idx_ce_provider_billing_quota
  ON public.contact_events (provider_id, billing_period)
  WHERE is_quota_consumed = TRUE;

CREATE INDEX IF NOT EXISTS idx_ce_provider_billing_period 
  ON public.contact_events (provider_id, billing_period);

-- ----------------------------------------------------------------------------
-- 2. PRIVILEGED SERVER-ONLY ENTITLEMENT STORED FUNCTION
-- ----------------------------------------------------------------------------
-- Security Architecture:
-- 1. Privilege Boundary: RESTRICTED TO service_role & postgres.
--    Direct execution by anon or authenticated is STRICTLY REVOKED.
-- 2. Concurrency Serialization: Row-level lock on public.providers (FOR UPDATE).
-- 3. Provider Publication & Eligibility Gate:
--    Requires is_active = TRUE, is_public = TRUE, profile_complete = TRUE.
-- 4. Cross-Provider Idempotency Conflict Defense:
--    Replay of a key previously used for Provider A against Provider B is strictly DENIED.
-- 5. Authoritative Subscription Resolution:
--    Reads from public.provider_plans & public.provider_subscriptions.
-- 6. Single-Row Accounting:
--    If p_event_id is passed, mutates that exact row (never duplicate inserts).
--    If p_event_id is NULL, inserts single authoritative row.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_contact_entitlement(
  p_provider_id BIGINT,
  p_channel TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_billing_period TEXT DEFAULT NULL,
  p_session_token TEXT DEFAULT NULL,
  p_locality TEXT DEFAULT NULL,
  p_intent_tag TEXT DEFAULT NULL,
  p_event_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := COALESCE(auth.role(), 'none');
  v_is_active BOOLEAN;
  v_is_public BOOLEAN;
  v_profile_complete BOOLEAN;
  v_sub RECORD;
  v_allowance INT := 5;
  v_plan_id TEXT := 'FREE';
  v_plan_name TEXT := 'Free Starter';
  v_used INT := 0;
  v_existing_event RECORD;
  v_new_event_id UUID;
  v_grace_active BOOLEAN := FALSE;
  v_period TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- --------------------------------------------------------------------------
  -- 1. PRIVILEGED SERVER-ONLY AUTHORIZATION GATE
  -- --------------------------------------------------------------------------
  IF v_role != 'service_role' AND current_user != 'postgres' THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'forbidden_role',
      'allowed', false,
      'message', 'consume_contact_entitlement is a privileged server-only primitive restricted to service_role'
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- 2. PARAMETER VALIDATION
  -- --------------------------------------------------------------------------
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

  -- --------------------------------------------------------------------------
  -- 3. CONCURRENCY SERIALIZATION & PROVIDER ELIGIBILITY GATE (ROW-LEVEL LOCK)
  -- --------------------------------------------------------------------------
  SELECT is_active, is_public, profile_complete
  INTO v_is_active, v_is_public, v_profile_complete
  FROM public.providers
  WHERE id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'provider_not_found',
      'allowed', false,
      'message', 'Provider record does not exist'
    );
  END IF;

  IF v_is_active IS FALSE THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'provider_inactive',
      'allowed', false,
      'message', 'Provider account is deactivated'
    );
  END IF;

  IF v_is_public IS FALSE THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'provider_not_public',
      'allowed', false,
      'message', 'Provider directory visibility is set to private'
    );
  END IF;

  IF v_profile_complete IS FALSE THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'profile_incomplete',
      'allowed', false,
      'message', 'Provider onboarding profile is incomplete'
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- 4. IDEMPOTENCY CHECK & CROSS-PROVIDER PROTECTION (UNDER LOCK)
  -- --------------------------------------------------------------------------
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id, provider_id, created_at, billing_period, is_quota_consumed 
    INTO v_existing_event
    FROM public.contact_events
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      -- Cross-provider idempotency collision attack defense:
      -- An idempotency key recorded for Provider A cannot be reused for Provider B
      IF v_existing_event.provider_id != p_provider_id THEN
        RETURN jsonb_build_object(
          'status', 'error',
          'error', 'cross_provider_idempotency_conflict',
          'allowed', false,
          'message', 'Idempotency key has already been used for another provider'
        );
      END IF;

      -- Resolve current usage
      SELECT COUNT(*) INTO v_used
      FROM public.contact_events
      WHERE provider_id = p_provider_id 
        AND billing_period = v_existing_event.billing_period
        AND is_quota_consumed = TRUE;

      RETURN jsonb_build_object(
        'status', 'success',
        'allowed', true,
        'is_duplicate', true,
        'idempotent', true,
        'event_id', v_existing_event.id,
        'provider_id', p_provider_id,
        'channel', p_channel,
        'billing_period', v_existing_event.billing_period,
        'plan_id', v_plan_id,
        'plan_name', v_plan_name,
        'allowance', v_allowance,
        'contacts_used', v_used,
        'contacts_remaining', GREATEST(0, v_allowance - v_used),
        'limit_reached', v_used >= v_allowance,
        'soft_cap', v_used >= v_allowance,
        'lead_saved', true
      );
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- 5. RESOLVE AUTHORITATIVE SUBSCRIPTION & ALLOWANCE
  -- --------------------------------------------------------------------------
  SELECT s.plan_id, p.name AS plan_name, p.contact_allowance, s.current_period_start, s.current_period_end, s.lifecycle_status, s.grace_period_ends_at
  INTO v_sub
  FROM public.provider_subscriptions s
  JOIN public.provider_plans p ON s.plan_id = p.id
  WHERE s.provider_id = p_provider_id
    AND s.status = 'active'
    AND (s.current_period_end > v_now OR (s.lifecycle_status = 'grace' AND s.grace_period_ends_at > v_now))
  ORDER BY s.current_period_end DESC
  LIMIT 1;

  IF FOUND THEN
    v_allowance := v_sub.contact_allowance;
    v_plan_id := v_sub.plan_id;
    v_plan_name := v_sub.plan_name;
    v_period := to_char(v_sub.current_period_start AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') || '_' ||
                to_char(v_sub.current_period_end AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD');
    IF v_sub.current_period_end <= v_now AND v_sub.grace_period_ends_at > v_now THEN
      v_grace_active := TRUE;
    END IF;
  ELSE
    -- Free Starter Tier default from authoritative provider_plans
    SELECT contact_allowance, name INTO v_allowance, v_plan_name
    FROM public.provider_plans
    WHERE id = 'FREE';

    IF NOT FOUND THEN
      v_allowance := 5;
      v_plan_name := 'Free Starter';
    END IF;
    v_plan_id := 'FREE';
    v_period := COALESCE(p_billing_period, to_char(v_now AT TIME ZONE 'Africa/Lagos', 'YYYY-MM'));
  END IF;

  -- --------------------------------------------------------------------------
  -- 6. COUNT AUTHORITATIVE CONSUMED BILLABLE USAGE
  -- --------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_used
  FROM public.contact_events
  WHERE provider_id = p_provider_id 
    AND billing_period = v_period
    AND is_quota_consumed = TRUE;

  -- --------------------------------------------------------------------------
  -- 7. RULE A: NEVER LOSE THE LEAD & SINGLE-ROW QUOTA DECISION
  -- --------------------------------------------------------------------------
  IF v_used >= v_allowance THEN
    -- Quota exhausted: Persist durable lead with is_quota_consumed = FALSE (or keep existing event non-billable)
    IF p_event_id IS NOT NULL THEN
      v_new_event_id := p_event_id;
    ELSE
      INSERT INTO public.contact_events (
        provider_id, channel, idempotency_key, billing_period, session_token, locality, intent_tag, status, is_quota_consumed, created_at
      ) VALUES (
        p_provider_id, p_channel, p_idempotency_key, v_period, p_session_token, p_locality, p_intent_tag, 'new', FALSE, v_now
      ) RETURNING id INTO v_new_event_id;
    END IF;

    RETURN jsonb_build_object(
      'status', 'limit_reached',
      'allowed', false,
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
      'contacts_remaining', 0,
      'limit_reached', true,
      'soft_cap', false,
      'lead_saved', true,
      'quota_exhausted', true,
      'grace_period_active', v_grace_active
    );
  END IF;

  -- Quota available: Persist single durable row with is_quota_consumed = TRUE (or promote existing row)
  IF p_event_id IS NOT NULL THEN
    UPDATE public.contact_events 
    SET is_quota_consumed = TRUE,
        billing_period = v_period
    WHERE id = p_event_id;
    v_new_event_id := p_event_id;
  ELSE
    INSERT INTO public.contact_events (
      provider_id, channel, idempotency_key, billing_period, session_token, locality, intent_tag, status, is_quota_consumed, created_at
    ) VALUES (
      p_provider_id, p_channel, p_idempotency_key, v_period, p_session_token, p_locality, p_intent_tag, 'new', TRUE, v_now
    ) RETURNING id INTO v_new_event_id;
  END IF;

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
    'limit_reached', v_used >= v_allowance,
    'soft_cap', false,
    'lead_saved', true,
    'grace_period_active', v_grace_active
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. PERMISSIONS & STRICT SERVER-ONLY PRIVILEGE BOUNDARY
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

-- ============================================================================
-- PADIFIX PHASE 031: CONSUMER INSTANT LEAD BROADCAST & WHATSAPP MATCHING
-- Migration: 050_padifix_phase_031_broadcast_leads.sql
-- ============================================================================

-- 1. CREATE BROADCAST LEADS TABLE
CREATE TABLE IF NOT EXISTS public.broadcast_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_slug TEXT NOT NULL,
  state TEXT NOT NULL,
  lga TEXT NOT NULL,
  area TEXT DEFAULT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('immediate', 'today', 'scheduled_week')),
  budget_range TEXT DEFAULT NULL,
  job_scope TEXT NOT NULL CHECK (char_length(job_scope) <= 600),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'claimed', 'expired', 'cancelled')),
  matched_provider_ids BIGINT[] DEFAULT '{}',
  claimed_by_provider_id BIGINT DEFAULT NULL REFERENCES public.providers(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ DEFAULT NULL,
  pro_early_access_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CREATE BROADCAST LEAD ASSIGNMENTS TABLE (Authoritative Multi-Tenant Authorization)
CREATE TABLE IF NOT EXISTS public.broadcast_lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_lead_id UUID NOT NULL REFERENCES public.broadcast_leads(id) ON DELETE CASCADE,
  provider_id BIGINT NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'claimed', 'expired', 'dismissed')),
  claimed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_broadcast_provider_assignment UNIQUE (broadcast_lead_id, provider_id)
);

-- 3. INDEXES FOR HIGH-THROUGHPUT SEARCH & RADAR MATCHING
CREATE INDEX IF NOT EXISTS idx_broadcast_leads_lookup 
  ON public.broadcast_leads(trade_slug, state, lga, status);

CREATE INDEX IF NOT EXISTS idx_broadcast_leads_pro_window 
  ON public.broadcast_leads(pro_early_access_until) 
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_broadcast_leads_created 
  ON public.broadcast_leads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bla_provider_available 
  ON public.broadcast_lead_assignments(provider_id, status, available_at);

CREATE INDEX IF NOT EXISTS idx_bla_lead_id 
  ON public.broadcast_lead_assignments(broadcast_lead_id);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.broadcast_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_lead_assignments ENABLE ROW LEVEL SECURITY;

-- 4.1 Public can submit broadcast lead requests (anonymous consumer booking)
DROP POLICY IF EXISTS "Allow anonymous broadcast creation" ON public.broadcast_leads;
CREATE POLICY "Allow anonymous broadcast creation" 
  ON public.broadcast_leads FOR INSERT 
  TO anon, authenticated
  WITH CHECK (
    trade_slug IS NOT NULL AND
    state IS NOT NULL AND
    lga IS NOT NULL AND
    urgency IN ('immediate', 'today', 'scheduled_week') AND
    char_length(job_scope) > 0 AND
    char_length(job_scope) <= 600
  );

-- 4.2 Authenticated providers can view open broadcast leads
DROP POLICY IF EXISTS "Providers view open broadcasts" ON public.broadcast_leads;
CREATE POLICY "Providers view open broadcasts" 
  ON public.broadcast_leads FOR SELECT 
  TO authenticated
  USING (
    status = 'open' OR 
    claimed_by_provider_id = (SELECT id FROM public.providers WHERE user_id = auth.uid() LIMIT 1)
  );

-- 4.3 Providers can view their own assignments
DROP POLICY IF EXISTS "Providers view their own assignments" ON public.broadcast_lead_assignments;
CREATE POLICY "Providers view their own assignments" 
  ON public.broadcast_lead_assignments FOR SELECT 
  TO authenticated
  USING (
    provider_id = (SELECT id FROM public.providers WHERE user_id = auth.uid() LIMIT 1)
  );

-- 5. ATOMIC CLAIM RPC FUNCTION
CREATE OR REPLACE FUNCTION public.claim_broadcast_lead(
  p_lead_id UUID,
  p_provider_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
  v_is_pro BOOLEAN := FALSE;
  v_current_period TEXT := to_char(NOW() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM');
  v_allowance INT := 5;
  v_used INT := 0;
BEGIN
  -- 1. Lock lead record atomically (concurrency defense)
  SELECT * INTO v_lead 
  FROM public.broadcast_leads 
  WHERE id = p_lead_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Broadcast lead not found', 'statusCode', 404);
  END IF;

  IF v_lead.status <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead is no longer available', 'statusCode', 409);
  END IF;

  IF NOW() > v_lead.expires_at THEN
    UPDATE public.broadcast_leads SET status = 'expired', updated_at = NOW() WHERE id = p_lead_id;
    UPDATE public.broadcast_lead_assignments SET status = 'expired' WHERE broadcast_lead_id = p_lead_id;
    RETURN jsonb_build_object('success', false, 'error', 'Broadcast lead has expired', 'statusCode', 410);
  END IF;

  -- 2. Check provider active subscription plan
  SELECT (sp.id IN ('PRO', 'PREMIUM')) INTO v_is_pro
  FROM public.provider_subscriptions ps
  JOIN public.provider_plans sp ON ps.plan_id = sp.id
  WHERE ps.provider_id = p_provider_id 
    AND ps.status = 'active'
  LIMIT 1;

  IF v_is_pro IS NULL THEN
    v_is_pro := FALSE;
  END IF;

  -- 3. Enforce 15-minute Pro early-access gate (server-authoritative)
  IF NOT v_is_pro AND NOW() < v_lead.pro_early_access_until THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Exclusive to Pro subscribers for the first 15 minutes', 
      'statusCode', 403,
      'early_access_until', v_lead.pro_early_access_until
    );
  END IF;

  -- 4. Verify and consume contact quota
  SELECT contacts_used INTO v_used
  FROM public.provider_contact_usage
  WHERE provider_id = p_provider_id AND billing_period = v_current_period;

  IF v_used IS NULL THEN
    v_used := 0;
  END IF;

  SELECT COALESCE(pp.contact_allowance, 5) INTO v_allowance
  FROM public.provider_subscriptions ps
  JOIN public.provider_plans pp ON ps.plan_id = pp.id
  WHERE ps.provider_id = p_provider_id AND ps.status = 'active'
  LIMIT 1;

  IF v_allowance IS NULL THEN
    v_allowance := 5;
  END IF;

  IF v_allowance > 0 AND v_used >= v_allowance THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Monthly contact quota reached. Upgrade to Pro for more contacts.', 
      'statusCode', 429
    );
  END IF;

  -- 5. Atomically increment quota
  INSERT INTO public.provider_contact_usage (provider_id, billing_period, contacts_used, period_start, period_end)
  VALUES (
    p_provider_id, 
    v_current_period, 
    1, 
    date_trunc('month', NOW() AT TIME ZONE 'Africa/Lagos'), 
    date_trunc('month', NOW() AT TIME ZONE 'Africa/Lagos') + INTERVAL '1 month'
  )
  ON CONFLICT (provider_id, billing_period) 
  DO UPDATE SET contacts_used = public.provider_contact_usage.contacts_used + 1, updated_at = NOW();

  -- 6. Assign lead and update assignments
  UPDATE public.broadcast_leads 
  SET 
    status = 'claimed',
    claimed_by_provider_id = p_provider_id,
    claimed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_lead_id;

  UPDATE public.broadcast_lead_assignments
  SET status = 'claimed', claimed_at = NOW()
  WHERE broadcast_lead_id = p_lead_id AND provider_id = p_provider_id;

  UPDATE public.broadcast_lead_assignments
  SET status = 'dismissed'
  WHERE broadcast_lead_id = p_lead_id AND provider_id <> p_provider_id;

  -- 7. Create operational lead in contact_events for provider CRM pipeline
  INSERT INTO public.contact_events (
    provider_id,
    channel,
    idempotency_key,
    billing_period,
    status,
    intent_tag,
    notes,
    client_display_name
  ) VALUES (
    p_provider_id,
    'broadcast',
    'bcast_' || p_lead_id || '_' || p_provider_id,
    v_current_period,
    'new',
    'Broadcast: ' || v_lead.trade_slug || ' (' || v_lead.urgency || ')',
    'Scope: ' || v_lead.job_scope || ' | Budget: ' || COALESCE(v_lead.budget_range, 'Open quote'),
    'Broadcast Customer (' || v_lead.lga || ')'
  );

  RETURN jsonb_build_object(
    'success', true, 
    'lead_id', p_lead_id, 
    'claimed_at', NOW()
  );
END;
$$;

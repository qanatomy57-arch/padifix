-- ============================================================================
-- PADIFIX PHASE 015: ARTISAN DASHBOARD & LEAD INTELLIGENCE
-- Migration: 038_padifix_phase_015_lead_intelligence.sql
-- ============================================================================

-- 1. ENSURE BASE CONTACT_EVENTS TABLE EXISTS
CREATE TABLE IF NOT EXISTS public.contact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id BIGINT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp', -- 'whatsapp' or 'call'
  idempotency_key TEXT UNIQUE,
  billing_period TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM'),
  session_token TEXT,
  customer_fingerprint_hash TEXT,
  locality TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  intent_tag TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. UPGRADE CONTACT_EVENTS TABLE WITH OPERATIONAL METADATA (Idempotent for pre-existing tables)
ALTER TABLE public.contact_events 
  ADD COLUMN IF NOT EXISTS locality TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS intent_tag TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. ENFORCE CANONICAL LEAD STATUS VOCABULARY AT DATABASE LEVEL
-- Allowed values: 'new', 'in_discussion', 'quote_sent', 'job_won'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_events_status'
  ) THEN
    ALTER TABLE public.contact_events
      ADD CONSTRAINT chk_contact_events_status
      CHECK (status IN ('new', 'in_discussion', 'quote_sent', 'job_won'));
  END IF;
END $$;

-- 3. ENFORCE PRIVATE NOTES MAXIMUM LENGTH (500 CHARACTERS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_events_notes_length'
  ) THEN
    ALTER TABLE public.contact_events
      ADD CONSTRAINT chk_contact_events_notes_length
      CHECK (notes IS NULL OR char_length(notes) <= 500);
  END IF;
END $$;

-- 4. PERFORMANCE & ORDERING INDEX
CREATE INDEX IF NOT EXISTS idx_ce_provider_created 
  ON public.contact_events(provider_id, created_at DESC);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES FOR MULTI-TENANT ISOLATION
-- Enable RLS (idempotent)
ALTER TABLE public.contact_events ENABLE ROW LEVEL SECURITY;

-- Policy A: Providers can SELECT only their own contact events
DROP POLICY IF EXISTS "Providers view own contact events" ON public.contact_events;
CREATE POLICY "Providers view own contact events"
  ON public.contact_events FOR SELECT
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

-- Policy B: Providers can UPDATE status and notes on only their own contact events
DROP POLICY IF EXISTS "Providers update own contact events" ON public.contact_events;
CREATE POLICY "Providers update own contact events"
  ON public.contact_events FOR UPDATE
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

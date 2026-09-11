-- ============================================================================
-- PADIFIX PHASE 029: VERIFIED CUSTOMER REVIEW & RATING COLLECTION ENGINE
-- Migration: 048_padifix_phase_029_review_engine.sql
-- ============================================================================

-- 1. ADD REVIEW INVITATION TOKEN & DISPATCH TRACKING TO contact_events
ALTER TABLE public.contact_events 
  ADD COLUMN IF NOT EXISTS review_token TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ DEFAULT NULL;

-- 2. ENFORCE UNIQUE CONSTRAINT ON REVIEW TOKEN IF PRESENT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_contact_events_review_token'
  ) THEN
    ALTER TABLE public.contact_events
      ADD CONSTRAINT uq_contact_events_review_token UNIQUE (review_token);
  END IF;
END $$;

-- 3. CREATE PERFORMANCE INDEXES FOR TOKEN LOOKUP & DISPATCH MONITORING
CREATE INDEX IF NOT EXISTS idx_contact_events_review_token 
  ON public.contact_events(review_token)
  WHERE review_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_events_review_requested 
  ON public.contact_events(provider_id, review_requested_at DESC)
  WHERE review_requested_at IS NOT NULL;

-- 4. MAINTAIN RESTRICTIVE COLUMN-LEVEL UPDATE PRIVILEGES
-- Ensure authenticated providers can record review tokens and dispatch timestamps
REVOKE UPDATE ON public.contact_events FROM anon, authenticated;
GRANT UPDATE (
  status, 
  notes, 
  updated_at, 
  quote_amount_kobo, 
  workmanship_amount_kobo, 
  materials_amount_kobo, 
  final_amount_kobo, 
  scheduled_for, 
  completed_at, 
  lost_reason, 
  client_display_name,
  review_token,
  review_requested_at
) ON public.contact_events TO authenticated;

-- Ensure service_role has all privileges
GRANT ALL PRIVILEGES ON public.contact_events TO service_role;

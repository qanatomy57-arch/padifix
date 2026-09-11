-- ============================================================================
-- PADIFIX PHASE 028: ARTISAN LEAD CONVERSION & JOB PIPELINE CRM WITH EARNINGS TRACKING
-- Migration: 047_padifix_phase_028_pipeline_crm_and_earnings.sql
-- ============================================================================

-- 1. ADD PIPELINE DEAL TRACKING & FINANCIAL METRIC COLUMNS TO contact_events
ALTER TABLE public.contact_events 
  ADD COLUMN IF NOT EXISTS quote_amount_kobo BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS workmanship_amount_kobo BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS materials_amount_kobo BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS final_amount_kobo BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_display_name TEXT DEFAULT NULL;

-- 2. UPGRADE CANONICAL LEAD STATUS VOCABULARY AT DATABASE LEVEL
-- Supported: 'new', 'in_discussion', 'quote_sent', 'scheduled', 'completed', 'job_won', 'lost'
DO $$
BEGIN
  -- Drop existing status check constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_events_status'
  ) THEN
    ALTER TABLE public.contact_events DROP CONSTRAINT chk_contact_events_status;
  END IF;

  -- Add updated constraint
  ALTER TABLE public.contact_events
    ADD CONSTRAINT chk_contact_events_status
    CHECK (status IN ('new', 'in_discussion', 'quote_sent', 'scheduled', 'completed', 'job_won', 'lost'));
END $$;

-- 3. ENFORCE NON-NEGATIVE FINANCIAL AMOUNTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_events_amounts_non_negative'
  ) THEN
    ALTER TABLE public.contact_events
      ADD CONSTRAINT chk_contact_events_amounts_non_negative
      CHECK (
        (quote_amount_kobo IS NULL OR quote_amount_kobo >= 0) AND
        (workmanship_amount_kobo IS NULL OR workmanship_amount_kobo >= 0) AND
        (materials_amount_kobo IS NULL OR materials_amount_kobo >= 0) AND
        (final_amount_kobo IS NULL OR final_amount_kobo >= 0)
      );
  END IF;
END $$;

-- 3.1 ENFORCE CONSISTENT FINANCIAL SPLIT RULE (workmanship + materials = quote when split provided)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_events_split_equality'
  ) THEN
    ALTER TABLE public.contact_events
      ADD CONSTRAINT chk_contact_events_split_equality
      CHECK (
        (workmanship_amount_kobo IS NULL AND materials_amount_kobo IS NULL) OR
        quote_amount_kobo IS NULL OR
        (COALESCE(workmanship_amount_kobo, 0) + COALESCE(materials_amount_kobo, 0) = quote_amount_kobo)
      );
  END IF;
END $$;

-- 4. ENFORCE LOST REASON LENGTH LIMIT (250 CHARACTERS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_events_lost_reason_length'
  ) THEN
    ALTER TABLE public.contact_events
      ADD CONSTRAINT chk_contact_events_lost_reason_length
      CHECK (lost_reason IS NULL OR char_length(lost_reason) <= 250);
  END IF;
END $$;

-- 5. PERFORMANCE & FILTERING INDEXES
CREATE INDEX IF NOT EXISTS idx_ce_provider_status 
  ON public.contact_events(provider_id, status);

CREATE INDEX IF NOT EXISTS idx_ce_scheduled_for 
  ON public.contact_events(provider_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ce_completed_at 
  ON public.contact_events(provider_id, completed_at)
  WHERE completed_at IS NOT NULL;

-- 6. RESTRICTIVE COLUMN-LEVEL UPDATE PRIVILEGES
-- Ensure authenticated providers can update workflow and deal tracking fields, but NOT core audit fields
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
  client_display_name
) ON public.contact_events TO authenticated;

-- Ensure service_role has all privileges
GRANT ALL PRIVILEGES ON public.contact_events TO service_role;

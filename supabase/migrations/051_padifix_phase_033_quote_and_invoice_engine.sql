-- ============================================================================
-- PADIFIX PHASE 033: IN-APP DIGITAL QUOTE & INVOICE GENERATOR ENGINE
-- Migration: 051_padifix_phase_033_quote_and_invoice_engine.sql
-- ============================================================================

-- 1. ADD INVOICE REFERENCE & STRUCTURED JSONB STORAGE TO contact_events
ALTER TABLE public.contact_events
  ADD COLUMN IF NOT EXISTS invoice_ref TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invoice_data JSONB DEFAULT NULL;

-- 2. ENFORCE INVOICE REFERENCE FORMAT (INV-PF-XXXXXX OR NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_events_invoice_ref_format'
  ) THEN
    ALTER TABLE public.contact_events
      ADD CONSTRAINT chk_contact_events_invoice_ref_format
      CHECK (
        invoice_ref IS NULL OR 
        invoice_ref ~ '^INV-PF-[A-Z0-9]{6,12}$'
      );
  END IF;
END $$;

-- 3. ENFORCE INVOICE DATA JSONB VALIDITY & ROOT OBJECT TYPE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_events_invoice_data_type'
  ) THEN
    ALTER TABLE public.contact_events
      ADD CONSTRAINT chk_contact_events_invoice_data_type
      CHECK (
        invoice_data IS NULL OR 
        jsonb_typeof(invoice_data) = 'object'
      );
  END IF;
END $$;

-- 4. PERFORMANCE & SEARCH INDEXES (Strictly Unique Collision-Resistant on Reference)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_invoice_ref_unique
  ON public.contact_events(invoice_ref)
  WHERE invoice_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ce_provider_invoice_ref
  ON public.contact_events(provider_id, invoice_ref)
  WHERE invoice_ref IS NOT NULL;

-- 5. SERVER-AUTHORITATIVE SECURITY POLICY:
-- In accordance with Phase 033 invariants, direct column-level UPDATE on invoice_ref and invoice_data
-- is explicitly REVOKED from anonymous and authenticated client roles.
-- Persistence and financial mutation MUST strictly execute through the trusted serverless API gateway (api/provider-leads.js).
REVOKE UPDATE (invoice_ref, invoice_data) ON public.contact_events FROM anon, authenticated;

COMMENT ON COLUMN public.contact_events.invoice_ref IS 'Server-authoritative, unique invoice or quote reference (INV-PF-XXXXXX)';
COMMENT ON COLUMN public.contact_events.invoice_data IS 'Server-validated structured JSONB containing dual-category items, discount, verified payout details, and terms';

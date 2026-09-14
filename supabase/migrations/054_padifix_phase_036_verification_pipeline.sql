-- ============================================================================
-- PADIFIX PHASE 036: IN-APP VERIFICATION SUBMISSION & ADMIN COMPLIANCE APPROVAL PIPELINE
-- Migration: 054_padifix_phase_036_verification_pipeline.sql
-- ============================================================================

-- 1. RECONCILE CANONICAL REJECTION REASONS ENUM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_rejection_reason_enum') THEN
    CREATE TYPE public.verification_rejection_reason_enum AS ENUM (
      'blurry_image',
      'expired_document',
      'name_mismatch',
      'incomplete_document',
      'fraud_suspected',
      'other'
    );
  END IF;
END $$;

-- 2. CREATE VERIFICATION SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.verification_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id BIGINT NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('nin_slip', 'drivers_license', 'voters_card', 'international_passport', 'other_gov_id')),
  document_number_masked TEXT NOT NULL,
  document_number_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT DEFAULT 'image/webp',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR rejection_reason IN ('blurry_image', 'expired_document', 'name_mismatch', 'incomplete_document', 'fraud_suspected', 'other')),
  rejection_notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invariant 11A: Exactly one active pending submission per provider at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_submission_per_provider
  ON public.verification_submissions(provider_id)
  WHERE status = 'pending';

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_verification_submissions_provider ON public.verification_submissions(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_verification_submissions_status ON public.verification_submissions(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_submissions_doc_hash ON public.verification_submissions(document_number_hash);

-- Invariant 11B: Trigger preventing submission if provider is already permanently verified
CREATE OR REPLACE FUNCTION public.check_provider_already_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_already_verified BOOLEAN;
BEGIN
  SELECT is_verified INTO v_already_verified
  FROM public.providers
  WHERE id = NEW.provider_id;

  IF v_already_verified IS TRUE THEN
    RAISE EXCEPTION 'Provider #% has already been successfully verified. One-time verification invariant forbids re-verification.', NEW.provider_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_submission_if_already_verified ON public.verification_submissions;
CREATE TRIGGER trg_block_submission_if_already_verified
  BEFORE INSERT ON public.verification_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_provider_already_verified();

-- 3. ROW LEVEL SECURITY (RLS) FOR VERIFICATION SUBMISSIONS
ALTER TABLE public.verification_submissions ENABLE ROW LEVEL SECURITY;

-- Providers can read ONLY their own submission records
DROP POLICY IF EXISTS "Providers view their own submissions" ON public.verification_submissions;
CREATE POLICY "Providers view their own submissions"
  ON public.verification_submissions
  FOR SELECT
  USING (auth.uid()::text = provider_id::text OR auth.role() = 'service_role');

-- Providers can insert ONLY for their own provider ID and only if not verified
DROP POLICY IF EXISTS "Providers create their own submissions" ON public.verification_submissions;
CREATE POLICY "Providers create their own submissions"
  ON public.verification_submissions
  FOR INSERT
  WITH CHECK (auth.uid()::text = provider_id::text OR auth.role() = 'service_role');

-- Updates/deletions strictly denied to clients; service role only
DROP POLICY IF EXISTS "Service role manages submissions" ON public.verification_submissions;
CREATE POLICY "Service role manages submissions"
  ON public.verification_submissions
  FOR ALL
  USING (auth.role() = 'service_role');

-- 4. ENSURE PROVIDER PROFILE COLUMNS FOR VERIFICATION STATUS TRACKING
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'verification_status') THEN
    ALTER TABLE public.providers ADD COLUMN verification_status TEXT DEFAULT 'never_verified';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'verification_submitted_at') THEN
    ALTER TABLE public.providers ADD COLUMN verification_submitted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'verification_rejection_reason') THEN
    ALTER TABLE public.providers ADD COLUMN verification_rejection_reason TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'verification_rejection_notes') THEN
    ALTER TABLE public.providers ADD COLUMN verification_rejection_notes TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'nin_verified') THEN
    ALTER TABLE public.providers ADD COLUMN nin_verified BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 5. ATOMIC APPROVAL AND REJECTION HELPER FUNCTIONS (Transactional & Idempotent)
CREATE OR REPLACE FUNCTION public.approve_provider_verification(
  target_submission_id UUID,
  admin_identity TEXT DEFAULT 'compliance_officer',
  p_nin_verified BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub FROM public.verification_submissions WHERE id = target_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Submission not found');
  END IF;

  -- Idempotency check: Already approved
  IF v_sub.status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'idempotent', TRUE,
      'provider_id', v_sub.provider_id,
      'status', 'approved'
    );
  END IF;

  -- Conflicting transition check
  IF v_sub.status = 'rejected' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Conflicting transition: Cannot approve already rejected submission.');
  END IF;

  -- Update submission status
  UPDATE public.verification_submissions
  SET status = 'approved',
      reviewed_at = NOW(),
      reviewed_by = admin_identity,
      updated_at = NOW()
  WHERE id = target_submission_id;

  -- Permanently anchor successful verification to provider
  UPDATE public.providers
  SET is_verified = TRUE,
      verification_status = 'verified',
      nin_verified = COALESCE(p_nin_verified, FALSE),
      verification_rejection_reason = NULL,
      verification_rejection_notes = NULL,
      updated_at = NOW()
  WHERE id = v_sub.provider_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'provider_id', v_sub.provider_id,
    'document_type', v_sub.document_type,
    'status', 'approved',
    'nin_verified', COALESCE(p_nin_verified, FALSE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_provider_verification(
  target_submission_id UUID,
  reason_code TEXT,
  notes TEXT,
  admin_identity TEXT DEFAULT 'compliance_officer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub FROM public.verification_submissions WHERE id = target_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Submission not found');
  END IF;

  -- Idempotency check: Already rejected
  IF v_sub.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'idempotent', TRUE,
      'provider_id', v_sub.provider_id,
      'status', 'rejected'
    );
  END IF;

  -- Conflicting transition check
  IF v_sub.status = 'approved' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Conflicting transition: Cannot reject already approved verification.');
  END IF;

  -- Update submission status
  UPDATE public.verification_submissions
  SET status = 'rejected',
      rejection_reason = reason_code,
      rejection_notes = notes,
      reviewed_at = NOW(),
      reviewed_by = admin_identity,
      updated_at = NOW()
  WHERE id = target_submission_id;

  -- Set provider status to rejected to unlock correction/re-submission
  UPDATE public.providers
  SET verification_status = 'rejected',
      verification_rejection_reason = reason_code,
      verification_rejection_notes = notes,
      updated_at = NOW()
  WHERE id = v_sub.provider_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'provider_id', v_sub.provider_id,
    'status', 'rejected',
    'reason', reason_code
  );
END;
$$;

-- 6. PRIVATE SUPABASE STORAGE BUCKET & RLS POLICIES FOR DOCUMENT ATTESTATIONS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'provider-verifications',
  'provider-verifications',
  false, -- STRICT PRIVACY: Public cannot access (public = false)
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Storage RLS: Providers can upload ONLY into their own folder (verif_provider_upload_own_doc)
DROP POLICY IF EXISTS "verif_provider_upload_own_doc" ON storage.objects;
CREATE POLICY "verif_provider_upload_own_doc"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'provider-verifications'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR auth.role() = 'service_role'
    )
  );

-- Storage RLS: Admin/service-role can view all documents (verif_admin_view_all_docs)
DROP POLICY IF EXISTS "verif_admin_view_all_docs" ON storage.objects;
CREATE POLICY "verif_admin_view_all_docs"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'provider-verifications'
    AND auth.role() = 'service_role'
  );


-- ============================================================================
-- PADIFIX PHASE 034: ARTISAN PORTFOLIO & BEFORE/AFTER JOB PROOF SHOWCASE
-- Migration: 052_padifix_phase_034_portfolio_showcase.sql
-- ============================================================================

-- 1. CREATE TABLE public.provider_portfolio_items
CREATE TABLE IF NOT EXISTS public.provider_portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id BIGINT NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  project_type TEXT NOT NULL DEFAULT 'single' CHECK (project_type IN ('single', 'before_after')),
  before_image_url TEXT DEFAULT NULL,
  after_image_url TEXT NOT NULL,
  verified_job BOOLEAN NOT NULL DEFAULT false,
  lead_id UUID DEFAULT NULL REFERENCES public.contact_events(id) ON DELETE SET NULL,
  service_tag TEXT DEFAULT 'Completed Project',
  accent_color TEXT DEFAULT '#006B3F',
  display_order INT DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ENFORCE INTEGRITY CONSTRAINTS
-- Ensure before_after projects strictly include a before_image_url
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_portfolio_before_after_pair'
  ) THEN
    ALTER TABLE public.provider_portfolio_items
      ADD CONSTRAINT chk_portfolio_before_after_pair
      CHECK (
        project_type != 'before_after' OR 
        (before_image_url IS NOT NULL AND length(trim(before_image_url)) > 0)
      );
  END IF;
END $$;

-- Enforce title and image URL non-empty
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_portfolio_required_fields'
  ) THEN
    ALTER TABLE public.provider_portfolio_items
      ADD CONSTRAINT chk_portfolio_required_fields
      CHECK (
        length(trim(title)) >= 3 AND 
        length(trim(after_image_url)) > 0
      );
  END IF;
END $$;

-- 3. PERFORMANCE & LOOKUP INDEXES
CREATE INDEX IF NOT EXISTS idx_portfolio_provider_public 
  ON public.provider_portfolio_items(provider_id, is_public, display_order ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portfolio_lead_id 
  ON public.provider_portfolio_items(lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portfolio_verified_job 
  ON public.provider_portfolio_items(provider_id, verified_job)
  WHERE verified_job = true;

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.provider_portfolio_items ENABLE ROW LEVEL SECURITY;

-- Public can view active portfolio items of publicly listed providers
DROP POLICY IF EXISTS "Public can view public portfolio items" ON public.provider_portfolio_items;
CREATE POLICY "Public can view public portfolio items"
  ON public.provider_portfolio_items
  FOR SELECT
  USING (
    is_public = true AND
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_portfolio_items.provider_id
        AND p.is_active = true
        AND p.is_public = true
    )
  );

-- Authenticated providers can view all their own portfolio items (including drafts/hidden)
DROP POLICY IF EXISTS "Providers can view own portfolio items" ON public.provider_portfolio_items;
CREATE POLICY "Providers can view own portfolio items"
  ON public.provider_portfolio_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_portfolio_items.provider_id
        AND p.user_id = auth.uid()
    )
  );

-- Direct client updates to verified_job are strictly forbidden:
-- Provenance must be evaluated server-authoritatively via api/providers.js
REVOKE UPDATE (verified_job, lead_id) ON public.provider_portfolio_items FROM anon, authenticated;

-- Service role has full unrestricted access
GRANT ALL PRIVILEGES ON public.provider_portfolio_items TO service_role;

COMMENT ON TABLE public.provider_portfolio_items IS 'Phase 034: Workmanship proof showcase items and Before/After transformation comparisons for verified artisans';
COMMENT ON COLUMN public.provider_portfolio_items.verified_job IS 'Server-authoritative provenance flag derived strictly from completed contact_events records';

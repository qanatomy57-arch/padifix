-- ============================================================================
-- PADIFIX PHASE 030: PROGRAMMATIC SEO & GEO-TARGETED DIRECTORY PERFORMANCE
-- Migration: 049_padifix_phase_030_seo_indexes.sql
-- ============================================================================

-- 1. COMPOSITE LOCATION INDEX FOR GEO-TARGETED LANDING PAGES
-- Speeds up queries filtering by state, LGA, and active public directory status
CREATE INDEX IF NOT EXISTS idx_providers_state_lga 
  ON public.providers(state, lga)
  WHERE is_public = TRUE AND is_active = TRUE;

-- 2. COMPOSITE CATEGORY & STATE INDEX FOR TRADE-LEVEL LANDING PAGES
CREATE INDEX IF NOT EXISTS idx_providers_category_state 
  ON public.providers(primary_category_slug, state)
  WHERE is_public = TRUE AND is_active = TRUE;

-- 3. CASE-INSENSITIVE TRADE TITLE SEARCH ACCELERATION
CREATE INDEX IF NOT EXISTS idx_providers_trade_title_lower 
  ON public.providers(lower(trade_title))
  WHERE is_public = TRUE AND is_active = TRUE;

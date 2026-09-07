-- ============================================================================
-- PADIFIX MIGRATION 040: REMEDIATE RLS USER METADATA VULNERABILITY
-- Migration: 040_fix_contact_events_rls_security_advisor.sql
-- Target: public.contact_events
-- Resolves Supabase Security Advisor Critical Finding:
-- "RLS references user metadata on public.contact_events"
-- ============================================================================

-- Explanation:
-- Supabase Auth user_metadata is mutable by end-users and should NEVER be
-- referenced in security/RLS policies. Tenant isolation must be anchored
-- strictly on the authoritative relation:
-- provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())

-- ----------------------------------------------------------------------------
-- 1. REMEDIATE POLICY A (SELECT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Providers view own contact events" ON public.contact_events;

CREATE POLICY "Providers view own contact events"
  ON public.contact_events FOR SELECT
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

-- ----------------------------------------------------------------------------
-- 2. REMEDIATE POLICY B (UPDATE)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3. CONFIRM APPEND-ONLY INSERTION PRIVILEGES PRESERVED
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow append-only contact event insert" ON public.contact_events;

CREATE POLICY "Allow append-only contact event insert"
  ON public.contact_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    channel IN ('whatsapp', 'call')
    AND status = 'new'
  );

-- Ensure correct table and column grants
GRANT SELECT, INSERT ON public.contact_events TO anon, authenticated;
GRANT ALL PRIVILEGES ON public.contact_events TO service_role;
REVOKE UPDATE ON public.contact_events FROM anon;
GRANT UPDATE (status, notes, updated_at) ON public.contact_events TO authenticated;

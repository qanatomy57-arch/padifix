-- ============================================================================
-- PADIFIX MIGRATION 046: SUPABASE REALTIME AUTHORIZATION & MULTI-TENANT ISOLATION
-- Migration: 046_padifix_phase_027_realtime_authorization.sql
-- Target: realtime.messages (Supabase Realtime 2.0 Authorization Engine)
-- Reference: https://supabase.com/docs/guides/realtime/authorization
--
-- Notes:
-- - realtime schema and realtime.messages RLS are managed and pre-enabled by Supabase.
-- - Do NOT run ALTER TABLE or GRANT on realtime schema (protected by Supabase).
-- - Managing RLS policies on "realtime"."messages" is the official authorization model.
-- ============================================================================

-- 1. Policy: Authenticated artisans may ONLY read (listen to) their own channel
-- Topic format: "artisan-leads:<provider_id>"
DROP POLICY IF EXISTS "Artisans read own leads channel" ON "realtime"."messages";

CREATE POLICY "Artisans read own leads channel"
ON "realtime"."messages"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.providers
    WHERE user_id = (SELECT auth.uid())
      AND ('artisan-leads:' || id::text) = (SELECT realtime.topic())
  )
  OR (SELECT auth.role()) = 'service_role'
);

-- 2. Policy: Strict denial of client-side broadcast writes
-- Broadcasts MUST be server-authored via /api/contact-meter using service_role key
DROP POLICY IF EXISTS "Deny client broadcast writes to leads channel" ON "realtime"."messages";

CREATE POLICY "Deny client broadcast writes to leads channel"
ON "realtime"."messages"
FOR INSERT
TO authenticated
WITH CHECK (false);

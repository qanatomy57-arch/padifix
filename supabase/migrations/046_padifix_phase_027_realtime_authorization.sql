-- ============================================================================
-- PADIFIX MIGRATION 046: SUPABASE REALTIME AUTHORIZATION & MULTI-TENANT ISOLATION
-- Migration: 046_padifix_phase_027_realtime_authorization.sql
-- Target: realtime.messages (Supabase Realtime 2.0 Authorization Engine)
--
-- Implements:
-- 1. Multi-Tenant Private Channel Authorization for artisan-leads:<provider_id>
-- 2. Strictly restricts authenticated artisans to SELECT (read) only their own topic
-- 3. Strictly denies authenticated INSERT (write) from clients to prevent forged leads
-- 4. Authoritative broadcasts originate exclusively from service_role (/api/contact-meter)
-- ============================================================================

-- 1. Ensure authenticated role has USAGE on realtime schema
GRANT USAGE ON SCHEMA realtime TO authenticated, service_role;

-- 2. Enable Row Level Security on realtime.messages
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Authenticated artisans may ONLY read (listen to) their own channel
-- Topic format: "artisan-leads:<provider_id>"
DROP POLICY IF EXISTS "Artisans read own leads channel" ON realtime.messages;

CREATE POLICY "Artisans read own leads channel"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = ('artisan-leads:' || (
      SELECT id::text FROM public.providers WHERE user_id = auth.uid() LIMIT 1
    ))
    OR auth.role() = 'service_role'
  );

-- 4. Policy: Strict denial of client-side broadcast writes
-- Broadcasts MUST be server-authored via /api/contact-meter using service_role key
DROP POLICY IF EXISTS "Deny client broadcast writes to leads channel" ON realtime.messages;

CREATE POLICY "Deny client broadcast writes to leads channel"
  ON realtime.messages FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- 5. Service role retains full broadcast publishing rights
GRANT ALL PRIVILEGES ON realtime.messages TO service_role;

-- ==============================================================================
-- PADIFIX PHASE 022R: PRIVILEGED RPC BOUNDARY CLOSURE & DATABASE SECURITY
-- Migration: 044_padifix_phase_022r_privileged_rpc_closure.sql
-- 
-- Objectives:
-- 1. Revoke and Drop legacy 6-argument overload public.consume_contact_entitlement(bigint, text, text, text, text, text)
--    - Resolves PostgREST PGRST203 function overload conflict
--    - Closes unintended public execute exposure on legacy SECURITY DEFINER overload
-- 2. Re-enforce strict service-only privileges on canonical 8-argument function
--    - anon: DENIED
--    - authenticated: DENIED
--    - PUBLIC: DENIED
--    - service_role: ALLOWED
-- 3. Close public / anonymous execution boundary on public.is_admin()
--    - anon: DENIED
--    - authenticated: DENIED
--    - PUBLIC: DENIED
--    - service_role: ALLOWED
-- 4. Audit & formalize server-only RLS boundary on public.billing_transactions
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. LEGACY 6-ARGUMENT OVERLOAD CLOSURE
-- ------------------------------------------------------------------------------
-- Revoke all permissions from PUBLIC, anon, and authenticated roles
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;

-- Drop obsolete legacy function to eliminate PGRST203 overload ambiguity in PostgREST
DROP FUNCTION IF EXISTS public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- ------------------------------------------------------------------------------
-- 2. CANONICAL 8-ARGUMENT FUNCTION PRIVILEGE RE-ENFORCEMENT
-- ------------------------------------------------------------------------------
-- Ensure only service_role (and postgres superuser) can execute the canonical primitive
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- 3. is_admin() SECURITY DEFINER RPC CLOSURE
-- ------------------------------------------------------------------------------
-- Revoke public execution of is_admin() so anonymous and untrusted authenticated
-- clients cannot query administrative role heuristics via direct PostgREST RPC
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- ------------------------------------------------------------------------------
-- 4. billing_transactions SERVER-ONLY RE-VERIFICATION
-- ------------------------------------------------------------------------------
-- Confirm RLS is enabled. No client policies are granted because billing_transactions
-- is exclusively a server-side ledger table managed by the serverless billing handler.
ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_transactions FROM PUBLIC;
REVOKE ALL ON public.billing_transactions FROM anon;
REVOKE ALL ON public.billing_transactions FROM authenticated;
GRANT ALL ON public.billing_transactions TO service_role;

-- Notify PostgREST schema cache to reload immediately
NOTIFY pgrst, 'reload schema';

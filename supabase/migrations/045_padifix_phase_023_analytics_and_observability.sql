-- ==============================================================================
-- PADIFIX PHASE 023: PRODUCTION OBSERVABILITY & TELEMETRY
-- Migration: 045_padifix_phase_023_analytics_and_observability.sql
-- 
-- Objectives:
-- 1. Create public.analytics_events table with strict constraints:
--    - device_class IN ('desktop', 'tablet', 'mobile')
--    - event_name ~ '^[a-z0-9_]{3,64}$'
-- 2. Enforce strict Row Level Security (RLS) with zero public/client exposure
-- 3. Restrict all read/write operations exclusively to service_role (serverless handlers)
-- 4. Create automated rolling 30-day purge function and scheduled execution registration
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE DEFINITION & CONSTRAINTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    event_name TEXT NOT NULL,
    page_path TEXT NOT NULL DEFAULT 'home',
    device_class TEXT NOT NULL DEFAULT 'desktop',
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_device_class CHECK (device_class IN ('desktop', 'tablet', 'mobile')),
    CONSTRAINT chk_event_name CHECK (event_name ~ '^[a-z0-9_]{3,64}$')
);

-- Indexes for performance and rollup queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at 
    ON public.analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name 
    ON public.analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id 
    ON public.analytics_events (session_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_page_path 
    ON public.analytics_events (page_path);

-- ------------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (ZERO-TRUST CLIENT BOUNDARY)
-- ------------------------------------------------------------------------------
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.analytics_events FROM PUBLIC;
REVOKE ALL ON public.analytics_events FROM anon;
REVOKE ALL ON public.analytics_events FROM authenticated;

GRANT ALL ON public.analytics_events TO service_role;

-- ------------------------------------------------------------------------------
-- 3. AUTOMATED 30-DAY RETENTION PURGE FUNCTION (NDPA / GAID 2025 COMPLIANCE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_analytics_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM public.analytics_events
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_analytics_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_analytics_events() FROM anon;
REVOKE ALL ON FUNCTION public.purge_expired_analytics_events() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_analytics_events() TO service_role;

-- ------------------------------------------------------------------------------
-- 4. RELIABLE RETENTION SCHEDULER REGISTRATION
-- ------------------------------------------------------------------------------
-- Schedule daily execution at 03:00 UTC via pg_cron if enabled
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('purge-analytics-events-daily');
        PERFORM cron.schedule('purge-analytics-events-daily', '0 3 * * *', 'SELECT public.purge_expired_analytics_events()');
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- In environments where pg_cron is not accessible to current role, fallback to serverless maintenance cron
    RAISE NOTICE 'pg_cron scheduling deferred to serverless cron trigger';
END $$;

-- Track active retention policy configuration in metadata ledger
CREATE TABLE IF NOT EXISTS public.retention_policies (
    policy_name TEXT PRIMARY KEY,
    target_table TEXT NOT NULL,
    retention_days INTEGER NOT NULL,
    purge_function TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_executed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_policies FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.retention_policies TO service_role;

INSERT INTO public.retention_policies (policy_name, target_table, retention_days, purge_function, is_active)
VALUES ('analytics_events_30d', 'public.analytics_events', 30, 'public.purge_expired_analytics_events()', TRUE)
ON CONFLICT (policy_name) DO UPDATE 
SET retention_days = 30, is_active = TRUE, updated_at = NOW();

-- Notify PostgREST schema cache to reload immediately
NOTIFY pgrst, 'reload schema';

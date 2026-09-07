-- ============================================================================
-- PADIFIX PHASE 016: FINAL PERSISTENCE CONSOLIDATION & ARTISAN ALERTING
-- Migration: 039_padifix_phase_016_persistence_consolidation_and_alerts.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND public.reviews WITH INTERACTION TOKEN & REPUTATION DETAILS
-- ----------------------------------------------------------------------------

-- Add operational and deduplication columns safely
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS interaction_token TEXT,
  ADD COLUMN IF NOT EXISTS category_ratings JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS praise_tags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_response JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hired_status TEXT DEFAULT 'completed';

-- Ensure new consumer reviews default to approved (visible)
ALTER TABLE public.reviews 
  ALTER COLUMN is_approved SET DEFAULT TRUE;

-- Enforce duplicate submission prevention at database level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_reviews_interaction_token'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT uq_reviews_interaction_token UNIQUE (interaction_token);
  END IF;
END $$;

-- Performance & Ordering Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_provider_created 
  ON public.reviews(provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_interaction_token 
  ON public.reviews(interaction_token);

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Policy 1.1: Public Read for approved reviews
DROP POLICY IF EXISTS "Published reviews are viewable by all" ON public.reviews;
CREATE POLICY "Published reviews are viewable by all"
  ON public.reviews FOR SELECT
  USING (is_approved = true OR auth.role() = 'service_role');

-- Policy 1.2: Append-only insert of fresh reviews
DROP POLICY IF EXISTS "Allow append-only review submissions" ON public.reviews;
CREATE POLICY "Allow append-only review submissions"
  ON public.reviews FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    rating >= 1.0 AND rating <= 5.0
    AND comment IS NOT NULL
    AND char_length(comment) > 0
  );

-- Policy 1.3: Providers can update response on reviews for their own profile
DROP POLICY IF EXISTS "Providers can respond to reviews on own profile" ON public.reviews;
CREATE POLICY "Providers can respond to reviews on own profile"
  ON public.reviews FOR UPDATE
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

-- Column-level privilege: Authenticated providers can ONLY update provider_response & updated_at
REVOKE UPDATE ON public.reviews FROM authenticated;
GRANT UPDATE (provider_response, updated_at) ON public.reviews TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. HARDEN public.provider_subscriptions RLS & COLUMN RESTRICTIONS
-- ----------------------------------------------------------------------------

ALTER TABLE public.provider_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy 2.1: Providers can view their own subscription
DROP POLICY IF EXISTS "Providers view own subscription" ON public.provider_subscriptions;
CREATE POLICY "Providers view own subscription"
  ON public.provider_subscriptions FOR SELECT
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

-- Policy 2.2: Providers can update their auto-renewal status
DROP POLICY IF EXISTS "Providers can update own auto-renewal" ON public.provider_subscriptions;
CREATE POLICY "Providers can update own auto-renewal"
  ON public.provider_subscriptions FOR UPDATE
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

-- Column-level privilege: Authenticated providers can ONLY update auto-renewal fields
REVOKE UPDATE ON public.provider_subscriptions FROM authenticated;
GRANT UPDATE (cancel_at_period_end, lifecycle_status, cancelled_at, updated_at) 
  ON public.provider_subscriptions TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. PROVISION TRANSACTIONAL NOTIFICATIONS LEDGER (public.artisan_notifications)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.artisan_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_event_id UUID REFERENCES public.contact_events(id) ON DELETE CASCADE,
  provider_id BIGINT NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'simulated', 'failed'
  termii_message_id TEXT,
  message_body TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_notification_contact_event UNIQUE (contact_event_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_artisan_notif_provider 
  ON public.artisan_notifications(provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artisan_notif_status 
  ON public.artisan_notifications(status);

-- Enable RLS
ALTER TABLE public.artisan_notifications ENABLE ROW LEVEL SECURITY;

-- Policy 3.1: Providers can view notifications sent to their own business
DROP POLICY IF EXISTS "Providers view own notifications" ON public.artisan_notifications;
CREATE POLICY "Providers view own notifications"
  ON public.artisan_notifications FOR SELECT
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

-- Policy 3.2: Allow backend service & contact meter to log notifications
DROP POLICY IF EXISTS "Allow logging artisan notifications" ON public.artisan_notifications;
CREATE POLICY "Allow logging artisan notifications"
  ON public.artisan_notifications FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ============================================================================
-- LOKATOR.NG / PADIFIX — PRODUCTION ROW LEVEL SECURITY (RLS) & HARDENED DATA POLICIES
-- Paste and Run this in your Supabase SQL Editor (Project: hvxosxhnxauiqrhpyuur)
-- Synchronized with Migration 055 (Phase 039 Security Hardened Baseline)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENABLE ROW LEVEL SECURITY ACROSS ALL CORE & SECURITY-SENSITIVE TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.verification_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contact_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contact_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.provider_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.retention_policies ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. PRIVILEGED COLUMN PROTECTION TRIGGER (public.providers)
-- ----------------------------------------------------------------------------
-- Prevents non-service-role callers from escalating privileges, self-assigning
-- verification badges, modifying subscription plans, or tampering with ratings.

CREATE OR REPLACE FUNCTION public.prevent_privileged_provider_column_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Service role and database internal maintenance (e.g. review recalculation) are fully permitted
  IF auth.role() = 'service_role' OR current_setting('padifix.internal_maintenance', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Block unauthorized modification of verification state
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'Unauthorized: modifying is_verified is restricted to PadiFix Compliance Desk (service_role).';
  END IF;

  IF NEW.nin_verified IS DISTINCT FROM OLD.nin_verified THEN
    RAISE EXCEPTION 'Unauthorized: modifying nin_verified is restricted to PadiFix Compliance Desk (service_role).';
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    RAISE EXCEPTION 'Unauthorized: modifying verification_status is restricted to PadiFix Compliance Desk (service_role).';
  END IF;

  IF NEW.verification_submitted_at IS DISTINCT FROM OLD.verification_submitted_at THEN
    RAISE EXCEPTION 'Unauthorized: modifying verification_submitted_at is restricted to PadiFix Compliance Desk (service_role).';
  END IF;

  -- Block unauthorized modification of commercial subscription plan
  IF NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan THEN
    RAISE EXCEPTION 'Unauthorized: modifying subscription_plan is restricted to PadiFix Billing Webhooks (service_role).';
  END IF;

  -- Block unauthorized tampering with rating and review metrics
  IF NEW.rating IS DISTINCT FROM OLD.rating THEN
    RAISE EXCEPTION 'Unauthorized: rating is atomically managed by the review aggregation engine.';
  END IF;

  IF NEW.reviews_count IS DISTINCT FROM OLD.reviews_count THEN
    RAISE EXCEPTION 'Unauthorized: reviews_count is atomically managed by the review aggregation engine.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privileged_provider_column_update ON public.providers;
CREATE TRIGGER trg_prevent_privileged_provider_column_update
  BEFORE UPDATE ON public.providers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privileged_provider_column_update();

-- Column-level privilege revocation for defense-in-depth
REVOKE UPDATE (
  is_verified,
  nin_verified,
  verification_status,
  verification_submitted_at,
  subscription_plan,
  rating,
  reviews_count
) ON public.providers FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. PROVIDERS TABLE RLS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read on active providers" ON public.providers;
DROP POLICY IF EXISTS "Allow public provider registration" ON public.providers;
DROP POLICY IF EXISTS "Allow authenticated provider insert" ON public.providers;
DROP POLICY IF EXISTS "Allow providers to update own profile" ON public.providers;
DROP POLICY IF EXISTS "Allow providers to delete own profile" ON public.providers;
DROP POLICY IF EXISTS "Service role full access on providers" ON public.providers;

CREATE POLICY "Allow public read on active providers"
  ON public.providers FOR SELECT
  USING (
    (is_active = TRUE AND is_public = TRUE) OR
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    (auth.role() = 'service_role')
  );

CREATE POLICY "Allow public provider registration"
  ON public.providers FOR INSERT
  WITH CHECK (
    (auth.uid() IS NULL OR auth.uid() = user_id) AND
    (is_verified IS NOT TRUE) AND
    (subscription_plan IS NULL OR UPPER(subscription_plan) = 'FREE') AND
    length(trim(COALESCE(first_name, ''))) > 0 AND
    length(trim(COALESCE(last_name, ''))) > 0 AND
    length(trim(COALESCE(phone, ''))) >= 10
  );

CREATE POLICY "Allow providers to update own profile"
  ON public.providers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Allow providers to delete own profile"
  ON public.providers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Service role full access on providers"
  ON public.providers FOR ALL
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 4. PROVIDER SERVICES, PORTFOLIO & WORKING HOURS POLICIES
-- ----------------------------------------------------------------------------
-- Provider Services
DROP POLICY IF EXISTS "Allow public read on provider services" ON public.provider_services;
DROP POLICY IF EXISTS "Allow provider services insert" ON public.provider_services;
DROP POLICY IF EXISTS "Allow provider services update" ON public.provider_services;
DROP POLICY IF EXISTS "Allow provider services delete" ON public.provider_services;

CREATE POLICY "Allow public read on provider services"
  ON public.provider_services FOR SELECT
  USING (true);

CREATE POLICY "Allow provider services insert"
  ON public.provider_services FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_services.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow provider services update"
  ON public.provider_services FOR UPDATE
  TO authenticated
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_services.provider_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_services.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow provider services delete"
  ON public.provider_services FOR DELETE
  TO authenticated
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_services.provider_id
        AND p.user_id = auth.uid()
    )
  );

-- Portfolio Items
DROP POLICY IF EXISTS "Allow public read on portfolio" ON public.portfolio_items;
DROP POLICY IF EXISTS "Allow portfolio insert" ON public.portfolio_items;
DROP POLICY IF EXISTS "Allow portfolio update" ON public.portfolio_items;
DROP POLICY IF EXISTS "Allow portfolio delete" ON public.portfolio_items;

CREATE POLICY "Allow public read on portfolio"
  ON public.portfolio_items FOR SELECT
  USING (true);

CREATE POLICY "Allow portfolio insert"
  ON public.portfolio_items FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = portfolio_items.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow portfolio update"
  ON public.portfolio_items FOR UPDATE
  TO authenticated
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = portfolio_items.provider_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = portfolio_items.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow portfolio delete"
  ON public.portfolio_items FOR DELETE
  TO authenticated
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = portfolio_items.provider_id
        AND p.user_id = auth.uid()
    )
  );

-- Working Hours
DROP POLICY IF EXISTS "Allow public read on working hours" ON public.working_hours;
DROP POLICY IF EXISTS "Allow working hours upsert" ON public.working_hours;
DROP POLICY IF EXISTS "Allow working hours update" ON public.working_hours;
DROP POLICY IF EXISTS "Allow working hours delete" ON public.working_hours;

CREATE POLICY "Allow public read on working hours"
  ON public.working_hours FOR SELECT
  USING (true);

CREATE POLICY "Allow working hours upsert"
  ON public.working_hours FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = working_hours.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow working hours update"
  ON public.working_hours FOR UPDATE
  TO authenticated
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = working_hours.provider_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = working_hours.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow working hours delete"
  ON public.working_hours FOR DELETE
  TO authenticated
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = working_hours.provider_id
        AND p.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. REVIEWS DEFENSE & ATOMIC RATING AGGREGATION
-- ----------------------------------------------------------------------------
-- Self-review prevention trigger
CREATE OR REPLACE FUNCTION public.prevent_self_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_artisan_user_id UUID;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_artisan_user_id
  FROM public.providers
  WHERE id = NEW.provider_id;

  IF auth.uid() IS NOT NULL AND v_artisan_user_id IS NOT NULL AND auth.uid() = v_artisan_user_id THEN
    RAISE EXCEPTION 'Integrity violation: artisans are forbidden from reviewing their own service.';
  END IF;

  -- Client inserts can NEVER self-assign verified review status
  IF auth.role() != 'service_role' THEN
    NEW.is_verified_customer := FALSE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_review ON public.reviews;
CREATE TRIGGER trg_prevent_self_review
  BEFORE INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_review();

-- Atomic Provider Rating Aggregate Recalculation Trigger
CREATE OR REPLACE FUNCTION public.recalculate_provider_rating_aggregate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_provider_id BIGINT;
  v_avg_rating NUMERIC(3, 2);
  v_total_reviews INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_provider_id := OLD.provider_id;
  ELSE
    v_target_provider_id := NEW.provider_id;
  END IF;

  -- Compute authoritative aggregates from approved reviews
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 1), 0.0),
    COUNT(*)
  INTO
    v_avg_rating,
    v_total_reviews
  FROM public.reviews
  WHERE provider_id = v_target_provider_id
    AND is_approved = TRUE;

  -- Temporarily enable internal maintenance setting to bypass column update lock
  PERFORM set_config('padifix.internal_maintenance', 'on', true);

  UPDATE public.providers
  SET
    rating = v_avg_rating,
    reviews_count = v_total_reviews
  WHERE id = v_target_provider_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_provider_rating_aggregate ON public.reviews;
CREATE TRIGGER trg_recalculate_provider_rating_aggregate
  AFTER INSERT OR UPDATE OF rating, is_approved, is_verified_customer OR DELETE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_provider_rating_aggregate();

-- Reviews RLS Policies
DROP POLICY IF EXISTS "Allow public read on reviews" ON public.reviews;
DROP POLICY IF EXISTS "Allow public review insert" ON public.reviews;
DROP POLICY IF EXISTS "Service role manages reviews" ON public.reviews;

CREATE POLICY "Allow public read on reviews"
  ON public.reviews FOR SELECT
  USING (is_approved = TRUE OR auth.role() = 'service_role');

CREATE POLICY "Allow public review insert"
  ON public.reviews FOR INSERT
  WITH CHECK (
    rating >= 1 AND rating <= 5 AND
    length(trim(comment)) >= 3 AND
    length(trim(author_name)) > 0 AND
    (auth.role() = 'service_role' OR is_verified_customer IS NOT TRUE)
  );

CREATE POLICY "Service role manages reviews"
  ON public.reviews FOR ALL
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 6. CONTACT EVENTS, QUOTAS & SUBSCRIPTIONS ISOLATION
-- ----------------------------------------------------------------------------
-- Contact Events
DROP POLICY IF EXISTS "Providers view own contact events" ON public.contact_events;
DROP POLICY IF EXISTS "Service role manages contact events" ON public.contact_events;

CREATE POLICY "Providers view own contact events"
  ON public.contact_events FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = contact_events.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages contact events"
  ON public.contact_events FOR ALL
  USING (auth.role() = 'service_role');

-- Contact Quotas
DROP POLICY IF EXISTS "Providers view own contact quotas" ON public.contact_quotas;
DROP POLICY IF EXISTS "Service role manages contact_quotas" ON public.contact_quotas;

CREATE POLICY "Providers view own contact quotas"
  ON public.contact_quotas FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = contact_quotas.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages contact_quotas"
  ON public.contact_quotas FOR ALL
  USING (auth.role() = 'service_role');

-- Provider Subscriptions
DROP POLICY IF EXISTS "Providers view own subscription" ON public.provider_subscriptions;
DROP POLICY IF EXISTS "Service role manages provider subscriptions" ON public.provider_subscriptions;

CREATE POLICY "Providers view own subscription"
  ON public.provider_subscriptions FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_subscriptions.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages provider subscriptions"
  ON public.provider_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

REVOKE UPDATE, INSERT, DELETE ON public.provider_subscriptions FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. VERIFICATION SUBMISSIONS & REQUESTS HARDENING
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Providers view own verification submissions" ON public.verification_submissions;
DROP POLICY IF EXISTS "Service role manages verification submissions" ON public.verification_submissions;

CREATE POLICY "Providers view own verification submissions"
  ON public.verification_submissions FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = verification_submissions.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages verification submissions"
  ON public.verification_submissions FOR ALL
  USING (auth.role() = 'service_role');

-- Verification Requests (Legacy compatibility table)
DROP POLICY IF EXISTS "Providers view own verification requests" ON public.verification_requests;
DROP POLICY IF EXISTS "Service role manages verification_requests" ON public.verification_requests;

CREATE POLICY "Providers view own verification requests"
  ON public.verification_requests FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = verification_requests.provider_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages verification_requests"
  ON public.verification_requests FOR ALL
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 8. ZERO-POLICY TABLES EXPLICIT SERVICE ROLE POLICIES
-- ----------------------------------------------------------------------------
-- Explicitly configure service-role-only policies to satisfy Supabase Advisor
-- and document that these are strictly server-managed ledgers.

-- Analytics Events
DROP POLICY IF EXISTS "Service role manages analytics_events" ON public.analytics_events;
CREATE POLICY "Service role manages analytics_events"
  ON public.analytics_events FOR ALL
  USING (auth.role() = 'service_role');

-- Billing Transactions
DROP POLICY IF EXISTS "Service role manages billing_transactions" ON public.billing_transactions;
CREATE POLICY "Service role manages billing_transactions"
  ON public.billing_transactions FOR ALL
  USING (auth.role() = 'service_role');

-- Retention Policies
DROP POLICY IF EXISTS "Service role manages retention_policies" ON public.retention_policies;
CREATE POLICY "Service role manages retention_policies"
  ON public.retention_policies FOR ALL
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 9. HARDEN SECURITY DEFINER FUNCTIONS & PIN SEARCH PATHS
-- ----------------------------------------------------------------------------

-- A. check_provider_already_verified
CREATE OR REPLACE FUNCTION public.check_provider_already_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- B. approve_provider_verification
CREATE OR REPLACE FUNCTION public.approve_provider_verification(
  target_submission_id UUID,
  admin_identity TEXT DEFAULT 'compliance_officer',
  p_nin_verified BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  -- Strict Administrative Execution Authorization Gate
  IF auth.role() != 'service_role' AND current_user != 'postgres' THEN
    RAISE EXCEPTION 'Unauthorized: approve_provider_verification is restricted to PadiFix Compliance Desk (service_role).';
  END IF;

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

  -- Temporarily enable internal maintenance setting to bypass column update lock
  PERFORM set_config('padifix.internal_maintenance', 'on', true);

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

REVOKE ALL ON FUNCTION public.approve_provider_verification(UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_provider_verification(UUID, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.approve_provider_verification(UUID, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_provider_verification(UUID, TEXT, BOOLEAN) TO service_role;

-- C. reject_provider_verification
CREATE OR REPLACE FUNCTION public.reject_provider_verification(
  target_submission_id UUID,
  reason_code TEXT,
  notes TEXT,
  admin_identity TEXT DEFAULT 'compliance_officer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  -- Strict Administrative Execution Authorization Gate
  IF auth.role() != 'service_role' AND current_user != 'postgres' THEN
    RAISE EXCEPTION 'Unauthorized: reject_provider_verification is restricted to PadiFix Compliance Desk (service_role).';
  END IF;

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

  -- Temporarily enable internal maintenance setting to bypass column update lock
  PERFORM set_config('padifix.internal_maintenance', 'on', true);

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
    'rejection_reason', reason_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_provider_verification(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_provider_verification(UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.reject_provider_verification(UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_provider_verification(UUID, TEXT, TEXT, TEXT) TO service_role;

-- D. consume_contact_entitlement
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

-- E. is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    OR coalesce(auth.jwt() ->> 'role', '') = 'service_role'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- F. purge_expired_analytics_events
CREATE OR REPLACE FUNCTION public.purge_expired_analytics_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- ----------------------------------------------------------------------------
-- 10. STORAGE BUCKETS & OBJECT RLS POLICIES
-- ----------------------------------------------------------------------------
-- Ensure buckets exist with canonical public/private configurations
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('provider-avatars', 'provider-avatars', TRUE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('portfolio-images', 'portfolio-images', TRUE, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']),
  ('provider-verifications', 'provider-verifications', FALSE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('verification-docs', 'verification-docs', FALSE, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage Objects RLS: Provider Avatars (Public Read, Authenticated Owner Write)
DROP POLICY IF EXISTS "Public read on avatars bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload to own avatar folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete own avatar" ON storage.objects;

CREATE POLICY "Public read on avatars bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'provider-avatars' OR bucket_id = 'avatars');

CREATE POLICY "Authenticated upload to own avatar folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    (bucket_id = 'provider-avatars' OR bucket_id = 'avatars') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    (bucket_id = 'provider-avatars' OR bucket_id = 'avatars') AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    (bucket_id = 'provider-avatars' OR bucket_id = 'avatars') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    (bucket_id = 'provider-avatars' OR bucket_id = 'avatars') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage Objects RLS: Portfolio Images (Public Read, Authenticated Owner Write)
DROP POLICY IF EXISTS "Public read on portfolio bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload to own portfolio folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update own portfolio item" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete own portfolio item" ON storage.objects;

CREATE POLICY "Public read on portfolio bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio-images' OR bucket_id = 'portfolio');

CREATE POLICY "Authenticated upload to own portfolio folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    (bucket_id = 'portfolio-images' OR bucket_id = 'portfolio') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated update own portfolio item"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    (bucket_id = 'portfolio-images' OR bucket_id = 'portfolio') AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    (bucket_id = 'portfolio-images' OR bucket_id = 'portfolio') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated delete own portfolio item"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    (bucket_id = 'portfolio-images' OR bucket_id = 'portfolio') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage Objects RLS: Verification Documents (100% Private, Immutable Audit Trail)
DROP POLICY IF EXISTS "Service role read on verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Providers upload verification document to own folder" ON storage.objects;

CREATE POLICY "Service role read on verification documents"
  ON storage.objects FOR SELECT
  USING (
    (bucket_id = 'provider-verifications' OR bucket_id = 'verification-docs') AND
    auth.role() = 'service_role'
  );

CREATE POLICY "Providers upload verification document to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    (bucket_id = 'provider-verifications' OR bucket_id = 'verification-docs') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Note: No UPDATE or DELETE policies are granted on provider-verifications/verification-docs
-- to authenticated/anon users, enforcing permanent immutability for compliance and KYC audits.

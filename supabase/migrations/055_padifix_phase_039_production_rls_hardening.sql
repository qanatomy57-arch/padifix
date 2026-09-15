-- ============================================================================
-- PADIFIX PHASE 039: PRODUCTION ROW LEVEL SECURITY (RLS) & HARDENED DATA POLICIES
-- Migration: 055_padifix_phase_039_production_rls_hardening.sql
-- Project Ref: hvxosxhnxauiqrhpyuur
-- ============================================================================

-- 1. ENABLE ROW LEVEL SECURITY ACROSS ALL CORE & SECURITY-SENSITIVE TABLES
ALTER TABLE IF EXISTS public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.verification_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contact_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.provider_subscriptions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. PRIVILEGED COLUMN PROTECTION TRIGGER (public.providers)
-- ----------------------------------------------------------------------------
-- Prevents non-service-role callers from escalating privileges, self-assigning
-- verification badges, modifying subscription plans, or tampering with ratings.

CREATE OR REPLACE FUNCTION public.prevent_privileged_provider_column_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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
-- 6. CONTACT EVENTS & PROVIDER SUBSCRIPTIONS HARDENING
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
-- 7. STORAGE BUCKETS & OBJECT RLS POLICIES
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

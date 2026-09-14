-- ============================================================================
-- PADIFIX PHASE 035: MONETIZATION INTEGRITY, LEGACY PAYMENT CLEANUP,
-- & PERSISTENT VERIFICATION STATUS
-- Migration: 053_padifix_phase_035_monetization_integrity.sql
-- ============================================================================

-- 1. SYNCHRONIZE AUTHORITATIVE CANONICAL PROVIDER PLANS
-- Guaranteed Canonical Catalog:
-- FREE:    ₦0 / month (Verification Ineligible)
-- BASIC:   ₦5,500 / month | ₦55,000 / year (Verification Eligible)
-- PRO:     ₦11,000 / month | ₦110,000 / year (Verification Eligible)
-- PREMIUM: ₦22,000 / month | ₦220,000 / year (Verification Eligible)

INSERT INTO public.provider_plans (
  id, name, price_amount_ngn, price_kobo, annual_price_amount_ngn, annual_price_kobo,
  billing_interval, contact_allowance, max_skills, max_photos, max_videos,
  search_priority, is_featured, is_popular, verification_eligible, paystack_plan_code, features, is_active
) VALUES
  (
    'FREE',
    'Free Starter',
    0.00,
    0,
    0.00,
    0,
    'monthly',
    5,
    3,
    5,
    0,
    0,
    FALSE,
    FALSE,
    FALSE,
    NULL,
    '["Basic provider profile", "Standard search visibility", "Maximum 3 skills", "Maximum 5 photos", "Customer reviews", "Standard provider dashboard", "5 customer contacts/month", "No Verified Trust Assurance", "No verification-document submission"]'::jsonb,
    TRUE
  ),
  (
    'BASIC',
    'Basic',
    5500.00,
    550000,
    55000.00,
    5500000,
    'monthly',
    30,
    10,
    15,
    1,
    1,
    FALSE,
    FALSE,
    TRUE,
    'PLN_yf4tb6fpw2u8zj6',
    '["Everything in Free", "Up to 10 skills/services", "Up to 15 photos", "1 provider video", "Verified Trust Assurance included", "Verification-document submission unlocked", "Availability status badge", "Improved search visibility (+5%)", "Lead/contact history", "Basic analytics", "30 customer contacts/month"]'::jsonb,
    TRUE
  ),
  (
    'PRO',
    'Pro',
    11000.00,
    1100000,
    110000.00,
    11000000,
    'monthly',
    100,
    25,
    30,
    3,
    2,
    TRUE,
    TRUE,
    TRUE,
    'PLN_pqm1fg3b1o0wwf1',
    '["Everything in Basic", "Up to 25 skills/services", "Up to 30 photos", "Up to 3 provider videos", "Verified Trust Assurance included", "Verification-document submission unlocked", "Priority search visibility (+15%)", "Featured provider profile", "Advanced lead analytics", "Priority support", "100 customer contacts/month"]'::jsonb,
    TRUE
  ),
  (
    'PREMIUM',
    'Premium',
    22000.00,
    2200000,
    220000.00,
    22000000,
    'monthly',
    500,
    999,
    999,
    5,
    3,
    TRUE,
    FALSE,
    TRUE,
    'PLN_e3nu8i62af9ypve',
    '["Everything in Pro", "Unlimited skills/services", "Unlimited photos", "Up to 5 provider videos", "Verified Trust Assurance included", "Verification-document submission unlocked", "Highest search visibility (+25%)", "Featured placement & promo", "Dedicated VIP support", "500 customer contacts/month"]'::jsonb,
    TRUE
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_amount_ngn = EXCLUDED.price_amount_ngn,
  price_kobo = EXCLUDED.price_kobo,
  annual_price_amount_ngn = EXCLUDED.annual_price_amount_ngn,
  annual_price_kobo = EXCLUDED.annual_price_kobo,
  billing_interval = EXCLUDED.billing_interval,
  contact_allowance = EXCLUDED.contact_allowance,
  max_skills = EXCLUDED.max_skills,
  max_photos = EXCLUDED.max_photos,
  max_videos = EXCLUDED.max_videos,
  search_priority = EXCLUDED.search_priority,
  is_featured = EXCLUDED.is_featured,
  is_popular = EXCLUDED.is_popular,
  verification_eligible = EXCLUDED.verification_eligible,
  paystack_plan_code = EXCLUDED.paystack_plan_code,
  features = EXCLUDED.features,
  is_active = TRUE,
  updated_at = NOW();

-- 2. HARDEN RLS ON VERIFICATION REQUESTS (PAID PROVIDERS ONLY)
-- Free accounts and unauthenticated users can NEVER insert verification requests
ALTER TABLE IF EXISTS public.verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Paid providers can submit own verification request" ON public.verification_requests;
DROP POLICY IF EXISTS "Providers can submit own verification request" ON public.verification_requests;

CREATE POLICY "Paid providers can submit own verification request"
  ON public.verification_requests
  FOR INSERT
  WITH CHECK (
    provider_id IN (
      SELECT p.id FROM public.providers p
      LEFT JOIN public.provider_subscriptions ps ON ps.provider_id = p.id
      WHERE p.user_id = auth.uid()
        AND (
          (ps.status = 'active' AND UPPER(ps.plan_id) IN ('BASIC', 'PRO', 'PREMIUM'))
          OR (UPPER(p.subscription_plan) IN ('BASIC', 'PRO', 'PREMIUM'))
        )
    )
    OR auth.role() = 'service_role'
  );

-- 3. PERSISTENT VERIFICATION INTEGRITY
-- Enforce that successful verification is immutable to direct client edits.
-- Verification records and provider.is_verified persist permanently across subscription changes.
CREATE OR REPLACE FUNCTION public.enforce_persistent_verification_integrity()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent client-side unverification or tampering with verified status
  IF OLD.is_verified = TRUE AND NEW.is_verified = FALSE AND auth.role() != 'service_role' THEN
    -- Preserve existing verified status unless service_role compliance action
    NEW.is_verified := TRUE;
  END IF;

  IF OLD.nin_verified = TRUE AND NEW.nin_verified = FALSE AND auth.role() != 'service_role' THEN
    NEW.nin_verified := TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_persistent_verification_integrity ON public.providers;
CREATE TRIGGER trigger_persistent_verification_integrity
  BEFORE UPDATE ON public.providers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_persistent_verification_integrity();

-- 4. RECORD MIGRATION COMPLETION
COMMENT ON TABLE public.provider_plans IS 'Phase 035 Authoritative Catalog: Free (₦0), Basic (₦5.5k/₦55k), Pro (₦11k/₦110k), Premium (₦22k/₦220k).';

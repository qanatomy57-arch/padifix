-- ============================================================================
-- PADIFIX PHASE 012: LAUNCH SUBSCRIPTION PRICING, FREE PROVIDER KYC GATING,
-- & RECEIPT RESEND AUDIT LIFECYCLE
-- Migration: 037_padifix_phase_012_launch_pricing_and_receipt_lifecycle.sql
-- ============================================================================

-- 1. ENSURE CANONICAL PROVIDER PLANS TABLE EXISTS
CREATE TABLE IF NOT EXISTS public.provider_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_amount_ngn NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  price_kobo BIGINT NOT NULL DEFAULT 0,
  annual_price_amount_ngn NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  annual_price_kobo BIGINT NOT NULL DEFAULT 0,
  billing_interval TEXT NOT NULL DEFAULT 'monthly',
  contact_allowance INTEGER NOT NULL DEFAULT 5,
  max_skills INTEGER NOT NULL DEFAULT 3,
  max_photos INTEGER NOT NULL DEFAULT 5,
  max_videos INTEGER NOT NULL DEFAULT 0,
  search_priority INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  verification_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  paystack_plan_code TEXT,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure annual pricing and verification columns exist if table was previously created
ALTER TABLE public.provider_plans
  ADD COLUMN IF NOT EXISTS annual_price_amount_ngn NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS annual_price_kobo BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_eligible BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paystack_plan_code TEXT;

-- 2. ENSURE PROVIDER SUBSCRIPTIONS TABLE EXISTS
CREATE TABLE IF NOT EXISTS public.provider_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id BIGINT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES public.provider_plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  paystack_subscription_code TEXT,
  paystack_customer_code TEXT,
  paystack_plan_code TEXT,
  paystack_email_token TEXT,
  last_payment_reference TEXT,
  grace_period_ends_at TIMESTAMPTZ,
  failed_payment_count INTEGER DEFAULT 0,
  last_payment_failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  lifecycle_status TEXT DEFAULT 'active',
  email_notifications JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_provider_active_sub UNIQUE(provider_id)
);

-- Ensure lifecycle and grace columns exist if table was previously created
ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS paystack_plan_code TEXT,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_payment_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS email_notifications JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_provider_subs_lifecycle ON public.provider_subscriptions (provider_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_provider_subs_grace ON public.provider_subscriptions (grace_period_ends_at) WHERE grace_period_ends_at IS NOT NULL;

-- 3. ENSURE BILLING TRANSACTIONS TABLE EXISTS
CREATE TABLE IF NOT EXISTS public.billing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id BIGINT NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  amount_kobo BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  plan_id TEXT NOT NULL REFERENCES public.provider_plans(id),
  status TEXT NOT NULL DEFAULT 'pending',
  transaction_type TEXT DEFAULT 'initial',
  paystack_channel TEXT,
  gateway_response TEXT,
  receipt_sent BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_sent_at TIMESTAMPTZ,
  receipt_resent_count INTEGER NOT NULL DEFAULT 0,
  last_receipt_resent_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure receipt tracking and type columns exist if table was previously created
ALTER TABLE public.billing_transactions
  ADD COLUMN IF NOT EXISTS transaction_type TEXT DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS receipt_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_resent_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_receipt_resent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_billing_tx_provider_ref ON public.billing_transactions (provider_id, reference);
CREATE INDEX IF NOT EXISTS idx_billing_tx_receipt ON public.billing_transactions (receipt_sent);

-- 4. SEED & SYNCHRONIZE CANONICAL LAUNCH SUBSCRIPTION PRICING
INSERT INTO public.provider_plans (
  id, name, price_amount_ngn, price_kobo, annual_price_amount_ngn, annual_price_kobo,
  billing_interval, contact_allowance, max_skills, max_photos, max_videos,
  search_priority, is_featured, is_popular, verification_eligible, paystack_plan_code, features
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
    '["Basic provider profile", "Standard search visibility", "Maximum 3 skills", "Maximum 5 photos", "Customer reviews", "Standard provider dashboard", "5 customer contacts/month", "No Verified Trust Assurance", "No verification-document submission"]'::jsonb
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
    '["Everything in Free", "Up to 10 skills/services", "Up to 15 photos", "1 provider video", "Verified Trust Assurance included", "Verification-document submission unlocked", "Availability status badge", "Improved search visibility (+5%)", "Lead/contact history", "Basic analytics", "30 customer contacts/month"]'::jsonb
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
    '["Everything in Basic", "Up to 25 skills/services", "Up to 30 photos", "Up to 3 provider videos", "Verified Trust Assurance included", "Verification-document submission unlocked", "Priority search visibility (+15%)", "Featured provider profile", "Advanced lead analytics", "Contact history", "Priority support", "100 customer contacts/month"]'::jsonb
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
    '["Everything in Pro", "Unlimited skills/services", "Unlimited photos", "Up to 5 provider videos", "Verified Trust Assurance included", "Verification-document submission unlocked", "Highest search visibility (+25%)", "Featured placement", "Advanced analytics", "Promotional opportunities", "VIP support", "500 customer contacts/month fair-use limit"]'::jsonb
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
  updated_at = NOW();

-- 5. ENSURE VERIFICATION REQUESTS TABLE & RLS EXIST
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id BIGINT NOT NULL,
  document_type TEXT NOT NULL,
  document_number_masked TEXT NOT NULL,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  rejection_reason TEXT,
  notes TEXT
);

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Free providers are strictly barred from inserting verification requests
DROP POLICY IF EXISTS "Providers can submit own verification request" ON public.verification_requests;
DROP POLICY IF EXISTS "Paid providers can submit own verification request" ON public.verification_requests;

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

-- Enable public read on provider plans
ALTER TABLE public.provider_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active provider plans" ON public.provider_plans;
CREATE POLICY "Public can view active provider plans"
  ON public.provider_plans FOR SELECT
  USING (is_active = TRUE);

-- End of Migration 037

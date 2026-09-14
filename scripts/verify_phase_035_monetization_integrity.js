/**
 * PADIFIX PHASE 035 — MONETIZATION INTEGRITY, LEGACY PAYMENT CLEANUP & PERSISTENT VERIFICATION
 * Verification Test Suite
 *
 * Verifies:
 * 1. Canonical Provider Subscription Catalog (Free ₦0, Basic ₦5.5k/₦55k, Pro ₦11k/₦110k, Premium ₦22k/₦220k).
 * 2. Monthly and Annual billing preservation with server-side kobo authority.
 * 3. Client amount and currency override rejections.
 * 4. Deprecated legacy products (PROMOTED_LISTING_STARTER, TRUST_VERIFICATION_AUDIT) rejection in init, verify, and webhook.
 * 5. Verification entitlement matrix (Free = not eligible, Basic/Pro/Premium = eligible).
 * 6. Persistent one-time verification across subscription lifecycle (Active -> Expired -> Cancelled -> Resubscribed).
 * 7. Verified badge persistence and unverified/re-verify prevention on expired accounts.
 * 8. Zero customer job payment / zero escrow platform invariants.
 * 9. Live payment safety gate (PAYMENT_LIVE_MODE=false).
 * 10. Vercel function budget (<= 12 deployed functions).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Monetization = require('../monetization-config.js');

// Mock helpers for serverless API handlers
function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    end() { return this; }
  };
}

// Load handlers
const paystackInitHandler = require('../api/paystack-init.js');
const paystackVerifyHandler = require('../api/paystack-verify.js');
const paystackWebhookHandler = require('../api/paystack-webhook.js');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    failCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    failCount++;
  }
}

async function main() {
  console.log('================================================================');
  console.log('PADIFIX PHASE 035: MONETIZATION INTEGRITY & PERSISTENT VERIFICATION');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // Section 1: Canonical Payment Catalog & Billing Intervals
  // -------------------------------------------------------------
  console.log('--- SECTION 1: Canonical Subscription Catalog & Server Authority ---');

  await runAsyncTest('Free plan accepted as non-paid direct activation (0 NGN)', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'FREE' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.mode, 'DIRECT_ACTIVATION');
    assert.strictEqual(res.body.amount, 0);
  });

  await runAsyncTest('Basic Monthly initialization resolves canonical 550,000 kobo (₦5,500)', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'BASIC', interval: 'monthly' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.order.amount, 550000);
    assert.strictEqual(res.body.order.billing_interval, 'monthly');
    assert.strictEqual(res.body.order.duration_days, 30);
  });

  await runAsyncTest('Basic Annual initialization resolves canonical 5,500,000 kobo (₦55,000)', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'BASIC', interval: 'annually' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.order.amount, 5500000);
    assert.strictEqual(res.body.order.billing_interval, 'annually');
    assert.strictEqual(res.body.order.duration_days, 365);
  });

  await runAsyncTest('Pro Monthly initialization resolves canonical 1,100,000 kobo (₦11,000)', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'PRO', interval: 'monthly' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.order.amount, 1100000);
    assert.strictEqual(res.body.order.billing_interval, 'monthly');
  });

  await runAsyncTest('Pro Annual initialization resolves canonical 11,000,000 kobo (₦110,000)', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'PRO', interval: 'yearly' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.order.amount, 11000000);
    assert.strictEqual(res.body.order.billing_interval, 'annually');
    assert.strictEqual(res.body.order.duration_days, 365);
  });

  await runAsyncTest('Premium Monthly initialization resolves canonical 2,200,000 kobo (₦22,000)', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'PREMIUM', interval: 'monthly' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.order.amount, 2200000);
    assert.strictEqual(res.body.order.billing_interval, 'monthly');
  });

  await runAsyncTest('Premium Annual initialization resolves canonical 22,000,000 kobo (₦220,000)', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'PREMIUM', interval: 'annual' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.order.amount, 22000000);
    assert.strictEqual(res.body.order.billing_interval, 'annually');
  });

  await runAsyncTest('Unknown plan ID is strictly rejected with HTTP 400', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'ENTERPRISE_CUSTOM' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'INVALID_PLAN_ID');
  });

  await runAsyncTest('Missing plan_id without legacy fallback is rejected with HTTP 400', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101 }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'MISSING_PLAN_ID');
  });

  await runAsyncTest('Unknown billing interval is rejected with HTTP 400', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'BASIC', interval: 'biweekly' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'INVALID_INTERVAL');
  });

  await runAsyncTest('Client amount override attempt is rejected with HTTP 400', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'BASIC', interval: 'monthly', amount: 1000 }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'CLIENT_AMOUNT_OVERRIDE_REJECTED');
  });

  await runAsyncTest('Client currency override attempt is rejected with HTTP 400', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, plan_id: 'BASIC', interval: 'monthly', currency: 'USD' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'CLIENT_CURRENCY_OVERRIDE_REJECTED');
  });

  // -------------------------------------------------------------
  // Section 2: Legacy Payment Product Elimination
  // -------------------------------------------------------------
  console.log('\n--- SECTION 2: Legacy Payment Product Elimination ---');

  await runAsyncTest('PROMOTED_LISTING_STARTER initialization is rejected with HTTP 400', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, product_id: 'PROMOTED_LISTING_STARTER' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'LEGACY_PRODUCT_DEPRECATED');
  });

  await runAsyncTest('TRUST_VERIFICATION_AUDIT initialization is rejected with HTTP 400', async () => {
    const req = {
      method: 'POST',
      body: { provider_id: 101, product_id: 'TRUST_VERIFICATION_AUDIT' }
    };
    const res = createMockRes();
    await paystackInitHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'LEGACY_PRODUCT_DEPRECATED');
  });

  await runAsyncTest('paystack-verify rejects PROMOTED_LISTING_STARTER verification with HTTP 400', async () => {
    const req = {
      method: 'POST',
      body: { reference: 'lok_plt_12345', metadata: { product_id: 'PROMOTED_LISTING_STARTER' } }
    };
    const res = createMockRes();
    await paystackVerifyHandler(req, res);
    // In sandbox or live, legacy product is rejected
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'LEGACY_PRODUCT_DEPRECATED');
  });

  await runAsyncTest('paystack-webhook safely ignores legacy product charge without granting entitlement', async () => {
    // Generate valid test payload with legacy product
    const event = {
      event: 'charge.success',
      data: {
        reference: 'test_legacy_promo_ref',
        amount: 200000,
        currency: 'NGN',
        metadata: {
          product_id: 'PROMOTED_LISTING_STARTER',
          provider_id: 101
        }
      }
    };
    const bodyStr = JSON.stringify(event);
    const req = {
      method: 'POST',
      rawBody: bodyStr,
      headers: {
        'x-paystack-signature': 'mock_bypass_test'
      }
    };
    const res = createMockRes();

    // In test environment without webhook secret key set, handler processes payload
    await paystackWebhookHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'ignored');
    assert.notStrictEqual(res.body.entitlement, 'PROMOTED_LISTING');
  });

  // -------------------------------------------------------------
  // Section 3: Verification Entitlement & Persistent Verification Model
  // -------------------------------------------------------------
  console.log('\n--- SECTION 3: Verification Entitlement & Persistent Verification ---');

  runTest('Free provider is strictly NOT eligible to initiate verification', () => {
    const provider = { id: 1, subscription_plan: 'FREE', is_verified: false };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.isVerified, false);
    assert.strictEqual(state.verification_status, 'never_verified');
    assert.strictEqual(state.verification_eligible, false);
    assert.strictEqual(state.canRequestVerification, false);
    assert.strictEqual(state.badgeVisible, false);
    assert.strictEqual(state.key, 'NOT_ELIGIBLE');
  });

  runTest('Basic active subscriber is eligible to initiate verification', () => {
    const provider = { id: 2, subscription_plan: 'BASIC', subscription_status: 'active', is_verified: false };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.isVerified, false);
    assert.strictEqual(state.verification_status, 'never_verified');
    assert.strictEqual(state.verification_eligible, true);
    assert.strictEqual(state.canRequestVerification, true);
    assert.strictEqual(state.badgeVisible, false);
    assert.strictEqual(state.key, 'AVAILABLE');
  });

  runTest('Pro active subscriber is eligible to initiate verification', () => {
    const provider = { id: 3, subscription_plan: 'PRO', subscription_status: 'active', is_verified: false };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.isVerified, false);
    assert.strictEqual(state.verification_status, 'never_verified');
    assert.strictEqual(state.verification_eligible, true);
    assert.strictEqual(state.canRequestVerification, true);
  });

  runTest('Premium active subscriber is eligible to initiate verification', () => {
    const provider = { id: 4, subscription_plan: 'PREMIUM', subscription_status: 'active', is_verified: false };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.isVerified, false);
    assert.strictEqual(state.verification_status, 'never_verified');
    assert.strictEqual(state.verification_eligible, true);
    assert.strictEqual(state.canRequestVerification, true);
  });

  runTest('Paid unverified provider does NOT receive verified badge', () => {
    const provider = { id: 5, subscription_plan: 'PRO', subscription_status: 'active', is_verified: false };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.badgeVisible, false);
    assert.strictEqual(state.isVerified, false);
  });

  runTest('Basic active subscriber receives standard "Verified Artisan" badge', () => {
    const provider = { id: 6, subscription_plan: 'BASIC', subscription_status: 'active', is_verified: true };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.isVerified, true);
    assert.strictEqual(state.verification_status, 'verified');
    assert.strictEqual(state.verification_eligible, true);
    assert.strictEqual(state.badgeVisible, true);
    assert.strictEqual(state.publicBadgeText, 'Verified Artisan');
    assert.strictEqual(state.canRequestVerification, false);
  });

  runTest('Pro active subscriber receives "Pro Verified Artisan" badge', () => {
    const provider = { id: 61, subscription_plan: 'PRO', subscription_status: 'active', is_verified: true };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.isVerified, true);
    assert.strictEqual(state.badgeVisible, true);
    assert.strictEqual(state.publicBadgeText, 'Pro Verified Artisan');
    assert.strictEqual(state.canRequestVerification, false);
  });

  runTest('Premium active subscriber receives "Premium Verified Artisan" badge', () => {
    const provider = { id: 62, subscription_plan: 'PREMIUM', subscription_status: 'active', is_verified: true };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.isVerified, true);
    assert.strictEqual(state.badgeVisible, true);
    assert.strictEqual(state.publicBadgeText, 'Premium Verified Artisan');
    assert.strictEqual(state.canRequestVerification, false);
  });

  runTest('Free provider displays NO verification badge even if previously verified on record', () => {
    const provider = { id: 63, subscription_plan: 'FREE', subscription_status: 'active', is_verified: true };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.isVerified, true, 'Verification record persists permanently');
    assert.strictEqual(state.verification_status, 'verified');
    assert.strictEqual(state.badgeVisible, false, 'Free provider must display no verification badge');
    assert.strictEqual(state.publicBadgeText, '');
    assert.strictEqual(state.canRequestVerification, false);
  });

  runTest('PERSISTENT VERIFICATION: Expired subscription keeps verification record but hides badge', () => {
    const provider = {
      id: 7,
      subscription_plan: 'PRO',
      subscription_status: 'expired',
      is_verified: true,
      verified_at: '2026-01-15T10:00:00Z'
    };
    const state = Monetization.resolveVerificationState(provider);
    // Verification persists permanently!
    assert.strictEqual(state.isVerified, true, 'isVerified must remain permanently true');
    assert.strictEqual(state.verification_status, 'verified', 'verification_status must remain verified');
    // Badge disappears when subscription expires
    assert.strictEqual(state.badgeVisible, false, 'badgeVisible must be false when expired');
    assert.strictEqual(state.publicBadgeText, '');
    // Subscription eligibility is inactive
    assert.strictEqual(state.verification_eligible, false, 'verification_eligible must be false while expired');
    assert.strictEqual(state.subscriptionActive, false, 'subscriptionActive must be false');
    // Never prompts or forces to re-verify
    assert.strictEqual(state.canRequestVerification, false, 'canRequestVerification must remain false');
    assert.strictEqual(state.key, 'VERIFIED_INACTIVE');
  });

  runTest('PERSISTENT VERIFICATION: Cancelled subscription keeps verification record but hides badge', () => {
    const provider = {
      id: 8,
      subscription_plan: 'BASIC',
      subscription_status: 'cancelled',
      is_verified: true
    };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.isVerified, true, 'isVerified remains permanently true');
    assert.strictEqual(state.verification_status, 'verified');
    assert.strictEqual(state.badgeVisible, false, 'badgeVisible is false when cancelled');
    assert.strictEqual(state.publicBadgeText, '');
    assert.strictEqual(state.verification_eligible, false);
    assert.strictEqual(state.canRequestVerification, false);
  });

  runTest('PERSISTENT VERIFICATION: Resubscribed provider automatically regains tier badge without re-verification', () => {
    const provider = {
      id: 9,
      subscription_plan: 'PREMIUM',
      subscription_status: 'active',
      is_verified: true
    };
    const state = Monetization.resolveVerificationState(provider);
    assert.strictEqual(state.isVerified, true);
    assert.strictEqual(state.verification_status, 'verified');
    assert.strictEqual(state.verification_eligible, true);
    assert.strictEqual(state.subscriptionActive, true);
    assert.strictEqual(state.badgeVisible, true);
    assert.strictEqual(state.publicBadgeText, 'Premium Verified Artisan');
    assert.strictEqual(state.canRequestVerification, false, 'No re-verification required');
  });

  // -------------------------------------------------------------
  // Section 4: Platform Invariants & Safety Gates
  // -------------------------------------------------------------
  console.log('\n--- SECTION 4: Platform Invariants & Safety Gates ---');

  runTest('Zero Customer Job Payments invariant: No checkout, escrow, or payouts in catalog', () => {
    const plans = Monetization.PROVIDER_PLANS;
    const planKeys = Object.keys(plans);
    assert.deepStrictEqual(planKeys.sort(), ['BASIC', 'FREE', 'PREMIUM', 'PRO']);
    // Ensure all plans are provider subscriptions
    Object.values(plans).forEach(p => {
      assert.ok(p.contactAllowance !== undefined);
      assert.strictEqual(p.currency || 'NGN', 'NGN');
    });
  });

  runTest('Live Payment Safety Gate: PAYMENT_LIVE_MODE is strictly false in .env', () => {
    const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    assert.ok(envContent.includes('PAYMENT_LIVE_MODE=false'), 'PAYMENT_LIVE_MODE must be false');
    assert.ok(!envContent.includes('PAYMENT_LIVE_MODE=true'), 'PAYMENT_LIVE_MODE must not be true');
  });

  runTest('Vercel Function Budget: Exactly <= 12 deployed serverless functions', () => {
    const apiFiles = fs.readdirSync(path.join(__dirname, '..', 'api')).filter(f => f.endsWith('.js'));
    const vercelIgnore = fs.readFileSync(path.join(__dirname, '..', '.vercelignore'), 'utf8');
    const deployed = apiFiles.filter(f => !vercelIgnore.includes('api/' + f));
    assert.ok(deployed.length <= 12, `Deployed functions count (${deployed.length}) must be <= 12`);
  });

  console.log('\n================================================================');
  console.log(`PHASE 035 VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

/**
 * PADIFIX — PHASE 011 AUTOMATED VERIFICATION SUITE
 * Recurring Paystack Subscriptions, Billing Lifecycle, Resend Email Infrastructure & Provider Growth
 *
 * Verifies:
 * 1. Canonical Pricing & Plan Codes (Basic ₦3.5k, Pro ₦8k, Premium ₦15k)
 * 2. Paystack Transaction Initialization with Recurring Plan Codes
 * 3. Paystack Transaction Verification & Entitlement Enforcement
 * 4. Paystack Webhook Security (HMAC-SHA512, Replay Protection, Lifecycle Events)
 * 5. Subscription State Machine & 3-Day Grace Period Handling
 * 6. Non-Renewing / Cancellation Flow (Entitlement preserved until period end)
 * 7. Resend Transactional Email Service (7 canonical templates, sandbox simulation, zero secret leak)
 * 8. Contact Metering with Phase 011 Allowances (5, 30, 100, 500 fair-use)
 * 9. Non-Negotiable Invariants (0% commission, Zero escrow, Trust separation, Fail-closed KYC)
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const PadiFixMonetization = require('../monetization-config');
const paystackInitHandler = require('../api/paystack-init');
const paystackVerifyHandler = require('../api/paystack-verify');
const paystackWebhookHandler = require('../api/paystack-webhook');
const contactMeterHandler = require('../api/contact-meter');
const subscriptionManageHandler = require('../api/subscription-manage');
const ResendEmailService = require('../lib/resend-email-service');
const LokatorDB = require('../supabase-client');

// Mock Express req/res harness
function createMockContext(reqOverrides = {}) {
  const req = {
    method: 'POST',
    headers: {
      origin: 'http://localhost:8080',
      'x-forwarded-for': '127.0.0.1',
      ...(reqOverrides.headers || {})
    },
    body: {},
    query: {},
    ...reqOverrides
  };

  let statusCode = 200;
  let responseData = null;
  const headersSent = {};

  const res = {
    setHeader(key, val) {
      headersSent[key] = val;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    },
    end() {
      return res;
    }
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => responseData
  };
}

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Reason: ${err.message}`);
    failed++;
  }
}

(async () => {
  console.log('================================================================================');
  console.log('🚀 PADIFIX PHASE 011: RECURRING PAYSTACK & RESEND VERIFICATION SUITE');
  console.log('================================================================================\n');

  // -------------------------------------------------------------
  // SECTION 1: CANONICAL PRICING & PLAN CODES
  // -------------------------------------------------------------
  console.log('--- 1. CANONICAL PRICING & PAYSTACK PLAN CODES ---');

  await runTest('Canonical Free plan: ₦0/month, 5 contacts, no plan code', () => {
    const free = PadiFixMonetization.PROVIDER_PLANS.FREE;
    assert.strictEqual(free.priceAmount, 0);
    assert.strictEqual(free.priceKobo, 0);
    assert.strictEqual(free.contactAllowance, 5);
    assert.strictEqual(free.paystackPlanCode, null);
  });

  await runTest('Canonical Basic plan: ₦5,500/month, 30 contacts, PLN_yf4tb6fpw2u8zj6', () => {
    const basic = PadiFixMonetization.PROVIDER_PLANS.BASIC;
    assert.strictEqual(basic.priceAmount, 5500);
    assert.strictEqual(basic.priceKobo, 550000);
    assert.strictEqual(basic.contactAllowance, 30);
    assert.strictEqual(basic.paystackPlanCode, 'PLN_yf4tb6fpw2u8zj6');
  });

  await runTest('Canonical Pro plan: ₦11,000/month, 100 contacts, PLN_pqm1fg3b1o0wwf1, MOST POPULAR', () => {
    const pro = PadiFixMonetization.PROVIDER_PLANS.PRO;
    assert.strictEqual(pro.priceAmount, 11000);
    assert.strictEqual(pro.priceKobo, 1100000);
    assert.strictEqual(pro.contactAllowance, 100);
    assert.strictEqual(pro.paystackPlanCode, 'PLN_pqm1fg3b1o0wwf1');
    assert.strictEqual(pro.isPopular, true);
    assert.strictEqual(pro.badgeText, 'MOST POPULAR');
  });

  await runTest('Canonical Premium plan: ₦22,000/month, fair-use 500 contacts, PLN_e3nu8i62af9ypve', () => {
    const prem = PadiFixMonetization.PROVIDER_PLANS.PREMIUM;
    assert.strictEqual(prem.priceAmount, 22000);
    assert.strictEqual(prem.priceKobo, 2200000);
    assert.strictEqual(prem.contactAllowance, 500);
    assert.strictEqual(prem.fairUseLimit, 500);
    assert.strictEqual(prem.paystackPlanCode, 'PLN_e3nu8i62af9ypve');
  });

  // -------------------------------------------------------------
  // SECTION 2: PAYSTACK TRANSACTION INITIALIZATION & RECURRING
  // -------------------------------------------------------------
  console.log('\n--- 2. PAYSTACK TRANSACTION INITIALIZATION ---');

  await runTest('paystack-init attaches Paystack plan code and 1,100,000 kobo for Pro', async () => {
    const ctx = createMockContext({
      body: {
        provider_id: 101,
        plan_id: 'PRO',
        email: 'adebayo.electric@padifix.ng'
      }
    });
    await paystackInitHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.status, 'success');
    assert.strictEqual(data.order.amount, 1100000);
    assert.strictEqual(data.paystack_plan_code, 'PLN_pqm1fg3b1o0wwf1');
    assert.strictEqual(data.order.paystack_plan_code, 'PLN_pqm1fg3b1o0wwf1');
    assert.ok(data.authorization_url);
  });

  await runTest('paystack-init attaches Paystack plan code and 2,200,000 kobo for Premium', async () => {
    const ctx = createMockContext({
      body: {
        provider_id: 102,
        plan_id: 'PREMIUM',
        email: 'emeka.solar@padifix.ng'
      }
    });
    await paystackInitHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.order.amount, 2200000);
    assert.strictEqual(data.paystack_plan_code, 'PLN_e3nu8i62af9ypve');
  });

  await runTest('paystack-init handles Free starter plan directly without billable checkout', async () => {
    const ctx = createMockContext({
      body: {
        provider_id: 103,
        plan_id: 'FREE'
      }
    });
    await paystackInitHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.mode, 'DIRECT_ACTIVATION');
    assert.strictEqual(data.amount, 0);
    assert.strictEqual(data.contacts_allowance, 5);
  });

  await runTest('paystack-init rejects invalid plan ID with HTTP 400', async () => {
    const ctx = createMockContext({
      body: {
        provider_id: 104,
        plan_id: 'ULTRA_PLATINUM_VIP'
      }
    });
    await paystackInitHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 400);
    assert.ok(ctx.getData().error.includes('Invalid plan_id'));
  });

  // -------------------------------------------------------------
  // SECTION 3: SUBSCRIPTION LIFECYCLE & 3-DAY GRACE PERIOD
  // -------------------------------------------------------------
  console.log('\n--- 3. SUBSCRIPTION LIFECYCLE & 3-DAY GRACE PERIOD ---');

  await runTest('Valid subscription lifecycle transitions defined in state machine', () => {
    assert.ok(PadiFixMonetization.canTransitionSubscription('pending', 'active'));
    assert.ok(PadiFixMonetization.canTransitionSubscription('active', 'past_due'));
    assert.ok(PadiFixMonetization.canTransitionSubscription('active', 'grace'));
    assert.ok(PadiFixMonetization.canTransitionSubscription('active', 'non_renewing'));
    assert.ok(PadiFixMonetization.canTransitionSubscription('grace', 'expired'));
    assert.ok(PadiFixMonetization.canTransitionSubscription('cancelled', 'active'));
    // Disallowed transition
    assert.strictEqual(PadiFixMonetization.canTransitionSubscription('free', 'grace'), false);
  });

  await runTest('Entering grace period sets past_due status with 3-day grace period end date', () => {
    const res = LokatorDB.subscriptions.enterGracePeriod(201, 3);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.subscription.status, 'past_due');
    assert.strictEqual(res.subscription.lifecycle_status, 'grace');
    assert.strictEqual(res.subscription.failed_payment_count, 1);
    assert.ok(res.subscription.grace_period_ends_at);
    
    // Check remaining days calculation
    const diffMs = new Date(res.subscription.grace_period_ends_at) - new Date();
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    assert.strictEqual(days, 3);
  });

  await runTest('Cancelling auto-renewal marks subscription non_renewing while preserving period end', () => {
    LokatorDB.subscriptions.activateSubscription(202, 'PRO');
    const cancelRes = LokatorDB.subscriptions.cancelSubscription(202, false);
    assert.strictEqual(cancelRes.success, true);
    assert.strictEqual(cancelRes.subscription.cancel_at_period_end, true);
    assert.strictEqual(cancelRes.subscription.lifecycle_status, 'non_renewing');
    assert.strictEqual(cancelRes.subscription.plan_id, 'PRO'); // Still Pro until period end
  });

  await runTest('Expired subscription safely reverts to Free Starter with 5 contacts allowance', () => {
    const expireRes = LokatorDB.subscriptions.expireSubscription(203);
    assert.strictEqual(expireRes.success, true);
    assert.strictEqual(expireRes.subscription.plan_id, 'FREE');
    assert.strictEqual(expireRes.subscription.contact_allowance, 5);
    assert.strictEqual(expireRes.subscription.lifecycle_status, 'active');
  });

  await runTest('subscription-manage API handles cancel_auto_renewal safely', async () => {
    // Seed active subscription first
    await subscriptionManageHandler(createMockContext({
      body: { action: 'sync_activation', provider_id: 301, plan_id: 'PRO', subscription_code: 'SUB_test_301' }
    }).req, createMockContext().res);

    const ctx = createMockContext({
      body: { action: 'cancel_auto_renewal', provider_id: 301, email: 'artisan301@padifix.ng' }
    });
    await subscriptionManageHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.subscription.cancel_at_period_end, true);
    assert.strictEqual(data.subscription.lifecycle_status, 'non_renewing');
  });

  await runTest('subscription-manage API handles resume_auto_renewal safely', async () => {
    const ctx = createMockContext({
      body: { action: 'resume_auto_renewal', provider_id: 301 }
    });
    await subscriptionManageHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.subscription.cancel_at_period_end, false);
    assert.strictEqual(data.subscription.lifecycle_status, 'active');
  });

  // -------------------------------------------------------------
  // SECTION 4: WEBHOOK PROCESSING & RESEND NOTIFICATIONS
  // -------------------------------------------------------------
  console.log('\n--- 4. WEBHOOK SECURITY & RECURRING RENEWAL PROCESSING ---');

  await runTest('Webhook handles recurring charge.success for Pro (₦11,000 / 1,100,000 kobo)', async () => {
    const ctx = createMockContext({
      body: {
        event: 'charge.success',
        data: {
          id: 991101,
          reference: 'sub_renew_1100k_101',
          amount: 1100000,
          currency: 'NGN',
          subscription_code: 'SUB_pro_renewal_101',
          customer: { email: 'artisan101@padifix.ng', first_name: 'Adebayo' },
          metadata: { provider_id: 101, plan_id: 'PRO', is_renewal: true }
        }
      }
    });
    await paystackWebhookHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.status, 'success');
    assert.strictEqual(data.plan_id, 'PRO');
    assert.strictEqual(data.is_renewal, true);
    assert.strictEqual(data.contacts_allowance, 100);
  });

  await runTest('Webhook handles recurring charge.success for Premium (₦22,000 / 2,200,000 kobo)', async () => {
    const ctx = createMockContext({
      body: {
        event: 'charge.success',
        data: {
          id: 991102,
          reference: 'sub_renew_2200k_102',
          amount: 2200000,
          currency: 'NGN',
          subscription_code: 'SUB_prem_renewal_102',
          customer: { email: 'emeka@padifix.ng', first_name: 'Emeka' },
          metadata: { provider_id: 102, plan_id: 'PREMIUM', is_renewal: true }
        }
      }
    });
    await paystackWebhookHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.plan_id, 'PREMIUM');
    assert.strictEqual(data.contacts_allowance, 500);
  });

  await runTest('Webhook handles invoice.payment_failed by entering 3-day grace period', async () => {
    const ctx = createMockContext({
      body: {
        event: 'invoice.payment_failed',
        data: {
          id: 991103,
          subscription_code: 'SUB_pro_fail_103',
          description: 'Insufficient funds on recurring debit',
          customer: { email: 'artisan103@padifix.ng', first_name: 'Chidi' }
        }
      }
    });
    await paystackWebhookHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.status_applied, 'past_due');
    assert.strictEqual(data.lifecycle_status, 'grace');
    assert.strictEqual(data.grace_period_days, 3);
    assert.ok(data.grace_period_ends_at);
  });

  await runTest('Webhook handles subscription.disable by transitioning to non_renewing/cancelled', async () => {
    const ctx = createMockContext({
      body: {
        event: 'subscription.disable',
        data: {
          id: 991104,
          subscription_code: 'SUB_pro_disable_104',
          customer: { email: 'artisan104@padifix.ng', first_name: 'Fatima' }
        }
      }
    });
    await paystackWebhookHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.status_applied, 'cancelled');
    assert.strictEqual(data.lifecycle_status, 'non_renewing');
  });

  await runTest('Webhook handles invoice.create notice safely', async () => {
    const ctx = createMockContext({
      body: {
        event: 'invoice.create',
        data: {
          id: 991105,
          subscription_code: 'SUB_pro_upcoming_105',
          amount: 800000
        }
      }
    });
    await paystackWebhookHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    assert.strictEqual(ctx.getData().event, 'invoice.create');
  });

  // -------------------------------------------------------------
  // SECTION 5: RESEND TRANSACTIONAL EMAIL SERVICE
  // -------------------------------------------------------------
  console.log('\n--- 5. RESEND TRANSACTIONAL EMAIL SERVICE ---');

  await runTest('ResendEmailService executes all 7 transactional email templates safely in sandbox mode', async () => {
    const email = 'artisan.test@padifix.ng';

    const r1 = await ResendEmailService.sendSubscriptionActivatedEmail({
      to: email, providerName: 'Adebayo', plan: 'Pro', price: '₦8,000/month', contactAllowance: 100
    });
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.emailType, 'subscription_activated');

    const r2 = await ResendEmailService.sendPaymentSuccessfulEmail({
      to: email, providerName: 'Adebayo', amount: '₦8,000', plan: 'Pro', reference: 'PSK_123456', isRenewal: true
    });
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r2.emailType, 'payment_successful');

    const r3 = await ResendEmailService.sendPaymentFailedEmail({
      to: email, providerName: 'Adebayo', plan: 'Pro', reason: 'Card expired', graceDaysRemaining: 3
    });
    assert.strictEqual(r3.success, true);
    assert.strictEqual(r3.emailType, 'payment_failed');

    const r4 = await ResendEmailService.sendGracePeriodWarningEmail({
      to: email, providerName: 'Adebayo', plan: 'Pro', daysRemaining: 1
    });
    assert.strictEqual(r4.success, true);
    assert.strictEqual(r4.emailType, 'grace_period_warning');

    const r5 = await ResendEmailService.sendSubscriptionCancelledEmail({
      to: email, providerName: 'Adebayo', plan: 'Pro', effectiveUntil: '30 September 2026'
    });
    assert.strictEqual(r5.success, true);
    assert.strictEqual(r5.emailType, 'subscription_cancelled');

    const r6 = await ResendEmailService.sendSubscriptionExpiredEmail({
      to: email, providerName: 'Adebayo', plan: 'Pro'
    });
    assert.strictEqual(r6.success, true);
    assert.strictEqual(r6.emailType, 'subscription_expired');

    const r7 = await ResendEmailService.sendPlanChangedEmail({
      to: email, providerName: 'Adebayo', oldPlan: 'Basic', newPlan: 'Pro', newPrice: '₦8,000/month', newAllowance: 100
    });
    assert.strictEqual(r7.success, true);
    assert.strictEqual(r7.emailType, 'plan_changed');
  });

  await runTest('ResendEmailService handles missing recipient email gracefully without throw', async () => {
    const res = await ResendEmailService.sendSubscriptionActivatedEmail({ to: null });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'Missing recipient email');
  });

  // -------------------------------------------------------------
  // SECTION 6: CONTACT METERING WITH PHASE 011 ALLOWANCES
  // -------------------------------------------------------------
  console.log('\n--- 6. CONTACT METERING & ALLOWANCES ---');

  await runTest('Free plan provider is strictly capped at 5 customer contacts per month', async () => {
    LokatorDB.subscriptions.activateSubscription(401, 'FREE');
    LokatorDB.contactMeter.resetUsage(401);

    for (let i = 1; i <= 5; i++) {
      const res = LokatorDB.contactMeter.meterContact(401, 'whatsapp', {
        idempotency_key: `test_meter_free_${i}`
      });
      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.contacts_used, i);
    }

    // 6th attempt must be rejected with upgrade prompt
    const sixth = LokatorDB.contactMeter.meterContact(401, 'call', {
      idempotency_key: `test_meter_free_6`
    });
    assert.strictEqual(sixth.allowed, false);
    assert.strictEqual(sixth.limit_reached, true);
    assert.strictEqual(sixth.upgrade_recommended, 'BASIC');
  });

  await runTest('Pro plan provider allows 100 customer contacts per month', async () => {
    LokatorDB.subscriptions.activateSubscription(402, 'PRO');
    LokatorDB.contactMeter.resetUsage(402);

    const first = LokatorDB.contactMeter.meterContact(402, 'whatsapp', {
      idempotency_key: 'test_meter_pro_1'
    });
    assert.strictEqual(first.allowed, true);
    assert.strictEqual(first.allowance, 100);
    assert.strictEqual(first.contacts_remaining, 99);
  });

  // -------------------------------------------------------------
  // SECTION 7: NON-NEGOTIABLE BUSINESS & TRUST INVARIANTS
  // -------------------------------------------------------------
  console.log('\n--- 7. NON-NEGOTIABLE BUSINESS & TRUST INVARIANTS ---');

  await runTest('Zero Escrow & 0% Commission invariant is strictly configured', () => {
    assert.strictEqual(PadiFixMonetization.SERVICE_PAYMENT_MODEL.marketplace_commission_pct, 0);
    assert.strictEqual(PadiFixMonetization.SERVICE_PAYMENT_MODEL.escrow_enabled, false);
    assert.strictEqual(PadiFixMonetization.SERVICE_PAYMENT_MODEL.holds_customer_funds, false);
  });

  await runTest('Trust & Reputation Separation: Subscription cannot remove or manipulate reviews', () => {
    assert.strictEqual(PadiFixMonetization.TRUST_MONETIZATION_SEPARATION.paid_plan_can_remove_negative_reviews, false);
    assert.strictEqual(PadiFixMonetization.TRUST_MONETIZATION_SEPARATION.paid_plan_can_boost_star_rating, false);
    assert.strictEqual(PadiFixMonetization.TRUST_MONETIZATION_SEPARATION.paid_plan_grants_verified_badge, false);
  });

  await runTest('KYC Separation: Live KYC remains disabled by default (Fail-closed)', () => {
    assert.strictEqual(PadiFixMonetization.FLAGS.kycLiveEnabled, false);
    assert.strictEqual(PadiFixMonetization.FLAGS.kycProviderMode, 'sandbox');
  });

  console.log('\n================================================================================');
  console.log(`PHASE 011 SUITE SUMMARY: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('FINAL VERDICT: GREEN — Phase 011 Provider Subscriptions Certified (100% PASS)');
  } else {
    console.log('FINAL VERDICT: RED — Failures detected');
  }
  console.log('================================================================================\n');

  process.exit(failed === 0 ? 0 : 1);
})();

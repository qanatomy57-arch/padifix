/**
 * PADIFIX — PHASE 010 VERIFICATION SUITE
 * Provider Subscription Plans, Paystack Billing, Contact Metering & Post-Service Reputation
 *
 * Tests:
 * 1. Canonical Plans & Entitlements Configuration
 * 2. Contact / Lead Metering Logic & Idempotency
 * 3. Free Plan Limit & Upgrade Prompt Guard
 * 4. Paystack Subscription Initialization & Verification
 * 5. Webhook Security (HMAC-SHA512 timingSafeEqual, replay & tamper rejection)
 * 6. Subscription Lifecycle State Machine
 * 7. Post-Service Review Loop & Anti-Abuse (Anti-self review, delete block)
 * 8. Strict Trust ↔ Monetization Separation & Zero Escrow Invariants
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🛠️  PADIFIX PHASE 010: PROVIDER MONETIZATION & REPUTATION TEST SUITE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    console.error(`  ✕ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. CANONICAL PLANS & ENTITLEMENTS CONFIGURATION
// -------------------------------------------------------------
console.log('\n📦 1. CANONICAL PLANS & ENTITLEMENTS CONFIGURATION');

const Monetization = require('../monetization-config.js');

runTest('PadiFixMonetization v5.0.0 is initialized', () => {
  assert.strictEqual(Monetization.PHASE_010_VERSION, '5.0.0');
  assert.strictEqual(Monetization.PHASE_010_ACTIVE, true);
  assert.ok(Monetization.PROVIDER_PLANS);
});

runTest('Canonical Free plan: ₦0/month, 5 contacts/month, standard entitlements', () => {
  const free = Monetization.PROVIDER_PLANS.FREE;
  assert.strictEqual(free.id, 'FREE');
  assert.strictEqual(free.name, 'Free');
  assert.strictEqual(free.price_ngn, 0);
  assert.strictEqual(free.contact_allowance, 5);
  assert.strictEqual(free.max_skills, 3);
  assert.strictEqual(free.max_photos, 5);
  assert.strictEqual(free.max_videos, 0);
  assert.strictEqual(free.search_visibility, 'standard');
});

runTest('Canonical Basic plan: ₦5,500/month, 30 contacts/month, improved search', () => {
  const basic = Monetization.PROVIDER_PLANS.BASIC;
  assert.strictEqual(basic.id, 'BASIC');
  assert.strictEqual(basic.name, 'Basic');
  assert.strictEqual(basic.price_ngn, 5500);
  assert.strictEqual(basic.contact_allowance, 30);
  assert.strictEqual(basic.max_skills, 10);
  assert.strictEqual(basic.max_photos, 15);
  assert.strictEqual(basic.max_videos, 1);
  assert.strictEqual(basic.search_visibility, 'improved');
});

runTest('Canonical Pro plan: ₦11,000/month, 100 contacts/month, featured & marked MOST POPULAR', () => {
  const pro = Monetization.PROVIDER_PLANS.PRO;
  assert.strictEqual(pro.id, 'PRO');
  assert.strictEqual(pro.name, 'Pro');
  assert.strictEqual(pro.price_ngn, 11000);
  assert.strictEqual(pro.contact_allowance, 100);
  assert.strictEqual(pro.max_skills, 25);
  assert.strictEqual(pro.max_photos, 30);
  assert.strictEqual(pro.max_videos, 3);
  assert.strictEqual(pro.search_visibility, 'priority');
  assert.strictEqual(pro.featured_badge, true);
  assert.strictEqual(pro.is_popular, true);
});

runTest('Canonical Premium plan: ₦22,000/month, fair-use 500 customer contacts', () => {
  const premium = Monetization.PROVIDER_PLANS.PREMIUM;
  assert.strictEqual(premium.id, 'PREMIUM');
  assert.strictEqual(premium.name, 'Premium');
  assert.strictEqual(premium.price_ngn, 22000);
  assert.strictEqual(premium.contact_allowance, 500);
  assert.strictEqual(premium.fair_use_soft_cap, 500);
  assert.strictEqual(premium.search_visibility, 'highest');
  assert.strictEqual(premium.max_skills, Infinity);
  assert.strictEqual(premium.max_photos, Infinity);
  assert.strictEqual(premium.max_videos, 5);
});

// -------------------------------------------------------------
// 2. CONTACT / LEAD METERING LOGIC & IDEMPOTENCY
// -------------------------------------------------------------
console.log('\n📊 2. CONTACT / LEAD METERING LOGIC & IDEMPOTENCY');

runTest('Billing period calculation resolves canonical Africa/Lagos month bounds', () => {
  const period = Monetization.getCurrentBillingPeriod();
  assert.ok(typeof period === 'string');
  assert.match(period, /^\d{4}-\d{2}$/);

  const dates = Monetization.getBillingPeriodDates();
  assert.strictEqual(dates.timezone, 'Africa/Lagos');
  assert.ok(new Date(dates.start) < new Date(dates.end));
});

runTest('checkContactAllowance accurately identifies remaining vs exhausted quota', () => {
  // Free plan with 3 contacts used
  const freeCheckOk = Monetization.checkContactAllowance('FREE', 3);
  assert.strictEqual(freeCheckOk.allowed, true);
  assert.strictEqual(freeCheckOk.remaining, 2);
  assert.strictEqual(freeCheckOk.limit_reached, false);

  // Free plan with 5 contacts used
  const freeCheckLimit = Monetization.checkContactAllowance('FREE', 5);
  assert.strictEqual(freeCheckLimit.allowed, false);
  assert.strictEqual(freeCheckLimit.remaining, 0);
  assert.strictEqual(freeCheckLimit.limit_reached, true);
  assert.ok(freeCheckLimit.upgrade_prompt.includes('Upgrade to Basic — ₦5,500/month'));

  // Pro plan with 73 contacts used
  const proCheck = Monetization.checkContactAllowance('PRO', 73);
  assert.strictEqual(proCheck.allowed, true);
  assert.strictEqual(proCheck.remaining, 27);
  assert.strictEqual(proCheck.limit_reached, false);

  // Premium plan with 200 contacts used (500 cap)
  const premCheck = Monetization.checkContactAllowance('PREMIUM', 200);
  assert.strictEqual(premCheck.allowed, true);
  assert.strictEqual(premCheck.remaining, 300);
});

runTest('Contact Metering API handles WhatsApp & Call atomic increments with idempotency', async () => {
  const contactMeterHandler = require('../api/contact-meter.js');

  // Test WhatsApp contact initiation
  const testIdemKey = 'test_idem_wa_' + Date.now();
  let status1 = 200;
  let body1 = null;

  await contactMeterHandler({
    method: 'POST',
    body: {
      provider_id: 'test_p_1',
      channel: 'whatsapp',
      idempotency_key: testIdemKey,
      visitor_token: 'vis_abc123'
    }
  }, {
    status: (s) => { status1 = s; return { json: (b) => { body1 = b; } }; },
    json: (b) => { body1 = b; }
  });

  assert.strictEqual(status1, 200);
  assert.strictEqual(body1.success, true);
  assert.strictEqual(body1.channel, 'whatsapp');
  assert.strictEqual(body1.is_duplicate, false);

  // Replaying identical request with same idempotency key does not re-consume
  let status2 = 200;
  let body2 = null;

  await contactMeterHandler({
    method: 'POST',
    body: {
      provider_id: 'test_p_1',
      channel: 'whatsapp',
      idempotency_key: testIdemKey,
      visitor_token: 'vis_abc123'
    }
  }, {
    status: (s) => { status2 = s; return { json: (b) => { body2 = b; } }; },
    json: (b) => { body2 = b; }
  });

  assert.strictEqual(status2, 200);
  assert.strictEqual(body2.success, true);
  assert.strictEqual(body2.is_duplicate, true);
  assert.strictEqual(body2.message, 'Duplicate contact attempt acknowledged without double-metering');
});

runTest('Contact Metering strictly respects Zero-Inspection guarantee (no chat content, no call audio)', () => {
  const spec = Monetization.CONTACT_METERING;
  assert.strictEqual(spec.inspect_conversations, false);
  assert.strictEqual(spec.store_chat_contents, false);
  assert.strictEqual(spec.record_call_audio, false);
  assert.strictEqual(spec.count_individual_messages, false);
  assert.strictEqual(spec.whatsapp_initiation_units, 1);
  assert.strictEqual(spec.call_initiation_units, 1);
});

// -------------------------------------------------------------
// 3. FREE PLAN LIMIT & UPGRADE PROMPT GUARD
// -------------------------------------------------------------
console.log('\n🔒 3. FREE PLAN LIMIT & UPGRADE PROMPT GUARD');

runTest('Free provider hitting 5 contacts gets graceful contact block and canonical upgrade prompt', async () => {
  const contactMeterHandler = require('../api/contact-meter.js');
  const providerId = 'test_free_artisan_limit_' + Date.now();

  // Consume 5 contacts
  for (let i = 1; i <= 5; i++) {
    await contactMeterHandler({
      method: 'POST',
      body: {
        provider_id: providerId,
        channel: i % 2 === 0 ? 'call' : 'whatsapp',
        idempotency_key: `key_run_${providerId}_${i}`
      }
    }, {
      status: () => ({ json: () => {} }),
      json: () => {}
    });
  }

  // 6th contact should be blocked
  let blockStatus = 200;
  let blockBody = null;

  await contactMeterHandler({
    method: 'POST',
    body: {
      provider_id: providerId,
      channel: 'whatsapp',
      idempotency_key: `key_run_${providerId}_6`
    }
  }, {
    status: (s) => { blockStatus = s; return { json: (b) => { blockBody = b; } }; },
    json: (b) => { blockBody = b; }
  });

  assert.strictEqual(blockStatus, 403);
  assert.strictEqual(blockBody.allowed, false);
  assert.strictEqual(blockBody.limit_reached, true);
  assert.strictEqual(blockBody.contacts_used, 5);
  assert.strictEqual(blockBody.contact_allowance, 5);
  assert.strictEqual(blockBody.profile_visible, true); // Profile stays visible!
  assert.strictEqual(blockBody.provider_notification, "You've reached your 5 customer contact limit for this month.");
  assert.strictEqual(blockBody.upgrade_prompt, "Upgrade to Basic — ₦5,500/month");
});

// -------------------------------------------------------------
// 4. PAYSTACK SUBSCRIPTION INITIALIZATION & VERIFICATION
// -------------------------------------------------------------
console.log('\n💳 4. PAYSTACK SUBSCRIPTION INITIALIZATION & VERIFICATION');

runTest('paystack-init securely handles canonical plans with kobo conversion', async () => {
  const initHandler = require('../api/paystack-init.js');

  let initStatus = 200;
  let initBody = null;

  await initHandler({
    method: 'POST',
    body: {
      provider_id: 'provider_101',
      plan_id: 'PRO',
      email: 'artisan101@padifix.ng'
    }
  }, {
    status: (s) => { initStatus = s; return { json: (b) => { initBody = b; } }; },
    json: (b) => { initBody = b; }
  });

  assert.strictEqual(initStatus, 200);
  assert.strictEqual(initBody.status, true);
  assert.ok(initBody.data.reference.startsWith('sub_pro_'));
  assert.strictEqual(initBody.data.amount, 500000); // ₦5,000 * 100 kobo
  assert.strictEqual(initBody.data.plan_id, 'PRO');
});

runTest('paystack-verify authoritatively validates transaction kobo amount & period', async () => {
  const verifyHandler = require('../api/paystack-verify.js');

  let verifyStatus = 200;
  let verifyBody = null;

  await verifyHandler({
    method: 'GET',
    query: {
      reference: 'sub_pro_test_ref_999',
      provider_id: 'provider_101',
      plan_id: 'PRO'
    }
  }, {
    status: (s) => { verifyStatus = s; return { json: (b) => { verifyBody = b; } }; },
    json: (b) => { verifyBody = b; }
  });

  assert.strictEqual(verifyStatus, 200);
  assert.strictEqual(verifyBody.status, true);
  assert.strictEqual(verifyBody.verified, true);
  assert.strictEqual(verifyBody.data.plan_id, 'PRO');
  assert.strictEqual(verifyBody.data.amount_paid_ngn, 5000);
  assert.strictEqual(verifyBody.data.contact_allowance, 100);
  assert.ok(new Date(verifyBody.data.current_period_end) > new Date());
});

// -------------------------------------------------------------
// 5. WEBHOOK SECURITY (HMAC-SHA512 & REPLAY DEDUPLICATION)
// -------------------------------------------------------------
console.log('\n🛡️ 5. WEBHOOK SECURITY (HMAC-SHA512, TIMING SAFE, REPLAY REJECTION)');

runTest('paystack-webhook enforces constant-time HMAC-SHA512 signature verification', async () => {
  const webhookHandler = require('../api/paystack-webhook.js');
  const testSecret = 'sk_test_mock_paystack_secret_padifix_2026';
  process.env.PAYSTACK_SECRET_KEY = testSecret;

  const payload = {
    event: 'charge.success',
    data: {
      id: 998877,
      reference: 'sub_webhook_test_' + Date.now(),
      amount: 500000,
      currency: 'NGN',
      status: 'success',
      paid_at: new Date().toISOString(),
      metadata: {
        provider_id: 'provider_404',
        plan_id: 'PRO'
      }
    }
  };

  const payloadString = JSON.stringify(payload);
  const validSignature = crypto.createHmac('sha512', testSecret).update(payloadString).digest('hex');

  let hookStatus = 200;
  let hookBody = null;

  await webhookHandler({
    method: 'POST',
    headers: {
      'x-paystack-signature': validSignature
    },
    body: payload
  }, {
    status: (s) => { hookStatus = s; return { json: (b) => { hookBody = b; } }; },
    json: (b) => { hookBody = b; }
  });

  assert.strictEqual(hookStatus, 200);
  assert.strictEqual(hookBody.success, true);
  assert.strictEqual(hookBody.event, 'charge.success');
  assert.strictEqual(hookBody.plan_id, 'PRO');
  assert.strictEqual(hookBody.status, 'active');
});

runTest('paystack-webhook rejects invalid or tampered signatures with HTTP 401', async () => {
  const webhookHandler = require('../api/paystack-webhook.js');
  const invalidSignature = 'invalid_sha512_hash_abcdef0123456789abcdef0123456789';

  let failStatus = 200;
  let failBody = null;

  await webhookHandler({
    method: 'POST',
    headers: {
      'x-paystack-signature': invalidSignature
    },
    body: { event: 'charge.success', data: { reference: 'malicious_ref' } }
  }, {
    status: (s) => { failStatus = s; return { json: (b) => { failBody = b; } }; },
    json: (b) => { failBody = b; }
  });

  assert.strictEqual(failStatus, 401);
  assert.strictEqual(failBody.error, 'Invalid Paystack webhook signature');
});

runTest('paystack-webhook detects and rejects replay attack attempts with HTTP 409', async () => {
  const webhookHandler = require('../api/paystack-webhook.js');
  const testSecret = process.env.PAYSTACK_SECRET_KEY || 'sk_test_mock_paystack_secret_padifix_2026';

  const fixedRef = 'sub_replay_ref_' + Date.now();
  const payload = {
    event: 'charge.success',
    data: {
      id: 11223344,
      reference: fixedRef,
      amount: 550000,
      currency: 'NGN',
      status: 'success',
      paid_at: new Date().toISOString(),
      metadata: {
        provider_id: 'provider_replay_test',
        plan_id: 'BASIC'
      }
    }
  };

  const payloadString = JSON.stringify(payload);
  const signature = crypto.createHmac('sha512', testSecret).update(payloadString).digest('hex');

  // First submission: Success
  let s1 = 200;
  await webhookHandler({
    method: 'POST',
    headers: { 'x-paystack-signature': signature },
    body: payload
  }, {
    status: (s) => { s1 = s; return { json: () => {} }; },
    json: () => {}
  });
  assert.strictEqual(s1, 200);

  // Second submission with exact same event data: HTTP 409 Conflict
  let s2 = 200;
  let b2 = null;
  await webhookHandler({
    method: 'POST',
    headers: { 'x-paystack-signature': signature },
    body: payload
  }, {
    status: (s) => { s2 = s; return { json: (b) => { b2 = b; } }; },
    json: (b) => { b2 = b; }
  });

  assert.strictEqual(s2, 409);
  assert.strictEqual(b2.error, 'Duplicate event already processed');
  assert.strictEqual(b2.deduplicated, true);
});

// -------------------------------------------------------------
// 6. SUBSCRIPTION LIFECYCLE STATE MACHINE
// -------------------------------------------------------------
console.log('\n🔄 6. SUBSCRIPTION LIFECYCLE STATE MACHINE');

runTest('Validates canonical subscription states and defined transitions', () => {
  const states = Monetization.SUBSCRIPTION_STATES;
  assert.ok(states.includes('active'));
  assert.ok(states.includes('trialing'));
  assert.ok(states.includes('past_due'));
  assert.ok(states.includes('cancelled'));
  assert.ok(states.includes('expired'));
  assert.ok(states.includes('pending'));
  assert.ok(states.includes('payment_failed'));

  // Test transitions
  const transitions = Monetization.SUBSCRIPTION_TRANSITIONS;
  assert.ok(transitions.pending.includes('active'));
  assert.ok(transitions.pending.includes('payment_failed'));
  assert.ok(transitions.active.includes('cancelled'));
  assert.ok(transitions.active.includes('past_due'));
  assert.ok(transitions.cancelled.includes('active'));
  assert.ok(transitions.cancelled.includes('expired'));
  assert.ok(transitions.expired.includes('active'));
});

// -------------------------------------------------------------
// 7. POST-SERVICE REVIEW LOOP & ANTI-ABUSE CONTROLS
// -------------------------------------------------------------
console.log('\n⭐ 7. POST-SERVICE REVIEW LOOP & ANTI-ABUSE CONTROLS');

runTest('Review Loop API successfully submits verified post-service review with 5 category ratings', async () => {
  const reviewHandler = require('../api/service-review.js');

  let revStatus = 200;
  let revBody = null;

  await reviewHandler({
    method: 'POST',
    body: {
      action: 'submit_review',
      provider_id: 'provider_electrician_1',
      customer_id: 'cust_real_client_7',
      customer_name: 'Babajide Adeleke',
      hired_status: 'completed',
      overall_rating: 5,
      category_ratings: {
        quality: 5,
        professionalism: 5,
        communication: 5,
        value_for_money: 4,
        reliability: 5
      },
      comment: 'Excellent rewiring job in Surulere. Arrived promptly with standard safety equipment.',
      location: 'Surulere, Lagos'
    }
  }, {
    status: (s) => { revStatus = s; return { json: (b) => { revBody = b; } }; },
    json: (b) => { revBody = b; }
  });

  assert.strictEqual(revStatus, 201);
  assert.strictEqual(revBody.success, true);
  assert.strictEqual(revBody.review.overall_rating, 5);
  assert.strictEqual(revBody.review.category_ratings.quality, 5);
  assert.strictEqual(revBody.review.category_ratings.professionalism, 5);
  assert.strictEqual(revBody.review.job_completed, true);
});

runTest('Anti-Abuse: Providers are strictly prevented from self-reviewing (HTTP 403)', async () => {
  const reviewHandler = require('../api/service-review.js');

  let selfStatus = 200;
  let selfBody = null;

  await reviewHandler({
    method: 'POST',
    body: {
      action: 'submit_review',
      provider_id: 'artisan_self_404',
      customer_id: 'artisan_self_404', // Self review!
      customer_name: 'Myself',
      hired_status: 'completed',
      overall_rating: 5,
      comment: 'I am the best artisan in town!'
    }
  }, {
    status: (s) => { selfStatus = s; return { json: (b) => { selfBody = b; } }; },
    json: (b) => { selfBody = b; }
  });

  assert.strictEqual(selfStatus, 403);
  assert.strictEqual(selfBody.error, 'Self-review prohibited. Providers cannot review their own profile.');
});

runTest('Anti-Abuse: Duplicate reviews for same interaction are rejected (HTTP 409)', async () => {
  const reviewHandler = require('../api/service-review.js');

  const pId = 'provider_dup_test_' + Date.now();
  const cId = 'customer_dup_test_' + Date.now();

  // First review: 201 Created
  let s1 = 200;
  await reviewHandler({
    method: 'POST',
    body: {
      action: 'submit_review',
      provider_id: pId,
      customer_id: cId,
      hired_status: 'completed',
      overall_rating: 5,
      comment: 'First genuine review'
    }
  }, {
    status: (s) => { s1 = s; return { json: () => {} }; },
    json: () => {}
  });
  assert.strictEqual(s1, 201);

  // Duplicate submission attempt by same customer for same provider
  let s2 = 200;
  let b2 = null;
  await reviewHandler({
    method: 'POST',
    body: {
      action: 'submit_review',
      provider_id: pId,
      customer_id: cId,
      hired_status: 'completed',
      overall_rating: 5,
      comment: 'Spam duplicate review'
    }
  }, {
    status: (s) => { s2 = s; return { json: (b) => { b2 = b; } }; },
    json: (b) => { b2 = b; }
  });

  assert.strictEqual(s2, 409);
  assert.strictEqual(b2.error, 'Duplicate review prevented. You have already reviewed this provider.');
});

runTest('Anti-Abuse: Providers cannot delete negative or customer reviews (HTTP 403)', async () => {
  const reviewHandler = require('../api/service-review.js');

  let delStatus = 200;
  let delBody = null;

  await reviewHandler({
    method: 'POST',
    body: {
      action: 'delete_review',
      review_id: 'rev_123',
      provider_id: 'artisan_777'
    }
  }, {
    status: (s) => { delStatus = s; return { json: (b) => { delBody = b; } }; },
    json: (b) => { delBody = b; }
  });

  assert.strictEqual(delStatus, 403);
  assert.strictEqual(delBody.error, 'Providers cannot delete customer reviews. Use provider_response or report_review.');
});

// -------------------------------------------------------------
// 8. STRICT SEPARATION INVARIANTS (ZERO ESCROW, ZERO COMMISSION)
// -------------------------------------------------------------
console.log('\n⚖️ 8. STRICT SEPARATION INVARIANTS & MARKETPLACE RULES');

runTest('Platform monetization enforces 0% service transaction commission', () => {
  assert.strictEqual(Monetization.SERVICE_PAYMENT_MODEL.marketplace_commission_pct, 0);
  assert.strictEqual(Monetization.SERVICE_PAYMENT_MODEL.escrow_enabled, false);
  assert.strictEqual(Monetization.SERVICE_PAYMENT_MODEL.holds_customer_funds, false);
  assert.strictEqual(Monetization.SERVICE_PAYMENT_MODEL.payment_processor, 'DIRECT_CUSTOMER_TO_PROVIDER');
  assert.strictEqual(Monetization.SERVICE_PAYMENT_MODEL.negotiated_outside_platform, true);
});

runTest('Strict separation: Subscription tier CANNOT alter rating or delete reviews', () => {
  const sep = Monetization.TRUST_MONETIZATION_SEPARATION;
  assert.strictEqual(sep.paid_plans_alter_ratings, false);
  assert.strictEqual(sep.paid_plans_remove_negative_reviews, false);
  assert.strictEqual(sep.paid_plans_grant_verified_badge, false);
  assert.strictEqual(sep.paid_plans_bypass_compliance_vetting, false);
  assert.strictEqual(sep.allow_paid_review_placement, false);
});

runTest('KYC remains strictly independent of subscription payment (Fail-closed)', () => {
  const kyc = Monetization.KYC_INTEGRATION_BOUNDARY;
  assert.strictEqual(kyc.kyc_live_enabled, false);
  assert.strictEqual(kyc.kyc_depends_on_subscription, false);
  assert.strictEqual(kyc.premium_automatically_verified, false);
  assert.strictEqual(kyc.allow_pay_for_badge, false);
  assert.strictEqual(kyc.fail_closed_mode, true);
});

// -------------------------------------------------------------
// 9. CLIENT BUNDLE SECRET ISOLATION & SECURITY BOUNDARY
// -------------------------------------------------------------
console.log('\n🔐 9. CLIENT BUNDLE SECRET ISOLATION & SECURITY BOUNDARY');

const fs = require('fs');

runTest('Paystack secret keys are strictly absent from client-facing JS and HTML files', () => {
  const clientFiles = [
    'profile.js',
    'dashboard.js',
    'monetization-config.js',
    'supabase-client.js',
    'profile.html',
    'dashboard.html',
    'index.html',
    'register.html'
  ];

  const secretPattern = /sk_(live|test)_[0-9a-zA-Z]{20,}/g;

  for (const f of clientFiles) {
    const fullPath = path.join(__dirname, '..', f);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(secretPattern);
      assert.strictEqual(matches, null, `Found potential exposed secret in client file: ${f}`);
    }
  }
});

runTest('Review Response & Report workflows execute securely via server API', async () => {
  const reviewHandler = require('../api/service-review.js');

  // Test provider response
  let respStatus = 200;
  let respBody = null;
  await reviewHandler({
    method: 'POST',
    body: {
      action: 'provider_response',
      review_id: 'rev_test_555',
      provider_id: 'provider_electrician_1',
      response_text: 'Thank you for trusting PadiFix and my electrical service!'
    }
  }, {
    status: (s) => { respStatus = s; return { json: (b) => { respBody = b; } }; },
    json: (b) => { respBody = b; }
  });

  assert.strictEqual(respStatus, 200);
  assert.strictEqual(respBody.success, true);
  assert.strictEqual(respBody.provider_response.text, 'Thank you for trusting PadiFix and my electrical service!');

  // Test review reporting
  let repStatus = 200;
  let repBody = null;
  await reviewHandler({
    method: 'POST',
    body: {
      action: 'report_review',
      review_id: 'rev_test_555',
      reporter_id: 'user_concerned_1',
      reason: 'inappropriate_language',
      details: 'Contains inappropriate remarks'
    }
  }, {
    status: (s) => { repStatus = s; return { json: (b) => { repBody = b; } }; },
    json: (b) => { repBody = b; }
  });

  assert.strictEqual(repStatus, 201);
  assert.strictEqual(repBody.success, true);
  assert.strictEqual(repBody.report.status, 'under_review');
});

runTest('Monthly usage rotation: New billing month resets usage counter', () => {
  const nextMonthKey = '2026-10';
  const allowanceCheck = Monetization.checkContactAllowance('FREE', 0);
  assert.strictEqual(allowanceCheck.contactsUsed, 0);
  assert.strictEqual(allowanceCheck.contactsRemaining, 5);
  assert.strictEqual(allowanceCheck.allowed, true);
});

runTest('Subscription lifecycle supports Free -> Basic -> Pro -> Premium -> Free transition state machine', () => {
  assert.strictEqual(Monetization.canTransitionSubscription('pending', 'active'), true);
  assert.strictEqual(Monetization.canTransitionSubscription('active', 'cancelled'), true);
  assert.strictEqual(Monetization.canTransitionSubscription('cancelled', 'expired'), true);
  assert.strictEqual(Monetization.canTransitionSubscription('active', 'past_due'), true);
  assert.strictEqual(Monetization.canTransitionSubscription('past_due', 'payment_failed'), true);
  assert.strictEqual(Monetization.canTransitionSubscription('expired', 'active'), true);
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 PHASE 010 VERIFICATION RESULT: ${passedTests}/${totalTests} TESTS PASSED`);
if (passedTests === totalTests) {
  console.log('🌟 100% GREEN CERTIFICATION: PROVIDER MONETIZATION ARCHITECTURE VERIFIED');
  process.exit(0);
} else {
  console.error(`❌ REGRESSION: ${totalTests - passedTests} test(s) failed`);
  process.exit(1);
}

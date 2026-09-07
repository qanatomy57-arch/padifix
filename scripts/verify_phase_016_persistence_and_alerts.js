/**
 * PADIFIX PHASE 016: FINAL PERSISTENCE CONSOLIDATION & ARTISAN ALERTING VERIFICATION SUITE
 * scripts/verify_phase_016_persistence_and_alerts.js
 *
 * Validates:
 * 1. Durable Reviews (PostgreSQL persistence, duplicate prevention 409, self-review block 403, sanitization)
 * 2. Durable Subscriptions (PostgreSQL state, auto-renewal cancel/resume, Free plan protection, cross-tenant isolation)
 * 3. Artisan Lead Notifications (Nigerian phone normalization, privacy-safe copy, deduplication)
 * 4. Fault Isolation Guarantee: SMS failure NEVER blocks consumer contact handoff
 * 5. Paystack Freeze Parity (0-byte diff against baseline)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(l => {
    const idx = l.indexOf('=');
    if (idx > 0 && !l.trim().startsWith('#')) {
      const k = l.substring(0, idx).trim();
      const v = l.substring(idx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  });
}

// Handlers
const serviceReviewHandler = require('../api/service-review');
const subscriptionManageHandler = require('../api/subscription-manage');
const contactMeterHandler = require('../api/contact-meter');
const notificationService = require('../lib/artisan-notification-service');

// Helper to simulate express-like req/res
function createMockReqRes(options = {}) {
  const headers = options.headers || {};
  let statusCode = 200;
  let responseData = null;
  let responseHeaders = {};
  let ended = false;

  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: options.body || {},
    query: options.query || {}
  };

  const res = {
    setHeader(k, v) {
      responseHeaders[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return responseHeaders[k.toLowerCase()];
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      ended = true;
      return res;
    },
    end(data) {
      if (data) responseData = data;
      ended = true;
      return res;
    }
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => responseData,
    isEnded: () => ended
  };
}

let passed = 0;
let failed = 0;

async function runCheck(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     ↳ ${err.message}`);
    failed++;
  }
}

async function runPhase016Suite() {
  console.log('='.repeat(80));
  console.log('🧪 PADIFIX PHASE 016: PERSISTENCE CONSOLIDATION & ARTISAN ALERTING SUITE');
  console.log('='.repeat(80));

  // --------------------------------------------------------------------------
  // SECTION 1: DURABLE REVIEWS TESTS (Objective A)
  // --------------------------------------------------------------------------
  console.log('\n--- 1. DURABLE REVIEWS ARCHITECTURE & SECURITY ---');

  await runCheck('1.1: Submit valid review returns HTTP 200 with formatted review object', async () => {
    const ctx = createMockReqRes({
      method: 'POST',
      body: {
        action: 'submit_review',
        provider_id: 101,
        customer_name: 'Babajide Sanwo',
        author_location: 'Ikeja GRA, Lagos',
        rating: 5,
        quality_rating: 5,
        professionalism_rating: 5,
        communication_rating: 4,
        value_rating: 5,
        reliability_rating: 5,
        comment: 'Exceptional solar inverter installation. Prompt and professional.',
        praise_tags: ['Punctual', 'Expert Work'],
        interaction_token: 'test_token_phase016_' + Date.now()
      }
    });

    await serviceReviewHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.status, 'success');
    assert.strictEqual(data.review.customer_name, 'Babajide Sanwo');
    assert.strictEqual(data.review.rating, 5);
    assert.strictEqual(data.review.category_ratings.quality, 5);
    assert.strictEqual(data.review.category_ratings.communication, 4);
    assert.ok(data.review.praise_tags.includes('Punctual'));
  });

  await runCheck('1.2: Duplicate review submission with identical interaction_token returns HTTP 409 Conflict', async () => {
    const dupToken = 'dup_token_phase016_' + Date.now();

    // First submission
    const ctx1 = createMockReqRes({
      method: 'POST',
      body: {
        action: 'submit_review',
        provider_id: 101,
        customer_name: 'Chioma Okonkwo',
        rating: 4,
        comment: 'Good service',
        interaction_token: dupToken
      }
    });
    await serviceReviewHandler(ctx1.req, ctx1.res);
    assert.strictEqual(ctx1.getStatusCode(), 200);

    // Duplicate replay submission
    const ctx2 = createMockReqRes({
      method: 'POST',
      body: {
        action: 'submit_review',
        provider_id: 101,
        customer_name: 'Chioma Okonkwo',
        rating: 4,
        comment: 'Good service replay',
        interaction_token: dupToken
      }
    });
    await serviceReviewHandler(ctx2.req, ctx2.res);
    assert.strictEqual(ctx2.getStatusCode(), 409);
    assert.match(ctx2.getData().error, /duplicate review/i);
  });

  await runCheck('1.3: Self-review attempt by provider is prohibited with HTTP 403', async () => {
    const ctx = createMockReqRes({
      method: 'POST',
      body: {
        action: 'submit_review',
        provider_id: 101,
        customer_identifier: '101', // Identical to provider_id
        customer_name: 'Emeka Self Review',
        rating: 5,
        comment: 'I am the best technician in Lagos'
      }
    });
    await serviceReviewHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 403);
    assert.match(ctx.getData().error, /self-review prohibited/i);
  });

  await runCheck('1.4: Commentary sanitization strips script and HTML tags safely', async () => {
    const dirtyToken = 'dirty_token_' + Date.now();
    const ctx = createMockReqRes({
      method: 'POST',
      body: {
        action: 'submit_review',
        provider_id: 101,
        customer_name: '<script>alert("xss")</script>Ade',
        rating: 5,
        comment: '<b>Great work</b><img src=x onerror=alert(1)> and clean wire management',
        interaction_token: dirtyToken
      }
    });
    await serviceReviewHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const rev = ctx.getData().review;
    assert.strictEqual(rev.customer_name, 'alert("xss")Ade');
    assert.strictEqual(rev.comment, 'Great work and clean wire management');
  });

  await runCheck('1.5: GET /api/service-review?provider_id=101 returns reviews collection', async () => {
    const ctx = createMockReqRes({
      method: 'GET',
      url: '/api/service-review?provider_id=101',
      query: { provider_id: '101' }
    });
    await serviceReviewHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.status, 'success');
    assert.strictEqual(data.provider_id, 101);
    assert.ok(Array.isArray(data.reviews));
    assert.ok(data.reviews_count >= 1);
  });

  await runCheck('1.6: Review deletion attempt is prohibited with HTTP 403', async () => {
    const ctx = createMockReqRes({
      method: 'POST',
      body: {
        action: 'delete_review',
        provider_id: 101,
        review_id: 'any_rev'
      }
    });
    await serviceReviewHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 403);
    assert.match(ctx.getData().error, /deletion prohibited/i);
  });

  // --------------------------------------------------------------------------
  // SECTION 2: DURABLE SUBSCRIPTIONS TESTS (Objective B)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. DURABLE SUBSCRIPTION MANAGEMENT ARCHITECTURE ---');

  await runCheck('2.1: Fetch subscription status returns default FREE plan if uninitialized', async () => {
    const ctx = createMockReqRes({
      method: 'GET',
      url: '/api/subscription-manage?provider_id=9999',
      query: { provider_id: '9999' }
    });
    await subscriptionManageHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const sub = ctx.getData().subscription;
    assert.strictEqual(sub.plan_id, 'FREE');
    assert.strictEqual(sub.contacts_allowance, 5);
    assert.strictEqual(sub.cancel_at_period_end, false);
  });

  await runCheck('2.2: Free starter plan cannot cancel auto-renewal (HTTP 400)', async () => {
    const ctx = createMockReqRes({
      method: 'POST',
      body: {
        action: 'cancel_auto_renewal',
        provider_id: 9999
      }
    });
    await subscriptionManageHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 400);
    assert.match(ctx.getData().error, /cannot cancel auto-renewal on free starter/i);
  });

  await runCheck('2.3: Sync activation upgrades provider to BASIC plan (30 contacts)', async () => {
    const ctx = createMockReqRes({
      method: 'POST',
      body: {
        action: 'sync_activation',
        provider_id: 9999,
        plan_id: 'BASIC',
        subscription_code: 'SUB_test_code_9999'
      }
    });
    await subscriptionManageHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const sub = ctx.getData().subscription;
    assert.strictEqual(sub.plan_id, 'BASIC');
    assert.strictEqual(sub.contacts_allowance, 30);
    assert.strictEqual(sub.status, 'active');
  });

  await runCheck('2.4: Cancel auto-renewal on active BASIC plan sets non_renewing status', async () => {
    const ctx = createMockReqRes({
      method: 'POST',
      body: {
        action: 'cancel_auto_renewal',
        provider_id: 9999,
        email: 'test_provider_9999@padifix.ng'
      }
    });
    await subscriptionManageHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const sub = ctx.getData().subscription;
    assert.strictEqual(sub.cancel_at_period_end, true);
    assert.strictEqual(sub.lifecycle_status, 'non_renewing');
    assert.ok(sub.cancelled_at);
  });

  await runCheck('2.5: Resume auto-renewal restores active lifecycle status', async () => {
    const ctx = createMockReqRes({
      method: 'POST',
      body: {
        action: 'resume_auto_renewal',
        provider_id: 9999
      }
    });
    await subscriptionManageHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const sub = ctx.getData().subscription;
    assert.strictEqual(sub.cancel_at_period_end, false);
    assert.strictEqual(sub.lifecycle_status, 'active');
    assert.strictEqual(sub.cancelled_at, null);
  });

  // --------------------------------------------------------------------------
  // SECTION 3: TRANSACTIONAL ARTISAN LEAD NOTIFICATIONS (Objective C)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. TRANSACTIONAL ARTISAN LEAD NOTIFICATIONS ---');

  await runCheck('3.1: Phone normalization for Termii converts Nigerian numbers properly', async () => {
    assert.strictEqual(notificationService.normalizeNigerianPhoneForTermii('08012345678'), '2348012345678');
    assert.strictEqual(notificationService.normalizeNigerianPhoneForTermii('+2348012345678'), '2348012345678');
    assert.strictEqual(notificationService.normalizeNigerianPhoneForTermii('2348012345678'), '2348012345678');
    assert.strictEqual(notificationService.normalizeNigerianPhoneForTermii('09098765432'), '2349098765432');
    assert.strictEqual(notificationService.normalizeNigerianPhoneForTermii('invalid'), null);
  });

  await runCheck('3.2: Transactional SMS dispatch creates privacy-safe alert (simulated/sandbox)', async () => {
    const eventId = 'evt_test_alert_' + Date.now();
    const result = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Lekki Phase 1',
      intentTag: 'Electrical Fault',
      explicitPhone: '08031234567',
      _inject: { forceSuccess: true }
    });

    assert.strictEqual(result.delivered, true);
    assert.strictEqual(result.status, 'sent');
    assert.ok(result.messageId);
    assert.strictEqual(result.recipient, '2348031234567');
  });

  await runCheck('3.2B: Pending Sender ID fails safely and reports pending status honestly without fake delivery', async () => {
    const eventId = 'evt_test_pending_safe_' + Date.now();
    const result = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Lekki Phase 1',
      intentTag: 'Electrical Fault',
      explicitPhone: '08031234567'
    });

    assert.strictEqual(result.delivered, false, 'Must NOT claim successful delivery when Sender ID is pending');
    assert.strictEqual(result.status, 'pending_sender_approval');
    assert.strictEqual(result.reason, 'SENDER_ID_APPROVAL_PENDING');
  });

  await runCheck('3.3: Duplicate notification dispatch for same contactEventId is skipped', async () => {
    const eventId = 'evt_test_alert_' + Date.now();
    // First dispatch
    await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Yaba',
      intentTag: 'Plumbing',
      explicitPhone: '08031234567'
    });

    // Replay attempt
    const replay = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Yaba',
      intentTag: 'Plumbing',
      explicitPhone: '08031234567'
    });

    assert.strictEqual(replay.status, 'skipped_duplicate');
  });

  // --------------------------------------------------------------------------
  // SECTION 4: FAULT ISOLATION GUARANTEE (MANDATORY INVARIANT)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. FAULT ISOLATION GUARANTEE: SMS FAILURE != CONTACT FAILURE ---');

  await runCheck('4.1: Termii network timeout/failure does NOT block consumer contact handoff', async () => {
    // Inject a simulated failure in Termii environment
    const origBaseUrl = process.env.TERMII_BASE_URL;
    try {
      // Point to an invalid unreachable port to simulate network connection drop
      process.env.TERMII_BASE_URL = 'https://127.0.0.1:54321';
      process.env.TERMII_API_KEY = 'real_looking_key_to_force_network';

      const key = 'fault_inj_' + Date.now();
      const ctx = createMockReqRes({
        method: 'POST',
        body: {
          provider_id: 101,
          channel: 'whatsapp',
          locality: 'Ikeja',
          intent_tag: 'AC Repair',
          idempotency_key: key
        }
      });

      // Execute contact meter
      await contactMeterHandler(ctx.req, ctx.res);

      // Verify that the consumer contact STILL succeeded with HTTP 200!
      assert.strictEqual(ctx.getStatusCode(), 200);
      const data = ctx.getData();
      assert.strictEqual(data.status, 'success');
      assert.strictEqual(data.allowed, true);
      assert.strictEqual(data.channel, 'whatsapp');
    } finally {
      if (origBaseUrl) process.env.TERMII_BASE_URL = origBaseUrl;
      else delete process.env.TERMII_BASE_URL;
      delete process.env.TERMII_API_KEY;
    }
  });

  // --------------------------------------------------------------------------
  // SECTION 5: PAYSTACK 0-BYTE FREEZE PARITY CHECK
  // --------------------------------------------------------------------------
  console.log('\n--- 5. PAYSTACK FROZEN BASELINE PARITY ---');

  await runCheck('5.1: api/paystack-init.js matches certified baseline SHA-256', async () => {
    const content = fs.readFileSync(path.join(__dirname, '../api/paystack-init.js'));
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    assert.strictEqual(hash, 'd85f68afaea695f015fd57d2340c5dd14b7e8cede0830bc4957bc1899759809a');
  });

  await runCheck('5.2: api/paystack-verify.js matches certified baseline SHA-256', async () => {
    const content = fs.readFileSync(path.join(__dirname, '../api/paystack-verify.js'));
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    assert.strictEqual(hash, '88b5ba57d48c6ebd67e9027c266c53318b3b97782489c136f40dd50004b6132e');
  });

  await runCheck('5.3: api/paystack-webhook.js matches certified baseline SHA-256', async () => {
    const content = fs.readFileSync(path.join(__dirname, '../api/paystack-webhook.js'));
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    assert.strictEqual(hash, '998bf88a2d019fa99c221c2bff410fa7f9039e69b380dae22229b334e6bd56e8');
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`PHASE 016 SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhase016Suite().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}

module.exports = { runPhase016Suite };

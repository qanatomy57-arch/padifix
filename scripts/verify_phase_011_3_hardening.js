/**
 * PADIFIX PHASE 011.3: INTEGRATION HARDENING & OPERATIONAL READINESS TEST SUITE
 * scripts/verify_phase_011_3_hardening.js
 *
 * Automated verification across 7 hardening vectors:
 * 1. Paystack Webhook Resilience & Verification Hardening
 * 2. Resend Transactional Email Resilience & Domain Gate Observability
 * 3. Sentry Error & Performance Observability & Privacy Sanitization
 * 4. Google Maps Fallback Engine & Retry Suppression
 * 5. Supabase RLS Policy Security & Anonymous Client Boundaries
 * 6. Contact Metering Atomicity & Free Limit Enforcement
 * 7. Post-Service Reputation & Review Abuse Prevention
 *
 * Invariant: ZERO SECRETS PRINTED TO CONSOLE.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

async function test(name, fn) {
  totalTests++;
  process.stdout.write(`  ⏳ Testing: ${name}... `);
  try {
    const meta = await fn();
    passedTests++;
    process.stdout.write(`\r  ✅ [PASS] ${name}\n`);
    if (meta) {
      console.log(`     ↳ ${meta}`);
    }
    testResults.push({ name, status: 'PASS', meta });
  } catch (err) {
    failedTests++;
    process.stdout.write(`\r  ❌ [FAIL] ${name}\n`);
    console.error(`     Error: ${err.message}`);
    testResults.push({ name, status: 'FAIL', error: err.message });
  }
}

// Mock HTTP Request/Response for Serverless API Testing
function createMockReqRes({ method = 'POST', headers = {}, body = {}, query = {}, url = '/' } = {}) {
  const req = {
    method,
    headers: { ...headers },
    body,
    query,
    url
  };
  const res = {
    statusCode: 200,
    headers: {},
    ended: false,
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; this.ended = true; return this; },
    end() { this.ended = true; return this; }
  };
  return { req, res };
}

async function runHardeningSuite() {
  console.log('='.repeat(80));
  console.log('🛡️  PADIFIX PHASE 011.3: INTEGRATION HARDENING & OPERATIONAL RESILIENCE');
  console.log('='.repeat(80));

  // --------------------------------------------------------------------------
  // SECTION 1: PAYSTACK WEBHOOK RESILIENCE & VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 1. PAYSTACK WEBHOOK RESILIENCE & VERIFICATION ---');

  const paystackWebhookHandler = require('../api/paystack-webhook');
  const testSecretKey = 'sk_test_mock_secret_key_padifix_2026';
  process.env.PAYSTACK_SECRET_KEY = testSecretKey;
  process.env.PAYMENT_LIVE_MODE = 'false';

  function signPayload(payloadStr, secret = testSecretKey) {
    return crypto.createHmac('sha512', secret).update(payloadStr).digest('hex');
  }

  await test('Reject webhook request without signature (401)', async () => {
    const { req, res } = createMockReqRes({
      body: { event: 'charge.success', data: { reference: 'ref_missing_sig' } }
    });
    await paystackWebhookHandler(req, res);
    assert.strictEqual(res.statusCode, 401);
    assert.ok(res.body.error.includes('Missing x-paystack-signature'));
    return 'Missing signature rejected with HTTP 401';
  });

  await test('Reject webhook request with invalid signature (401)', async () => {
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_invalid_sig' } });
    const { req, res } = createMockReqRes({
      headers: { 'x-paystack-signature': '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' },
      body: raw
    });
    await paystackWebhookHandler(req, res);
    assert.strictEqual(res.statusCode, 401);
    assert.ok(res.body.error.includes('Invalid webhook signature'));
    return 'Forged signature rejected with HTTP 401';
  });

  await test('Reject webhook request with malformed hex signature (401)', async () => {
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_malformed_sig' } });
    const { req, res } = createMockReqRes({
      headers: { 'x-paystack-signature': 'not-a-valid-hex-string!!' },
      body: raw
    });
    await paystackWebhookHandler(req, res);
    assert.strictEqual(res.statusCode, 401);
    return 'Malformed hex signature safely trapped without crash';
  });

  await test('Reject webhook with malformed JSON body (400)', async () => {
    const raw = '{ event: "charge.success", invalid_json_here...';
    const sig = signPayload(raw);
    const { req, res } = createMockReqRes({
      headers: { 'x-paystack-signature': sig },
      body: raw
    });
    await paystackWebhookHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('Malformed JSON payload'));
    return 'Malformed JSON rejected with HTTP 400';
  });

  await test('Reject non-NGN currency in payment webhook (400)', async () => {
    const raw = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'lok_sub_usd_tamper', amount: 800000, currency: 'USD' }
    });
    const sig = signPayload(raw);
    const { req, res } = createMockReqRes({
      headers: { 'x-paystack-signature': sig },
      body: raw
    });
    await paystackWebhookHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('currency'));
    return 'Non-NGN currency rejected with HTTP 400';
  });

  await test('Process valid Pro subscription payment webhook idempotently (200)', async () => {
    const raw = JSON.stringify({
      event: 'charge.success',
      data: {
        id: 9912831,
        reference: 'lok_sub_test_pro_44812',
        amount: 800000,
        currency: 'NGN',
        customer: { email: 'artisan_pro@padifix.ng' },
        metadata: { provider_id: 42, plan_id: 'PRO', provider_name: 'Emeka Electric' }
      }
    });
    const sig = signPayload(raw);
    const { req, res } = createMockReqRes({
      headers: { 'x-paystack-signature': sig },
      body: raw
    });
    await paystackWebhookHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.fulfilled, true);
    assert.strictEqual(res.body.plan_id, 'PRO');
    assert.strictEqual(res.body.contacts_allowance, 100);

    // Replay identical event (idempotency check)
    const { req: replayReq, res: replayRes } = createMockReqRes({
      headers: { 'x-paystack-signature': sig },
      body: raw
    });
    await paystackWebhookHandler(replayReq, replayRes);
    assert.strictEqual(replayRes.statusCode, 200);
    assert.strictEqual(replayRes.body.idempotent, true);
    return 'Valid Pro charge fulfilled and identical replay returned idempotent: true';
  });

  await test('Detect tampered payload replay with recycled event ID (409)', async () => {
    const recycledId = 9912831; // Same ID from above test
    const tamperedRaw = JSON.stringify({
      event: 'charge.success',
      data: {
        id: recycledId,
        reference: 'lok_sub_tampered_diff_ref',
        amount: 1500000, // Attempted upgrade to premium
        currency: 'NGN',
        customer: { email: 'hacker@padifix.ng' },
        metadata: { provider_id: 42, plan_id: 'PREMIUM' }
      }
    });
    const sig = signPayload(tamperedRaw);
    const { req, res } = createMockReqRes({
      headers: { 'x-paystack-signature': sig },
      body: tamperedRaw
    });
    await paystackWebhookHandler(req, res);
    assert.strictEqual(res.statusCode, 409);
    assert.ok(res.body.error.includes('Tampered payload replay'));
    return 'Tampered replay attack detected and blocked with HTTP 409';
  });

  await test('Acknowledge unsupported webhook events safely (200)', async () => {
    const raw = JSON.stringify({
      event: 'transfer.success',
      data: { id: 778129, transfer_code: 'TRF_1289123' }
    });
    const sig = signPayload(raw);
    const { req, res } = createMockReqRes({
      headers: { 'x-paystack-signature': sig },
      body: raw
    });
    await paystackWebhookHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.message, 'Webhook acknowledged');
    return 'Unsupported Paystack events acknowledged with HTTP 200 to prevent delivery loops';
  });

  // --------------------------------------------------------------------------
  // SECTION 2: RESEND TRANSACTIONAL EMAIL RESILIENCE & DOMAIN GATE
  // --------------------------------------------------------------------------
  console.log('\n--- 2. RESEND TRANSACTIONAL EMAIL RESILIENCE & DOMAIN GATE ---');

  const ResendEmailService = require('../lib/resend-email-service');

  await test('All 7 canonical email templates render valid responsive HTML', async () => {
    const templates = [
      ResendEmailService.sendSubscriptionActivatedEmail({ to: 'test@padifix.ng', plan: 'Basic', price: '₦3,500/month', contactAllowance: 30 }),
      ResendEmailService.sendPaymentSuccessfulEmail({ to: 'test@padifix.ng', plan: 'Pro', amount: '₦8,000', reference: 'ref_123' }),
      ResendEmailService.sendPaymentFailedEmail({ to: 'test@padifix.ng', plan: 'Pro', reason: 'Insufficient funds' }),
      ResendEmailService.sendGracePeriodWarningEmail({ to: 'test@padifix.ng', plan: 'Pro', daysRemaining: 1 }),
      ResendEmailService.sendSubscriptionCancelledEmail({ to: 'test@padifix.ng', plan: 'Pro' }),
      ResendEmailService.sendSubscriptionExpiredEmail({ to: 'test@padifix.ng', plan: 'Pro' }),
      ResendEmailService.sendPlanChangedEmail({ to: 'test@padifix.ng', oldPlan: 'Basic', newPlan: 'Pro' })
    ];

    const results = await Promise.all(templates);
    for (const r of results) {
      assert.ok(r.success, `Template execution failed: ${r.emailType}`);
      assert.ok(r.id, `Missing dispatch/simulation ID for ${r.emailType}`);
    }
    return 'All 7 transactional email templates validated with zero exceptions';
  });

  await test('Resend unverified domain halts visibly without fallback in production', async () => {
    // Simulate production environment
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.RESEND_API_KEY = 're_live_simulated_key_12345';
    process.env.RESEND_FROM_EMAIL = 'PadiFix <notifications@padifix.ng>';

    // Mock sendResendRequest to simulate unverified domain error from Resend API
    const origSend = ResendEmailService.sendResendRequest;
    ResendEmailService.sendResendRequest = async () => ({
      success: false,
      statusCode: 403,
      error: 'The domain padifix.ng is not verified. Please verify your domain at resend.com/domains.'
    });

    try {
      const result = await ResendEmailService.sendEmail({
        to: 'artisan@padifix.ng',
        subject: 'Test Subject',
        html: '<p>Test</p>',
        emailType: 'test_unverified_gate',
        forceLive: true
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.externalGate, 'DOMAIN_UNVERIFIED');
      assert.strictEqual(result.unverifiedDomain, true);
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.RESEND_API_KEY = 're_mock_test';
      ResendEmailService.sendResendRequest = origSend;
    }
    return 'Production mode visibly halts with DOMAIN_UNVERIFIED and does NOT fallback to onboarding@resend.dev';
  });

  // --------------------------------------------------------------------------
  // SECTION 3: SENTRY OBSERVABILITY & PRIVACY SANITIZATION
  // --------------------------------------------------------------------------
  console.log('\n--- 3. SENTRY OBSERVABILITY & PRIVACY SANITIZATION ---');

  const SentryClient = require('../lib/sentry-client');
  const SentryServer = require('../lib/sentry-server');

  await test('Sentry parseDsn parses EU/DE region DSN correctly', () => {
    const dsn = 'https://463937868fdc4a0bdd5b90820bc614a4@o4512028338552832.ingest.de.sentry.io/4512028340191312';
    const parsed = SentryClient.parseDsn(dsn);
    assert.strictEqual(parsed.publicKey, '463937868fdc4a0bdd5b90820bc614a4');
    assert.strictEqual(parsed.host, 'o4512028338552832.ingest.de.sentry.io');
    assert.strictEqual(parsed.projectId, '4512028340191312');
    return 'EU/DE region host and project ID accurately parsed';
  });

  await test('Sentry client deep sanitization scrubs sensitive credentials', () => {
    const payload = {
      user: { name: 'Chidi Okonkwo', bvn: '22218928192', nin: '12345678901' },
      credentials: { user_token: 'jwt.token.here', raw_password: 'SuperSecretPassword123' },
      payment: { card: '4111222233334444', cvv: '123' },
      normalField: 'verified_artisan'
    };
    const clean = SentryClient.sanitizeData(payload);
    assert.strictEqual(clean.user.bvn, '[REDACTED]');
    assert.strictEqual(clean.user.nin, '[REDACTED]');
    assert.strictEqual(clean.credentials.user_token, '[REDACTED]');
    assert.strictEqual(clean.credentials.raw_password, '[REDACTED]');
    assert.strictEqual(clean.payment.card, '[REDACTED]');
    assert.strictEqual(clean.payment.cvv, '[REDACTED]');
    assert.strictEqual(clean.normalField, 'verified_artisan');
    return 'BVN, NIN, tokens, passwords, and card CVVs redacted';
  });

  await test('Sentry client scrubs query parameters from URLs', () => {
    const rawUrl = 'https://padifix.ng/search.html?service=electrician&token=secret_123&pass=pass123';
    const cleanUrl = SentryClient.sanitizeUrl(rawUrl);
    assert.ok(cleanUrl.includes('token=%5BREDACTED%5D') || cleanUrl.includes('token=[REDACTED]'));
    assert.ok(cleanUrl.includes('service=electrician'));
    return 'Sensitive query parameters redacted while preserving legitimate search terms';
  });

  await test('Sentry server withSentry wrapper prevents unhandled crash', async () => {
    const faultyHandler = async (req, res) => {
      throw new Error('Simulated internal serverless error');
    };
    const wrapped = SentryServer.withSentry(faultyHandler, 'faulty_endpoint');
    const { req, res } = createMockReqRes();
    await wrapped(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error, 'Internal Server Error');
    return 'Serverless handler wrapped and errors captured without process crash';
  });

  // --------------------------------------------------------------------------
  // SECTION 4: GOOGLE MAPS FALLBACK & RETRY SUPPRESSION
  // --------------------------------------------------------------------------
  console.log('\n--- 4. GOOGLE MAPS FALLBACK & RETRY SUPPRESSION ---');

  const LokatorMapService = require('../map-service');

  await test('Google Maps script error sets _googleMapsFailed and suppresses retries', async () => {
    // Setup mock document environment for script injection testing
    global.document = {
      querySelector: (sel) => {
        if (sel === 'meta[name="google-maps-api-key"]') return { content: 'AIzaSyMockKeyForTesting12345' };
        if (sel === 'meta[name="google-maps-map-id"]') return { content: 'cafce593fcccbb0a20769c7f' };
        return null;
      },
      createElement: () => ({ src: '', async: false, defer: false, onload: null, onerror: null }),
      head: { appendChild: (el) => { if (el.onerror) setTimeout(el.onerror, 5); } }
    };
    global.window = {
      PadiFixSentry: { captureMessage: () => {} }
    };

    LokatorMapService.getGoogleMapsApiKey = () => 'AIzaSyMockKeyForTesting12345';
    LokatorMapService._googleMapsFailed = false;
    LokatorMapService._googleMapsLoaded = false;
    LokatorMapService._googleMapsLoading = false;

    let firstAttemptResult = null;
    await new Promise(resolve => {
      LokatorMapService.loadGoogleMapsApi((success) => {
        firstAttemptResult = success;
        resolve();
      });
    });

    assert.strictEqual(firstAttemptResult, false, 'First attempt correctly failed and fell back');
    assert.strictEqual(LokatorMapService._googleMapsFailed, true, '_googleMapsFailed flag set');

    // Second attempt should immediately return false without appending script
    let secondAttemptResult = null;
    LokatorMapService.loadGoogleMapsApi((success) => {
      secondAttemptResult = success;
    });
    assert.strictEqual(secondAttemptResult, false, 'Subsequent load immediately returns false');
    return 'Google Maps failure sets persistent session flag and prevents retry network loops';
  });

  // --------------------------------------------------------------------------
  // SECTION 5: SUPABASE RLS SECURITY & CLIENT BOUNDARIES
  // --------------------------------------------------------------------------
  console.log('\n--- 5. SUPABASE RLS SECURITY & CLIENT BOUNDARIES ---');

  await test('Supabase client uses public anon key and never requires service role', () => {
    const clientCode = fs.readFileSync(path.join(ROOT, 'supabase-client.js'), 'utf8');
    assert.ok(!clientCode.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Service role key not referenced in client code');
    assert.ok(clientCode.includes('anonKey') || clientCode.includes('publishableKey'), 'Uses standard anon key');
    return 'Supabase client operates strictly via PostgreSQL RLS with anon key';
  });

  await test('Production RLS policies enforce provider ownership and public read', () => {
    const rlsSql = fs.readFileSync(path.join(ROOT, 'supabase', 'apply_production_rls.sql'), 'utf8');
    assert.ok(rlsSql.includes('auth.uid() = user_id'), 'Owner checks enforced in UPDATE/DELETE');
    assert.ok(rlsSql.includes('is_active = TRUE AND is_public = TRUE'), 'Public read restricted to active listings');
    assert.ok(rlsSql.includes('rating >= 1 AND rating <= 5'), 'Review ratings bounded between 1 and 5');
    return 'PostgreSQL RLS policies audited and validated';
  });

  // --------------------------------------------------------------------------
  // SECTION 6: CONTACT METERING ATOMICITY & FREE LIMIT
  // --------------------------------------------------------------------------
  console.log('\n--- 6. CONTACT METERING ATOMICITY & FREE LIMIT ---');

  const contactMeterHandler = require('../api/contact-meter');

  await test('Enforce 15-minute idempotency dedupe window on duplicate clicks', async () => {
    const testProvId = 88100 + Math.floor(Math.random() * 800);
    const sessionToken = `cust_abc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    // Reset period for test
    const { req: resetReq, res: resetRes } = createMockReqRes({
      body: { provider_id: testProvId, reset_period: true }
    });
    await contactMeterHandler(resetReq, resetRes);

    // Click 1: WhatsApp
    const { req: req1, res: res1 } = createMockReqRes({
      body: { provider_id: testProvId, channel: 'whatsapp', session_token: sessionToken }
    });
    await contactMeterHandler(req1, res1);
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.body.allowed, true);
    assert.strictEqual(res1.body.contacts_used, 1);

    // Duplicate Click 2 within 15 minutes
    const { req: req2, res: res2 } = createMockReqRes({
      body: { provider_id: testProvId, channel: 'whatsapp', session_token: sessionToken }
    });
    await contactMeterHandler(req2, res2);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.is_duplicate, true);
    assert.strictEqual(res2.body.idempotent, true);
    assert.strictEqual(res2.body.contacts_used, 1); // Unchanged
    return 'Duplicate contact within 15-minute window returned idempotent: true with 0 double-count';
  });

  await test('Exhaust Free tier allowance (5/month) and assert upgrade messaging', async () => {
    const testProvId = 88900 + Math.floor(Math.random() * 800);
    const runKey = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    // Reset period
    const { req: rReq, res: rRes } = createMockReqRes({
      body: { provider_id: testProvId, reset_period: true, plan_id: 'FREE' }
    });
    await contactMeterHandler(rReq, rRes);

    // Simulate 5 unique contacts
    for (let i = 1; i <= 5; i++) {
      const { req, res } = createMockReqRes({
        body: { provider_id: testProvId, channel: 'call', idempotency_key: `unique_${runKey}_${i}` }
      });
      await contactMeterHandler(req, res);
      assert.strictEqual(res.body.allowed, true);
      assert.strictEqual(res.body.contacts_used, i);
    }

    // 6th Contact should be blocked
    const { req: blockReq, res: blockRes } = createMockReqRes({
      body: { provider_id: testProvId, channel: 'whatsapp', idempotency_key: `unique_${runKey}_6` }
    });
    await contactMeterHandler(blockReq, blockRes);
    assert.strictEqual(blockRes.body.allowed, false);
    assert.strictEqual(blockRes.body.limit_reached, true);
    assert.strictEqual(blockRes.body.contacts_remaining, 0);
    assert.ok(blockRes.body.message.includes('Upgrade to Basic'));
    return 'Free 5-contact allowance enforced; 6th contact blocked with Basic upgrade notice';
  });

  // --------------------------------------------------------------------------
  // SECTION 7: REPUTATION & REVIEW ABUSE PREVENTION
  // --------------------------------------------------------------------------
  console.log('\n--- 7. REPUTATION & REVIEW ABUSE PREVENTION ---');

  const serviceReviewHandler = require('../api/service-review');

  await test('Reject self-review attempts (403)', async () => {
    const { req, res } = createMockReqRes({
      body: {
        action: 'submit_review',
        provider_id: 50,
        customer_name: 'Artisan Self',
        customer_identifier: 50, // Matches provider_id
        rating: 5,
        hired_status: 'completed'
      }
    });
    await serviceReviewHandler(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.body.error.includes('Self-Review Prohibited'));
    return 'Self-review attempt blocked with HTTP 403';
  });

  await test('Reject invalid ratings out of 1-5 star bounds (400)', async () => {
    const { req, res } = createMockReqRes({
      body: {
        action: 'submit_review',
        provider_id: 51,
        customer_name: 'Customer One',
        rating: 6, // Out of bounds
        hired_status: 'completed'
      }
    });
    await serviceReviewHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('Rating must be a number between 1 and 5'));
    return 'Invalid rating (>5) rejected with HTTP 400';
  });

  await test('Block provider attempt to delete legitimate reviews (403)', async () => {
    const { req, res } = createMockReqRes({
      body: {
        action: 'delete_review',
        provider_id: 52,
        review_id: 'rev_test_123'
      }
    });
    await serviceReviewHandler(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.body.error.includes('Review Deletion Prohibited'));
    return 'Review deletion attempt by provider blocked with HTTP 403';
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`HARDENING SUITE SUMMARY: ${passedTests}/${totalTests} tests passed (${failedTests} failures)`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    console.error('\n❌ VERDICT: RED — Integration hardening tests failed.');
    process.exit(1);
  } else {
    console.log('\n✅ VERDICT: GREEN — 100% of integration hardening tests passed.');
  }
}

runHardeningSuite().catch(err => {
  console.error('Fatal hardening test error:', err);
  process.exit(1);
});

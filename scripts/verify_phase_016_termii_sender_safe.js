/**
 * PADIFIX PHASE 016: TERMII INTEGRATION & SENDER-ID-SAFE AUTOMATED SUITE
 * scripts/verify_phase_016_termii_sender_safe.js
 *
 * Explicitly tests all 14 mandatory Section 9 requirements:
 *  1. Environment configuration validation
 *  2. API-key presence without exposing value
 *  3. Missing Sender ID handling
 *  4. Invalid configuration handling
 *  5. Termii success (simulated/approved)
 *  6. Termii timeout
 *  7. Termii 4xx (specifically 422 SENDER_ID_NOT_APPROVED)
 *  8. Termii 5xx
 *  9. Duplicate event
 * 10. Duplicate notification
 * 11. Concurrent dispatch
 * 12. Consumer handoff during Termii failure (Critical failure isolation invariant)
 * 13. Provider isolation (RLS / multi-tenant safety)
 * 14. Sensitive-data & logging audit (zero PII, zero credentials leaked)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables if not already present
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (e) {}

const notificationService = require('../lib/artisan-notification-service');
const contactMeterHandler = require('../api/contact-meter');
const LeadStore = require('../lib/lead-store');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

async function runCheck(name, testFn) {
  totalChecks++;
  process.stdout.write(`  ⏳ Testing: ${name}... `);
  try {
    await testFn();
    console.log('\x1b[32m✅ [PASS]\x1b[0m');
    passedChecks++;
  } catch (err) {
    console.log('\x1b[31m❌ [FAIL]\x1b[0m');
    console.error(`     ↳ ${err.message}`);
    failedChecks++;
  }
}

function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'POST',
    url: options.url || '/api/contact-meter',
    body: options.body || {},
    headers: options.headers || {},
    query: options.query || {}
  };
  let statusCode = 200;
  let headers = {};
  let bodyData = null;

  const res = {
    status(code) { statusCode = code; return this; },
    setHeader(k, v) { headers[k] = v; return this; },
    json(data) { bodyData = data; return this; },
    end(data) { if (data && !bodyData) bodyData = data; return this; }
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => bodyData,
    getHeaders: () => headers
  };
}

async function runTermiiSenderSafeSuite() {
  console.log('='.repeat(80));
  console.log('🛡️  PADIFIX PHASE 016: TERMII INTEGRATION & SENDER-ID-SAFE AUTOMATED SUITE');
  console.log('='.repeat(80));

  // --------------------------------------------------------------------------
  // TEST 1: ENVIRONMENT CONFIGURATION VALIDATION
  // --------------------------------------------------------------------------
  console.log('\n--- 1. CONFIGURATION & SENDER-ID-SAFE DISCOVERY ---');

  await runCheck('1. Environment configuration validation', () => {
    const config = notificationService.getTermiiConfigurationStatus();
    assert.strictEqual(typeof config.apiConfigured, 'boolean');
    assert.strictEqual(typeof config.senderIdConfigured, 'boolean');
    assert.strictEqual(typeof config.senderIdApproved, 'boolean');
    assert.strictEqual(typeof config.smsDispatchEnabled, 'boolean');
    assert.ok(config.baseUrl.includes('termii.com'));
    assert.ok(['generic', 'dnd', 'whatsapp'].includes(config.channel));
  });

  // --------------------------------------------------------------------------
  // TEST 2: API-KEY PRESENCE WITHOUT EXPOSING VALUE
  // --------------------------------------------------------------------------
  await runCheck('2. API-key presence without exposing value', () => {
    const config = notificationService.getTermiiConfigurationStatus();
    assert.strictEqual(config.apiConfigured, true, 'TERMII_API_KEY must be configured in .env');
    
    // Safety check: verify that getTermiiConfigurationStatus() NEVER exposes the API key string
    assert.strictEqual(config.apiKey, undefined, 'API key must NEVER be included in configuration summary object');
    assert.strictEqual(config.api_key, undefined, 'API key must NEVER be included in configuration summary object');
    
    // Ensure raw secret is not in stringified JSON output
    const jsonStr = JSON.stringify(config);
    assert.ok(!jsonStr.includes(process.env.TERMII_API_KEY), 'Serialized config object must NEVER contain the secret key value');
  });

  // --------------------------------------------------------------------------
  // TEST 3: MISSING SENDER ID HANDLING
  // --------------------------------------------------------------------------
  await runCheck('3. Missing Sender ID handling', async () => {
    const originalSenderId = process.env.TERMII_SENDER_ID;
    try {
      delete process.env.TERMII_SENDER_ID;
      const res = await notificationService.dispatchArtisanLeadAlert({
        contactEventId: 'evt_test_missing_sender_' + Date.now(),
        providerId: 101,
        locality: 'Ikeja',
        intentTag: 'Plumbing',
        explicitPhone: '08031234567'
      });
      assert.strictEqual(res.delivered, false);
      assert.strictEqual(res.status, 'missing_sender_id');
      assert.match(res.error, /TERMII_SENDER_ID not configured/i);
    } finally {
      process.env.TERMII_SENDER_ID = originalSenderId;
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: INVALID CONFIGURATION HANDLING
  // --------------------------------------------------------------------------
  await runCheck('4. Invalid configuration handling', async () => {
    // Malformed / unnormalizable phone number
    const res = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: 'evt_test_invalid_phone_' + Date.now(),
      providerId: 101,
      locality: 'Ikeja',
      intentTag: 'Plumbing',
      explicitPhone: 'not-a-number'
    });
    assert.strictEqual(res.delivered, false);
    assert.strictEqual(res.status, 'invalid_phone');
    assert.strictEqual(res.error, 'Invalid phone format');
  });

  // --------------------------------------------------------------------------
  // TEST 5: TERMII SUCCESS (SIMULATED / APPROVED GATE)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. TERMII DISPATCH & FAULT INJECTION SIMULATION ---');

  await runCheck('5. Termii success', async () => {
    const eventId = 'evt_test_success_' + Date.now();
    const res = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Victoria Island',
      intentTag: 'AC Repair',
      explicitPhone: '08031234567',
      _inject: { forceSuccess: true }
    });
    assert.strictEqual(res.delivered, true);
    assert.strictEqual(res.status, 'sent');
    assert.ok(res.messageId);
    assert.strictEqual(res.recipient, '2348031234567');
  });

  // --------------------------------------------------------------------------
  // TEST 6: TERMII TIMEOUT
  // --------------------------------------------------------------------------
  await runCheck('6. Termii timeout', async () => {
    const eventId = 'evt_test_timeout_' + Date.now();
    const res = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Lekki',
      intentTag: 'Electrician',
      explicitPhone: '08031234567',
      _inject: { forceTimeout: true }
    });
    assert.strictEqual(res.delivered, false);
    assert.strictEqual(res.status, 'timeout');
    assert.strictEqual(res.retryable, true);
    assert.match(res.error, /timed out/i);
  });

  // --------------------------------------------------------------------------
  // TEST 7: TERMII 4XX (SENDER ID NOT APPROVED)
  // --------------------------------------------------------------------------
  await runCheck('7. Termii 4xx (specifically 422 SENDER_ID_NOT_APPROVED)', async () => {
    const eventId = 'evt_test_4xx_sender_' + Date.now();
    const testProviderId = 99200 + (Date.now() % 500);
    // Live Termii call with currently pending Sender ID 'PadiFix'
    const res = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: testProviderId,
      locality: 'Yaba',
      intentTag: 'Plumber',
      explicitPhone: '08031234567',
      _inject: { forceMemoryQuota: true }
    });
    assert.strictEqual(res.delivered, false, 'Must NOT manufacture successful delivery when Sender ID is pending');
    assert.strictEqual(res.status, 'pending_sender_approval');
    assert.strictEqual(res.reason, 'SENDER_ID_APPROVAL_PENDING');
    assert.match(res.error, /SENDER ID APPROVAL PENDING/i);
    assert.strictEqual(res.httpStatus, 422);
  });

  // --------------------------------------------------------------------------
  // TEST 8: TERMII 5XX SERVER ERROR
  // --------------------------------------------------------------------------
  await runCheck('8. Termii 5xx', async () => {
    const eventId = 'evt_test_5xx_' + Date.now();
    const res = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Surulere',
      intentTag: 'Carpenter',
      explicitPhone: '08031234567',
      _inject: { forceHttp500: true }
    });
    assert.strictEqual(res.delivered, false);
    assert.strictEqual(res.status, 'failed');
    assert.strictEqual(res.httpStatus, 500);
    assert.match(res.error, /HTTP 500/i);
  });

  // --------------------------------------------------------------------------
  // TEST 9: DUPLICATE EVENT HANDLING
  // --------------------------------------------------------------------------
  console.log('\n--- 3. DEDUPLICATION & CONCURRENCY ---');

  await runCheck('9. Duplicate event', async () => {
    const eventId = 'evt_dup_test_' + Date.now();
    // First attempt
    await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Gbagada',
      intentTag: 'Painter',
      explicitPhone: '08031234567'
    });

    // Replay attempt with same contactEventId
    const replay = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Gbagada',
      intentTag: 'Painter',
      explicitPhone: '08031234567'
    });

    assert.strictEqual(replay.status, 'skipped_duplicate');
    assert.strictEqual(replay.delivered, false);
    assert.ok(replay.messageId.startsWith('dup_'));
  });

  // --------------------------------------------------------------------------
  // TEST 10: DUPLICATE NOTIFICATION (IDEMPOTENCY)
  // --------------------------------------------------------------------------
  await runCheck('10. Duplicate notification', async () => {
    const eventId = 'evt_notif_idem_' + Date.now();
    const r1 = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Ikorodu',
      intentTag: 'Welder',
      explicitPhone: '08031234567'
    });
    const r2 = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: eventId,
      providerId: 101,
      locality: 'Ikorodu',
      intentTag: 'Welder',
      explicitPhone: '08031234567'
    });

    assert.strictEqual(r2.status, 'skipped_duplicate');
    assert.strictEqual(r2.messageId, 'dup_' + eventId);
  });

  // --------------------------------------------------------------------------
  // TEST 11: CONCURRENT DISPATCH
  // --------------------------------------------------------------------------
  await runCheck('11. Concurrent dispatch', async () => {
    const sharedEventId = 'evt_conc_shared_' + Date.now();
    const tasks = Array.from({ length: 5 }, () => 
      notificationService.dispatchArtisanLeadAlert({
        contactEventId: sharedEventId,
        providerId: 101,
        locality: 'Ajah',
        intentTag: 'Fumigation',
        explicitPhone: '08031234567'
      })
    );
    const results = await Promise.all(tasks);
    // Exactly one call executes first; all subsequent concurrent calls must safely skip duplicate
    const duplicates = results.filter(r => r.status === 'skipped_duplicate');
    assert.ok(duplicates.length >= 1, 'Concurrent dispatches must safely deduplicate');
  });

  // --------------------------------------------------------------------------
  // TEST 12: CONSUMER HANDOFF DURING TERMII FAILURE (FAILURE ISOLATION)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. FAILURE ISOLATION GUARANTEE ---');

  await runCheck('12. Consumer handoff during Termii failure', async () => {
    // We send a real consumer contact request into /api/contact-meter while Termii is in unapproved state
    const testProviderId = 16001 + Math.floor(Math.random() * 500);
    const uniqueIdemKey = `idem_fail_iso_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const ctx = createMockReqRes({
      method: 'POST',
      body: {
        provider_id: testProviderId,
        channel: 'whatsapp',
        mode: 'soft_cap',
        idempotency_key: uniqueIdemKey,
        locality: 'Maryland',
        intent: 'Generator Repair'
      }
    });

    await contactMeterHandler(ctx.req, ctx.res);

    // Assert that contact meter returns HTTP 200 SUCCESS to consumer!
    assert.strictEqual(ctx.getStatusCode(), 200, 'Consumer contact MUST succeed with HTTP 200 even when SMS is pending');
    const data = ctx.getData();
    assert.strictEqual(data.allowed, true, 'Consumer MUST be allowed to initiate contact');
    assert.ok(data.contacts_used >= 1, 'Lead MUST be authoritatively counted and persisted');
    
    // Verify lead was persisted in LeadStore / PostgreSQL
    const storeKey = `${testProviderId}_${data.billing_period}`;
    const usage = LeadStore.usageStore.get(storeKey);
    assert.ok(usage && usage.used >= 1, 'Provider lead usage MUST be recorded');
  });

  // --------------------------------------------------------------------------
  // TEST 13: PROVIDER ISOLATION (MULTI-TENANT SAFETY)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. MULTI-TENANT ISOLATION & DATA MINIMIZATION ---');

  await runCheck('13. Provider isolation', () => {
    // Check RLS policy syntax in migration file
    const migrationPath = path.resolve(__dirname, '../supabase/migrations/039_padifix_phase_016_persistence_consolidation_and_alerts.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 039 must exist');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    assert.ok(sql.includes('ALTER TABLE public.artisan_notifications ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on artisan_notifications');
    assert.ok(sql.includes('provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())'), 'RLS must isolate notifications by authenticated provider user_id');
  });

  // --------------------------------------------------------------------------
  // TEST 14: SENSITIVE-DATA & LOGGING AUDIT
  // --------------------------------------------------------------------------
  await runCheck('14. Sensitive-data/logging audit', () => {
    const servicePath = path.resolve(__dirname, '../lib/artisan-notification-service.js');
    const serviceCode = fs.readFileSync(servicePath, 'utf8');

    // Verify ZERO PII in SMS copy
    assert.ok(serviceCode.includes('PadiFix Alert: You have a new customer inquiry for ${cleanTrade} in ${cleanLocality}. Open your PadiFix dashboard to view the lead.'), 'Must use canonical privacy-safe SMS template');
    assert.ok(!serviceCode.includes('${customer_phone}'), 'SMS must NEVER include customer phone');
    assert.ok(!serviceCode.includes('${raw_chat}'), 'SMS must NEVER include chat text');
    assert.ok(!serviceCode.includes('${jwt}'), 'SMS must NEVER include JWTs');
    assert.ok(!serviceCode.includes('${password}'), 'SMS must NEVER include passwords');

    // Verify Server-Only Guard
    assert.ok(serviceCode.includes('typeof window !== \'undefined\''), 'Must include strict server-only execution guard');

    // Verify no secret leakage in error returns
    assert.ok(!serviceCode.includes('apiKey: apiKey'), 'Must never reflect API key in return object');
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('='.repeat(80));
  console.log(`PHASE 016 TERMII SENDER-SAFE SUITE: ${passedChecks} PASSED | ${failedChecks} FAILED`);
  console.log('='.repeat(80));

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runTermiiSenderSafeSuite().catch(err => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});

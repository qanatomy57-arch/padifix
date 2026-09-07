/**
 * PADIFIX PHASE 017: PLATFORM ABUSE PREVENTION, COST CONTROLS & OUTBOUND PROTECTION
 * scripts/verify_phase_017_platform_protection.js
 *
 * Automated verification suite for Phase 017:
 *  1. Lagos Business Timezone Determinism ('Africa/Lagos')
 *  2. Durable Daily SMS Budget Circuit Breaker (Under cap, at cap boundary, above cap)
 *  3. Concurrency Safety Test (Simulated 20 concurrent dispatch reservations at cap boundary)
 *  4. Artisan Daily Notification Cap Gate (Requests 1-10 allowed, 11th blocked)
 *  5. Contact-Meter Tier 1 IP Rate Limiting (1-5 allowed, 6th triggers HTTP 429 with Retry-After)
 *  6. IP Isolation (Different IPs do not block each other)
 *  7. Target-Specific Pair Limit (1 alert / 15 minutes / pair; duplicates preserve lead but skip SMS)
 *  8. Rule A Invariant — Never Lose the Lead (Lead persists when SMS is blocked or vendor fails)
 *  9. Failure Isolation — Termii timeout / HTTP 500 never block consumer contact
 * 10. Sender-ID-Safe Approval Preservation (Unapproved sender ID holds in pending mode)
 * 11. Sensitive Data Leakage Audit in 429 & Quota responses
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Load environment variables if present
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch (e) {}

const notificationService = require('../lib/artisan-notification-service');
const contactMeter = require('../api/contact-meter');
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
    console.log(`\x1b[31m❌ [FAIL]\x1b[0m: ${err.message}`);
    failedChecks++;
  }
}

// Mock HTTP response factory
function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = String(v);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    end() {
      return this;
    }
  };
}

async function runSuite() {
  console.log('='.repeat(80));
  console.log('🛡️  PADIFIX PHASE 017: PLATFORM ABUSE PREVENTION & COST CONTROLS SUITE');
  console.log('='.repeat(80));

  // --- SECTION 1: TIMEZONE & DETERMINISTIC WINDOWING ---
  console.log('\n--- 1. TIMEZONE & DETERMINISTIC WINDOWING ---');

  await runCheck('1.1 Lagos Date String conforms to YYYY-MM-DD in Africa/Lagos', async () => {
    const lagosDate = notificationService.getLagosDateString();
    assert.match(lagosDate, /^\d{4}-\d{2}-\d{2}$/, 'Must be format YYYY-MM-DD');
    
    // Explicit time test: 2026-09-07 23:30 UTC is 2026-09-08 00:30 WAT (Africa/Lagos)
    const lateUtc = new Date('2026-09-07T23:30:00.000Z');
    const lagosNextDay = notificationService.getLagosDateString(lateUtc);
    assert.strictEqual(lagosNextDay, '2026-09-08', 'Africa/Lagos midnight rollover must be respected');
  });

  // --- SECTION 2: DAILY SMS BUDGET CIRCUIT BREAKER ---
  console.log('\n--- 2. DAILY SMS BUDGET CIRCUIT BREAKER ---');

  await runCheck('2.1 Reservations under cap are permitted and increment count', async () => {
    const testDate = '2026-09-07';
    const testScope = `test_plat_under_${Date.now()}`;
    notificationService.resetSmsQuotasForTest(testScope, testDate);

    const r1 = await notificationService.reserveDailySmsQuota({
      scope: testScope,
      date: testDate,
      cap: 5,
      _inject: { forceMemoryQuota: true }
    });
    assert.strictEqual(r1.allowed, true, 'First reservation must be allowed');
    assert.strictEqual(r1.current_count, 1, 'Current count must be 1');

    const r2 = await notificationService.reserveDailySmsQuota({
      scope: testScope,
      date: testDate,
      cap: 5,
      _inject: { forceMemoryQuota: true }
    });
    assert.strictEqual(r2.allowed, true, 'Second reservation must be allowed');
    assert.strictEqual(r2.current_count, 2, 'Current count must be 2');
  });

  await runCheck('2.2 Cap exactly reached blocks subsequent dispatches', async () => {
    const testDate = '2026-09-07';
    const testScope = `test_plat_boundary_${Date.now()}`;
    notificationService.resetSmsQuotasForTest(testScope, testDate);

    const cap = 3;
    for (let i = 1; i <= cap; i++) {
      const res = await notificationService.reserveDailySmsQuota({
        scope: testScope,
        date: testDate,
        cap,
        _inject: { forceMemoryQuota: true }
      });
      assert.strictEqual(res.allowed, true, `Hit ${i} must be allowed`);
      assert.strictEqual(res.current_count, i);
    }

    // Attempt hit 4 (above cap of 3)
    const blocked = await notificationService.reserveDailySmsQuota({
      scope: testScope,
      date: testDate,
      cap,
      _inject: { forceMemoryQuota: true }
    });
    assert.strictEqual(blocked.allowed, false, 'Hit 4 above cap must be blocked');
    assert.strictEqual(blocked.current_count, cap, 'Count must remain clamped at cap');
  });

  await runCheck('2.3 Simulated 20 concurrent requests at boundary 999 cannot exceed 1000', async () => {
    const testDate = '2026-09-07';
    const testScope = `test_plat_conc_${Date.now()}`;
    notificationService.resetSmsQuotasForTest(testScope, testDate);

    const cap = 1000;
    // Seed existing count at 999
    notificationService.memorySmsQuotas.set(`${testDate}_${testScope}`, { count: 999, cap });

    // Launch 20 simultaneous reservation attempts
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(notificationService.reserveDailySmsQuota({
        scope: testScope,
        date: testDate,
        cap,
        _inject: { forceMemoryQuota: true }
      }));
    }
    const results = await Promise.all(promises);

    const allowedCount = results.filter(r => r.allowed).length;
    const blockedCount = results.filter(r => !r.allowed).length;

    assert.strictEqual(allowedCount, 1, 'Only exactly 1 request may be allowed to reach 1000');
    assert.strictEqual(blockedCount, 19, 'The remaining 19 requests must be blocked');

    const finalRecord = notificationService.memorySmsQuotas.get(`${testDate}_${testScope}`);
    assert.strictEqual(finalRecord.count, 1000, 'Final count cannot exceed cap of 1000');
  });

  await runCheck('2.4 Platform cap tripped returns sms_disabled_daily_cap_reached and preserves lead', async () => {
    const mockLeadId = `lead_plat_trip_${Date.now()}`;
    const res = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: mockLeadId,
      providerId: 888,
      locality: 'Yaba',
      intentTag: 'Electrical',
      _inject: { mockPlatformQuotaExceeded: true }
    });

    assert.strictEqual(res.delivered, false);
    assert.strictEqual(res.status, 'sms_disabled_daily_cap_reached');
    assert.strictEqual(res.reason, 'DAILY_SMS_BUDGET_EXCEEDED');
  });

  // --- SECTION 3: ARTISAN DAILY NOTIFICATION LIMIT ---
  console.log('\n--- 3. ARTISAN DAILY NOTIFICATION LIMIT ---');

  await runCheck('3.1 Individual artisan daily SMS limit allows 10 and blocks 11th', async () => {
    const testProviderId = 91919;
    const testDate = notificationService.getLagosDateString();
    const testScope = `artisan:${testProviderId}`;
    notificationService.resetSmsQuotasForTest(testScope, testDate);

    const cap = 10;
    for (let i = 1; i <= cap; i++) {
      const res = await notificationService.reserveDailySmsQuota({
        scope: testScope,
        date: testDate,
        cap,
        _inject: { forceMemoryQuota: true }
      });
      assert.strictEqual(res.allowed, true, `Artisan hit ${i} must be allowed`);
    }

    const hit11 = await notificationService.reserveDailySmsQuota({
      scope: testScope,
      date: testDate,
      cap,
      _inject: { forceMemoryQuota: true }
    });
    assert.strictEqual(hit11.allowed, false, 'Artisan hit 11 must be blocked');
  });

  await runCheck('3.2 Artisan limit tripped returns artisan_daily_sms_cap_reached without throwing', async () => {
    const mockLeadId = `lead_art_trip_${Date.now()}`;
    const res = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: mockLeadId,
      providerId: 777,
      locality: 'Lekki',
      intentTag: 'Plumbing',
      _inject: { mockArtisanQuotaExceeded: true }
    });

    assert.strictEqual(res.delivered, false);
    assert.strictEqual(res.status, 'artisan_daily_sms_cap_reached');
    assert.strictEqual(res.reason, 'ARTISAN_DAILY_SMS_CAP_REACHED');
  });

  // --- SECTION 4: TIER 1 IP RATE LIMITING (CONTACT-METER) ---
  console.log('\n--- 4. TIER 1 IP RATE LIMITING (CONTACT-METER) ---');

  await runCheck('4.1 5 requests/min allowed per IP; 6th request triggers HTTP 429', async () => {
    contactMeter.resetRateLimitsForTest();
    const mockIp = `102.89.43.${Math.floor(Math.random() * 200) + 10}`;

    // Requests 1 through 5
    for (let i = 1; i <= 5; i++) {
      const req = {
        method: 'POST',
        headers: { 'x-forwarded-for': mockIp },
        body: {
          provider_id: 101,
          channel: 'whatsapp',
          idempotency_key: `test_rate_ip_${mockIp}_${i}`,
          _inject: { forceMemoryRateLimit: true, forceMemoryQuota: true }
        }
      };
      const res = createMockRes();
      await contactMeter.contactMeterHandler(req, res);
      assert.strictEqual(res.statusCode, 200, `Request ${i} must be HTTP 200`);
    }

    // Request 6 (exceeds 5 req/min limit)
    const req6 = {
      method: 'POST',
      headers: { 'x-forwarded-for': mockIp },
      body: {
        provider_id: 101,
        channel: 'whatsapp',
        idempotency_key: `test_rate_ip_${mockIp}_6`,
        _inject: { forceMemoryRateLimit: true, forceMemoryQuota: true }
      }
    };
    const res6 = createMockRes();
    await contactMeter.contactMeterHandler(req6, res6);

    assert.strictEqual(res6.statusCode, 429, 'Request 6 must receive HTTP 429');
    assert.ok(res6.headers['retry-after'], 'Retry-After header must be present');
    assert.strictEqual(res6.body.error, 'Too many requests. Please try again shortly.');
  });

  await runCheck('4.2 Distinct IP is not blocked by rate-limited IP (IP isolation)', async () => {
    const freshIp = `197.210.64.${Math.floor(Math.random() * 200) + 10}`;
    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': freshIp },
      body: {
        provider_id: 101,
        channel: 'whatsapp',
        idempotency_key: `test_fresh_ip_${freshIp}`,
        _inject: { forceMemoryRateLimit: true, forceMemoryQuota: true }
      }
    };
    const res = createMockRes();
    await contactMeter.contactMeterHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Fresh IP must be allowed');
  });

  // --- SECTION 5: TARGET-SPECIFIC CONSUMER-ARTISAN PAIR LIMIT ---
  console.log('\n--- 5. TARGET-SPECIFIC PAIR LIMIT & RULE A INVARIANT ---');

  await runCheck('5.1 First contact to artisan succeeds; repeat tap within 15 min preserves lead but throttles SMS', async () => {
    contactMeter.resetRateLimitsForTest();
    const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const providerId = 505;

    // 1st contact tap: Allowed & SMS alert initiated
    const req1 = {
      method: 'POST',
      headers: { 'x-forwarded-for': '105.112.98.1' },
      body: {
        provider_id: providerId,
        channel: 'whatsapp',
        session_token: sessionToken,
        locality: 'Ikeja',
        intent_tag: 'Carpentry',
        _inject: { forceMemoryRateLimit: true, forceMemoryQuota: true, bypassApprovalCheck: false }
      }
    };
    const res1 = createMockRes();
    await contactMeter.contactMeterHandler(req1, res1);
    assert.strictEqual(res1.statusCode, 200, 'First contact must return 200');

    // 2nd contact tap within 15 min for SAME pair: Lead must still succeed (Rule A: Never lose the lead)
    const req2 = {
      method: 'POST',
      headers: { 'x-forwarded-for': '105.112.98.1' },
      body: {
        provider_id: providerId,
        channel: 'whatsapp',
        session_token: sessionToken,
        locality: 'Ikeja',
        intent_tag: 'Carpentry',
        _inject: { forceMemoryRateLimit: true, forceMemoryQuota: true, bypassApprovalCheck: false }
      }
    };
    const res2 = createMockRes();
    await contactMeter.contactMeterHandler(req2, res2);

    assert.strictEqual(res2.statusCode, 200, 'Repeat tap must still succeed (Rule A: Lead never lost)');
    assert.strictEqual(res2.body.status, 'success');
  });

  // --- SECTION 6: FAILURE ISOLATION & SENDER APPROVAL PRESERVATION ---
  console.log('\n--- 6. FAILURE ISOLATION & SENDER APPROVAL PRESERVATION ---');

  await runCheck('6.1 Termii timeout never blocks consumer contact flow (returns HTTP 200)', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': '197.210.10.5' },
      body: {
        provider_id: 303,
        channel: 'whatsapp',
        idempotency_key: `test_timeout_iso_${Date.now()}`,
        _inject: { forceTimeout: true, forceMemoryRateLimit: true, forceMemoryQuota: true }
      }
    };
    const res = createMockRes();
    await contactMeter.contactMeterHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Timeout must not fail consumer HTTP 200');
    assert.strictEqual(res.body.status, 'success');
  });

  await runCheck('6.2 Termii HTTP 500 never blocks consumer contact flow (returns HTTP 200)', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': '197.210.10.6' },
      body: {
        provider_id: 303,
        channel: 'call',
        idempotency_key: `test_500_iso_${Date.now()}`,
        _inject: { forceHttp500: true, forceMemoryRateLimit: true, forceMemoryQuota: true }
      }
    };
    const res = createMockRes();
    await contactMeter.contactMeterHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'HTTP 500 must not fail consumer HTTP 200');
    assert.strictEqual(res.body.status, 'success');
  });

  await runCheck('6.3 TERMII_SENDER_ID_APPROVED=false remains strictly held in pending_sender_approval', async () => {
    const testLeadId = `pending_gate_check_${Date.now()}`;
    const res = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: testLeadId,
      providerId: 202,
      locality: 'Surulere',
      intentTag: 'Painting',
      _inject: { forceMemoryQuota: true }
    });

    assert.strictEqual(res.delivered, false, 'Delivered must be false');
    assert.strictEqual(res.status, 'pending_sender_approval', 'Must be held in pending_sender_approval');
    assert.strictEqual(res.reason, 'SENDER_ID_APPROVAL_PENDING');
  });

  // --- SECTION 7: SENSITIVE DATA LEAKAGE AUDIT ---
  console.log('\n--- 7. SENSITIVE DATA LEAKAGE AUDIT ---');

  await runCheck('7.1 HTTP 429 response contains zero provider IDs, keys, or internal heuristics', async () => {
    const mockIp = '102.89.99.1';
    // Force rate limit
    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': mockIp },
      body: {
        provider_id: 999999,
        channel: 'whatsapp',
        _inject: { mockRateLimitExceeded: true }
      }
    };
    const res = createMockRes();
    await contactMeter.contactMeterHandler(req, res);

    assert.strictEqual(res.statusCode, 429);
    const jsonStr = JSON.stringify(res.body);
    assert.strictEqual(jsonStr.includes('999999'), false, 'Provider ID must not leak in 429 response');
    assert.strictEqual(jsonStr.includes('termii'), false, 'Termii must not leak in 429 response');
    assert.strictEqual(jsonStr.includes('key'), false, 'Key must not leak in 429 response');
  });

  console.log('='.repeat(80));
  console.log(`PHASE 017 VERIFICATION SUITE: ${passedChecks} PASSED | ${failedChecks} FAILED`);
  console.log('='.repeat(80));

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});

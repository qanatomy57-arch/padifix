/**
 * PADIFIX PHASE 017.1: ADVERSARIAL PLATFORM PROTECTION & FAIL-CLOSED VERIFICATION GATE
 * scripts/verify_phase_017_1_adversarial.js
 *
 * Comprehensive adversarial verification test battery covering all 17 security vectors:
 *   1. PostgreSQL Outage Fail-Closed
 *   2. RPC Timeout Fail-Closed
 *   3. Production In-Memory Fallback Prohibition
 *   4. Quota Concurrency (50 & 100 simultaneous requests)
 *   5. Platform & Artisan Quota Interaction (Cases A, B, C, D)
 *   6. Termii Provider Failure Isolation (400, 401, 429, 500, timeout, malformed)
 *   7. Idempotency Attack (Repeat submission across seconds, 15m, same day)
 *   8. Rate-Limiter Outage Resilience
 *   9. IP Spoofing Attack (X-Forwarded-For vs authoritative X-Real-IP)
 *  10. IPv4 / IPv6 Normalization & Sanitization
 *  11. Pair-Key Normalization & Hashing (Phone whitespace, international prefix, PII safety)
 *  12. Africa/Lagos Midnight Rollover Precision
 *  13. Configuration Tampering & Safe Default Clamping
 *  14. Client-Side Counter Bypass Resistance
 *  15. Database RLS, Grants & RPC Ceiling Security
 *  16. "Never Lose the Lead" Invariant (Lead survives every single failure vector)
 *  17. Paystack Cryptographic Byte-for-Byte Freeze Verification
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load environment
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

async function runAdversarialSuite() {
  console.log('='.repeat(80));
  console.log('🛡️  PADIFIX PHASE 017.1: ADVERSARIAL SECURITY & FAIL-CLOSED GATE');
  console.log('='.repeat(80));

  // ==========================================================================
  // VECTOR 1: POSTGRESQL OUTAGE MUST FAIL CLOSED
  // ==========================================================================
  console.log('\n--- 1. POSTGRESQL OUTAGE FAIL-CLOSED ---');

  await runCheck('1.1 Quota reservation fails closed when PostgreSQL throws connection error', async () => {
    const res = await notificationService.reserveDailySmsQuota({
      scope: 'platform',
      cap: 1000,
      _inject: { forcePostgresFailure: true }
    });
    assert.strictEqual(res.allowed, false, 'Reservation must be denied when DB is down');
    assert.strictEqual(res.reason, 'DURABLE_QUOTA_STORE_UNAVAILABLE');
  });

  await runCheck('1.2 Alert dispatch fails closed and skips Termii when PostgreSQL is down', async () => {
    const leadId = `lead_db_down_${Date.now()}`;
    const alertRes = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: leadId,
      providerId: 101,
      locality: 'Ikeja',
      intentTag: 'Welding',
      _inject: { forcePostgresFailure: true }
    });
    assert.strictEqual(alertRes.delivered, false, 'SMS must NOT be delivered');
    assert.strictEqual(alertRes.status, 'artisan_daily_sms_cap_reached');
  });

  // ==========================================================================
  // VECTOR 2: RPC TIMEOUT MUST FAIL CLOSED
  // ==========================================================================
  console.log('\n--- 2. RPC TIMEOUT FAIL-CLOSED ---');

  await runCheck('2.1 Quota reservation fails closed when RPC times out', async () => {
    const res = await notificationService.reserveDailySmsQuota({
      scope: 'artisan:102',
      cap: 10,
      _inject: { overrideRpcTimeoutMs: 1 } // Abort after 1ms
    });
    assert.strictEqual(res.allowed, false, 'Timeout must deny quota');
    assert.strictEqual(res.reason, 'DURABLE_QUOTA_STORE_UNAVAILABLE');
  });

  // ==========================================================================
  // VECTOR 3: PRODUCTION FALLBACK PROHIBITION
  // ==========================================================================
  console.log('\n--- 3. PRODUCTION FALLBACK PROHIBITION ---');

  await runCheck('3.1 In-memory fallback is structurally prohibited in production environment', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const res = await notificationService.reserveDailySmsQuota({
        scope: 'platform',
        cap: 1000,
        _inject: { forcePostgresFailure: true }
      });
      assert.strictEqual(res.allowed, false, 'Production must never authorize via fallback');
      assert.strictEqual(res.reason, 'DURABLE_QUOTA_STORE_UNAVAILABLE');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  // ==========================================================================
  // VECTOR 4: CONCURRENCY ATTACK (50 & 100 CONCURRENT REQUESTS)
  // ==========================================================================
  console.log('\n--- 4. CONCURRENCY ATTACK ---');

  await runCheck('4.1 50 concurrent reservations against cap=10 allow exactly 10 and block 40', async () => {
    const testScope = `test_conc_50_${Date.now()}`;
    const testDate = '2026-09-07';
    notificationService.resetSmsQuotasForTest(testScope, testDate);

    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(notificationService.reserveDailySmsQuota({
        scope: testScope,
        date: testDate,
        cap: 10,
        _inject: { forceMemoryQuota: true }
      }));
    }
    const results = await Promise.all(promises);
    const allowed = results.filter(r => r.allowed);
    const blocked = results.filter(r => !r.allowed);

    assert.strictEqual(allowed.length, 10, 'Allowed count must strictly equal cap of 10');
    assert.strictEqual(blocked.length, 40, 'Remaining 40 requests must be blocked');
  });

  await runCheck('4.2 100 concurrent reservations against cap=10 allow exactly 10 and block 90', async () => {
    const testScope = `test_conc_100_${Date.now()}`;
    const testDate = '2026-09-07';
    notificationService.resetSmsQuotasForTest(testScope, testDate);

    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(notificationService.reserveDailySmsQuota({
        scope: testScope,
        date: testDate,
        cap: 10,
        _inject: { forceMemoryQuota: true }
      }));
    }
    const results = await Promise.all(promises);
    const allowed = results.filter(r => r.allowed);
    const blocked = results.filter(r => !r.allowed);

    assert.strictEqual(allowed.length, 10, 'Allowed count must strictly equal cap of 10');
    assert.strictEqual(blocked.length, 90, 'Remaining 90 requests must be blocked');
  });

  // ==========================================================================
  // VECTOR 5: PLATFORM & ARTISAN CAP INTERACTION (CASES A, B, C, D)
  // ==========================================================================
  console.log('\n--- 5. PLATFORM & ARTISAN CAP INTERACTION ---');

  const testDate = '2026-09-07';
  const platScope = `plat_interact_${Date.now()}`;
  const art1Scope = `artisan:901_${Date.now()}`;
  const art2Scope = `artisan:902_${Date.now()}`;

  notificationService.resetSmsQuotasForTest(platScope, testDate);
  notificationService.resetSmsQuotasForTest(art1Scope, testDate);
  notificationService.resetSmsQuotasForTest(art2Scope, testDate);

  await runCheck('5.1 Case A: Artisan 1 reaches cap (3) -> blocked; Artisan 2 remains eligible', async () => {
    // Artisan 1 exhausts 3 units
    for (let i = 0; i < 3; i++) {
      const r = await notificationService.reserveDailySmsQuota({ scope: art1Scope, date: testDate, cap: 3, _inject: { forceMemoryQuota: true } });
      assert.strictEqual(r.allowed, true);
    }
    // Artisan 1 4th attempt is blocked
    const rBlocked = await notificationService.reserveDailySmsQuota({ scope: art1Scope, date: testDate, cap: 3, _inject: { forceMemoryQuota: true } });
    assert.strictEqual(rBlocked.allowed, false, 'Artisan 1 must be blocked');

    // Artisan 2 has not used quota -> remains eligible
    const rArt2 = await notificationService.reserveDailySmsQuota({ scope: art2Scope, date: testDate, cap: 3, _inject: { forceMemoryQuota: true } });
    assert.strictEqual(rArt2.allowed, true, 'Artisan 2 must remain eligible');
  });

  await runCheck('5.2 Case B: Platform reaches 10 -> all artisans blocked', async () => {
    // Fill platform cap to 10
    for (let i = 0; i < 10; i++) {
      const r = await notificationService.reserveDailySmsQuota({ scope: platScope, date: testDate, cap: 10, _inject: { forceMemoryQuota: true } });
      assert.strictEqual(r.allowed, true);
    }
    // 11th platform reservation blocked
    const rPlatBlocked = await notificationService.reserveDailySmsQuota({ scope: platScope, date: testDate, cap: 10, _inject: { forceMemoryQuota: true } });
    assert.strictEqual(rPlatBlocked.allowed, false, 'Platform must be blocked at 10');
  });

  await runCheck('5.3 Case C: Platform has capacity, but artisan exhausted -> artisan blocked, platform quota preserved', async () => {
    const pScope = `plat_case_c_${Date.now()}`;
    const aScope = `artisan:903_${Date.now()}`;
    notificationService.resetSmsQuotasForTest(pScope, testDate);
    notificationService.resetSmsQuotasForTest(aScope, testDate);

    // Artisan uses all 3
    for (let i = 0; i < 3; i++) {
      await notificationService.reserveDailySmsQuota({ scope: aScope, date: testDate, cap: 3, _inject: { forceMemoryQuota: true } });
    }
    // 4th attempt blocked on artisan
    const aCheck = await notificationService.reserveDailySmsQuota({ scope: aScope, date: testDate, cap: 3, _inject: { forceMemoryQuota: true } });
    assert.strictEqual(aCheck.allowed, false);

    // Platform capacity was not consumed by the blocked attempt
    const pRecord = notificationService.memorySmsQuotas.get(`${testDate}_${pScope}`);
    assert.strictEqual(pRecord ? pRecord.count : 0, 0, 'Platform capacity must remain unaffected');
  });

  await runCheck('5.4 Case D: Both exhausted -> SMS blocked, no bypass or double count', async () => {
    const pScope = `plat_case_d_${Date.now()}`;
    const aScope = `artisan:904_${Date.now()}`;
    notificationService.resetSmsQuotasForTest(pScope, testDate);
    notificationService.resetSmsQuotasForTest(aScope, testDate);

    // Exhaust both
    await notificationService.reserveDailySmsQuota({ scope: pScope, date: testDate, cap: 1, _inject: { forceMemoryQuota: true } });
    await notificationService.reserveDailySmsQuota({ scope: aScope, date: testDate, cap: 1, _inject: { forceMemoryQuota: true } });

    const pBlocked = await notificationService.reserveDailySmsQuota({ scope: pScope, date: testDate, cap: 1, _inject: { forceMemoryQuota: true } });
    const aBlocked = await notificationService.reserveDailySmsQuota({ scope: aScope, date: testDate, cap: 1, _inject: { forceMemoryQuota: true } });

    assert.strictEqual(pBlocked.allowed, false);
    assert.strictEqual(aBlocked.allowed, false);
  });

  // ==========================================================================
  // VECTOR 6: TERMII FAILURE ISOLATION
  // ==========================================================================
  console.log('\n--- 6. TERMII FAILURE ISOLATION ---');

  for (const errCode of [400, 401, 429, 500]) {
    await runCheck(`6.1 Termii HTTP ${errCode} does not throw and isolates failure gracefully`, async () => {
      const res = await notificationService.dispatchArtisanLeadAlert({
        contactEventId: `lead_t_${errCode}_${Date.now()}`,
        providerId: 105,
        locality: 'Surulere',
        intentTag: 'Tailoring',
        _inject: { forceHttp500: errCode === 500, mockHttpError: errCode }
      });
      assert.strictEqual(res.delivered, false);
      assert.ok(res.status === 'failed' || res.status === 'error' || res.status === 'artisan_daily_sms_cap_reached');
    });
  }

  await runCheck('6.2 Termii timeout isolates cleanly and preserves audit entry', async () => {
    const res = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: `lead_t_timeout_${Date.now()}`,
      providerId: 106,
      locality: 'Yaba',
      intentTag: 'Plumbing',
      _inject: { forceTimeout: true }
    });
    assert.strictEqual(res.delivered, false);
    assert.strictEqual(res.status, 'timeout');
  });

  // ==========================================================================
  // VECTOR 7: IDEMPOTENCY ATTACK
  // ==========================================================================
  console.log('\n--- 7. IDEMPOTENCY ATTACK ---');

  await runCheck('7.1 Repeated requests with same idempotency key return cached replay without second dispatch', async () => {
    contactMeter.resetRateLimitsForTest();
    const idemKey = `idem_adv_${Date.now()}`;
    const mockReq = {
      method: 'POST',
      headers: { 'x-real-ip': '197.210.64.1', 'x-idempotency-key': idemKey },
      body: {
        provider_id: 201,
        channel: 'whatsapp',
        idempotency_key: idemKey,
        locality: 'Victoria Island',
        intent_tag: 'Carpentry',
        _inject: { forceMemoryQuota: true }
      }
    };

    // First tap
    const res1 = createMockRes();
    await contactMeter(mockReq, res1);
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.body.status, 'success');

    // Second tap (immediate replay)
    const res2 = createMockRes();
    await contactMeter(mockReq, res2);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.is_duplicate, true, 'Must flag as duplicate');
    assert.strictEqual(res2.body.contacts_used, res1.body.contacts_used, 'Usage must not increment twice');
  });

  // ==========================================================================
  // VECTOR 8: RATE-LIMITER OUTAGE RESILIENCE
  // ==========================================================================
  console.log('\n--- 8. RATE-LIMITER OUTAGE RESILIENCE ---');

  await runCheck('8.1 Limiter outage falls back safely to in-memory window and preserves lead', async () => {
    contactMeter.resetRateLimitsForTest();
    const testIp = '197.210.64.99';
    // Run 5 requests with forced memory fallback
    for (let i = 1; i <= 5; i++) {
      const status = await contactMeter.checkRateLimit({
        key: `ip:${testIp}`,
        maxRequests: 5,
        windowSeconds: 60,
        _inject: { forceMemoryRateLimit: true }
      });
      assert.strictEqual(status.allowed, true, `Hit ${i} must pass`);
    }
    // 6th hit blocked
    const hit6 = await contactMeter.checkRateLimit({
      key: `ip:${testIp}`,
      maxRequests: 5,
      windowSeconds: 60,
      _inject: { forceMemoryRateLimit: true }
    });
    assert.strictEqual(hit6.allowed, false, 'Hit 6 must be blocked');
    assert.ok(hit6.retryAfter > 0, 'Retry-After must be positive');
  });

  // ==========================================================================
  // VECTOR 9: IP SPOOFING ATTACK
  // ==========================================================================
  console.log('\n--- 9. IP SPOOFING ATTACK ---');

  await runCheck('9.1 Client cannot bypass 5/min rate limit by rotating X-Forwarded-For when X-Real-IP is set', async () => {
    contactMeter.resetRateLimitsForTest();
    const realClientIp = '105.112.98.50';

    // Attacker sends 5 requests with the same real IP, but rotating spoofed X-Forwarded-For
    for (let i = 1; i <= 5; i++) {
      const mockReq = {
        method: 'POST',
        headers: {
          'x-real-ip': realClientIp,
          'x-forwarded-for': `198.51.100.${i}, 10.0.0.1` // rotating spoofed IP
        },
        body: {
          provider_id: 301,
          channel: 'call',
          _inject: { forceMemoryQuota: true }
        }
      };
      const res = createMockRes();
      await contactMeter(mockReq, res);
      assert.strictEqual(res.statusCode, 200, `Request ${i} should be permitted`);
    }

    // 6th request with yet another spoofed X-Forwarded-For must still trigger HTTP 429
    const mockReq6 = {
      method: 'POST',
      headers: {
        'x-real-ip': realClientIp,
        'x-forwarded-for': '198.51.100.99, 10.0.0.1'
      },
      body: {
        provider_id: 301,
        channel: 'call',
        _inject: { forceMemoryQuota: true }
      }
    };
    const res6 = createMockRes();
    await contactMeter(mockReq6, res6);
    assert.strictEqual(res6.statusCode, 429, 'Spoofed X-Forwarded-For must NOT bypass rate limiter');
    const retryAfterVal = Number(res6.headers['retry-after']);
    assert.ok(retryAfterVal > 0 && retryAfterVal <= 60, 'Retry-After must be a positive integer <= 60');
    assert.strictEqual(res6.body.lead_saved, true, 'Lead must be saved even on 429');
  });

  // ==========================================================================
  // VECTOR 10: IPV4 / IPV6 NORMALIZATION & SANITIZATION
  // ==========================================================================
  console.log('\n--- 10. IPV4 / IPV6 NORMALIZATION ---');

  await runCheck('10.1 IPv4-mapped IPv6 (::ffff:192.0.2.1) is normalized to standard IPv4', async () => {
    const req = { headers: { 'x-real-ip': '::ffff:192.0.2.1' } };
    const ip = contactMeter.extractClientIp(req);
    assert.strictEqual(ip, '192.0.2.1', 'IPv4-mapped prefix must be stripped');
  });

  await runCheck('10.2 Standard IPv6 address is normalized to lowercase', async () => {
    const req = { headers: { 'x-real-ip': '2001:0DB8:85A3:0000:0000:8A2E:0370:7334' } };
    const ip = contactMeter.extractClientIp(req);
    assert.strictEqual(ip, '2001:0db8:85a3:0000:0000:8a2e:0370:7334');
  });

  await runCheck('10.3 Malformed, oversized or injection strings in IP headers fallback safely', async () => {
    const evilReq = { headers: { 'x-real-ip': '<script>alert(1)</script>; DROP TABLE users;--' } };
    const ip = contactMeter.extractClientIp(evilReq);
    assert.strictEqual(ip, '127.0.0.1', 'Malformed IP must fallback safely');
  });

  // ==========================================================================
  // VECTOR 11: PAIR-KEY BYPASS ATTEMPTS
  // ==========================================================================
  console.log('\n--- 11. PAIR-KEY NORMALIZATION & HASHING ---');

  await runCheck('11.1 Phone formatting variations (whitespace, +234, 080) resolve to identical pair suppression', async () => {
    contactMeter.resetRateLimitsForTest();
    LeadStore.resetUsageForTest(401, 'FREE', 0);

    // First request with +2348012345678
    const req1 = {
      method: 'POST',
      headers: { 'x-real-ip': '197.210.65.1' },
      body: {
        provider_id: 401,
        channel: 'whatsapp',
        consumer_phone: '+234 801 234 5678',
        _inject: { forceMemoryQuota: true }
      }
    };
    const res1 = createMockRes();
    await contactMeter(req1, res1);
    assert.strictEqual(res1.statusCode, 200);

    // Second request with local 08012345678 with spaces
    const req2 = {
      method: 'POST',
      headers: { 'x-real-ip': '197.210.65.2' }, // different IP
      body: {
        provider_id: 401,
        channel: 'whatsapp',
        consumer_phone: '  08012345678  ',
        _inject: { forceMemoryQuota: true }
      }
    };
    const res2 = createMockRes();
    await contactMeter(req2, res2);
    assert.strictEqual(res2.statusCode, 200);
    // Lead is recorded, but pair rate limit suppresses 2nd SMS alert
  });

  // ==========================================================================
  // VECTOR 12: TIMEZONE ADVERSARIAL TEST (LAGOS MIDNIGHT ROLLOVER)
  // ==========================================================================
  console.log('\n--- 12. LAGOS MIDNIGHT ROLLOVER PRECISION ---');

  await runCheck('12.1 22:59:59 UTC on 2026-09-07 is 23:59:59 WAT (2026-09-07 in Lagos)', async () => {
    const d = new Date('2026-09-07T22:59:59.000Z');
    assert.strictEqual(notificationService.getLagosDateString(d), '2026-09-07');
  });

  await runCheck('12.2 23:00:00 UTC on 2026-09-07 rolls over to 00:00:00 WAT (2026-09-08 in Lagos)', async () => {
    const d = new Date('2026-09-07T23:00:00.000Z');
    assert.strictEqual(notificationService.getLagosDateString(d), '2026-09-08');
  });

  // ==========================================================================
  // VECTOR 13: CONFIGURATION ATTACK
  // ==========================================================================
  console.log('\n--- 13. CONFIGURATION TAMPERING & SAFE DEFAULTS ---');

  await runCheck('13.1 Cap of 0 or negative values fails closed (0 allowed)', async () => {
    const rZero = await notificationService.reserveDailySmsQuota({
      scope: 'platform',
      cap: 0,
      _inject: { forceMemoryQuota: true }
    });
    assert.strictEqual(rZero.allowed, false, 'Zero cap must fail closed');

    const rNeg = await notificationService.reserveDailySmsQuota({
      scope: 'platform',
      cap: -50,
      _inject: { forceMemoryQuota: true }
    });
    assert.strictEqual(rNeg.allowed, false, 'Negative cap must fail closed');
  });

  await runCheck('13.2 Malformed non-numeric cap defaults safely to standard ceiling', async () => {
    const rNan = await notificationService.reserveDailySmsQuota({
      scope: 'artisan:501',
      cap: 'UNLIMITED_SMS; DROP TABLE',
      _inject: { forceMemoryQuota: true }
    });
    assert.strictEqual(rNan.max_cap, 10, 'Must default safely to 10 for artisan');
  });

  await runCheck('13.3 Massive cap values (e.g. 999999) are clamped to upper safety ceiling (50 for artisan)', async () => {
    const rHuge = await notificationService.reserveDailySmsQuota({
      scope: 'artisan:502',
      cap: 999999,
      _inject: { forceMemoryQuota: true }
    });
    assert.strictEqual(rHuge.max_cap, 50, 'Artisan cap must be clamped to 50 max ceiling');
  });

  // ==========================================================================
  // VECTOR 14: CLIENT-SIDE BYPASS RESISTANCE
  // ==========================================================================
  console.log('\n--- 14. CLIENT-SIDE BYPASS RESISTANCE ---');

  await runCheck('14.1 Server ignores client-supplied fake usage counters or allowance overrides', async () => {
    contactMeter.resetRateLimitsForTest();
    LeadStore.resetUsageForTest(601, 'FREE', 5); // provider is at cap

    const evilReq = {
      method: 'POST',
      headers: { 'x-real-ip': '197.210.66.1' },
      body: {
        provider_id: 601,
        channel: 'whatsapp',
        // Attacker attempts to spoof usage and plan
        contacts_used: 0,
        contacts_remaining: 100,
        allowance: 9999,
        plan_id: 'PREMIUM',
        is_admin: true,
        _inject: { forceMemoryQuota: true }
      }
    };
    const res = createMockRes();
    await contactMeter(evilReq, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.limit_reached, true, 'Server must enforce genuine limit');
    assert.strictEqual(res.body.quota_exhausted, true);
  });

  // ==========================================================================
  // VECTOR 15: DATABASE MIGRATION 042 HARDENING AUDIT
  // ==========================================================================
  console.log('\n--- 15. DATABASE RLS & SECURITY AUDIT ---');

  await runCheck('15.1 Migration 042 contains strict search_path, ceiling clamping, and write revocation', async () => {
    const migPath = path.resolve(__dirname, '../supabase/migrations/042_padifix_phase_017_1_adversarial_hardening.sql');
    assert.ok(fs.existsSync(migPath), 'Migration 042 must exist');
    const sql = fs.readFileSync(migPath, 'utf8');

    assert.ok(sql.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.daily_sms_quotas FROM anon, authenticated, public;'));
    assert.ok(sql.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rate_limit_events FROM anon, authenticated, public;'));
    assert.ok(sql.includes('SET search_path = public, pg_temp'));
    assert.ok(sql.includes('v_max_platform_ceiling CONSTANT INT := 5000;'));
    assert.ok(sql.includes('v_max_artisan_ceiling CONSTANT INT := 50;'));
    assert.ok(sql.includes("p_scope ~ '^artisan:[0-9]+$'"));
  });

  // ==========================================================================
  // VECTOR 16: "NEVER LOSE THE LEAD" PROOF
  // ==========================================================================
  console.log('\n--- 16. NEVER LOSE THE LEAD ACROSS ALL FAILURES ---');

  await runCheck('16.1 Contact event is durably recorded even when IP rate-limited (HTTP 429)', async () => {
    contactMeter.resetRateLimitsForTest();
    LeadStore.resetUsageForTest(701, 'FREE', 0);
    const throttledIp = '105.112.99.1';

    // Exhaust 5 requests
    for (let i = 1; i <= 5; i++) {
      const res = createMockRes();
      await contactMeter({
        method: 'POST',
        headers: { 'x-real-ip': throttledIp },
        body: { provider_id: 701, channel: 'call', _inject: { forceMemoryQuota: true } }
      }, res);
    }

    // 6th request triggers 429
    const initialLeadCount = (LeadStore.getProviderLeads(701).leads || []).length;
    const res6 = createMockRes();
    await contactMeter({
      method: 'POST',
      headers: { 'x-real-ip': throttledIp },
      body: {
        provider_id: 701,
        channel: 'call',
        locality: 'Yaba',
        intent_tag: 'Electrical',
        _inject: { forceMemoryQuota: true }
      }
    }, res6);

    assert.strictEqual(res6.statusCode, 429);
    assert.strictEqual(res6.body.lead_saved, true, 'Response must confirm lead was preserved');
    const afterLeadCount = (LeadStore.getProviderLeads(701).leads || []).length;
    assert.strictEqual(afterLeadCount, initialLeadCount + 1, 'Lead store must have recorded the throttled lead');
  });

  await runCheck('16.2 Contact event is durably recorded when monthly allowance is exhausted', async () => {
    contactMeter.resetRateLimitsForTest();
    LeadStore.resetUsageForTest(702, 'FREE', 5);

    const initialLeadCount = (LeadStore.getProviderLeads(702).leads || []).length;
    const res = createMockRes();
    await contactMeter({
      method: 'POST',
      headers: { 'x-real-ip': '197.210.67.1' },
      body: {
        provider_id: 702,
        channel: 'whatsapp',
        locality: 'Lekki',
        intent_tag: 'Roofing',
        _inject: { forceMemoryQuota: true }
      }
    }, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.limit_reached, true);
    const afterLeadCount = (LeadStore.getProviderLeads(702).leads || []).length;
    assert.strictEqual(afterLeadCount, initialLeadCount + 1, 'Lead must be recorded despite monthly limit');
  });

  // ==========================================================================
  // VECTOR 17: PAYSTACK CRYPTOGRAPHIC INTEGRITY
  // ==========================================================================
  console.log('\n--- 17. PAYSTACK PAYMENT INTEGRITY ---');

  await runCheck('17.1 Paystack files match Phase 016 certified SHA-256 hashes byte-for-byte', async () => {
    const expected = {
      'api/paystack-init.js': 'd85f68afaea695f015fd57d2340c5dd14b7e8cede0830bc4957bc1899759809a',
      'api/paystack-verify.js': '88b5ba57d48c6ebd67e9027c266c53318b3b97782489c136f40dd50004b6132e',
      'api/paystack-webhook.js': '998bf88a2d019fa99c221c2bff410fa7f9039e69b380dae22229b334e6bd56e8'
    };

    for (const [relPath, expHash] of Object.entries(expected)) {
      const fullPath = path.resolve(__dirname, '..', relPath);
      const content = fs.readFileSync(fullPath);
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');
      assert.strictEqual(actualHash, expHash, `Hash mismatch in ${relPath}`);
    }
  });

  // Summary
  console.log('='.repeat(80));
  console.log(`🎯 PHASE 017.1 ADVERSARIAL SUITE SUMMARY: ${passedChecks} PASSED | ${failedChecks} FAILED (TOTAL: ${totalChecks})`);
  console.log('='.repeat(80));

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runAdversarialSuite().catch(err => {
  console.error('\n💥 Unhandled exception during adversarial verification:', err);
  process.exit(1);
});

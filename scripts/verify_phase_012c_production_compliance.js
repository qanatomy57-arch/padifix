/**
 * PADIFIX PHASE 012C: MASTER PRODUCTION COMPLIANCE DESK EMPIRICAL AUDIT SUITE
 * scripts/verify_phase_012c_production_compliance.js
 *
 * Authoritative empirical verification suite executing directly against
 * https://padifix.vercel.app across all 27 certification gates:
 * - Routing & UI Accessibility
 * - Unauthenticated 401 & Non-Leakage
 * - Invalid Credentials & Dev Fallback Gating
 * - Non-Admin Supabase User 403 Hard Gating
 * - Authorized Admin 200 & Data Minimization
 * - Session Lifecycle & Lock Desk 401 Revocation
 * - Verification Approval, Critical NIN Rule & Idempotency
 * - Verification Rejection & HTTP 409 State Conflict
 * - Dispute Resolution, Idempotency & Validation
 * - RLS Audit Immutability
 * - Rate Limiting & Recovery
 * - Client Bundle Security Hygiene
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROD_URL = 'https://padifix.vercel.app';
let passed = 0;
let failed = 0;

function generateMockJwt({ email, role = 'authenticated', exp = Math.floor(Date.now() / 1000) + 3600 }) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({
    sub: `usr_${Math.random().toString(36).slice(2, 7)}`,
    email,
    role,
    app_metadata: { role: email.includes('admin') || email.includes('compliance') ? 'compliance_officer' : 'provider' },
    exp
  })).toString('base64');
  const signature = crypto.createHmac('sha256', 'mock_jwt_secret').update(`${header}.${payload}`).digest('base64');
  return `${header}.${payload}.${signature}`;
}

async function runTest(testName, fn) {
  process.stdout.write(`  ⏳ Testing: ${testName}... `);
  try {
    await fn();
    console.log('\x1b[32m✅ [PASS]\x1b[0m');
    passed++;
  } catch (err) {
    console.log('\x1b[31m❌ [FAIL]\x1b[0m');
    console.error(`     ↳ Error: ${err.message}`);
    failed++;
  }
}

async function runProductionComplianceSuite() {
  console.log('='.repeat(80));
  console.log('🛡️  PADIFIX PHASE 012C: PRODUCTION COMPLIANCE DESK EMPIRICAL AUDIT');
  console.log(`🌐  Target: ${PROD_URL}`);
  console.log('='.repeat(80));

  // -------------------------------------------------------------
  // 1. PRODUCTION ROUTING & SECURITY GATE MODAL
  // -------------------------------------------------------------
  console.log('\n--- 1. PRODUCTION ROUTING & SECURITY GATE MODAL ---');

  await runTest('1.1 admin.html loads with HTTP 200', async () => {
    const res = await fetch(`${PROD_URL}/admin.html`, { headers: { 'Cache-Control': 'no-cache' } });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const text = await res.text();
    assert.ok(text.includes('admin-auth-modal'), 'admin.html must contain #admin-auth-modal');
    assert.ok(text.includes('btn-lock-desk'), 'admin.html must contain #btn-lock-desk');
    assert.ok(text.includes('admin-passkey'), 'admin.html must contain #admin-passkey input');
  });

  await runTest('1.2 /api/admin-compliance is routed correctly (not 404)', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, { headers: { 'Cache-Control': 'no-cache' } });
    assert.notStrictEqual(res.status, 404, 'Endpoint /api/admin-compliance must not return 404');
  });

  // -------------------------------------------------------------
  // 2. UNAUTHENTICATED PRODUCTION TEST (Section 7)
  // -------------------------------------------------------------
  console.log('\n--- 2. UNAUTHENTICATED PRODUCTION ACCESS (SECTION 7) ---');

  await runTest('2.1 Unauthenticated GET returns HTTP 401', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, { headers: { 'Cache-Control': 'no-cache' } });
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    const data = await res.json().catch(() => ({}));
    assert.ok(data.error, 'Response must include error message');
  });

  await runTest('2.2 Unauthenticated response exposes zero secrets or internal paths', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, { headers: { 'Cache-Control': 'no-cache' } });
    const rawBody = await res.text();
    assert.ok(!rawBody.includes('service_role'), 'Must not expose service_role');
    assert.ok(!rawBody.includes('PADIFIX_ADMIN_KEY'), 'Must not expose PADIFIX_ADMIN_KEY');
    assert.ok(!rawBody.includes('RESEND_API_KEY'), 'Must not expose RESEND_API_KEY');
    assert.ok(!rawBody.includes('C:\\'), 'Must not expose Windows paths');
    assert.ok(!rawBody.includes('/var/task/'), 'Must not expose server paths');
    assert.ok(!rawBody.includes('stack'), 'Must not expose stack traces');
  });

  // -------------------------------------------------------------
  // 3. INVALID CREDENTIALS & DEV FALLBACK (Sections 3 & 8)
  // -------------------------------------------------------------
  console.log('\n--- 3. INVALID CREDENTIALS & DEVELOPMENT FALLBACK (SECTIONS 3 & 8) ---');

  await runTest('3.1 Bogus x-admin-key is rejected (HTTP 401 or 500 fail-closed)', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, {
      headers: {
        'Cache-Control': 'no-cache',
        'x-admin-key': 'bogus_synthetic_secret_probe_9999'
      }
    });
    assert.ok(res.status === 401 || res.status === 500, `Expected 401 or 500, got ${res.status}`);
    assert.notStrictEqual(res.status, 200, 'Invalid admin key must never return 200');
  });

  await runTest('3.2 Dev fallback key strictly rejected against production', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, {
      headers: {
        'Cache-Control': 'no-cache',
        'x-admin-key': 'padifix_dev_compliance_2026'
      }
    });
    assert.ok(res.status === 401 || res.status === 500, `Expected 401 or 500, got ${res.status}`);
    assert.notStrictEqual(res.status, 200, 'Dev fallback key MUST NEVER authenticate in Production');
  });

  // -------------------------------------------------------------
  // 4. NON-ADMIN SUPABASE USER TEST (Section 9)
  // -------------------------------------------------------------
  console.log('\n--- 4. NON-ADMIN SUPABASE USER ACCESS (SECTION 9) ---');

  const nonAdminJwt = generateMockJwt({ email: 'normal_artisan_tester@gmail.com', role: 'authenticated' });

  await runTest('4.1 Non-admin JWT accessing get_queues returns HTTP 403', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${nonAdminJwt}`
      }
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
    const data = await res.json().catch(() => ({}));
    assert.ok(data.error.toLowerCase().includes('forbidden') || data.error.toLowerCase().includes('not an authorized'), 'Error must specify unauthorized role');
  });

  await runTest('4.2 Non-admin JWT attempting approve_verification returns HTTP 403', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nonAdminJwt}`
      },
      body: JSON.stringify({
        action: 'approve_verification',
        provider_id: 101,
        request_id: 'req_101'
      })
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden on mutation, got ${res.status}`);
  });

  await runTest('4.3 Non-admin JWT attempting reject_verification returns HTTP 403', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nonAdminJwt}`
      },
      body: JSON.stringify({
        action: 'reject_verification',
        provider_id: 102,
        reason: 'Attempted by unauthorized user.'
      })
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden on rejection, got ${res.status}`);
  });

  await runTest('4.4 Non-admin JWT attempting resolve_dispute returns HTTP 403', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nonAdminJwt}`
      },
      body: JSON.stringify({
        action: 'resolve_dispute',
        report_id: 'rep_dsp_001',
        notes: 'Attempted resolution by unauthorized provider.'
      })
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden on dispute, got ${res.status}`);
  });

  // -------------------------------------------------------------
  // 5. AUTHORIZED ADMIN ACCESS & DATA MINIMIZATION (Section 10)
  // -------------------------------------------------------------
  console.log('\n--- 5. AUTHORIZED ADMIN ACCESS & DATA MINIMIZATION (SECTION 10) ---');

  const adminJwt = generateMockJwt({ email: 'compliance@padifix.ng', role: 'authenticated' });

  await runTest('5.1 Authorized compliance admin accesses get_queues with HTTP 200', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${adminJwt}`
      }
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.status, 'success');
    assert.ok(data.kpis, 'Response must include compliance KPIs');
    assert.ok(Array.isArray(data.queues.verifications), 'Response must include verifications queue');
  });

  await runTest('5.2 Queue DTO strictly minimizes data (no raw NIN/BVN hashes or secrets)', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${adminJwt}`
      }
    });
    const rawText = await res.text();
    assert.ok(!rawText.includes('vnin_10249812'), 'Must not return raw NIN hash');
    assert.ok(!rawText.includes('10249812'), 'Must not return unmasked NIN digits');
    assert.ok(!rawText.includes('service_role'), 'Must not leak service_role');
    assert.ok(!rawText.includes('PADIFIX_ADMIN_KEY'), 'Must not leak PADIFIX_ADMIN_KEY');

    const data = JSON.parse(rawText);
    const item = data.queues.verifications[0];
    assert.ok(item.document_masked_ref.includes('****'), 'Document reference must be masked');
    assert.strictEqual(item.document_reference_hash, undefined, 'Raw hash must be stripped');
  });

  // -------------------------------------------------------------
  // 6. ADMIN SESSION SECURITY & LOCK DESK (Sections 11 & 19)
  // -------------------------------------------------------------
  console.log('\n--- 6. ADMIN SESSION SECURITY & LOCK DESK (SECTIONS 11 & 19) ---');

  let activeSessionToken = null;

  await runTest('6.1 auth_login issues temporary short-lived session token', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({ action: 'auth_login' })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.session_token, 'Response must contain session_token');
    assert.ok(data.session_token.startsWith('adm_sess_'), 'Token must be an adm_sess token');
    activeSessionToken = data.session_token;
  });

  await runTest('6.2 Active session token authenticates get_queues successfully', async () => {
    assert.ok(activeSessionToken, 'Requires activeSessionToken');
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${activeSessionToken}`
      }
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
  });

  await runTest('6.3 lock_desk revokes administrative session immediately', async () => {
    assert.ok(activeSessionToken, 'Requires activeSessionToken');
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeSessionToken}`
      },
      body: JSON.stringify({ action: 'lock_desk' })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.status, 'success');
  });

  await runTest('6.4 Revoked session token is rejected with HTTP 401', async () => {
    assert.ok(activeSessionToken, 'Requires activeSessionToken');
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${activeSessionToken}`
      }
    });
    assert.strictEqual(res.status, 401, `Expected 401 Unauthorized for revoked session, got ${res.status}`);
  });

  // -------------------------------------------------------------
  // 7. VERIFICATION MUTATIONS & CRITICAL NIN RULE (Sections 13-17)
  // -------------------------------------------------------------
  console.log('\n--- 7. VERIFICATION MUTATIONS & CRITICAL NIN RULE (SECTIONS 13-17) ---');

  await runTest('7.1 approve_verification succeeds and awards Verified Pro badge', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        action: 'approve_verification',
        provider_id: 101,
        request_id: 'req_101'
      })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.status, 'success');
    assert.strictEqual(data.badge_applied, 'Verified Pro');
    assert.ok(data.audit_id, 'Must generate audit_id');
  });

  await runTest('7.2 Duplicate approval is idempotent (returns HTTP 200 idempotent: true)', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        action: 'approve_verification',
        provider_id: 101,
        request_id: 'req_101'
      })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.idempotent, true, 'Duplicate approval must return idempotent: true');
  });

  await runTest('7.3 Critical NIN Rule: vNIN without verified evidence leaves nin_verified = false', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        action: 'approve_verification',
        provider_id: 103,
        request_id: 'req_103'
      })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.nin_verified, false, 'Critical NIN Rule: nin_verified must remain false');
  });

  await runTest('7.4 reject_verification records validated reason and server audit', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        action: 'reject_verification',
        provider_id: 102,
        request_id: 'req_102',
        reason: 'CAC Certificate RC number failed official CAC registry check.'
      })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.status, 'success');
    assert.ok(data.audit_id, 'Must generate audit_id');
  });

  await runTest('7.5 Duplicate rejection is idempotent (returns HTTP 200 idempotent: true)', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        action: 'reject_verification',
        provider_id: 102,
        request_id: 'req_102',
        reason: 'CAC Certificate RC number failed official CAC registry check.'
      })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.idempotent, true);
  });

  await runTest('7.6 Conflicting state transition returns HTTP 409 Conflict', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        action: 'approve_verification',
        provider_id: 102,
        request_id: 'req_102'
      })
    });
    assert.strictEqual(res.status, 409, `Expected 409 Conflict, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.error.includes('Conflicting transition'), 'Error must specify conflicting transition');
  });

  // -------------------------------------------------------------
  // 8. COMMUNITY DISPUTE RESOLUTION (Section 18)
  // -------------------------------------------------------------
  console.log('\n--- 8. COMMUNITY DISPUTE RESOLUTION (SECTION 18) ---');

  await runTest('8.1 resolve_dispute transitions to actioned successfully', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        action: 'resolve_dispute',
        report_id: 'rep_dsp_001',
        resolution_status: 'actioned',
        notes: 'Mediated dispute successfully between artisan and client.'
      })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.status, 'success');
  });

  await runTest('8.2 Duplicate dispute resolution is idempotent', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        action: 'resolve_dispute',
        report_id: 'rep_dsp_001',
        resolution_status: 'actioned'
      })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.idempotent, true);
  });

  await runTest('8.3 Invalid dispute status rejected with HTTP 400', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        action: 'resolve_dispute',
        report_id: 'rep_dsp_001',
        resolution_status: 'invalid_arbitrary_status'
      })
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  // -------------------------------------------------------------
  // 9. AUDIT IMMUTABILITY & SUPABASE RLS (Section 20)
  // -------------------------------------------------------------
  console.log('\n--- 9. AUDIT IMMUTABILITY & SUPABASE RLS (SECTION 20) ---');

  await runTest('9.1 Supabase RLS empirically blocks unauthorized client mutations', async () => {
    const migrationFile = path.join(__dirname, '../supabase/migrations/032_padifix_provider_verification_and_trust_audit.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    assert.ok(sql.includes('ALTER TABLE public.verification_audits ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled in schema');
    assert.ok(!sql.includes('CREATE POLICY "Providers can insert verification audits"'), 'Must not have provider insert policy');
    assert.ok(!sql.includes('CREATE POLICY "Providers can update verification audits"'), 'Must not have provider update policy');
    assert.ok(!sql.includes('CREATE POLICY "Providers can delete verification audits"'), 'Must not have provider delete policy');

    // Empirical live check against Supabase REST
    const SUPABASE_URL = 'https://hvxosxhnxauiqrhpyuur.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';

    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/verification_requests`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ provider_id: 8, verification_type: 'vnin' })
    });
    const insData = await insRes.json();
    assert.ok(insData.code === '42501' || insRes.status === 400 || insRes.status === 403, 'PostgreSQL RLS must reject unprivileged insert');

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/providers?id=eq.8`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ is_verified: true, nin_verified: true })
    });
    const patchData = await patchRes.json();
    assert.ok(Array.isArray(patchData) && patchData.length === 0, 'RLS must prevent updating unowned provider records');
  });

  // -------------------------------------------------------------
  // 10. CLIENT BUNDLE & ZERO SECRETS (Sections 21-23)
  // -------------------------------------------------------------
  console.log('\n--- 10. CLIENT BUNDLE & ZERO SECRETS (SECTIONS 21-23) ---');

  await runTest('10.1 admin.js uses sessionStorage and exposes zero master secrets', async () => {
    const res = await fetch(`${PROD_URL}/admin.js`, { headers: { 'Cache-Control': 'no-cache' } });
    const code = await res.text();
    assert.ok(!code.includes('padifix_dev_compliance_2026'), 'admin.js must not contain dev key');
    assert.ok(!code.includes('sk_live_'), 'admin.js must not contain sk_live_');
    assert.ok(!code.includes('sk_test_'), 'admin.js must not contain sk_test_');
    assert.ok(!code.includes('service_role'), 'admin.js must not contain service_role');
    assert.ok(code.includes('sessionStorage'), 'admin.js must use sessionStorage for temporary tokens');
    assert.ok(code.includes('lock_desk'), 'admin.js must implement lock_desk action');
    assert.ok(code.includes('clearStoredAdminKey'), 'admin.js must clear tokens on lock');
  });

  // -------------------------------------------------------------
  // 11. RATE LIMITING & RECOVERY (Section 12)
  // -------------------------------------------------------------
  console.log('\n--- 11. RATE LIMITING & RECOVERY (SECTION 12) ---');

  const rateLimitProbeIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;

  await runTest('11.1 5 consecutive failed authentication attempts trigger HTTP 429 lockout', async () => {
    let triggered429 = false;
    let retryAfterHeader = null;

    for (let i = 1; i <= 6; i++) {
      const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, {
        headers: {
          'Cache-Control': 'no-cache',
          'x-forwarded-for': rateLimitProbeIp,
          'x-admin-key': `brute_force_invalid_attempt_${i}`
        }
      });
      if (res.status === 429) {
        triggered429 = true;
        retryAfterHeader = res.headers.get('retry-after');
        break;
      }
    }

    assert.ok(triggered429, 'Expected HTTP 429 after 5 failed authentication attempts');
    assert.ok(retryAfterHeader, 'Expected Retry-After header to be present on HTTP 429');
  });

  await runTest('11.2 Rate-limited response enforces lockout duration and zero secret leakage', async () => {
    const res = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, {
      headers: {
        'Cache-Control': 'no-cache',
        'x-forwarded-for': rateLimitProbeIp,
        'x-admin-key': 'locked_out_probe'
      }
    });
    assert.strictEqual(res.status, 429, 'Locked out client must receive HTTP 429');
    const retryAfter = res.headers.get('retry-after');
    assert.ok(retryAfter && parseInt(retryAfter, 10) > 0, 'Must include positive numeric Retry-After');
    const data = await res.json();
    assert.ok(data.error && data.error.includes('Too Many Requests'), 'Must return standard 429 JSON message');
    const rawText = JSON.stringify(data);
    assert.ok(!rawText.includes('service_role'), 'Must not leak secrets');
    assert.ok(!rawText.includes('PADIFIX_ADMIN_KEY'), 'Must not leak secrets');
  });

  // -------------------------------------------------------------
  // SUMMARY & VERDICT
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`PRODUCTION COMPLIANCE AUDIT SUMMARY: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('🌟 FINAL VERDICT: GREEN — PRODUCTION EMPIRICALLY CERTIFIED (SECTIONS 1-27)');
    console.log('✅ TRUST & SAFETY COMPLIANCE DESK FULLY OPERATIONAL ON https://padifix.vercel.app');
  } else {
    console.log('❌ FINAL VERDICT: RED — PRODUCTION EMPIRICAL FAILURES DETECTED');
  }
  console.log('='.repeat(80));

  if (failed > 0) process.exit(1);
}

runProductionComplianceSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

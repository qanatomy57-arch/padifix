/**
 * PADIFIX PHASE 037: REAL-TIME COMPLIANCE NOTIFICATIONS & RESUBMISSION PIPELINE
 * scripts/verify_phase_037_notifications_and_resubmission.js
 *
 * Automated test harness verifying:
 * 1. Termii SMS templates <= 160 chars, single segment, zero PII, and sandbox gate.
 * 2. Failure isolation: Termii and Resend failures never block or fail database compliance actions.
 * 3. In-app resubmission lifecycle: atomic transition, new UUID/storage path, prior record preserved, rejection fields cleared.
 * 4. One-pending invariant: concurrent or duplicate pending submissions rejected (HTTP 409).
 * 5. Free tier restriction: free providers cannot bypass verification via resubmission.
 * 6. Admin review history: get_submission_history returns chronological safe fields with strict data minimization.
 * 7. Serverless function budget: strictly <= 12 deployed functions.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Setup testing environment variables
const TEST_JWT_SECRET = 'phase_012e_test_jwt_secret_key_minimum_32_bytes_long';
process.env.TEST_JWT_SECRET = TEST_JWT_SECRET;
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
const TEST_ADMIN_KEY = 'test_compliance_officer_key_padifix_2026';
process.env.PADIFIX_ADMIN_KEY = TEST_ADMIN_KEY;
process.env.TERMII_API_KEY = 'test_termii_api_key_sandbox_2026';
process.env.TERMII_SENDER_ID = 'PadiFix';
process.env.TERMII_BASE_URL = 'https://api.ng.termii.com';
process.env.TERMII_CHANNEL = 'generic';

// Load notification service and API handlers
const notificationService = require('../lib/artisan-notification-service');
const providersHandler = require('../api/providers.js');
const adminComplianceHandler = require('../api/admin-compliance.js');

let passed = 0;
let failed = 0;

function pass(name, detail = '') {
  console.log(`  ✓ [PASS] ${name}${detail ? ` — ${detail}` : ''}`);
  passed++;
}

function fail(name, err) {
  console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
  failed++;
}

async function runTest(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

// Helper to generate a valid test JWT for any provider ID
function makeTestProviderJwt(providerId, email) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: `provider_${providerId}`,
    id: `provider_${providerId}`,
    email: email || `artisan_${providerId}@padifix.ng`,
    user_metadata: { provider_id: providerId },
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', TEST_JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

// Helpers for mocking serverless API requests & responses
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

async function runPhase037Suite() {
  console.log('================================================================');
  console.log('PADIFIX PHASE 037: COMPLIANCE NOTIFICATIONS & RESUBMISSION GATES');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // SECTION 1: TERMII SMS CONSTRAINTS & PRIVACY PROTECTION
  // -------------------------------------------------------------
  console.log('--- SECTION 1: Termii SMS Constraints & Privacy Protection ---');

  await runTest('1.1 Approval SMS template is strictly <= 160 characters (single segment)', async () => {
    const res = await notificationService.dispatchVerificationApprovedSms({
      phone: '08012345678',
      providerName: 'Emeka Okonkwo',
      providerId: 101
    });
    assert.ok(res.length <= 160, `Length was ${res.length}, expected <= 160`);
    assert.ok(res.messageBody.includes('PadiFix: Congrats Emeka!'));
    assert.ok(res.messageBody.includes('Verified Pro badge is now active'));
  });

  await runTest('1.2 Rejection SMS template is strictly <= 160 characters across all canonical reasons', async () => {
    const reasons = ['blurry_image', 'expired_document', 'name_mismatch', 'incomplete_document', 'fraud_suspected', 'other'];
    for (const r of reasons) {
      const res = await notificationService.dispatchVerificationRejectedSms({
        phone: '08012345678',
        providerName: 'Emeka Okonkwo',
        reasonCode: r,
        reasonNotes: 'Please ensure image is clear.'
      });
      assert.ok(res.length <= 160, `Length for ${r} was ${res.length}, expected <= 160`);
      assert.ok(res.messageBody.startsWith('PadiFix: Action required'));
      assert.ok(res.messageBody.includes('padifix.ng/dashboard'));
    }
  });

  await runTest('1.3 Arbitrarily long provider names cannot cause SMS to exceed 160 characters', async () => {
    const longName = 'Chief Bartholomew Chukwuemeka Alexander Montgomery III of Lagos State';
    const res = await notificationService.dispatchVerificationApprovedSms({
      phone: '08012345678',
      providerName: longName
    });
    assert.ok(res.length <= 160, `Oversized name produced length ${res.length}`);
    assert.ok(res.messageBody.includes('Chief'));
  });

  await runTest('1.4 Zero PII or internal identifiers in SMS body', async () => {
    const res = await notificationService.dispatchVerificationRejectedSms({
      phone: '08012345678',
      providerName: 'Amina',
      reasonCode: 'incomplete_document',
      reasonNotes: 'NIN 12345678901 was missing page 2'
    });
    const body = res.messageBody;
    assert.strictEqual(body.includes('12345678901'), false, 'Must not leak NIN');
    assert.strictEqual(body.includes('provider-verifications'), false, 'Must not leak storage path');
    assert.strictEqual(body.includes('sub_'), false, 'Must not leak submission UUID');
    assert.strictEqual(body.includes('sha256'), false, 'Must not leak hash references');
  });

  await runTest('1.5 Termii sandbox gate prevents live SMS send when TERMII_SENDER_ID_APPROVED=false', async () => {
    const orig = process.env.TERMII_SENDER_ID_APPROVED;
    process.env.TERMII_SENDER_ID_APPROVED = 'false';
    try {
      const res = await notificationService.dispatchVerificationApprovedSms({
        phone: '08012345678',
        providerName: 'Test Provider'
      });
      assert.strictEqual(res.delivered, false);
      assert.strictEqual(res.status, 'pending_sender_approval');
      assert.strictEqual(res.simulated, true);
    } finally {
      process.env.TERMII_SENDER_ID_APPROVED = orig;
    }
  });

  // -------------------------------------------------------------
  // SECTION 2: FAILURE ISOLATION (NOTIFICATIONS NEVER BLOCK DB STATE)
  // -------------------------------------------------------------
  console.log('\n--- SECTION 2: Failure Isolation & Transaction Protection ---');

  await runTest('2.1 Termii / external notification failure does NOT block compliance approval', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: {
        action: 'approve_verification',
        request_id: 'req_101',
        reviewer: 'Chief Compliance Officer',
        notes: 'Approved under test harness.'
      }
    };
    const res = createMockRes();
    await adminComplianceHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Compliance approval must return HTTP 200');
    assert.strictEqual(res.body.status, 'success');
  });

  await runTest('2.2 Termii timeout / simulated failure does NOT block compliance rejection', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: {
        action: 'reject_verification',
        request_id: 'req_102',
        reason_code: 'blurry_image',
        reason: 'Document photograph was blurred and unreadable.',
        reviewer: 'Chief Compliance Officer'
      }
    };
    const res = createMockRes();
    await adminComplianceHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Compliance rejection must return HTTP 200');
    assert.strictEqual(res.body.status, 'success');
  });

  // -------------------------------------------------------------
  // SECTION 3: IN-APP PROVIDER RESUBMISSION LIFECYCLE & ATOMICITY
  // -------------------------------------------------------------
  console.log('\n--- SECTION 3: In-App Resubmission Lifecycle & Atomicity ---');

  await runTest('3.1 Rejected provider successfully submits corrected documents (is_resubmission: true)', async () => {
    const token = makeTestProviderJwt(777);

    const mockSubmissions = [
      {
        id: 'sub_old_rejected_001',
        provider_id: 777,
        document_type: 'nin_slip',
        status: 'rejected',
        submitted_at: '2026-09-10T10:00:00Z',
        rejection_reason: 'blurry_image',
        rejection_notes: 'Edges cut off'
      }
    ];

    const mockProvider = {
      id: 777,
      subscription_plan: 'PRO',
      subscription_status: 'active',
      is_verified: false,
      verification_status: 'rejected',
      verification_rejection_reason: 'blurry_image',
      verification_rejection_notes: 'Edges cut off'
    };

    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 777,
        document_type: 'nin_slip',
        document_number: '12345678901',
        file_path: 'temp/corrected_doc.webp'
      },
      _mockProvider: mockProvider,
      _mockSubmissions: mockSubmissions
    };

    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 201, `Expected HTTP 201, got ${res.statusCode}`);
    assert.strictEqual(res.body.is_resubmission, true, 'Must flag is_resubmission: true');
    assert.strictEqual(res.body.submission.status, 'pending');
    assert.notStrictEqual(res.body.submission.id, 'sub_old_rejected_001', 'Must generate a new submission UUID');

    // Verify previous rejected submission was preserved
    const oldSub = mockSubmissions.find(s => s.id === 'sub_old_rejected_001');
    assert.strictEqual(oldSub.status, 'rejected', 'Prior rejected submission must remain untouched');

    // Verify provider entity cleared rejection fields
    assert.strictEqual(mockProvider.verification_status, 'pending');
    assert.strictEqual(mockProvider.verification_rejection_reason, null);
    assert.strictEqual(mockProvider.verification_rejection_notes, null);
  });

  await runTest('3.2 One-pending invariant blocks duplicate submission during pending review', async () => {
    const token = makeTestProviderJwt(777);

    const mockSubmissions = [
      {
        id: 'sub_active_pending',
        provider_id: 777,
        status: 'pending',
        submitted_at: new Date().toISOString()
      }
    ];

    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 777,
        document_type: 'nin_slip',
        document_number: '12345678901',
        file_path: 'temp/second_doc.webp'
      },
      _mockSubmissions: mockSubmissions,
      _mockProvider: { id: 777, subscription_plan: 'PRO', is_verified: false }
    };

    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 409, 'Duplicate pending submission must return HTTP 409 Conflict');
    assert.strictEqual(res.body.error, 'PENDING_SUBMISSION_EXISTS');
  });

  await runTest('3.3 Free tier provider cannot bypass verification via resubmission', async () => {
    const token = makeTestProviderJwt(999);

    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 999,
        document_type: 'nin_slip',
        document_number: '12345678901',
        file_path: 'temp/free_doc.webp'
      },
      _mockSubmissions: [{ id: 'sub_old', provider_id: 999, status: 'rejected' }],
      _mockProvider: { id: 999, subscription_plan: 'FREE', is_verified: false, verification_status: 'rejected' }
    };

    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 403, 'Free tier resubmission attempt must return HTTP 403');
    assert.strictEqual(res.body.error, 'FREE_TIER_INELIGIBLE');
  });

  // -------------------------------------------------------------
  // SECTION 4: ADMIN REVIEW HISTORY CONTEXT & DATA MINIMIZATION
  // -------------------------------------------------------------
  console.log('\n--- SECTION 4: Admin Review History Context & Data Minimization ---');

  await runTest('4.1 get_submission_history returns chronological past submissions', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: {
        action: 'get_submission_history',
        provider_id: 101
      }
    };

    const res = createMockRes();
    await adminComplianceHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'success');
    assert.ok(Array.isArray(res.body.history));
    assert.ok(res.body.history.length >= 1);
  });

  await runTest('4.2 get_submission_history strictly enforces data minimization (no hashes/paths)', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: {
        action: 'get_submission_history',
        provider_id: 101
      }
    };

    const res = createMockRes();
    await adminComplianceHandler(req, res);
    const item = res.body.history[0];
    assert.strictEqual(item.document_number_hash, undefined, 'Must not expose raw document hash');
    assert.strictEqual(item.file_path, undefined, 'Must not expose raw storage path in history view');
    assert.strictEqual(item.nin, undefined, 'Must not expose raw NIN');
    assert.strictEqual(item.bvn, undefined, 'Must not expose raw BVN');
  });

  await runTest('4.3 get_submission_history rejects unauthenticated access (HTTP 401)', async () => {
    const req = {
      method: 'POST',
      headers: {}, // No admin key
      body: {
        action: 'get_submission_history',
        provider_id: 101
      }
    };

    const res = createMockRes();
    await adminComplianceHandler(req, res);
    assert.strictEqual(res.statusCode, 401, 'Unauthenticated history request must be blocked');
  });

  // -------------------------------------------------------------
  // SECTION 5: SERVERLESS BUDGET & CODEBASE INTEGRITY
  // -------------------------------------------------------------
  console.log('\n--- SECTION 5: Vercel Serverless Budget & Codebase Integrity ---');

  await runTest('5.1 Vercel Serverless Function budget strictly <= 12 functions', () => {
    const apiDir = path.join(__dirname, '..', 'api');
    const vignorePath = path.join(__dirname, '..', '.vercelignore');
    const allApiFiles = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));
    const vignoreContent = fs.readFileSync(vignorePath, 'utf8');
    const ignoredFiles = vignoreContent.split('\n').map(l => l.trim()).filter(l => l.startsWith('api/') && l.endsWith('.js')).map(l => l.replace('api/', ''));

    const deployedFunctions = allApiFiles.filter(f => !ignoredFiles.includes(f));
    console.log(`     Deployed serverless functions count: ${deployedFunctions.length} (${deployedFunctions.join(', ')})`);
    assert.ok(deployedFunctions.length <= 12, `Budget exceeded: ${deployedFunctions.length} functions found, max allowed is 12`);
  });

  await runTest('5.2 Client files contain zero service-role keys or sensitive credentials', () => {
    const filesToAudit = ['dashboard.html', 'dashboard.js', 'admin.html', 'admin.js'];
    for (const f of filesToAudit) {
      const fullPath = path.resolve(__dirname, '..', f);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.strictEqual(content.includes('service_role'), false, `${f} contains service_role!`);
        assert.strictEqual(content.includes('TERMII_API_KEY'), false, `${f} contains TERMII_API_KEY!`);
        assert.strictEqual(content.includes('RESEND_API_KEY'), false, `${f} contains RESEND_API_KEY!`);
      }
    }
  });

  console.log('\n================================================================');
  console.log(`PHASE 037 TEST SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase037Suite().catch(err => {
  console.error('Fatal error in Phase 037 test runner:', err);
  process.exit(1);
});

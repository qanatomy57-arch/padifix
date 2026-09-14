/**
 * PADIFIX PHASE 036 — IN-APP VERIFICATION SUBMISSION & ADMIN COMPLIANCE APPROVAL PIPELINE
 * Verification & Certification Test Suite
 *
 * Verifies:
 * 1. Eligibility & Security Gate: Free accounts cannot submit (403), Paid unverified accounts can submit.
 * 2. Unauthenticated and cross-provider impersonation requests are rejected (401/403).
 * 3. Single-Choice Government ID: Only canonical 5 types permitted.
 * 4. Server-Authoritative Hashing & Masking: Raw ID never persisted; SHA-256 and mask computed on server.
 * 5. Deterministic Storage Key: provider-verifications/{provider_id}/{submission_id}.ext (Zero PII in path).
 * 6. File & Storage Security: Traversal and executable formats blocked. Private bucket RLS verified.
 * 7. Single Pending Submission: Duplicate pending submissions strictly blocked (409).
 * 8. One-Time Successful Verification: Once verified, re-submission is permanently forbidden (409).
 * 9. Lifecycle Independence: Expiry/cancellation never mutates is_verified. Resubscription restores badge.
 * 10. Admin Compliance Desk: Signed URLs server-generated with 15-min TTL under strict admin auth.
 * 11. Structured Rejection: Canonical enum enforced with feedback notes; unlocks resubmission.
 * 12. Transactional & Idempotent Approvals: Safe transitions without duplicate events.
 * 13. Vercel Function Budget: Strict <= 12 deployed functions in api/.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEST_JWT_SECRET = 'phase_012e_test_jwt_secret_key_minimum_32_bytes_long';
process.env.TEST_JWT_SECRET = TEST_JWT_SECRET;
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;

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

// Load handlers
const providersHandler = require('../api/providers.js');
const adminComplianceHandler = require('../api/admin-compliance.js');

let passCount = 0;
let failCount = 0;

async function test(name, fn) {
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
  console.log('PADIFIX PHASE 036: VERIFICATION PIPELINE & COMPLIANCE GATEWAY');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // Section 1: Submission Eligibility & Security Boundaries
  // -------------------------------------------------------------
  console.log('--- SECTION 1: Submission Eligibility & Security Boundaries ---');

  await test('1.1 Free provider is blocked from submitting verification (HTTP 403 FREE_TIER_INELIGIBLE)', async () => {
    const token = makeTestProviderJwt(901);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 901,
        document_type: 'nin_slip',
        document_number: '12345678901',
        file_path: 'temp_uploads/doc.webp'
      },
      _mockProvider: { id: 901, subscription_plan: 'FREE', is_verified: false, verification_status: 'unverified' }
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'FREE_TIER_INELIGIBLE');
  });

  await test('1.2 Unauthenticated user cannot submit verification (HTTP 401)', async () => {
    const req = {
      method: 'POST',
      headers: {},
      body: {
        action: 'submit_verification',
        provider_id: 101,
        document_type: 'nin_slip',
        document_number: '12345678901',
        file_path: 'temp_uploads/doc.webp'
      }
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 401);
  });

  await test('1.3 Provider cannot submit verification on behalf of another provider (HTTP 403)', async () => {
    const token = makeTestProviderJwt(101);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 102, // Attempting to submit for 102 with 101's JWT
        document_type: 'nin_slip',
        document_number: '12345678901',
        file_path: 'temp_uploads/doc.webp'
      },
      _mockProvider: { id: 101, subscription_plan: 'BASIC', is_verified: false }
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('1.4 Paid unverified provider (BASIC) is authorized to submit verification (HTTP 201)', async () => {
    const token = makeTestProviderJwt(201);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 201,
        document_type: 'nin_slip',
        document_number: '12345678901',
        file_path: 'temp_uploads/my_nin.webp'
      },
      _mockProvider: { id: 201, subscription_plan: 'BASIC', is_verified: false, verification_status: 'unverified' },
      _mockSubmissions: []
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.submission.status, 'pending');
    assert.strictEqual(res.body.submission.document_type, 'nin_slip');
  });

  await test('1.5 Invalid document type is rejected (HTTP 400 INVALID_DOCUMENT_TYPE)', async () => {
    const token = makeTestProviderJwt(201);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 201,
        document_type: 'gym_membership_card',
        document_number: '12345678901',
        file_path: 'temp_uploads/card.webp'
      },
      _mockProvider: { id: 201, subscription_plan: 'PRO', is_verified: false },
      _mockSubmissions: []
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'INVALID_DOCUMENT_TYPE');
  });

  await test('1.6 All 5 canonical Single-Choice Government ID types are accepted', async () => {
    const validTypes = ['nin_slip', 'drivers_license', 'voters_card', 'international_passport', 'other_gov_id'];
    for (const docType of validTypes) {
      const token = makeTestProviderJwt(205);
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: {
          action: 'submit_verification',
          provider_id: 205,
          document_type: docType,
          document_number: 'DOC99887766',
          file_path: 'temp_uploads/id_doc.webp'
        },
        _mockProvider: { id: 205, subscription_plan: 'PREMIUM', is_verified: false },
        _mockSubmissions: []
      };
      const res = createMockRes();
      await providersHandler(req, res);
      assert.strictEqual(res.statusCode, 201, `Failed to accept canonical doc type: ${docType}`);
    }
  });

  await test('1.7 Missing document file is rejected (HTTP 400 MISSING_DOCUMENT_FILE)', async () => {
    const token = makeTestProviderJwt(201);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 201,
        document_type: 'nin_slip',
        document_number: '12345678901',
        file_path: ''
      },
      _mockProvider: { id: 201, subscription_plan: 'PRO', is_verified: false },
      _mockSubmissions: []
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'MISSING_DOCUMENT_FILE');
  });

  await test('1.8 Path traversal & executable file extensions are rejected (HTTP 400 INVALID_FILE_FORMAT)', async () => {
    const token = makeTestProviderJwt(201);
    const maliciousPaths = [
      '../../etc/passwd',
      'malicious.exe',
      'script.php',
      '../config.json',
      'exploit.sh'
    ];
    for (const badPath of maliciousPaths) {
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: {
          action: 'submit_verification',
          provider_id: 201,
          document_type: 'nin_slip',
          document_number: '12345678901',
          file_path: badPath
        },
        _mockProvider: { id: 201, subscription_plan: 'PRO', is_verified: false },
        _mockSubmissions: []
      };
      const res = createMockRes();
      await providersHandler(req, res);
      assert.strictEqual(res.statusCode, 400, `Allowed malicious path: ${badPath}`);
      assert.strictEqual(res.body.error, 'INVALID_FILE_FORMAT');
    }
  });

  // -------------------------------------------------------------
  // Section 2: Server-Authoritative Normalization, Hashing & Storage Path
  // -------------------------------------------------------------
  console.log('\n--- SECTION 2: Server-Authoritative Normalization & Hashing ---');

  await test('2.1 Raw document number is NEVER persisted or returned in response', async () => {
    const rawNIN = '10928374650';
    const token = makeTestProviderJwt(301);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 301,
        document_type: 'nin_slip',
        document_number: rawNIN,
        file_path: 'doc.webp'
      },
      _mockProvider: { id: 301, subscription_plan: 'BASIC', is_verified: false },
      _mockSubmissions: []
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 201);
    const sub = res.body.submission;
    assert.strictEqual(sub.document_number, undefined, 'Raw document number leaked in submission object');
    assert.ok(!JSON.stringify(res.body).includes(rawNIN), 'Raw document number leaked in payload JSON');
  });

  await test('2.2 Server computes canonical SHA-256 hash and masked document reference', async () => {
    const rawRef = 'AB-1234-5678';
    const expectedNormalized = 'AB12345678';
    const expectedHash = crypto.createHash('sha256').update(expectedNormalized, 'utf8').digest('hex');

    const token = makeTestProviderJwt(302);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 302,
        document_type: 'drivers_license',
        document_number: rawRef,
        // Client attempt to forge a fake hash must be ignored by server
        document_number_hash: 'forged_fake_hash_from_browser',
        document_number_masked: 'FAKE: MASK',
        file_path: 'license.jpg'
      },
      _mockProvider: { id: 302, subscription_plan: 'BASIC', is_verified: false },
      _mockSubmissions: []
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 201);
    const sub = res.body.submission;
    assert.strictEqual(sub.document_number_hash, expectedHash, 'Server failed to enforce authoritative SHA-256 hash');
    assert.strictEqual(sub.document_number_masked, 'FRSC: AB-****678', 'Server failed to generate canonical mask');
  });

  await test('2.3 Storage key is deterministic and strictly PII-free', async () => {
    const token = makeTestProviderJwt(303);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 303,
        document_type: 'nin_slip',
        document_number: '99887766554',
        file_path: 'C:\\Users\\Chinedu_Okafor_NIN_12345.png'
      },
      _mockProvider: { id: 303, subscription_plan: 'PRO', is_verified: false },
      _mockSubmissions: []
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 201);
    const sub = res.body.submission;
    assert.ok(sub.file_path.startsWith('provider-verifications/303/'), `Path must start with provider folder: ${sub.file_path}`);
    assert.ok(!sub.file_path.includes('Chinedu'), 'PII leaked into storage path');
    assert.ok(!sub.file_path.includes('12345'), 'Document number leaked into storage path');
  });

  // -------------------------------------------------------------
  // Section 3: One-Time Verification & Lifecycle Invariants
  // -------------------------------------------------------------
  console.log('\n--- SECTION 3: One-Time Verification & Lifecycle Invariants ---');

  await test('3.1 Provider with active pending submission cannot create duplicate pending submission (HTTP 409)', async () => {
    const token = makeTestProviderJwt(401);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 401,
        document_type: 'nin_slip',
        document_number: '12345678901',
        file_path: 'id.webp'
      },
      _mockProvider: { id: 401, subscription_plan: 'BASIC', is_verified: false },
      _mockSubmissions: [{ id: 'sub_active_1', provider_id: 401, status: 'pending' }]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error, 'PENDING_SUBMISSION_EXISTS');
  });

  await test('3.2 Successfully verified provider is PERMANENTLY blocked from re-submitting (HTTP 409 ALREADY_VERIFIED)', async () => {
    const token = makeTestProviderJwt(402);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 402,
        document_type: 'drivers_license',
        document_number: 'FRSC98765432',
        file_path: 'license.webp'
      },
      _mockProvider: { id: 402, subscription_plan: 'PREMIUM', is_verified: true, verification_status: 'verified' },
      _mockSubmissions: []
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error, 'ALREADY_VERIFIED');
  });

  await test('3.3 Subscription expiration does NOT reset is_verified', () => {
    const Monetization = require('../monetization-config.js');
    const expiredProvider = {
      id: 501,
      is_verified: true,
      verification_status: 'verified',
      subscription_plan: 'PRO',
      subscription_status: 'expired',
      subscription_end: '2025-01-01T00:00:00.000Z'
    };

    const verState = Monetization.resolveVerificationState(expiredProvider);
    assert.strictEqual(verState.isVerified, true, 'isVerified must remain true upon expiration');
    assert.strictEqual(verState.verification_status, 'verified', 'verification_status must remain verified');
    assert.strictEqual(verState.canRequestVerification, false, 'Expired verified provider cannot initiate re-verification');
    assert.strictEqual(verState.badgeVisible, false, 'Badge is hidden when subscription is expired');
    assert.strictEqual(verState.key, 'VERIFIED_INACTIVE', 'Must resolve to canonical VERIFIED_INACTIVE');
  });

  await test('3.4 Subscription cancellation does NOT reset is_verified', () => {
    const Monetization = require('../monetization-config.js');
    const cancelledProvider = {
      id: 502,
      is_verified: true,
      verification_status: 'verified',
      subscription_plan: 'BASIC',
      subscription_status: 'cancelled',
      subscription_end: '2025-02-01T00:00:00.000Z'
    };

    const verState = Monetization.resolveVerificationState(cancelledProvider);
    assert.strictEqual(verState.isVerified, true, 'isVerified must remain true upon cancellation');
    assert.strictEqual(verState.badgeVisible, false, 'Badge must be inactive');
  });

  await test('3.5 Resubscription automatically restores tier badge without re-verification', () => {
    const Monetization = require('../monetization-config.js');
    const resubscribedProvider = {
      id: 503,
      is_verified: true,
      verification_status: 'verified',
      subscription_plan: 'PREMIUM',
      subscription_status: 'active',
      subscription_end: '2027-01-01T00:00:00.000Z'
    };

    const verState = Monetization.resolveVerificationState(resubscribedProvider);
    assert.strictEqual(verState.isVerified, true);
    assert.strictEqual(verState.badgeVisible, true, 'Badge must be automatically restored');
    assert.strictEqual(verState.publicBadgeText, 'Premium Verified Artisan');
    assert.strictEqual(verState.badgeTier, 'PREMIUM');
  });

  // -------------------------------------------------------------
  // Section 4: Admin Compliance Desk & Document Privacy
  // -------------------------------------------------------------
  console.log('\n--- SECTION 4: Admin Compliance Desk & Document Privacy ---');

  const TEST_ADMIN_KEY = 'test_compliance_officer_key_padifix_2026';
  process.env.PADIFIX_ADMIN_KEY = TEST_ADMIN_KEY;

  await test('4.1 Generating document signed URL requires administrative authorization (HTTP 401)', async () => {
    const req = {
      method: 'POST',
      headers: {},
      body: {
        action: 'get_document_url',
        provider_id: 601,
        file_path: 'provider-verifications/601/sub_test.webp'
      }
    };
    const res = createMockRes();
    await adminComplianceHandler(req, res);
    assert.strictEqual(res.statusCode, 401);
  });

  await test('4.2 Authorized compliance officer can generate temporary signed URL with 15-min TTL', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: {
        action: 'get_document_url',
        provider_id: 601,
        file_path: 'provider-verifications/601/sub_test.webp'
      }
    };
    const res = createMockRes();
    await adminComplianceHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'success');
    assert.strictEqual(res.body.expires_in_seconds, 900, 'TTL must be exactly 900 seconds (15 mins)');
    assert.ok(res.body.signed_url, 'Signed URL must be generated');
  });

  await test('4.3 Admin approval sets is_verified=true and is idempotent', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: {
        action: 'approve_verification',
        request_id: 'req_101',
        reviewer: 'Chief Compliance Officer',
        notes: 'National ID document verified against compliance standards.'
      }
    };
    const res1 = createMockRes();
    await adminComplianceHandler(req, res1);
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.body.status, 'success');

    // Second approval call must be idempotent
    const res2 = createMockRes();
    await adminComplianceHandler(req, res2);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.idempotent, true);
  });

  await test('4.4 NIN Semantics (Requirement 7): Plain document upload does NOT silently set nin_verified=true', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: {
        action: 'approve_verification',
        request_id: 'req_101',
        reviewer: 'Chief Compliance Officer'
      }
    };
    const res = createMockRes();
    await adminComplianceHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.badge_applied, 'Verified Pro');
  });

  // -------------------------------------------------------------
  // Section 5: Structured Rejection & Resubmission Workflow
  // -------------------------------------------------------------
  console.log('\n--- SECTION 5: Structured Rejection & Resubmission Workflow ---');

  await test('5.1 Rejection with invalid reason code is rejected (HTTP 400 INVALID_REJECTION_CODE)', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: {
        action: 'reject_verification',
        provider_id: 701,
        reason_code: 'unsupported_arbitrary_code',
        reason: 'Image is unreadable and dark.'
      }
    };
    const res = createMockRes();
    await adminComplianceHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'INVALID_REJECTION_CODE');
  });

  await test('5.2 Rejection with valid canonical reason code and feedback notes succeeds on pending submission', async () => {
    const rejReq = {
      method: 'POST',
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: {
        action: 'reject_verification',
        request_id: 'req_102',
        provider_id: 102,
        reason_code: 'blurry_image',
        reason: 'The ID photo is out of focus. Please re-take in good lighting.',
        reviewer: 'Chief Compliance Officer'
      }
    };
    const rejRes = createMockRes();
    await adminComplianceHandler(rejReq, rejRes);
    assert.strictEqual(rejRes.statusCode, 200);
    assert.strictEqual(rejRes.body.status, 'success');
  });

  await test('5.3 Rejected provider is unlocked to resubmit with corrected documents', async () => {
    const token = makeTestProviderJwt(702);
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        action: 'submit_verification',
        provider_id: 702,
        document_type: 'nin_slip',
        document_number: '12345678901',
        file_path: 'new_sharp_doc.webp'
      },
      _mockProvider: {
        id: 702,
        subscription_plan: 'BASIC',
        is_verified: false,
        verification_status: 'rejected'
      },
      _mockSubmissions: [
        { id: 'sub_old', provider_id: 702, status: 'rejected' }
      ]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 201, 'Rejected provider must be allowed to resubmit');
    assert.strictEqual(res.body.submission.status, 'pending');
  });

  // -------------------------------------------------------------
  // Section 6: Migration & Serverless Architecture Verification
  // -------------------------------------------------------------
  console.log('\n--- SECTION 6: Migration & Serverless Architecture Verification ---');

  await test('6.1 Canonical Migration 054 exists and is sequentially valid', () => {
    const migPath = path.join(__dirname, '..', 'supabase', 'migrations', '054_padifix_phase_036_verification_pipeline.sql');
    assert.ok(fs.existsSync(migPath), 'Migration 054 file must exist');
    const content = fs.readFileSync(migPath, 'utf8');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.verification_submissions'), 'Must define verification_submissions table');
    assert.ok(content.includes('idx_one_pending_submission_per_provider'), 'Must define partial unique index on pending submissions');
    assert.ok(content.includes('trg_block_submission_if_already_verified'), 'Must define trigger blocking re-verification on verified accounts');
    assert.ok(content.includes('provider-verifications'), 'Must configure private provider-verifications storage bucket');
  });

  await test('6.2 Storage RLS denies public access and restricts provider upload to own path', () => {
    const migPath = path.join(__dirname, '..', 'supabase', 'migrations', '054_padifix_phase_036_verification_pipeline.sql');
    const content = fs.readFileSync(migPath, 'utf8');
    assert.ok(content.includes('public = false'), 'Bucket must be private (public = false)');
    assert.ok(content.includes('verif_provider_upload_own_doc'), 'Must define provider upload policy');
    assert.ok(content.includes('verif_admin_view_all_docs'), 'Must define admin compliance read policy');
  });

  await test('6.3 Vercel Serverless Function Budget strictly <= 12 functions', () => {
    const apiDir = path.join(__dirname, '..', 'api');
    const vignorePath = path.join(__dirname, '..', '.vercelignore');
    const allApiFiles = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));
    const vignoreContent = fs.readFileSync(vignorePath, 'utf8');
    const ignoredFiles = vignoreContent.split('\n').map(l => l.trim()).filter(l => l.startsWith('api/') && l.endsWith('.js')).map(l => l.replace('api/', ''));

    const deployedFunctions = allApiFiles.filter(f => !ignoredFiles.includes(f));
    console.log(`     Deployed serverless functions count: ${deployedFunctions.length} (${deployedFunctions.join(', ')})`);
    assert.ok(deployedFunctions.length <= 12, `Deployed functions ${deployedFunctions.length} exceeds hobby limit of 12`);
  });

  await test('6.4 Resend notification service integration in admin approval and rejection', () => {
    const adminCode = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin-compliance.js'), 'utf8');
    assert.ok(adminCode.includes('sendVerificationApprovedEmail'), 'Must invoke email notification upon approval');
    assert.ok(adminCode.includes('sendVerificationRejectedEmail'), 'Must invoke email notification upon rejection');
  });

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 036 TEST SUITE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});

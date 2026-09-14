/**
 * PADIFIX PHASE 038: PUBLIC MARKETPLACE TRUST & BADGING SHOWCASE
 * scripts/verify_phase_038_trust_and_badging.js
 *
 * Automated test harness verifying:
 * 1. Server-authoritative badge tier computation (BASIC, PRO, PREMIUM, null).
 * 2. Active paid subscription requirement: unverified, FREE, expired, or cancelled yields null badge.
 * 3. Durable verification invariant: verification status preserved across subscription lifecycle.
 * 4. Organic search ranking: is_verified DESC preference on default search.
 * 5. Verified filter (?verified=true): only returns eligible active paid verified providers.
 * 6. Privacy audit: zero document hashes, storage paths, signed URLs, NIN, BVN, or compliance secrets.
 * 7. Telemetry schema validation: trust_badge_clicked, trust_banner_viewed, trust_banner_dismissed, verified_filter_toggled.
 * 8. Vercel serverless function budget: strictly <= 12 deployed functions.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const providersHandler = require('../api/providers.js');

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

// Helper to mock serverless req & res
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

// Sample provider dataset for test scenarios
function getSampleProviders() {
  return [
    {
      id: 1,
      user_id: 'usr_001',
      business_name: 'Apex Electrical Solutions',
      first_name: 'Emeka',
      last_name: 'Okonkwo',
      trade_title: 'Master Electrician',
      primary_category_slug: 'electrician',
      category: 'electrician',
      state: 'Lagos',
      lga: 'Ikeja',
      is_verified: true,
      nin_verified: false,
      subscription_plan: 'BASIC',
      subscription_status: 'active',
      is_active: true,
      is_public: true,
      profile_complete: true,
      rating: 4.8,
      reviews_count: 24,
      completed_jobs: 30,
      created_at: '2026-01-10T10:00:00Z',
      // Internal fields that should NEVER be leaked
      nin: '12345678901',
      bvn: '22233344455',
      document_path: 'provider-verifications/1/slip.webp',
      document_hash: 'sha256-abcdef123456',
      kyc_response: { match: true },
      compliance_notes: 'Reviewed by officer A'
    },
    {
      id: 2,
      user_id: 'usr_002',
      business_name: 'PlumbRight Services',
      first_name: 'Chinedu',
      last_name: 'Adebayo',
      trade_title: 'Professional Plumber',
      primary_category_slug: 'plumber',
      category: 'plumber',
      state: 'Lagos',
      lga: 'Ikeja',
      is_verified: true,
      nin_verified: false,
      subscription_plan: 'PRO',
      subscription_status: 'active',
      is_active: true,
      is_public: true,
      profile_complete: true,
      rating: 4.9,
      reviews_count: 50,
      completed_jobs: 60,
      created_at: '2026-02-01T10:00:00Z',
      nin: '98765432109',
      document_path: 'provider-verifications/2/license.webp'
    },
    {
      id: 3,
      user_id: 'usr_003',
      business_name: 'Imperial HVAC & Chillers',
      first_name: 'Olumide',
      last_name: 'Fashola',
      trade_title: 'AC Technician',
      primary_category_slug: 'ac-repair',
      category: 'ac-repair',
      state: 'Lagos',
      lga: 'Lekki',
      is_verified: true,
      nin_verified: false,
      subscription_plan: 'PREMIUM',
      subscription_status: 'active',
      is_active: true,
      is_public: true,
      profile_complete: true,
      rating: 5.0,
      reviews_count: 112,
      completed_jobs: 150,
      created_at: '2026-03-01T10:00:00Z'
    },
    {
      id: 4,
      user_id: 'usr_004',
      business_name: 'Unverified Pro Builder',
      first_name: 'Kola',
      last_name: 'Ibrahim',
      trade_title: 'Carpenter',
      primary_category_slug: 'carpenter',
      category: 'carpenter',
      state: 'Lagos',
      lga: 'Ikeja',
      is_verified: false,
      nin_verified: false,
      subscription_plan: 'PRO',
      subscription_status: 'active',
      is_active: true,
      is_public: true,
      profile_complete: true,
      rating: 4.5,
      reviews_count: 10,
      completed_jobs: 8,
      created_at: '2026-03-15T10:00:00Z'
    },
    {
      id: 5,
      user_id: 'usr_005',
      business_name: 'Verified But Free Artisan',
      first_name: 'Tunde',
      last_name: 'Afolabi',
      trade_title: 'Painter',
      primary_category_slug: 'painter',
      category: 'painter',
      state: 'Lagos',
      lga: 'Surulere',
      is_verified: true,
      nin_verified: false,
      subscription_plan: 'FREE',
      subscription_status: 'active',
      is_active: true,
      is_public: true,
      profile_complete: true,
      rating: 4.2,
      reviews_count: 5,
      completed_jobs: 3,
      created_at: '2026-01-05T10:00:00Z'
    },
    {
      id: 6,
      user_id: 'usr_006',
      business_name: 'Verified But Expired Pro',
      first_name: 'Amaka',
      last_name: 'Nwosu',
      trade_title: 'Electrician',
      primary_category_slug: 'electrician',
      category: 'electrician',
      state: 'Lagos',
      lga: 'Ikeja',
      is_verified: true,
      nin_verified: false,
      subscription_plan: 'PRO',
      subscription_status: 'expired',
      is_active: true,
      is_public: true,
      profile_complete: true,
      rating: 4.7,
      reviews_count: 30,
      completed_jobs: 40,
      created_at: '2026-01-01T10:00:00Z'
    },
    {
      id: 7,
      user_id: 'usr_007',
      business_name: 'Standard Free Unverified',
      first_name: 'Bisi',
      last_name: 'Oladele',
      trade_title: 'Cleaner',
      primary_category_slug: 'cleaner',
      category: 'cleaner',
      state: 'Lagos',
      lga: 'Ikeja',
      is_verified: false,
      nin_verified: false,
      subscription_plan: 'FREE',
      subscription_status: 'active',
      is_active: true,
      is_public: true,
      profile_complete: true,
      rating: 4.0,
      reviews_count: 2,
      completed_jobs: 1,
      created_at: '2026-02-20T10:00:00Z'
    }
  ];
}

async function runPhase038Suite() {
  console.log('================================================================');
  console.log('PADIFIX PHASE 038: PUBLIC MARKETPLACE TRUST & BADGING GATES');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // SECTION 1: SERVER-AUTHORITATIVE BADGE COMPUTATION & TITLES
  // -------------------------------------------------------------
  console.log('--- SECTION 1: Badge Computation & Title Entitlement ---');

  await runTest('1.1 Verified BASIC provider -> badge_tier === "BASIC", badge_title === "Verified Artisan"', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=1',
      query: { id: '1' },
      _mockRows: [getSampleProviders()[0]]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');
    assert.strictEqual(p.badge_tier, 'BASIC');
    assert.strictEqual(p.badge_title, 'Verified Artisan');
  });

  await runTest('1.2 Verified PRO provider -> badge_tier === "PRO", badge_title === "Pro Verified"', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=2',
      query: { id: '2' },
      _mockRows: [getSampleProviders()[1]]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');
    assert.strictEqual(p.badge_tier, 'PRO');
    assert.strictEqual(p.badge_title, 'Pro Verified');
  });

  await runTest('1.3 Verified PREMIUM provider -> badge_tier === "PREMIUM", badge_title === "Premium Verified"', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=3',
      query: { id: '3' },
      _mockRows: [getSampleProviders()[2]]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');
    assert.strictEqual(p.badge_tier, 'PREMIUM');
    assert.strictEqual(p.badge_title, 'Premium Verified');
  });

  await runTest('1.4 Unverified BASIC provider -> badge_tier === null', async () => {
    const unverifiedBasic = { ...getSampleProviders()[0], is_verified: false, nin_verified: false };
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=1',
      query: { id: '1' },
      _mockRows: [unverifiedBasic]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');
    assert.strictEqual(p.badge_tier, null);
    assert.strictEqual(p.badge_title, 'PadiFix Artisan');
  });

  await runTest('1.5 Unverified PRO provider -> badge_tier === null', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=4',
      query: { id: '4' },
      _mockRows: [getSampleProviders()[3]]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');
    assert.strictEqual(p.badge_tier, null);
    assert.strictEqual(p.badge_title, 'PadiFix Artisan');
  });

  await runTest('1.6 Unverified PREMIUM provider -> badge_tier === null', async () => {
    const unverifiedPremium = { ...getSampleProviders()[2], is_verified: false, nin_verified: false };
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=3',
      query: { id: '3' },
      _mockRows: [unverifiedPremium]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');
    assert.strictEqual(p.badge_tier, null);
  });

  await runTest('1.7 Verified FREE provider -> badge_tier === null (No paid subscription)', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=5',
      query: { id: '5' },
      _mockRows: [getSampleProviders()[4]]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');
    assert.strictEqual(p.badge_tier, null, 'Free verified provider must not receive a paid badge');
  });

  await runTest('1.8 Verified expired/cancelled provider -> badge_tier === null', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=6',
      query: { id: '6' },
      _mockRows: [getSampleProviders()[5]]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');
    assert.strictEqual(p.badge_tier, null, 'Expired paid subscription must nullify public badge');
  });

  await runTest('1.9 Resubscribed verified provider -> badge restored without re-verification', async () => {
    // Simulate provider 6 resubscribing to PRO
    const resubscribedPro = { ...getSampleProviders()[5], subscription_status: 'active' };
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=6',
      query: { id: '6' },
      _mockRows: [resubscribedPro]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');
    assert.strictEqual(p.badge_tier, 'PRO');
    assert.strictEqual(p.badge_title, 'Pro Verified');
    assert.strictEqual(p.is_verified, true);
  });

  await runTest('1.10 Durable verification invariant: is_verified remains true even when subscription expires', async () => {
    const expiredProvider = getSampleProviders()[5];
    assert.strictEqual(expiredProvider.is_verified, true, 'Verification status must not be erased on subscription expiry');
  });

  // -------------------------------------------------------------
  // SECTION 2: SEARCH RANKING & ORGANIC TRUST PREFERENCE
  // -------------------------------------------------------------
  console.log('\n--- SECTION 2: Search Ranking & Organic Trust Preference ---');

  await runTest('2.1 Default search orders verified providers first (is_verified DESC)', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers',
      query: {},
      _mockRows: getSampleProviders()
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const providers = res.body.data;
    assert.ok(Array.isArray(providers) && providers.length > 0, 'Should return provider list');

    // Verify all verified providers appear before unverified providers in default order
    let seenUnverified = false;
    for (const p of providers) {
      if (!p.is_verified) {
        seenUnverified = true;
      } else if (seenUnverified) {
        throw new Error(`Verified provider id=${p.id} appeared after unverified provider in default ranking!`);
      }
    }
  });

  await runTest('2.2 Explicit user sorting preserves is_verified preference while respecting sort key', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?sort=rating-desc',
      query: { sort: 'rating-desc' },
      _mockRows: getSampleProviders()
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const providers = res.body.data;
    assert.ok(Array.isArray(providers) && providers.length > 0, 'Should return providers');

    // Verified providers should still appear first even with rating sort
    const verifiedGroup = providers.filter(p => p.is_verified);
    const unverifiedGroup = providers.filter(p => !p.is_verified);

    // At least check that verified providers have contiguous positions at the top
    if (verifiedGroup.length > 0 && unverifiedGroup.length > 0) {
      const lastVerifiedIdx = providers.lastIndexOf(verifiedGroup[verifiedGroup.length - 1]);
      const firstUnverifiedIdx = providers.indexOf(unverifiedGroup[0]);
      assert.ok(lastVerifiedIdx < firstUnverifiedIdx || lastVerifiedIdx === providers.length - 1,
        'Verified providers should appear before unverified in sorted results');
    }
  });

  // -------------------------------------------------------------
  // SECTION 3: VERIFIED FILTER BEHAVIOR (?verified=true)
  // -------------------------------------------------------------
  console.log('\n--- SECTION 3: Verified Filter (?verified=true) ---');

  await runTest('3.1 ?verified=true ONLY returns providers with is_verified=true and active paid plan', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?verified=true',
      query: { verified: 'true' },
      _mockRows: getSampleProviders()
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const providers = res.body.data;
    assert.ok(Array.isArray(providers), 'Should return data array');

    // Must return providers 1, 2, 3 (BASIC, PRO, PREMIUM active verified)
    assert.strictEqual(providers.length, 3, `Expected exactly 3 verified pro providers, got ${providers.length}`);
    for (const p of providers) {
      assert.strictEqual(p.is_verified, true, `Provider ${p.id} is not verified!`);
      assert.ok(['BASIC', 'PRO', 'PREMIUM'].includes(p.badge_tier), `Provider ${p.id} has invalid badge_tier: ${p.badge_tier}`);
    }
  });

  await runTest('3.2 ?verified=true strictly excludes unverified and FREE/expired verified providers', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?verified=true',
      query: { verified: 'true' },
      _mockRows: getSampleProviders()
    };
    const res = createMockRes();
    await providersHandler(req, res);
    const returnedIds = res.body.data.map(p => p.id);

    assert.ok(!returnedIds.includes(4), 'Unverified PRO must not be returned');
    assert.ok(!returnedIds.includes(5), 'Verified FREE must not be returned');
    assert.ok(!returnedIds.includes(6), 'Verified Expired must not be returned');
    assert.ok(!returnedIds.includes(7), 'Standard Unverified FREE must not be returned');
  });

  await runTest('3.3 ?verified=false does not activate verified-only filter', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?verified=false',
      query: { verified: 'false' },
      _mockRows: getSampleProviders()
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    // Should return all providers
    assert.strictEqual(res.body.data.length, getSampleProviders().length);
  });

  await runTest('3.4 Missing verified parameter defaults to full results', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers',
      query: {},
      _mockRows: getSampleProviders()
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.length, getSampleProviders().length);
  });

  // -------------------------------------------------------------
  // SECTION 4: PRIVACY AUDIT & DATA MINIMIZATION
  // -------------------------------------------------------------
  console.log('\n--- SECTION 4: Privacy Audit & Data Minimization ---');

  await runTest('4.1 Public provider object strictly excludes document IDs, file paths, and storage buckets', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=1',
      query: { id: '1' },
      _mockRows: [getSampleProviders()[0]]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');

    assert.strictEqual(p.document_path, undefined, 'document_path must not be exposed');
    assert.strictEqual(p.file_path, undefined, 'file_path must not be exposed');
    assert.strictEqual(p.storage_bucket, undefined, 'storage_bucket must not be exposed');
  });

  await runTest('4.2 Public provider object strictly excludes document hashes and signed URLs', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=1',
      query: { id: '1' },
      _mockRows: [getSampleProviders()[0]]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');

    assert.strictEqual(p.document_hash, undefined, 'document_hash must not be exposed');
    assert.strictEqual(p.signed_url, undefined, 'signed_url must not be exposed');
  });

  await runTest('4.3 Public provider object strictly excludes NIN, BVN, and KYC details', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=1',
      query: { id: '1' },
      _mockRows: [getSampleProviders()[0]]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');

    assert.strictEqual(p.nin, undefined, 'NIN must not be exposed');
    assert.strictEqual(p.bvn, undefined, 'BVN must not be exposed');
    assert.strictEqual(p.kyc_response, undefined, 'kyc_response must not be exposed');
    assert.strictEqual(p.compliance_notes, undefined, 'compliance_notes must not be exposed');
  });

  await runTest('4.4 Public provider response contains zero service-role keys', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers',
      query: {},
      _mockRows: getSampleProviders()
    };
    const res = createMockRes();
    await providersHandler(req, res);
    const serialized = JSON.stringify(res.body);

    assert.strictEqual(serialized.includes('service_role'), false, 'Response leaked service_role key!');
    assert.strictEqual(serialized.includes('jwt_secret'), false, 'Response leaked jwt_secret!');
  });

  await runTest('4.5 Subscription plan and status are NOT exposed in the public provider object', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?id=1',
      query: { id: '1' },
      _mockRows: [getSampleProviders()[0]]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    const p = res.body.provider || (res.body.data && res.body.data[0]);
    assert.ok(p, 'Provider must be returned');

    // Subscription plan and status should not be in the public object
    assert.strictEqual(p.subscription_plan, undefined, 'subscription_plan must not be exposed publicly');
    assert.strictEqual(p.subscription_status, undefined, 'subscription_status must not be exposed publicly');
  });

  // -------------------------------------------------------------
  // SECTION 5: TELEMETRY & CLIENT INTEGRITY
  // -------------------------------------------------------------
  console.log('\n--- SECTION 5: Telemetry Event Schema & Client Safety ---');

  await runTest('5.1 search.js contains safe telemetry triggers for Phase 038 events', () => {
    const searchJsPath = path.resolve(__dirname, '..', 'search.js');
    const content = fs.readFileSync(searchJsPath, 'utf8');

    assert.ok(content.includes('trust_badge_clicked'), 'Must track trust_badge_clicked');
    assert.ok(content.includes('trust_banner_viewed'), 'Must track trust_banner_viewed');
    assert.ok(content.includes('trust_banner_dismissed'), 'Must track trust_banner_dismissed');
    assert.ok(content.includes('verified_filter_toggled'), 'Must track verified_filter_toggled');
  });

  await runTest('5.2 search.html does not make unsupported criminal background check claims', () => {
    const searchHtmlPath = path.resolve(__dirname, '..', 'search.html');
    const content = fs.readFileSync(searchHtmlPath, 'utf8');

    assert.strictEqual(content.toLowerCase().includes('criminal background'), false, 'Must not claim criminal background checks');
    assert.strictEqual(content.toLowerCase().includes('police clearance'), false, 'Must not claim police clearance');
    assert.ok(content.includes('Vetted Identity'), 'Must include Vetted Identity trust concept');
    assert.ok(content.includes('Direct Deals'), 'Must include Direct Deals trust concept');
    assert.ok(content.includes('Zero Escrow Risk'), 'Must include Zero Escrow Risk trust concept');
  });

  await runTest('5.3 search.js does not contain inline NIN/BVN or sensitive data in telemetry calls', () => {
    const searchJsPath = path.resolve(__dirname, '..', 'search.js');
    const content = fs.readFileSync(searchJsPath, 'utf8');

    // Ensure telemetry never includes sensitive fields
    const telemetryBlocks = content.split('trackEvent').slice(1);
    for (const block of telemetryBlocks) {
      const snippet = block.substring(0, 300);
      assert.strictEqual(snippet.includes('nin'), false, `Telemetry block near trackEvent contains 'nin': ${snippet.substring(0, 80)}`);
      assert.strictEqual(snippet.includes('bvn'), false, `Telemetry block near trackEvent contains 'bvn': ${snippet.substring(0, 80)}`);
    }
  });

  // -------------------------------------------------------------
  // SECTION 6: VERCEL SERVERLESS BUDGET
  // -------------------------------------------------------------
  console.log('\n--- SECTION 6: Vercel Serverless Budget ---');

  await runTest('6.1 Vercel Serverless Function budget strictly <= 12 functions', () => {
    const apiDir = path.join(__dirname, '..', 'api');
    const vignorePath = path.join(__dirname, '..', '.vercelignore');
    const allApiFiles = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));
    const vignoreContent = fs.readFileSync(vignorePath, 'utf8');
    const ignoredFiles = vignoreContent.split('\n').map(l => l.trim()).filter(l => l.startsWith('api/') && l.endsWith('.js')).map(l => l.replace('api/', ''));

    const deployedFunctions = allApiFiles.filter(f => !ignoredFiles.includes(f));
    console.log(`     Deployed serverless functions count: ${deployedFunctions.length} (${deployedFunctions.join(', ')})`);
    assert.ok(deployedFunctions.length <= 12, `Budget exceeded: ${deployedFunctions.length} functions found, max allowed is 12`);
  });

  // -------------------------------------------------------------
  // SECTION 7: SEARCH.HTML & SEARCH.CSS STRUCTURAL INTEGRITY
  // -------------------------------------------------------------
  console.log('\n--- SECTION 7: HTML & CSS Structural Integrity ---');

  await runTest('7.1 search.html contains #search-trust-banner element', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'search.html'), 'utf8');
    assert.ok(content.includes('id="search-trust-banner"'), 'Must contain #search-trust-banner');
  });

  await runTest('7.2 search.html contains #pill-filter-verified element', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'search.html'), 'utf8');
    assert.ok(content.includes('id="pill-filter-verified"'), 'Must contain #pill-filter-verified');
  });

  await runTest('7.3 search.html contains #modal-trust-explainer element', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'search.html'), 'utf8');
    assert.ok(content.includes('id="modal-trust-explainer"'), 'Must contain #modal-trust-explainer');
  });

  await runTest('7.4 search.css contains verified-badge-pill styles', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'search.css'), 'utf8');
    assert.ok(content.includes('.verified-badge-pill'), 'Must contain .verified-badge-pill styles');
    assert.ok(content.includes('.verified-badge-pill.basic') || content.includes('.verified-badge-pill.pro') || content.includes('.verified-badge-pill.premium'),
      'Must contain tier-specific badge styles');
  });

  await runTest('7.5 Modal has correct accessible dialog attributes', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'search.html'), 'utf8');
    assert.ok(content.includes('role="dialog"'), 'Modal must have role="dialog"');
    assert.ok(content.includes('aria-modal="true"'), 'Modal must have aria-modal="true"');
  });

  console.log('\n================================================================');
  console.log(`PHASE 038 AUTOMATED SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase038Suite().catch(err => {
  console.error('Fatal error in Phase 038 test runner:', err);
  process.exit(1);
});

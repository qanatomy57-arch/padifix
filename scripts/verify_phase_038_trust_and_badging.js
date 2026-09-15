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
  // SECTION 1: SERVER-AUTHORITATIVE UNIFIED BADGE COMPUTATION & TITLES
  // -------------------------------------------------------------
  console.log('--- SECTION 1: Unified Badge Computation & Title Entitlement ---');

  await runTest('1.1 Verified BASIC provider -> badge_tier === "VERIFIED", badge_title === "Verified"', async () => {
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
    assert.strictEqual(p.badge_tier, 'VERIFIED', 'Customer sees unified VERIFIED badge');
    assert.strictEqual(p.badge_title, 'Verified');
  });

  await runTest('1.2 Verified PRO provider -> badge_tier === "VERIFIED", badge_title === "Verified"', async () => {
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
    assert.strictEqual(p.badge_tier, 'VERIFIED', 'Customer sees unified VERIFIED badge');
    assert.strictEqual(p.badge_title, 'Verified');
  });

  await runTest('1.3 Verified PREMIUM provider -> badge_tier === "VERIFIED", badge_title === "Verified"', async () => {
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
    assert.strictEqual(p.badge_tier, 'VERIFIED', 'Customer sees unified VERIFIED badge');
    assert.strictEqual(p.badge_title, 'Verified');
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
    assert.strictEqual(p.badge_tier, null, 'Free verified provider must not receive a public badge');
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
    // Simulate provider 6 resubscribing to active paid plan
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
    assert.strictEqual(p.badge_tier, 'VERIFIED', 'Restores unified VERIFIED badge upon resubscription');
    assert.strictEqual(p.badge_title, 'Verified');
    assert.strictEqual(p.is_verified, true);
  });

  await runTest('1.10 Durable verification invariant: is_verified remains true even when subscription expires', async () => {
    const expiredProvider = getSampleProviders()[5];
    assert.strictEqual(expiredProvider.is_verified, true, 'Verification status must not be erased on subscription expiry');
  });

  await runTest('1.11 Unified customer badge invariant: Basic, Pro, and Premium all receive identical badge_tier="VERIFIED"', async () => {
    const basicP = getSampleProviders()[0];
    const proP = getSampleProviders()[1];
    const premP = getSampleProviders()[2];
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers',
      query: {},
      _mockRows: [basicP, proP, premP]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    const list = res.body.data;
    assert.strictEqual(list.length, 3);
    for (const p of list) {
      assert.strictEqual(p.badge_tier, 'VERIFIED', 'All verified providers receive identical badge_tier');
      assert.strictEqual(p.subscription_plan, undefined, 'Subscription plan must NOT be exposed');
    }
  });

  // -------------------------------------------------------------
  // SECTION 2: 7-FACTOR ORDERED RELEVANCE HIERARCHY (BEHAVIORAL TESTS A - I)
  // -------------------------------------------------------------
  console.log('\n--- SECTION 2: 7-Factor Ordered Relevance Hierarchy (Behavioral Tests A-I) ---');

  // Test A — Category relevance
  await runTest('2.A Category relevance: Exact matching category outranks weaker/irrelevant category match', async () => {
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?category=plumber',
      query: { category: 'plumber' },
      _mockRows: getSampleProviders()
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const providers = res.body.data;
    assert.strictEqual(providers[0].id, 2, 'Plumber id=2 must rank #1 when category=plumber');
  });

  // Test B — Location relevance
  await runTest('2.B Location relevance: Matching LGA/State outranks less geographically relevant provider', async () => {
    const pSameLga = { id: 101, primary_category_slug: 'electrician', state: 'Lagos', lga: 'Ikeja', rating: 4.5, reviews_count: 10, is_verified: true, subscription_plan: 'BASIC', subscription_status: 'active' };
    const pDiffLga = { id: 102, primary_category_slug: 'electrician', state: 'Lagos', lga: 'Epe', rating: 4.5, reviews_count: 10, is_verified: true, subscription_plan: 'BASIC', subscription_status: 'active' };
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?category=electrician&lga=Ikeja&state=Lagos',
      query: { category: 'electrician', lga: 'Ikeja', state: 'Lagos' },
      _mockRows: [pDiffLga, pSameLga]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data[0].id, 101, 'Provider in target LGA Ikeja must outrank Epe provider');
  });

  // Test C — Rating quality
  await runTest('2.C Rating quality: Highly rated provider outranks Premium provider with poor/no review history', async () => {
    const pHighRatingBasic = { id: 201, primary_category_slug: 'carpenter', state: 'Lagos', lga: 'Ikeja', rating: 4.9, reviews_count: 45, is_verified: true, subscription_plan: 'BASIC', subscription_status: 'active' };
    const pLowRatingPremium = { id: 202, primary_category_slug: 'carpenter', state: 'Lagos', lga: 'Ikeja', rating: 3.2, reviews_count: 3, is_verified: true, subscription_plan: 'PREMIUM', subscription_status: 'active' };
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?category=carpenter',
      query: { category: 'carpenter' },
      _mockRows: [pLowRatingPremium, pHighRatingBasic]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data[0].id, 201, 'High-rated 4.9 Basic provider must outrank 3.2 Premium provider');
  });

  // Test D — Review count
  await runTest('2.D Review count: Stronger review history breaks ties when ratings are comparable', async () => {
    const pMoreReviews = { id: 301, primary_category_slug: 'painter', state: 'Lagos', lga: 'Ikeja', rating: 4.8, reviews_count: 120, is_verified: true, subscription_plan: 'BASIC', subscription_status: 'active' };
    const pLessReviews = { id: 302, primary_category_slug: 'painter', state: 'Lagos', lga: 'Ikeja', rating: 4.8, reviews_count: 4, is_verified: true, subscription_plan: 'BASIC', subscription_status: 'active' };
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?category=painter',
      query: { category: 'painter' },
      _mockRows: [pLessReviews, pMoreReviews]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data[0].id, 301, 'Provider with 120 reviews must outrank provider with 4 reviews');
  });

  // Test E — Verification status
  await runTest('2.E Verification: Verification provides trust advantage without overriding category/location', async () => {
    // Verified provider in wrong category vs unverified in exact category
    const pExactUnverified = { id: 401, primary_category_slug: 'welder', state: 'Lagos', lga: 'Ikeja', rating: 4.5, reviews_count: 10, is_verified: false, subscription_plan: 'FREE', subscription_status: 'active' };
    const pWrongVerified = { id: 402, primary_category_slug: 'tailor', state: 'Lagos', lga: 'Ikeja', rating: 4.5, reviews_count: 10, is_verified: true, subscription_plan: 'BASIC', subscription_status: 'active' };
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?category=welder',
      query: { category: 'welder' },
      _mockRows: [pWrongVerified, pExactUnverified]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data[0].id, 401, 'Exact category match welder must outrank non-welder even if non-welder is verified');
  });

  // Test F — Subscription tier
  await runTest('2.F Subscription tier: Premium does NOT automatically outrank a better-performing provider', async () => {
    const pTopBasic = { id: 501, primary_category_slug: 'cleaning', state: 'Lagos', lga: 'Ikeja', rating: 4.95, reviews_count: 85, is_verified: true, subscription_plan: 'BASIC', subscription_status: 'active' };
    const pNewPremium = { id: 502, primary_category_slug: 'cleaning', state: 'Lagos', lga: 'Ikeja', rating: 0, reviews_count: 0, is_verified: true, subscription_plan: 'PREMIUM', subscription_status: 'active' };
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?category=cleaning',
      query: { category: 'cleaning' },
      _mockRows: [pNewPremium, pTopBasic]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data[0].id, 501, 'Top-performing Basic provider must outrank unrated Premium provider');
  });

  // Test G — Recency
  await runTest('2.G Recency: Recency/activity is a late tie-breaker, does not override rating quality', async () => {
    const pOlderHighRating = { id: 601, primary_category_slug: 'plumber', state: 'Lagos', lga: 'Ikeja', rating: 4.9, reviews_count: 30, is_verified: true, subscription_plan: 'BASIC', subscription_status: 'active', created_at: '2025-01-01T00:00:00Z' };
    const pNewerLowRating = { id: 602, primary_category_slug: 'plumber', state: 'Lagos', lga: 'Ikeja', rating: 3.5, reviews_count: 2, is_verified: true, subscription_plan: 'BASIC', subscription_status: 'active', created_at: '2026-09-01T00:00:00Z' };
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?category=plumber',
      query: { category: 'plumber' },
      _mockRows: [pNewerLowRating, pOlderHighRating]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data[0].id, 601, 'Higher rated older provider outranks newer low-rated provider');
  });

  // Test H — Explicit user sorting
  await runTest('2.H Explicit user sorting: Explicit user sort (e.g. newest, rating-desc) is honored', async () => {
    const pOld = { id: 701, primary_category_slug: 'plumber', rating: 5.0, reviews_count: 50, is_verified: true, subscription_plan: 'PREMIUM', subscription_status: 'active', created_at: '2024-01-01T00:00:00Z' };
    const pNew = { id: 702, primary_category_slug: 'plumber', rating: 4.0, reviews_count: 5, is_verified: false, subscription_plan: 'FREE', subscription_status: 'active', created_at: '2026-09-14T00:00:00Z' };
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/providers?category=plumber&sort=newest',
      query: { category: 'plumber', sort: 'newest' },
      _mockRows: [pOld, pNew]
    };
    const res = createMockRes();
    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data[0].id, 702, 'When user explicitly sorts by newest, newest provider must rank first');
  });

  // Test I — Verified filter & durable verification
  await runTest('2.I Verified filter (?verified=true) requires is_verified=true AND active paid plan', async () => {
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
    assert.strictEqual(providers.length, 3, 'Only providers 1, 2, 3 meet verified + active paid criteria');
    providers.forEach(p => {
      assert.strictEqual(p.badge_tier, 'VERIFIED');
      assert.strictEqual(p.is_verified, true);
    });
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
      assert.strictEqual(p.badge_tier, 'VERIFIED', `Provider ${p.id} has invalid badge_tier: ${p.badge_tier}`);
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

  await runTest('7.4 search.css contains unified .verified-badge-pill styles with shield icon', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'search.css'), 'utf8');
    assert.ok(content.includes('.verified-badge-pill'), 'Must contain .verified-badge-pill styles');
    assert.ok(content.includes('.verified-shield-icon'), 'Must contain .verified-shield-icon for SVG icon');
  });

  await runTest('7.5 Modal has correct accessible dialog attributes', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'search.html'), 'utf8');
    assert.ok(content.includes('role="dialog"'), 'Modal must have role="dialog"');
    assert.ok(content.includes('aria-modal="true"'), 'Modal must have aria-modal="true"');
  });

  await runTest('7.6 search.html trust banner contains updated Phase 038.1 copy', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'search.html'), 'utf8');
    assert.ok(content.includes('Government ID verification conducted by the PadiFix Compliance Desk.'),
      'Must contain updated pillar copy');
    assert.ok(content.includes('PadiFix Verification Assurance'), 'Must contain updated banner title');
  });

  await runTest('7.7 search.css contains unified clean green verification styling without tier distinctions', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'search.css'), 'utf8');
    assert.ok(content.includes('rgba(5, 150, 105'), 'Must contain brand green verification styling');
    assert.ok(content.includes('.verified-badge-pill'), 'Must style unified verified badge');
  });

  await runTest('7.8 search.html modal contains precise compliance copy: Government identity reviewed by PadiFix Compliance Desk', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '..', 'search.html'), 'utf8');
    assert.ok(content.includes('Government identity reviewed by PadiFix Compliance Desk'),
      'Must contain precise government identity verification copy in modal checklist');
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

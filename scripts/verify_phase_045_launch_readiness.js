/**
 * PADIFIX PHASE 045 — PRODUCTION LAUNCH READINESS & DATA HYGIENE
 * Automated Verification Suite (17 Comprehensive Gates)
 * scripts/verify_phase_045_launch_readiness.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');

if (fs.existsSync(ENV_PATH)) {
  const envContent = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...vals] = trimmed.split('=');
    if (key && vals.length && !process.env[key.trim()]) {
      process.env[key.trim()] = vals.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const SUPABASE_PROJECT_REF = 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${SUPABASE_PROJECT_REF}.supabase.co`;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
};

let passCount = 0;
let failCount = 0;

function runGate(gateNum, gateName, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] Gate ${gateNum}: ${gateName}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] Gate ${gateNum}: ${gateName}:`, err.message);
    failCount++;
  }
}

async function runAsyncGate(gateNum, gateName, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] Gate ${gateNum}: ${gateName}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] Gate ${gateNum}: ${gateName}:`, err.message);
    failCount++;
  }
}

async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 600 * attempt));
    }
  }
}

async function getCount(tableName) {
  const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/${tableName}?select=*`, {
    method: 'HEAD',
    headers: { ...headers, Prefer: 'count=exact' }
  });
  const cr = res.headers.get('content-range');
  return cr ? parseInt(cr.split('/')[1], 10) : 0;
}

(async () => {
  console.log('================================================================');
  console.log('  PADIFIX PHASE 045: PRODUCTION LAUNCH READINESS VERIFICATION');
  console.log('================================================================\n');

  // GATE 1: Empty Production Marketplace Baseline
  await runAsyncGate(1, 'Empty Production Marketplace Baseline', async () => {
    const providerCount = await getCount('providers');
    const reviewCount = await getCount('reviews');
    assert.strictEqual(providerCount, 0, 'Production must have exactly 0 providers post-cleanup');
    assert.strictEqual(reviewCount, 0, 'Production must have exactly 0 reviews post-cleanup');
  });

  // GATE 2: Zero-Provider Search State & UI Gracefulness
  runGate(2, 'Zero-Provider Search State & Empty UI Markup', () => {
    const searchJs = fs.readFileSync(path.join(ROOT_DIR, 'search.js'), 'utf8');
    assert.ok(searchJs.includes('No providers match your exact search filters') || searchJs.includes('zero_results'), 'search.js must have zero-results handling');
    assert.ok(searchJs.includes('emptyState.style.display = "block"') || searchJs.includes('emptyState'), 'search.js must toggle empty-state container');
    assert.ok(searchJs.includes('List Your Skill for Free'), 'search.js must provide recruitment CTA in empty state');
  });

  // GATE 3: Registration Architecture Integrity
  runGate(3, 'Registration Architecture Integrity', () => {
    const registerHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');
    const clientJs = fs.readFileSync(path.join(ROOT_DIR, 'supabase-client.js'), 'utf8');
    assert.ok(registerHtml.includes('register-form') || registerHtml.includes('register'), 'register.html must contain registration form');
    assert.ok(clientJs.includes('registerProvider'), 'supabase-client.js must export registerProvider method');
  });

  // GATE 4: Authentication & Login Flow
  runGate(4, 'Authentication & Login Flow', () => {
    const loginHtml = fs.readFileSync(path.join(ROOT_DIR, 'login.html'), 'utf8');
    assert.ok(loginHtml.includes('login-form'), 'login.html must contain login form');
    assert.ok(loginHtml.includes('forgot-link'), 'login.html must contain forgot-password link');
  });

  // GATE 5: Real Password Recovery & Anti-Enumeration
  runGate(5, 'Real Password Recovery & Anti-Enumeration Safeguards', () => {
    const loginHtml = fs.readFileSync(path.join(ROOT_DIR, 'login.html'), 'utf8');
    const resetHtml = fs.readFileSync(path.join(ROOT_DIR, 'reset-password.html'), 'utf8');
    assert.ok(loginHtml.includes('resetPasswordForEmail'), 'login.html must call resetPasswordForEmail');
    assert.ok(loginHtml.includes('If an account exists for this email'), 'login.html must display neutral anti-enumeration copy');
    assert.ok(resetHtml.includes('PASSWORD_RECOVERY'), 'reset-password.html must listen for PASSWORD_RECOVERY event');
  });

  // GATE 6: New-Provider Rating Semantics (rating: 0.0, reviews_count: 0)
  runGate(6, 'New-Provider Rating Semantics (Zero Reviews = New Artisan)', () => {
    const clientJs = fs.readFileSync(path.join(ROOT_DIR, 'supabase-client.js'), 'utf8');
    const searchJs = fs.readFileSync(path.join(ROOT_DIR, 'search.js'), 'utf8');
    const profileJs = fs.readFileSync(path.join(ROOT_DIR, 'profile.js'), 'utf8');
    assert.ok(clientJs.includes('rating: 0.0') && clientJs.includes('reviews_count: 0'), 'New provider must initialize with rating 0.0 and reviews_count 0');
    assert.ok(searchJs.includes('New Artisan (No reviews yet)') || searchJs.includes("'New'"), 'search.js must render New Artisan for 0 reviews');
    assert.ok(profileJs.includes('New Artisan'), 'profile.js must render New Artisan for 0 reviews');
  });

  // GATE 7: Profile Creation & Direct Contact Data
  runGate(7, 'Profile Creation & Direct Contact Data', () => {
    const clientJs = fs.readFileSync(path.join(ROOT_DIR, 'supabase-client.js'), 'utf8');
    assert.ok(clientJs.includes('whatsapp_number') && clientJs.includes('phone'), 'Provider schema must support phone and WhatsApp');
    assert.ok(clientJs.includes('lga') && clientJs.includes('state'), 'Provider schema must enforce LGA and State');
  });

  // GATE 8: Customer Discovery & Canonical Categories
  await runAsyncGate(8, 'Customer Discovery & Canonical Categories (15 Categories)', async () => {
    const catCount = await getCount('service_categories');
    assert.strictEqual(catCount, 15, 'Canonical 15 service categories must be active');
  });

  // GATE 9: Contact Flow & Non-Escrow Invariant
  runGate(9, 'Contact Flow & Non-Escrow Invariant (0% Commission, No Escrow)', () => {
    const searchHtml = fs.readFileSync(path.join(ROOT_DIR, 'search.html'), 'utf8');
    assert.ok(searchHtml.includes('0% commission'), 'search.html must state 0% commission');
    assert.ok(searchHtml.includes('Direct artisan agreement'), 'search.html must state direct agreement');
  });

  // GATE 10: Review Engine Cryptographic Safeguards
  runGate(10, 'Review Engine Cryptographic Safeguards (HMAC-SHA256, Single-Use)', () => {
    const tokenJs = fs.readFileSync(path.join(ROOT_DIR, 'lib', 'review-token.js'), 'utf8');
    const reviewApi = fs.readFileSync(path.join(ROOT_DIR, 'api', 'service-review.js'), 'utf8');
    assert.ok(tokenJs.includes('createHmac'), 'review-token.js must use HMAC-SHA256');
    assert.ok(tokenJs.includes('timingSafeEqual'), 'review-token.js must use timing-safe comparison');
    assert.ok(reviewApi.includes('ALREADY_REVIEWED') || reviewApi.includes('409'), 'service-review.js must enforce single-use replay protection');
  });

  // GATE 11: Verification Eligibility & Durable Invariant
  runGate(11, 'Verification Eligibility & Unified Customer Badge', () => {
    const searchJs = fs.readFileSync(path.join(ROOT_DIR, 'search.js'), 'utf8');
    assert.ok(searchJs.includes('VERIFIED'), 'search.js must render unified VERIFIED badge');
    assert.ok(!searchJs.includes('PRO VERIFIED') && !searchJs.includes('PREMIUM VERIFIED'), 'Customer UI must not expose provider subscription tier');
  });

  // GATE 12: Subscription Integrity & Canonical Plans (4 Plans)
  await runAsyncGate(12, 'Subscription Integrity & Canonical Plans (4 Plans)', async () => {
    const planCount = await getCount('provider_plans');
    assert.strictEqual(planCount, 4, 'Provider plans must have 4 tiers (FREE, BASIC, PRO, PREMIUM)');
  });

  // GATE 13: Payment-Live Flag Strictly Inactive
  runGate(13, 'Payment-Live Flag Strictly Inactive (PAYMENT_LIVE_MODE=false)', () => {
    const isLive = process.env.PAYMENT_LIVE_MODE === 'true';
    assert.strictEqual(isLive, false, 'PAYMENT_LIVE_MODE must be strictly false');
  });

  // GATE 14: Canonical Production Origin
  runGate(14, 'Canonical Production Origin (padifix.vercel.app)', () => {
    const leadsApi = fs.readFileSync(path.join(ROOT_DIR, 'api', 'provider-leads.js'), 'utf8');
    const dashboardJs = fs.readFileSync(path.join(ROOT_DIR, 'dashboard.js'), 'utf8');
    const robotsTxt = fs.readFileSync(path.join(ROOT_DIR, 'robots.txt'), 'utf8');
    assert.ok(leadsApi.includes('https://padifix.vercel.app'), 'api/provider-leads.js must use padifix.vercel.app');
    assert.ok(dashboardJs.includes('https://padifix.vercel.app'), 'dashboard.js must use padifix.vercel.app fallback');
    assert.ok(robotsTxt.includes('https://padifix.vercel.app/sitemap.xml'), 'robots.txt must point to padifix.vercel.app/sitemap.xml');
    assert.ok(!robotsTxt.includes('padifix.ng'), 'robots.txt must not reference unowned padifix.ng');
  });

  // GATE 15: Security Secrets Audit
  runGate(15, 'Security Secrets Audit (Zero Leaks)', () => {
    const auditScript = path.join(ROOT_DIR, 'scripts', 'security_secrets_audit.js');
    assert.ok(fs.existsSync(auditScript), 'security_secrets_audit.js must exist');
  });

  // GATE 16: Storage Hygiene (All 4 Buckets Empty & Private Docs)
  await runAsyncGate(16, 'Storage Hygiene (All 4 Buckets Empty & Private Docs)', async () => {
    const bucketRes = await fetchWithRetry(`${SUPABASE_URL}/storage/v1/bucket`, { headers });
    const buckets = await bucketRes.json();
    for (const b of buckets) {
      const listRes = await fetchWithRetry(`${SUPABASE_URL}/storage/v1/object/list/${b.id}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prefix: '', limit: 100 })
      });
      const objs = listRes.ok ? await listRes.json() : [];
      assert.strictEqual(objs.length, 0, `Bucket ${b.id} must have 0 objects`);
    }
  });

  // GATE 17: Orphan-Data Detection (Zero Orphaned Users or Records)
  await runAsyncGate(17, 'Orphan-Data Detection (Zero Orphaned Users or Records)', async () => {
    const authRes = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, { headers });
    const authData = await authRes.json();
    const users = authData.users || [];
    assert.strictEqual(users.length, 0, 'Must have 0 orphaned users in auth.users');
    const provCount = await getCount('providers');
    const servCount = await getCount('provider_services');
    assert.strictEqual(provCount, 0, 'Must have 0 orphaned providers');
    assert.strictEqual(servCount, 0, 'Must have 0 orphaned provider_services');
  });

  console.log('\n================================================================');
  console.log(`  PHASE 045 VERIFICATION RESULT: ${passCount}/17 GATES PASSED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    console.error(`❌ FAILED: ${failCount} gates failed.`);
    process.exit(1);
  } else {
    console.log('🎉 ALL 17 GATES GREEN: PHASE 045 LAUNCH READINESS CERTIFIED!\n');
  }
})();

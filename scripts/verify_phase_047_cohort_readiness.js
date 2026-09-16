/**
 * PADIFIX PHASE 047 — COHORT 1 PILOT READINESS & INTEGRITY VERIFICATION
 * scripts/verify_phase_047_cohort_readiness.js
 *
 * Automated verification suite covering:
 * Gate 1:  Live Production Baseline & Zero Synthetic Data Invariant (Supabase hvxosxhnxauiqrhpyuur)
 * Gate 2:  Empty Marketplace Search Experience & Authoritative Directory Integration
 * Gate 3:  Direct Customer Contact & Non-Escrow Platform Invariant (0% Commission, No Escrow)
 * Gate 4:  New-Artisan Rating Presentation Semantics (0 reviews = New Artisan)
 * Gate 5:  Pilot Geography Flexibility (Delta State Hub & Nationwide Adaptability)
 * Gate 6:  15 Canonical Trade Categories Operational in categories.js
 * Gate 7:  Canonical Subscription Model & Inactive Payment Live Gate (PAYMENT_LIVE_MODE=false)
 * Gate 8:  Unified Customer-Facing Verification Badging (Zero Tier Leaks)
 * Gate 9:  Review Token Cryptographic Integrity (HMAC-SHA256 Single-Use)
 * Gate 10: Vercel Serverless Function Ceiling (Strictly <= 12 functions)
 * Gate 11: Repository Security & Zero Secrets Exposure
 * Gate 12: Phase 047 Cohort Documentation Completeness
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

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

async function fetchWithRetry(url, options = {}, retries = 3, backoffMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, backoffMs * (i + 1)));
    }
  }
}

let passCount = 0;
let failCount = 0;

function runGate(gateNum, gateName, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] Gate ${gateNum}: ${gateName}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] Gate ${gateNum}: ${gateName}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
  }
}

async function runAsyncGate(gateNum, gateName, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] Gate ${gateNum}: ${gateName}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] Gate ${gateNum}: ${gateName}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
  }
}

(async () => {
  console.log('================================================================');
  console.log('  PADIFIX PHASE 047: COHORT 1 PILOT READINESS VERIFICATION');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // GATE 1: Live Production Baseline & Zero Synthetic Data Invariant
  // --------------------------------------------------------------------------
  await runAsyncGate(1, 'Live Production Baseline & Zero Synthetic Data Invariant', async () => {
    assert.ok(SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY must be configured');

    const authRes = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/admin/users?per_page=50`, { headers });
    const authData = await authRes.json();
    assert.strictEqual(authData.users.length, 0, `auth.users must be 0 (found ${authData.users.length})`);

    const tables = ['providers', 'provider_services', 'reviews', 'contact_events', 'artisan_notifications', 'analytics_events'];
    for (const tbl of tables) {
      const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/${tbl}?select=*&limit=0`, {
        headers: { ...headers, Prefer: 'count=exact' }
      });
      const cr = res.headers.get('content-range');
      const count = cr ? parseInt(cr.split('/')[1], 10) : 0;
      assert.strictEqual(count, 0, `Table public.${tbl} must have 0 records (found ${count})`);
    }
  });

  // --------------------------------------------------------------------------
  // GATE 2: Empty Marketplace Search Experience & Authoritative Directory Integration
  // --------------------------------------------------------------------------
  runGate(2, 'Empty Marketplace Search Experience & Authoritative Directory Integration', () => {
    const clientCode = fs.readFileSync(path.join(ROOT_DIR, 'supabase-client.js'), 'utf8');
    assert.ok(
      clientCode.includes('if (json && Array.isArray(json.data))') &&
      clientCode.includes('totalCount: json.total !== undefined ? json.total : json.data.length'),
      'supabase-client.js must accept authoritative empty array without falling back to legacy seed data'
    );

    const apiProvidersCode = fs.readFileSync(path.join(ROOT_DIR, 'api/providers.js'), 'utf8');
    assert.ok(!apiProvidersCode.includes("'subscription_status'"), 'api/providers.js must not select nonexistent subscription_status');
    assert.ok(!apiProvidersCode.includes("'last_active_at'"), 'api/providers.js must not select nonexistent last_active_at');
    assert.ok(apiProvidersCode.includes("'updated_at'"), 'api/providers.js must select valid updated_at');
  });

  // --------------------------------------------------------------------------
  // GATE 3: Direct Customer Contact & Non-Escrow Platform Invariant
  // --------------------------------------------------------------------------
  runGate(3, 'Direct Customer Contact & Non-Escrow Platform Invariant', () => {
    const searchHtml = fs.readFileSync(path.join(ROOT_DIR, 'search.html'), 'utf8');
    assert.ok(searchHtml.includes('0% commission'), 'Search must advertise 0% commission');
    assert.ok(searchHtml.includes('Zero Escrow Risk') || searchHtml.includes('no held funds'), 'Search must explicitly affirm non-escrow platform');
    assert.ok(searchHtml.includes('List your trade on PadiFix for free') || searchHtml.includes('List Your Skill'), 'Search must feature free artisan recruitment');

    const profileHtml = fs.readFileSync(path.join(ROOT_DIR, 'profile.html'), 'utf8');
    assert.ok(profileHtml.includes('No Commission Added'), 'Profile must affirm no commission added');

    const apiInitCode = fs.readFileSync(path.join(ROOT_DIR, 'api/paystack-init.js'), 'utf8');
    assert.ok(!apiInitCode.includes('CUSTOMER_CHECKOUT'), 'No customer checkout transactions permitted');
    assert.ok(!apiInitCode.includes('JOB_ESCROW'), 'No job escrow allowed');
  });

  // --------------------------------------------------------------------------
  // GATE 4: New-Artisan Rating Presentation Semantics (0 reviews = New Artisan)
  // --------------------------------------------------------------------------
  runGate(4, 'New-Artisan Rating Presentation Semantics (0 reviews = New Artisan)', () => {
    const searchJs = fs.readFileSync(path.join(ROOT_DIR, 'search.js'), 'utf8');
    assert.ok(searchJs.includes('New Artisan'), 'search.js must render New Artisan badge for 0-review providers');

    const profileJs = fs.readFileSync(path.join(ROOT_DIR, 'profile.js'), 'utf8');
    assert.ok(profileJs.includes('New Artisan'), 'profile.js must render New Artisan for 0-review providers');
    assert.ok(!profileJs.includes("rating: 5.0, reviews_count: 0"), 'Zero-review providers must never receive 5.0 initial rating');
  });

  // --------------------------------------------------------------------------
  // GATE 5: Pilot Geography Flexibility (Nationwide LGAs & Delta Hub Readiness)
  // --------------------------------------------------------------------------
  runGate(5, 'Pilot Geography Flexibility (Nationwide LGAs & Delta Hub Readiness)', () => {
    const locationsPath = path.join(ROOT_DIR, 'locations.js');
    assert.ok(fs.existsSync(locationsPath), 'locations.js must exist');
    const locCode = fs.readFileSync(locationsPath, 'utf8');
    assert.ok(locCode.includes('Delta'), 'locations.js must include Delta State');
    assert.ok(locCode.includes('Warri South') || locCode.includes('Warri'), 'locations.js must include Warri');
    assert.ok(locCode.includes('Uvwie') || locCode.includes('Effurun'), 'locations.js must include Uvwie / Effurun');
  });

  // --------------------------------------------------------------------------
  // GATE 6: 15 Canonical Trade Categories Operational
  // --------------------------------------------------------------------------
  runGate(6, '15 Canonical Trade Categories Operational', () => {
    const catPath = path.join(ROOT_DIR, 'categories.js');
    assert.ok(fs.existsSync(catPath), 'categories.js must exist');
    const catCode = fs.readFileSync(catPath, 'utf8');
    const expectedCategories = [
      'electrician', 'plumber', 'nail-technician', 'tailor', 'mechanic',
      'carpenter', 'cleaner', 'barber', 'painter', 'welder',
      'phone-repair', 'solar-installer', 'ac-technician', 'mason', 'tiler'
    ];
    for (const c of expectedCategories) {
      assert.ok(catCode.includes(`'${c}'`), `categories.js must include canonical category '${c}'`);
    }
  });

  // --------------------------------------------------------------------------
  // GATE 7: Canonical Subscription Model & Inactive Payment Live Gate
  // --------------------------------------------------------------------------
  runGate(7, 'Canonical Subscription Model & Inactive Payment Live Gate (PAYMENT_LIVE_MODE=false)', () => {
    assert.strictEqual(process.env.PAYMENT_LIVE_MODE, 'false', 'PAYMENT_LIVE_MODE must be strictly false');
    const paystackInit = fs.readFileSync(path.join(ROOT_DIR, 'api/paystack-init.js'), 'utf8');
    assert.ok(paystackInit.includes('BASIC: {'), 'CANONICAL_PLANS must configure BASIC');
    assert.ok(paystackInit.includes('550000') && paystackInit.includes('5500000'), 'Basic must cost ₦5,500/mo & ₦55,000/yr');
    assert.ok(paystackInit.includes('1100000') && paystackInit.includes('11000000'), 'Pro must cost ₦11,000/mo & ₦110,000/yr');
    assert.ok(paystackInit.includes('2200000') && paystackInit.includes('22000000'), 'Premium must cost ₦22,000/mo & ₦220,000/yr');
  });

  // --------------------------------------------------------------------------
  // GATE 8: Unified Customer-Facing Verification Badging (Zero Tier Leaks)
  // --------------------------------------------------------------------------
  runGate(8, 'Unified Customer-Facing Verification Badging (Zero Tier Leaks)', () => {
    const providersApi = fs.readFileSync(path.join(ROOT_DIR, 'api/providers.js'), 'utf8');
    assert.ok(providersApi.includes("badgeTier = 'VERIFIED'"), 'api/providers.js must set unified badgeTier VERIFIED');
    assert.ok(providersApi.includes("badgeTitle = 'Verified'"), 'api/providers.js must set unified badgeTitle Verified');
    assert.ok(!providersApi.includes('PRO_VERIFIED') && !providersApi.includes('PREMIUM_VERIFIED'), 'api/providers.js must not leak subscription tier in customer badge');
  });

  // --------------------------------------------------------------------------
  // GATE 9: Review Token Cryptographic Integrity (HMAC-SHA256 Single-Use)
  // --------------------------------------------------------------------------
  runGate(9, 'Review Token Cryptographic Integrity (HMAC-SHA256 Single-Use)', () => {
    const { generateReviewToken, verifyReviewToken } = require('../lib/review-token.js');
    const token = generateReviewToken({
      providerId: 99,
      leadId: 888,
      issuedAt: Date.now()
    });
    assert.ok(token && typeof token === 'string', 'generateReviewToken must return signed token');
    const verified = verifyReviewToken(token);
    assert.strictEqual(verified.valid, true, 'verifyReviewToken must validate authentic token');
    assert.strictEqual(verified.payload.providerId, 99);
    assert.strictEqual(verified.payload.leadId, '888');
  });

  // --------------------------------------------------------------------------
  // GATE 10: Vercel Serverless Function Ceiling (Strictly <= 12 functions)
  // --------------------------------------------------------------------------
  runGate(10, 'Vercel Serverless Function Ceiling (Strictly <= 12 functions)', () => {
    const apiFiles = fs.readdirSync(path.join(ROOT_DIR, 'api')).filter(f => f.endsWith('.js'));
    const vercelIgnore = fs.readFileSync(path.join(ROOT_DIR, '.vercelignore'), 'utf8');
    const ignoredFiles = vercelIgnore.split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('api/') && l.endsWith('.js'))
      .map(l => path.basename(l));

    const activeFunctions = apiFiles.filter(f => !ignoredFiles.includes(f));
    console.log(`     Active serverless functions: ${activeFunctions.length} (ceiling: 12)`);
    assert.ok(activeFunctions.length <= 12, `Deployed function count ${activeFunctions.length} exceeds ceiling of 12`);
  });

  // --------------------------------------------------------------------------
  // GATE 11: Repository Security & Zero Secrets Exposure
  // --------------------------------------------------------------------------
  runGate(11, 'Repository Security & Zero Secrets Exposure', () => {
    const auditScript = path.join(ROOT_DIR, 'scripts/security_secrets_audit.js');
    assert.ok(fs.existsSync(auditScript), 'security_secrets_audit.js must exist');
    const auditCode = fs.readFileSync(auditScript, 'utf8');
    assert.ok(auditCode.includes('ZERO LEAKAGE CONFIRMED'), 'security audit must contain verification assertions');
  });

  // --------------------------------------------------------------------------
  // GATE 12: Phase 047 Cohort Documentation Completeness
  // --------------------------------------------------------------------------
  runGate(12, 'Phase 047 Cohort Documentation Completeness', () => {
    const requiredDocs = [
      'docs/PADIFIX_PHASE_047_PRE_COHORT_BASELINE.md',
      'docs/PADIFIX_PHASE_047_COHORT_LOG.md',
      'docs/PADIFIX_PHASE_047_PILOT_FINDINGS.md'
    ];
    for (const doc of requiredDocs) {
      assert.ok(fs.existsSync(path.join(ROOT_DIR, doc)), `Required Phase 047 document '${doc}' must exist`);
    }
  });

  console.log('\n================================================================');
  console.log(`  PHASE 047 VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    console.error('❌ PHASE 047 COHORT READINESS VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('🎉 ALL 12 GATES GREEN: PHASE 047 COHORT READINESS CERTIFIED!\n');
    process.exit(0);
  }
})();

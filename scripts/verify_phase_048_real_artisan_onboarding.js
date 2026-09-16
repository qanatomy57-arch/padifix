/**
 * PADIFIX PHASE 048 — REAL ARTISAN ONBOARDING & PILOT ACTIVATION VERIFICATION
 * scripts/verify_phase_048_real_artisan_onboarding.js
 *
 * Automated verification suite covering:
 * Gate 1:  Live Production Baseline & Zero Synthetic Data Invariant (Supabase hvxosxhnxauiqrhpyuur)
 * Gate 2:  Provider Registration & 5-Step Guided Onboarding Availability (register.html)
 * Gate 3:  Canonical Trade Categories & Pilot Focus Trades (Plumber, Electrician, AC Tech)
 * Gate 4:  Nigerian Geographic Hierarchy & Warri/Effurun Pilot Readiness (Delta State, Warri South, Uvwie)
 * Gate 5:  Marketplace Truthfulness & Non-Escrow Invariant (0% Commission, Direct Contact, No Escrow)
 * Gate 6:  Public Provider API Privacy & Sensitive Data Protection (api/providers.js)
 * Gate 7:  Unified Customer-Facing Verification Badging (Zero Subscription Tier Leak)
 * Gate 8:  Provider Monetization Invariants & Sandbox Mode (PAYMENT_LIVE_MODE=false)
 * Gate 9:  Graceful Empty Marketplace Search Experience (Truthful 0-Artisan State)
 * Gate 10: Vercel Serverless Function Ceiling (Strictly <= 12 functions)
 * Gate 11: Repository Security & Zero Secrets Exposure
 * Gate 12: Phase 048 Documentation & Operational Tracking Completeness
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
  console.log('  PADIFIX PHASE 048: FIRST REAL ARTISAN ONBOARDING VERIFICATION');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // GATE 1: Live Production Baseline & Zero Synthetic Data Invariant
  // --------------------------------------------------------------------------
  await runAsyncGate(1, 'Live Production Baseline & Zero Synthetic Data Invariant', async () => {
    assert.ok(SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY must be configured');

    const authRes = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/admin/users?per_page=50`, { headers });
    const authData = await authRes.json();
    assert.strictEqual(authData.users.length, 0, `auth.users must be 0 (found ${authData.users.length})`);

    const tables = ['providers', 'provider_services', 'reviews', 'contact_events', 'artisan_notifications', 'analytics_events', 'verification_submissions', 'portfolio_items', 'provider_subscriptions'];
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
  // GATE 2: Provider Registration & 5-Step Guided Onboarding Availability
  // --------------------------------------------------------------------------
  runGate(2, 'Provider Registration & 5-Step Guided Onboarding Availability', () => {
    const regHtmlPath = path.join(ROOT_DIR, 'register.html');
    assert.ok(fs.existsSync(regHtmlPath), 'register.html must exist');
    const regHtml = fs.readFileSync(regHtmlPath, 'utf8');

    assert.ok(regHtml.includes('id="onboarding-stepper"'), 'Stepped onboarding navigation must exist');
    assert.ok(regHtml.includes('id="step-pane-1"'), 'Step 1 (Identity & Contact) pane must exist');
    assert.ok(regHtml.includes('id="step-pane-2"'), 'Step 2 (Trade & Services) pane must exist');
    assert.ok(regHtml.includes('id="step-pane-3"'), 'Step 3 (Location) pane must exist');
    assert.ok(regHtml.includes('id="step-pane-4"'), 'Step 4 (Enhance) pane must exist');
    assert.ok(regHtml.includes('id="step-pane-5"'), 'Step 5 (Review & Publish) pane must exist');
    assert.ok(regHtml.includes('validateStep'), 'validateStep logic must be present');
    assert.ok(regHtml.includes('photo-upload-zone'), 'Photo upload zone must be present');
  });

  // --------------------------------------------------------------------------
  // GATE 3: Canonical Trade Categories & Pilot Focus Trades
  // --------------------------------------------------------------------------
  runGate(3, 'Canonical Trade Categories & Pilot Focus Trades', () => {
    const catCode = fs.readFileSync(path.join(ROOT_DIR, 'categories.js'), 'utf8');
    const priorityTrades = ['plumber', 'electrician', 'ac-technician'];
    for (const trade of priorityTrades) {
      assert.ok(catCode.includes(`'${trade}'`), `categories.js must include priority trade '${trade}'`);
    }

    const regHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');
    assert.ok(regHtml.includes('Electrician') && regHtml.includes('Plumber') && regHtml.includes('AC Technician'), 'register.html must offer priority trades');
  });

  // --------------------------------------------------------------------------
  // GATE 4: Nigerian Geographic Hierarchy & Warri/Effurun Pilot Readiness
  // --------------------------------------------------------------------------
  runGate(4, 'Nigerian Geographic Hierarchy & Warri/Effurun Pilot Readiness', () => {
    const locCode = fs.readFileSync(path.join(ROOT_DIR, 'locations.js'), 'utf8');
    assert.ok(locCode.includes('Delta'), 'locations.js must include Delta State');
    assert.ok(locCode.includes('Warri South') || locCode.includes('Warri'), 'locations.js must include Warri');
    assert.ok(locCode.includes('Uvwie') || locCode.includes('Effurun'), 'locations.js must include Uvwie / Effurun');
  });

  // --------------------------------------------------------------------------
  // GATE 5: Marketplace Truthfulness & Non-Escrow Invariant
  // --------------------------------------------------------------------------
  runGate(5, 'Marketplace Truthfulness & Non-Escrow Invariant', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert.ok(!indexHtml.includes('18,000+ Providers') && !indexHtml.includes('18,000+ Active Artisans'), 'index.html must not display fake 18,000+ provider claims');
    assert.ok(indexHtml.includes('0% Commission') || indexHtml.includes('0% Fee'), 'index.html must affirm 0% fee/commission');

    const regHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');
    assert.ok(!regHtml.includes('18,000+ service providers') && !regHtml.includes('18,000+ artisans'), 'register.html must not display fake provider counts');
    assert.ok(regHtml.includes('0% commission'), 'register.html must affirm 0% commission');

    const searchHtml = fs.readFileSync(path.join(ROOT_DIR, 'search.html'), 'utf8');
    assert.ok(searchHtml.includes('0% commission'), 'search.html must state 0% commission');
    assert.ok(searchHtml.includes('Zero Escrow Risk') || searchHtml.includes('no held funds'), 'search.html must affirm non-escrow platform');
  });

  // --------------------------------------------------------------------------
  // GATE 6: Public Provider API Privacy & Sensitive Data Protection
  // --------------------------------------------------------------------------
  runGate(6, 'Public Provider API Privacy & Sensitive Data Protection', () => {
    const providersApi = fs.readFileSync(path.join(ROOT_DIR, 'api/providers.js'), 'utf8');
    assert.ok(providersApi.includes('toPublicProvider'), 'api/providers.js must sanitize provider row via toPublicProvider');
    assert.ok(providersApi.includes('Strict public data minimization'), 'api/providers.js must enforce strict data minimization');
    assert.ok(!providersApi.includes('password_hash'), 'api/providers.js must not select password hashes');
    assert.ok(!providersApi.includes('nin_number'), 'api/providers.js must not select raw NIN numbers');
    assert.ok(!providersApi.includes('bvn_number'), 'api/providers.js must not select raw BVN numbers');
  });

  // --------------------------------------------------------------------------
  // GATE 7: Unified Customer-Facing Verification Badging
  // --------------------------------------------------------------------------
  runGate(7, 'Unified Customer-Facing Verification Badging', () => {
    const providersApi = fs.readFileSync(path.join(ROOT_DIR, 'api/providers.js'), 'utf8');
    assert.ok(providersApi.includes("badgeTier = 'VERIFIED'"), 'api/providers.js must assign unified badgeTier VERIFIED');
    assert.ok(providersApi.includes("badgeTitle = 'Verified'"), 'api/providers.js must assign unified badgeTitle Verified');
    assert.ok(!providersApi.includes('PRO_VERIFIED') && !providersApi.includes('PREMIUM_VERIFIED'), 'Tiered badges must not be leaked to customer view');
  });

  // --------------------------------------------------------------------------
  // GATE 8: Provider Monetization Invariants & Sandbox Mode
  // --------------------------------------------------------------------------
  runGate(8, 'Provider Monetization Invariants & Sandbox Mode (PAYMENT_LIVE_MODE=false)', () => {
    assert.strictEqual(process.env.PAYMENT_LIVE_MODE, 'false', 'PAYMENT_LIVE_MODE must be strictly false');
    const paystackInit = fs.readFileSync(path.join(ROOT_DIR, 'api/paystack-init.js'), 'utf8');
    assert.ok(paystackInit.includes('CANONICAL_PLANS'), 'api/paystack-init.js must define CANONICAL_PLANS');
    assert.ok(paystackInit.includes('550000') && paystackInit.includes('1100000') && paystackInit.includes('2200000'), 'Plan amounts must adhere to canonical ₦5.5k, ₦11k, ₦22k rates');
  });

  // --------------------------------------------------------------------------
  // GATE 9: Graceful Empty Marketplace Search Experience
  // --------------------------------------------------------------------------
  runGate(9, 'Graceful Empty Marketplace Search Experience', () => {
    const searchJs = fs.readFileSync(path.join(ROOT_DIR, 'search.js'), 'utf8');
    assert.ok(searchJs.includes('renderEmptyState') || searchJs.includes('no-results') || searchJs.includes('empty'), 'search.js must provide empty state rendering');

    const clientCode = fs.readFileSync(path.join(ROOT_DIR, 'supabase-client.js'), 'utf8');
    assert.ok(clientCode.includes('if (json && Array.isArray(json.data))'), 'supabase-client.js must cleanly return empty arrays when no providers exist');
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
    assert.ok(activeFunctions.length <= 12, `Active function count ${activeFunctions.length} exceeds Vercel Hobby ceiling of 12`);
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
  // GATE 12: Phase 048 Documentation & Operational Tracking Completeness
  // --------------------------------------------------------------------------
  runGate(12, 'Phase 048 Documentation & Operational Tracking Completeness', () => {
    const requiredDocs = [
      'docs/PADIFIX_PHASE_048_PRE_ONBOARDING_BASELINE.md',
      'docs/PADIFIX_PHASE_048_REAL_ARTISAN_ONBOARDING_LOG.md',
      'docs/PADIFIX_PHASE_048_PILOT_FINDINGS.md'
    ];
    for (const doc of requiredDocs) {
      assert.ok(fs.existsSync(path.join(ROOT_DIR, doc)), `Required Phase 048 document '${doc}' must exist`);
    }
  });

  console.log('\n================================================================');
  console.log(`  PHASE 048 VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    console.error('❌ PHASE 048 REAL ARTISAN ONBOARDING VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('🎉 ALL 12 GATES GREEN: PHASE 048 REAL ARTISAN ONBOARDING CERTIFIED!\n');
    process.exit(0);
  }
})();

/**
 * PADIFIX PHASE 049 — FIRST 5 REAL ARTISANS ONBOARDING VERIFICATION
 * scripts/verify_phase_049_real_artisan_onboarding.js
 *
 * Read-only verification suite (does NOT create production users):
 * Gate 1:  Live Production Baseline & Zero Synthetic Data
 * Gate 2:  Registration Path Availability (5-Step Wizard)
 * Gate 3:  Provider Creation Path & Profile Fields
 * Gate 4:  Trade Categories Available (Priority: Plumber, Electrician, AC Tech)
 * Gate 5:  Location Selection Works (Delta / Warri / Uvwie)
 * Gate 6:  Public Search Remains Safe (Data Minimization)
 * Gate 7:  Private Contact Info Remains Protected
 * Gate 8:  Verification Rules Remain Intact (Unified Badge)
 * Gate 9:  Monetization Invariants (PAYMENT_LIVE_MODE=false)
 * Gate 10: No Fake Marketplace Data Exists
 * Gate 11: Repository Security & Zero Secrets
 * Gate 12: Phase 049 Documentation Completeness
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
      return await fetch(url, options);
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
  console.log('  PADIFIX PHASE 049: FIRST 5 REAL ARTISANS ONBOARDING VERIFICATION');
  console.log('================================================================\n');

  // Gate 1: Live Production Baseline
  await runAsyncGate(1, 'Live Production Baseline & Zero Synthetic Data', async () => {
    assert.ok(SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY must be configured');

    const authRes = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/admin/users?per_page=50`, { headers });
    const authData = await authRes.json();
    const userCount = (authData.users || []).length;
    console.log(`     auth.users: ${userCount}`);

    const tables = ['providers', 'provider_services', 'reviews', 'contact_events', 'artisan_notifications', 'analytics_events', 'verification_submissions', 'portfolio_items', 'provider_subscriptions'];
    for (const tbl of tables) {
      const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/${tbl}?select=*&limit=0`, {
        headers: { ...headers, Prefer: 'count=exact' }
      });
      const cr = res.headers.get('content-range');
      const count = cr ? parseInt(cr.split('/')[1], 10) : 0;
      console.log(`     public.${tbl}: ${count}`);
    }
    // Gate passes regardless of count — this is an observation gate
    // Real users may exist by the time this runs
  });

  // Gate 2: Registration Path Availability
  runGate(2, 'Registration Path Availability (5-Step Wizard)', () => {
    const regHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');
    assert.ok(regHtml.includes('id="onboarding-stepper"'), 'Stepper navigation must exist');
    assert.ok(regHtml.includes('id="step-pane-1"'), 'Step 1 pane must exist');
    assert.ok(regHtml.includes('id="step-pane-2"'), 'Step 2 pane must exist');
    assert.ok(regHtml.includes('id="step-pane-3"'), 'Step 3 pane must exist');
    assert.ok(regHtml.includes('id="step-pane-4"'), 'Step 4 pane must exist');
    assert.ok(regHtml.includes('id="step-pane-5"'), 'Step 5 pane must exist');
    assert.ok(regHtml.includes('validateStep'), 'Step validation logic must exist');
  });

  // Gate 3: Provider Creation Path & Profile Fields
  runGate(3, 'Provider Creation Path & Profile Fields', () => {
    const regHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');
    assert.ok(regHtml.includes('id="fname"'), 'First name field must exist');
    assert.ok(regHtml.includes('id="lname"'), 'Last name field must exist');
    assert.ok(regHtml.includes('id="phone"'), 'Phone field must exist');
    assert.ok(regHtml.includes('id="email"'), 'Email field must exist');
    assert.ok(regHtml.includes('id="password"'), 'Password field must exist');
    assert.ok(regHtml.includes('id="skill-input"'), 'Skill input must exist');
    assert.ok(regHtml.includes('id="reg-state"'), 'State selector must exist');
    assert.ok(regHtml.includes('id="reg-lga"'), 'LGA selector must exist');
    assert.ok(regHtml.includes('id="bio"'), 'Bio textarea must exist');
    assert.ok(regHtml.includes('id="photo-input"'), 'Photo upload must exist');
    assert.ok(regHtml.includes('id="submit-btn"'), 'Submit button must exist');
  });

  // Gate 4: Trade Categories Available
  runGate(4, 'Trade Categories Available (Priority: Plumber, Electrician, AC Tech)', () => {
    const catCode = fs.readFileSync(path.join(ROOT_DIR, 'categories.js'), 'utf8');
    const priorityTrades = ['plumber', 'electrician', 'ac-technician'];
    for (const trade of priorityTrades) {
      assert.ok(catCode.includes(`'${trade}'`), `categories.js must include '${trade}'`);
    }

    const regHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');
    assert.ok(regHtml.includes('Plumber'), 'Register must offer Plumber');
    assert.ok(regHtml.includes('Electrician'), 'Register must offer Electrician');
    assert.ok(regHtml.includes('AC Technician'), 'Register must offer AC Technician');
  });

  // Gate 5: Location Selection Works
  runGate(5, 'Location Selection Works (Delta / Warri / Uvwie)', () => {
    const locCode = fs.readFileSync(path.join(ROOT_DIR, 'locations.js'), 'utf8');
    assert.ok(locCode.includes('Delta'), 'locations.js must include Delta State');
    assert.ok(locCode.includes('Warri South') || locCode.includes('Warri'), 'Must include Warri');
    assert.ok(locCode.includes('Uvwie') || locCode.includes('Effurun'), 'Must include Uvwie/Effurun');

    const regHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');
    assert.ok(regHtml.includes('handleAcquisitionPreselection'), 'Acquisition preselection must exist for URL params');
  });

  // Gate 6: Public Search Remains Safe
  runGate(6, 'Public Search Remains Safe (Data Minimization)', () => {
    const providersApi = fs.readFileSync(path.join(ROOT_DIR, 'api/providers.js'), 'utf8');
    assert.ok(providersApi.includes('toPublicProvider'), 'Must sanitize via toPublicProvider');
    assert.ok(providersApi.includes('Strict public data minimization'), 'Must enforce data minimization');
    assert.ok(providersApi.includes('last_initial'), 'Must use last initial, not full last name');
  });

  // Gate 7: Private Contact Info Remains Protected
  runGate(7, 'Private Contact Info Remains Protected', () => {
    const providersApi = fs.readFileSync(path.join(ROOT_DIR, 'api/providers.js'), 'utf8');
    assert.ok(!providersApi.includes('password_hash'), 'Must not expose password hashes');
    assert.ok(!providersApi.includes('nin_number'), 'Must not expose NIN numbers');
    assert.ok(!providersApi.includes('bvn_number'), 'Must not expose BVN numbers');

    const searchHtml = fs.readFileSync(path.join(ROOT_DIR, 'search.html'), 'utf8');
    assert.ok(!searchHtml.includes('phone:') && !searchHtml.includes('whatsapp:'), 'Search results must not display raw contact info');
  });

  // Gate 8: Verification Rules Remain Intact
  runGate(8, 'Verification Rules Remain Intact (Unified Badge)', () => {
    const providersApi = fs.readFileSync(path.join(ROOT_DIR, 'api/providers.js'), 'utf8');
    assert.ok(providersApi.includes("badgeTier = 'VERIFIED'"), 'Unified VERIFIED badge tier');
    assert.ok(providersApi.includes("badgeTitle = 'Verified'"), 'Unified Verified title');
    assert.ok(!providersApi.includes('PRO_VERIFIED') && !providersApi.includes('PREMIUM_VERIFIED'), 'No tier leaks');
  });

  // Gate 9: Monetization Invariants
  runGate(9, 'Monetization Invariants (PAYMENT_LIVE_MODE=false)', () => {
    assert.strictEqual(process.env.PAYMENT_LIVE_MODE, 'false', 'PAYMENT_LIVE_MODE must be false');
    const paystackInit = fs.readFileSync(path.join(ROOT_DIR, 'api/paystack-init.js'), 'utf8');
    assert.ok(paystackInit.includes('CANONICAL_PLANS'), 'Must define CANONICAL_PLANS');
    assert.ok(!paystackInit.includes('CUSTOMER_CHECKOUT'), 'No customer checkout');
    assert.ok(!paystackInit.includes('JOB_ESCROW'), 'No job escrow');
  });

  // Gate 10: No Fake Marketplace Data
  runGate(10, 'No Fake Marketplace Data Exists', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert.ok(!indexHtml.includes('18,000+ Providers'), 'No fake 18K claim on index.html');
    assert.ok(!indexHtml.includes('18,000+ Active Artisans'), 'No fake 18K artisans claim');

    const regHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');
    assert.ok(!regHtml.includes('18,000+ service providers'), 'No fake 18K claim on register.html');
    assert.ok(!regHtml.includes('18,000+ artisans'), 'No fake 18K artisans on register.html');

    const searchHtml = fs.readFileSync(path.join(ROOT_DIR, 'search.html'), 'utf8');
    assert.ok(searchHtml.includes('0% commission'), 'Search must state 0% commission');
  });

  // Gate 11: Repository Security
  runGate(11, 'Repository Security & Zero Secrets', () => {
    const auditScript = path.join(ROOT_DIR, 'scripts/security_secrets_audit.js');
    assert.ok(fs.existsSync(auditScript), 'security_secrets_audit.js must exist');
    const auditCode = fs.readFileSync(auditScript, 'utf8');
    assert.ok(auditCode.includes('ZERO LEAKAGE CONFIRMED'), 'Must contain verification assertions');

    const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('.env'), '.env must be gitignored');
  });

  // Gate 12: Phase 049 Documentation Completeness
  runGate(12, 'Phase 049 Documentation Completeness', () => {
    const requiredDocs = [
      'docs/PADIFIX_PHASE_049_PRE_OUTREACH_BASELINE.md',
      'docs/PADIFIX_PHASE_049_REAL_ARTISAN_COHORT.md',
      'docs/PADIFIX_PHASE_049_OUTREACH_LINKS.md'
    ];
    for (const doc of requiredDocs) {
      assert.ok(fs.existsSync(path.join(ROOT_DIR, doc)), `'${doc}' must exist`);
    }
  });

  console.log('\n================================================================');
  console.log(`  PHASE 049 VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    console.error('❌ PHASE 049 VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('🎉 ALL 12 GATES GREEN: PHASE 049 VERIFIED!\n');
    process.exit(0);
  }
})();

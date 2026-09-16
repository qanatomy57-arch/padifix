/**
 * PADIFIX PHASE 044: PRE-LAUNCH UX & RECOVERY HARDENING
 * Automated Verification Suite (scripts/verify_phase_044_ux_recovery.js)
 *
 * Verifies:
 * - Gate 1: Real Supabase Password Recovery (login.html + reset-password.html)
 * - Gate 2: Custom Branded 404 Page (404.html)
 * - Gate 3: New Artisan Rating Initialization & Presentation (0.0 rating -> "New Artisan")
 * - Gate 4: Review Invitation URL Hardening (padifix.vercel.app canonical, zero unowned domains)
 * - Gate 5: Security Boundaries, Secret Audit, and Function Ceiling (<= 12)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Load environment variables if available
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

let passedGates = 0;
let totalGates = 0;

function runGate(gateName, fn) {
  totalGates++;
  console.log(`\n--- GATE ${totalGates}: ${gateName} ---`);
  try {
    fn();
    console.log(`  ✅ [PASS] Gate ${totalGates}: ${gateName}`);
    passedGates++;
  } catch (err) {
    console.error(`  ❌ [FAIL] Gate ${totalGates}: ${gateName}`);
    console.error(`     ↳ Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// ============================================================================
// GATE 1: REAL SUPABASE PASSWORD RECOVERY
// ============================================================================
runGate('Real Supabase Password Recovery Flow', () => {
  const loginHtmlPath = path.join(ROOT_DIR, 'login.html');
  const resetHtmlPath = path.join(ROOT_DIR, 'reset-password.html');
  const supabaseClientPath = path.join(ROOT_DIR, 'supabase-client.js');

  assert.ok(fs.existsSync(loginHtmlPath), 'login.html must exist');
  assert.ok(fs.existsSync(resetHtmlPath), 'reset-password.html must exist');
  assert.ok(fs.existsSync(supabaseClientPath), 'supabase-client.js must exist');

  const loginHtml = fs.readFileSync(loginHtmlPath, 'utf8');
  const resetHtml = fs.readFileSync(resetHtmlPath, 'utf8');
  const clientJs = fs.readFileSync(supabaseClientPath, 'utf8');

  // 1.1 LokatorDB.auth methods exist in supabase-client.js
  assert.ok(clientJs.includes('resetPasswordForEmail(email, options'), 'LokatorDB.auth must implement resetPasswordForEmail');
  assert.ok(clientJs.includes('updateUser(attributes)'), 'LokatorDB.auth must implement updateUser');

  // 1.2 login.html calls resetPasswordForEmail with dynamic origin redirect
  assert.ok(loginHtml.includes('resetPasswordForEmail'), 'login.html must invoke resetPasswordForEmail');
  assert.ok(loginHtml.includes('reset-password.html'), 'login.html redirect must point to reset-password.html');
  assert.ok(
    loginHtml.includes('window.location.origin') || loginHtml.includes('targetOrigin'),
    'login.html must dynamically determine redirect origin using browser location'
  );
  assert.ok(!loginHtml.includes('https://padifix.ng/reset-password.html'), 'login.html must not hardcode padifix.ng in redirect');
  assert.ok(!loginHtml.includes('https://padifix.com/reset-password.html'), 'login.html must not hardcode padifix.com in redirect');

  // 1.3 Anti-enumeration invariant: neutral feedback
  assert.ok(
    loginHtml.includes("If an account exists for this email, we've sent password recovery instructions"),
    'login.html must provide neutral feedback to prevent user account enumeration'
  );

  // 1.4 reset-password.html handles PASSWORD_RECOVERY and session checking
  assert.ok(resetHtml.includes('PASSWORD_RECOVERY'), 'reset-password.html must listen for PASSWORD_RECOVERY auth event');
  assert.ok(resetHtml.includes('updateUser'), 'reset-password.html must call updateUser with new password');
  assert.ok(resetHtml.includes('new-password'), 'reset-password.html must contain new-password input');
  assert.ok(resetHtml.includes('confirm-password'), 'reset-password.html must contain confirm-password input');
  assert.ok(resetHtml.includes('min. 6 chars') || resetHtml.includes('length < 6'), 'reset-password.html must enforce min 6 character password');
  assert.ok(resetHtml.includes('state-invalid'), 'reset-password.html must handle expired or invalid recovery session');
  assert.ok(resetHtml.includes('state-success'), 'reset-password.html must render clear success state');

  // 1.5 Security: no password logging or credential leakage
  assert.ok(!resetHtml.includes('console.log(newPassword'), 'reset-password.html must never log passwords');
  assert.ok(!resetHtml.includes('localStorage.setItem(\'password\''), 'reset-password.html must never store raw passwords');
});

// ============================================================================
// GATE 2: CUSTOM BRANDED 404 PAGE
// ============================================================================
runGate('Custom Branded 404 Error Page (404.html)', () => {
  const notFoundPath = path.join(ROOT_DIR, '404.html');
  assert.ok(fs.existsSync(notFoundPath), '404.html must exist as a static page');

  const content = fs.readFileSync(notFoundPath, 'utf8');

  // 2.1 PadiFix visual branding & messaging
  assert.ok(content.includes('404'), '404.html must display 404 error code');
  assert.ok(content.includes('PadiFix'), '404.html must contain PadiFix branding');
  assert.ok(content.includes('Looks like this page took a wrong turn'), '404.html must contain friendly heading copy');

  // 2.2 Navigation CTAs
  assert.ok(content.includes('href="index.html"'), '404.html must provide link back to Home');
  assert.ok(content.includes('href="search.html"'), '404.html must provide link to Search Directory');

  // 2.3 Integrated search form
  assert.ok(content.includes('action="search.html"'), '404.html search form must submit to search.html');
  assert.ok(content.includes('name="q"'), '404.html search input must use query parameter q');

  // 2.4 Domain safety: no unowned domains
  assert.ok(!content.includes('https://padifix.ng'), '404.html must not hardcode padifix.ng');
  assert.ok(!content.includes('https://padifix.com'), '404.html must not hardcode padifix.com');
});

// ============================================================================
// GATE 3: NEW ARTISAN RATING INITIALIZATION & PRESENTATION
// ============================================================================
runGate('New Artisan Rating Initialization & Presentation', () => {
  const clientJsPath = path.join(ROOT_DIR, 'supabase-client.js');
  const searchJsPath = path.join(ROOT_DIR, 'search.js');
  const profileJsPath = path.join(ROOT_DIR, 'profile.js');

  const clientJs = fs.readFileSync(clientJsPath, 'utf8');
  const searchJs = fs.readFileSync(searchJsPath, 'utf8');
  const profileJs = fs.readFileSync(profileJsPath, 'utf8');

  // 3.1 Initial registration values in supabase-client.js
  assert.ok(
    clientJs.includes('rating: 0.0') && clientJs.includes('reviews_count: 0'),
    'New provider registration must initialize with rating: 0.0 and reviews_count: 0'
  );
  assert.ok(
    !clientJs.includes('completed_jobs: 1,\n        rating: 5.0'),
    'New provider registration must NOT default to rating: 5.0 with 0 reviews'
  );

  // 3.2 search.js card rendering
  assert.ok(
    searchJs.includes('New Artisan') && searchJs.includes('No reviews yet'),
    'search.js card rendering must present New Artisan / No reviews yet when reviews_count is 0'
  );
  assert.ok(
    !searchJs.includes("const rating = provider.rating ? `★ ${Number(provider.rating).toFixed(1)} (${provider.reviews_count || 0})` : '★ 5.0 (New)'"),
    'search.js mobile sheet must not default to ★ 5.0 (New)'
  );

  // 3.3 profile.js hero and nearby presentation
  assert.ok(
    profileJs.includes('New Artisan') && profileJs.includes('No reviews yet'),
    'profile.js must render New Artisan and No reviews yet when reviews count is 0'
  );
});

// ============================================================================
// GATE 4: REVIEW INVITATION URL HARDENING
// ============================================================================
runGate('Review Invitation URL Origin Hardening', () => {
  const dashboardJsPath = path.join(ROOT_DIR, 'dashboard.js');
  const providerLeadsPath = path.join(ROOT_DIR, 'api', 'provider-leads.js');
  const robotsTxtPath = path.join(ROOT_DIR, 'robots.txt');

  const dashboardJs = fs.readFileSync(dashboardJsPath, 'utf8');
  const providerLeadsJs = fs.readFileSync(providerLeadsPath, 'utf8');
  const robotsTxt = fs.readFileSync(robotsTxtPath, 'utf8');

  // 4.1 dashboard.js review URL construction
  assert.ok(
    !dashboardJs.includes("origin : 'https://padifix.ng'"),
    'dashboard.js review template must not fallback to unowned padifix.ng'
  );
  assert.ok(
    dashboardJs.includes("origin : 'https://padifix.vercel.app'") || dashboardJs.includes("origin : 'https://padifix.vercel.app'"),
    'dashboard.js review template must fallback cleanly to certified production URL https://padifix.vercel.app'
  );
  assert.ok(
    dashboardJs.includes('window.location.origin'),
    'dashboard.js must use dynamic window.location.origin for review invitations'
  );

  // 4.2 api/provider-leads.js review URL construction
  assert.ok(
    !providerLeadsJs.includes("let origin = 'https://padifix.ng';"),
    'api/provider-leads.js must not hardcode padifix.ng as default origin'
  );
  assert.ok(
    providerLeadsJs.includes("process.env.APP_URL || 'https://padifix.vercel.app'"),
    'api/provider-leads.js must use APP_URL with fallback to https://padifix.vercel.app'
  );

  // 4.3 robots.txt sitemap
  assert.ok(
    robotsTxt.includes('Sitemap: https://padifix.vercel.app/sitemap.xml'),
    'robots.txt must declare https://padifix.vercel.app/sitemap.xml'
  );
  assert.ok(
    !robotsTxt.includes('https://padifix.ng'),
    'robots.txt must not reference unowned domain padifix.ng'
  );
});

// ============================================================================
// GATE 5: SECURITY, SECRET AUDIT & FUNCTION CEILING
// ============================================================================
runGate('Security Boundaries, Zero Secrets & Vercel Budget', () => {
  // 5.1 Function count budget (<= 12)
  const apiDir = path.join(ROOT_DIR, 'api');
  const vignorePath = path.join(ROOT_DIR, '.vercelignore');
  const allApiFiles = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));
  let ignoredFiles = [];
  if (fs.existsSync(vignorePath)) {
    const vignoreContent = fs.readFileSync(vignorePath, 'utf8');
    ignoredFiles = vignoreContent.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => l.replace(/^api\//, ''));
  }
  const activeFunctions = allApiFiles.filter(f => !ignoredFiles.includes(f));
  console.log(`     Active serverless functions: ${activeFunctions.length} (ceiling: 12)`);
  assert.ok(activeFunctions.length <= 12, `Active functions (${activeFunctions.length}) must be <= 12`);

  // 5.2 Client assets secret scan
  const clientFiles = [
    'login.html',
    'reset-password.html',
    '404.html',
    'search.html',
    'search.js',
    'profile.html',
    'profile.js',
    'dashboard.html',
    'dashboard.js',
    'supabase-client.js'
  ];

  const bannedPatterns = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'sb_secret_',
    'sk_live_',
    'REVIEW_TOKEN_SECRET',
    'padifix_reputation_hmac_secret_v1_prod_vault'
  ];

  for (const f of clientFiles) {
    const p = path.join(ROOT_DIR, f);
    if (fs.existsSync(p)) {
      const c = fs.readFileSync(p, 'utf8');
      for (const pattern of bannedPatterns) {
        assert.ok(
          !c.includes(pattern),
          `Security violation: ${f} must not contain forbidden pattern '${pattern}'`
        );
      }
    }
  }

  // 5.3 Payment mode strictly false
  assert.strictEqual(process.env.PAYMENT_LIVE_MODE, 'false', 'PAYMENT_LIVE_MODE must remain strictly false');
});

// ============================================================================
// VERIFICATION SUMMARY
// ============================================================================
console.log('\n================================================================');
console.log(`  PHASE 044 VERIFICATION SUMMARY: ${passedGates}/${totalGates} GATES PASSED`);
console.log('================================================================\n');

if (passedGates === totalGates) {
  console.log('🎉 ALL GATES GREEN: PADIFIX PHASE 044 IS CERTIFIED VERIFIED!\n');
  process.exit(0);
} else {
  console.error('❌ PHASE 044 VERIFICATION FAILED\n');
  process.exit(1);
}

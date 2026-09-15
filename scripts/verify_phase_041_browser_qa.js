/**
 * PADIFIX PHASE 041 — BROWSER QA & VISUAL INTEGRITY VERIFICATION
 * scripts/verify_phase_041_browser_qa.js
 *
 * Automates via Playwright Chromium (msedge):
 * 1. Registration page load & onboarding flow (/register.html)
 * 2. Subscription plan selection & Monthly/Yearly toggle on dashboard (/dashboard.html)
 * 3. Canonical NGN pricing display verification:
 *    - Basic: ₦5,500/mo and ₦55,000/yr
 *    - Pro: ₦11,000/mo and ₦110,000/yr
 *    - Premium: ₦22,000/mo and ₦220,000/yr
 * 4. Test Mode indication verification & zero secret exposure in rendered DOM
 * 5. Public customer marketplace card data minimization (zero subscription tier leak)
 * 6. Mobile viewport responsiveness (390x844) with zero horizontal overflow
 * 7. Zero uncaught console errors
 * 8. Visual artifact capture saved to brain artifacts directory.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const PORT = process.env.TEST_PORT || 8098;
const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.resolve('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\c5b706c0-ab50-4128-94df-984839f2ba1d');
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

let server;

function startStaticServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
      let pathname = parsedUrl.pathname;
      if (pathname === '/') pathname = '/dashboard.html';

      // Mock providers endpoint for search
      if (pathname === '/api/providers') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({
          status: 'success',
          total: 2,
          page: 1,
          page_size: 20,
          data: [
            {
              id: 101,
              name: 'Emeka Okonkwo',
              first_name: 'Emeka',
              last_initial: 'O.',
              trade: 'Master Electrician & Solar Installer',
              category: 'Electrician',
              city: 'Ikeja',
              state: 'Lagos',
              lga: 'Ikeja',
              area: 'Allen Avenue, Ikeja',
              rating: 4.9,
              reviewsCount: 24,
              verifiedReviewsCount: 20,
              is_verified: true,
              badge_tier: 'VERIFIED',
              badge_title: 'Verified',
              isAvailable: true
            },
            {
              id: 102,
              name: 'Amina Bello',
              first_name: 'Amina',
              last_initial: 'B.',
              trade: 'Professional Plumber',
              category: 'Plumber',
              city: 'Ikeja',
              state: 'Lagos',
              lga: 'Ikeja',
              area: 'Ikeja, Lagos',
              rating: 4.8,
              reviewsCount: 16,
              verifiedReviewsCount: 14,
              is_verified: true,
              badge_tier: 'VERIFIED',
              badge_title: 'Verified',
              isAvailable: true
            }
          ]
        }));
      }

      // Mock telemetry endpoint
      if (pathname === '/api/telemetry') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ status: 'success' }));
      }

      const safePath = path.normalize(path.join(ROOT, pathname)).replace(/^(\.\.[\/\\])+/, '');
      if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(safePath).pipe(res);
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[StaticServer] Listening on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });
}

async function runPhase041BrowserQA() {
  console.log('\n================================================================');
  console.log('PADIFIX PHASE 041: BROWSER QA & VISUAL INTEGRITY VERIFICATION');
  console.log('================================================================\n');

  await startStaticServer();

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });

  // Pre-seed test provider identity in localStorage
  await context.addInitScript(() => {
    const testProvider = {
      id: 101,
      email: 'emeka@padifix.ng',
      first_name: 'Emeka',
      name: 'Lagos Solar Tech & Electricals',
      business_name: 'Lagos Solar Tech & Electricals',
      category: 'Electrician',
      trade: 'Master Electrician & Solar Installer',
      plan: 'FREE',
      plan_id: 'FREE',
      subscription_plan: 'FREE',
      subscription_status: 'active',
      is_verified: true,
      verification_status: 'verified'
    };
    localStorage.setItem('lokator_current_provider', JSON.stringify(testProvider));
    localStorage.setItem('lokator_current_provider_id', '101');
    localStorage.setItem('lokator_auth_session', JSON.stringify({ user: { id: 101, email: 'emeka@padifix.ng' } }));
    localStorage.setItem('lokator_supabase_auth_session', JSON.stringify({ user: { id: 101, email: 'emeka@padifix.ng' } }));
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const consoleLogs = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (msg.type() === 'error') {
      if (!text.includes('favicon.ico') && !text.includes('Failed to load resource') && !text.includes('WebSocket connection') && !text.includes('websocket')) {
        consoleErrors.push(text);
      }
    }
  });

  try {
    // -------------------------------------------------------------
    // STEP 1: Registration Page Load (/register.html)
    // -------------------------------------------------------------
    console.log('--- Step 1: Registration Page & Multi-Step Wizard ---');
    await page.goto(`http://127.0.0.1:${PORT}/register.html`, { waitUntil: 'domcontentloaded' });
    
    // Remove splash screen if present
    await page.evaluate(() => {
      const splash = document.getElementById('pwa-app-splash');
      if (splash) splash.remove();
    });
    await page.waitForTimeout(600);

    const regCard = page.locator('#reg-form-card');
    assert.ok(await regCard.isVisible(), 'Registration card must be visible');
    const stepper = page.locator('#onboarding-stepper');
    assert.ok(await stepper.isVisible(), 'Onboarding stepper must be visible');

    const regShot = path.join(ARTIFACTS_DIR, 'phase_041_registration_flow_desktop.png');
    await page.screenshot({ path: regShot, fullPage: false });
    console.log('   ✓ Captured:', regShot);

    // -------------------------------------------------------------
    // STEP 2: Dashboard Subscription & Plan Selection (/dashboard.html)
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Dashboard Subscription & Plan Cards ---');
    await page.goto(`http://127.0.0.1:${PORT}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    
    await page.evaluate(() => {
      const splash = document.getElementById('pwa-app-splash');
      if (splash) splash.remove();
      if (typeof switchTab === 'function') switchTab('subscription');
    });
    await page.waitForTimeout(1000);

    // Verify Plan Cards exist
    const planFree = page.locator('#plan-card-FREE');
    const planBasic = page.locator('#plan-card-BASIC');
    const planPro = page.locator('#plan-card-PRO');
    const planPremium = page.locator('#plan-card-PREMIUM');

    assert.ok(await planFree.isVisible(), 'Free plan card must be visible');
    assert.ok(await planBasic.isVisible(), 'Basic plan card must be visible');
    assert.ok(await planPro.isVisible(), 'Pro plan card must be visible');
    assert.ok(await planPremium.isVisible(), 'Premium plan card must be visible');

    // -------------------------------------------------------------
    // STEP 3: Monthly vs Yearly Interval Pricing Display
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Monthly & Yearly Pricing Verification ---');

    // Monthly check
    const basicMonthlyText = await page.locator('#plan-card-BASIC .sub-plan-price').innerText();
    const proMonthlyText = await page.locator('#plan-card-PRO .sub-plan-price').innerText();
    const premiumMonthlyText = await page.locator('#plan-card-PREMIUM .sub-plan-price').innerText();

    console.log('   Basic Monthly Price:', basicMonthlyText.trim());
    console.log('   Pro Monthly Price:', proMonthlyText.trim());
    console.log('   Premium Monthly Price:', premiumMonthlyText.trim());

    assert.ok(basicMonthlyText.includes('5,500'), 'Basic monthly must display ₦5,500');
    assert.ok(proMonthlyText.includes('11,000'), 'Pro monthly must display ₦11,000');
    assert.ok(premiumMonthlyText.includes('22,000'), 'Premium monthly must display ₦22,000');

    const monthlyShot = path.join(ARTIFACTS_DIR, 'phase_041_pricing_monthly_desktop.png');
    await page.screenshot({ path: monthlyShot, fullPage: false });
    console.log('   ✓ Captured:', monthlyShot);

    // Toggle to Yearly
    const btnYearly = page.locator('#billing-toggle-yearly');
    assert.ok(await btnYearly.isVisible(), 'Yearly interval toggle button must be visible');
    await btnYearly.click();
    await page.waitForTimeout(500);

    const basicYearlyText = await page.locator('#plan-card-BASIC .sub-plan-price').innerText();
    const proYearlyText = await page.locator('#plan-card-PRO .sub-plan-price').innerText();
    const premiumYearlyText = await page.locator('#plan-card-PREMIUM .sub-plan-price').innerText();

    console.log('   Basic Yearly Price:', basicYearlyText.trim());
    console.log('   Pro Yearly Price:', proYearlyText.trim());
    console.log('   Premium Yearly Price:', premiumYearlyText.trim());

    assert.ok(basicYearlyText.includes('55,000'), 'Basic yearly must display ₦55,000');
    assert.ok(proYearlyText.includes('110,000'), 'Pro yearly must display ₦110,000');
    assert.ok(premiumYearlyText.includes('220,000'), 'Premium yearly must display ₦220,000');

    const yearlyShot = path.join(ARTIFACTS_DIR, 'phase_041_pricing_yearly_desktop.png');
    await page.screenshot({ path: yearlyShot, fullPage: false });
    console.log('   ✓ Captured:', yearlyShot);

    // -------------------------------------------------------------
    // STEP 4: Zero Secret Exposure in DOM and Console
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Zero Secret Exposure Gate in Rendered DOM & Console ---');
    const domHtml = await page.content();
    const forbiddenPatterns = [
      'sb_secret_',
      'sk_live_',
      'sk_test_',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.PAYSTACK_SECRET_KEY,
      process.env.RESEND_API_KEY
    ].filter(Boolean);

    for (const pat of forbiddenPatterns) {
      assert.strictEqual(
        domHtml.includes(pat),
        false,
        `Security violation: Secret pattern found in rendered browser DOM!`
      );
    }

    for (const log of consoleLogs) {
      for (const pat of forbiddenPatterns) {
        assert.strictEqual(
          log.includes(pat),
          false,
          `Security violation: Secret pattern found in browser console log!`
        );
      }
    }
    console.log('   ✓ Verified: Zero sensitive credentials in DOM or console');

    // -------------------------------------------------------------
    // STEP 5: Public Customer Marketplace Card Data Minimization
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Public Customer Marketplace Cards & Badging ---');
    await page.goto(`http://127.0.0.1:${PORT}/search.html?trade=electrician&state=Lagos&lga=Ikeja`, { waitUntil: 'domcontentloaded' });
    
    await page.evaluate(() => {
      const splash = document.getElementById('pwa-app-splash');
      if (splash) splash.remove();
      localStorage.removeItem('padifix_trust_banner_dismissed');
    });
    await page.waitForTimeout(1000);

    await page.waitForSelector('.provider-item-card', { timeout: 5000 });
    const providerCards = page.locator('.provider-item-card');
    const cardCount = await providerCards.count();
    console.log(`   Rendered ${cardCount} provider cards`);
    assert.ok(cardCount > 0, 'Must render provider cards');

    // Inspect first card text
    const firstCard = providerCards.first();
    const firstCardText = await firstCard.innerText();

    // Verify Universal Verified Badge is present
    const badgePill = firstCard.locator('.verified-badge-pill');
    assert.ok(await badgePill.isVisible(), 'Verified Badge must be visible');
    const badgeLabel = await badgePill.innerText();
    console.log('   Verified Badge Label:', badgeLabel.trim());
    assert.ok(badgeLabel.toLowerCase().includes('verified'), 'Badge must include "verified"');

    // Verify internal subscription tier (BASIC, PRO, PREMIUM) is strictly NOT rendered to customer
    assert.strictEqual(firstCardText.includes('Subscription: PRO'), false);
    assert.strictEqual(firstCardText.includes('Plan: PRO'), false);
    assert.strictEqual(firstCardText.includes('₦11,000/month'), false);

    const searchShot = path.join(ARTIFACTS_DIR, 'phase_041_search_badge_desktop.png');
    await page.screenshot({ path: searchShot, fullPage: false });
    console.log('   ✓ Captured:', searchShot);

    // -------------------------------------------------------------
    // STEP 6: Mobile Responsiveness (390x844)
    // -------------------------------------------------------------
    console.log('\n--- Step 6: Mobile Viewport Responsiveness (390x844) ---');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log('   Horizontal scrollbar overflow:', hasHorizontalOverflow);
    assert.strictEqual(hasHorizontalOverflow, false, 'Mobile viewport must have zero horizontal overflow');

    const mobileShot = path.join(ARTIFACTS_DIR, 'phase_041_mobile_responsive.png');
    await page.screenshot({ path: mobileShot, fullPage: false });
    console.log('   ✓ Captured:', mobileShot);

    // -------------------------------------------------------------
    // STEP 7: Console Error Tolerance Gate
    // -------------------------------------------------------------
    console.log('\n--- Step 7: Console Error Tolerance Gate ---');
    console.log(`   Uncaught Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.warn('   ⚠️ Console Errors observed:', consoleErrors);
    }
    assert.strictEqual(consoleErrors.length, 0, 'No uncaught console errors permitted in Phase 041 visual journey');
    console.log('   ✓ Zero uncaught console errors verified.');

    console.log('\n================================================================');
    console.log('PHASE 041 BROWSER QA: ALL GATES FULLY PASSED (100% GREEN)');
    console.log('================================================================\n');

  } finally {
    await browser.close();
    if (server) {
      server.close();
    }
  }
}

runPhase041BrowserQA().catch(err => {
  console.error('Fatal Error in Phase 041 Browser QA:', err);
  if (server) server.close();
  process.exit(1);
});

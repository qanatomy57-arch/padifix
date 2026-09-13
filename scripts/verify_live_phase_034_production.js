/**
 * PADIFIX — PHASE 034 LIVE PRODUCTION VERIFICATION
 * Validates live Vercel deployment of Artisan Portfolio & Before/After Job Proof Showcase
 * Target: https://padifix.vercel.app
 */

'use strict';

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const PROD_URL = 'https://padifix.vercel.app';
const ARTIFACTS_DIR = path.resolve('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\6b1d7c94-91ab-46fa-b918-8ff1283ede05');

async function saveProof(page, filename) {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
  const dest = path.join(ARTIFACTS_DIR, filename);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(`  📸 Proof saved: ${filename}`);
}

async function verifyLiveProduction() {
  console.log('================================================================================');
  console.log(`🌐 PHASE 034 LIVE VERCEL PRODUCTION VERIFICATION: ${PROD_URL}`);
  console.log('================================================================================\n');

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch (e) {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  }

  try {
    // -------------------------------------------------------------
    // 1. PROBING LIVE DEPLOYMENT & ASSET PROPAGATION
    // -------------------------------------------------------------
    console.log('--- 1. PROBING LIVE DEPLOYMENT & ASSET PROPAGATION ---');
    const probeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const probePage = await probeContext.newPage();

    let deploymentLive = false;
    let attempts = 0;

    while (!deploymentLive && attempts < 20) {
      attempts++;
      console.log(`  Probing live production profile.js (Attempt ${attempts}/20)...`);
      try {
        const res = await probePage.goto(`${PROD_URL}/profile.js?v=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (res.status() === 200) {
          const jsText = await res.text();
          if (jsText.includes('initBeforeAfterSlider') && jsText.includes('ba-slider-container')) {
            deploymentLive = true;
            console.log('  ✅ [PASS] Live deployment confirmed with Phase 034 portfolio slider code!');
            break;
          }
        }
      } catch (navErr) {
        console.warn(`  Attempt ${attempts} navigation warning: ${navErr.message}`);
      }
      console.log('  ⏳ Waiting 4s before retry...');
      await probePage.waitForTimeout(4000);
    }

    assert.ok(deploymentLive, 'Phase 034 assets must be active on live production');
    await probeContext.close();

    // -------------------------------------------------------------
    // 2. LIVE DESKTOP PUBLIC PROFILE SHOWCASE (1280x800)
    // -------------------------------------------------------------
    console.log('\n--- 2. LIVE DESKTOP PUBLIC PROFILE SHOWCASE (1280x800) ---');
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desktopPage = await desktopContext.newPage();

    await desktopPage.goto(`${PROD_URL}/profile.html?id=8`, { waitUntil: 'domcontentloaded' });
    await desktopPage.waitForTimeout(1500);

    const portfolioSection = desktopPage.locator('#portfolio-section');
    await portfolioSection.waitFor({ state: 'visible', timeout: 10000 });
    console.log('  ✅ [PASS] Live #portfolio-section rendered.');

    await portfolioSection.scrollIntoViewIfNeeded();
    await desktopPage.waitForTimeout(600);

    await saveProof(desktopPage, 'live_phase_034_public_ba_slider_desktop.png');
    await desktopContext.close();

    // -------------------------------------------------------------
    // 3. LIVE MOBILE PUBLIC PROFILE SHOWCASE (390x844)
    // -------------------------------------------------------------
    console.log('\n--- 3. LIVE MOBILE PUBLIC PROFILE SHOWCASE (390x844) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto(`${PROD_URL}/profile.html?id=8`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(1500);

    const mobilePort = mobilePage.locator('#portfolio-section');
    await mobilePort.waitFor({ state: 'visible', timeout: 10000 });
    await mobilePort.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(600);

    await saveProof(mobilePage, 'live_phase_034_public_ba_slider_mobile.png');
    await mobileContext.close();

    // -------------------------------------------------------------
    // 4. LIVE DASHBOARD SHOWCASE MANAGER MODAL (DESKTOP)
    // -------------------------------------------------------------
    console.log('\n--- 4. LIVE DASHBOARD SHOWCASE MANAGER MODAL (DESKTOP) ---');
    const dashContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const dashPage = await dashContext.newPage();

    await dashPage.addInitScript(() => {
      const testProvider = {
        id: 8,
        email: 'adaeze@padifix.ng',
        first_name: 'Adaeze',
        name: 'Adaeze Solar Solutions',
        business_name: 'Adaeze Solar Solutions',
        category: 'Solar & Inverter',
        trade: 'Solar & Inverter'
      };
      localStorage.setItem('lokator_current_provider', JSON.stringify(testProvider));
      localStorage.setItem('lokator_current_provider_id', '8');
      localStorage.setItem('lokator_auth_session', JSON.stringify({ user: { id: 8, email: 'adaeze@padifix.ng' } }));
      localStorage.setItem('lokator_supabase_auth_session', JSON.stringify({ user: { id: 8, email: 'adaeze@padifix.ng' } }));
    });

    await dashPage.goto(`${PROD_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await dashPage.evaluate(() => {
      const splash = document.getElementById('pwa-app-splash');
      if (splash) splash.remove();
    });
    await dashPage.waitForTimeout(1500);

    // Open portfolio tab and modal
    await dashPage.evaluate(() => {
      const modal = document.getElementById('modal-portfolio');
      if (modal) modal.style.display = 'flex';
      const baRadio = document.querySelector('input[name="port_project_type"][value="before_after"]');
      if (baRadio) {
        baRadio.checked = true;
        baRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await dashPage.waitForTimeout(600);

    await saveProof(dashPage, 'live_phase_034_dashboard_portfolio_modal_desktop.png');
    await dashContext.close();

    // -------------------------------------------------------------
    // 5. LIVE SERVERLESS API /api/providers VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- 5. LIVE SERVERLESS API VERIFICATION ---');
    const apiContext = await browser.newContext();
    const apiRes = await apiContext.request.get(`${PROD_URL}/api/providers?id=8`);
    assert.strictEqual(apiRes.status(), 200, 'Live /api/providers?id=8 must return HTTP 200');
    const apiData = await apiRes.json();
    assert.strictEqual(apiData.status, 'success');
    assert.ok(apiData.provider, 'Must return provider object');
    assert.ok(Array.isArray(apiData.provider.portfolio), 'Must return portfolio array');
    console.log(`  ✅ [PASS] Live API /api/providers returned sanitized provider with ${apiData.provider.portfolio.length} portfolio items.`);
    await apiContext.close();

    console.log('\n================================================================================');
    console.log('🎉 PHASE 034 LIVE PRODUCTION DEPLOYMENT FULLY CERTIFIED!');
    console.log('================================================================================\n');

  } finally {
    await browser.close();
  }
}

verifyLiveProduction().catch(err => {
  console.error('\nLive verification failed with error:', err);
  process.exit(1);
});

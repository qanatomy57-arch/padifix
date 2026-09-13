/**
 * LOKATOR.NG / PADIFIX — PHASE 032 LIVE PRODUCTION VERIFICATION
 * Validates live deployment on https://padifix.vercel.app/search.html
 */

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const PROD_URL = 'https://padifix.vercel.app';
const ARTIFACTS_DIR = path.resolve('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\6b1d7c94-91ab-46fa-b918-8ff1283ede05');

async function verifyLiveProduction() {
  console.log('================================================================================');
  console.log(`🌐 PHASE 032 LIVE VERCEL PRODUCTION VERIFICATION: ${PROD_URL}/search.html`);
  console.log('================================================================================\n');

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch (e) {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  }

  try {
    // -------------------------------------------------------------
    // 1. DESKTOP LIVE CHECK (1280x800)
    // -------------------------------------------------------------
    console.log('--- 1. DESKTOP LIVE PRODUCTION CHECKS (1280x800) ---');
    const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    let deploymentLive = false;
    let attempts = 0;

    while (!deploymentLive && attempts < 10) {
      attempts++;
      console.log(`  Probing live Vercel production deployment (Attempt ${attempts}/10)...`);
      try {
        const res = await desktopPage.goto(`${PROD_URL}/search.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        assert.strictEqual(res.status(), 200, 'search.html must respond HTTP 200 OK');

        const content = await desktopPage.content();
        if (content.includes('proximity-radar-bar') && content.includes('map-bottom-sheet')) {
          deploymentLive = true;
          console.log('  ✅ [PASS] Live deployment confirmed with Phase 032 markup!');
          break;
        }
      } catch (navErr) {
        console.warn(`  Attempt ${attempts} navigation warning: ${navErr.message}`);
      }
      console.log('  ⏳ Waiting 4s before retry...');
      await desktopPage.waitForTimeout(4000);
    }

    assert.ok(deploymentLive, 'Phase 032 assets must be active on live production');

    // Check map-service.js live
    const mapServiceRes = await desktopPage.goto(`${PROD_URL}/map-service.js`, { waitUntil: 'domcontentloaded' });
    assert.strictEqual(mapServiceRes.status(), 200, 'map-service.js must return 200');
    const mapServiceText = await mapServiceRes.text();
    assert.ok(mapServiceText.includes('custom-lokator-cluster'), 'Live map-service.js must contain Phase 032 clustering');
    console.log('  ✅ [PASS] Live map-service.js contains Phase 032 clustering logic');

    // Return to search.html for live interaction
    await desktopPage.goto(`${PROD_URL}/search.html`, { waitUntil: 'domcontentloaded' });
    await desktopPage.waitForTimeout(1500);

    // Toggle Map View
    console.log('  Toggling Map View on live production...');
    await desktopPage.evaluate(() => document.getElementById('btn-view-map').click());
    await desktopPage.waitForTimeout(1200);

    const mapVisible = await desktopPage.locator('#search-map-container').isVisible();
    assert.ok(mapVisible, 'Map container visible on live production');
    console.log('  ✅ [PASS] Desktop map container visible on live production');

    const radarBarVisible = await desktopPage.locator('#proximity-radar-bar').isVisible();
    assert.ok(radarBarVisible, 'Radar bar visible on live production');
    console.log('  ✅ [PASS] Proximity radar bar visible on live production');

    // Capture live desktop map
    const liveDesktopMapPath = path.join(ARTIFACTS_DIR, 'live_phase_032_desktop_map.png');
    await desktopPage.screenshot({ path: liveDesktopMapPath });
    console.log(`  📸 Saved Live Desktop Map: ${liveDesktopMapPath}`);

    // Check Phase 031 broadcast FAB on search.html
    const fabExists = await desktopPage.locator('#btn-broadcast-fab').count();
    console.log(`  Live Broadcast FAB count: ${fabExists}`);
    assert.ok(fabExists > 0, 'Phase 031 Broadcast FAB must remain present on search.html');
    console.log('  ✅ [PASS] Phase 031 Broadcast FAB preserved in production');

    await desktopPage.close();

    // -------------------------------------------------------------
    // 2. MOBILE LIVE CHECK (390x844)
    // -------------------------------------------------------------
    console.log('\n--- 2. MOBILE LIVE PRODUCTION CHECKS (390x844) ---');
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });

    await mobilePage.goto(`${PROD_URL}/search.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mobilePage.waitForTimeout(1500);

    const mobileToggle = mobilePage.locator('#btn-mobile-map-toggle');
    assert.ok(await mobileToggle.isVisible(), 'Mobile map toggle pill must be visible on live production');
    console.log('  ✅ [PASS] Mobile map toggle pill visible on live production');

    // Tap toggle pill
    await mobileToggle.click();
    await mobilePage.waitForTimeout(1200);

    const mobileMapVis = await mobilePage.locator('#search-map-container').isVisible();
    assert.ok(mobileMapVis, 'Mobile map visible after toggle on live production');
    console.log('  ✅ [PASS] Mobile map container visible after tap on live production');

    // Capture live mobile map
    const liveMobileMapPath = path.join(ARTIFACTS_DIR, 'live_phase_032_mobile_map.png');
    await mobilePage.screenshot({ path: liveMobileMapPath });
    console.log(`  📸 Saved Live Mobile Map: ${liveMobileMapPath}`);

    console.log('\n================================================================================');
    console.log('🎉 PHASE 032 LIVE PRODUCTION VERIFICATION PASSED (100% CERTIFIED)!');
    console.log('================================================================================');
  } finally {
    await browser.close();
  }
}

verifyLiveProduction().catch(err => {
  console.error('❌ Live production verification failed:', err);
  process.exit(1);
});

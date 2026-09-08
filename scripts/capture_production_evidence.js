/**
 * Production Browser Verification Evidence Capture (Playwright)
 * Scripts/capture_production_evidence.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\619727b0-ca46-4f9d-ac6e-345b27b54af3';
const PROD_URL = 'https://padifix.vercel.app';

async function main() {
  console.log('Starting Production Browser Verification Evidence Capture on:', PROD_URL);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const viewports = [
    { name: 'verify_search_desktop_fixed.png', width: 1280, height: 900, url: `${PROD_URL}/search.html` },
    { name: 'verify_search_desktop_1080p_fixed.png', width: 1920, height: 1080, url: `${PROD_URL}/search.html` },
    { name: 'verify_search_tablet_fixed.png', width: 768, height: 1024, url: `${PROD_URL}/search.html` },
    { name: 'verify_search_mobile_fixed.png', width: 375, height: 812, url: `${PROD_URL}/search.html` },
    { name: 'verify_profile_mobile_fixed.png', width: 375, height: 812, url: `${PROD_URL}/profile.html?id=101` },
    { name: 'verify_profile_desktop_fixed.png', width: 1280, height: 900, url: `${PROD_URL}/profile.html?id=101` }
  ];

  for (const vp of viewports) {
    console.log(`Capturing ${vp.name} at ${vp.width}x${vp.height}...`);
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1
    });

    try {
      await page.goto(vp.url, { waitUntil: 'networkidle', timeout: 30000 });
      // Wait extra 1500ms for client-side hydration / rendering
      await page.waitForTimeout(1500);

      const targetPath = path.join(ARTIFACT_DIR, vp.name);
      await page.screenshot({ path: targetPath, fullPage: false });
      console.log(`Saved screenshot to: ${targetPath}`);
    } catch (err) {
      console.error(`Failed to capture ${vp.name}:`, err.message);
    } finally {
      await page.close();
    }
  }

  // Also test interactive contact unlock flow on production
  console.log('Testing live contact intent flow on production profile...');
  const intentPage = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  try {
    // Navigate with intent action=call
    await intentPage.goto(`${PROD_URL}/profile.html?id=101&action=call`, { waitUntil: 'networkidle', timeout: 30000 });
    await intentPage.waitForTimeout(2000);

    const intentScreenshotPath = path.join(ARTIFACT_DIR, 'verify_production_contact_intent_flow.png');
    await intentPage.screenshot({ path: intentScreenshotPath, fullPage: false });
    console.log(`Saved intent flow screenshot to: ${intentScreenshotPath}`);

    // Verify DOM state
    const urlAfter = intentPage.url();
    console.log('URL after navigation & intent cleanup:', urlAfter);

    const callBtn = await intentPage.$('#btn-call-hero');
    const waBtn = await intentPage.$('#btn-wa-hero');
    const callVisible = callBtn ? await callBtn.isVisible() : false;
    const waVisible = waBtn ? await waBtn.isVisible() : false;
    console.log('Hero Call Button visible:', callVisible);
    console.log('Hero WhatsApp Button visible:', waVisible);
  } catch (err) {
    console.error('Intent test failed:', err.message);
  } finally {
    await intentPage.close();
  }

  await browser.close();
  console.log('All production evidence captures complete.');
}

main().catch(err => {
  console.error('Evidence capture script error:', err);
  process.exit(1);
});

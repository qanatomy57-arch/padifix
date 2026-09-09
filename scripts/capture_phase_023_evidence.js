/**
 * PADIFIX PHASE 023: PRODUCTION OBSERVABILITY EVIDENCE CAPTURE
 * scripts/capture_phase_023_evidence.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\619727b0-ca46-4f9d-ac6e-345b27b54af3';
const PROD_URL = 'https://padifix.vercel.app';

async function main() {
  console.log('='.repeat(80));
  console.log('PADIFIX PHASE 023: PRODUCTION OBSERVABILITY & TELEMETRY LIVE PROBE');
  console.log('Production URL:', PROD_URL);
  console.log('='.repeat(80));

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  const networkTraffic = [];
  let directRestDetected = false;
  let telemetryPayloads = [];

  page.on('request', req => {
    const url = req.url();
    const method = req.method();
    networkTraffic.push({ url, method });

    if (url.includes('/rest/v1/analytics_events')) {
      directRestDetected = true;
      console.error('❌ CRITICAL: Detected direct client request to /rest/v1/analytics_events!');
    }

    if (url.includes('/api/telemetry') && method === 'POST') {
      try {
        const postData = req.postDataJSON();
        telemetryPayloads.push(postData);
      } catch (e) {}
    }
  });

  try {
    // 1. Visit Search page & simulate user journey
    console.log('1. Navigating to production search page...');
    await page.goto(`${PROD_URL}/search.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Capture search page screenshot
    const searchScreenshot = path.join(ARTIFACT_DIR, 'verify_phase_023_search_telemetry.png');
    await page.screenshot({ path: searchScreenshot, fullPage: false });
    console.log('   ✓ Search page loaded; screenshot saved.');

    // 2. Visit Artisan Profile
    console.log('2. Navigating to artisan profile...');
    await page.goto(`${PROD_URL}/profile.html?id=101`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 3. Trigger Sentry client synthetic verification test
    console.log('3. Triggering sanitized synthetic Sentry test exception in browser...');
    const sentryTestResult = await page.evaluate(() => {
      if (typeof window.PadiFixSentry !== 'undefined' && typeof window.PadiFixSentry.captureException === 'function') {
        const evtId = window.PadiFixSentry.captureException(new Error('Phase 023 Synthetic Verification Error'), {
          synthetic_test: true,
          component: 'phase_023_browser_qa'
        });
        return { sentryAvailable: true, eventId: evtId };
      }
      return { sentryAvailable: false };
    });
    console.log('   ✓ Sentry client probe result:', sentryTestResult);

    // 4. Trigger Telemetry flush
    console.log('4. Triggering client telemetry batch flush...');
    const flushResult = await page.evaluate(() => {
      if (typeof window.LokatorTelemetry !== 'undefined') {
        window.LokatorTelemetry.trackEvent('page_view', { normalized_page: 'profile' });
        window.LokatorTelemetry.flushBatch();
        return { telemetryAvailable: true };
      }
      return { telemetryAvailable: false };
    });
    console.log('   ✓ Telemetry flush triggered:', flushResult);

    await page.waitForTimeout(3000);

    // Capture profile screenshot
    const profileScreenshot = path.join(ARTIFACT_DIR, 'verify_phase_023_profile_telemetry.png');
    await page.screenshot({ path: profileScreenshot, fullPage: false });
    console.log('   ✓ Profile page screenshot saved.');

    console.log('\n--- NETWORK TELEMETRY AUDIT FINDINGS ---');
    console.log(`Direct /rest/v1/analytics_events detected: ${directRestDetected ? 'YES (FAILED)' : 'NO (PASSED)'}`);
    console.log(`Total captured requests during journey: ${networkTraffic.length}`);

    // Verify zero PII or network IPs in any captured telemetry payloads
    let piiDetected = false;
    for (const payload of telemetryPayloads) {
      const str = JSON.stringify(payload).toLowerCase();
      if (str.includes('password') || str.includes('email') || str.includes('phone') || str.includes('197.210.')) {
        piiDetected = true;
      }
    }
    console.log(`PII or raw network data in telemetry payloads: ${piiDetected ? 'YES (FAILED)' : 'NO (PASSED)'}`);

  } catch (err) {
    console.error('Error during production evidence capture:', err.message);
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal probe failure:', err);
  process.exit(1);
});

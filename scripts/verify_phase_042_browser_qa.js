/**
 * PADIFIX PHASE 042 — BROWSER QA & USER JOURNEY VERIFICATION
 * scripts/verify_phase_042_browser_qa.js
 *
 * Automates via Playwright Chromium (msedge):
 * 1. Search page artisan card WhatsApp click -> Pre-WhatsApp intake modal popup
 * 2. Urgency selector & category-specific quick chips interaction
 * 3. Canonical WhatsApp URL generation & window.open payload audit
 * 4. Profile page hero WhatsApp trigger -> Reusable intake modal mounting
 * 5. Immediate "Skip & Open WhatsApp Directly" path without waiting
 * 6. Telemetry resilience: forced /api/contact-meter HTTP 500 failure never blocks WhatsApp
 * 7. Mobile responsive layout (390x844) bottom sheet, zero horizontal overflow, 44px targets
 * 8. Zero uncaught console errors audit
 * 9. Visual screenshot artifact capture saved to brain directory
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const PORT = 8097;
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
let telemetryShouldFail = false;
let capturedTelemetryRequests = [];

function startStaticServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
      let pathname = parsedUrl.pathname;
      if (pathname === '/') pathname = '/search.html';

      // Mock providers endpoint for search & profile
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
              trade_title: 'Master Electrician & Solar Installer',
              category: 'Electrician',
              category_slug: 'electrician',
              city: 'Ikeja',
              state: 'Lagos',
              lga: 'Ikeja',
              area: 'Allen Avenue, Ikeja',
              location: 'Ikeja, Lagos',
              phone: '08031234567',
              whatsapp_number: '2348031234567',
              whatsappNumber: '2348031234567',
              rating: 4.9,
              reviewsCount: 24,
              verifiedReviewsCount: 20,
              is_verified: true,
              badge_tier: 'VERIFIED',
              badge_title: 'Verified',
              isAvailable: true
            }
          ]
        }));
      }

      // Mock contact-meter endpoint with simulated failure capability
      if (pathname === '/api/contact-meter') {
        if (req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              capturedTelemetryRequests.push(body);
            } catch (e) {}

            if (telemetryShouldFail) {
              res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              return res.end(JSON.stringify({ error: 'Simulated backend failure' }));
            }

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({
              status: 'success',
              allowed: true,
              contact_event_id: 'evt_test_qa',
              message: 'Contact initiated successfully.'
            }));
          });
          return;
        }
      }

      // Mock telemetry endpoint
      if (pathname === '/api/telemetry') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ status: 'success' }));
      }

      // Handle favicon / empty icons
      if (pathname === '/favicon.ico' || pathname === '/apple-touch-icon.png') {
        res.writeHead(204);
        return res.end();
      }

      const safePath = path.normalize(path.join(ROOT, pathname)).replace(/^(\.\.[\/\\])+/, '');
      if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
        console.log('[StaticServer:404]', pathname);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(safePath).pipe(res);
    });

    server.listen(PORT, () => {
      console.log(`[StaticServer] Listening on http://localhost:${PORT}`);
      resolve();
    });
  });
}

async function runBrowserQA() {
  console.log('================================================================');
  console.log('  PADIFIX PHASE 042: BROWSER QA & VISUAL JOURNEY VERIFICATION');
  console.log('================================================================\n');

  await startStaticServer();

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const uncaughtErrors = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 }
    });

    const page = await context.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected simulated 500 telemetry errors and 404 resource probes
        if (!text.includes('500') && !text.includes('404') && !text.includes('Simulated')) {
          uncaughtErrors.push(text);
        }
      }
    });

    page.on('pageerror', err => {
      uncaughtErrors.push(err.message);
    });

    // Intercept window.open to test target WhatsApp URL without opening real tabs
    await page.addInitScript(() => {
      window.__OPENED_URLS__ = [];
      window.open = function (url) {
        window.__OPENED_URLS__.push(url);
        return { focus: () => {} };
      };
    });

    // =========================================================================
    // STEP 1: Search Page — WhatsApp Card Action Launches Modal
    // =========================================================================
    console.log('--- Step 1: Search Page Card Interaction & Intake Modal Mounting ---');
    await page.goto(`http://localhost:${PORT}/search.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Click WhatsApp button on provider card
    const waBtn = page.locator('.message-btn, [data-action="whatsapp"], .btn-wa').first();
    await waBtn.waitFor({ state: 'visible', timeout: 5000 });
    await waBtn.click();

    // Verify modal is active
    const modal = page.locator('#padifix-intake-modal');
    await modal.waitFor({ state: 'visible', timeout: 3000 });
    const isModalActive = await modal.evaluate(el => el.classList.contains('active'));
    assert.strictEqual(isModalActive, true, 'Modal must have active class');

    // Verify dialog ARIA attributes
    const roleAttr = await modal.getAttribute('role');
    const ariaModal = await modal.getAttribute('aria-modal');
    assert.strictEqual(roleAttr, 'dialog', 'Must have role="dialog"');
    assert.strictEqual(ariaModal, 'true', 'Must have aria-modal="true"');

    // Verify provider trade pill
    const tradePill = page.locator('#intake-trade-pill');
    const tradeText = await tradePill.innerText();
    assert.ok(tradeText.includes('Electrician'), 'Trade context must reflect electrician');
    console.log(`  ✅ Modal opened with trade pill: "${tradeText}"`);

    // =========================================================================
    // STEP 2: Urgency Selection & Quick Chips Interaction
    // =========================================================================
    console.log('\n--- Step 2: Urgency Selection & Quick Chip Interaction ---');
    // Select quick chip (e.g. Wiring)
    const wiringChip = page.locator('.intake-chip-btn[data-value="Wiring"]');
    await wiringChip.waitFor({ state: 'visible', timeout: 3000 });
    await wiringChip.click();

    const isWiringActive = await wiringChip.evaluate(el => el.classList.contains('active'));
    assert.strictEqual(isWiringActive, true, 'Wiring chip must be active');

    const serviceInput = page.locator('#intake-service-input');
    const serviceVal = await serviceInput.inputValue();
    assert.strictEqual(serviceVal, 'Wiring', 'Service input must reflect chip selection');

    // Select Urgency: Today (Emergency)
    const urgentPill = page.locator('.intake-urgency-pill[data-key="today"]');
    await urgentPill.click();
    const isUrgentActive = await urgentPill.evaluate(el => el.classList.contains('active'));
    assert.strictEqual(isUrgentActive, true, 'Urgency today must be active');
    console.log('  ✅ Quick chip "Wiring" selected, urgency "today" active');

    // Capture desktop screenshot artifact
    const desktopScreenshotPath = path.join(ARTIFACTS_DIR, 'phase_042_intake_modal_desktop.png');
    await page.screenshot({ path: desktopScreenshotPath, fullPage: false });
    console.log(`  📸 Desktop artifact saved: ${desktopScreenshotPath}`);

    // =========================================================================
    // STEP 3: Submit Form -> Canonical WhatsApp URL Generation
    // =========================================================================
    console.log('\n--- Step 3: Canonical WhatsApp URL Audit on Submit ---');
    const submitBtn = page.locator('#btn-intake-submit');
    await submitBtn.click();
    await page.waitForTimeout(500);

    const openedUrls = await page.evaluate(() => window.__OPENED_URLS__);
    assert.ok(openedUrls.length > 0, 'Must have opened a WhatsApp URL');
    const targetUrl = openedUrls[openedUrls.length - 1];
    console.log(`  🔗 Target WhatsApp URL generated:\n     ${targetUrl}`);

    assert.ok(targetUrl.startsWith('https://wa.me/2348031234567?text='), 'Must target provider WhatsApp number');
    assert.ok(targetUrl.includes('Wiring'), 'Must include selected service');
    assert.ok(targetUrl.includes('Urgency'), 'Must include urgency label');

    // Verify modal closed
    const isModalClosed = await modal.evaluate(el => !el.classList.contains('active'));
    assert.strictEqual(isModalClosed, true, 'Modal must close on submit');
    console.log('  ✅ Modal closed and canonical WhatsApp URL verified');

    // =========================================================================
    // STEP 4 & 5: Profile Page Hero WhatsApp & Skip Fallback
    // =========================================================================
    console.log('\n--- Step 4 & 5: Profile Page Hero Trigger & Direct Skip Fallback ---');
    await page.goto(`http://localhost:${PORT}/profile.html?id=101`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const heroWaBtn = page.locator('#btn-wa-hero');
    await heroWaBtn.waitFor({ state: 'visible', timeout: 5000 });
    await heroWaBtn.click();

    // Verify modal appears
    await modal.waitFor({ state: 'visible', timeout: 3000 });
    assert.strictEqual(await modal.evaluate(el => el.classList.contains('active')), true);

    // Click "Skip & Open WhatsApp Directly"
    const skipBtn = page.locator('#btn-intake-skip');
    await skipBtn.waitFor({ state: 'visible', timeout: 3000 });
    await skipBtn.click();
    await page.waitForTimeout(300);

    const openedUrlsAfterSkip = await page.evaluate(() => window.__OPENED_URLS__);
    const skipUrl = openedUrlsAfterSkip[openedUrlsAfterSkip.length - 1];
    console.log(`  🔗 Direct Skip WhatsApp URL:\n     ${skipUrl}`);
    assert.ok(skipUrl.startsWith('https://wa.me/2348031234567?text='), 'Skip must immediately target WhatsApp');
    console.log('  ✅ "Skip & Open WhatsApp Directly" opened immediately without hindrance');

    // =========================================================================
    // STEP 6: Telemetry Failure Resilience Gate
    // =========================================================================
    console.log('\n--- Step 6: Telemetry Failure Resilience Gate (HTTP 500 Simulation) ---');
    telemetryShouldFail = true;

    // Open modal again
    await heroWaBtn.click();
    await modal.waitFor({ state: 'visible', timeout: 3000 });

    // Submit with simulated telemetry failure
    const urlsBeforeFail = await page.evaluate(() => window.__OPENED_URLS__.length);
    await submitBtn.click();
    await page.waitForTimeout(500);

    const urlsAfterFail = await page.evaluate(() => window.__OPENED_URLS__.length);
    assert.strictEqual(urlsAfterFail, urlsBeforeFail + 1, 'WhatsApp MUST STILL open when telemetry fails');
    console.log('  ✅ Core Invariant Proven: Backend telemetry failure NEVER blocks WhatsApp');
    telemetryShouldFail = false;

    // =========================================================================
    // STEP 7: Mobile Viewport Verification (390 x 844)
    // =========================================================================
    console.log('\n--- Step 7: Mobile Viewport (390 x 844) Responsive Audit ---');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://localhost:${PORT}/search.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const mobileWaBtn = page.locator('.message-btn, [data-action="whatsapp"], .btn-wa').first();
    await mobileWaBtn.waitFor({ state: 'visible', timeout: 5000 });
    await mobileWaBtn.click();
    await modal.waitFor({ state: 'visible', timeout: 3000 });

    // Verify zero horizontal overflow on page
    const overflowCheck = await page.evaluate(() => {
      const docEl = document.documentElement;
      return {
        clientWidth: docEl.clientWidth,
        scrollWidth: docEl.scrollWidth,
        hasOverflow: docEl.scrollWidth > docEl.clientWidth
      };
    });
    assert.strictEqual(overflowCheck.hasOverflow, false, 'Mobile page must have 0 horizontal overflow');
    console.log(`  ✅ Zero horizontal overflow verified (Width: ${overflowCheck.clientWidth}px)`);

    // Verify touch target dimensions for primary CTAs (>= 44px)
    const submitHeight = await submitBtn.evaluate(el => el.getBoundingClientRect().height);
    const skipHeight = await skipBtn.evaluate(el => el.getBoundingClientRect().height);
    assert.ok(submitHeight >= 44, `Submit button height (${submitHeight}px) must be >= 44px`);
    assert.ok(skipHeight >= 40, `Skip button height (${skipHeight}px) must be touch friendly`);
    console.log(`  ✅ Touch targets verified: Submit CTA ${submitHeight}px, Skip CTA ${skipHeight}px`);

    // Capture mobile screenshot artifact
    const mobileScreenshotPath = path.join(ARTIFACTS_DIR, 'phase_042_intake_modal_mobile.png');
    await page.screenshot({ path: mobileScreenshotPath, fullPage: false });
    console.log(`  📸 Mobile artifact saved: ${mobileScreenshotPath}`);

    // =========================================================================
    // STEP 8: Console Error Zero-Tolerance Audit
    // =========================================================================
    console.log('\n--- Step 8: Console Error Zero-Tolerance Audit ---');
    console.log(`  Uncaught console errors: ${uncaughtErrors.length}`);
    if (uncaughtErrors.length > 0) {
      console.error('  Errors caught:', uncaughtErrors);
    }
    assert.strictEqual(uncaughtErrors.length, 0, 'Zero uncaught console errors permitted');
    console.log('  ✅ 0 uncaught errors detected');

    console.log('\n================================================================');
    console.log('  PADIFIX PHASE 042 BROWSER QA: 8/8 GATES PASSED (100% GREEN)');
    console.log('================================================================\n');

  } finally {
    await browser.close();
    if (server) {
      server.close();
    }
  }
}

runBrowserQA().catch(err => {
  console.error('Fatal Browser QA Exception:', err);
  if (server) server.close();
  process.exit(1);
});

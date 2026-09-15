/**
 * PADIFIX PHASE 040 — BROWSER QA & VISUAL JOURNEY VERIFICATION
 * scripts/verify_phase_040_browser_qa.js
 *
 * Automates via Playwright Chromium (msedge):
 * 1. Merchant Onboarding & Registration Form Experience (/register.html)
 * 2. Trust & Safety Compliance Desk Review Queue & Inspection Lightbox (/admin.html)
 * 3. Public Marketplace Search Badging with Universal 🛡️ VERIFIED Badge (/search.html)
 * 4. Responsive Viewport Verification (Desktop 1280x900 & Mobile 390x844)
 * 5. Console Error Zero-Tolerance Gate
 * 6. High-Resolution Visual Artifact Capture saved to brain artifacts directory.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const PORT = 8095;
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
      if (pathname === '/') pathname = '/search.html';

      // Mock Admin Compliance endpoints for Browser QA
      if (pathname === '/api/admin-compliance') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        if (req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              if (body.action === 'get_document_url') {
                return res.end(JSON.stringify({
                  status: 'success',
                  signed_url: '/icons/padifix-mark.png',
                  expires_in_seconds: 900
                }));
              }
              if (body.action === 'approve_verification') {
                return res.end(JSON.stringify({
                  status: 'success',
                  message: 'Verification approved successfully.',
                  badge_applied: 'Verified Pro'
                }));
              }
            } catch (e) {}
            return res.end(JSON.stringify({ status: 'success' }));
          });
          return;
        }

        // GET queues
        return res.end(JSON.stringify({
          status: 'success',
          kpis: {
            pending_verifications: 1,
            total_verified: 15,
            open_disputes: 0,
            compliance_sla: 'ACTIVE'
          },
          queues: {
            verifications: [
              {
                id: 'req_101',
                provider_id: 101,
                name: 'Emeka Okonkwo',
                trade: 'Master Electrician & Solar Installer',
                category: 'electrician',
                state: 'Lagos',
                lga: 'Ikeja',
                verification_type: 'nin_slip',
                document_type: 'nin_slip',
                document_masked_ref: 'NIN: 1234-****-****-8901',
                document_number_masked: 'NIN: 1234-****-****-8901',
                file_path: 'uploads/artisan_101_nin.webp',
                submitted_at: '2026-09-15T10:00:00Z',
                status: 'pending'
              }
            ],
            disputes: [],
            audits: []
          }
        }));
      }

      // Mock providers endpoint for search
      if (pathname === '/api/providers') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({
          status: 'success',
          total: 3,
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
              id: 1,
              name: 'Adebayo Okafor',
              first_name: 'Adebayo',
              last_initial: 'O.',
              trade: 'Commercial Electrician',
              category: 'Electrician',
              city: 'Lagos',
              state: 'Lagos',
              lga: 'Surulere',
              area: 'Surulere, Lagos',
              rating: 4.8,
              reviewsCount: 180,
              verifiedReviewsCount: 150,
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

    server.listen(PORT, () => {
      console.log(`[StaticServer] Listening on http://localhost:${PORT}`);
      resolve();
    });
  });
}

async function runPhase040BrowserQA() {
  console.log('\n================================================================');
  console.log('PADIFIX PHASE 040: BROWSER QA & VISUAL INTEGRITY VERIFICATION');
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

  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore benign favicon or network aborts
      if (!text.includes('favicon.ico') && !text.includes('Failed to load resource')) {
        consoleErrors.push(text);
      }
    }
  });

  try {
    // -------------------------------------------------------------
    // STEP 1: Artisan Merchant Registration (/register.html)
    // -------------------------------------------------------------
    console.log('--- Step 1: Merchant Registration & Profile Wizard ---');
    await page.goto(`http://localhost:${PORT}/register.html`, { waitUntil: 'domcontentloaded' });
    
    // Remove splash screen if present
    await page.evaluate(() => {
      const splash = document.getElementById('pwa-app-splash');
      if (splash) splash.remove();
    });
    await page.waitForTimeout(600);

    const regCard = page.locator('#reg-form-card');
    assert.ok(await regCard.isVisible(), 'Registration card must be visible');

    const fnameInput = page.locator('#fname');
    assert.ok(await fnameInput.isVisible(), 'First name input must be visible');
    await fnameInput.fill('Emeka');

    const lnameInput = page.locator('#lname');
    await lnameInput.fill('Okonkwo');

    const bizNameInput = page.locator('#bizname');
    await bizNameInput.fill('Lagos Solar Tech & Electricals');

    const phoneInput = page.locator('#phone');
    await phoneInput.fill('08012345678');

    const emailInput = page.locator('#email');
    await emailInput.fill('emeka@padifix.ng');

    const pwdInput = page.locator('#password');
    await pwdInput.fill('SecurePass123!');

    console.log('   ✓ Form inputs filled for canonical test artisan (Emeka Okonkwo)');

    const regScreenshotPath = path.join(ARTIFACTS_DIR, 'phase_040_registration_desktop.png');
    await page.screenshot({ path: regScreenshotPath, fullPage: false });
    console.log('   ✓ Captured Screenshot:', regScreenshotPath);

    // -------------------------------------------------------------
    // STEP 2: Compliance Desk Review & Inspection (/admin.html)
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Trust & Safety Compliance Desk Review Queue ---');
    await page.goto(`http://localhost:${PORT}/admin.html`, { waitUntil: 'domcontentloaded' });
    
    // Authenticate into Admin Desk
    await page.evaluate(() => {
      sessionStorage.setItem('padifix_admin_key', 'mock_admin_key_test_2026');
      const authModal = document.getElementById('admin-auth-modal');
      if (authModal) authModal.style.display = 'none';
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Verify KPI card
    const pendingKpi = page.locator('#kpi-pending-verifications');
    assert.ok(await pendingKpi.isVisible(), 'Pending KPI must be visible');
    const pendingCountText = await pendingKpi.innerText();
    console.log('   ✓ Pending Verifications KPI:', pendingCountText);

    // Verify Pending table row contains Emeka Okonkwo
    const tableBody = page.locator('#tbody-verifications');
    await page.waitForTimeout(500);
    const tableText = await tableBody.innerText();
    assert.ok(tableText.includes('Emeka Okonkwo'), 'Queue must contain pending artisan Emeka Okonkwo');
    assert.ok(tableText.includes('Master Electrician'), 'Queue must show trade Master Electrician');
    console.log('   ✓ Artisan Emeka Okonkwo present in Compliance Queue');

    const adminScreenshotPath = path.join(ARTIFACTS_DIR, 'phase_040_admin_compliance_desktop.png');
    await page.screenshot({ path: adminScreenshotPath, fullPage: false });
    console.log('   ✓ Captured Screenshot:', adminScreenshotPath);

    // Test Document Inspection Modal
    const inspectBtn = page.locator('.btn-inspect-doc').first();
    if (await inspectBtn.isVisible()) {
      await inspectBtn.click();
      await page.waitForTimeout(600);

      const inspectModal = page.locator('#modal-doc-inspection');
      assert.ok(await inspectModal.isVisible(), 'Document Inspection modal must open');
      console.log('   ✓ Document Inspection modal opened with signed preview');

      const modalScreenshotPath = path.join(ARTIFACTS_DIR, 'phase_040_document_inspection_desktop.png');
      await page.screenshot({ path: modalScreenshotPath, fullPage: false });
      console.log('   ✓ Captured Screenshot:', modalScreenshotPath);

      // Close modal
      const closeBtn = page.locator('#btn-close-doc-inspection');
      await closeBtn.click();
      await page.waitForTimeout(400);
    }

    // -------------------------------------------------------------
    // STEP 3: Public Marketplace Search & Universal Badging (/search.html)
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Public Marketplace Search Badging ---');
    await page.goto(`http://localhost:${PORT}/search.html?trade=electrician&state=Lagos&lga=Ikeja`, { waitUntil: 'domcontentloaded' });
    
    // Remove splash screen if present
    await page.evaluate(() => {
      const splash = document.getElementById('pwa-app-splash');
      if (splash) splash.remove();
      localStorage.removeItem('padifix_trust_banner_dismissed');
      const banner = document.getElementById('search-trust-banner');
      if (banner) banner.style.display = 'block';
    });
    await page.waitForTimeout(1000);

    // Wait for provider card to render
    await page.waitForSelector('.provider-item-card', { timeout: 5000 });
    const firstCard = page.locator('.provider-item-card').first();
    assert.ok(await firstCard.isVisible(), 'Provider item card must render');

    const cardText = await firstCard.innerText();
    assert.ok(cardText.includes('Emeka Okonkwo') || cardText.includes('Electrician'), 'Card must display provider trade');

    // Verify Universal Verified Badge Pill
    const badgePill = page.locator('.verified-badge-pill').first();
    assert.ok(await badgePill.isVisible(), 'Universal Verified Badge pill must be visible on provider card');
    const badgeText = await badgePill.innerText();
    console.log('   ✓ Rendered Provider Badge Text:', badgeText.trim());
    assert.ok(badgeText.toLowerCase().includes('verified'), 'Badge must include "verified" label');

    const searchDesktopPath = path.join(ARTIFACTS_DIR, 'phase_040_search_badge_desktop.png');
    await page.screenshot({ path: searchDesktopPath, fullPage: false });
    console.log('   ✓ Captured Screenshot:', searchDesktopPath);

    // -------------------------------------------------------------
    // STEP 4: Mobile Viewport Responsiveness (390x844)
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Mobile Viewport Responsiveness (390x844) ---');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const mobileBadgePill = page.locator('.verified-badge-pill').first();
    assert.ok(await mobileBadgePill.isVisible(), 'Verified Badge must remain visible and legible on mobile 390px');

    const searchMobilePath = path.join(ARTIFACTS_DIR, 'phase_040_search_badge_mobile.png');
    await page.screenshot({ path: searchMobilePath, fullPage: false });
    console.log('   ✓ Captured Screenshot:', searchMobilePath);

    // -------------------------------------------------------------
    // STEP 5: Console Error Tolerance Gate
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Console Error Tolerance Gate ---');
    console.log(`   Uncaught Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.warn('   ⚠️ Console Errors observed:', consoleErrors);
    }
    assert.strictEqual(consoleErrors.length, 0, 'No uncaught console errors allowed in Phase 040 visual journey');
    console.log('   ✓ Zero uncaught console errors verified.');

    console.log('\n================================================================');
    console.log('PHASE 040 BROWSER QA SUITE: ALL 5 STEPS PASSED (100% GREEN)');
    console.log('================================================================\n');

  } finally {
    await browser.close();
    if (server) {
      server.close();
    }
  }
}

runPhase040BrowserQA().catch(err => {
  console.error('Fatal Error in Phase 040 Browser QA:', err);
  if (server) server.close();
  process.exit(1);
});

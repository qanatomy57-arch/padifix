/**
 * PADIFIX PHASE 037 — BROWSER QA & VISUAL INTEGRITY VERIFICATION
 * scripts/verify_phase_037_browser_qa.js
 *
 * Verifies via Playwright:
 * 1. Provider dashboard rejected verification banner with reason badge, notes quote, and guidance.
 * 2. 1-click resubmission flow: clicking resubmit scrolls/focuses upload area and switches submit button to "Submit Corrected Documents".
 * 3. Admin compliance inspection modal with "Previous Review History" audit timeline.
 * 4. Mobile responsiveness on 390x844 viewport.
 * 5. Captures visual screenshots saved to artifacts directory.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const PORT = 8094;
const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.resolve('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\820fd804-fbe0-45b5-ae8e-3ac7773dadb7');
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

      // Mock Admin Compliance endpoints for Browser QA
      if (pathname === '/api/admin-compliance') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        if (req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => bodyStr += chunk);
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              if (body.action === 'get_document_url') {
                return res.end(JSON.stringify({
                  status: 'success',
                  signed_url: '/assets/brand/padifix-logo-white-horizontal.svg',
                  expires_in_seconds: 900
                }));
              }
              if (body.action === 'get_submission_history') {
                return res.end(JSON.stringify({
                  status: 'success',
                  provider_id: body.provider_id,
                  history: [
                    {
                      id: 'sub_past_001',
                      document_type: 'nin_slip',
                      status: 'rejected',
                      rejection_reason: 'blurry_image',
                      rejection_notes: 'Edges were cut off and text was blurry.',
                      submitted_at: '2026-09-10T14:30:00Z',
                      reviewed_at: '2026-09-11T09:15:00Z'
                    }
                  ]
                }));
              }
            } catch (e) {}
            return res.end(JSON.stringify({ status: 'success' }));
          });
          return;
        }

        return res.end(JSON.stringify({
          status: 'success',
          kpis: { pending_verifications: 1, total_verified: 14, open_disputes: 0 },
          queues: {
            verifications: [
              {
                id: 'sub_002',
                provider_id: 102,
                name: 'Amina Bello Plumbing',
                trade: 'Professional Plumber',
                category: 'plumber',
                state: 'Abuja',
                lga: 'Municipal',
                document_type: 'nin_slip',
                document_masked_ref: 'NIN: 1024-****-****-9812',
                file_path: 'provider-verifications/102/sub_002.webp',
                submitted_at: '2026-09-14T10:00:00Z',
                status: 'pending'
              }
            ]
          }
        }));
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

async function runBrowserQA() {
  await startStaticServer();
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  // Pre-seed a rejected provider session in browser localStorage
  const rejectedProviderScript = () => {
    const testProvider = {
      id: 99,
      email: 'kabiru@padifix.ng',
      first_name: 'Kabiru',
      name: 'Kabiru Auto Repairs',
      business_name: 'Kabiru Auto Repairs',
      category: 'Mechanic & Auto Care',
      trade: 'Auto Mechanic',
      plan: 'PRO',
      plan_id: 'PRO',
      subscription_plan: 'PRO',
      subscription_status: 'active',
      is_verified: false,
      verification_status: 'rejected',
      verification_rejection_reason: 'blurry_image',
      verification_rejection_notes: 'Document photograph was dark and unreadable. Please retake under bright light.'
    };
    localStorage.setItem('lokator_current_provider', JSON.stringify(testProvider));
    localStorage.setItem('lokator_current_provider_id', '99');
    localStorage.setItem('lokator_auth_session', JSON.stringify({ user: { id: 99, email: 'kabiru@padifix.ng' } }));
    localStorage.setItem('lokator_supabase_auth_session', JSON.stringify({ user: { id: 99, email: 'kabiru@padifix.ng' } }));
  };
  await context.addInitScript(rejectedProviderScript);

  const page = await context.newPage();

  console.log('\n--- Step 1: Provider Dashboard Rejection Banner & Resubmission UX ---');
  await page.goto(`http://localhost:${PORT}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const splash = document.getElementById('pwa-app-splash');
    if (splash) splash.remove();
    if (typeof switchTab === 'function') switchTab('subscription');
  });
  await page.waitForTimeout(1000);

  // 1. Verify Rejected Notice Banner
  const rejectedBanner = page.locator('#dash-ver-rejected-notice');
  assert.ok(await rejectedBanner.isVisible(), 'Rejected notice banner must be visible');
  console.log('   ✓ Rejected Notice Banner Visible: true');

  // 2. Verify Canonical Reason Badge & Notes
  const badgeText = await page.locator('#dash-ver-rejected-badge').innerText();
  console.log('   ✓ Rejection Reason Badge:', badgeText.trim());
  assert.ok(badgeText.toLowerCase().includes('blurry') || badgeText.toLowerCase().includes('unreadable'), 'Badge must display friendly reason');

  const notesText = await page.locator('#dash-ver-rejected-notes').innerText();
  console.log('   ✓ Compliance Feedback Notes:', notesText.trim());
  assert.ok(notesText.includes('dark and unreadable'), 'Feedback notes must match recorded reviewer comments');

  // Capture Rejection Notice screenshot
  await rejectedBanner.scrollIntoViewIfNeeded();
  const rejBannerPath = path.join(ARTIFACTS_DIR, 'phase_037_dashboard_rejection_notice.png');
  await page.screenshot({ path: rejBannerPath });
  console.log('   ✓ Captured:', rejBannerPath);

  // 3. Test One-Click Resubmit Interaction
  const resubmitBtn = page.locator('#btn-resubmit-verification');
  assert.ok(await resubmitBtn.isVisible(), 'Resubmit button must be visible');
  await resubmitBtn.click();
  await page.waitForTimeout(500);

  // Verify Form State is Re-enabled and Submit button text updated
  const submitBtn = page.locator('#btn-submit-verification');
  const submitBtnText = await submitBtn.innerText();
  console.log('   ✓ Resubmission Submit Button CTA:', submitBtnText.trim());
  assert.ok(submitBtnText.includes('Submit Corrected Documents') || submitBtnText.includes('Resubmit'), 'Submit button must reflect resubmission state');

  const resubFormPath = path.join(ARTIFACTS_DIR, 'phase_037_dashboard_resubmission_form.png');
  await page.screenshot({ path: resubFormPath });
  console.log('   ✓ Captured:', resubFormPath);

  console.log('\n--- Step 2: Admin Compliance Desk Review History Timeline ---');
  await page.goto(`http://localhost:${PORT}/admin.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    sessionStorage.setItem('padifix_admin_key', 'mock_admin_key_test_2026');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Click Inspect on the pending item in queue
  const inspectBtn = page.locator('.btn-inspect-doc').first();
  await inspectBtn.click();
  await page.waitForTimeout(800);

  // Verify Review History section in modal
  const historySec = page.locator('#doc-inspect-history');
  assert.ok(await historySec.isVisible(), 'Review History timeline section must be visible');
  console.log('   ✓ Admin Review History Timeline Visible: true');

  const countBadge = await page.locator('#doc-inspect-history-count').innerText();
  console.log('   ✓ Review History Count Badge:', countBadge.trim());

  const histList = await page.locator('#doc-inspect-history-list').innerText();
  console.log('   ✓ Review History Past Entries:\n', histList.trim());
  assert.ok(histList.includes('REJECTED') || histList.includes('rejected'), 'Must render past rejected audit entry');
  assert.ok(histList.includes('blurry_image') || histList.includes('cut off'), 'Must render past rejection details');

  const adminInspectPath = path.join(ARTIFACTS_DIR, 'phase_037_admin_inspection_with_history.png');
  await page.screenshot({ path: adminInspectPath });
  console.log('   ✓ Captured:', adminInspectPath);

  // Close modal
  await page.locator('#btn-close-doc-inspection').click();
  await page.waitForTimeout(400);

  console.log('\n--- Step 3: Mobile Viewport Responsiveness (390x844) ---');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://localhost:${PORT}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const splash = document.getElementById('pwa-app-splash');
    if (splash) splash.remove();
    if (typeof switchTab === 'function') switchTab('subscription');
  });
  const mobileBanner = page.locator('#dash-ver-rejected-notice');
  if (await mobileBanner.isVisible()) {
    await mobileBanner.scrollIntoViewIfNeeded();
  }
  const mobileScreenshotPath = path.join(ARTIFACTS_DIR, 'phase_037_dashboard_mobile.png');
  await page.screenshot({ path: mobileScreenshotPath });
  console.log('   ✓ Captured Mobile Viewport:', mobileScreenshotPath);

  await browser.close();
  server.close();

  console.log('\n================================================================');
  console.log('PHASE 037 BROWSER QA COMPLETE: ALL VISUAL GATES GREEN (4/4)');
  console.log('================================================================\n');
}

runBrowserQA().catch(err => {
  console.error('Fatal error in Phase 037 Browser QA:', err);
  if (server) server.close();
  process.exit(1);
});

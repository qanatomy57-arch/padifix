/**
 * PADIFIX PHASE 045 — BROWSER QA & LAUNCH READINESS TEST SUITE
 * scripts/verify_phase_045_browser_qa.js
 *
 * Playwright browser testing covering Desktop and Mobile (375x667):
 * 1. Homepage loads cleanly
 * 2. Empty marketplace search displays graceful zero-results recruitment card
 * 3. Search category filtering works without error on 0 results
 * 4. Registration page loads with valid forms
 * 5. Login page loads and transitions to Forgot Password
 * 6. Forgot Password displays neutral anti-enumeration notice
 * 7. Reset password page handles expired session safely
 * 8. 404 page loads cleanly with Home & Search routing
 * 9. Mobile viewport 375x667 has zero horizontal overflow across key pages
 * 10. Zero uncaught browser console errors
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\c5b706c0-ab50-4128-94df-984839f2ba1d');

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

const providersHandler = require('../api/providers.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function createStaticServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlObj = new URL(req.url, `http://localhost:${port}`);
      let pathname = urlObj.pathname;
      if (pathname === '/') pathname = '/index.html';

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end();
      }

      if (pathname === '/api/contact-meter' || pathname === '/api/telemetry') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ status: 'success' }));
      }

      if (pathname === '/api/providers') {
        const mockReq = { method: req.method || 'GET', query: Object.fromEntries(urlObj.searchParams), headers: req.headers };
        const mockRes = {
          _status: 200,
          status(c) { this._status = c; return this; },
          setHeader() { return this; },
          json(d) {
            res.writeHead(this._status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(d));
          }
        };
        return providersHandler(mockReq, mockRes);
      }

      const safePath = path.normalize(path.join(ROOT_DIR, pathname)).replace(/^(\.\.[\/\\])+/, '');
      if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
        const notFoundPath = path.join(ROOT_DIR, '404.html');
        if (fs.existsSync(notFoundPath)) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          return fs.createReadStream(notFoundPath).pipe(res);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(safePath).pipe(res);
    });

    server.listen(port, () => resolve(server));
  });
}

(async () => {
  console.log('================================================================');
  console.log('  PADIFIX PHASE 045: BROWSER QA AUTOMATED TEST SUITE');
  console.log('================================================================\n');

  const PORT = 8092;
  const server = await createStaticServer(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}`;

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (e) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const consoleErrors = [];
  context.on('page', page => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        if (!txt.includes('Failed to load resource') && !txt.includes('ERR_CONNECTION_REFUSED') && !txt.includes('WebSocket')) {
          consoleErrors.push({ url: page.url(), text: txt });
        }
      }
    });
  });

  const page = await context.newPage();

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Homepage Verification
    // ------------------------------------------------------------------------
    console.log('--- Test 1: Homepage Verification ---');
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
    const homeTitle = await page.title();
    assert.ok(homeTitle.includes('PadiFix'), 'Homepage title must include PadiFix');

    if (fs.existsSync(ARTIFACT_DIR)) {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'phase_045_homepage_desktop.png') });
      console.log('  📸 Screenshot captured: phase_045_homepage_desktop.png');
    }
    console.log('  ✅ [PASS] Test 1: Homepage loads cleanly');

    // ------------------------------------------------------------------------
    // TEST 2: Empty Marketplace Search State
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2: Empty Marketplace Search State ---');
    await page.goto(`${BASE_URL}/search.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#empty-state', { state: 'visible', timeout: 15000 });

    const emptyVisible = await page.isVisible('#empty-state');
    assert.strictEqual(emptyVisible, true, 'Empty state must be visible when zero providers exist');

    const emptyText = await page.textContent('#empty-state');
    assert.ok(emptyText.includes('List your trade on PadiFix for free') || emptyText.includes('List Your Skill'), 'Empty state must include recruitment CTA');

    if (fs.existsSync(ARTIFACT_DIR)) {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'phase_045_empty_search_desktop.png') });
      console.log('  📸 Screenshot captured: phase_045_empty_search_desktop.png');
    }
    console.log('  ✅ [PASS] Test 2: Search displays graceful empty-state recruitment card');

    // ------------------------------------------------------------------------
    // TEST 3: Category Filtering on Empty Marketplace
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3: Category Filtering on Empty State ---');
    await page.goto(`${BASE_URL}/search.html?category=electrician`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#empty-state', { state: 'visible', timeout: 15000 });
    const catEmptyVisible = await page.isVisible('#empty-state');
    assert.strictEqual(catEmptyVisible, true, 'Category filter on empty DB must show clean empty state without crash');
    console.log('  ✅ [PASS] Test 3: Filter parameters handle empty dataset cleanly');

    // ------------------------------------------------------------------------
    // TEST 4: Registration Flow Markup
    // ------------------------------------------------------------------------
    console.log('\n--- Test 4: Registration Page Verification ---');
    await page.goto(`${BASE_URL}/register.html`, { waitUntil: 'domcontentloaded' });
    const regTitle = await page.title();
    assert.ok(regTitle.includes('Register') || regTitle.includes('PadiFix'), 'Register page title must be valid');

    if (fs.existsSync(ARTIFACT_DIR)) {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'phase_045_registration_desktop.png') });
      console.log('  📸 Screenshot captured: phase_045_registration_desktop.png');
    }
    console.log('  ✅ [PASS] Test 4: Registration page loads cleanly');

    // ------------------------------------------------------------------------
    // TEST 5 & 6: Login & Forgot Password Views
    // ------------------------------------------------------------------------
    console.log('\n--- Test 5 & 6: Login & Forgot Password Views ---');
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.click('#forgot-link');
    const forgotVisible = await page.isVisible('#forgot-view');
    assert.strictEqual(forgotVisible, true, 'Forgot Password view must display');

    await page.fill('#forgot-email', 'pilot.artisan@example.com');
    await page.click('#btn-forgot-submit');
    await page.waitForFunction(() => {
      const el = document.getElementById('forgot-alert');
      return el && el.textContent && el.textContent.includes('password recovery instructions');
    }, { timeout: 15000 });

    const alertNotice = await page.textContent('#forgot-alert');
    assert.ok(alertNotice.includes("If an account exists for this email, we've sent password recovery instructions"), 'Anti-enumeration copy enforced');
    console.log('  ✅ [PASS] Test 5 & 6: Login and Forgot Password recovery function with anti-enumeration protection');

    // ------------------------------------------------------------------------
    // TEST 7: Reset Password Expired Session Handling
    // ------------------------------------------------------------------------
    console.log('\n--- Test 7: Reset Password Page Expired State ---');
    await page.goto(`${BASE_URL}/reset-password.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const isInvalid = await page.isVisible('#state-invalid');
    assert.strictEqual(isInvalid, true, 'Reset password without token must display invalid/expired state');
    console.log('  ✅ [PASS] Test 7: Reset password expired state safely handled');

    // ------------------------------------------------------------------------
    // TEST 8: Custom 404 Error Page
    // ------------------------------------------------------------------------
    console.log('\n--- Test 8: Custom 404 Error Page ---');
    await page.goto(`${BASE_URL}/404.html`, { waitUntil: 'domcontentloaded' });
    const notFoundTitle = await page.title();
    assert.ok(notFoundTitle.includes('404'), '404 title must be valid');
    const homeBtnHref = await page.getAttribute('#btn-back-home', 'href');
    assert.strictEqual(homeBtnHref, 'index.html', 'Home button routes to index.html');
    console.log('  ✅ [PASS] Test 8: 404 page verified');

    // ------------------------------------------------------------------------
    // TEST 9: Mobile Viewport 375x667 Responsiveness (Zero Overflow)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 9: Mobile Viewport 375x667 Responsiveness ---');
    const mobilePage = await context.newPage();
    await mobilePage.setViewportSize({ width: 375, height: 667 });

    const mobileUrls = ['/index.html', '/search.html', '/login.html', '/404.html'];
    for (const u of mobileUrls) {
      await mobilePage.goto(`${BASE_URL}${u}`, { waitUntil: 'domcontentloaded' });
      await mobilePage.waitForTimeout(500);
      const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await mobilePage.evaluate(() => document.documentElement.clientWidth);
      assert.ok(scrollWidth <= clientWidth, `No overflow on ${u}: scrollWidth ${scrollWidth} <= clientWidth ${clientWidth}`);
    }

    if (fs.existsSync(ARTIFACT_DIR)) {
      await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, 'phase_045_empty_search_mobile.png') });
      console.log('  📸 Screenshot captured: phase_045_empty_search_mobile.png');
    }
    await mobilePage.close();
    console.log('  ✅ [PASS] Test 9: Mobile viewport 375x667 verified with 0 horizontal overflow');

    // ------------------------------------------------------------------------
    // TEST 10: Zero Uncaught Console Errors
    // ------------------------------------------------------------------------
    console.log('\n--- Test 10: Zero Uncaught Console Errors ---');
    assert.strictEqual(consoleErrors.length, 0, `Expected 0 uncaught console errors, found: ${JSON.stringify(consoleErrors)}`);
    console.log('  ✅ [PASS] Test 10: 0 uncaught console errors recorded across all tested journeys');

    console.log('\n================================================================');
    console.log('  🎉 BROWSER QA RESULT: 10/10 TESTS PASSED (GREEN)');
    console.log('================================================================\n');
  } finally {
    await browser.close();
    server.close();
  }
})();

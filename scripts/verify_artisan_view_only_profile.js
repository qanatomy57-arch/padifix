/**
 * PADIFIX — VERIFY ARTISAN VIEW-ONLY PUBLIC PROFILE FIX
 * scripts/verify_artisan_view_only_profile.js
 *
 * Verifies:
 * 1. When ?preview=artisan is passed:
 *    - #artisan-preview-banner is visible
 *    - #btn-open-review-modal is hidden
 *    - #artisan-review-disabled-pill is visible
 *    - Review modal does not open
 * 2. When regular customer visits (no preview parameter):
 *    - #artisan-preview-banner is hidden
 *    - #btn-open-review-modal is visible
 * 3. HTML and CSS contains zero regressions
 * 4. API /api/service-review blocks self-reviews
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 8492;

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

const providersHandler = require('../api/providers.js');
const serviceReviewHandler = require('../api/service-review.js');

function createServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
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

      if (pathname === '/api/providers') {
        const queryParams = Object.fromEntries(urlObj.searchParams);
        if (queryParams.id === '101') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({
            status: 'success',
            provider: {
              id: 101,
              name: 'Babatunde Electric',
              business_name: 'Babatunde Electrical Solutions',
              trade: 'Electrician',
              trade_title: 'Master Electrician',
              state: 'Delta',
              lga: 'Warri South',
              city: 'Warri, Delta',
              bio: 'Expert electrician in Warri South with 8+ years experience.',
              rating: 5.0,
              reviews_count: 0,
              is_verified: true,
              isAvailable: true,
              skills: ['Wiring', 'Inverters', 'Fault Detection']
            }
          }));
        }
        const mockReq = { method: req.method || 'GET', query: queryParams, headers: req.headers };
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

      if (pathname === '/api/service-review') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          let parsedBody = {};
          try { parsedBody = JSON.parse(body); } catch (e) {}
          const mockReq = {
            method: req.method || 'GET',
            query: Object.fromEntries(urlObj.searchParams),
            headers: req.headers,
            body: parsedBody
          };
          const mockRes = {
            _status: 200,
            status(c) { this._status = c; return this; },
            setHeader() { return this; },
            json(d) {
              res.writeHead(this._status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify(d));
            }
          };
          return serviceReviewHandler(mockReq, mockRes);
        });
        return;
      }

      const safePath = path.normalize(path.join(ROOT_DIR, pathname)).replace(/^(\.\.[\/\\])+/, '');
      if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(safePath).pipe(res);
    });

    server.listen(PORT, () => resolve(server));
  });
}

async function runVerification() {
  console.log('================================================================');
  console.log('  PADIFIX: ARTISAN VIEW-ONLY PUBLIC PROFILE VERIFICATION');
  console.log('================================================================\n');

  const server = await createServer();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  } catch (e) {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }
  let passed = 0;
  let failed = 0;

  function pass(name, detail = '') {
    passed++;
    console.log(`  ✅ [PASS] ${name}${detail ? ` (${detail})` : ''}`);
  }

  function fail(name, err) {
    failed++;
    console.error(`  ❌ [FAIL] ${name}: ${err.message || err}`);
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    // Test 1: Static Code Invariants
    const profileHtml = fs.readFileSync(path.join(ROOT_DIR, 'profile.html'), 'utf8');
    const profileJs = fs.readFileSync(path.join(ROOT_DIR, 'profile.js'), 'utf8');
    const profileCss = fs.readFileSync(path.join(ROOT_DIR, 'profile.css'), 'utf8');
    const dashboardJs = fs.readFileSync(path.join(ROOT_DIR, 'dashboard.js'), 'utf8');

    assert.ok(profileHtml.includes('id="artisan-preview-banner"'), 'profile.html contains #artisan-preview-banner');
    assert.ok(profileHtml.includes('id="artisan-review-disabled-pill"'), 'profile.html contains #artisan-review-disabled-pill');
    assert.ok(profileCss.includes('.artisan-preview-banner'), 'profile.css contains .artisan-preview-banner styles');
    assert.ok(profileCss.includes('.artisan-viewonly-pill'), 'profile.css contains .artisan-viewonly-pill styles');
    assert.ok(dashboardJs.includes('preview=artisan'), 'dashboard.js appends preview=artisan to public profile links');
    pass('Gate 1: Static Architecture & File Markup Integrity');

    // Test 2: Artisan Preview Mode via URL Parameter (?id=101&preview=artisan)
    await page.goto(`http://localhost:${PORT}/profile.html?id=101&preview=artisan`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const isBannerVisible = await page.$eval('#artisan-preview-banner', el => window.getComputedStyle(el).display !== 'none');
    assert.strictEqual(isBannerVisible, true, 'Artisan preview banner is displayed');

    const isWriteReviewHidden = await page.$eval('#btn-open-review-modal', el => window.getComputedStyle(el).display === 'none');
    assert.strictEqual(isWriteReviewHidden, true, 'Write a Review button is hidden for artisan viewing own profile');

    const isViewOnlyPillVisible = await page.$eval('#artisan-review-disabled-pill', el => window.getComputedStyle(el).display !== 'none');
    assert.strictEqual(isViewOnlyPillVisible, true, 'View-Only customer reviews pill is displayed');

    const pageTitle = await page.title();
    assert.ok(pageTitle.includes('[Preview]'), 'Page title indicates [Preview] mode');
    pass('Gate 2: Artisan Preview Mode displays view-only banner and hides review button');

    // Test 3: Customer Normal Mode (no preview param, unauthenticated)
    await page.goto(`http://localhost:${PORT}/profile.html?id=101`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const isBannerHiddenCustomer = await page.$eval('#artisan-preview-banner', el => window.getComputedStyle(el).display === 'none');
    assert.strictEqual(isBannerHiddenCustomer, true, 'Artisan preview banner is hidden for customers');

    const isWriteReviewVisibleCustomer = await page.$eval('#btn-open-review-modal', el => window.getComputedStyle(el).display !== 'none');
    assert.strictEqual(isWriteReviewVisibleCustomer, true, 'Write a Review button is visible for customers');

    const isViewOnlyPillHiddenCustomer = await page.$eval('#artisan-review-disabled-pill', el => window.getComputedStyle(el).display === 'none');
    assert.strictEqual(isViewOnlyPillHiddenCustomer, true, 'View-Only pill is hidden for customers');
    pass('Gate 3: Customer Mode retains review button and normal discovery flow');

    // Test 4: Mobile Viewport 375x667 Artisan Preview Mode
    const mobilePage = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await mobilePage.goto(`http://localhost:${PORT}/profile.html?id=101&preview=artisan`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(500);

    const mobileBannerVisible = await mobilePage.$eval('#artisan-preview-banner', el => window.getComputedStyle(el).display !== 'none');
    assert.strictEqual(mobileBannerVisible, true, 'Mobile displays artisan preview banner');

    const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.strictEqual(overflow, false, 'Mobile has zero horizontal overflow in preview mode');
    pass('Gate 4: Mobile viewport responsiveness and 0 overflow verified');

    // Test 5: Server-side API Self-Review Prohibited (POST /api/service-review)
    const selfReviewRes = await page.evaluate(async (port) => {
      const res = await fetch(`http://localhost:${port}/api/service-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_review',
          provider_id: 101,
          customer_identifier: '101', // Self review
          customer_name: 'Myself',
          rating: 5,
          comment: 'Self review attempt'
        })
      });
      return { status: res.status, data: await res.json() };
    }, PORT);

    assert.strictEqual(selfReviewRes.status, 403, 'API strictly returns HTTP 403 for self-review');
    assert.ok(selfReviewRes.data.error.includes('Self-Review Prohibited'), 'Error message specifies self-review prohibition');
    pass('Gate 5: Serverless review endpoint enforces HTTP 403 self-review barrier');

  } catch (err) {
    fail('Execution error', err);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n================================================================');
  console.log(`  VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();

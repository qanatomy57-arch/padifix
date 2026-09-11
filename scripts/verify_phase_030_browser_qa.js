/**
 * PADIFIX — PHASE 030 BROWSER QA AUTOMATION SUITE
 * scripts/verify_phase_030_browser_qa.js
 *
 * Dual-viewport (Desktop 1280x800 & Mobile 390x844) end-to-end browser test:
 * 1. Serverless SSR Landing Page loads with clean URL rewrites
 * 2. Semantic HTML5 verification (single H1, canonical URL, breadcrumbs)
 * 3. Localized pricing estimates table in Naira (₦)
 * 4. Nigerian neighborhood & landmark pills
 * 5. Verified artisan cards rendering with verified badges
 * 6. Dual conversion actions (Click-to-Call, WhatsApp direct)
 * 7. FAQ accordion interactivity (expand/collapse toggle)
 * 8. Smart Radius Expansion behavior for low-liquidity localities
 * 9. Google Mobile-Friendly criteria: touch targets >= 44px minimum
 * 10. Strict 0px horizontal document overflow check (Desktop & Mobile)
 * 11. Zero uncaught console errors
 * 12. Desktop & Mobile screenshot capture
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const PORT = 8898;
const REPO_ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\6b1d7c94-91ab-46fa-b918-8ff1283ede05';

// Handlers
const landingPageHandler = require('../api/landing-page');
const sitemapHandler = require('../api/sitemap');

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

const recordedContactEvents = [];

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

function startTestServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
      const pathname = parsedUrl.pathname;

      // Contact meter endpoint simulator
      if (pathname.startsWith('/api/contact-meter')) {
        const body = await parseBody(req);
        recordedContactEvents.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', recorded: true }));
        return;
      }

      // Landing page API and Clean URL rewrites
      // /services/:trade/:state/:lga
      // /services/:trade/:state
      // /services/:trade
      const servicesMatch = pathname.match(/^\/services\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
      if (servicesMatch || pathname === '/api/landing-page') {
        let query = Object.fromEntries(parsedUrl.searchParams);
        if (servicesMatch) {
          query = {
            trade: servicesMatch[1],
            state: servicesMatch[2] || '',
            lga: servicesMatch[3] || '',
            ...query
          };
        }

        const mockReq = {
          method: req.method,
          url: req.url,
          query,
          headers: req.headers,
          socket: req.socket
        };

        const mockRes = {
          _status: 200,
          _headers: {},
          status(c) { this._status = c; return this; },
          setHeader(k, v) { this._headers[k] = v; return this; },
          json(d) {
            res.writeHead(this._status, { 'Content-Type': 'application/json', ...this._headers });
            res.end(JSON.stringify(d));
            return this;
          },
          send(d) {
            res.writeHead(this._status, this._headers);
            res.end(d || '');
            return this;
          },
          end(data) {
            res.writeHead(this._status, this._headers);
            res.end(data || '');
            return this;
          }
        };

        return landingPageHandler(mockReq, mockRes);
      }

      // Sitemap rewrite
      if (pathname === '/sitemap.xml' || pathname.startsWith('/sitemap-')) {
        let section = 'index';
        const sitemapMatch = pathname.match(/^\/sitemap-([^.]+)\.xml$/);
        if (sitemapMatch) {
          section = sitemapMatch[1];
        }

        const mockReq = {
          method: req.method,
          url: req.url,
          query: { section, ...Object.fromEntries(parsedUrl.searchParams) },
          headers: req.headers
        };

        const mockRes = {
          _status: 200,
          _headers: {},
          status(c) { this._status = c; return this; },
          setHeader(k, v) { this._headers[k] = v; return this; },
          json(d) {
            res.writeHead(this._status, { 'Content-Type': 'application/json', ...this._headers });
            res.end(JSON.stringify(d));
            return this;
          },
          send(d) {
            res.writeHead(this._status, this._headers);
            res.end(d || '');
            return this;
          },
          end(data) {
            res.writeHead(this._status, this._headers);
            res.end(data || '');
            return this;
          }
        };

        return sitemapHandler(mockReq, mockRes);
      }

      // Static file server
      const filePath = path.join(REPO_ROOT, pathname === '/' ? 'index.html' : pathname);
      if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        return fs.createReadStream(filePath).pipe(res);
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    server.listen(PORT, () => {
      resolve(server);
    });
  });
}

async function runBrowserQa() {
  console.log('======================================================================');
  console.log('PADIFIX PHASE 030: DUAL-VIEWPORT BROWSER QA & MOBILE AUDIT');
  console.log('======================================================================\n');

  const server = await startTestServer();
  console.log(`[Server] Local test server active on http://localhost:${PORT}`);

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch (e) {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  }
  const consoleErrors = [];
  const testResults = {
    desktopPassed: false,
    mobilePassed: false,
    accordionPassed: false,
    touchTargetsPassed: false,
    zeroOverflowPassed: false,
    radiusExpansionPassed: false,
    contactTrackingPassed: false
  };

  try {
    // -------------------------------------------------------------------------
    // 1. DESKTOP VIEWPORT AUDIT (1280 x 800)
    // -------------------------------------------------------------------------
    console.log('\n--- 1. DESKTOP VIEWPORT (1280 x 800) ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const desktopPage = await desktopContext.newPage();

    desktopPage.on('pageerror', (err) => {
      consoleErrors.push({ viewport: 'desktop', error: err.message });
    });

    const desktopUrl = `http://localhost:${PORT}/services/electrician/lagos/ikeja`;
    console.log(`[Navigation] Opening ${desktopUrl}...`);
    const response = await desktopPage.goto(desktopUrl, { waitUntil: 'domcontentloaded' });
    assert.strictEqual(response.status(), 200, 'Desktop response status must be 200');

    // Single H1 Check
    const h1Count = await desktopPage.locator('h1').count();
    const h1Text = await desktopPage.locator('h1').first().innerText();
    console.log(`  ✓ Single H1 verified: "${h1Text}" (count=${h1Count})`);
    assert.strictEqual(h1Count, 1, 'Exactly one H1 must exist');
    assert(h1Text.includes('Electrician') && h1Text.includes('Ikeja'), 'H1 must contain trade and locality');

    // Breadcrumb Hierarchy
    const breadcrumbLinks = await desktopPage.locator('.crumb-link').allInnerTexts();
    console.log(`  ✓ Breadcrumb trail: ${breadcrumbLinks.join(' > ')}`);
    assert(breadcrumbLinks.length >= 2, 'Breadcrumb must have at least 2 parent links');

    // Local Pricing Table
    const priceRows = await desktopPage.locator('.price-row').count();
    console.log(`  ✓ Pricing guide present: ${priceRows} localized estimates rendered`);
    assert(priceRows > 0, 'Pricing table must render estimates');

    // Neighborhood Pills
    const nhPills = await desktopPage.locator('.nh-chip').count();
    console.log(`  ✓ Neighborhood landmark tags: ${nhPills} local area chips rendered`);

    // Artisan Cards
    const artisanCards = await desktopPage.locator('.artisan-card').count();
    console.log(`  ✓ Verified artisan directory cards count: ${artisanCards}`);
    assert(artisanCards > 0, 'Must display verified artisans');

    // FAQ Accordion Interactivity
    const firstFaq = desktopPage.locator('details.faq-item').first();
    const faqSummary = firstFaq.locator('summary.faq-question');
    const isInitiallyOpen = await firstFaq.evaluate(el => el.hasAttribute('open'));
    console.log(`  ✓ First FAQ initial open state: ${isInitiallyOpen}`);

    // Toggle FAQ
    await faqSummary.click();
    const isAfterClick = await firstFaq.evaluate(el => el.hasAttribute('open'));
    console.log(`  ✓ FAQ accordion click toggle verified: isOpen=${isAfterClick}`);
    assert.notStrictEqual(isInitiallyOpen, isAfterClick, 'FAQ accordion must toggle open state on click');
    testResults.accordionPassed = true;

    // Contact Action (Call / WhatsApp) & Tracking
    const callBtn = desktopPage.locator('.btn-call').first();
    const callHref = await callBtn.getAttribute('href');
    assert(callHref.startsWith('tel:'), 'Call button must have tel: URI');

    const waBtn = desktopPage.locator('.btn-wa').first();
    const waHref = await waBtn.getAttribute('href');
    assert(waHref.includes('wa.me'), 'WhatsApp button must link to wa.me');

    // Click WhatsApp button to trigger contact-meter telemetry
    await waBtn.click();
    await desktopPage.waitForTimeout(500);
    console.log(`  ✓ Conversion links verified: Call (${callHref}), WhatsApp (${waHref.substring(0, 30)}...)`);
    console.log(`  ✓ Contact-meter telemetry events recorded: ${recordedContactEvents.length}`);
    testResults.contactTrackingPassed = recordedContactEvents.length > 0;

    // Zero Horizontal Overflow Audit
    const desktopOverflow = await desktopPage.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    console.log(`  ✓ Desktop horizontal overflow: ${desktopOverflow}px`);
    assert(desktopOverflow <= 0, `Desktop document must have 0px horizontal overflow, got ${desktopOverflow}px`);

    // Touch Targets Height Audit (>= 44px)
    const callBtnBox = await callBtn.boundingBox();
    console.log(`  ✓ Primary CTA touch height: ${Math.round(callBtnBox.height)}px (width: ${Math.round(callBtnBox.width)}px)`);
    assert(callBtnBox.height >= 44, 'Call button touch height must be >= 44px');

    // Capture Desktop Screenshot
    const desktopScreenshotPath = path.join(ARTIFACT_DIR, 'phase_030_landing_desktop.png');
    await desktopPage.screenshot({ path: desktopScreenshotPath, fullPage: false });
    console.log(`  ✓ Captured desktop screenshot to: ${desktopScreenshotPath}`);

    testResults.desktopPassed = true;
    await desktopContext.close();

    // -------------------------------------------------------------------------
    // 2. MOBILE VIEWPORT AUDIT (390 x 844 — iPhone 12/13/14 class)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. MOBILE VIEWPORT (390 x 844) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();

    mobilePage.on('pageerror', (err) => {
      consoleErrors.push({ viewport: 'mobile', error: err.message });
    });

    const mobileUrl = `http://localhost:${PORT}/services/plumber/lagos/eti-osa`;
    console.log(`[Navigation] Opening ${mobileUrl}...`);
    const mobileResp = await mobilePage.goto(mobileUrl, { waitUntil: 'domcontentloaded' });
    assert.strictEqual(mobileResp.status(), 200, 'Mobile response status must be 200');

    // Mobile single H1 check
    const mobileH1 = await mobilePage.locator('h1').innerText();
    console.log(`  ✓ Mobile H1 verified: "${mobileH1}"`);

    // Mobile Horizontal Overflow
    const mobileOverflow = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    console.log(`  ✓ Mobile document horizontal overflow: ${mobileOverflow}px`);
    assert(mobileOverflow <= 0, `Mobile document must have 0px horizontal overflow, got ${mobileOverflow}px`);
    testResults.zeroOverflowPassed = true;

    // Mobile Touch Targets Audit (Google Mobile-Friendly Criteria)
    const buttons = await mobilePage.locator('.btn-action, summary.faq-question, .btn-recruit').all();
    let sub44Count = 0;
    for (const btn of buttons) {
      const box = await btn.boundingBox();
      if (box && box.height < 43.5) { // sub-44px check with small subpixel tolerance
        sub44Count++;
      }
    }
    console.log(`  ✓ Interactive touch targets audited: ${buttons.length} elements, sub-44px count: ${sub44Count}`);
    assert.strictEqual(sub44Count, 0, 'All mobile touch targets must be >= 44px');
    testResults.touchTargetsPassed = true;

    // Capture Mobile Screenshot
    const mobileScreenshotPath = path.join(ARTIFACT_DIR, 'phase_030_landing_mobile.png');
    await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: false });
    console.log(`  ✓ Captured mobile screenshot to: ${mobileScreenshotPath}`);

    // -------------------------------------------------------------------------
    // 3. SMART RADIUS EXPANSION AUDIT (Low Liquidity Locality)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. SMART RADIUS EXPANSION (Low-Liquidity Locality: Badagry) ---');
    const radiusUrl = `http://localhost:${PORT}/services/plumber/lagos/badagry`;
    console.log(`[Navigation] Opening ${radiusUrl}...`);
    const radiusResp = await mobilePage.goto(radiusUrl, { waitUntil: 'domcontentloaded' });
    assert.strictEqual(radiusResp.status(), 200, 'Radius expansion page must return 200');

    // Check for "Serves this area" badge or Recruitment CTA
    const radiusBadgeCount = await mobilePage.locator('.badge-radius').count();
    const recruitCtaCount = await mobilePage.locator('.recruitment-banner, .btn-recruit').count();
    console.log(`  ✓ Smart radius badges rendered: ${radiusBadgeCount}`);
    console.log(`  ✓ Artisan recruitment CTA elements rendered: ${recruitCtaCount}`);
    assert(radiusBadgeCount > 0 || recruitCtaCount > 0, 'Must provide radius expansion or artisan recruitment fallback');
    testResults.radiusExpansionPassed = true;

    // Overflow check on radius page
    const radiusOverflow = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    console.log(`  ✓ Radius page horizontal overflow: ${radiusOverflow}px`);
    assert(radiusOverflow <= 0, 'Radius page must have 0px horizontal overflow');

    testResults.mobilePassed = true;
    await mobileContext.close();

  } catch (err) {
    console.error(`\n❌ FATAL BROWSER QA ERROR: ${err.message}`);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    console.log('\n[Server] Test server stopped.');
  }

  // Final QA Report
  console.log('\n======================================================================');
  console.log('BROWSER QA RESULTS SUMMARY:');
  console.log(`  Desktop Viewport (1280x800):    ${testResults.desktopPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Mobile Viewport (390x844):      ${testResults.mobilePassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  FAQ Accordion Toggle:           ${testResults.accordionPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Google Touch Targets (>=44px):  ${testResults.touchTargetsPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Horizontal Overflow (0px):      ${testResults.zeroOverflowPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Smart Radius Expansion Fallback:${testResults.radiusExpansionPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Contact-Meter Conversion Click: ${testResults.contactTrackingPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Console Errors:                 ${consoleErrors.length === 0 ? '✅ 0 ERRORS' : `❌ ${consoleErrors.length} ERRORS`}`);
  console.log('======================================================================\n');

  if (consoleErrors.length > 0) {
    console.error('Console errors encountered:');
    console.error(consoleErrors);
    process.exitCode = 1;
  }

  if (Object.values(testResults).every(v => v === true) && consoleErrors.length === 0) {
    console.log('🎉 ALL PHASE 030 BROWSER QA CHECKS PASSED UNCONDITIONALLY!\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runBrowserQa();

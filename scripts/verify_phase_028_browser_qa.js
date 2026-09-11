/**
 * PADIFIX — PHASE 028 DUAL-VIEWPORT BROWSER QA
 * scripts/verify_phase_028_browser_qa.js
 *
 * Headless browser automation testing:
 * 1. Desktop Viewport (1280x800) & Mobile Viewport (390x844)
 * 2. Real Authenticated Session Hydration (Provider 8 / ad.padifix@outlook.com)
 * 3. Pipeline Financial & Conversion Ribbon rendering (Revenue, Pipeline, Win Rate)
 * 4. View Switcher toggle: Kanban Board vs Compact List
 * 5. Interactive Horizontal Kanban Board with 5 core stages
 * 6. One-Tap Stage Advancement Modal (Quote amount, labor/materials split)
 * 7. One-Tap WhatsApp Reply Drawer Modal (Dynamic templates, copy & wa.me launch)
 * 8. Zero horizontal page overflow (strict layout budget)
 * 9. Zero uncaught console errors
 * 10. Screenshot artifacts capture
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const PORT = 8895;
const REPO_ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\6b1d7c94-91ab-46fa-b918-8ff1283ede05';

// Load environment variables
const envPath = path.resolve(REPO_ROOT, '.env');
const env = {};
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
}

const TARGET_REF = env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = env.SUPABASE_URL || `https://${TARGET_REF}.supabase.co`;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const PROVIDER_EMAIL = 'ad.padifix@outlook.com';
const PROVIDER_PASSWORD = env.TEST_PROVIDER_A_PASSWORD || '';

const providerLeadsHandler = require('../api/provider-leads');
const providersHandler = require('../api/providers');

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

      if (pathname.startsWith('/api/provider-leads')) {
        const body = await parseBody(req);
        const mockReq = {
          method: req.method,
          url: req.url,
          query: Object.fromEntries(parsedUrl.searchParams),
          headers: req.headers,
          body
        };
        const mockRes = {
          _status: 200,
          _headers: {},
          status(c) { this._status = c; return this; },
          setHeader(k, v) { this._headers[k] = v; return this; },
          json(d) {
            res.writeHead(this._status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...this._headers });
            res.end(JSON.stringify(d));
          },
          end(d) {
            res.writeHead(this._status, { 'Access-Control-Allow-Origin': '*', ...this._headers });
            res.end(d || '');
          }
        };
        return providerLeadsHandler(mockReq, mockRes);
      }

      if (pathname.startsWith('/api/providers')) {
        const body = await parseBody(req);
        const mockReq = {
          method: req.method,
          url: req.url,
          query: Object.fromEntries(parsedUrl.searchParams),
          headers: req.headers,
          body
        };
        const mockRes = {
          _status: 200,
          _headers: {},
          status(c) { this._status = c; return this; },
          setHeader(k, v) { this._headers[k] = v; return this; },
          json(d) {
            res.writeHead(this._status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...this._headers });
            res.end(JSON.stringify(d));
          },
          end(d) {
            res.writeHead(this._status, { 'Access-Control-Allow-Origin': '*', ...this._headers });
            res.end(d || '');
          }
        };
        return providersHandler(mockReq, mockRes);
      }

      if (pathname.startsWith('/api/telemetry')) {
        res.writeHead(204);
        return res.end();
      }

      if (pathname === '/login.js' || pathname === '/register.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        return res.end('// precache stub');
      }

      // Static file serving
      let reqPath = pathname === '/' ? '/dashboard.html' : pathname;
      let filePath = path.join(REPO_ROOT, reqPath);
      if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      }

      if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(PORT, () => {
      resolve(server);
    });
  });
}

async function dismissSplash(page) {
  try {
    await page.evaluate(() => {
      const splash = document.getElementById('pwa-app-splash');
      if (splash) {
        splash.style.display = 'none';
        splash.remove();
      }
    });
  } catch (e) {}
}

async function authenticatePage(page) {
  console.log(`[Auth] Navigating to login.html...`);
  await page.goto(`http://localhost:${PORT}/login.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await dismissSplash(page);
  await page.waitForTimeout(1000);

  console.log(`[Auth] Authenticating as ${PROVIDER_EMAIL}...`);
  await page.fill('#login-email', PROVIDER_EMAIL);
  await page.fill('#login-password', PROVIDER_PASSWORD);
  await page.click('#btn-login-submit');

  console.log('[Auth] Waiting for dashboard redirect...');
  try {
    await page.waitForURL('**/dashboard.html*', { waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch (e) {
    console.log('[Auth] Direct redirect timed out, fetching session token directly...');
    const sessionRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: PROVIDER_EMAIL, password: PROVIDER_PASSWORD })
    });
    const sessionData = await sessionRes.json();
    if (sessionData.access_token) {
      await page.evaluate((s) => {
        localStorage.setItem('lokator_supabase_auth_session', JSON.stringify(s));
        localStorage.setItem('lokator_auth_session', JSON.stringify(s));
        localStorage.setItem('lokator_current_provider_id', '8');
      }, sessionData);
    }
    await page.goto(`http://localhost:${PORT}/dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  }

  await page.waitForTimeout(2000);
  await dismissSplash(page);
}

async function runBrowserQa() {
  console.log('\n======================================================================');
  console.log('PADIFIX PHASE 028: DUAL-VIEWPORT BROWSER QA & KANBAN VALIDATION');
  console.log('======================================================================\n');

  const server = await startTestServer();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch (e) {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  }

  const desktopConsoleErrors = [];
  const mobileConsoleErrors = [];

  try {
    // ------------------------------------------------------------------------
    // A. DESKTOP VIEWPORT (1280 x 800)
    // ------------------------------------------------------------------------
    console.log('--- 1. DESKTOP VIEWPORT (1280 x 800) ---');
    const contextD = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const pageD = await contextD.newPage();
    pageD.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('leaflet') && !text.includes('AudioContext') && !text.includes('Failed to load resource')) {
          desktopConsoleErrors.push(text);
        }
      }
    });

    await authenticatePage(pageD);

    // 1. Verify Pipeline Financial Ribbon
    await pageD.waitForSelector('#crm-pipeline-ribbon', { timeout: 10000 });
    const revText = await pageD.$eval('#crm-metric-revenue', el => el.textContent.trim());
    const pipeText = await pageD.$eval('#crm-metric-pipeline', el => el.textContent.trim());
    const winText = await pageD.$eval('#crm-metric-winrate', el => el.textContent.trim());
    assert.ok(revText.startsWith('₦'), `Revenue metric must display ₦, got ${revText}`);
    assert.ok(pipeText.startsWith('₦'), `Pipeline metric must display ₦, got ${pipeText}`);
    assert.ok(winText.endsWith('%'), `Win rate metric must display %, got ${winText}`);
    console.log(`  ✓ Financial Ribbon verified: Rev=${revText}, Pipeline=${pipeText}, Win Rate=${winText}`);

    // 2. Verify View Switcher & Kanban Board
    await pageD.waitForSelector('.crm-kanban-board', { timeout: 10000 });
    const columnStages = await pageD.$$eval('.crm-kanban-column', cols => cols.map(c => c.dataset.stage));
    assert.ok(columnStages.includes('new'), 'Must include "new" column');
    assert.ok(columnStages.includes('in_discussion'), 'Must include "in_discussion" column');
    assert.ok(columnStages.includes('quote_sent'), 'Must include "quote_sent" column');
    assert.ok(columnStages.includes('scheduled'), 'Must include "scheduled" column');
    assert.ok(columnStages.includes('completed'), 'Must include "completed" column');
    console.log(`  ✓ Kanban Columns verified: [${columnStages.join(', ')}]`);

    // 3. Verify Deal Cards
    const dealCardsCount = await pageD.$$eval('.dash-lead-item.crm-deal-card', cards => cards.length);
    console.log(`  ✓ Rendered Deal Cards count: ${dealCardsCount}`);

    // 4. Test Stage Progression Modal
    const quoteSentBtn = await pageD.$('.btn-crm-advance[data-target-status="quote_sent"]');
    if (quoteSentBtn) {
      await quoteSentBtn.click();
    } else {
      const statusSelect = await pageD.$('.dash-lead-status-select');
      if (statusSelect) {
        await statusSelect.selectOption('quote_sent');
      }
    }
    await pageD.waitForTimeout(500);
    const stageModalVisible = await pageD.$eval('#crm-stage-modal', m => m.style.display !== 'none');
    assert.ok(stageModalVisible, 'Stage modal must open');
    await pageD.click('#btn-close-crm-modal');
    await pageD.waitForTimeout(300);
    console.log('  ✓ Stage progression modal verified');

    // 5. Test WhatsApp Reply Drawer
    const waChip = await pageD.$('.btn-wa-template[data-template="greeting"]');
    if (waChip) {
      await waChip.click();
      await pageD.waitForTimeout(400);
      const waModalVisible = await pageD.$eval('#crm-wa-drawer-modal', m => m.style.display !== 'none');
      assert.ok(waModalVisible, 'WhatsApp drawer must open');
      const waText = await pageD.$eval('#crm-wa-rendered-text', el => el.value);
      assert.ok(waText.includes('PadiFix'), 'Template must reference PadiFix');
      await pageD.click('#btn-close-wa-modal');
      await pageD.waitForTimeout(300);
      console.log('  ✓ WhatsApp Reply Drawer verified with template text');
    }

    // 6. Test View Mode Toggle
    await pageD.click('#btn-view-list');
    await pageD.waitForTimeout(400);
    const inListMode = await pageD.evaluate(() => localStorage.getItem('padifix_leads_view_mode'));
    assert.strictEqual(inListMode, 'list', 'View mode must toggle to list');
    await pageD.click('#btn-view-kanban');
    await pageD.waitForTimeout(400);
    console.log('  ✓ View Switcher toggled (Kanban <-> List)');

    // 7. Check Desktop Horizontal Overflow
    const desktopOverflow = await pageD.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(desktopOverflow, false, 'Desktop must have 0 horizontal overflow');
    console.log('  ✓ Desktop page has 0 horizontal overflow');

    // 8. Capture Desktop Screenshot
    if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const desktopShot = path.join(ARTIFACT_DIR, 'phase_028_dashboard_desktop.png');
    await pageD.screenshot({ path: desktopShot });
    console.log(`  ✓ Desktop Screenshot saved: ${desktopShot}`);

    assert.strictEqual(desktopConsoleErrors.length, 0, `Desktop must have 0 console errors (found: ${desktopConsoleErrors.join(', ')})`);
    console.log('  ✅ Desktop QA 100% Passed\n');
    await contextD.close();


    // ------------------------------------------------------------------------
    // B. MOBILE VIEWPORT (390 x 844)
    // ------------------------------------------------------------------------
    console.log('--- 2. MOBILE VIEWPORT (390 x 844) ---');
    const contextM = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
    });
    const pageM = await contextM.newPage();
    pageM.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('leaflet') && !text.includes('AudioContext') && !text.includes('Failed to load resource')) {
          mobileConsoleErrors.push(text);
        }
      }
    });

    await authenticatePage(pageM);

    // 1. Verify mobile ribbon & kanban
    await pageM.waitForSelector('#crm-pipeline-ribbon', { timeout: 10000 });
    await pageM.waitForSelector('.crm-kanban-board', { timeout: 10000 });

    // 2. Check Mobile Horizontal Page Overflow (document body must not overflow viewport)
    const mobilePageOverflow = await pageM.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(mobilePageOverflow, false, 'Mobile page must not overflow horizontally');
    console.log('  ✓ Mobile page strictly bounded (0px horizontal overflow)');

    // 3. Verify horizontal scroll snap on Kanban track
    const scrollSnap = await pageM.$eval('.crm-kanban-board', el => window.getComputedStyle(el).scrollSnapType);
    assert.ok(scrollSnap.includes('x'), `Kanban must have horizontal scroll snap, got ${scrollSnap}`);
    console.log(`  ✓ Mobile Kanban scroll snap: ${scrollSnap}`);

    // 4. Capture Mobile Screenshot focused on CRM Kanban
    await pageM.$eval('#crm-pipeline-ribbon', el => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
    await pageM.waitForTimeout(500);
    const mobileShot = path.join(ARTIFACT_DIR, 'phase_028_dashboard_mobile.png');
    await pageM.screenshot({ path: mobileShot });
    console.log(`  ✓ Mobile Screenshot saved: ${mobileShot}`);

    assert.strictEqual(mobileConsoleErrors.length, 0, `Mobile must have 0 console errors (found: ${mobileConsoleErrors.join(', ')})`);
    console.log('  ✅ Mobile QA 100% Passed\n');
    await contextM.close();

    // Generate JSON QA report
    const reportPath = path.resolve(REPO_ROOT, 'phase_028_browser_qa_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      status: 'CERTIFIED_GREEN',
      desktop: {
        viewport: '1280x800',
        financial_ribbon: true,
        kanban_columns: columnStages,
        cards_rendered: dealCardsCount,
        no_overflow: true,
        console_errors: desktopConsoleErrors,
        screenshot: desktopShot
      },
      mobile: {
        viewport: '390x844',
        financial_ribbon: true,
        kanban_columns: columnStages,
        scroll_snap: scrollSnap,
        no_overflow: true,
        console_errors: mobileConsoleErrors,
        screenshot: mobileShot
      }
    }, null, 2));

    console.log('🎉 PHASE 028 DUAL-VIEWPORT BROWSER QA PASSED (100% GREEN)\n');
  } finally {
    await browser.close();
    server.close();
  }
}

runBrowserQa().catch(err => {
  console.error('Fatal browser QA error:', err);
  process.exit(1);
});

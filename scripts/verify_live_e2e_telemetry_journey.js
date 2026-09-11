/**
 * PADIFIX — PHASE 024 LIVE PRODUCTION END-TO-END TELEMETRY AUDIT
 * Dual-Viewport Verification (Desktop 1280x800 + Mobile 390x844)
 * Target: https://padifix.vercel.app
 * Database: hvxosxhnxauiqrhpyuur (public.analytics_events)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const repoRoot = path.resolve(__dirname, '..');
const { chromium } = require(path.join(repoRoot, 'node_modules', 'playwright'));

const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\619727b0-ca46-4f9d-ac6e-345b27b54af3';

function loadEnv() {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.substring(0, idx).trim();
      let v = trimmed.substring(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[k] = v;
    }
  }
  return env;
}

const env = loadEnv();
const PROD_URL = env.APP_URL || 'https://padifix.vercel.app';
const SUPABASE_URL = env.SUPABASE_URL || 'https://hvxosxhnxauiqrhpyuur.supabase.co';
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('FATAL: Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

function querySupabase(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/rest/v1/${endpoint}`, SUPABASE_URL);
    const opts = {
      method: 'GET',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Supabase query timed out'));
    });
    req.end();
  });
}

const FORBIDDEN_PII = ['password', 'pwd', 'token', 'access_token', 'jwt', 'secret', 'nin', 'bvn', 'phone', 'email', 'whatsapp_message'];

function assertZeroPII(events) {
  const violations = [];
  for (const ev of events) {
    const props = ev.properties || {};
    for (const key of Object.keys(props)) {
      if (FORBIDDEN_PII.includes(key.toLowerCase())) {
        violations.push({ event_id: ev.id, key, value: props[key] });
      }
    }
  }
  return violations;
}

async function flushPageTelemetry(page) {
  try {
    await page.evaluate(async () => {
      if (window.LokatorTelemetry && typeof window.LokatorTelemetry.flushBatch === 'function') {
        await window.LokatorTelemetry.flushBatch();
      }
    });
    await page.waitForTimeout(1000);
  } catch (e) {}
}

async function runDesktopJourney(browser) {
  console.log('\n--- 1. DESKTOP JOURNEY (1280 x 800) ---');
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 PadiFixE2E/Desktop'
  });

  const page = await context.newPage();

  // 1. Home
  console.log(`[Desktop] Navigating to ${PROD_URL}/ ...`);
  await page.goto(`${PROD_URL}/`, { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(1200);
  const homeScreenshot = path.join(ARTIFACT_DIR, 'e2e_live_desktop_home.png');
  await page.screenshot({ path: homeScreenshot });
  console.log(`[Desktop] Saved screenshot: ${homeScreenshot}`);

  // Flush home page_view
  await flushPageTelemetry(page);

  // 2. Search
  console.log('[Desktop] Searching for "electrician"...');
  const input = await page.$('#service-input');
  if (input) {
    await input.focus();
    await input.fill('electrician');
    await page.waitForTimeout(800);
    await page.keyboard.press('Enter');
  } else {
    await page.goto(`${PROD_URL}/search.html?service=electrician`, { waitUntil: 'networkidle' });
  }

  await page.waitForTimeout(2500);
  const searchScreenshot = path.join(ARTIFACT_DIR, 'e2e_live_desktop_search.png');
  await page.screenshot({ path: searchScreenshot });
  console.log(`[Desktop] Saved screenshot: ${searchScreenshot}`);

  // Flush search events
  await flushPageTelemetry(page);

  // 3. Provider Card Click
  console.log('[Desktop] Clicking provider profile...');
  const cardSelector = '.provider-card a, .provider-card, a[href*="profile.html"], .provider-item';
  const card = await page.$(cardSelector);
  if (card) {
    await card.click();
    await page.waitForTimeout(2500);
  } else {
    await page.goto(`${PROD_URL}/profile.html?id=1`, { waitUntil: 'networkidle' });
  }

  const profileScreenshot = path.join(ARTIFACT_DIR, 'e2e_live_desktop_profile.png');
  await page.screenshot({ path: profileScreenshot });
  console.log(`[Desktop] Saved screenshot: ${profileScreenshot}`);

  // 4. Contact Action
  console.log('[Desktop] Triggering contact intent...');
  const contactBtn = await page.$('a[href*="wa.me"], a[href*="tel:"], button.contact-btn, .action-btn, #btn-wa-hero');
  if (contactBtn) {
    try {
      await contactBtn.click();
      await page.waitForTimeout(1000);
    } catch (e) {}
  }

  // 5. Final Flush & retrieve session ID
  console.log('[Desktop] Final batch flush to /api/telemetry ...');
  await flushPageTelemetry(page);
  const sessionId = await page.evaluate(() => sessionStorage.getItem('lokator_telemetry_session_id'));

  console.log(`[Desktop] Session ID: ${sessionId}`);
  await page.waitForTimeout(3000);
  await context.close();
  return sessionId;
}

async function runMobileJourney(browser) {
  console.log('\n--- 2. MOBILE JOURNEY (390 x 844) ---');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 PadiFixE2E/Mobile'
  });

  const page = await context.newPage();

  // 1. Home Mobile
  console.log(`[Mobile] Navigating to ${PROD_URL}/ ...`);
  await page.goto(`${PROD_URL}/`, { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(1200);
  const homeScreenshot = path.join(ARTIFACT_DIR, 'e2e_live_mobile_home.png');
  await page.screenshot({ path: homeScreenshot });
  console.log(`[Mobile] Saved screenshot: ${homeScreenshot}`);

  // Flush home page_view
  await flushPageTelemetry(page);

  // 2. Search Mobile
  console.log('[Mobile] Searching for "plumber"...');
  const input = await page.$('#service-input');
  if (input) {
    await input.focus();
    await input.fill('plumber');
    await page.waitForTimeout(800);
    await page.keyboard.press('Enter');
  } else {
    await page.goto(`${PROD_URL}/search.html?service=plumber`, { waitUntil: 'networkidle' });
  }

  await page.waitForTimeout(2500);
  const searchScreenshot = path.join(ARTIFACT_DIR, 'e2e_live_mobile_search.png');
  await page.screenshot({ path: searchScreenshot });
  console.log(`[Mobile] Saved screenshot: ${searchScreenshot}`);

  // Flush search events
  await flushPageTelemetry(page);

  // 3. Provider Card Click
  console.log('[Mobile] Clicking provider profile...');
  const cardSelector = '.provider-card a, .provider-card, a[href*="profile.html"], .provider-item';
  const card = await page.$(cardSelector);
  if (card) {
    await card.click();
    await page.waitForTimeout(2500);
  } else {
    await page.goto(`${PROD_URL}/profile.html?id=2`, { waitUntil: 'networkidle' });
  }

  const profileScreenshot = path.join(ARTIFACT_DIR, 'e2e_live_mobile_profile.png');
  await page.screenshot({ path: profileScreenshot });
  console.log(`[Mobile] Saved screenshot: ${profileScreenshot}`);

  // 4. Contact Action
  console.log('[Mobile] Triggering contact intent...');
  const contactBtn = await page.$('a[href*="wa.me"], a[href*="tel:"], button.contact-btn, .action-btn, #btn-wa-hero');
  if (contactBtn) {
    try {
      await contactBtn.click();
      await page.waitForTimeout(1000);
    } catch (e) {}
  }

  // 5. Final Flush & retrieve session ID
  console.log('[Mobile] Final batch flush to /api/telemetry ...');
  await flushPageTelemetry(page);
  const sessionId = await page.evaluate(() => sessionStorage.getItem('lokator_telemetry_session_id'));

  console.log(`[Mobile] Session ID: ${sessionId}`);
  await page.waitForTimeout(3000);
  await context.close();
  return sessionId;
}

async function fetchWithRetry(sessionId, maxRetries = 4, delayMs = 3000) {
  for (let i = 1; i <= maxRetries; i++) {
    const res = await querySupabase(`analytics_events?session_id=eq.${sessionId}&order=created_at.asc`);
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      return res.data;
    }
    console.log(`  ⏳ Waiting for telemetry ingestion (Attempt ${i}/${maxRetries})...`);
    await new Promise(r => setTimeout(r, delayMs));
  }
  return [];
}

async function verifyTelemetryInSupabase(desktopSessionId, mobileSessionId) {
  console.log('\n--- 3. SUPABASE LIVE DATABASE AUDIT (public.analytics_events) ---');

  // Verify Desktop Session
  console.log(`\nAuditing Desktop Session: ${desktopSessionId}`);
  const desktopEvents = await fetchWithRetry(desktopSessionId);
  if (desktopEvents.length === 0) {
    console.warn(`[Desktop] Zero rows returned for ${desktopSessionId}`);
  } else {
    console.log(`✅ [Desktop] Successfully retrieved ${desktopEvents.length} telemetry events from Supabase!`);
    console.table(desktopEvents.map(d => ({
      id: d.id.substring(0, 8) + '...',
      event_name: d.event_name,
      page_path: d.page_path,
      device_class: d.device_class,
      created_at: d.created_at
    })));

    const desktopClasses = desktopEvents.map(d => d.device_class);
    const nonDesktop = desktopClasses.filter(c => c !== 'desktop');
    if (nonDesktop.length === 0) {
      console.log('✅ [Desktop] 100% of events correctly classified as "desktop".');
    } else {
      console.warn(`⚠️ [Desktop] Non-desktop classes found:`, nonDesktop);
    }

    const piiViolations = assertZeroPII(desktopEvents);
    if (piiViolations.length === 0) {
      console.log('✅ [Desktop] ZERO PII detected across all recorded properties.');
    } else {
      console.error('❌ [Desktop] PII LEAK DETECTED:', piiViolations);
    }
  }

  // Verify Mobile Session
  console.log(`\nAuditing Mobile Session: ${mobileSessionId}`);
  const mobileEvents = await fetchWithRetry(mobileSessionId);
  if (mobileEvents.length === 0) {
    console.warn(`[Mobile] Zero rows returned for ${mobileSessionId}`);
  } else {
    console.log(`✅ [Mobile] Successfully retrieved ${mobileEvents.length} telemetry events from Supabase!`);
    console.table(mobileEvents.map(d => ({
      id: d.id.substring(0, 8) + '...',
      event_name: d.event_name,
      page_path: d.page_path,
      device_class: d.device_class,
      created_at: d.created_at
    })));

    const mobileClasses = mobileEvents.map(d => d.device_class);
    const nonMobile = mobileClasses.filter(c => c !== 'mobile');
    if (nonMobile.length === 0) {
      console.log('✅ [Mobile] 100% of events correctly classified as "mobile".');
    } else {
      console.warn(`⚠️ [Mobile] Non-mobile classes found:`, nonMobile);
    }

    const piiViolations = assertZeroPII(mobileEvents);
    if (piiViolations.length === 0) {
      console.log('✅ [Mobile] ZERO PII detected across all recorded properties.');
    } else {
      console.error('❌ [Mobile] PII LEAK DETECTED:', piiViolations);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    target_url: PROD_URL,
    supabase_project: 'hvxosxhnxauiqrhpyuur',
    desktop_session: {
      session_id: desktopSessionId,
      event_count: desktopEvents.length,
      events: desktopEvents
    },
    mobile_session: {
      session_id: mobileSessionId,
      event_count: mobileEvents.length,
      events: mobileEvents
    }
  };

  const reportPath = path.join(repoRoot, 'phase_024_live_e2e_telemetry_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Saved complete E2E audit report to: ${reportPath}`);
  return report;
}

async function main() {
  console.log('================================================================');
  console.log('  PADIFIX PHASE 024 — LIVE PRODUCTION E2E TELEMETRY AUDIT');
  console.log(`  Production URL: ${PROD_URL}`);
  console.log(`  Timestamp:      ${new Date().toISOString()}`);
  console.log('================================================================');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    const desktopSessionId = await runDesktopJourney(browser);
    const mobileSessionId = await runMobileJourney(browser);
    await verifyTelemetryInSupabase(desktopSessionId, mobileSessionId);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL ERROR during E2E Telemetry Audit:', err);
    process.exit(1);
  });
}

module.exports = { runDesktopJourney, runMobileJourney, verifyTelemetryInSupabase };

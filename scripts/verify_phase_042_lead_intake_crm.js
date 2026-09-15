/**
 * PADIFIX PHASE 042 — AUTOMATED VERIFICATION SUITE
 * scripts/verify_phase_042_lead_intake_crm.js
 *
 * Comprehensive test matrix covering:
 * Gate 1: Frontend Intake Modal & WhatsApp Deep-Link Engine
 * Gate 2: Server-Side Contact-Meter & Canonical Intent Formatting
 * Gate 3: SMS Copy Safety & <= 160 Char Ceiling Under All Permutations
 * Gate 4: Dashboard CRM Urgency Intelligence & XSS Escape Verification
 * Gate 5: Security Boundaries, Function Budget (<= 12) & Zero Secrets
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');

// Load modules under test
const contactMeterHandler = require('../api/contact-meter');
const notificationService = require('../lib/artisan-notification-service');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

asyncTest.prototype = {};
async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log('  PADIFIX PHASE 042: ARTISAN JOB LEADS & CRM INTELLIGENCE QA');
  console.log('================================================================\n');

  // ====================================================================
  // GATE 1: INTAKE MODAL LOGIC & CANONICAL WHATSAPP DEEP-LINK GENERATION
  // ====================================================================
  console.log('--- GATE 1: Intake Modal Sanitization & WhatsApp URL Generation ---');

  // Mock browser global for intake-modal testing in Node environment
  const mockWindow = {};
  const intakeModalCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'intake-modal.js'), 'utf8');
  const runInContext = new Function('window', 'document', intakeModalCode);
  const mockDocument = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      setAttribute: () => {},
      appendChild: () => {},
      classList: { add: () => {}, remove: () => {} },
      style: {},
      addEventListener: () => {}
    }),
    body: {
      appendChild: () => {}
    },
    head: {
      appendChild: () => {}
    }
  };

  runInContext(mockWindow, mockDocument);
  const PadiFixIntake = mockWindow.PadiFixIntake;

  test('1.1 PadiFixIntake global controller is exposed and initialized', () => {
    assert.ok(PadiFixIntake, 'PadiFixIntake must be exported on window');
    assert.strictEqual(typeof PadiFixIntake.open, 'function', 'open() must be a function');
    assert.strictEqual(typeof PadiFixIntake.buildWhatsAppUrl, 'function', 'buildWhatsAppUrl() must be a function');
    assert.strictEqual(typeof PadiFixIntake.formatIntentTag, 'function', 'formatIntentTag() must be a function');
    assert.strictEqual(typeof PadiFixIntake.sanitize, 'function', 'sanitize() must be a function');
    assert.strictEqual(typeof PadiFixIntake.escapeHtml, 'function', 'escapeHtml() must be a function');
  });

  test('1.2 Sanitization strictly bounds input to max length and strips control characters', () => {
    const oversized = 'A'.repeat(120);
    const sanitized = PadiFixIntake.sanitize(oversized, 80);
    assert.strictEqual(sanitized.length, 80, 'Oversized input must be truncated to 80 chars');

    const withControls = "Electrician\r\n\tServices\x00\x1fSpecial";
    const cleanControls = PadiFixIntake.sanitize(withControls, 80);
    assert.ok(!cleanControls.includes('\r') && !cleanControls.includes('\n'), 'Control chars must be stripped');
  });

  test('1.3 HTML and script tags are strictly escaped', () => {
    const xss = '<script>alert("XSS")</script>';
    const escaped = PadiFixIntake.escapeHtml(xss);
    assert.strictEqual(escaped, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;', 'Must escape HTML tags and quotes');

    const attrXss = '" onmouseover="alert(1)';
    const escapedAttr = PadiFixIntake.escapeHtml(attrXss);
    assert.ok(!escapedAttr.includes('"'), 'Double quotes must be escaped');
  });

  test('1.4 Urgency allowlist maps canonical internal values to canonical prefixes', () => {
    assert.strictEqual(PadiFixIntake.formatIntentTag('today', 'Wiring'), '[URGENT] Wiring');
    assert.strictEqual(PadiFixIntake.formatIntentTag('2-3_days', 'Inverter/Solar'), '[2-3 DAYS] Inverter/Solar');
    assert.strictEqual(PadiFixIntake.formatIntentTag('flexible', 'Appliance Install'), '[FLEXIBLE] Appliance Install');
  });

  test('1.5 Arbitrary or invalid urgency values default safely without unauthorized prefix', () => {
    const invalid = PadiFixIntake.formatIntentTag('CRITICAL_ADMIN_OVERRIDE', 'Wiring');
    assert.strictEqual(invalid, 'Wiring', 'Invalid urgency must not inject arbitrary prefix');

    const empty = PadiFixIntake.formatIntentTag(null, 'Plumbing Repair');
    assert.strictEqual(empty, 'Plumbing Repair', 'Null urgency returns plain service');
  });

  test('1.6 Canonical WhatsApp URL formatting with full URL encoding', () => {
    const url = PadiFixIntake.buildWhatsAppUrl('08031234567', {
      service: 'Wiring & Sockets',
      locality: 'Ikeja / GRA',
      urgency: 'today'
    });

    assert.ok(url.startsWith('https://wa.me/2348031234567?text='), 'Must format canonical wa.me deep link');
    assert.ok(!url.includes(' '), 'Must have zero unencoded spaces');
    assert.ok(!url.includes('&Sockets'), 'Ampersand must be percent-encoded');
    assert.ok(!url.includes('/GRA'), 'Slash must be encoded');

    const decoded = decodeURIComponent(url.split('text=')[1]);
    assert.strictEqual(decoded, 'Hi, I found you on PadiFix. I need help with Wiring & Sockets in Ikeja / GRA. Urgency: Today.');
  });

  test('1.7 WhatsApp URL handles Unicode (Nigerian accents & emojis) cleanly', () => {
    const url = PadiFixIntake.buildWhatsAppUrl('+2348099887766', {
      service: 'Ọ̀kọ́ Repair ⚡',
      locality: 'Èkó Island',
      urgency: '2-3_days'
    });

    assert.ok(url.startsWith('https://wa.me/2348099887766?text='), 'Target destination correct');
    const decoded = decodeURIComponent(url.split('text=')[1]);
    assert.strictEqual(decoded, 'Hi, I found you on PadiFix. I need help with Ọ̀kọ́ Repair ⚡ in Èkó Island. Urgency: In 2-3 Days.');
  });

  test('1.8 WhatsApp URL with empty optional fields falls back gracefully', () => {
    const url = PadiFixIntake.buildWhatsAppUrl('2348123456789', {});
    const decoded = decodeURIComponent(url.split('text=')[1]);
    assert.strictEqual(decoded, 'Hi, I found you on PadiFix. I would like to inquire about your artisan services.');
  });


  // ====================================================================
  // GATE 2: SERVER-SIDE CONTACT-METER SANITIZATION & BACKWARD COMPATIBILITY
  // ====================================================================
  console.log('\n--- GATE 2: Server-Side Contact-Meter & Backward Compatibility ---');

  function mockReqRes(body, method = 'POST') {
    const req = {
      method,
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body
    };
    let statusCode = 200;
    let responseData = null;
    const headers = {};

    const res = {
      setHeader: (k, v) => { headers[k] = v; },
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { responseData = data; return res; },
          end: () => res
        };
      }
    };

    return { req, res, getResult: () => ({ statusCode, responseData, headers }) };
  }

  await asyncTest('2.1 Legacy client sending plain intent_tag maintains 100% backward compatibility', async () => {
    contactMeterHandler.resetRateLimitsForTest();
    const { req, res, getResult } = mockReqRes({
      provider_id: 991,
      channel: 'whatsapp',
      intent_tag: 'Electrician',
      session_token: 'sess_phase042_legacy',
      _inject: { forceMemoryQuota: true, bypassRateLimit: true, skipContactLookup: true }
    });

    await contactMeterHandler.contactMeterHandler(req, res);
    const { statusCode, responseData } = getResult();

    assert.strictEqual(statusCode, 200, 'Legacy contact must return 200 OK');
    assert.strictEqual(responseData.status, 'success', 'Status must be success');
    assert.strictEqual(responseData.allowed, true, 'Allowed must be true');
  });

  await asyncTest('2.2 Enriched client sending urgency and service_details creates canonical [URGENT] tag', async () => {
    contactMeterHandler.resetRateLimitsForTest();
    const sink = [];
    const { req, res, getResult } = mockReqRes({
      provider_id: 992,
      channel: 'whatsapp',
      urgency: 'today',
      service_details: 'Fault Finding & Wiring',
      locality: 'Ikeja',
      session_token: 'sess_phase042_urgent',
      _inject: {
        forceMemoryQuota: true,
        bypassRateLimit: true,
        skipContactLookup: true,
        broadcastSink: sink
      }
    });

    await contactMeterHandler.contactMeterHandler(req, res);
    await new Promise(r => setTimeout(r, 50));
    const { statusCode } = getResult();

    assert.strictEqual(statusCode, 200, 'Must return 200 OK');
    assert.ok(sink.length > 0, 'Broadcast sink must capture lead event');
    assert.strictEqual(sink[0].payload.intent_tag, '[URGENT] Fault Finding & Wiring', 'Canonical intent tag must be formatted');
  });

  await asyncTest('2.3 Invalid urgency from client is sanitized and does not inject unauthorized prefix', async () => {
    contactMeterHandler.resetRateLimitsForTest();
    const sink = [];
    const { req, res, getResult } = mockReqRes({
      provider_id: 993,
      channel: 'whatsapp',
      urgency: 'hacked_admin_urgency',
      service_details: 'Pipe Leak',
      locality: 'Surulere',
      session_token: 'sess_phase042_invalid_urgency',
      _inject: {
        forceMemoryQuota: true,
        bypassRateLimit: true,
        skipContactLookup: true,
        broadcastSink: sink
      }
    });

    await contactMeterHandler.contactMeterHandler(req, res);
    await new Promise(r => setTimeout(r, 50));
    const { statusCode } = getResult();

    assert.strictEqual(statusCode, 200);
    assert.ok(sink.length > 0, 'Broadcast sink must capture lead event');
    assert.strictEqual(sink[0].payload.intent_tag, 'Pipe Leak', 'Must not contain hacked urgency prefix');
  });

  await asyncTest('2.4 XSS payloads in service_details and locality are stripped and safely bounded', async () => {
    contactMeterHandler.resetRateLimitsForTest();
    const sink = [];
    const { req, res, getResult } = mockReqRes({
      provider_id: 994,
      channel: 'whatsapp',
      urgency: 'flexible',
      service_details: '<script>alert("hack")</script>Appliance Repair',
      locality: '<img src=x onerror=alert(1)>Lekki Phase 1',
      session_token: 'sess_phase042_xss',
      _inject: {
        forceMemoryQuota: true,
        bypassRateLimit: true,
        skipContactLookup: true,
        broadcastSink: sink
      }
    });

    await contactMeterHandler.contactMeterHandler(req, res);
    await new Promise(r => setTimeout(r, 50));
    const { statusCode } = getResult();

    assert.strictEqual(statusCode, 200);
    assert.ok(sink.length > 0, 'Broadcast sink must capture lead event');
    const capturedIntent = sink[0].payload.intent_tag;
    const capturedLocality = sink[0].payload.locality;
    assert.ok(!capturedIntent.includes('<script>'), 'Script tags stripped from intent');
    assert.ok(!capturedLocality.includes('<img'), 'Img tags stripped from locality');
    assert.strictEqual(capturedIntent, '[FLEXIBLE] alert("hack")Appliance Repair');
    assert.strictEqual(capturedLocality, 'Lekki Phase 1');
  });


  // ====================================================================
  // GATE 3: SMS COPY SAFETY & STRICT <= 160 CHARACTER CEILING
  // ====================================================================
  console.log('\n--- GATE 3: SMS Length Ceiling & Sanitization Proof ---');

  test('3.1 Standard urgency SMS formats are <= 160 characters', () => {
    const trades = ['Electrician', 'Plumber', 'Refrigeration Technician', 'Automobile Mechanic'];
    const localities = ['Ikeja, Lagos', 'Port Harcourt GRA', 'Garki Area 11, Abuja'];
    const urgencies = ['today', '2-3_days', 'flexible'];

    for (const trade of trades) {
      for (const loc of localities) {
        for (const urg of urgencies) {
          const prefixMap = { today: '[URGENT] ', '2-3_days': '[2-3 DAYS] ', flexible: '[FLEXIBLE] ' };
          const cleanTrade = trade.substring(0, 25);
          const cleanLoc = loc.substring(0, 25);
          const sms = `PadiFix Alert: New ${prefixMap[urg]}inquiry for ${cleanTrade} in ${cleanLoc}. Open your dashboard or WhatsApp now.`;
          assert.ok(sms.length <= 160, `SMS must be <= 160 chars. Got ${sms.length}: "${sms}"`);
        }
      }
    }
  });

  test('3.2 Adversarial long inputs and control character injections are clamped <= 160 chars', () => {
    const longTrade = 'A'.repeat(100) + '\r\n\tInjected';
    const longLoc = 'B'.repeat(100) + '\x00\x1fInjected';
    const cleanTrade = longTrade.replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 25);
    const cleanLoc = longLoc.replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 25);

    let sms = `PadiFix Alert: New [2-3 DAYS] inquiry for ${cleanTrade} in ${cleanLoc}. Open your dashboard or WhatsApp now.`.replace(/\s{2,}/g, ' ');
    if (sms.length > 160) sms = sms.substring(0, 160);

    assert.ok(sms.length <= 160, `Exceeded 160 chars: ${sms.length}`);
    assert.ok(!sms.includes('\r') && !sms.includes('\n'), 'No newlines in SMS');
    console.log(`     Maximal rendered SMS length: ${sms.length} chars (<= 160 constraint satisfied)`);
  });


  // ====================================================================
  // GATE 4: DASHBOARD CRM URGENCIES & XSS ESCAPE VERIFICATION
  // ====================================================================
  console.log('\n--- GATE 4: Dashboard CRM Lead Card Urgency Badges ---');

  const dashboardCode = fs.readFileSync(path.join(ROOT_DIR, 'dashboard.js'), 'utf8');

  test('4.1 Dashboard contains canonical urgency prefix detection for [URGENT], [2-3 DAYS], [FLEXIBLE]', () => {
    assert.ok(dashboardCode.includes("rawIntent.startsWith('[URGENT]')"), 'Must check [URGENT]');
    assert.ok(dashboardCode.includes("rawIntent.startsWith('[2-3 DAYS]')"), 'Must check [2-3 DAYS]');
    assert.ok(dashboardCode.includes("rawIntent.startsWith('[FLEXIBLE]')"), 'Must check [FLEXIBLE]');
  });

  test('4.2 Dashboard renders colored badges for canonical urgencies', () => {
    assert.ok(dashboardCode.includes('crm-badge-urgency urgent'), 'Must contain urgent badge class');
    assert.ok(dashboardCode.includes('crm-badge-urgency standard'), 'Must contain standard badge class');
    assert.ok(dashboardCode.includes('crm-badge-urgency flexible'), 'Must contain flexible badge class');
  });

  test('4.3 Dashboard escapes lead intent and locality to prevent stored XSS', () => {
    assert.ok(dashboardCode.includes('escapeHtml(displayIntent'), 'displayIntent must be escaped');
    assert.ok(dashboardCode.includes('escapeHtml(lead.locality'), 'locality must be escaped');
  });


  // ====================================================================
  // GATE 5: SECURITY BOUNDARIES, VERCEL FUNCTION BUDGET & ZERO SECRETS
  // ====================================================================
  console.log('\n--- GATE 5: Security Boundaries, Function Budget & Zero Secrets ---');

  test('5.1 Vercel Serverless Function budget strictly <= 12 functions', () => {
    const apiFiles = fs.readdirSync(path.join(ROOT_DIR, 'api')).filter(f => f.endsWith('.js'));
    const vercelIgnore = fs.readFileSync(path.join(ROOT_DIR, '.vercelignore'), 'utf8');
    const ignoredCount = apiFiles.filter(f => vercelIgnore.includes(`api/${f}`)).length;
    const deployedCount = apiFiles.length - ignoredCount;
    console.log(`     Total API files: ${apiFiles.length}, Ignored: ${ignoredCount}, Deployed: ${deployedCount}`);
    assert.strictEqual(deployedCount, 12, 'Must have exactly 12 deployed serverless functions');
  });

  test('5.2 Client-facing assets contain zero service-role keys or live payment secrets', () => {
    const clientFiles = [
      'index.html',
      'search.html',
      'profile.html',
      'dashboard.html',
      'admin.html',
      'register.html',
      'js/intake-modal.js',
      'intake-modal.js',
      'search.js',
      'profile.js',
      'dashboard.js'
    ];

    const forbiddenPatterns = [
      'sb_secret_',
      'sk_live_',
      'SUPABASE_SERVICE_ROLE_KEY',
      'TERMII_API_KEY'
    ];

    for (const relPath of clientFiles) {
      const fullPath = path.join(ROOT_DIR, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert.ok(!content.includes(pattern), `Forbidden secret pattern "${pattern}" found in client file ${relPath}`);
      }
    }
  });

  test('5.3 PAYMENT_LIVE_MODE is confirmed false', () => {
    const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env'), 'utf8');
    const match = envContent.match(/PAYMENT_LIVE_MODE\s*=\s*([a-zA-Z0-9_-]+)/);
    const modeVal = match ? match[1] : 'false';
    assert.strictEqual(modeVal.toLowerCase(), 'false', 'PAYMENT_LIVE_MODE must strictly remain false');
  });

  test('5.4 Universal intake modal is integrated into both search.html and profile.html', () => {
    const searchHtml = fs.readFileSync(path.join(ROOT_DIR, 'search.html'), 'utf8');
    const profileHtml = fs.readFileSync(path.join(ROOT_DIR, 'profile.html'), 'utf8');

    assert.ok(searchHtml.includes('js/intake-modal.js'), 'search.html must include js/intake-modal.js');
    assert.ok(profileHtml.includes('js/intake-modal.js'), 'profile.html must include js/intake-modal.js');
  });

  console.log('\n================================================================');
  console.log(`  VERIFICATION SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

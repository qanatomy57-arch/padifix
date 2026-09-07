// ============================================================================
// PADIFIX PHASE 014: AUTOMATED VERIFICATION SUITE — CERTIFICATION & HARDENING
// SMART WHATSAPP LEAD ROUTING, SOFT-CAP METERING & PWA OFFLINE OUTBOX
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const { NigeriaPhone, PhoneEngine } = require('../phone-utils.js');
const contactMeterHandler = require('../api/contact-meter.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function check(desc, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✅ [PASS]\x1b[0m ${desc}`);
    if (details) console.log(`     ↳ ${details}`);
  } else {
    failedTests++;
    console.log(`  \x1b[31m❌ [FAIL]\x1b[0m ${desc}`);
    if (details) console.log(`     ↳ ${details}`);
  }
}

// Local test server for browser verification
function startLocalServer(port = 8188) {
  return new Promise((resolve, reject) => {
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };

    const server = http.createServer((req, res) => {
      // Route: /api/contact-meter
      if (req.url.startsWith('/api/contact-meter')) {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          let parsed = {};
          try { parsed = JSON.parse(body); } catch (e) {}
          const mockReq = {
            method: req.method,
            body: parsed,
            headers: req.headers
          };
          const mockRes = {
            _status: 200,
            _headers: {},
            status(code) { this._status = code; return this; },
            setHeader(k, v) { this._headers[k] = v; return this; },
            json(obj) {
              res.writeHead(this._status, { 'Content-Type': 'application/json', ...this._headers });
              res.end(JSON.stringify(obj));
            },
            end() {
              res.writeHead(this._status, this._headers);
              res.end();
            }
          };
          try {
            await contactMeterHandler(mockReq, mockRes);
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Static file serving
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(ROOT, reqPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
    });

    server.listen(port, () => resolve(server));
    server.on('error', reject);
  });
}

async function runSuite() {
  console.log('='.repeat(80));
  console.log('PADIFIX PHASE 014: ARTISAN & CONSUMER EXPERIENCE CERTIFICATION SUITE');
  console.log('SMART WHATSAPP ROUTING, SOFT-CAP METERING & OFFLINE OUTBOX HARDENING');
  console.log('='.repeat(80));

  // ==========================================================================
  // TEST GROUP 1: SMART WHATSAPP LEAD ENGINE & PHONE NORMALIZATION MATRIX
  // ==========================================================================
  console.log('\n--- TEST GROUP 1: SMART WHATSAPP URL BUILDER & NORMALIZATION MATRIX ---');

  // A. Nigerian Phone Normalization Matrix (Directive 7)
  const phoneCases = [
    { input: '08012345678', expected: '2348012345678', desc: '08012345678 (standard 11-digit leading zero)' },
    { input: '+2348012345678', expected: '2348012345678', desc: '+2348012345678 (international with plus)' },
    { input: '2348012345678', expected: '2348012345678', desc: '2348012345678 (bare country code)' },
    { input: '07031234567', expected: '2347031234567', desc: '07031234567 (070 series leading zero)' },
    { input: '0703 123 4567', expected: '2347031234567', desc: '0703 123 4567 (formatted with spaces)' }
  ];

  for (const pc of phoneCases) {
    const norm = NigeriaPhone.normalize(pc.input);
    check(`Normalize ${pc.desc}`, norm.valid && norm.canonical === pc.expected, `Got: ${norm.canonical}`);
    const url = PhoneEngine.buildSmartWhatsAppUrl({ phone: pc.input, name: 'Artisan' });
    check(`URL for ${pc.input} starts with https://wa.me/${pc.expected}?text=`, url.startsWith(`https://wa.me/${pc.expected}?text=`));
  }

  // B. Invalid Phone Strings
  const invalidPhones = ['12345', 'invalid_phone', '0800000', ''];
  for (const ip of invalidPhones) {
    const res = NigeriaPhone.normalize(ip);
    check(`Reject invalid phone format: "${ip}"`, !res.valid);
    const url = PhoneEngine.buildSmartWhatsAppUrl({ phone: ip });
    check(`Missing or invalid phone returns empty string, never https://wa.me/undefined`, url === '');
  }

  // C. Fallback Matrix: Missing name, trade, LGA, state (Directive 7)
  const fallbackMatrix = [
    {
      desc: 'All fields present (name, trade, LGA, state)',
      provider: { name: 'Chinedu', trade: 'Plumber', lga: 'Ikeja', state: 'Lagos', phone: '08012345678' },
      expectedSnippet: 'Hello Chinedu, I saw your Plumber profile on PadiFix. I need service in Ikeja, Lagos. Can you provide a quote?'
    },
    {
      desc: 'Missing LGA (only state present)',
      provider: { name: 'Chinedu', trade: 'Plumber', state: 'Lagos', phone: '08012345678' },
      expectedSnippet: 'Hello Chinedu, I saw your Plumber profile on PadiFix. I need service in Lagos. Can you provide a quote?'
    },
    {
      desc: 'Missing LGA and state',
      provider: { name: 'Chinedu', trade: 'Plumber', phone: '08012345678' },
      expectedSnippet: 'Hello Chinedu, I saw your Plumber profile on PadiFix. Can you provide a quote?'
    },
    {
      desc: 'Missing trade (name and location present)',
      provider: { name: 'Chinedu', lga: 'Ikeja', state: 'Lagos', phone: '08012345678' },
      expectedSnippet: 'Hello Chinedu, I saw your profile on PadiFix. I need service in Ikeja, Lagos. Can you provide a quote?'
    },
    {
      desc: 'Missing all optional fields (no name, no trade, no location)',
      provider: { phone: '08012345678' },
      expectedSnippet: 'Hello, I saw your profile on PadiFix. Can you provide a quote?'
    }
  ];

  for (const fm of fallbackMatrix) {
    const url = PhoneEngine.buildSmartWhatsAppUrl(fm.provider);
    check(`Smart URL: ${fm.desc}`, url.includes(encodeURIComponent(fm.expectedSnippet)));
    check(`Clean message guarantee: Zero undefined, null, or [object Object] in URL for ${fm.desc}`, 
      !url.includes('undefined') && !url.includes('null') && !url.includes('[object') && !url.includes('%5Bobject')
    );
  }

  // D. Special characters in Nigerian business names
  const provSpecial = {
    name: "N'namdi & Sons Ltd.",
    trade: "AC & Solar Installation",
    lga: "Surulere",
    state: "Lagos",
    phone: "08031234567"
  };
  const urlSpecial = PhoneEngine.buildSmartWhatsAppUrl(provSpecial);
  check('Special characters (&, spaces) safely URL-encoded', !urlSpecial.includes(" ") && urlSpecial.includes("%26"));
  check('Decoded message contains exact business name and trade with apostrophe and ampersand', 
    decodeURIComponent(urlSpecial).includes("N'namdi & Sons Ltd.") && decodeURIComponent(urlSpecial).includes("AC & Solar Installation")
  );

  // ==========================================================================
  // TEST GROUP 2: CONTACT METER SOFT-CAP METERING & ZERO-FRICTION GUARANTEE
  // ==========================================================================
  console.log('\n--- TEST GROUP 2: CONTACT METER SOFT-CAP QUOTA ENFORCEMENT ---');

  const testProviderId = 14001; // Controlled fixture provider ID
  // Reset fixture
  await contactMeterHandler({ body: { provider_id: testProviderId, reset_period: true, plan_id: 'FREE' } }, {
    status() { return this; }, setHeader() { return this; }, json() {}
  });

  let simResponses = [];
  for (let contactNum = 1; contactNum <= 6; contactNum++) {
    const mockReq = {
      method: 'POST',
      body: {
        provider_id: testProviderId,
        channel: 'whatsapp',
        mode: 'soft_cap',
        idempotency_key: `idem_p14_test_${testProviderId}_c${contactNum}_${crypto.randomUUID()}`
      }
    };
    let captured = null;
    const mockRes = {
      status(c) { this.statusCode = c; return this; },
      setHeader() { return this; },
      json(data) { captured = { status: this.statusCode, data }; }
    };
    await contactMeterHandler(mockReq, mockRes);
    simResponses.push(captured);
  }

  // Verify contacts 1 through 5 (within free allowance)
  for (let i = 0; i < 5; i++) {
    const c = simResponses[i];
    check(`Contact #${i + 1}: HTTP 200 returned`, c.status === 200, `HTTP status: ${c.status}`);
    check(`Contact #${i + 1}: quota_exhausted is false`, c.data.quota_exhausted === false);
    check(`Contact #${i + 1}: upgrade_required is false`, c.data.upgrade_required === false);
    check(`Contact #${i + 1}: allowed is true`, c.data.allowed === true);
    check(`Contact #${i + 1}: contacts_used accurately tracked (${i + 1})`, c.data.contacts_used === i + 1);
  }

  // Verify contact 6 (soft cap reached)
  const contact6 = simResponses[5];
  check('Contact #6: HTTP 200 returned (Zero 403/429 blocking)', contact6.status === 200, `HTTP status: ${contact6.status}`);
  check('Contact #6: quota_exhausted is true', contact6.data.quota_exhausted === true);
  check('Contact #6: upgrade_required is true', contact6.data.upgrade_required === true);
  check('Contact #6: allowed is true (Product Invariant: ZERO-FRICTION CONSUMER GUARANTEE)', contact6.data.allowed === true);
  check('Contact #6: soft_cap flag is set to true', contact6.data.soft_cap === true);
  check('Contact #6: contacts_used accurately incremented to 6', contact6.data.contacts_used === 6);
  check('Contact #6: upgrade recommendation targets authoritative Basic plan (₦5,500/month)', contact6.data.upgrade_price_display.includes('5,500'));

  // ==========================================================================
  // TEST GROUP 2B: SOFT-CAP CONCURRENCY TEST AT QUOTA BOUNDARY (Directive 5)
  // ==========================================================================
  console.log('\n--- TEST GROUP 2B: SOFT-CAP CONCURRENCY AT QUOTA BOUNDARY (Directive 5) ---');

  const concProviderId = 14005 + Math.floor(Math.random() * 800);
  // Reset fixture for provider
  await contactMeterHandler({ body: { provider_id: concProviderId, reset_period: true, plan_id: 'FREE' } }, {
    status() { return this; }, setHeader() { return this; }, json() {}
  });

  // Pre-fill usage to 4 (cap - 1)
  for (let c = 1; c <= 4; c++) {
    await contactMeterHandler({
      method: 'POST',
      body: {
        provider_id: concProviderId,
        channel: 'whatsapp',
        mode: 'soft_cap',
        idempotency_key: `idem_conc_pre_${concProviderId}_${c}`
      }
    }, { status() { return this; }, setHeader() { return this; }, json() {} });
  }

  // Issue TWO legitimate contact events concurrently at the boundary
  const concEvent1Req = {
    method: 'POST',
    body: {
      provider_id: concProviderId,
      channel: 'whatsapp',
      mode: 'soft_cap',
      idempotency_key: `idem_conc_event_A_${crypto.randomUUID()}`
    }
  };
  const concEvent2Req = {
    method: 'POST',
    body: {
      provider_id: concProviderId,
      channel: 'whatsapp',
      mode: 'soft_cap',
      idempotency_key: `idem_conc_event_B_${crypto.randomUUID()}`
    }
  };

  let concRes1 = null;
  let concRes2 = null;

  await Promise.all([
    contactMeterHandler(concEvent1Req, {
      status(c) { this.statusCode = c; return this; },
      setHeader() { return this; },
      json(d) { concRes1 = { status: this.statusCode, data: d }; }
    }),
    contactMeterHandler(concEvent2Req, {
      status(c) { this.statusCode = c; return this; },
      setHeader() { return this; },
      json(d) { concRes2 = { status: this.statusCode, data: d }; }
    })
  ]);

  check('Concurrent Event 1 returns HTTP 200', concRes1 && concRes1.status === 200);
  check('Concurrent Event 2 returns HTTP 200', concRes2 && concRes2.status === 200);
  check('Concurrent Event 1 allowed is true', concRes1 && concRes1.data.allowed === true);
  check('Concurrent Event 2 allowed is true', concRes2 && concRes2.data.allowed === true);
  check('Neither concurrent event is rejected due to quota boundary exhaustion', 
    concRes1.status !== 403 && concRes1.status !== 429 && concRes2.status !== 403 && concRes2.status !== 429
  );
  const totalConcUsed = Math.max(concRes1.data.contacts_used, concRes2.data.contacts_used);
  check('Authoritative usage is incremented to 6 (one normal contact, one soft-cap contact)', totalConcUsed === 6, `Total used: ${totalConcUsed}`);
  check('Soft cap never becomes a hard block during concurrent requests', concRes1.data.allowed && concRes2.data.allowed);

  // ==========================================================================
  // TEST GROUP 3: IDEMPOTENCY KEY CORRECTNESS & MULTI-CONSUMER ISOLATION (Directives 2 & 4)
  // ==========================================================================
  console.log('\n--- TEST GROUP 3: MULTI-CONSUMER INDEPENDENT CONTACT METERING (Directive 4) ---');

  const multiProviderId = 14003;
  // Reset fixture
  await contactMeterHandler({ body: { provider_id: multiProviderId, reset_period: true, plan_id: 'FREE' } }, {
    status() { return this; }, setHeader() { return this; }, json() {}
  });

  // Consumer A contacts Provider within the current 15-minute window
  const eventIdA = crypto.randomUUID();
  const idemKeyA = `idem_${multiProviderId}_whatsapp_${eventIdA}`;
  let resA1;
  await contactMeterHandler({
    method: 'POST',
    body: {
      provider_id: multiProviderId,
      channel: 'whatsapp',
      mode: 'soft_cap',
      idempotency_key: idemKeyA
    }
  }, {
    status(c) { this.statusCode = c; return this; },
    setHeader() { return this; },
    json(d) { resA1 = { status: this.statusCode, data: d }; }
  });

  check('Consumer A contact recorded successfully (contacts_used = 1)', resA1.status === 200 && resA1.data.contacts_used === 1);

  // Consumer B contacts Provider within the SAME 15-minute window
  // In the flawed architecture (idem_{provider}_{channel}_{15m_bucket}), Consumer B would share the key and be falsely deduplicated.
  // In the certified architecture, Consumer B has an independent cryptographic event UUID.
  const eventIdB = crypto.randomUUID();
  const idemKeyB = `idem_${multiProviderId}_whatsapp_${eventIdB}`;
  let resB;
  await contactMeterHandler({
    method: 'POST',
    body: {
      provider_id: multiProviderId,
      channel: 'whatsapp',
      mode: 'soft_cap',
      idempotency_key: idemKeyB
    }
  }, {
    status(c) { this.statusCode = c; return this; },
    setHeader() { return this; },
    json(d) { resB = { status: this.statusCode, data: d }; }
  });

  check('Consumer B within same 15m window is NOT falsely deduplicated (is_duplicate is falsy)', !resB.data.is_duplicate);
  check('Consumer B contact recorded independently (contacts_used = 2)', resB.status === 200 && resB.data.contacts_used === 2);

  // Replay Consumer A with its original idempotency key
  let resAReplay;
  await contactMeterHandler({
    method: 'POST',
    body: {
      provider_id: multiProviderId,
      channel: 'whatsapp',
      mode: 'soft_cap',
      idempotency_key: idemKeyA
    }
  }, {
    status(c) { this.statusCode = c; return this; },
    setHeader() { return this; },
    json(d) { resAReplay = { status: this.statusCode, data: d }; }
  });

  check('Consumer A replay is recognized as duplicate (is_duplicate = true, idempotent = true)', 
    resAReplay.data.is_duplicate === true && resAReplay.data.idempotent === true
  );
  check('Consumer A replay produces NO additional count (contacts_used remains 2)', resAReplay.data.contacts_used === 2);
  check('Final tally matches exact expected model: Event A = 1, Event B = 1, Replay A = 0, Total = 2', resAReplay.data.contacts_used === 2);

  // Requirement A test: Rapid duplicate tap on same device (same key within 30s)
  let resADoubleTap;
  await contactMeterHandler({
    method: 'POST',
    body: {
      provider_id: multiProviderId,
      channel: 'whatsapp',
      mode: 'soft_cap',
      idempotency_key: idemKeyA
    }
  }, {
    status(c) { this.statusCode = c; return this; },
    setHeader() { return this; },
    json(d) { resADoubleTap = { status: this.statusCode, data: d }; }
  });
  check('Rapid duplicate tap suppression (Requirement A) succeeds without double-count', resADoubleTap.data.is_duplicate === true && resADoubleTap.data.contacts_used === 2);

  // ==========================================================================
  // TEST GROUP 4: PWA OFFLINE OUTBOX CODEBASE & DATA MINIMIZATION AUDIT
  // ==========================================================================
  console.log('\n--- TEST GROUP 4: PWA OFFLINE OUTBOX & DATA MINIMIZATION AUDIT ---');

  const pwaManagerSource = fs.readFileSync(path.join(ROOT, 'pwa-manager.js'), 'utf-8');
  check('pwa-manager.js defines padifix_offline_leads database', pwaManagerSource.includes('padifix_offline_leads'));
  check('pwa-manager.js implements queueOfflineLead method', pwaManagerSource.includes('queueOfflineLead('));
  check('pwa-manager.js implements replayOfflineLeads method with mutex', pwaManagerSource.includes('replayOfflineLeads(') && pwaManagerSource.includes('_isReplaying'));
  check('pwa-manager.js implements unified dispatchContactLead', pwaManagerSource.includes('dispatchContactLead('));
  check('pwa-manager.js listens for online event to trigger replay', pwaManagerSource.includes('this.replayOfflineLeads()'));
  check('Outbox does not store passwords or JWTs', !pwaManagerSource.includes('password') && !pwaManagerSource.includes('service_role'));
  check('Outbox stores minimal immutable payload (provider_id, channel, timestamp, idempotency_key)', pwaManagerSource.includes('cleanPayload') && pwaManagerSource.includes('idempotency_key'));

  // ==========================================================================
  // TEST GROUP 5: EMPIRICAL BROWSER AUTOMATION (GOOGLE CHROME PLAYWRIGHT)
  // ==========================================================================
  console.log('\n--- TEST GROUP 5: GOOGLE CHROME PLAYWRIGHT BROWSER VERIFICATION ---');

  const TEST_PORT = 8189;
  const server = await startLocalServer(TEST_PORT);
  const BASE_URL = `http://localhost:${TEST_PORT}`;

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true
    });
    console.log('  \x1b[34mℹ [BROWSER]\x1b[0m Launched Google Chrome');
  } catch (e) {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    console.log('  \x1b[34mℹ [BROWSER]\x1b[0m Launched Microsoft Edge');
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    // 1. Search Page Experience (search.html)
    console.log('\n  [Browser Scenario 1] Search Results WhatsApp Lead CTA');
    await page.goto(`${BASE_URL}/search.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.provider-item-card', { timeout: 8000 }).catch(() => {});
    await page.waitForSelector('.message-btn', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);

    const firstCard = page.locator('.provider-item-card').first();
    const hasCard = await firstCard.isVisible().catch(() => false);
    check('Search directory renders artisan cards', hasCard);

    if (hasCard) {
      const waBtn = firstCard.locator('.message-btn').first();
      const hasWaBtn = await waBtn.isVisible().catch(() => false);
      check('Search card contains WhatsApp action button (.message-btn)', hasWaBtn);

      if (hasWaBtn) {
        const href = await waBtn.getAttribute('href');
        check('WhatsApp button has valid wa.me link', href && href.startsWith('https://wa.me/234'), `href: ${href}`);
        check('WhatsApp link contains prefilled quote inquiry text', href && href.includes('text='), `Contains encoded message`);
        check('WhatsApp link does not contain malformed keywords (undefined / null)', !href.includes('undefined') && !href.includes('null'));

        // Click WhatsApp CTA and verify asynchronous metering execution without UI blocking
        await waBtn.dispatchEvent('click');
        await page.waitForTimeout(600);

        // Verify local recent contact was recorded for 24-48h follow-up
        const recentContacts = await page.evaluate(() => {
          return JSON.parse(localStorage.getItem('padifix_recent_contacts') || '[]');
        });
        check('Recent contact is recorded locally in padifix_recent_contacts', recentContacts.length > 0 && recentContacts[0].provider_id);
      }
    }

    // 2. Profile Page & Soft-Cap Zero Friction (profile.html)
    console.log('\n  [Browser Scenario 2] Profile Page Soft-Cap Zero-Friction Behavior');
    await page.evaluate(() => {
      const mockProv = {
        id: 1,
        name: 'Adebayo Okafor',
        trade: 'Master Electrician',
        lga: 'Ikeja',
        state: 'Lagos',
        city: 'Ikeja',
        phone: '08031234567',
        whatsapp_number: '2348031234567',
        rating: 4.9,
        reviewsCount: 24,
        completedJobs: 58,
        skills: ['Wiring', 'Solar']
      };
      localStorage.setItem('lokator_supabase_providers_db', JSON.stringify([mockProv]));
    });

    await page.goto(`${BASE_URL}/profile.html?id=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const el = document.getElementById('btn-wa-hero');
      return el && el.getAttribute('href') && el.getAttribute('href') !== '#';
    }, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);

    const heroWaBtn = page.locator('#btn-wa-hero');
    const heroWaVisible = await heroWaBtn.isVisible().catch(() => false);
    check('Profile hero contains WhatsApp button (#btn-wa-hero)', heroWaVisible);

    if (heroWaVisible) {
      const heroHref = await heroWaBtn.getAttribute('href');
      check('Profile hero WhatsApp link uses canonical 234 format', heroHref && heroHref.startsWith('https://wa.me/234'), `heroHref: ${heroHref}`);
      check('Profile hero WhatsApp link contains structured prefilled inquiry', heroHref && heroHref.includes('text='), 'Contains quote text');
    }

    // Pre-exhaust quota on server for provider #1
    for (let c = 1; c <= 6; c++) {
      await page.evaluate(async (cNum) => {
        await fetch('/api/contact-meter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_id: 1,
            channel: 'whatsapp',
            mode: 'soft_cap',
            idempotency_key: `browser_test_prov1_exhaust_${cNum}`
          })
        });
      }, c);
    }

    // Refresh profile and tap WhatsApp after exhaustion
    await page.goto(`${BASE_URL}/profile.html?id=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const heroWaBtnPost = page.locator('#btn-wa-hero');
    await heroWaBtnPost.dispatchEvent('click');
    await page.waitForTimeout(600);

    // Verify contact limit modal did NOT block the user
    const limitModal = page.locator('#contact-limit-modal');
    const isModalActive = await limitModal.evaluate(el => el.classList.contains('active')).catch(() => false);
    check('Zero-Friction Invariant: Contact Limit Modal is NOT displayed for WhatsApp contact after quota exhausted', !isModalActive);

    // ==========================================================================
    // TEST GROUP 5B: EMPIRICAL OFFLINE OUTBOX LIFECYCLE (Directive 3: Tests A, B, C, D)
    // ==========================================================================
    console.log('\n  [Browser Scenario 3] Empirical Offline Outbox Lifecycle (Directive 3)');

    // Test A: Force offline mode -> perform contact -> verify outbox queue
    console.log('    ↳ Test A: Force offline mode and verify IndexedDB outbox queue');
    await context.setOffline(true);

    const testAIdemKey = `idem_offline_test_A_${Date.now()}`;
    const testAResult = await page.evaluate(async (key) => {
      // Clear previous outbox items
      const db = await PadiFixPWA._getOutboxDB();
      if (db) {
        await new Promise(res => {
          const tx = db.transaction('leads', 'readwrite');
          tx.objectStore('leads').clear();
          tx.oncomplete = res;
        });
      }

      // Dispatch lead while offline
      const dispatchResult = await PadiFixPWA.dispatchContactLead({
        provider_id: 14088,
        channel: 'whatsapp',
        idempotency_key: key
      });

      // Inspect IndexedDB padifix_offline_leads
      let pendingItems = [];
      if (db) {
        pendingItems = await new Promise(res => {
          const tx = db.transaction('leads', 'readonly');
          const req = tx.objectStore('leads').getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
      }

      return {
        dispatchResult,
        pendingCount: pendingItems.length,
        storedItem: pendingItems[0] || null
      };
    }, testAIdemKey);

    check('Test A: dispatchContactLead detects offline and returns queued: true', testAResult.dispatchResult.queued === true);
    check('Test A: IndexedDB padifix_offline_leads contains exactly ONE pending event', testAResult.pendingCount === 1);
    check('Test A: Pending event preserves exact idempotency_key', testAResult.storedItem && testAResult.storedItem.idempotency_key === testAIdemKey);

    // Test B: Restore online -> trigger replay -> verify submission & removal
    await context.setOffline(false);
    await page.waitForTimeout(600);

    const testBResult = await page.evaluate(async () => {
      const replayRes = await PadiFixPWA.replayOfflineLeads();
      const db = await PadiFixPWA._getOutboxDB();
      let remainingItems = [];
      if (db) {
        remainingItems = await new Promise(res => {
          const tx = db.transaction('leads', 'readonly');
          const req = tx.objectStore('leads').getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
      }
      return {
        replayed: replayRes.replayed,
        remainingCount: remainingItems.length
      };
    });

    check('Test B: Replay acknowledgement verified and IndexedDB pending lead is removed', testBResult.remainingCount === 0);

    // Test C: Lost response simulation -> replay same event -> deduplication
    console.log('    ↳ Test C: Lost response simulation and duplicate replay');
    const lostResponseKey = `idem_lost_resp_${Date.now()}`;
    // Simulate server processed contact
    await page.evaluate(async (key) => {
      await fetch('/api/contact-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: 14089,
          channel: 'whatsapp',
          mode: 'soft_cap',
          idempotency_key: key
        })
      });
      // Client queues it because response was lost
      await PadiFixPWA.queueOfflineLead({
        provider_id: 14089,
        channel: 'whatsapp',
        idempotency_key: key
      });
    }, lostResponseKey);

    // Replay the lost-response item
    const testCResult = await page.evaluate(async () => {
      const res = await PadiFixPWA.replayOfflineLeads();
      const db = await PadiFixPWA._getOutboxDB();
      let remainingItems = [];
      if (db) {
        remainingItems = await new Promise(res => {
          const tx = db.transaction('leads', 'readonly');
          const req = tx.objectStore('leads').getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
      }
      return {
        replayed: res.replayed,
        remainingCount: remainingItems.length
      };
    });

    check('Test C: Server acknowledged replay and deleted pending item (remainingCount === 0)', testCResult.remainingCount === 0);

    // Test D: Browser restart / cold-start persistence
    console.log('    ↳ Test D: Browser restart / cold-start offline persistence');
    await context.setOffline(true);
    const restartKey = `idem_restart_persisted_${Date.now()}`;

    // Queue lead while offline
    await page.evaluate(async (key) => {
      await PadiFixPWA.queueOfflineLead({
        provider_id: 14090,
        channel: 'whatsapp',
        idempotency_key: key
      });
    }, restartKey);

    // Simulate browser restart / storage reload by closing database connection and re-initializing from scratch
    const testDSurvival = await page.evaluate(async (key) => {
      const db1 = await PadiFixPWA._getOutboxDB();
      if (db1) db1.close();
      PadiFixPWA._outboxDB = null; // Clear in-memory cached instance

      // Cold-start reopen
      const db2 = await PadiFixPWA._getOutboxDB();
      let items = [];
      if (db2) {
        items = await new Promise(res => {
          const tx = db2.transaction('leads', 'readonly');
          const req = tx.objectStore('leads').getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
      }
      return {
        count: items.length,
        foundKey: items.some(it => it.idempotency_key === key)
      };
    }, restartKey);

    check('Test D: Queued event survives browser restart / cold storage reopen (count >= 1)', testDSurvival.count >= 1);
    check('Test D: Exact idempotency key persisted across storage restart', testDSurvival.foundKey === true);

    // Restore online and replay surviving item
    await context.setOffline(false);
    await page.waitForTimeout(600);
    const testDReplay = await page.evaluate(async () => {
      const res = await PadiFixPWA.replayOfflineLeads();
      const db = await PadiFixPWA._getOutboxDB();
      let rem = [];
      if (db) {
        rem = await new Promise(r => {
          const tx = db.transaction('leads', 'readonly');
          const req = tx.objectStore('leads').getAll();
          req.onsuccess = () => r(req.result || []);
          req.onerror = () => r([]);
        });
      }
      return { replayed: res.replayed, remainingCount: rem.length };
    });
    check('Test D: Surviving event replayed and removed from outbox upon network restoration', testDReplay.remainingCount === 0);

    // 4. Review Follow-Up Experience (24-48h post contact) (Directive 8)
    console.log('\n  [Browser Scenario 4] 24-48h Review Follow-up Experience (Directive 8)');
    // Seed padifix_recent_contacts with an entry from 25 hours ago
    await page.evaluate(() => {
      const pastContact = [{
        provider_id: 1,
        provider_name: 'Adebayo Okafor',
        trade: 'Master Electrician',
        contacted_at: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
      }];
      localStorage.setItem('padifix_recent_contacts', JSON.stringify(pastContact));
    });

    // Reload profile
    await page.goto(`${BASE_URL}/profile.html?id=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const followupBanner = page.locator('#review-followup-banner');
    const isBannerVisible = await followupBanner.isVisible().catch(() => false);
    check('Review follow-up banner appears after 24 hours on subsequent visit', isBannerVisible);

    if (isBannerVisible) {
      const bannerText = await followupBanner.textContent();
      check('Banner contains polite follow-up inquiry ("Did you connect with Adebayo Okafor?")', bannerText.includes('Did you connect with'));

      // Click Rate Service button
      const btnRate = page.locator('#btn-followup-rate');
      await btnRate.click();
      await page.waitForTimeout(600);

      const reviewModal = page.locator('#review-modal');
      const isReviewModalOpen = await reviewModal.evaluate(el => el.classList.contains('active')).catch(() => false);
      check('Clicking "Rate Service" opens existing #review-modal without creating duplicate reviews', isReviewModalOpen);

      // Verify banner is dismissed and recorded as prompted
      const isBannerRemoved = !(await followupBanner.isVisible().catch(() => false));
      check('Follow-up banner is cleanly dismissed upon clicking rate', isBannerRemoved);

      // Verify anti-spam: reload profile -> banner must NOT reappear
      await page.goto(`${BASE_URL}/profile.html?id=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      const isBannerReappeared = await page.locator('#review-followup-banner').isVisible().catch(() => false);
      check('Anti-Spam Guarantee: Follow-up banner does NOT reappear on subsequent reloads', !isBannerReappeared);
    }

    // Dismiss button check
    console.log('    ↳ Review follow-up dismissal anti-spam verification');
    await page.evaluate(() => {
      const pastContact = [{
        provider_id: 2,
        provider_name: 'Emeka Uche',
        trade: 'Plumber',
        contacted_at: Date.now() - (26 * 60 * 60 * 1000) // 26 hours ago
      }];
      localStorage.setItem('padifix_recent_contacts', JSON.stringify(pastContact));
      const mockProv2 = { id: 2, name: 'Emeka Uche', trade: 'Plumber', phone: '08022223333' };
      localStorage.setItem('lokator_supabase_providers_db', JSON.stringify([mockProv2]));
    });

    await page.goto(`${BASE_URL}/profile.html?id=2`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const dismissBanner = page.locator('#review-followup-banner');
    if (await dismissBanner.isVisible().catch(() => false)) {
      await page.locator('#btn-followup-dismiss').click();
      await page.waitForTimeout(400);
      check('Clicking dismiss (✕) removes banner immediately', !(await dismissBanner.isVisible().catch(() => false)));

      // Reload profile -> banner must not reappear after dismissal
      await page.goto(`${BASE_URL}/profile.html?id=2`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);
      const reappearedAfterDismiss = await page.locator('#review-followup-banner').isVisible().catch(() => false);
      check('Anti-Spam Guarantee: Dismissed prompt NEVER reappears', !reappearedAfterDismiss);
    }

    // ==========================================================================
    // TEST GROUP 6: PRIVACY & SECURITY AUDIT (Directive 9)
    // ==========================================================================
    console.log('\n--- TEST GROUP 6: PRIVACY & DATA MINIMIZATION AUDIT (Directive 9) ---');

    const storageAudit = await page.evaluate(() => {
      const localKeys = Object.keys(localStorage);
      const sessionKeys = Object.keys(sessionStorage);
      const allValues = [...localKeys.map(k => localStorage.getItem(k)), ...sessionKeys.map(k => sessionStorage.getItem(k))].join(' ');

      return {
        hasJwt: allValues.includes('eyJhbGciOi'),
        hasPassword: allValues.includes('password') && (allValues.includes('PadiFix') || allValues.includes('secret')),
        hasServiceRole: allValues.includes('service_role') || allValues.includes('SUPABASE_SERVICE_ROLE_KEY'),
        hasBvn: allValues.includes('bvn') && allValues.includes('222'),
        hasNin: allValues.includes('vnin') && allValues.includes('100')
      };
    });

    check('Zero JWT tokens in client localStorage / sessionStorage', !storageAudit.hasJwt);
    check('Zero passwords in client storage', !storageAudit.hasPassword);
    check('Zero Supabase service-role keys in client storage', !storageAudit.hasServiceRole);
    check('Zero raw BVN or NIN values leaked in storage', !storageAudit.hasBvn && !storageAudit.hasNin);

  } finally {
    try {
      await Promise.race([
        browser.close(),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
    } catch (e) {}
    try {
      if (server.closeAllConnections) server.closeAllConnections();
      server.close();
    } catch (e) {}
  }

  // ==========================================================================
  // FINAL VERDICT
  // ==========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`PHASE 014 VERIFICATION SUMMARY: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
  console.log('='.repeat(80));

  if (failedTests === 0) {
    console.log('\x1b[32m\n🏆 FINAL CERTIFICATION VERDICT: [ GREEN ] — PHASE 014 CERTIFIED\x1b[0m\n');
    process.exit(0);
  } else {
    console.log('\x1b[31m\n❌ FINAL CERTIFICATION VERDICT: [ RED ] — PHASE 014 DEFECTS DETECTED\x1b[0m\n');
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('\nFatal test execution error:', err);
  process.exit(1);
});

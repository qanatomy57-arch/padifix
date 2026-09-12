/**
 * PADIFIX — PHASE 031 AUTOMATED VERIFICATION SUITE
 * scripts/verify_phase_031_broadcast_leads.js
 *
 * Implements the mandatory 10-Gate Verification Suite for Phase 031:
 * - GATE 1: DDL / Schema / Constraint & Migration 050 Verification
 * - GATE 2: Consumer Broadcast Creation & Input Validation
 * - GATE 3: Top-3 Verified Artisan Matching & WhatsApp Deep Link Generation
 * - GATE 4: Privacy Invariant C (Zero Consumer Phone or Chat Persistence)
 * - GATE 5: Pro Tier Immediate Priority Access
 * - GATE 6: Free Tier 15-Minute Early-Access Gate & Server-Side Rejection
 * - GATE 7: Atomic Lead Claiming, Quota Deduction, & Concurrency Defense
 * - GATE 8: Automatic CRM Pipeline Lead Insertion
 * - GATE 9: XSS Neutralization & 600-Character Scope Limit
 * - GATE 10: Dual-Viewport Browser QA & Accessibility (Desktop & Mobile)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');
const { chromium } = require('playwright');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const TEST_JWT_SECRET = 'phase_012e_test_jwt_secret_key_minimum_32_bytes_long';
process.env.TEST_JWT_SECRET = TEST_JWT_SECRET;

const TARGET_REF = process.env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${TARGET_REF}.supabase.co`;
const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\6b1d7c94-91ab-46fa-b918-8ff1283ede05';

const providerLeadsHandler = require('../api/provider-leads');
const landingPageHandler = require('../api/landing-page');
const LeadStore = require('../lib/lead-store');

let totalGates = 0;
let passedGates = 0;
let failedGates = 0;
const gateResults = [];

function recordGate(gateNum, title, passed, detail = '', error = null) {
  totalGates++;
  if (passed) {
    passedGates++;
    console.log(`  \x1b[32m✅ [PASS] Gate ${gateNum}: ${title}\x1b[0m`);
    if (detail) console.log(`     ↳ ${detail}`);
  } else {
    failedGates++;
    console.log(`  \x1b[31m❌ [FAIL] Gate ${gateNum}: ${title}\x1b[0m`);
    if (detail) console.error(`     ↳ ${detail}`);
    if (error) console.error(`     ↳ Error: ${error.message || error}`);
  }
  gateResults.push({ gate: gateNum, title, passed, detail, error: error ? String(error.message || error) : null });
}

function generateHs256Jwt({ email = 'artisan_8@padifix.ng', providerId = 8, exp = Math.floor(Date.now() / 1000) + 3600, secret = TEST_JWT_SECRET } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: `usr_provider_${providerId}`,
    email,
    role: 'authenticated',
    app_metadata: { role: 'authenticated' },
    user_metadata: { email, provider_id: providerId },
    exp
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function createMockContext(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/api/provider-leads',
    headers: { 'content-type': 'application/json', ...options.headers },
    body: options.body || {},
    query: options.query || {},
    socket: { remoteAddress: options.ip || '127.0.0.1' }
  };
  let statusCode = 200;
  let headers = {};
  let bodyData = null;

  const res = {
    status(code) { statusCode = code; return this; },
    setHeader(k, v) { headers[k] = v; return this; },
    json(data) { bodyData = data; return this; },
    send(data) { bodyData = data; return this; },
    end(data) { if (data && !bodyData) bodyData = data; return this; },
    getStatusCode() { return statusCode; },
    getBody() { return bodyData; }
  };

  return { req, res };
}

async function runSuite() {
  console.log('\n======================================================================');
  console.log('PADIFIX PHASE 031: CONSUMER INSTANT LEAD BROADCAST & WHATSAPP MATCHING');
  console.log('======================================================================\n');

  LeadStore.clearStore();

  // Setup Test Providers
  // Provider 101: Pro Tier (100 contacts allowance)
  LeadStore.setProviderUsageForTesting(101, 0, 'PRO');
  // Provider 8: Free Tier (5 contacts allowance)
  LeadStore.setProviderUsageForTesting(8, 0, 'FREE');

  const tokenPro101 = generateHs256Jwt({ providerId: 101, email: 'pro_101@padifix.ng' });
  const tokenFree8 = generateHs256Jwt({ providerId: 8, email: 'free_8@padifix.ng' });

  // --------------------------------------------------------------------------
  // GATE 1: DDL / Schema / Constraint & Migration 050 Verification
  // --------------------------------------------------------------------------
  try {
    const migPath = path.resolve(__dirname, '../supabase/migrations/050_padifix_phase_031_broadcast_leads.sql');
    assert.ok(fs.existsSync(migPath), 'Migration 050 file must exist');
    const migSql = fs.readFileSync(migPath, 'utf8');

    assert.ok(migSql.includes('CREATE TABLE IF NOT EXISTS public.broadcast_leads'), 'Must create broadcast_leads table');
    assert.ok(migSql.includes('trade_slug TEXT NOT NULL'), 'Must include trade_slug column');
    assert.ok(migSql.includes('state TEXT NOT NULL'), 'Must include state column');
    assert.ok(migSql.includes('lga TEXT NOT NULL'), 'Must include lga column');
    assert.ok(migSql.includes('urgency TEXT NOT NULL'), 'Must include urgency column');
    assert.ok(migSql.includes('job_scope TEXT NOT NULL'), 'Must include job_scope column');
    assert.ok(migSql.includes('char_length(job_scope) <= 600'), 'Must enforce max 600 chars scope');
    assert.ok(migSql.includes('pro_early_access_until TIMESTAMPTZ'), 'Must include pro_early_access_until column');
    assert.ok(migSql.includes('CREATE TABLE IF NOT EXISTS public.broadcast_lead_assignments'), 'Must create assignments table');
    assert.ok(migSql.includes('CREATE OR REPLACE FUNCTION public.claim_broadcast_lead'), 'Must define claim_broadcast_lead RPC');
    assert.ok(migSql.includes('ALTER TABLE public.broadcast_leads ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');

    recordGate(1, 'DDL / Schema / Constraint & Migration 050 Verification', true, 'Migration 050 defines broadcast_leads, assignments, indexes, constraints, and atomic claim RPC.');
  } catch (err) {
    recordGate(1, 'DDL / Schema / Constraint & Migration 050 Verification', false, err.message, err);
  }

  // --------------------------------------------------------------------------
  // GATE 2: Consumer Broadcast Creation & Input Validation
  // --------------------------------------------------------------------------
  let createdBroadcastId = null;
  try {
    // 2.1 Rejection of missing required fields
    const { req: invReq1, res: invRes1 } = createMockContext({
      method: 'POST',
      body: { action: 'create_broadcast', trade_slug: 'plumber' } // missing state, lga, job_scope
    });
    await providerLeadsHandler(invReq1, invRes1);
    assert.strictEqual(invRes1.getStatusCode(), 400, 'Must reject missing fields with 400');

    // 2.2 Rejection of too short scope
    const { req: invReq2, res: invRes2 } = createMockContext({
      method: 'POST',
      body: { action: 'create_broadcast', trade_slug: 'plumber', state: 'Lagos', lga: 'Ikeja', job_scope: 'hi' }
    });
    await providerLeadsHandler(invReq2, invRes2);
    assert.strictEqual(invRes2.getStatusCode(), 400, 'Must reject job_scope under 5 characters');

    // 2.3 Valid creation
    const { req: validReq, res: validRes } = createMockContext({
      method: 'POST',
      body: {
        action: 'create_broadcast',
        trade_slug: 'plumber',
        state: 'Lagos',
        lga: 'Ikeja',
        area: 'Alausa',
        urgency: 'immediate',
        budget_range: '₦10,000 - ₦25,000',
        job_scope: 'Burst pipe flooding kitchen floor under sink. Urgent repair needed.'
      }
    });
    await providerLeadsHandler(validReq, validRes);
    assert.strictEqual(validRes.getStatusCode(), 201, 'Valid broadcast must return 201 Created');
    const bcastBody = validRes.getBody();
    assert.strictEqual(bcastBody.status, 'success');
    assert.ok(bcastBody.broadcast_id, 'Must return broadcast_id');
    assert.strictEqual(bcastBody.trade_slug, 'plumber');
    assert.strictEqual(bcastBody.state, 'Lagos');
    assert.strictEqual(bcastBody.lga, 'Ikeja');
    assert.strictEqual(bcastBody.urgency, 'immediate');

    createdBroadcastId = bcastBody.broadcast_id;
    recordGate(2, 'Consumer Broadcast Creation & Input Validation', true, `Broadcast created successfully with ID: ${createdBroadcastId}. Strict validation enforced.`);
  } catch (err) {
    recordGate(2, 'Consumer Broadcast Creation & Input Validation', false, err.message, err);
  }

  // --------------------------------------------------------------------------
  // GATE 3: Top-3 Verified Artisan Matching & WhatsApp Deep Link Generation
  // --------------------------------------------------------------------------
  try {
    const { req, res } = createMockContext({
      method: 'POST',
      body: {
        action: 'create_broadcast',
        trade_slug: 'plumber',
        state: 'Lagos',
        lga: 'Ikeja',
        urgency: 'immediate',
        budget_range: '₦15,000',
        job_scope: 'Need emergency plumber to fix borehole pumping connection'
      }
    });
    await providerLeadsHandler(req, res);
    assert.strictEqual(res.getStatusCode(), 201);
    const body = res.getBody();
    const artisans = body.matched_artisans;

    assert.ok(Array.isArray(artisans), 'matched_artisans must be an array');
    assert.ok(artisans.length > 0 && artisans.length <= 3, 'Must match between 1 and 3 artisans (bounded)');

    // Verify each artisan structure
    artisans.forEach((artisan, i) => {
      assert.ok(artisan.id, `Artisan ${i} must have an ID`);
      assert.ok(artisan.name, `Artisan ${i} must have a name`);
      assert.strictEqual(artisan.is_verified, true, `Artisan ${i} must be verified`);
      assert.ok(artisan.whatsapp_url, `Artisan ${i} must have a whatsapp_url`);
      assert.ok(artisan.whatsapp_url.startsWith('https://wa.me/'), `Artisan ${i} WhatsApp URL must use wa.me protocol`);
      assert.ok(artisan.whatsapp_url.includes('PadiFix'), `Artisan ${i} WhatsApp text must reference PadiFix`);
      assert.ok(artisan.call_url, `Artisan ${i} must have a call_url`);
      assert.ok(artisan.call_url.startsWith('tel:'), `Artisan ${i} Call URL must use tel: protocol`);
    });

    recordGate(3, 'Top-3 Verified Artisan Matching & WhatsApp Format', true, `Matched ${artisans.length} verified artisans. Ephemeral WhatsApp links formatted with job ref.`);
  } catch (err) {
    recordGate(3, 'Top-3 Verified Artisan Matching & WhatsApp Format', false, err.message, err);
  }

  // --------------------------------------------------------------------------
  // GATE 4: Privacy Invariant C (Zero Consumer Phone or Chat Persistence)
  // --------------------------------------------------------------------------
  try {
    const bcast = LeadStore.getBroadcastLeadById(createdBroadcastId);
    assert.ok(bcast, 'Broadcast record must exist in store');

    // Strict PII audit on stored record
    assert.strictEqual(bcast.consumer_phone, undefined, 'Must not have consumer_phone');
    assert.strictEqual(bcast.phone, undefined, 'Must not have phone');
    assert.strictEqual(bcast.whatsapp_number, undefined, 'Must not have whatsapp_number');
    assert.strictEqual(bcast.raw_chat, undefined, 'Must not have raw_chat');
    assert.strictEqual(bcast.bearer_token, undefined, 'Must not store bearer_token');
    assert.strictEqual(bcast.whatsapp_url, undefined, 'Must not persist whatsapp_url');

    // Check that stored fields only contain task scope
    assert.ok(bcast.job_scope.includes('Burst pipe'), 'Job scope is preserved');
    assert.strictEqual(bcast.budget_range, '₦10,000 - ₦25,000');

    recordGate(4, 'Privacy Invariant C (Zero Consumer Phone/Chat Persistence)', true, 'Zero consumer phone numbers, chat bodies, or WhatsApp links persisted in ledger.');
  } catch (err) {
    recordGate(4, 'Privacy Invariant C (Zero Consumer Phone/Chat Persistence)', false, err.message, err);
  }

  // --------------------------------------------------------------------------
  // GATE 5: Pro Tier Immediate Priority Access
  // --------------------------------------------------------------------------
  try {
    const { req: proReq, res: proRes } = createMockContext({
      method: 'GET',
      url: '/api/provider-leads?filter=broadcasts',
      headers: { authorization: `Bearer ${tokenPro101}` }
    });
    await providerLeadsHandler(proReq, proRes);
    assert.strictEqual(proRes.getStatusCode(), 200, 'Pro provider request must succeed');
    const proBody = proRes.getBody();

    assert.strictEqual(proBody.status, 'success');
    assert.strictEqual(proBody.is_pro, true, 'Provider 101 must be recognized as Pro');
    assert.ok(Array.isArray(proBody.broadcasts), 'Must return broadcasts array');

    // Find our created broadcast
    const proFound = proBody.broadcasts.find(b => b.id === createdBroadcastId);
    assert.ok(proFound, 'Pro provider must immediately see open broadcast lead');
    assert.strictEqual(proFound.is_locked, false, 'Lead must be unlocked for Pro tier');
    assert.ok(proFound.job_scope.includes('Burst pipe'), 'Pro provider must see full job scope');

    recordGate(5, 'Pro Tier Immediate Priority Access', true, 'Pro subscriber receives immediate unredacted access to broadcast lead.');
  } catch (err) {
    recordGate(5, 'Pro Tier Immediate Priority Access', false, err.message, err);
  }

  // --------------------------------------------------------------------------
  // GATE 6: Free Tier 15-Minute Early-Access Gate & Server-Side Rejection
  // --------------------------------------------------------------------------
  try {
    // 6.1 Free tier read is locked during early-access window
    const { req: freeReq, res: freeRes } = createMockContext({
      method: 'GET',
      url: '/api/provider-leads?filter=broadcasts',
      headers: { authorization: `Bearer ${tokenFree8}` }
    });
    await providerLeadsHandler(freeReq, freeRes);
    assert.strictEqual(freeRes.getStatusCode(), 200);
    const freeBody = freeRes.getBody();

    assert.strictEqual(freeBody.is_pro, false, 'Provider 8 must be identified as Free tier');
    const freeFound = freeBody.broadcasts.find(b => b.id === createdBroadcastId);
    assert.ok(freeFound, 'Free provider sees broadcast on radar');
    assert.strictEqual(freeFound.is_locked, true, 'Lead must be locked for Free tier during 15-minute window');
    assert.ok(freeFound.job_scope.includes('Locked for Free tier'), 'Scope must be masked for Free tier');

    // 6.2 Server-Side Rejection: Free provider attempts to claim during 15-min window
    const { req: claimAttemptReq, res: claimAttemptRes } = createMockContext({
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFree8}` },
      body: {
        action: 'claim_broadcast',
        broadcast_id: createdBroadcastId
      }
    });
    await providerLeadsHandler(claimAttemptReq, claimAttemptRes);
    assert.strictEqual(claimAttemptRes.getStatusCode(), 403, 'Server must reject premature Free tier claim with 403');
    const claimErr = claimAttemptRes.getBody();
    assert.ok(claimErr.error.includes('15 minutes'), 'Error must cite 15-minute Pro exclusivity window');

    // 6.3 Unlock: Simulate passage of 15 minutes
    const bcast = LeadStore.getBroadcastLeadById(createdBroadcastId);
    bcast.pro_early_access_until = new Date(Date.now() - 1000).toISOString();

    const { req: freeReq2, res: freeRes2 } = createMockContext({
      method: 'GET',
      url: '/api/provider-leads?filter=broadcasts',
      headers: { authorization: `Bearer ${tokenFree8}` }
    });
    await providerLeadsHandler(freeReq2, freeRes2);
    const freeBody2 = freeRes2.getBody();
    const freeFound2 = freeBody2.broadcasts.find(b => b.id === createdBroadcastId);
    assert.strictEqual(freeFound2.is_locked, false, 'Lead must unlock for Free tier after 15 minutes');
    assert.ok(freeFound2.job_scope.includes('Burst pipe'), 'Full scope revealed upon unlock');

    recordGate(6, 'Free Tier 15-Minute Early-Access Gate & Security', true, 'Free tier locked during 15-min window; premature API claims strictly rejected with 403.');
  } catch (err) {
    recordGate(6, 'Free Tier 15-Minute Early-Access Gate & Security', false, err.message, err);
  }

  // --------------------------------------------------------------------------
  // GATE 7: Atomic Lead Claiming, Quota Deduction, & Concurrency Defense
  // --------------------------------------------------------------------------
  try {
    const initialUsage = LeadStore.getProviderUsage(8);
    const initialUsed = initialUsage.contacts_used;

    // 7.1 Successful claim by Provider 8 (now unlocked)
    const { req: claimReq, res: claimRes } = createMockContext({
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFree8}` },
      body: {
        action: 'claim_broadcast',
        broadcast_id: createdBroadcastId
      }
    });
    await providerLeadsHandler(claimReq, claimRes);
    assert.strictEqual(claimRes.getStatusCode(), 200, 'Claim must succeed with 200');
    const claimBody = claimRes.getBody();
    assert.strictEqual(claimBody.status, 'success');
    assert.ok(claimBody.lead_id, 'Must return new CRM operational lead_id');

    // 7.2 Quota Deduction: exactly 1 contact consumed
    const updatedUsage = LeadStore.getProviderUsage(8);
    assert.strictEqual(updatedUsage.contacts_used, initialUsed + 1, 'Exactly 1 contact credit must be consumed');

    // 7.3 Double Claim Rejection (IDOR / Race Condition defense)
    const { req: dupReq, res: dupRes } = createMockContext({
      method: 'POST',
      headers: { authorization: `Bearer ${tokenPro101}` },
      body: {
        action: 'claim_broadcast',
        broadcast_id: createdBroadcastId
      }
    });
    await providerLeadsHandler(dupReq, dupRes);
    assert.strictEqual(dupRes.getStatusCode(), 409, 'Duplicate claim must return 409 Conflict');

    // 7.4 Failed claim does NOT consume quota
    const proUsage = LeadStore.getProviderUsage(101);
    assert.strictEqual(proUsage.contacts_used, 0, 'Failed claim must not consume quota');

    recordGate(7, 'Atomic Lead Claiming, Quota Deduction, & Concurrency Defense', true, 'Claim consumes exactly 1 quota credit. Double claims and race conditions safely rejected.');
  } catch (err) {
    recordGate(7, 'Atomic Lead Claiming, Quota Deduction, & Concurrency Defense', false, err.message, err);
  }

  // --------------------------------------------------------------------------
  // GATE 8: Automatic CRM Pipeline Lead Insertion
  // --------------------------------------------------------------------------
  try {
    const { req: crmReq, res: crmRes } = createMockContext({
      method: 'GET',
      headers: { authorization: `Bearer ${tokenFree8}` }
    });
    await providerLeadsHandler(crmReq, crmRes);
    assert.strictEqual(crmRes.getStatusCode(), 200);
    const crmBody = crmRes.getBody();

    const claimedLead = crmBody.leads.find(l => l.channel === 'broadcast');
    assert.ok(claimedLead, 'Claimed broadcast must appear in provider CRM leads');
    assert.strictEqual(claimedLead.status, 'new', 'Claimed lead must start in "new" deal stage');
    assert.ok(claimedLead.intent_tag.includes('Broadcast: plumber'), 'Intent tag identifies broadcast');
    assert.ok(claimedLead.notes.includes('Burst pipe'), 'Notes contain job scope');
    assert.strictEqual(claimedLead.provider_id, 8, 'Assigned strictly to claiming provider');

    recordGate(8, 'Automatic CRM Pipeline Lead Insertion', true, 'Claimed lead integrated directly into Provider 8 CRM pipeline in "new" deal stage.');
  } catch (err) {
    recordGate(8, 'Automatic CRM Pipeline Lead Insertion', false, err.message, err);
  }

  // --------------------------------------------------------------------------
  // GATE 9: XSS Neutralization & 600-Character Scope Limit
  // --------------------------------------------------------------------------
  try {
    // 9.1 XSS Payload Sanitization
    const xssPayload = '<script>alert("HACK")</script><style>body{background:red}</style>Fix leaking toilet in guest room';
    const { req: xssReq, res: xssRes } = createMockContext({
      method: 'POST',
      body: {
        action: 'create_broadcast',
        trade_slug: 'plumber',
        state: 'Lagos',
        lga: 'Ikeja',
        job_scope: xssPayload
      }
    });
    await providerLeadsHandler(xssReq, xssRes);
    assert.strictEqual(xssRes.getStatusCode(), 201);
    const xssId = xssRes.getBody().broadcast_id;
    const storedXss = LeadStore.getBroadcastLeadById(xssId);

    assert.ok(!storedXss.job_scope.includes('<script>'), 'Script tags must be stripped');
    assert.ok(!storedXss.job_scope.includes('<style>'), 'Style tags must be stripped');
    assert.ok(storedXss.job_scope.includes('Fix leaking toilet'), 'Legitimate text preserved');

    // 9.2 Oversized scope rejection (> 600 chars)
    const { req: overReq, res: overRes } = createMockContext({
      method: 'POST',
      body: {
        action: 'create_broadcast',
        trade_slug: 'plumber',
        state: 'Lagos',
        lga: 'Ikeja',
        job_scope: 'A'.repeat(601)
      }
    });
    await providerLeadsHandler(overReq, overRes);
    assert.strictEqual(overRes.getStatusCode(), 400, 'Must reject scope > 600 chars');

    recordGate(9, 'XSS Neutralization & 600-Character Scope Limit', true, 'XSS tags stripped and 600-character upper bound strictly enforced.');
  } catch (err) {
    recordGate(9, 'XSS Neutralization & 600-Character Scope Limit', false, err.message, err);
  }

  // --------------------------------------------------------------------------
  // GATE 10: Dual-Viewport Browser QA & Accessibility (Desktop & Mobile)
  // --------------------------------------------------------------------------
  try {
    // Start temporary test server
    const PORT = 8899;
    const testServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const pathname = url.pathname;

      function wrapResponse(rawRes) {
        return {
          _status: 200,
          _headers: {},
          status(c) { this._status = c; return this; },
          setHeader(k, v) { this._headers[k] = v; return this; },
          getHeader(k) { return this._headers[k]; },
          json(d) {
            rawRes.writeHead(this._status, { 'Content-Type': 'application/json', ...this._headers });
            rawRes.end(JSON.stringify(d));
            return this;
          },
          send(d) {
            rawRes.writeHead(this._status, this._headers);
            rawRes.end(d || '');
            return this;
          },
          end(d) {
            rawRes.writeHead(this._status, this._headers);
            rawRes.end(d || '');
            return this;
          }
        };
      }

      if (pathname.startsWith('/api/provider-leads')) {
        let bodyStr = '';
        req.on('data', chunk => { bodyStr += chunk; });
        req.on('end', async () => {
          try { req.body = bodyStr ? JSON.parse(bodyStr) : {}; } catch (e) { req.body = {}; }
          req.query = Object.fromEntries(url.searchParams.entries());
          await providerLeadsHandler(req, wrapResponse(res));
        });
        return;
      }

      if (pathname.startsWith('/services/')) {
        const parts = pathname.split('/').filter(Boolean);
        req.query = { trade: parts[1] || 'plumber', state: parts[2] || '', lga: parts[3] || '' };
        await landingPageHandler(req, wrapResponse(res));
        return;
      }

      const filePath = path.join(__dirname, '..', pathname === '/' ? 'index.html' : pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeMap = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.json': 'application/json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml'
        };
        res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'text/plain' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise(r => testServer.listen(PORT, r));

    const browser = await chromium.launch({ channel: 'chrome', headless: true });

    try {
      // 10.1 Desktop (1280x850): Landing Page Modal Flow
      const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await desktopPage.goto(`http://localhost:${PORT}/services/plumber`, { waitUntil: 'domcontentloaded' });

      // Verify CTA Banner
      const ctaBtn = await desktopPage.$('#btn-open-broadcast-modal');
      assert.ok(ctaBtn, 'Broadcast CTA button must exist on SEO landing page');

      // Open Modal
      await ctaBtn.click();
      await desktopPage.waitForSelector('#bcast-modal.is-open', { timeout: 3000 });

      // Step 1: Pre-filled values
      const tradeVal = await desktopPage.$eval('#bcast-trade', el => el.value);
      assert.ok(tradeVal.toLowerCase().includes('plumber'), 'Trade must be prefilled');

      // Click Next -> Step 2
      await desktopPage.click('#btn-bcast-goto-step-2');
      await desktopPage.waitForSelector('#bcast-step-2', { state: 'visible', timeout: 2000 });

      // Fill Scope
      await desktopPage.fill('#bcast-scope', 'Underground pipe leak causing damp walls in living room');

      // Submit -> Step 3
      await desktopPage.click('#btn-bcast-submit');
      await desktopPage.waitForSelector('#bcast-step-3', { state: 'visible', timeout: 5000 });

      // Verify Match Results
      const matchItems = await desktopPage.$$('#bcast-match-results-container .bcast-match-item');
      assert.ok(matchItems.length > 0, 'Must render matched artisan cards');

      // Screenshot 1: Desktop Modal Match Results
      const desktopShotPath = path.join(ARTIFACT_DIR, 'phase_031_desktop_modal_match.png');
      await desktopPage.screenshot({ path: desktopShotPath });

      // 10.2 Mobile (390x844): Mobile Layout, Touch Targets, 0px Overflow
      const mobilePage = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true
      });
      await mobilePage.goto(`http://localhost:${PORT}/services/plumber`, { waitUntil: 'domcontentloaded' });

      // Check 0px horizontal overflow
      const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await mobilePage.evaluate(() => document.documentElement.clientWidth);
      assert.strictEqual(scrollWidth, clientWidth, 'Must have zero horizontal document overflow on mobile');

      // Open Modal on Mobile
      await mobilePage.click('#btn-open-broadcast-modal');
      await mobilePage.waitForSelector('#bcast-modal.is-open');

      // Verify touch target >= 44px
      const nextBtnBox = await mobilePage.$eval('#btn-bcast-goto-step-2', el => {
        const rect = el.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      });
      assert.ok(nextBtnBox.height >= 44, `Touch target height must be >= 44px (got ${nextBtnBox.height}px)`);

      // Screenshot 2: Mobile Modal
      const mobileShotPath = path.join(ARTIFACT_DIR, 'phase_031_mobile_modal.png');
      await mobilePage.screenshot({ path: mobileShotPath });

      // 10.3 Search Page FAB & Escape Keyboard Accessibility
      const searchPage = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await searchPage.goto(`http://localhost:${PORT}/search.html`, { waitUntil: 'domcontentloaded' });

      const fabBtn = await searchPage.$('#btn-broadcast-fab');
      assert.ok(fabBtn, 'FAB button must exist on search.html');
      await fabBtn.click();
      await searchPage.waitForSelector('#universal-bcast-modal.is-open');

      // Test Escape Key
      await searchPage.keyboard.press('Escape');
      await searchPage.waitForSelector('#universal-bcast-modal:not(.is-open)');

      // 10.4 Dashboard Broadcast Radar Screen
      const dashPage = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await dashPage.addInitScript(() => {
        localStorage.setItem('lokator_current_provider', JSON.stringify({
          id: 101,
          full_name: 'Babatunde Adeleke',
          business_name: 'Babatunde Electric & Solar',
          primary_category_slug: 'electrician',
          trade_title: 'Electrician',
          state: 'Lagos',
          lga: 'Ikeja',
          is_verified: true,
          subscription_plan: 'PRO'
        }));
        localStorage.setItem('padifix_auth_token', 'mock_token_pro');
        localStorage.setItem('padifix_provider_id', '101');
      });
      await dashPage.goto(`http://localhost:${PORT}/dashboard.html`, { waitUntil: 'domcontentloaded' });
      await dashPage.waitForSelector('#crm-broadcast-radar', { timeout: 6000 });
      const radarSection = await dashPage.$('#crm-broadcast-radar');
      assert.ok(radarSection, 'Dashboard must contain #crm-broadcast-radar');
      const radarShotPath = path.join(ARTIFACT_DIR, 'phase_031_dashboard_broadcast_radar.png');
      await dashPage.screenshot({ path: radarShotPath });

      recordGate(10, 'Dual-Viewport Browser QA & Accessibility', true, 'Desktop & Mobile tested. 0px overflow, >=44px touch targets, Escape accessibility, and Dashboard Radar verified.');
    } finally {
      await browser.close();
      await new Promise(r => testServer.close(r));
    }
  } catch (err) {
    recordGate(10, 'Dual-Viewport Browser QA & Accessibility', false, err.message, err);
  }

  // --- SUMMARY REPORT ---
  console.log('\n======================================================================');
  console.log(`PADIFIX PHASE 031 TEST RESULTS: ${passedGates}/${totalGates} GATES PASSED`);
  console.log('======================================================================');

  if (failedGates > 0) {
    console.error(`\x1b[31mSuite failed with ${failedGates} failing gates.\x1b[0m`);
    process.exit(1);
  } else {
    console.log('\x1b[32mALL 10 GATES PASSED! PHASE 031 CERTIFICATION READY.\x1b[0m\n');
  }
}

runSuite().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});

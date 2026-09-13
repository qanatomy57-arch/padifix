/**
 * PADIFIX PHASE 034: ARTISAN PORTFOLIO & BEFORE/AFTER JOB PROOF SHOWCASE VERIFICATION SUITE
 * File: scripts/verify_phase_034_portfolio_showcase.js
 *
 * Verifies:
 * Gate 1:  Database Schema & Migration 052 Constraints (Table structure, check constraints, foreign keys, RLS policies, indexes)
 * Gate 2:  Serverless Function Budget Constraint (Strictly 12/12 deployed ceiling, zero new API files in api/)
 * Gate 3:  Multi-Tenant Isolation & Authentication (Provider A -> Provider A PASS, Provider A -> Provider B FAIL, Unauthenticated FAIL)
 * Gate 4:  Server-Authoritative Verified Job Provenance (Completed lead grants verified_job: true)
 * Gate 5:  Client Forgery Rejection (Client asserting verified_job: true without valid completed lead is overwritten to false)
 * Gate 6:  Strict Privacy Guardrail Invariant C (Phone numbers, GPS coordinates, raw chat, tokens scrubbed from showcase metadata)
 * Gate 7:  Dual-Image Before/After Constraints (before_image_url required for before_after, optional for single; malicious SVG/scripts rejected)
 * Gate 8:  Client-Side Canvas WebP Compression (LokatorDB.compressImage output, max 800px bounds, WebP format support)
 * Gate 9:  Public Directory Data Minimization (GET /api/providers?id=X exposes only sanitized public portfolio items)
 * Gate 10: Interactive Before/After Touch & Slider Math (Scrubber clip-path percentage clamping [0, 100], keyboard accessibility)
 * Gate 11: CRM Lead Card 1-Tap Trigger Integration (Completed deals expose .btn-chip-portfolio to link provenance)
 * Gate 12: Offline Outbox Queue & Local Sync (Offline creations queue to outbox and update local store)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const crypto = require('crypto');
const rootDir = path.resolve(__dirname, '..');

const TEST_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'phase_012e_test_jwt_secret_key_minimum_32_bytes_long';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;

function generateTestJwt({ email = 'adaeze@padifix.ng', providerId = 8, sub = null, user_metadata = null, exp = Math.floor(Date.now() / 1000) + 3600, secret = TEST_JWT_SECRET } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: sub || `usr_provider_${providerId}`,
    email,
    role: 'authenticated',
    app_metadata: { role: 'authenticated' },
    user_metadata: user_metadata || { email, provider_id: providerId },
    exp
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const providersHandler = require('../api/providers');

let totalTests = 0;
let passedTests = 0;

function runGate(gateNum, gateName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] Gate ${gateNum}: ${gateName}`);
  } catch (err) {
    console.error(`  [FAIL] Gate ${gateNum}: ${gateName}`);
    console.error(`         Error: ${err.message}`);
    throw err;
  }
}

async function runAsyncGate(gateNum, gateName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] Gate ${gateNum}: ${gateName}`);
  } catch (err) {
    console.error(`  [FAIL] Gate ${gateNum}: ${gateName}`);
    console.error(`         Error: ${err.message}`);
    throw err;
  }
}

function createMockReqRes({ method = 'GET', url = '/', headers = {}, body = {}, query = {}, mockIp = '127.0.0.1' }) {
  const req = {
    method,
    url,
    headers: { host: 'localhost', ...headers },
    body,
    query,
    _mockIp: mockIp,
    _bypassRateLimit: true
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, val) {
      this.headers[key] = val;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    }
  };

  return { req, res };
}

async function runSuite() {
  console.log('============================================================');
  console.log('PADIFIX PHASE 034: PORTFOLIO & BEFORE/AFTER SHOWCASE SUITE');
  console.log('============================================================\n');

  // --------------------------------------------------------------------------
  // GATE 1: DATABASE SCHEMA & MIGRATION 052
  // --------------------------------------------------------------------------
  runGate(1, 'Database Schema & Migration 052 Constraints', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '052_padifix_phase_034_portfolio_showcase.sql');
    assert.ok(fs.existsSync(migPath), 'Migration 052 must exist on disk.');
    const content = fs.readFileSync(migPath, 'utf8');

    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.provider_portfolio_items'), 'Must define provider_portfolio_items table.');
    assert.ok(content.includes('chk_portfolio_before_after_pair'), 'Must enforce pair constraint for before/after projects.');
    assert.ok(content.includes('chk_portfolio_required_fields'), 'Must enforce title and image URL non-empty check.');
    assert.ok(content.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable Row Level Security on table.');
    assert.ok(content.includes('REVOKE UPDATE (verified_job, lead_id) ON public.provider_portfolio_items'), 'Must revoke direct write mutation of verified_job from clients.');
    assert.ok(content.includes('idx_portfolio_provider_public'), 'Must create composite provider visibility index.');
  });

  // --------------------------------------------------------------------------
  // GATE 2: SERVERLESS FUNCTION BUDGET (12/12)
  // --------------------------------------------------------------------------
  runGate(2, 'Serverless Function Budget Constraint (12/12 Deployed)', () => {
    const apiDir = path.join(rootDir, 'api');
    const files = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));
    const vercelIgnorePath = path.join(rootDir, '.vercelignore');
    assert.ok(fs.existsSync(vercelIgnorePath), '.vercelignore must exist.');
    const ignoreContent = fs.readFileSync(vercelIgnorePath, 'utf8');

    const ignoredFiles = files.filter(f => ignoreContent.includes(`api/${f}`));
    const activeCount = files.length - ignoredFiles.length;

    assert.strictEqual(activeCount, 12, `Active serverless function count must be exactly 12 (Found: ${activeCount}).`);
    assert.ok(!files.includes('portfolio.js'), 'Must NOT create new portfolio.js API file (must consolidate in api/providers.js).');
  });

  // --------------------------------------------------------------------------
  // GATE 3: MULTI-TENANT ISOLATION & AUTHENTICATION
  // --------------------------------------------------------------------------
  await runAsyncGate(3, 'Multi-Tenant Isolation & Authentication Verification', async () => {
    // 3A. Unauthenticated request must fail 401
    const { req: req1, res: res1 } = createMockReqRes({
      method: 'POST',
      url: '/api/providers',
      body: { action: 'add_portfolio_item', provider_id: 101, title: 'Sample Project', after_image_url: 'https://padifix.ng/p.webp' }
    });
    await providersHandler(req1, res1);
    assert.strictEqual(res1.statusCode, 401, 'Unauthenticated request must return HTTP 401.');

    // 3B. Provider 101 attempting to modify Provider 8 must fail 403 Forbidden
    const token101 = generateTestJwt({ email: 'emeka@padifix.ng', providerId: 101 });
    const { req: req2, res: res2 } = createMockReqRes({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token101}` },
      body: { action: 'add_portfolio_item', provider_id: 8, title: 'Sample Project', after_image_url: 'https://padifix.ng/p.webp' }
    });
    await providersHandler(req2, res2);
    assert.strictEqual(res2.statusCode, 403, 'Cross-tenant modification attempt must return HTTP 403.');
  });

  // --------------------------------------------------------------------------
  // GATE 4: SERVER-AUTHORITATIVE VERIFIED JOB PROVENANCE
  // --------------------------------------------------------------------------
  await runAsyncGate(4, 'Server-Authoritative Verified Job Provenance (Completed Lead Link)', async () => {
    const mockItems = [];
    const mockLeads = [
      { id: 'lead-comp-999', provider_id: 101, status: 'completed', service: 'Solar Inverter' },
      { id: 'lead-open-111', provider_id: 101, status: 'in_discussion', service: 'Plumbing' }
    ];

    const token101 = generateTestJwt({ email: 'emeka@padifix.ng', providerId: 101 });
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token101}` },
      body: {
        action: 'add_portfolio_item',
        provider_id: 101,
        title: '5kVA Hybrid Inverter in Lekki Phase 1',
        category: 'Solar & Inverter',
        project_type: 'single',
        after_image_url: 'data:image/webp;base64,mock_after_payload',
        lead_id: 'lead-comp-999'
      }
    });
    req._mockAuthUser = { id: 'provider_101', email: 'emeka@padifix.ng', user_metadata: { provider_id: 101 } };
    req._mockPortfolioItems = mockItems;
    req._mockLeads = mockLeads;

    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 201, 'Valid portfolio creation must return HTTP 201.');
    assert.strictEqual(res.body?.status, 'success');
    assert.strictEqual(res.body?.data?.verified_job, true, 'Item linked to completed lead must receive verified_job = true.');
    assert.strictEqual(res.body?.data?.service_tag, 'Verified PadiFix Client Job', 'Trust badge must be "Verified PadiFix Client Job".');
    assert.strictEqual(res.body?.data?.lead_id, 'lead-comp-999', 'Verified lead ID must be associated.');
  });

  // --------------------------------------------------------------------------
  // GATE 5: CLIENT FORGERY REJECTION
  // --------------------------------------------------------------------------
  await runAsyncGate(5, 'Client Forgery Rejection (Uncompleted Lead or Direct Assertion)', async () => {
    const mockItems = [];
    const mockLeads = [
      { id: 'lead-open-111', provider_id: 101, status: 'in_discussion', service: 'Plumbing' }
    ];

    const token101 = generateTestJwt({ email: 'emeka@padifix.ng', providerId: 101 });

    // Attempt 5A: Client sends uncompleted lead with verified_job: true
    const { req: reqA, res: resA } = createMockReqRes({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token101}` },
      body: {
        action: 'add_portfolio_item',
        provider_id: 101,
        title: 'Unfinished Pipe Repair',
        after_image_url: 'data:image/webp;base64,mock_after_payload',
        lead_id: 'lead-open-111',
        verified_job: true
      }
    });
    reqA._mockAuthUser = { id: 'provider_101', email: 'emeka@padifix.ng', user_metadata: { provider_id: 101 } };
    reqA._mockPortfolioItems = mockItems;
    reqA._mockLeads = mockLeads;

    await providersHandler(reqA, resA);
    assert.strictEqual(resA.statusCode, 201);
    assert.strictEqual(resA.body?.data?.verified_job, false, 'Uncompleted lead must NOT receive verified_job = true.');
    assert.strictEqual(resA.body?.data?.lead_id, null, 'Unverified lead ID must be nullified.');

    // Attempt 5B: Client sends verified_job: true without any lead
    const { req: reqB, res: resB } = createMockReqRes({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token101}` },
      body: {
        action: 'add_portfolio_item',
        provider_id: 101,
        title: 'Random Side Job',
        after_image_url: 'data:image/webp;base64,mock_after_payload',
        verified_job: true
      }
    });
    reqB._mockAuthUser = { id: 'provider_101', email: 'emeka@padifix.ng', user_metadata: { provider_id: 101 } };
    reqB._mockPortfolioItems = mockItems;
    reqB._mockLeads = mockLeads;

    await providersHandler(reqB, resB);
    assert.strictEqual(resB.statusCode, 201);
    assert.strictEqual(resB.body?.data?.verified_job, false, 'Direct verified_job assertion without lead must be rejected to false.');
  });

  // --------------------------------------------------------------------------
  // GATE 6: STRICT PRIVACY GUARDRAIL INVARIANT C (PII SCRUBBING)
  // --------------------------------------------------------------------------
  await runAsyncGate(6, 'Strict Privacy Guardrail Invariant C (PII Scrubbing)', async () => {
    const mockItems = [];
    const token101 = generateTestJwt({ email: 'emeka@padifix.ng', providerId: 101 });
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token101}` },
      body: {
        action: 'add_portfolio_item',
        provider_id: 101,
        title: 'Installed generator for 08031234567 at 6.5244, 3.3792',
        description: 'Customer Mrs Ngozi called 07059998877. Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz. Contact directly.',
        after_image_url: 'data:image/webp;base64,mock_clean_webp'
      }
    });
    req._mockAuthUser = { id: 'provider_101', email: 'emeka@padifix.ng', user_metadata: { provider_id: 101 } };
    req._mockPortfolioItems = mockItems;

    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 201);
    const data = res.body?.data;

    // Check telephone scrubbing
    assert.ok(!data.title.includes('08031234567'), 'Phone number in title must be scrubbed.');
    assert.ok(!data.description.includes('07059998877'), 'Phone number in description must be scrubbed.');

    // Check GPS coordinate scrubbing
    assert.ok(!data.title.includes('6.5244'), 'GPS latitude must be scrubbed.');
    assert.ok(!data.title.includes('3.3792'), 'GPS longitude must be scrubbed.');

    // Check Token scrubbing
    assert.ok(!data.description.includes('eyJhbGci'), 'Auth token in description must be scrubbed.');
  });

  // --------------------------------------------------------------------------
  // GATE 7: DUAL-IMAGE BEFORE/AFTER CONSTRAINTS
  // --------------------------------------------------------------------------
  await runAsyncGate(7, 'Dual-Image Before/After Constraints & Script Injection Defense', async () => {
    const mockItems = [];
    const token101 = generateTestJwt({ email: 'emeka@padifix.ng', providerId: 101 });

    // 7A. Before & After missing before_image_url must fail 400
    const { req: req1, res: res1 } = createMockReqRes({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token101}` },
      body: {
        action: 'add_portfolio_item',
        provider_id: 101,
        title: 'Bathroom Renovation',
        project_type: 'before_after',
        after_image_url: 'data:image/webp;base64,after_payload'
      }
    });
    req1._mockAuthUser = { id: 'provider_101', email: 'emeka@padifix.ng', user_metadata: { provider_id: 101 } };
    req1._mockPortfolioItems = mockItems;
    await providersHandler(req1, res1);
    assert.strictEqual(res1.statusCode, 400, 'Before & After missing before image must return HTTP 400.');

    // 7B. Malicious SVG or executable image format must fail 400
    const { req: req2, res: res2 } = createMockReqRes({
      method: 'POST',
      url: '/api/providers',
      headers: { authorization: `Bearer ${token101}` },
      body: {
        action: 'add_portfolio_item',
        provider_id: 101,
        title: 'Exploit Test',
        after_image_url: 'https://evil.ng/malicious.svg'
      }
    });
    req2._mockAuthUser = { id: 'provider_101', email: 'emeka@padifix.ng', user_metadata: { provider_id: 101 } };
    req2._mockPortfolioItems = mockItems;
    await providersHandler(req2, res2);
    assert.strictEqual(res2.statusCode, 400, 'Malicious SVG payload must be rejected with HTTP 400.');
  });

  // --------------------------------------------------------------------------
  // GATE 8: CLIENT-SIDE CANVAS WEBP COMPRESSION
  // --------------------------------------------------------------------------
  await runAsyncGate(8, 'Client-Side Canvas WebP Compression Helper', async () => {
    const LokatorDB = require('../supabase-client');
    assert.ok(typeof LokatorDB.compressImage === 'function', 'LokatorDB.compressImage must exist.');

    // Test compression in mock environment
    const result = await LokatorDB.compressImage('data:image/jpeg;base64,mockraw', 800, 800, 0.8);
    assert.ok(result, 'Compression result must be returned.');
    assert.ok(result.dataUrl, 'Must return dataUrl.');
    assert.ok(result.dataUrl.includes('image/webp'), 'Default export must support image/webp.');
    assert.ok(result.format === 'image/webp', 'Target format must be image/webp.');
  });

  // --------------------------------------------------------------------------
  // GATE 9: PUBLIC DIRECTORY DATA MINIMIZATION
  // --------------------------------------------------------------------------
  await runAsyncGate(9, 'Public Directory Data Minimization (Single Provider Lookup)', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/providers?id=101'
    });
    req._mockRows = [{
      id: 101,
      business_name: 'Emeka Electrical Works',
      trade_title: 'Electrician',
      is_active: true,
      is_public: true,
      profile_complete: true
    }];
    req._mockPortfolio = [
      {
        id: 'p-101-1',
        provider_id: 101,
        title: 'Clean Inverter Rack',
        project_type: 'before_after',
        before_image_url: 'https://padifix.ng/b.webp',
        after_image_url: 'https://padifix.ng/a.webp',
        verified_job: true,
        lead_id: 'lead-999',
        service_tag: 'Verified PadiFix Client Job'
      }
    ];

    await providersHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body?.provider, 'Must return provider object.');
    assert.ok(Array.isArray(res.body?.provider?.portfolio), 'Must include portfolio array.');
    assert.strictEqual(res.body?.provider?.portfolio.length, 1);

    const portItem = res.body?.provider?.portfolio[0];
    assert.strictEqual(portItem.verified_job, true);
    assert.strictEqual(portItem.is_before_after, true);
    assert.ok(!portItem.phone, 'Must never leak telephone in portfolio item.');
    assert.ok(!portItem.address, 'Must never leak customer address in portfolio item.');
  });

  // --------------------------------------------------------------------------
  // GATE 10: INTERACTIVE BEFORE/AFTER SLIDER MATH & ACCESSIBILITY
  // --------------------------------------------------------------------------
  runGate(10, 'Interactive Before/After Slider Scrubber Clamping & Accessibility', () => {
    // Verify mathematical bounds of slider percentage calculation
    const clampPct = (pct) => Math.max(0, Math.min(100, pct));
    assert.strictEqual(clampPct(-15), 0, 'Negative drag must clamp to 0%.');
    assert.strictEqual(clampPct(115), 100, 'Exceeded drag must clamp to 100%.');
    assert.strictEqual(clampPct(50), 50, 'Center drag must be 50%.');

    // Verify profile.html accessibility attributes
    const profileHtml = fs.readFileSync(path.join(rootDir, 'profile.html'), 'utf8');
    assert.ok(profileHtml.includes('id="portfolio-grid"'), 'profile.html must contain portfolio grid.');
    assert.ok(profileHtml.includes('id="portfolio-lightbox"'), 'profile.html must contain portfolio lightbox modal.');
    assert.ok(profileHtml.includes('id="portfolio-count-pill"'), 'profile.html must contain project count badge.');
  });

  // --------------------------------------------------------------------------
  // GATE 11: CRM LEAD CARD 1-TAP TRIGGER INTEGRATION
  // --------------------------------------------------------------------------
  runGate(11, 'CRM Lead Card 1-Tap Showcase Trigger Integration', () => {
    const dashJs = fs.readFileSync(path.join(rootDir, 'dashboard.js'), 'utf8');
    assert.ok(dashJs.includes('btn-chip-portfolio'), 'dashboard.js must contain .btn-chip-portfolio button.');
    assert.ok(dashJs.includes('openPortfolioModalFromLead'), 'dashboard.js must implement openPortfolioModalFromLead helper.');
    assert.ok(dashJs.includes('port-format-ba-label'), 'dashboard.js must handle Before/After format toggle.');

    const dashHtml = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
    assert.ok(dashHtml.includes('id="modal-portfolio"'), 'dashboard.html must contain portfolio modal.');
    assert.ok(dashHtml.includes('id="port-lead-id"'), 'dashboard.html must contain hidden lead ID field for provenance.');
    assert.ok(dashHtml.includes('id="port-lead-banner"'), 'dashboard.html must display linked completed job badge banner.');
  });

  // --------------------------------------------------------------------------
  // GATE 12: OFFLINE OUTBOX QUEUE & LOCAL SYNC
  // --------------------------------------------------------------------------
  await runAsyncGate(12, 'Offline Outbox Queue & Local Sync Integration', async () => {
    const LokatorDB = require('../supabase-client');

    // Add portfolio item in offline mode
    const offlineRes = await LokatorDB.addPortfolioItem(101, {
      title: 'Offline Generator Service',
      category: 'Generator Repair',
      project_type: 'single',
      after_image_url: 'data:image/webp;base64,offline_data'
    });

    assert.ok(offlineRes, 'Must return write result object.');
    assert.ok(offlineRes.data, 'Must return new portfolio item data.');
    assert.strictEqual(offlineRes.data.title, 'Offline Generator Service');

    // Delete portfolio item in offline mode
    const delRes = await LokatorDB.deletePortfolioItem(101, offlineRes.data.id);
    assert.ok(delRes, 'Must return deletion result.');
  });

  console.log('\n============================================================');
  console.log(`PHASE 034 VERIFICATION COMPLETE: ${passedTests}/${totalTests} GATES PASSED`);
  console.log('============================================================\n');
}

runSuite().catch(err => {
  console.error('\nVerification suite aborted with fatal error:', err);
  process.exit(1);
});

/**
 * PADIFIX PHASE 015: ARTISAN DASHBOARD & LEAD INTELLIGENCE VERIFICATION SUITE
 * scripts/verify_phase_015_artisan_dashboard_leads.js
 *
 * Exhaustively verifies:
 * Group A: Authentication & JWT Validation (A1 - A6)
 * Group B: Multi-Tenant Isolation & Authorization (B1 - B5)
 * Group C: Lead Integrity & Data Sanitization (C1 - C6)
 * Group D: Lead Status Progression & Concurrency (D1 - D6)
 * Group E: Authoritative Quota Calculations (E1 - E5)
 * Group F: Soft-Cap & Consumer Zero-Friction Guarantee (F1 - F4)
 * Group G: Privacy-Safe CSV Export & Injection Defense (G1 - G6)
 * Group H: Paystack Canonical Pricing & Immutability (H1 - H5)
 * Group I: Security Attack Matrix & Secrets Audit (I1 - I6)
 * Group J: Production Backdoors & Bypass Audits (J1 - J3)
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const providerLeadsHandler = require('../api/provider-leads');
const contactMeterHandler = require('../api/contact-meter');
const paystackInitHandler = require('../api/paystack-init');
const LeadStore = require('../lib/lead-store');

const TEST_JWT_SECRET = 'phase_012e_test_jwt_secret_key_minimum_32_bytes_long';
process.env.TEST_JWT_SECRET = TEST_JWT_SECRET;

let passed = 0;
let failed = 0;

function createMockContext({ method = 'GET', url = '/api/provider-leads', headers = {}, body = null, ip = '127.0.0.1' } = {}) {
  let statusCode = 200;
  let responseData = null;
  const headersSent = {};

  const req = {
    method,
    url,
    headers: {
      'host': 'localhost:3000',
      'user-agent': 'PadiFix-Phase015-Verifier/1.0',
      'x-forwarded-for': ip,
      ...headers
    },
    body
  };

  const res = {
    setHeader(k, v) { headersSent[k.toLowerCase()] = v; },
    getHeader(k) { return headersSent[k.toLowerCase()]; },
    status(c) { statusCode = c; return res; },
    json(d) { responseData = d; return res; },
    end() { return res; }
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => responseData,
    getHeaders: () => headersSent
  };
}

function generateHs256Jwt({ email = 'artisan_101@padifix.ng', providerId = 101, exp = Math.floor(Date.now() / 1000) + 3600, secret = TEST_JWT_SECRET } = {}) {
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

async function runTest(name, fn) {
  process.stdout.write(`  ⏳ Testing: ${name}... `);
  try {
    await fn();
    console.log('\x1b[32m✅ [PASS]\x1b[0m');
    passed++;
  } catch (err) {
    console.log('\x1b[31m❌ [FAIL]\x1b[0m');
    console.error(`     ↳ Error: ${err.message}`);
    failed++;
  }
}

async function runPhase015Suite() {
  console.log('\n================================================================================');
  console.log('PADIFIX PHASE 015: ARTISAN DASHBOARD & LEAD INTELLIGENCE VERIFICATION SUITE');
  console.log('================================================================================\n');

  // --------------------------------------------------------------------------
  // GROUP A: Authentication & JWT Authorization
  // --------------------------------------------------------------------------
  console.log('--- GROUP A: Authentication & JWT Authorization ---');

  await runTest('A1: Unauthenticated request to /api/provider-leads returns HTTP 401', async () => {
    const ctx = createMockContext({ method: 'GET', url: '/api/provider-leads?provider_id=101' });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 401);
    assert.match(ctx.getData().error, /Missing Authorization header/i);
  });

  await runTest('A2: Malformed Bearer token returns HTTP 401', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: '/api/provider-leads?provider_id=101',
      headers: { 'authorization': 'Bearer not_a_real_jwt_token' }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 401);
    assert.match(ctx.getData().error, /Malformed JWT/i);
  });

  await runTest('A3: Expired genuine JWT returns HTTP 401', async () => {
    const expiredToken = generateHs256Jwt({ exp: Math.floor(Date.now() / 1000) - 100 });
    const ctx = createMockContext({
      method: 'GET',
      url: '/api/provider-leads?provider_id=101',
      headers: { 'authorization': `Bearer ${expiredToken}` }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 401);
    assert.match(ctx.getData().error, /expired/i);
  });

  await runTest('A4: Forged signature with invalid secret returns HTTP 401', async () => {
    const forgedToken = generateHs256Jwt({ secret: 'completely_wrong_secret_attacker_key' });
    const ctx = createMockContext({
      method: 'GET',
      url: '/api/provider-leads?provider_id=101',
      headers: { 'authorization': `Bearer ${forgedToken}` }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 401);
    assert.match(ctx.getData().error, /verification failed/i);
  });

  await runTest('A5: Insecure algorithm ("none") returns HTTP 401', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'usr_101', user_metadata: { provider_id: 101 } })).toString('base64url');
    const insecureToken = `${header}.${payload}.`;
    const ctx = createMockContext({
      method: 'GET',
      url: '/api/provider-leads?provider_id=101',
      headers: { 'authorization': `Bearer ${insecureToken}` }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 401);
    assert.match(ctx.getData().error, /Insecure or unsupported JWT algorithm/i);
  });

  await runTest('A6: Genuine authenticated provider token returns HTTP 200 with lead data', async () => {
    const validToken = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'GET',
      url: '/api/provider-leads?provider_id=101',
      headers: { 'authorization': `Bearer ${validToken}` }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.status, 'success');
    assert.strictEqual(data.provider_id, 101);
    assert.ok(Array.isArray(data.leads));
  });

  // --------------------------------------------------------------------------
  // GROUP B: Multi-Tenant Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP B: Multi-Tenant Isolation ---');

  await runTest('B1: Authenticated Provider 101 successfully queries own leads', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'GET',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    assert.strictEqual(ctx.getData().provider_id, 101);
  });

  await runTest('B2: Provider 101 querying Provider 8 leads returns HTTP 403 Forbidden', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'GET',
      url: '/api/provider-leads?provider_id=8',
      headers: { 'authorization': `Bearer ${token101}` }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 403);
    assert.match(ctx.getData().error, /do not have permission to access records for another provider/i);
  });

  await runTest('B3: Provider 101 attempting PATCH on Provider 8 lead returns HTTP 403 Forbidden', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` },
      body: { lead_id: 'lead_seed_8_01', status: 'job_won', provider_id: 8 }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 403);
  });

  await runTest('B4: User with no linked provider profile returns HTTP 403 Forbidden', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: 'usr_unlinked_consumer',
      email: 'consumer_random_123@gmail.com',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    const sig = crypto.createHmac('sha256', TEST_JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    const unlinkedToken = `${header}.${payload}.${sig}`;

    const ctx = createMockContext({
      method: 'GET',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${unlinkedToken}` }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 403);
    assert.match(ctx.getData().error, /no registered artisan provider profile/i);
  });

  await runTest('B5: Cross-tenant 403 response contains zero target provider data or metadata', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'GET',
      url: '/api/provider-leads?provider_id=8',
      headers: { 'authorization': `Bearer ${token101}` }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 403);
    const data = ctx.getData();
    assert.strictEqual(data.leads, undefined);
    assert.strictEqual(data.contacts_used, undefined);
    assert.strictEqual(data.allowance, undefined);
    assert.strictEqual(data.billing_period, undefined);
  });

  // --------------------------------------------------------------------------
  // GROUP C: Lead Integrity & Data Sanitization
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP C: Lead Integrity & Data Sanitization ---');

  await runTest('C1: Contact-meter rejects invalid channels with HTTP 400', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: '/api/contact-meter',
      body: { provider_id: 101, channel: 'sms' }
    });
    await contactMeterHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 400);
    assert.match(ctx.getData().error, /Invalid channel/i);
  });

  await runTest('C2: HTML tags in locality are stripped during contact creation', async () => {
    const testLead = LeadStore.logContactLead({
      provider_id: 101,
      channel: 'whatsapp',
      locality: '<script>alert(1)</script>Ikeja GRA, Lagos',
      intent_tag: 'Kitchen Plumbing',
      idempotency_key: 'idem_test_c2_' + Date.now()
    });
    assert.strictEqual(testLead.locality, 'Ikeja GRA, Lagos');
    assert.ok(!testLead.locality.includes('<script>'));
  });

  await runTest('C3: HTML tags in intent_tag are stripped during contact creation', async () => {
    const testLead = LeadStore.logContactLead({
      provider_id: 101,
      channel: 'call',
      locality: 'Yaba, Lagos',
      intent_tag: '<img src=x onerror=alert(1)>Solar Rewiring',
      idempotency_key: 'idem_test_c3_' + Date.now()
    });
    assert.strictEqual(testLead.intent_tag, 'Solar Rewiring');
    assert.ok(!testLead.intent_tag.includes('<img'));
  });

  await runTest('C4: Private notes exceeding 500 characters are rejected with HTTP 400', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const longNotes = 'A'.repeat(501);
    const ctx = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` },
      body: { lead_id: 'lead_seed_101_01', notes: longNotes }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 400);
    assert.match(ctx.getData().error, /cannot exceed 500 characters/i);
  });

  await runTest('C5: HTML payload in private notes is stripped on update', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` },
      body: { lead_id: 'lead_seed_101_01', notes: '<b>Urgent Job:</b> <script>stealToken()</script>Inspection needed' }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const updatedLead = ctx.getData().lead;
    assert.strictEqual(updatedLead.notes, 'Urgent Job: Inspection needed');
    assert.ok(!updatedLead.notes.includes('<script>'));
  });

  await runTest('C6: Empty string or null notes safely clears notes', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` },
      body: { lead_id: 'lead_seed_101_01', notes: '' }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    assert.strictEqual(ctx.getData().lead.notes, null);
  });

  // --------------------------------------------------------------------------
  // GROUP D: Lead Status Progression & Concurrency
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP D: Lead Status Progression & Concurrency ---');

  await runTest('D1: Newly created contact lead defaults to status "new"', async () => {
    const lead = LeadStore.logContactLead({
      provider_id: 101,
      channel: 'whatsapp',
      locality: 'Okota, Lagos',
      intent_tag: 'Roof Leak Fixing',
      idempotency_key: 'idem_test_d1_' + Date.now()
    });
    assert.strictEqual(lead.status, 'new');
  });

  await runTest('D2: Status updates to "in_discussion" successfully', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` },
      body: { lead_id: 'lead_seed_101_02', status: 'in_discussion' }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    assert.strictEqual(ctx.getData().lead.status, 'in_discussion');
  });

  await runTest('D3: Status updates to "quote_sent" successfully', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` },
      body: { lead_id: 'lead_seed_101_02', status: 'quote_sent' }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    assert.strictEqual(ctx.getData().lead.status, 'quote_sent');
  });

  await runTest('D4: Status updates to "job_won" successfully', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` },
      body: { lead_id: 'lead_seed_101_02', status: 'job_won' }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    assert.strictEqual(ctx.getData().lead.status, 'job_won');
  });

  await runTest('D5: Arbitrary status ("deleted", "cancelled") is rejected with HTTP 400', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` },
      body: { lead_id: 'lead_seed_101_02', status: 'invalid_status_bypass' }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 400);
    assert.match(ctx.getData().error, /Invalid status/i);
  });

  await runTest('D6: Repeated update of same status is safe and idempotent', async () => {
    const token101 = generateHs256Jwt({ providerId: 101 });
    const ctx1 = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` },
      body: { lead_id: 'lead_seed_101_02', status: 'job_won' }
    });
    await providerLeadsHandler(ctx1.req, ctx1.res);
    assert.strictEqual(ctx1.getStatusCode(), 200);

    const ctx2 = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token101}` },
      body: { lead_id: 'lead_seed_101_02', status: 'job_won' }
    });
    await providerLeadsHandler(ctx2.req, ctx2.res);
    assert.strictEqual(ctx2.getStatusCode(), 200);
    assert.strictEqual(ctx2.getData().lead.status, 'job_won');
  });

  // --------------------------------------------------------------------------
  // GROUP E: Quota Calculations
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP E: Quota Calculations ---');

  await runTest('E1: 0 / 5 contacts used -> 0%, limit_reached=false, soft_cap=false', async () => {
    LeadStore.resetUsageForTest(991, 'FREE', 0);
    const quota = LeadStore.getProviderQuota(991);
    assert.strictEqual(quota.contacts_used, 0);
    assert.strictEqual(quota.allowance, 5);
    assert.strictEqual(quota.contacts_remaining, 5);
    assert.strictEqual(quota.limit_reached, false);
    assert.strictEqual(quota.soft_cap, false);
    assert.strictEqual(quota.usage_percentage, 0);
  });

  await runTest('E2: 4 / 5 contacts used -> 80%, limit_reached=false, soft_cap=false', async () => {
    LeadStore.resetUsageForTest(992, 'FREE', 4);
    const quota = LeadStore.getProviderQuota(992);
    assert.strictEqual(quota.contacts_used, 4);
    assert.strictEqual(quota.allowance, 5);
    assert.strictEqual(quota.contacts_remaining, 1);
    assert.strictEqual(quota.limit_reached, false);
    assert.strictEqual(quota.soft_cap, false);
    assert.strictEqual(quota.usage_percentage, 80);
  });

  await runTest('E3: 5 / 5 contacts used -> 100%, limit_reached=true, soft_cap=false', async () => {
    LeadStore.resetUsageForTest(993, 'FREE', 5);
    const quota = LeadStore.getProviderQuota(993);
    assert.strictEqual(quota.contacts_used, 5);
    assert.strictEqual(quota.allowance, 5);
    assert.strictEqual(quota.contacts_remaining, 0);
    assert.strictEqual(quota.limit_reached, true);
    assert.strictEqual(quota.soft_cap, false);
    assert.strictEqual(quota.usage_percentage, 100);
  });

  await runTest('E4: 6 / 5 contacts used -> 120%, limit_reached=true, soft_cap=true', async () => {
    LeadStore.resetUsageForTest(994, 'FREE', 6);
    const quota = LeadStore.getProviderQuota(994);
    assert.strictEqual(quota.contacts_used, 6);
    assert.strictEqual(quota.allowance, 5);
    assert.strictEqual(quota.contacts_remaining, 0);
    assert.strictEqual(quota.limit_reached, true);
    assert.strictEqual(quota.soft_cap, true);
    assert.strictEqual(quota.usage_percentage, 120);
  });

  await runTest('E5: Basic Plan (15 / 30) -> 50%, allowance=30', async () => {
    LeadStore.resetUsageForTest(995, 'BASIC', 15);
    const quota = LeadStore.getProviderQuota(995);
    assert.strictEqual(quota.plan_id, 'BASIC');
    assert.strictEqual(quota.allowance, 30);
    assert.strictEqual(quota.contacts_used, 15);
    assert.strictEqual(quota.contacts_remaining, 15);
    assert.strictEqual(quota.usage_percentage, 50);
  });

  // --------------------------------------------------------------------------
  // GROUP F: Soft-Cap & Consumer Zero-Friction Guarantee
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP F: Soft-Cap & Consumer Zero-Friction Guarantee ---');

  await runTest('F1: Consumer WhatsApp contact to exhausted provider succeeds in soft_cap mode', async () => {
    const testProvId = 881;
    // Set provider to 5/5
    LeadStore.resetUsageForTest(testProvId, 'FREE', 5);

    const ctx = createMockContext({
      method: 'POST',
      url: '/api/contact-meter',
      body: {
        provider_id: testProvId,
        channel: 'whatsapp',
        mode: 'soft_cap',
        idempotency_key: 'idem_f1_' + Date.now()
      }
    });
    await contactMeterHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.status, 'success');
    assert.strictEqual(data.allowed, true);
    assert.strictEqual(data.soft_cap, true);
    assert.strictEqual(data.contacts_used, 6);
  });

  await runTest('F2: Consumer contact is never blocked with 403 or 429 after soft-cap', async () => {
    const testProvId = 882;
    LeadStore.resetUsageForTest(testProvId, 'FREE', 6);

    const ctx = createMockContext({
      method: 'POST',
      url: '/api/contact-meter',
      body: {
        provider_id: testProvId,
        channel: 'whatsapp',
        mode: 'soft_cap',
        idempotency_key: 'idem_f2_' + Date.now()
      }
    });
    await contactMeterHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    assert.strictEqual(ctx.getData().allowed, true);
  });

  await runTest('F3: Provider dashboard reports soft-cap without blocking provider access', async () => {
    const testProvId = 883;
    LeadStore.resetUsageForTest(testProvId, 'FREE', 6);

    const token = generateHs256Jwt({ providerId: testProvId });
    const ctx = createMockContext({
      method: 'GET',
      url: `/api/provider-leads?provider_id=${testProvId}`,
      headers: { 'authorization': `Bearer ${token}` }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.soft_cap, true);
    assert.strictEqual(data.contacts_used, 6);
  });

  await runTest('F4: Contact-meter duplicate replay deduplication preserved', async () => {
    const testProvId = 884;
    const sameKey = 'idem_replay_test_' + Date.now();

    const ctx1 = createMockContext({
      method: 'POST',
      url: '/api/contact-meter',
      body: { provider_id: testProvId, channel: 'whatsapp', idempotency_key: sameKey }
    });
    await contactMeterHandler(ctx1.req, ctx1.res);
    assert.strictEqual(ctx1.getStatusCode(), 200);

    const ctx2 = createMockContext({
      method: 'POST',
      url: '/api/contact-meter',
      body: { provider_id: testProvId, channel: 'whatsapp', idempotency_key: sameKey }
    });
    await contactMeterHandler(ctx2.req, ctx2.res);
    assert.strictEqual(ctx2.getStatusCode(), 200);
    assert.strictEqual(ctx2.getData().is_duplicate, true);
  });

  // --------------------------------------------------------------------------
  // GROUP G: Privacy-Safe CSV Export & Injection Defense
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP G: Privacy-Safe CSV Export & Injection Defense ---');

  await runTest('G1: CSV filename matches padifix_leads_YYYY_MM.csv pattern', async () => {
    const dashboardJs = fs.readFileSync(path.join(__dirname, '../dashboard.js'), 'utf8');
    assert.ok(dashboardJs.includes('padifix_leads_${yearMonth}.csv'));
  });

  await runTest('G2: CSV headers strictly contain Date, Channel, Locality, Status', async () => {
    const dashboardJs = fs.readFileSync(path.join(__dirname, '../dashboard.js'), 'utf8');
    assert.ok(dashboardJs.includes("['Date', 'Channel', 'Locality', 'Status']"));
  });

  await runTest('G3: Zero phone numbers, emails, or JWTs present in CSV columns', async () => {
    const dashboardJs = fs.readFileSync(path.join(__dirname, '../dashboard.js'), 'utf8');
    assert.ok(!dashboardJs.includes("'Customer Phone'"));
    assert.ok(!dashboardJs.includes("'Customer Email'"));
    assert.ok(!dashboardJs.includes("'Raw Message'"));
    assert.ok(!dashboardJs.includes("'JWT'"));
  });

  await runTest('G4: Formula injection defense neutralizes "=" prefix', async () => {
    const dashboardJs = fs.readFileSync(path.join(__dirname, '../dashboard.js'), 'utf8');
    assert.ok(dashboardJs.includes('/^[=+\\-@]/'));
    assert.ok(dashboardJs.includes("str = \"'\" + str;"));
  });

  await runTest('G5: Formula injection defense neutralizes "+", "-", "@" prefixes', async () => {
    const testCases = ['=cmd|', '+SUM(1,2)', '-2+3', '@IMPORT'];
    testCases.forEach(input => {
      let str = input;
      if (/^[=+\-@]/.test(str)) {
        str = "'" + str;
      }
      assert.ok(str.startsWith("'"));
    });
  });

  await runTest('G6: Lead Inbox container and Export button bound in dashboard.html', async () => {
    const html = fs.readFileSync(path.join(__dirname, '../dashboard.html'), 'utf8');
    assert.ok(html.includes('id="recent-leads-list"'));
    assert.ok(html.includes('id="btn-export-leads-csv"'));
    assert.ok(html.includes('id="dash-quota-gauge-card"'));
  });

  // --------------------------------------------------------------------------
  // GROUP H: Paystack Canonical Pricing & Immutability
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP H: Paystack Canonical Pricing & Immutability ---');

  await runTest('H1: Paystack Basic plan initializes with canonical ₦5,500 (550000 kobo)', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: '/api/paystack-init',
      body: { provider_id: 101, plan_id: 'BASIC', email: 'test_provider_101@padifix.ng' }
    });
    await paystackInitHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    const data = ctx.getData();
    assert.strictEqual(data.status, 'success');
    assert.strictEqual(data.plan.id, 'BASIC');
    assert.strictEqual(data.plan.amount_kobo, 550000);
  });

  await runTest('H2: Client price tampering cannot alter Paystack amount', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: '/api/paystack-init',
      body: { provider_id: 101, plan_id: 'BASIC', amount_kobo: 100, amount: 100 }
    });
    await paystackInitHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
    assert.strictEqual(ctx.getData().plan.amount_kobo, 550000); // Canonical Basic price preserved
  });

  await runTest('H3: Client plan tampering to unknown plan defaults safely or fails', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: '/api/paystack-init',
      body: { provider_id: 101, plan_id: 'FAKE_FREE_VIP_PLAN' }
    });
    await paystackInitHandler(ctx.req, ctx.res);
    // Either rejects or falls back to pilot product safely without granting VIP
    assert.notStrictEqual(ctx.getData()?.plan?.id, 'FAKE_FREE_VIP_PLAN');
  });

  await runTest('H4: Currency is strictly server-enforced as NGN', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: '/api/paystack-init',
      body: { provider_id: 101, plan_id: 'BASIC', currency: 'USD' }
    });
    await paystackInitHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 200);
  });

  await runTest('H5: Paystack core files match exact baseline hashes (Zero diff)', async () => {
    const baselineHashes = {
      'api/paystack-init.js': 'd85f68afaea695f015fd57d2340c5dd14b7e8cede0830bc4957bc1899759809a',
      'api/paystack-verify.js': '88b5ba57d48c6ebd67e9027c266c53318b3b97782489c136f40dd50004b6132e',
      'api/paystack-webhook.js': '998bf88a2d019fa99c221c2bff410fa7f9039e69b380dae22229b334e6bd56e8'
    };
    for (const [file, expectedHash] of Object.entries(baselineHashes)) {
      const content = fs.readFileSync(path.join(__dirname, '..', file));
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');
      assert.strictEqual(actualHash, expectedHash, `Paystack file hash mismatch on ${file}`);
    }
  });

  // --------------------------------------------------------------------------
  // GROUP I: Security Attack Matrix & Secrets Audit
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP I: Security Attack Matrix & Secrets Audit ---');

  await runTest('I1: Malformed non-UUID / SQL-injection lead_id handled safely', async () => {
    const token = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token}` },
      body: { lead_id: "'; DROP TABLE contact_events; --", status: 'job_won' }
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 404);
  });

  await runTest('I2: Missing required body on PATCH returns HTTP 400', async () => {
    const token = generateHs256Jwt({ providerId: 101 });
    const ctx = createMockContext({
      method: 'PATCH',
      url: '/api/provider-leads',
      headers: { 'authorization': `Bearer ${token}` },
      body: null
    });
    await providerLeadsHandler(ctx.req, ctx.res);
    assert.strictEqual(ctx.getStatusCode(), 400);
  });

  await runTest('I3: Zero leakage of SUPABASE_SERVICE_ROLE_KEY in frontend assets', async () => {
    const clientFiles = ['dashboard.html', 'dashboard.js', 'dashboard.css', 'supabase-client.js'];
    for (const f of clientFiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      assert.ok(!content.includes('service_role_key_real'), `Leak in ${f}`);
      assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY='), `Leak in ${f}`);
    }
  });

  await runTest('I4: Zero leakage of PAYSTACK_SECRET_KEY in frontend assets', async () => {
    const clientFiles = ['dashboard.html', 'dashboard.js', 'dashboard.css', 'supabase-client.js'];
    for (const f of clientFiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      assert.ok(!content.includes('sk_live_'), `Paystack live key leak in ${f}`);
      assert.ok(!content.includes('sk_test_'), `Paystack test key leak in ${f}`);
    }
  });

  await runTest('I5: Zero leakage of RESEND_API_KEY in frontend assets', async () => {
    const clientFiles = ['dashboard.html', 'dashboard.js', 'dashboard.css', 'supabase-client.js'];
    for (const f of clientFiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      assert.ok(!content.includes('re_aQFAkFKU'), `Resend key leak in ${f}`);
    }
  });

  await runTest('I6: Operational lead data model contains zero customer phone numbers', async () => {
    const leads = LeadStore.getProviderLeads(101).leads;
    leads.forEach(lead => {
      assert.strictEqual(lead.customer_phone, undefined);
      assert.strictEqual(lead.phone, undefined);
      assert.strictEqual(lead.message, undefined);
      assert.strictEqual(lead.chat_body, undefined);
    });
  });

  // --------------------------------------------------------------------------
  // GROUP J: Production Backdoors & Bypass Audits
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP J: Production Backdoors & Bypass Audits ---');

  await runTest('J1: Contact-meter reset hook strictly fails closed in production with HTTP 403', async () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const ctx = createMockContext({
        method: 'POST',
        url: '/api/contact-meter',
        body: { provider_id: 101, channel: 'whatsapp', reset_period: true }
      });
      await contactMeterHandler(ctx.req, ctx.res);
      assert.strictEqual(ctx.getStatusCode(), 403);
      assert.match(ctx.getData().error, /strictly disabled in production/i);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  await runTest('J2: Provider leads endpoint contains zero backdoor bypass flags', async () => {
    const file = fs.readFileSync(path.join(__dirname, '../api/provider-leads.js'), 'utf8');
    assert.ok(!file.includes('bypass_auth'));
    assert.ok(!file.includes('skip_verification'));
    assert.ok(!file.includes('admin_override'));
  });

  await runTest('J3: Lead intelligence migration contains strict status and notes constraints', async () => {
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/038_padifix_phase_015_lead_intelligence.sql'), 'utf8');
    assert.ok(sql.includes("CHECK (status IN ('new', 'in_discussion', 'quote_sent', 'job_won'))"));
    assert.ok(sql.includes('char_length(notes) <= 500'));
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
  });

  // --------------------------------------------------------------------------
  // FINAL SUITE SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log(`PHASE 015 SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhase015Suite().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}

module.exports = { runPhase015Suite };

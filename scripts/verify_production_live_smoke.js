/**
 * PADIFIX: PRODUCTION DEPLOYMENT LIVE SMOKE CHECK
 * scripts/verify_production_live_smoke.js
 * 
 * Verifies that all deployed routes, assets, APIs, and database persistence
 * are operational on https://padifix.vercel.app
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Safely load local .env without printing values
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

const PROD_URL = 'https://padifix.vercel.app';
const SUPABASE_URL = 'https://hvxosxhnxauiqrhpyuur.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';

let passCount = 0;
let failCount = 0;

function check(label, condition, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${label}`);
    if (details) console.log(`     ↳ ${details}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${label}`);
    if (details) console.error(`     ↳ ${details}`);
    failCount++;
  }
}

async function runLiveSmoke() {
  console.log('='.repeat(80));
  console.log('🚀 PADIFIX PRODUCTION DEPLOYMENT LIVE SMOKE AUDIT');
  console.log(`🌐 Production Gateway: ${PROD_URL}`);
  console.log('='.repeat(80));

  // 1. Inspect Vercel Production Deployment Headers
  console.log('\n--- 1. DEPLOYMENT & EDGE HEADER INSPECTION ---');
  const headRes = await fetch(PROD_URL, { method: 'HEAD' });
  check('1.1 Edge gateway returns HTTP 200 OK', headRes.status === 200, `Status: ${headRes.status}`);
  const vercelId = headRes.headers.get('x-vercel-id') || '';
  check('1.2 Active Vercel Deployment ID present', Boolean(vercelId), `Deployment ID: ${vercelId}`);
  const hsts = headRes.headers.get('strict-transport-security') || '';
  check('1.3 Security header: Strict-Transport-Security enforced', Boolean(hsts), `HSTS: ${hsts}`);

  // 2. Core Frontend User Entrypoints
  console.log('\n--- 2. CORE FRONTEND ENTRYPOINTS ---');
  const pages = [
    { url: `${PROD_URL}/`, name: 'Home Landing Page', expectTag: '<title>PadiFix' },
    { url: `${PROD_URL}/search.html`, name: 'Search Directory', expectTag: 'search' },
    { url: `${PROD_URL}/profile.html?id=8`, name: 'Artisan Profile Page', expectTag: 'profile' },
    { url: `${PROD_URL}/dashboard.html`, name: 'Provider Dashboard Page', expectTag: 'dashboard' },
    { url: `${PROD_URL}/admin.html`, name: 'Admin Compliance Portal', expectTag: 'admin' },
    { url: `${PROD_URL}/manifest.json`, name: 'PWA Web App Manifest', expectTag: '"short_name": "PadiFix"' }
  ];

  for (const page of pages) {
    const res = await fetch(page.url, { headers: { 'Cache-Control': 'no-cache' } });
    const text = await res.text();
    check(
      `2.${pages.indexOf(page) + 1} ${page.name} loads with HTTP 200`,
      res.status === 200 && text.toLowerCase().includes(page.expectTag.toLowerCase()),
      `URL: ${page.url} (${text.length} bytes)`
    );
  }

  // 3. API Routing & Security Boundaries
  console.log('\n--- 3. API ROUTING & SECURITY BOUNDARIES ---');
  
  // Unauthenticated admin access must be rejected with HTTP 401
  const adminRes = await fetch(`${PROD_URL}/api/admin-compliance?action=get_queues`, {
    headers: { 'Cache-Control': 'no-cache' }
  });
  check('3.1 /api/admin-compliance rejects unauthenticated access with HTTP 401', adminRes.status === 401, `Status: ${adminRes.status}`);

  // Unauthenticated provider leads must be rejected with HTTP 401
  const leadsRes = await fetch(`${PROD_URL}/api/provider-leads?provider_id=8`, {
    headers: { 'Cache-Control': 'no-cache' }
  });
  check('3.2 /api/provider-leads rejects unauthenticated access with HTTP 401', leadsRes.status === 401, `Status: ${leadsRes.status}`);

  // Paystack initialization rejects invalid payload safely
  const paystackRes = await fetch(`${PROD_URL}/api/paystack-init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'smoke_test@padifix.ng', plan_id: 'basic' })
  });
  check('3.3 /api/paystack-init responds cleanly without 500 error', paystackRes.status === 200 || paystackRes.status === 400, `Status: ${paystackRes.status}`);

  // 4. Live Consumer Contact & Database Persistence Probe
  console.log('\n--- 4. LIVE CONTACT-METER & DATABASE PERSISTENCE ---');
  const smokeKey = `smoke_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const meterRes = await fetch(`${PROD_URL}/api/contact-meter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider_id: 101,
      channel: 'whatsapp',
      idempotency_key: smokeKey,
      locality: 'Ikeja, Lagos',
      intent_tag: 'Smoke Audit Probe'
    })
  });
  const meterData = await meterRes.json();
  check('4.1 Live POST /api/contact-meter succeeds with HTTP 200', meterRes.status === 200 && meterData.status === 'success', `Status: ${meterRes.status}, data: ${JSON.stringify(meterData)}`);

  // Direct Supabase PostgREST check for verified test Provider 101
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'tester.nonadmin.padifix@outlook.com', password: process.env.TEST_PROVIDER_B_PASSWORD || '' })
  });
  const authData = await authRes.json();
  if (authData.access_token) {
    const dbCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?idempotency_key=eq.${smokeKey}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${authData.access_token}`
      }
    });
    const dbRows = await dbCheckRes.json();
    check('4.2 Persisted row retrieved from Supabase PostgreSQL public.contact_events', Array.isArray(dbRows) && dbRows.length === 1, `Found ${dbRows.length} row(s) in database (ID: ${dbRows[0] ? dbRows[0].id : 'none'})`);
  } else {
    check('4.2 Test provider authentication for DB verification', false, 'Could not authenticate test provider');
  }

  console.log('\n' + '='.repeat(80));
  console.log(`SMOKE AUDIT SUMMARY: ${passCount} passed, ${failCount} failed`);
  if (failCount === 0) {
    console.log('🌟 PRODUCTION STATUS: 100% OPERATIONAL & LIVE');
  } else {
    console.log('⚠️ PRODUCTION STATUS: ISSUES DETECTED');
  }
  console.log('='.repeat(80));

  assert.strictEqual(failCount, 0, `${failCount} checks failed during live smoke test.`);
}

runLiveSmoke().catch(err => {
  console.error('Smoke audit error:', err.message);
  process.exit(1);
});

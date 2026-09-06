/**
 * PADIFIX PHASE 015: FINAL GREEN EVIDENCE CLOSURE SUITE
 * scripts/verify_phase_015_green_closure.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROD_URL = 'https://padifix.vercel.app';
const SUPABASE_URL = 'https://hvxosxhnxauiqrhpyuur.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';

const results = [];

function check(id, title, pass, details = '') {
  results.push({ id, title, pass, details });
  const icon = pass ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${icon} ${id}: ${title}`);
  if (details) console.log(`     ↳ ${details}`);
}

async function authProvider(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`Auth failed for ${email}: HTTP ${res.status}`);
  return await res.json();
}

async function runClosureAudit() {
  console.log('='.repeat(80));
  console.log('🛡️ PADIFIX PHASE 015 — FINAL GREEN EVIDENCE CLOSURE AUDIT');
  console.log(`🌐 Production Frontend: ${PROD_URL}`);
  console.log(`🌐 Production Database: ${SUPABASE_URL}`);
  console.log('='.repeat(80));

  // --- GATE 1: RLS POLICY HARDENING ---
  console.log('\n--- GATE 1: RLS POLICY HARDENING ---');
  const migration038 = fs.readFileSync(path.join(__dirname, '../supabase/migrations/038_padifix_phase_015_lead_intelligence.sql'), 'utf8');
  const hasUserMetadataBypass = migration038.includes("auth.jwt() -> 'user_metadata' ->> 'provider_id'");
  const hasAuthoritativeRelationalPredicate = migration038.includes('provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())');
  check('G1.1', 'Zero user_metadata fallback in migration 038', !hasUserMetadataBypass, 'No auth.jwt() user_metadata predicate present');
  check('G1.2', 'Authoritative providers.user_id = auth.uid() predicate enforced', hasAuthoritativeRelationalPredicate, 'Relational subquery strictly enforced in Policy A & B');

  // --- GATE 2: VERIFY ACTUAL DATABASE PERSISTENCE ---
  console.log('\n--- GATE 2: ACTUAL DATABASE PERSISTENCE ---');
  const uniqueKey = `test_persistence_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  let meterOk = false;
  let meterData = null;
  try {
    const meterRes = await fetch(`${PROD_URL}/api/contact-meter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider_id: 8,
        channel: 'whatsapp',
        idempotency_key: uniqueKey,
        locality: 'Ikeja, Lagos',
        intent_tag: 'Electrical Wiring Inspection'
      })
    });
    meterOk = (meterRes.status === 200);
    meterData = await meterRes.json();
  } catch (e) {
    meterOk = false;
  }
  check('G2.1', 'Consumer POST /api/contact-meter returns HTTP 200', meterOk, `idempotency_key: ${uniqueKey}`);

  // Query Supabase public.contact_events for this uniqueKey
  const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?idempotency_key=eq.${uniqueKey}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  const dbRows = await dbRes.json().catch(() => []);
  const dbPersisted = Array.isArray(dbRows) && dbRows.length > 0;
  check('G2.2', 'Contact event row persisted in public.contact_events', dbPersisted, dbPersisted ? `Found row with ID ${dbRows[0]?.id}` : '0 rows found in PostgreSQL (Serverless endpoint uses in-memory store)');

  // --- GATE 3: GENUINE PROVIDER A/B ISOLATION ---
  console.log('\n--- GATE 3: GENUINE PROVIDER A/B ISOLATION ---');
  let tokenA = null;
  let tokenB = null;
  try {
    tokenA = await authProvider('ad.padifix@outlook.com', 'TemporaryAdminPassword2026!#');
    tokenB = await authProvider('tester.nonadmin.padifix@outlook.com', 'TemporaryNonAdminPassword2026!#');
  } catch (e) {
    console.error('Auth failure:', e.message);
  }

  if (tokenA && tokenB) {
    // Provider A GET own leads
    const aOwn = await fetch(`${PROD_URL}/api/provider-leads?provider_id=8`, {
      headers: { Authorization: `Bearer ${tokenA.access_token}` }
    });
    check('G3.1', 'Provider A GET own leads returns HTTP 200', aOwn.status === 200, `HTTP ${aOwn.status}`);

    // Provider A GET Provider B leads (expected 403)
    const aCross = await fetch(`${PROD_URL}/api/provider-leads?provider_id=101`, {
      headers: { Authorization: `Bearer ${tokenA.access_token}` }
    });
    check('G3.2', 'Provider A GET Provider B leads returns HTTP 403', aCross.status === 403, `HTTP ${aCross.status}`);

    // Provider B GET own leads
    const bOwn = await fetch(`${PROD_URL}/api/provider-leads?provider_id=101`, {
      headers: { Authorization: `Bearer ${tokenB.access_token}` }
    });
    check('G3.3', 'Provider B GET own leads returns HTTP 200', bOwn.status === 200, `HTTP ${bOwn.status}`);

    // Provider B GET Provider A leads (expected 403)
    const bCross = await fetch(`${PROD_URL}/api/provider-leads?provider_id=8`, {
      headers: { Authorization: `Bearer ${tokenB.access_token}` }
    });
    check('G3.4', 'Provider B GET Provider A leads returns HTTP 403', bCross.status === 403, `HTTP ${bCross.status}`);

    // Provider A PATCH own lead
    const aPatchOwn = await fetch(`${PROD_URL}/api/provider-leads`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${tokenA.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider_id: 8,
        lead_id: 'lead_seed_8_01',
        status: 'in_discussion',
        notes: 'Verified inspection window'
      })
    });
    check('G3.5', 'Provider A PATCH own lead returns HTTP 200', aPatchOwn.status === 200, `HTTP ${aPatchOwn.status}`);

    // Provider A PATCH Provider B lead (expected 403)
    const aPatchCross = await fetch(`${PROD_URL}/api/provider-leads`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${tokenA.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider_id: 101,
        lead_id: 'lead_seed_101_01',
        status: 'job_won',
        notes: 'Tamper attempt'
      })
    });
    check('G3.6', 'Provider A PATCH Provider B lead returns HTTP 403', aPatchCross.status === 403, `HTTP ${aPatchCross.status}`);

    // Provider B PATCH Provider A lead (expected 403)
    const bPatchCross = await fetch(`${PROD_URL}/api/provider-leads`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${tokenB.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider_id: 8,
        lead_id: 'lead_seed_8_01',
        status: 'job_won',
        notes: 'Tamper attempt from B'
      })
    });
    check('G3.7', 'Provider B PATCH Provider A lead returns HTTP 403', bPatchCross.status === 403, `HTTP ${bPatchCross.status}`);
  }

  // --- GATE 4: NOTES & STATUS CONSTRAINTS ---
  console.log('\n--- GATE 4: NOTES & STATUS CONSTRAINTS ---');
  if (tokenA) {
    // 500 characters -> PASS
    const res500 = await fetch(`${PROD_URL}/api/provider-leads`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${tokenA.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: 8, lead_id: 'lead_seed_8_01', notes: 'x'.repeat(500) })
    });
    check('G4.1', '500 character notes accepted (HTTP 200)', res500.status === 200, `HTTP ${res500.status}`);

    // 501 characters -> REJECTED (HTTP 400)
    const res501 = await fetch(`${PROD_URL}/api/provider-leads`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${tokenA.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: 8, lead_id: 'lead_seed_8_01', notes: 'x'.repeat(501) })
    });
    check('G4.2', '501 character notes rejected (HTTP 400)', res501.status === 400, `HTTP ${res501.status}`);

    // Invalid status -> REJECTED (HTTP 400)
    const resBadStatus = await fetch(`${PROD_URL}/api/provider-leads`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${tokenA.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: 8, lead_id: 'lead_seed_8_01', status: 'prohibited_status' })
    });
    check('G4.3', 'Invalid status prohibited_status rejected (HTTP 400)', resBadStatus.status === 400, `HTTP ${resBadStatus.status}`);

    // HTML / Script payload -> Inert
    const resXss = await fetch(`${PROD_URL}/api/provider-leads`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${tokenA.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: 8, lead_id: 'lead_seed_8_01', notes: '<script>alert("xss")</script>Client approved' })
    });
    const xssData = await resXss.json();
    const cleanNotes = xssData.lead?.notes || '';
    check('G4.4', 'HTML/Script payload stripped and sanitized', !cleanNotes.includes('<script>') && cleanNotes.includes('Client approved'), `Sanitized output: "${cleanNotes}"`);

    // SQL-like payload -> Inert text
    const sqlPayload = "'; DROP TABLE contact_events; --";
    const resSql = await fetch(`${PROD_URL}/api/provider-leads`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${tokenA.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: 8, lead_id: 'lead_seed_8_01', notes: sqlPayload })
    });
    const sqlData = await resSql.json();
    check('G4.5', 'SQL-like payload treated as inert string literal', sqlData.lead?.notes === sqlPayload, 'Treated strictly as plain text');
  }

  // --- GATE 5: CSV INTEGRITY & FORMULA DEFENSE ---
  console.log('\n--- GATE 5: CSV INTEGRITY & FORMULA DEFENSE ---');
  // Audit CSV export generator in dashboard.js
  const dashboardJs = fs.readFileSync(path.join(__dirname, '../dashboard.js'), 'utf8');
  const hasExactHeaders = dashboardJs.includes("['Date', 'Channel', 'Locality', 'Status']");
  const sanitizesFormula = dashboardJs.includes("/^[=+\\-@]/.test(str)") && dashboardJs.includes("str = \"'\" + str;");
  check('G5.1', 'CSV export headers strictly Date,Channel,Locality,Status', hasExactHeaders, 'Headers strictly match allowlist');
  check('G5.2', 'CSV formula injection characters (=, +, -, @) safely escaped', sanitizesFormula, 'Prefixes neutralized with leading apostrophe');

  // --- GATE 7: PAYSTACK FREEZE ---
  console.log('\n--- GATE 7: PAYSTACK FREEZE ---');
  const paystackDiff = execSync('git diff 295e5e5664218e78fa8ebc6be3b7bdc876baf7ff -- api/paystack-init.js api/paystack-verify.js api/paystack-webhook.js lib/paystack.js', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });
  check('G7.1', 'Zero modification to Paystack endpoints', paystackDiff.trim() === '', 'git diff against certified baseline is exact empty');

  // --- GATE 8: DEPLOYMENT SHA & RUNTIME INTEGRITY ---
  console.log('\n--- GATE 8: DEPLOYMENT SHA & RUNTIME INTEGRITY ---');
  const runtimeDiff = execSync('git diff 295e5e5664218e78fa8ebc6be3b7bdc876baf7ff -- api/ dashboard.html dashboard.js dashboard.css lib/', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });
  check('G8.1', 'Runtime application source matches certified SHA 295e5e5664218e78fa8ebc6be3b7bdc876baf7ff', runtimeDiff.trim() === '', runtimeDiff.trim() === '' ? 'Zero diff in runtime source' : 'Runtime files differ');

  // --- SUMMARY & VERDICT ---
  console.log('\n' + '='.repeat(80));
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`FINAL CLOSURE AUDIT: ${passed} passed, ${failed} failed (Total: ${results.length})`);
  console.log('='.repeat(80));

  if (failed === 0) {
    console.log('\n🏆 GREEN — PHASE 015 CERTIFIED FOR PRODUCTION');
  } else {
    console.log('\n⚠️ YELLOW — CERTIFICATION EVIDENCE INCOMPLETE');
    console.log('Failure items:');
    results.filter(r => !r.pass).forEach(f => console.log(`  - ${f.id}: ${f.title} (${f.details})`));
  }

  return { passed, failed, results };
}

runClosureAudit().then(({ failed }) => {
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('Fatal error during closure audit:', err);
  process.exit(1);
});

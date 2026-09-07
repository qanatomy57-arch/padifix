/**
 * PADIFIX PHASE 015: GATE 7 FINAL PRODUCTION PERSISTENCE PROOF
 * scripts/verify_phase_015_gate7_production_persistence.js
 *
 * Exhaustively proves the complete end-to-end production flow:
 * Consumer -> /api/contact-meter -> PostgreSQL contact_events -> /api/provider-leads -> Authenticated Provider A Dashboard
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
let passA = process.env.TEST_PROVIDER_A_PASSWORD || '';
let passB = process.env.TEST_PROVIDER_B_PASSWORD || '';
for (const l of env) {
  if (l.startsWith('TEST_PROVIDER_A_PASSWORD=')) passA = l.substring(l.indexOf('=') + 1).trim();
  if (l.startsWith('TEST_PROVIDER_B_PASSWORD=')) passB = l.substring(l.indexOf('=') + 1).trim();
}

const PROD_URL = process.env.PROD_URL || 'https://padifix.vercel.app';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvxosxhnxauiqrhpyuur.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';

async function authProvider(email, pass) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  if (!res.ok) throw new Error('Auth failed for ' + email + ': HTTP ' + res.status);
  return await res.json();
}

async function run() {
  console.log('='.repeat(80));
  console.log('🚀 PADIFIX GATE 7: FINAL PRODUCTION PERSISTENCE PROOF');
  console.log('🌐 Target Production Gateway: ' + PROD_URL);
  console.log('🌐 Authoritative PostgreSQL: ' + SUPABASE_URL);
  console.log('='.repeat(80));

  const authA = await authProvider('ad.padifix@outlook.com', passA);
  const tokenA = authA.access_token;
  const authB = await authProvider('tester.nonadmin.padifix@outlook.com', passB);
  const tokenB = authB.access_token;
  console.log('✅ Authenticated test sessions established for Provider A and Provider B');

  // Step 1: Fresh consumer contact with newly generated UUID idempotency key
  const freshIdempotencyKey = 'idem_gate7_' + Date.now() + '_' + crypto.randomUUID();
  console.log('\n--- 1. CONSUMER INITIATION VIA PRODUCTION GATEWAY ---');
  console.log('Generated fresh idempotency key:', freshIdempotencyKey);

  const meterRes = await fetch(PROD_URL + '/api/contact-meter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider_id: 8,
      channel: 'whatsapp',
      idempotency_key: freshIdempotencyKey,
      locality: 'Victoria Island, Lagos',
      intent_tag: 'Gate 7 Production Persistence Proof'
    })
  });
  assert.strictEqual(meterRes.status, 200, 'Consumer contact-meter should return HTTP 200');
  const meterData = await meterRes.json();
  assert.strictEqual(meterData.status, 'success', 'Response status should be success');
  console.log('  ✅ [PASS] POST /api/contact-meter succeeded (HTTP 200, status: success)');

  // Step 2: Query PostgreSQL contact_events via Provider A (Authenticated owner)
  console.log('\n--- 2. POSTGRESQL CONTACT_EVENTS DIRECT RLS VERIFICATION ---');
  const pgResA = await fetch(SUPABASE_URL + '/rest/v1/contact_events?idempotency_key=eq.' + encodeURIComponent(freshIdempotencyKey), {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + tokenA
    }
  });
  assert.strictEqual(pgResA.status, 200);
  const pgRowsA = await pgResA.json();
  console.log('  ✅ [PASS] Provider A direct PostgreSQL query returned exactly ' + pgRowsA.length + ' row(s)');
  assert.strictEqual(pgRowsA.length, 1, 'Exactly one row must be persisted in PostgreSQL');
  const leadRow = pgRowsA[0];
  console.log('     ↳ Persisted Row ID:', leadRow.id, 'provider_id:', leadRow.provider_id, 'status:', leadRow.status);
  assert.strictEqual(Number(leadRow.provider_id), 8);
  assert.strictEqual(leadRow.status, 'new');

  // Step 3: Verify Cross-Tenant Isolation in PostgreSQL (Provider B must see ZERO rows)
  const pgResB = await fetch(SUPABASE_URL + '/rest/v1/contact_events?idempotency_key=eq.' + encodeURIComponent(freshIdempotencyKey), {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + tokenB
    }
  });
  assert.strictEqual(pgResB.status, 200);
  const pgRowsB = await pgResB.json();
  console.log('  ✅ [PASS] Cross-Tenant Isolation: Provider B direct PostgreSQL query returned ' + pgRowsB.length + ' row(s) (Zero leak)');
  assert.strictEqual(pgRowsB.length, 0, 'Provider B must NOT have visibility over Provider A\'s contact event');

  // Step 4: Verify visibility via Production Provider Leads API
  console.log('\n--- 3. PRODUCTION API /api/provider-leads VERIFICATION ---');
  const apiLeadsA = await fetch(PROD_URL + '/api/provider-leads?provider_id=8', {
    headers: { 'Authorization': 'Bearer ' + tokenA }
  });
  assert.strictEqual(apiLeadsA.status, 200);
  const leadsDataA = await apiLeadsA.json();
  const matchingLeadInA = (leadsDataA.leads || []).find(l => l.id === leadRow.id);
  console.log('  ✅ [PASS] Lead is visible in authenticated Provider A dashboard inbox');
  assert.ok(matchingLeadInA != null, 'Lead must be present in Provider A API response');

  // Step 5: Verify Provider B cannot query Provider A leads via API
  const apiLeadsB = await fetch(PROD_URL + '/api/provider-leads?provider_id=8', {
    headers: { 'Authorization': 'Bearer ' + tokenB }
  });
  console.log('  ✅ [PASS] Provider B unauthorized API query to Provider 8 leads strictly blocked (HTTP ' + apiLeadsB.status + ')');
  assert.strictEqual(apiLeadsB.status, 403, 'Cross-tenant API access must return HTTP 403');

  // Step 6: Mutate Lead Status and Notes via PATCH /api/provider-leads
  console.log('\n--- 4. WORKFLOW MUTATION & PERSISTENCE (STATUS & NOTES) ---');
  const patchRes = await fetch(PROD_URL + '/api/provider-leads', {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + tokenA,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      lead_id: leadRow.id,
      status: 'in_discussion',
      notes: 'Customer contacted via WhatsApp. Inspection scheduled for 2 PM.'
    })
  });
  assert.strictEqual(patchRes.status, 200, 'PATCH should return HTTP 200');
  const patchData = await patchRes.json();
  assert.strictEqual(patchData.status, 'success');
  console.log('  ✅ [PASS] Status and private notes mutation accepted via PATCH /api/provider-leads');

  // Step 7: Verify mutations persisted directly in PostgreSQL
  const pgVerifyRes = await fetch(SUPABASE_URL + '/rest/v1/contact_events?id=eq.' + leadRow.id, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + tokenA
    }
  });
  const pgVerifyRows = await pgVerifyRes.json();
  assert.strictEqual(pgVerifyRows.length, 1);
  const updatedRow = pgVerifyRows[0];
  console.log('  ✅ [PASS] Mutated status persisted in PostgreSQL: \'' + updatedRow.status + '\'');
  assert.strictEqual(updatedRow.status, 'in_discussion');
  console.log('  ✅ [PASS] Mutated notes persisted in PostgreSQL: \'' + updatedRow.notes + '\'');
  assert.strictEqual(updatedRow.notes, 'Customer contacted via WhatsApp. Inspection scheduled for 2 PM.');

  // Step 8: Duplicate Replay Verification
  console.log('\n--- 5. DURABLE IDEMPOTENCY REPLAY PROOF ---');
  const replayRes = await fetch(PROD_URL + '/api/contact-meter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider_id: 8,
      channel: 'whatsapp',
      idempotency_key: freshIdempotencyKey,
      locality: 'Victoria Island, Lagos',
      intent_tag: 'Gate 7 Production Persistence Proof'
    })
  });
  assert.strictEqual(replayRes.status, 200, 'Duplicate replay must return HTTP 200');
  const replayData = await replayRes.json();
  console.log('  ✅ [PASS] Duplicate replay returned HTTP 200 with is_duplicate: ' + replayData.is_duplicate + ', idempotent: ' + replayData.idempotent);
  assert.strictEqual(replayData.is_duplicate, true);
  assert.strictEqual(replayData.idempotent, true);

  // Step 9: Verify exactly ONE row remains in PostgreSQL after replay
  const pgCountRes = await fetch(SUPABASE_URL + '/rest/v1/contact_events?idempotency_key=eq.' + encodeURIComponent(freshIdempotencyKey), {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + tokenA
    }
  });
  const pgCountRows = await pgCountRes.json();
  console.log('  ✅ [PASS] Duplicate replay did NOT create second row in PostgreSQL (COUNT = ' + pgCountRows.length + ')');
  assert.strictEqual(pgCountRows.length, 1, 'PostgreSQL row count must remain exactly 1 after replay');

  console.log('\n' + '='.repeat(80));
  console.log('🏆 GATE 7 EMPIRICALLY CONFIRMED: 100% PRODUCTION PERSISTENCE PASS');
  console.log('='.repeat(80));
}

run().catch(e => {
  console.error('Gate 7 failure:', e);
  process.exit(1);
});

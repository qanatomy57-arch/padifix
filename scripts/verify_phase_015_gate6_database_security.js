/**
 * PADIFIX PHASE 015: GATE 6 FINAL DATABASE SECURITY AUDIT
 * scripts/verify_phase_015_gate6_database_security.js
 *
 * Verifies:
 * 1. Authenticated provider has UPDATE privilege ONLY over (status, notes, updated_at).
 * 2. Attempted mutation of unauthorized columns fails (provider_id, idempotency_key, channel, created_at, customer_fingerprint_hash, session_token).
 * 3. Provider API never returns sensitive columns (customer_fingerprint_hash, session_token, customer phone, raw WhatsApp message, JWT, password).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
let passA = process.env.TEST_PROVIDER_A_PASSWORD || '';
for (const l of env) {
  if (l.startsWith('TEST_PROVIDER_A_PASSWORD=')) passA = l.substring(l.indexOf('=') + 1).trim();
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvxosxhnxauiqrhpyuur.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';
const PROD_URL = process.env.PROD_URL || 'https://padifix.vercel.app';

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
  console.log('🛡️ PADIFIX GATE 6: FINAL DATABASE SECURITY CHECK');
  console.log('='.repeat(80));

  const authA = await authProvider('ad.padifix@outlook.com', passA);
  const tokenA = authA.access_token;
  console.log('✅ Provider A authenticated');

  // Insert a fresh contact event for Provider 8 so we have a known ID
  const testKey = 'sec_audit_gate6_' + Date.now();
  const insertRes = await fetch(SUPABASE_URL + '/rest/v1/contact_events', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + tokenA,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      provider_id: 8,
      channel: 'whatsapp',
      idempotency_key: testKey,
      status: 'new',
      locality: 'Yaba, Lagos',
      intent_tag: 'Security Gate Test'
    })
  });
  const inserted = await insertRes.json();
  const eventId = inserted[0].id;
  console.log('✅ Prepared test lead ID:', eventId);

  // 1. Test unauthorized column modifications
  const unauthorizedColumns = [
    { col: 'provider_id', val: 999 },
    { col: 'idempotency_key', val: 'hacked_key_' + Date.now() },
    { col: 'channel', val: 'call' },
    { col: 'created_at', val: '2020-01-01T00:00:00Z' },
    { col: 'customer_fingerprint_hash', val: 'spoofed_hash' },
    { col: 'session_token', val: 'spoofed_session' }
  ];

  for (const { col, val } of unauthorizedColumns) {
    const patchRes = await fetch(SUPABASE_URL + '/rest/v1/contact_events?id=eq.' + eventId, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + tokenA,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ [col]: val })
    });
    const body = await patchRes.json().catch(() => ({}));
    const isBlocked = patchRes.status >= 400 || (body && body.code === '42501');
    console.log('  ' + (isBlocked ? '✅ [PASS]' : '❌ [FAIL]') + ' Direct mutation of column \'' + col + '\' blocked (HTTP ' + patchRes.status + ', code: ' + (body.code || 'N/A') + ')');
    assert.ok(isBlocked, 'Column ' + col + ' should be blocked from unauthorized update');
  }

  // 2. Test authorized column modifications: status, notes, updated_at
  const allowedPatchRes = await fetch(SUPABASE_URL + '/rest/v1/contact_events?id=eq.' + eventId, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + tokenA,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      status: 'in_discussion',
      notes: 'Safe notes update for Gate 6',
      updated_at: new Date().toISOString()
    })
  });
  const allowedBody = await allowedPatchRes.json().catch(() => []);
  const patchSuccess = allowedPatchRes.status === 200 && Array.isArray(allowedBody) && allowedBody.length > 0;
  console.log('  ' + (patchSuccess ? '✅ [PASS]' : '❌ [FAIL]') + ' Authorized columns (status, notes, updated_at) updated successfully (HTTP ' + allowedPatchRes.status + ')');
  assert.ok(patchSuccess, 'Authorized columns update failed');

  // 3. Confirm provider API never returns sensitive columns
  const leadsRes = await fetch(PROD_URL + '/api/provider-leads?provider_id=8', {
    headers: {
      'Authorization': 'Bearer ' + tokenA
    }
  });
  const leadsData = await leadsRes.json();
  assert.strictEqual(leadsRes.status, 200);
  console.log('✅ Provider API returned leads array, length:', leadsData.leads ? leadsData.leads.length : 0);

  const sensitiveFields = [
    'customer_fingerprint_hash',
    'session_token',
    'customer_phone',
    'phone',
    'raw_message',
    'message',
    'jwt',
    'password'
  ];

  let leakFound = false;
  for (const lead of (leadsData.leads || [])) {
    for (const f of sensitiveFields) {
      if (lead[f] !== undefined) {
        console.error('❌ LEAK DETECTED: Sensitive field present in lead:', f);
        leakFound = true;
      }
    }
  }
  console.log('  ' + (!leakFound ? '✅ [PASS]' : '❌ [FAIL]') + ' Provider API returns ZERO sensitive columns (customer_fingerprint_hash, session_token, customer phone, raw WhatsApp message, JWT, password)');
  assert.strictEqual(leakFound, false, 'Sensitive fields leaked in API!');

  console.log('='.repeat(80));
  console.log('🏆 GATE 6 EMPIRICALLY CONFIRMED: 100% PASS');
  console.log('='.repeat(80));
}

run().catch(e => { console.error('Gate 6 failure:', e); process.exit(1); });

/**
 * PADIFIX PHASE 015: PRODUCTION DATABASE & RLS VERIFICATION (DIRECTIVES 3 & 4)
 * Target: https://hvxosxhnxauiqrhpyuur.supabase.co
 */

const assert = require('assert');

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

async function authProvider(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`Auth failed for ${email}: ${res.status}`);
  return await res.json();
}

async function runDatabaseVerification() {
  console.log('================================================================================');
  console.log('🛡️ PADIFIX PHASE 015: PRODUCTION SUPABASE DATABASE VERIFICATION');
  console.log(`🌐 Target: ${SUPABASE_URL}`);
  console.log('================================================================================\n');

  // 1. Table & Column Existence
  console.log('--- 1. TABLE & COLUMN EXISTENCE (DIRECTIVE 3) ---');
  const cols = ['id', 'provider_id', 'channel', 'idempotency_key', 'billing_period', 'session_token', 'customer_fingerprint_hash', 'locality', 'status', 'intent_tag', 'notes', 'created_at', 'updated_at'];
  const probeRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?select=${cols.join(',')}&limit=1`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
  });
  check('1.1 public.contact_events exists in schema cache', probeRes.status === 200, `HTTP ${probeRes.status}`);
  check('1.2 All 13 canonical columns exist and are queryable', probeRes.status === 200, `Selected: ${cols.join(', ')}`);

  // 2. Constraints Enforcement
  console.log('\n--- 2. CONSTRAINTS ENFORCEMENT AT DATABASE LEVEL ---');
  // 2.1 Append-only valid insert
  const validKey = `test_live_verify_${Date.now()}`;
  const validInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      provider_id: 8,
      channel: 'whatsapp',
      idempotency_key: validKey,
      locality: 'Ikeja, Lagos',
      status: 'new',
      intent_tag: 'Electrical Wiring Inspection',
      notes: 'Initial operational inquiry'
    })
  });
  check('2.1 Append-only valid contact event inserted successfully (Policy C)', validInsertRes.status === 201 || validInsertRes.status === 200, `HTTP ${validInsertRes.status}`);

  // 2.2 Notes length constraint check (> 500 chars)
  const badNotesRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      provider_id: 8,
      channel: 'whatsapp',
      idempotency_key: `test_bad_notes_${Date.now()}`,
      status: 'new',
      notes: 'A'.repeat(501)
    })
  });
  const badNotesBody = await badNotesRes.json().catch(() => ({}));
  check('2.2 Notes > 500 chars rejected by PostgreSQL check constraint (chk_contact_events_notes_length)', badNotesRes.status === 400, `HTTP ${badNotesRes.status}, code: ${badNotesBody?.code}, message: ${badNotesBody?.message}`);

  // 3. Database-Level Multi-Tenant RLS Isolation (Directive 4)
  console.log('\n--- 3. DATABASE-LEVEL RLS TENANT ISOLATION (DIRECTIVE 4) ---');
  const tokenA = await authProvider('ad.padifix@outlook.com', 'TemporaryAdminPassword2026!#');
  const tokenB = await authProvider('tester.nonadmin.padifix@outlook.com', 'TemporaryNonAdminPassword2026!#');

  // 2.3 Status vocabulary check on UPDATE via authenticated provider
  const badStatusRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?provider_id=eq.8&limit=1`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${tokenA.access_token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      status: 'prohibited_status'
    })
  });
  const badStatusBody = await badStatusRes.json().catch(() => ({}));
  check('2.3 Invalid status rejected by PostgreSQL check constraint (chk_contact_events_status)', badStatusRes.status === 400, `HTTP ${badStatusRes.status}, code: ${badStatusBody?.code}, message: ${badStatusBody?.message}`);

  // 3.1 Provider A selects own records
  const selectOwnRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?provider_id=eq.8`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${tokenA.access_token}`
    }
  });
  const selectOwnData = await selectOwnRes.json().catch(() => []);
  check('3.1 Provider A can SELECT own contact events via PostgREST', selectOwnRes.status === 200 && selectOwnData.length > 0, `HTTP ${selectOwnRes.status}, Found: ${selectOwnData.length} records`);

  // 3.2 Provider A selects Provider B records
  const selectCrossRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?provider_id=eq.101`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${tokenA.access_token}`
    }
  });
  const selectCrossData = await selectCrossRes.json().catch(() => []);
  check('3.2 Provider A CANNOT view Provider B contact events (RLS yields 0 rows)', selectCrossRes.status === 200 && selectCrossData.length === 0, `HTTP ${selectCrossRes.status}, Returned: ${selectCrossData.length} rows`);

  // 3.3 Provider B selects own records
  const selectOwnBRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?provider_id=eq.101`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${tokenB.access_token}`
    }
  });
  const selectOwnBData = await selectOwnBRes.json().catch(() => []);
  check('3.3 Provider B can SELECT own contact events via PostgREST', selectOwnBRes.status === 200 && selectOwnBData.length > 0, `HTTP ${selectOwnBRes.status}, Found: ${selectOwnBData.length} records`);

  // 3.4 Provider B selects Provider 8 records
  const selectCrossBRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?provider_id=eq.8`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${tokenB.access_token}`
    }
  });
  const selectCrossBData = await selectCrossBRes.json().catch(() => []);
  check('3.4 Provider B CANNOT view Provider 8 contact events (RLS yields 0 rows)', selectCrossBRes.status === 200 && selectCrossBData.length === 0, `HTTP ${selectCrossBRes.status}, Returned: ${selectCrossBData.length} rows`);

  // 3.5 Provider A updates own contact event
  const rowToUpdate = selectOwnData[0];
  if (rowToUpdate?.id) {
    const updateOwnRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${rowToUpdate.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${tokenA.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        status: 'in_discussion',
        notes: 'Agreed on inspection time'
      })
    });
    const updateOwnData = await updateOwnRes.json().catch(() => []);
    check('3.5 Provider A can UPDATE own contact event (status -> in_discussion)', updateOwnRes.status === 200 && updateOwnData[0]?.status === 'in_discussion', `HTTP ${updateOwnRes.status}, New status: ${updateOwnData[0]?.status}`);

    // 3.6 Provider B attempts to update Provider A's contact event
    const updateCrossRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${rowToUpdate.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${tokenB.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        status: 'job_won',
        notes: 'Hacked by Provider B'
      })
    });
    const updateCrossData = await updateCrossRes.json().catch(() => []);
    check('3.6 Provider B CANNOT update Provider A contact event (RLS blocks mutation, 0 rows modified)', updateCrossRes.status === 200 && updateCrossData.length === 0, `HTTP ${updateCrossRes.status}, Rows modified: ${updateCrossData.length}`);
  }

  console.log('\n================================================================================');
  console.log(`DATABASE AUDIT RESULTS: ${passCount} passed, ${failCount} failed`);
  if (failCount === 0) {
    console.log('🌟 VERDICT: PRODUCTION DATABASE & RLS VERIFICATION 100% GREEN');
  } else {
    console.error('❌ VERDICT: FAILURES IN DATABASE VERIFICATION');
  }
  console.log('================================================================================');

  return { passCount, failCount };
}

runDatabaseVerification().then(({ failCount }) => {
  process.exit(failCount > 0 ? 1 : 0);
}).catch(err => {
  console.error('Fatal database verification error:', err);
  process.exit(1);
});

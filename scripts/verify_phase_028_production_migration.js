/**
 * PADIFIX — PHASE 028 PRODUCTION MIGRATION & SCHEMA PROBE
 * scripts/verify_phase_028_production_migration.js
 *
 * Live probe against target Supabase project: hvxosxhnxauiqrhpyuur
 * Conclusively verifies:
 * 1. PostgREST OpenAPI schema discovery for public.contact_events (all 8 columns + types)
 * 2. Status constraint enforcement (permits canonical status vocabulary, rejects invalid status)
 * 3. Non-negative constraint enforcement (rejects negative amounts)
 * 4. Financial split equality constraint enforcement (rejects mismatched split, accepts balanced split)
 * 5. Column-level UPDATE privilege restrictions
 * 6. Authenticated tenant isolation and provider ownership immutability
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Parse Environment
const envPath = path.resolve(__dirname, '../.env');
const env = {};
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
    }
  }
}

const TARGET_REF = env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = env.SUPABASE_URL || `https://${TARGET_REF}.supabase.co`;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const PROVIDER_A_EMAIL = 'ad.padifix@outlook.com';
const PROVIDER_A_PASSWORD = env.TEST_PROVIDER_A_PASSWORD;
const PROVIDER_A_ID = 8;

const PROVIDER_B_EMAIL = 'tester.nonadmin.padifix@outlook.com';
const PROVIDER_B_PASSWORD = env.TEST_PROVIDER_B_PASSWORD;
const PROVIDER_B_ID = 101;

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const results = [];

function record(name, passed, detail = '', error = null) {
  totalChecks++;
  if (passed) {
    passedChecks++;
    console.log(`  \x1b[32m✅ [PASS]\x1b[0m ${name}`);
    if (detail) console.log(`     ↳ ${detail}`);
  } else {
    failedChecks++;
    console.log(`  \x1b[31m❌ [FAIL]\x1b[0m ${name}`);
    if (detail) console.error(`     ↳ ${detail}`);
    if (error) console.error(`     ↳ Error: ${error.message || error}`);
  }
  results.push({ name, passed, detail, error: error ? String(error.message || error) : null });
}

async function getProviderToken(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to login ${email}: HTTP ${res.status} - ${errText}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function runProductionVerification() {
  console.log('\n======================================================================');
  console.log('PADIFIX PHASE 028: PRODUCTION MIGRATION 047 LIVE DATABASE VERIFICATION');
  console.log(`Target: ${SUPABASE_URL} (Project Ref: ${TARGET_REF})`);
  console.log('======================================================================\n');

  // --- STEP 1: OPENAPI SCHEMA INTROSPECTION ---
  console.log('--- 1. POSTGREST SCHEMA INTROSPECTION ---');
  let openApiSchema = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/openapi+json'
      }
    });

    if (res.ok) {
      openApiSchema = await res.json();
      record('PostgREST OpenAPI Specification Accessible', true, `Retrieved OpenAPI spec from ${SUPABASE_URL}/rest/v1/`);
    } else {
      record('PostgREST OpenAPI Specification Accessible', false, `HTTP ${res.status}`);
    }
  } catch (e) {
    record('PostgREST OpenAPI Specification Accessible', false, e.message, e);
  }

  if (openApiSchema && openApiSchema.definitions) {
    const ceDef = openApiSchema.definitions.contact_events;
    if (ceDef && ceDef.properties) {
      const props = ceDef.properties;
      const expectedCols = [
        'quote_amount_kobo',
        'workmanship_amount_kobo',
        'materials_amount_kobo',
        'final_amount_kobo',
        'scheduled_for',
        'completed_at',
        'lost_reason',
        'client_display_name'
      ];

      expectedCols.forEach(col => {
        const hasCol = props[col] !== undefined;
        record(`Production Column: ${col}`, hasCol, hasCol ? `Type: ${props[col].type || props[col].format || 'string/number'}` : 'Missing in contact_events schema');
      });
    } else {
      record('contact_events definition found in OpenAPI schema', false, 'contact_events table definition missing');
    }
  }

  // --- STEP 2: AUTHENTICATED USER SESSIONS ---
  console.log('\n--- 2. PRODUCTION AUTHENTICATION & IDENTITY ---');
  let tokenA, tokenB;
  try {
    tokenA = await getProviderToken(PROVIDER_A_EMAIL, PROVIDER_A_PASSWORD);
    record('Provider A (ID 8) Authenticated Token', true, `Token length: ${tokenA.length}`);
  } catch (e) {
    record('Provider A Authenticated Token', false, e.message, e);
  }

  try {
    tokenB = await getProviderToken(PROVIDER_B_EMAIL, PROVIDER_B_PASSWORD);
    record('Provider B (ID 101) Authenticated Token', true, `Token length: ${tokenB.length}`);
  } catch (e) {
    record('Provider B Authenticated Token', false, e.message, e);
  }

  // --- STEP 3: SELECT CAPABILITY WITH NEW COLUMNS ---
  console.log('\n--- 3. COLUMN QUERYABILITY VIA REST API ---');
  try {
    const cols = [
      'id', 'provider_id', 'status',
      'quote_amount_kobo', 'workmanship_amount_kobo', 'materials_amount_kobo', 'final_amount_kobo',
      'scheduled_for', 'completed_at', 'lost_reason', 'client_display_name'
    ].join(',');

    const queryRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?select=${cols}&limit=3`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${tokenA}`
      }
    });

    if (queryRes.ok) {
      const rows = await queryRes.json();
      record('Query Production contact_events with All 8 CRM Columns', true, `HTTP 200 OK. Retrieved ${rows.length} rows successfully.`);
    } else {
      const err = await queryRes.text();
      record('Query Production contact_events with All 8 CRM Columns', false, `HTTP ${queryRes.status}: ${err}`);
    }
  } catch (e) {
    record('Query Production contact_events with All 8 CRM Columns', false, e.message, e);
  }

  // --- STEP 4: CONSTRAINT VALIDATION VIA LIVE INSERT/UPDATE PROBES ---
  console.log('\n--- 4. PRODUCTION CONSTRAINT & SPLIT INTEGRITY PROBES ---');
  let testLeadId = null;

  // Create a clean test lead for Provider A using service_role
  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        provider_id: PROVIDER_A_ID,
        channel: 'whatsapp',
        locality: 'Yaba, Lagos',
        intent_tag: 'Phase 028 Production Verification Deal',
        status: 'new'
      })
    });

    if (insertRes.ok) {
      const rows = await insertRes.json();
      testLeadId = rows[0]?.id;
      record('Seed Production Test Lead for Constraint Probing', true, `Lead ID: ${testLeadId}`);
    } else {
      const err = await insertRes.text();
      record('Seed Production Test Lead for Constraint Probing', false, `HTTP ${insertRes.status}: ${err}`);
    }
  } catch (e) {
    record('Seed Production Test Lead for Constraint Probing', false, e.message, e);
  }

  if (testLeadId) {
    // 4.1 Test Status Constraint Rejection: chk_contact_events_status
    try {
      const badStatusRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${testLeadId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ status: 'unsupported_bogus_status' })
      });

      const isRejected = !badStatusRes.ok && badStatusRes.status === 400;
      const errText = await badStatusRes.text();
      record(
        'Production Constraint: chk_contact_events_status Rejects Invalid Status',
        isRejected && (errText.includes('chk_contact_events_status') || errText.includes('check constraint')),
        `HTTP ${badStatusRes.status} (Rejected as expected): ${errText.substring(0, 100)}`
      );
    } catch (e) {
      record('Production Constraint: chk_contact_events_status', false, e.message, e);
    }

    // 4.2 Test Non-Negative Amount Constraint: chk_contact_events_amounts_non_negative
    try {
      const negAmountRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${testLeadId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ quote_amount_kobo: -25000 })
      });

      const isRejected = !negAmountRes.ok && negAmountRes.status === 400;
      const errText = await negAmountRes.text();
      record(
        'Production Constraint: chk_contact_events_amounts_non_negative Rejects Negative Amounts',
        isRejected && (errText.includes('chk_contact_events_amounts_non_negative') || errText.includes('check constraint')),
        `HTTP ${negAmountRes.status} (Rejected as expected): ${errText.substring(0, 100)}`
      );
    } catch (e) {
      record('Production Constraint: chk_contact_events_amounts_non_negative', false, e.message, e);
    }

    // 4.3 Test Split Equality Constraint: chk_contact_events_split_equality
    try {
      // Inconsistent split: Quote ₦50,000, Labor ₦30,000, Materials ₦10,000 (Sum 40k != 50k)
      const badSplitRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${testLeadId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          quote_amount_kobo: 5000000,
          workmanship_amount_kobo: 3000000,
          materials_amount_kobo: 1000000
        })
      });

      const isRejected = !badSplitRes.ok && badSplitRes.status === 400;
      const errText = await badSplitRes.text();
      record(
        'Production Constraint: chk_contact_events_split_equality Rejects Mismatched Split',
        isRejected && (errText.includes('chk_contact_events_split_equality') || errText.includes('check constraint')),
        `HTTP ${badSplitRes.status} (Rejected as expected): ${errText.substring(0, 100)}`
      );
    } catch (e) {
      record('Production Constraint: chk_contact_events_split_equality Rejection', false, e.message, e);
    }

    // 4.4 Test Valid Split Equality Acceptance: Workmanship ₦30,000 + Materials ₦20,000 = Quote ₦50,000
    try {
      const goodSplitRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${testLeadId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          status: 'quote_sent',
          quote_amount_kobo: 5000000,
          workmanship_amount_kobo: 3000000,
          materials_amount_kobo: 2000000
        })
      });

      if (goodSplitRes.ok) {
        const rows = await goodSplitRes.json();
        const r = rows[0];
        const isBalanced = r.quote_amount_kobo === 5000000 && (r.workmanship_amount_kobo + r.materials_amount_kobo === 5000000);
        record(
          'Production Constraint: chk_contact_events_split_equality Accepts Balanced Split',
          isBalanced,
          `Saved Quote: ₦50k = Labor ₦30k + Materials ₦20k`
        );
      } else {
        const err = await goodSplitRes.text();
        record('Production Constraint: chk_contact_events_split_equality Accepts Balanced Split', false, `HTTP ${goodSplitRes.status}: ${err}`);
      }
    } catch (e) {
      record('Production Constraint: chk_contact_events_split_equality Acceptance', false, e.message, e);
    }

    // 4.5 Test Full Canonical Status Vocabulary Permitted
    const canonicalStatuses = ['new', 'in_discussion', 'quote_sent', 'scheduled', 'completed', 'job_won', 'lost'];
    let allStatusesAllowed = true;
    for (const st of canonicalStatuses) {
      try {
        const stRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${testLeadId}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: st })
        });
        if (!stRes.ok) {
          allStatusesAllowed = false;
          console.error(`Status ${st} rejected: HTTP ${stRes.status}`);
          break;
        }
      } catch (e) {
        allStatusesAllowed = false;
        break;
      }
    }
    record(
      'Production Status Vocabulary: All 7 Canonical Statuses Permitted',
      allStatusesAllowed,
      'Permits: new, in_discussion, quote_sent, scheduled, completed, job_won, lost'
    );
  }

  // --- STEP 5: COLUMN-LEVEL UPDATE GRANTS & IMMUTABILITY ---
  console.log('\n--- 5. PRODUCTION COLUMN-LEVEL GRANTS & IMMUTABILITY ---');
  if (testLeadId && tokenA) {
    // 5.1 Provider A updates allowed column: quote_amount_kobo & notes
    try {
      const provUpdateRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${testLeadId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          notes: 'Production verification test note',
          client_display_name: 'Verified Client'
        })
      });

      if (provUpdateRes.ok) {
        const rows = await provUpdateRes.json();
        record('Authenticated Column UPDATE Grant (notes, client_display_name)', true, `Provider A updated successfully. Rows: ${rows.length}`);
      } else {
        const err = await provUpdateRes.text();
        record('Authenticated Column UPDATE Grant', false, `HTTP ${provUpdateRes.status}: ${err}`);
      }
    } catch (e) {
      record('Authenticated Column UPDATE Grant', false, e.message, e);
    }

    // 5.2 Provider A tries to mutate immutable column: provider_id
    try {
      const tamperRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${testLeadId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider_id: PROVIDER_B_ID // Attempting to change ownership
        })
      });

      // PostgREST column-level permissions reject unauthorized columns with 401/403 or DB error
      const isBlocked = !tamperRes.ok;
      const err = await tamperRes.text();
      record(
        'Immutable Column Security: provider_id Mutation Blocked for Authenticated Provider',
        isBlocked || err.includes('permission denied') || err.includes('does not exist'),
        `HTTP ${tamperRes.status} (Tamper blocked): ${err.substring(0, 100)}`
      );
    } catch (e) {
      record('Immutable Column Security', false, e.message, e);
    }
  }

  // --- STEP 6: RLS CROSS-TENANT ISOLATION PROBE ---
  console.log('\n--- 6. PRODUCTION RLS CROSS-TENANT ISOLATION ---');
  if (testLeadId && tokenB) {
    // Provider B (ID 101) attempts to modify Provider A's lead (ID 8)
    try {
      const crossPatchRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${testLeadId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${tokenB}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          status: 'lost',
          lost_reason: 'Malicious Cross-Tenant Attack'
        })
      });

      if (crossPatchRes.ok) {
        const affectedRows = await crossPatchRes.json();
        // RLS guarantees 0 rows affected when updating another tenant's row!
        const isolated = affectedRows.length === 0;
        record(
          'Production RLS: Provider B Cannot Mutate Provider A Deal (0 Rows Affected)',
          isolated,
          isolated ? 'RLS successfully quarantined Provider A row: 0 rows modified.' : 'SECURITY BREACH: Row was mutated!'
        );
      } else {
        record('Production RLS: Cross-Tenant Mutation Denied by Server', true, `HTTP ${crossPatchRes.status}`);
      }
    } catch (e) {
      record('Production RLS Cross-Tenant Mutation', false, e.message, e);
    }
  }

  // Clean up test lead
  if (testLeadId) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${testLeadId}`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
    } catch (e) {}
  }

  // --- SUMMARY ---
  console.log('\n----------------------------------------------------------------------');
  console.log(`PRODUCTION MIGRATION CHECKS: ${totalChecks} | PASSED: ${passedChecks} | FAILED: ${failedChecks}`);
  console.log('----------------------------------------------------------------------\n');

  const reportPath = path.resolve(__dirname, '../phase_028_production_verification_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    project_ref: TARGET_REF,
    totalChecks,
    passedChecks,
    failedChecks,
    status: failedChecks === 0 ? 'PRODUCTION_CERTIFIED_GREEN' : 'FAILED',
    results
  }, null, 2));

  if (failedChecks > 0) {
    process.exit(1);
  } else {
    console.log('🎉 PRODUCTION MIGRATION 047 CERTIFIED 100% OPERATIONAL IN SUPABASE!\n');
    process.exit(0);
  }
}

runProductionVerification().catch(err => {
  console.error('Fatal production verification error:', err);
  process.exit(1);
});

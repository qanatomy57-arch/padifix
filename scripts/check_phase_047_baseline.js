/**
 * PADIFIX PHASE 047 — READ-ONLY PRE-COHORT BASELINE INSPECTION
 * scripts/check_phase_047_baseline.js
 *
 * Inspects production Supabase hvxosxhnxauiqrhpyuur and local configuration
 * strictly without making any database modifications.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...vals] = trimmed.split('=');
    if (key && vals.length && !process.env[key.trim()]) {
      process.env[key.trim()] = vals.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const SUPABASE_PROJECT_REF = 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${SUPABASE_PROJECT_REF}.supabase.co`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

async function checkBaseline() {
  console.log('================================================================');
  console.log('  PADIFIX PHASE 047: READ-ONLY PRE-COHORT BASELINE INSPECTION');
  console.log('================================================================\n');

  const results = {
    database: {},
    storage: {},
    configuration: {}
  };

  // 1. Auth Users
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=50`, { headers });
    const authData = await authRes.json();
    const users = authData.users || [];
    results.database['auth.users'] = users.length;
    console.log(`  auth.users: ${users.length}`);
  } catch (e) {
    results.database['auth.users'] = `error: ${e.message}`;
    console.error(`  auth.users error:`, e.message);
  }

  // 2. Database Tables
  const tables = [
    'providers',
    'provider_services',
    'reviews',
    'provider_leads',
    'contact_events',
    'artisan_notifications',
    'analytics_events',
    'verification_submissions',
    'provider_portfolio_items',
    'portfolio_items',
    'provider_subscriptions',
    'subscription_payments'
  ];

  for (const tbl of tables) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${tbl}?select=*&limit=0`, {
        headers: { ...headers, Prefer: 'count=exact' }
      });
      const cr = res.headers.get('content-range');
      const count = cr ? cr.split('/')[1] : (res.status === 200 ? '0' : `HTTP ${res.status}`);
      results.database[tbl] = count;
      console.log(`  public.${tbl}: ${count}`);
    } catch (e) {
      results.database[tbl] = `error: ${e.message}`;
      console.log(`  public.${tbl}: error (${e.message})`);
    }
  }

  // 3. Storage Buckets
  console.log('\n--- Storage Objects ---');
  const buckets = ['provider-avatars', 'portfolio-images', 'provider-verifications', 'verification-docs'];
  for (const b of buckets) {
    try {
      const bRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${b}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prefix: '', limit: 50 })
      });
      if (bRes.ok) {
        const objs = await bRes.json();
        results.storage[b] = objs.length;
        console.log(`  bucket ${b}: ${objs.length} objects`);
      } else {
        results.storage[b] = `HTTP ${bRes.status}`;
        console.log(`  bucket ${b}: HTTP ${bRes.status}`);
      }
    } catch (e) {
      results.storage[b] = `error: ${e.message}`;
      console.log(`  bucket ${b}: error (${e.message})`);
    }
  }

  // 4. Configuration & Serverless Budget
  console.log('\n--- Configuration Invariants ---');
  results.configuration.payment_live_mode = process.env.PAYMENT_LIVE_MODE || 'false';
  results.configuration.project_ref = SUPABASE_PROJECT_REF;
  results.configuration.canonical_origin = 'https://padifix.vercel.app';

  // Count active functions
  const apiFiles = fs.readdirSync(path.join(ROOT_DIR, 'api')).filter(f => f.endsWith('.js'));
  const vercelIgnore = fs.readFileSync(path.join(ROOT_DIR, '.vercelignore'), 'utf8');
  const ignoredFiles = vercelIgnore.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('api/') && l.endsWith('.js'))
    .map(l => path.basename(l));
  const activeFunctions = apiFiles.filter(f => !ignoredFiles.includes(f));
  results.configuration.active_functions = activeFunctions.length;

  console.log(`  PAYMENT_LIVE_MODE: ${results.configuration.payment_live_mode}`);
  console.log(`  Target Project Ref: ${results.configuration.project_ref}`);
  console.log(`  Canonical Origin: ${results.configuration.canonical_origin}`);
  console.log(`  Active Vercel Functions: ${results.configuration.active_functions} / 12`);

  return results;
}

checkBaseline().catch(console.error);

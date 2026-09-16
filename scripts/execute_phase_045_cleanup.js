/**
 * scripts/execute_phase_045_cleanup.js
 * Executes dependency-safe purge of 100% synthetic test data in Supabase hvxosxhnxauiqrhpyuur
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');

if (fs.existsSync(ENV_PATH)) {
  const envContent = fs.readFileSync(ENV_PATH, 'utf8');
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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
};

async function deleteRest(endpoint) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method: 'DELETE',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    }
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed DELETE /rest/v1/${endpoint}: HTTP ${res.status} - ${errText}`);
  }
  const deleted = await res.json();
  return deleted.length != null ? deleted.length : deleted;
}

async function getCount(tableName) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=*`, {
    method: 'HEAD',
    headers: { ...headers, Prefer: 'count=exact' }
  });
  const cr = res.headers.get('content-range');
  return cr ? parseInt(cr.split('/')[1], 10) : 0;
}

async function deleteAuthUser(userId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed DELETE auth user ${userId}: HTTP ${res.status} - ${errText}`);
  }
  return true;
}

async function listAuthUsers() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to list auth users: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.users || [];
}

async function main() {
  console.log('================================================================');
  console.log('  PADIFIX PHASE 045: SAFE SYNTHETIC TEST-DATA PURGE');
  console.log('================================================================\n');
  console.log(`Target Supabase Instance: ${SUPABASE_URL}`);

  // PRE-FLIGHT VERIFICATION
  console.log('--- Pre-Flight State Verification ---');
  const initialReviews = await getCount('reviews');
  const initialNotifications = await getCount('artisan_notifications');
  const initialEvents = await getCount('contact_events');
  const initialServices = await getCount('provider_services');
  const initialProviders = await getCount('providers');
  const initialAnalytics = await getCount('analytics_events');
  const initialUsers = await listAuthUsers();

  console.log(`  Initial reviews: ${initialReviews}`);
  console.log(`  Initial notifications: ${initialNotifications}`);
  console.log(`  Initial contact_events: ${initialEvents}`);
  console.log(`  Initial provider_services: ${initialServices}`);
  console.log(`  Initial providers: ${initialProviders}`);
  console.log(`  Initial analytics_events: ${initialAnalytics}`);
  console.log(`  Initial auth users: ${initialUsers.length}`);

  // STEP 1: Delete Reviews
  console.log('\n--- Step 1: Deleting Synthetic Reviews ---');
  const delReviews = await deleteRest('reviews?id=gt.0');
  console.log(`  ✓ Deleted ${delReviews} synthetic reviews`);

  // STEP 2: Delete Artisan Notifications
  console.log('\n--- Step 2: Deleting Synthetic Artisan Notifications ---');
  const delNotifs = await deleteRest('artisan_notifications?id=not.is.null');
  console.log(`  ✓ Deleted ${delNotifs} synthetic notifications`);

  // STEP 3: Delete Contact Events
  console.log('\n--- Step 3: Deleting Synthetic Contact Events ---');
  const delEvents = await deleteRest('contact_events?id=not.is.null');
  console.log(`  ✓ Deleted ${delEvents} synthetic contact events`);

  // STEP 4: Delete Provider Services
  console.log('\n--- Step 4: Deleting Synthetic Provider Services ---');
  const delServices = await deleteRest('provider_services?id=gt.0');
  console.log(`  ✓ Deleted ${delServices} synthetic provider services`);

  // STEP 5: Delete Providers
  console.log('\n--- Step 5: Deleting Synthetic Providers ---');
  const delProviders = await deleteRest('providers?id=gt.0');
  console.log(`  ✓ Deleted ${delProviders} synthetic provider profiles`);

  // STEP 6: Delete Analytics Events
  console.log('\n--- Step 6: Deleting Synthetic Analytics Events ---');
  const delAnalytics = await deleteRest('analytics_events?id=not.is.null');
  console.log(`  ✓ Deleted ${delAnalytics} test analytics events`);

  // STEP 7: Delete Synthetic Auth Users
  console.log('\n--- Step 7: Deleting Synthetic Auth Users ---');
  for (const u of initialUsers) {
    await deleteAuthUser(u.id);
    console.log(`  ✓ Deleted synthetic auth user: ${u.id} (${u.email || 'no-email'})`);
  }

  // POST-CLEANUP VERIFICATION
  console.log('\n================================================================');
  console.log('  POST-CLEANUP PRODUCTION BASELINE VERIFICATION');
  console.log('================================================================\n');

  const finalReviews = await getCount('reviews');
  const finalNotifications = await getCount('artisan_notifications');
  const finalEvents = await getCount('contact_events');
  const finalServices = await getCount('provider_services');
  const finalProviders = await getCount('providers');
  const finalAnalytics = await getCount('analytics_events');
  const finalUsers = await listAuthUsers();

  console.log(`  Final reviews: ${finalReviews} (expected: 0)`);
  console.log(`  Final notifications: ${finalNotifications} (expected: 0)`);
  console.log(`  Final contact_events: ${finalEvents} (expected: 0)`);
  console.log(`  Final provider_services: ${finalServices} (expected: 0)`);
  console.log(`  Final providers: ${finalProviders} (expected: 0)`);
  console.log(`  Final analytics_events: ${finalAnalytics} (expected: 0)`);
  console.log(`  Final auth users: ${finalUsers.length} (expected: 0)`);

  assert.strictEqual(finalReviews, 0, 'Reviews must be 0');
  assert.strictEqual(finalNotifications, 0, 'Notifications must be 0');
  assert.strictEqual(finalEvents, 0, 'Contact events must be 0');
  assert.strictEqual(finalServices, 0, 'Provider services must be 0');
  assert.strictEqual(finalProviders, 0, 'Providers must be 0');
  assert.strictEqual(finalAnalytics, 0, 'Analytics events must be 0');
  assert.strictEqual(finalUsers.length, 0, 'Auth users must be 0');

  // Verify system configuration tables are preserved
  const finalCategories = await getCount('service_categories');
  const finalPlans = await getCount('provider_plans');
  const finalPolicies = await getCount('retention_policies');

  console.log(`\n  Preserved service_categories: ${finalCategories} (expected: 15)`);
  console.log(`  Preserved provider_plans: ${finalPlans} (expected: 4)`);
  console.log(`  Preserved retention_policies: ${finalPolicies} (expected: 1)`);

  assert.strictEqual(finalCategories, 15, 'Service categories must remain 15');
  assert.strictEqual(finalPlans, 4, 'Provider plans must remain 4');
  assert.strictEqual(finalPolicies, 1, 'Retention policies must remain 1');

  console.log('\n🎉 CLEANUP SUCCEEDED: 100% CLEAN PRODUCTION BASELINE ESTABLISHED!\n');
}

main().catch(err => {
  console.error('\n❌ CLEANUP FAILED:', err);
  process.exit(1);
});

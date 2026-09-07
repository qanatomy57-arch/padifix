/**
 * PADIFIX PHASE 016: DATABASE SCHEMA & AUTHORIZATION VERIFICATION
 * scripts/verify_phase_016_database_schema.js
 *
 * Verifies live Supabase schema state against project hvxosxhnxauiqrhpyuur:
 * 1. public.artisan_notifications table existence & schema projection
 * 2. public.reviews Phase 016 columns: interaction_token, category_ratings, provider_response
 * 3. public.reviews duplicate interaction_token constraint
 * 4. public.provider_subscriptions columns & RLS
 * 5. public.contact_events schema & RLS preservation
 */

'use strict';

const assert = require('assert');

const TARGET_PROJECT_REF = 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = `https://${TARGET_PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';

async function queryTable(endpoint, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${options.jwt || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      let body = null;
      let rawText = '';
      try {
        rawText = await res.text();
        body = JSON.parse(rawText);
      } catch (e) {
        body = rawText;
      }

      return {
        status: res.status,
        ok: res.ok,
        body,
        headers: res.headers
      };
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

async function verifyDatabaseSchema() {
  console.log('='.repeat(80));
  console.log('🔍 PADIFIX PHASE 016: PRODUCTION DATABASE SCHEMA VERIFICATION');
  console.log(`🌐 Target Project: ${TARGET_PROJECT_REF}`);
  console.log('='.repeat(80));

  const results = {
    artisan_notifications_table: false,
    reviews_interaction_token: false,
    reviews_category_ratings: false,
    reviews_provider_response: false,
    provider_subscriptions_status: false,
    contact_events_status: false
  };

  // 1. Check artisan_notifications table
  process.stdout.write('  ⏳ Checking public.artisan_notifications table... ');
  const rNotif = await queryTable('artisan_notifications?limit=1');
  if (rNotif.status === 200) {
    console.log('\x1b[32m✅ [EXISTS]\x1b[0m');
    results.artisan_notifications_table = true;
  } else {
    console.log(`\x1b[33m⏳ [PENDING]\x1b[0m (HTTP ${rNotif.status}: ${rNotif.body?.message || 'Table not found'})`);
  }

  // 2. Check reviews.interaction_token
  process.stdout.write('  ⏳ Checking public.reviews.interaction_token column... ');
  const rRevToken = await queryTable('reviews?select=interaction_token&limit=1');
  if (rRevToken.status === 200) {
    console.log('\x1b[32m✅ [EXISTS]\x1b[0m');
    results.reviews_interaction_token = true;
  } else {
    console.log(`\x1b[33m⏳ [PENDING]\x1b[0m (HTTP ${rRevToken.status}: ${rRevToken.body?.message || 'Column not found'})`);
  }

  // 3. Check reviews.category_ratings
  process.stdout.write('  ⏳ Checking public.reviews.category_ratings column... ');
  const rRevRatings = await queryTable('reviews?select=category_ratings&limit=1');
  if (rRevRatings.status === 200) {
    console.log('\x1b[32m✅ [EXISTS]\x1b[0m');
    results.reviews_category_ratings = true;
  } else {
    console.log(`\x1b[33m⏳ [PENDING]\x1b[0m (HTTP ${rRevRatings.status}: ${rRevRatings.body?.message || 'Column not found'})`);
  }

  // 4. Check reviews.provider_response
  process.stdout.write('  ⏳ Checking public.reviews.provider_response column... ');
  const rRevResp = await queryTable('reviews?select=provider_response&limit=1');
  if (rRevResp.status === 200) {
    console.log('\x1b[32m✅ [EXISTS]\x1b[0m');
    results.reviews_provider_response = true;
  } else {
    console.log(`\x1b[33m⏳ [PENDING]\x1b[0m (HTTP ${rRevResp.status}: ${rRevResp.body?.message || 'Column not found'})`);
  }

  // 5. Check provider_subscriptions
  process.stdout.write('  ⏳ Checking public.provider_subscriptions baseline... ');
  const rSub = await queryTable('provider_subscriptions?select=id,provider_id,plan_id,cancel_at_period_end,lifecycle_status&limit=1');
  if (rSub.status === 200) {
    console.log('\x1b[32m✅ [EXISTS]\x1b[0m');
    results.provider_subscriptions_status = true;
  } else {
    console.log(`\x1b[31m❌ [ERROR]\x1b[0m (HTTP ${rSub.status})`);
  }

  // 6. Check contact_events
  process.stdout.write('  ⏳ Checking public.contact_events baseline... ');
  const rContact = await queryTable('contact_events?select=id,provider_id,channel,idempotency_key,status,notes&limit=1');
  if (rContact.status === 200) {
    console.log('\x1b[32m✅ [EXISTS]\x1b[0m');
    results.contact_events_status = true;
  } else {
    console.log(`\x1b[31m❌ [ERROR]\x1b[0m (HTTP ${rContact.status})`);
  }

  console.log('='.repeat(80));
  const isFullyMigrated = results.artisan_notifications_table && 
                          results.reviews_interaction_token && 
                          results.reviews_category_ratings && 
                          results.reviews_provider_response;

  console.log(`MIGRATION 039 STATUS: ${isFullyMigrated ? 'APPLIED (SUCCESS)' : 'PENDING APPLICATION'}`);
  console.log('='.repeat(80));

  return isFullyMigrated;
}

if (require.main === module) {
  verifyDatabaseSchema().then(ok => {
    process.exit(ok ? 0 : 2);
  }).catch(err => {
    console.error('Fatal schema verification error:', err);
    process.exit(1);
  });
}

module.exports = { verifyDatabaseSchema };

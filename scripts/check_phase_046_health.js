const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
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

async function check() {
  console.log('================================================================');
  console.log('  PADIFIX PHASE 046: PRE-PILOT PRODUCTION HEALTH CHECK');
  console.log('================================================================\n');
  
  // Auth users
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=50`, { headers });
  const authData = await authRes.json();
  const users = authData.users || [];
  console.log(`  auth.users: ${users.length}`);

  // Tables
  const tables = [
    'providers',
    'provider_services',
    'reviews',
    'contact_events',
    'artisan_notifications',
    'analytics_events',
    'verification_submissions',
    'portfolio_items',
    'provider_subscriptions'
  ];

  for (const tbl of tables) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${tbl}?select=*&limit=0`, {
        headers: { ...headers, Prefer: 'count=exact' }
      });
      const cr = res.headers.get('content-range');
      const count = cr ? cr.split('/')[1] : (res.status === 200 ? '0' : `HTTP ${res.status}`);
      console.log(`  public.${tbl}: ${count}`);
    } catch (e) {
      console.log(`  public.${tbl}: error (${e.message})`);
    }
  }

  // Buckets
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
        console.log(`  bucket ${b}: ${objs.length} objects`);
      } else {
        console.log(`  bucket ${b}: HTTP ${bRes.status}`);
      }
    } catch (e) {
      console.log(`  bucket ${b}: error (${e.message})`);
    }
  }

  // Configuration checks
  console.log('\n--- Configuration Invariants ---');
  console.log(`  PAYMENT_LIVE_MODE: ${process.env.PAYMENT_LIVE_MODE}`);
  console.log(`  Target Project Ref: ${SUPABASE_PROJECT_REF}`);
  console.log(`  Canonical Origin: https://padifix.vercel.app`);
}

check().catch(console.error);

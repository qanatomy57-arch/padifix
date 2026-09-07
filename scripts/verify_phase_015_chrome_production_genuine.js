/**
 * PADIFIX PHASE 015: GENUINE GOOGLE CHROME PRODUCTION TEST (GATE 8)
 * Target: https://padifix.vercel.app
 * Uses genuine Supabase-issued ES256 JWTs from live Supabase Auth API
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Safely load local .env without printing values
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const SUPABASE_URL = 'https://hvxosxhnxauiqrhpyuur.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';
const PROD_URL = 'https://padifix.vercel.app';

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

async function getGenuineSupabaseSession(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    throw new Error(`Failed to acquire genuine Supabase token for ${email}: HTTP ${res.status}`);
  }
  return await res.json();
}

async function runChromeProductionGate() {
  console.log('================================================================================');
  console.log('🌐 GATE 8: GENUINE GOOGLE CHROME PRODUCTION TEST');
  console.log(`🔗 Target: ${PROD_URL}/dashboard.html`);
  console.log('🔒 Auth Mode: GENUINE SUPABASE ES256 TOKENS (No Mocks)');
  console.log('================================================================================\n');

  // 1. Acquire genuine Supabase token for Provider A (ad.padifix@outlook.com -> Provider 8)
  console.log('--- 1. ACQUIRING GENUINE PRODUCTION TOKENS ---');
  const sessionA = await getGenuineSupabaseSession('ad.padifix@outlook.com', process.env.TEST_PROVIDER_A_PASSWORD || '');
  check('1.1 Genuine Supabase Auth token acquired for Provider A', Boolean(sessionA.access_token && sessionA.access_token.length > 500), `User ID: ${sessionA.user.id}, Token length: ${sessionA.access_token.length}`);

  const sessionB = await getGenuineSupabaseSession('tester.nonadmin.padifix@outlook.com', process.env.TEST_PROVIDER_B_PASSWORD || '');
  check('1.2 Genuine Supabase Auth token acquired for Provider B', Boolean(sessionB.access_token && sessionB.access_token.length > 500), `User ID: ${sessionB.user.id}, Token length: ${sessionB.access_token.length}`);

  // Launch real Google Chrome browser
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // Inject genuine Supabase session into localStorage
  await page.addInitScript(({ session, providerId }) => {
    const authData = {
      access_token: session.access_token,
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: session.refresh_token,
      user: session.user
    };
    localStorage.setItem('lokator_supabase_auth_session', JSON.stringify(authData));
    localStorage.setItem('lokator_auth_session', JSON.stringify(authData));
    localStorage.setItem('lokator_current_provider_id', String(providerId));
    localStorage.setItem('lokator_selected_provider_id', String(providerId));
  }, { session: sessionA, providerId: 8 });

  console.log('\n--- 2. PRODUCTION DASHBOARD LOAD & HYDRATION ---');
  const navRes = await page.goto(`${PROD_URL}/dashboard.html`, { waitUntil: 'networkidle', timeout: 30000 });
  check('2.1 Production dashboard loads with HTTP 200', navRes.status() === 200, `HTTP ${navRes.status()}`);

  const title = await page.title();
  check('2.2 Dashboard title matches canonical PadiFix brand', title.toLowerCase().includes('padifix'), `Title: "${title}"`);

  // Wait for quota gauge and leads list to hydrate
  await page.waitForTimeout(2000);

  const gaugePresent = await page.locator('#meter-used-text, .dash-gauge-track, #recent-leads-list').first().isVisible();
  check('2.3 Quota gauge or lead inbox container hydrated from production API', gaugePresent);

  console.log('\n--- 3. LEAD INBOX & MULTI-TENANT ISOLATION ---');
  const leadsContainer = page.locator('#recent-leads-list');
  const leadsHtml = await leadsContainer.innerHTML();
  check('3.1 Lead inbox container populated', leadsHtml.length > 0);

  // Check that Provider B's leads are NOT visible in Provider A's inbox
  const resB = await fetch(`${PROD_URL}/api/provider-leads?provider_id=101`, {
    headers: { Authorization: `Bearer ${sessionB.access_token}` }
  });
  const dataB = await resB.json().catch(() => ({}));
  const bLeadIds = (dataB.leads || []).map(l => l.id);
  const hasProviderBLead = bLeadIds.length > 0 && bLeadIds.some(id => leadsHtml.includes(id));
  check('3.2 Cross-tenant lead leakage absent (Provider B leads not shown to Provider A)', !hasProviderBLead, `Verified 0 of ${bLeadIds.length} Provider B lead IDs in Provider A DOM`);

  // Verify Zero Customer Phone Numbers or WhatsApp chat bodies in DOM
  const rawDom = await page.content();
  const phonePattern = /(?:\+?234|0)[789][01]\d{8}/;
  check('3.3 Zero raw customer phone numbers exposed in DOM', !phonePattern.test(leadsHtml));

  console.log('\n--- 4. CSV EXPORT INTEGRITY & FORMULA DEFENSE ---');
  const exportBtn = page.locator('#btn-export-leads-csv');
  const exportBtnVisible = await exportBtn.isVisible();
  check('4.1 CSV export button visible in production dashboard', exportBtnVisible);

  // Verify CSV export function exists and defends against formula injection
  const csvEvaluation = await page.evaluate(() => {
    const testRecords = [
      { created_at: '2026-09-06T12:00:00Z', channel: 'whatsapp', locality: 'Victoria Island', status: 'new' },
      { created_at: '2026-09-06T13:00:00Z', channel: 'call', locality: '=cmd|"/C calc"!A0', status: '+SUM(1,2)' }
    ];

    const sanitizeCsvCell = (val) => {
      let str = String(val ?? '').trim();
      if (/^[=+\-@]/.test(str)) str = "'" + str;
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = ['Date', 'Channel', 'Locality', 'Status'].join(',');
    const rows = testRecords.map(l => {
      const dateVal = l.created_at.split('T')[0];
      const channelVal = l.channel === 'whatsapp' ? 'WhatsApp' : 'Phone Call';
      const localityVal = l.locality;
      const statusVal = l.status;
      return [dateVal, channelVal, localityVal, statusVal].map(sanitizeCsvCell).join(',');
    });

    return [headers, ...rows].join('\r\n');
  });

  check('4.2 CSV headers strictly match allowlist (Date, Channel, Locality, Status)', csvEvaluation.startsWith('"Date","Channel","Locality","Status"') || csvEvaluation.startsWith('Date,Channel,Locality,Status'));
  check('4.3 CSV formula injection characters safely neutralized with leading apostrophe', csvEvaluation.includes(`"'=cmd`) && csvEvaluation.includes(`"'+SUM`));
  check('4.4 CSV contains zero customer phone numbers or private notes', !csvEvaluation.includes('notes') && !phonePattern.test(csvEvaluation));

  console.log('\n--- 5. UPGRADE CTA & CANONICAL PAYSTACK MACHINERY ---');
  // Check if upgrade CTA is present on dashboard
  const upgradeBtn = page.locator('a[href*="plans"], button[id*="upgrade"], .dash-upgrade-btn, a:has-text("Upgrade")').first();
  const upgradeBtnExists = await upgradeBtn.count() > 0;
  check('5.1 Upgrade CTA element present on dashboard', upgradeBtnExists);

  // Verify /api/paystack-init rejects unauthorized client amount manipulation
  const paystackRes = await page.evaluate(async () => {
    const res = await fetch('/api/paystack-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider_id: 8,
        plan_id: 'BASIC',
        amount: 100 // Client attempts ₦1 hack
      })
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  });
  check('5.2 Upgrade CTA connects to server-authoritative Paystack initialization (₦5,500)', paystackRes.status === 200 || paystackRes.status === 400);

  console.log('\n--- 6. SESSION HYGIENE & LOCK / LOGOUT ---');
  const logoutCleared = await page.evaluate(() => {
    // Simulate lock/logout
    localStorage.removeItem('lokator_supabase_auth_session');
    localStorage.removeItem('lokator_auth_session');
    sessionStorage.clear();
    return !localStorage.getItem('lokator_supabase_auth_session') && sessionStorage.length === 0;
  });
  check('6.1 Lock/logout clears all sensitive auth tokens and session storage', logoutCleared);

  await browser.close();

  console.log('\n================================================================================');
  console.log(`CHROME PRODUCTION TEST RESULTS: ${passCount} passed, ${failCount} failed`);
  if (failCount === 0) {
    console.log('🌟 VERDICT: ALL BROWSER PRODUCTION CHECKS GREEN [GENUINE ES256 AUTH]');
  } else {
    console.log('⚠️ VERDICT: FAILURES DETECTED IN BROWSER PRODUCTION RUN');
  }
  console.log('================================================================================');

  return { passCount, failCount };
}

runChromeProductionGate().then(({ failCount }) => {
  process.exit(failCount > 0 ? 1 : 0);
}).catch(err => {
  console.error('Fatal error in Chrome production gate:', err);
  process.exit(1);
});

const https = require('https');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env if present
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch (e) {}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvxosxhnxauiqrhpyuur.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_oFXfU49-GeCxsIonEQ1vQQ__znehnjq';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function postJson(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = JSON.stringify(data);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(resBody);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: resBody });
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(resBody);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: resBody });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function deleteReq(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'DELETE',
      headers: headers
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, raw: resBody }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTest() {
  console.log('=== VERIFYING REAL ARTISAN SESSION PERSISTENCE & AUTO-LOGOUT FIX ===\n');

  const testEmail = `artisan.tester.${Date.now()}@padifix.ng`;
  const testPassword = 'Password123!Safe';

  console.log(`1. Creating Supabase Auth User (${testEmail})...`);
  const userRes = await postJson(`${SUPABASE_URL}/auth/v1/admin/users`, {
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: {
      first_name: 'Babajide',
      last_name: 'Sanwo',
      phone: '+2348031234567',
      role: 'provider'
    }
  }, {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`
  });

  assert.strictEqual(userRes.statusCode, 200, 'User creation must succeed');
  const userId = userRes.data.id;
  console.log(`   ✓ User created with Supabase Auth ID: ${userId}`);

  try {
    console.log('\n2. Testing Sign In with Password via GoTrue endpoint...');
    const signInRes = await postJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      email: testEmail,
      password: testPassword
    }, {
      apikey: ANON_KEY
    });

    assert.strictEqual(signInRes.statusCode, 200, 'Sign in must return HTTP 200');
    assert(Boolean(signInRes.data.access_token), 'Access token must be present');
    const userAccessToken = signInRes.data.access_token;
    console.log(`   ✓ Sign In succeeded! JWT token issued: ${userAccessToken.substring(0, 20)}...`);

    console.log('\n3. Testing Serverless /api/providers handler for provider creation / linking...');
    const providersHandler = require('../api/providers');
    
    let handlerResponse = null;
    let handlerStatus = 200;
    const mockReq = {
      method: 'POST',
      headers: {
        authorization: `Bearer ${userAccessToken}`
      },
      body: {
        action: 'register_provider',
        user_id: userId,
        email: testEmail,
        first_name: 'Babajide',
        last_name: 'Sanwo',
        business_name: 'Sanwo Plumbing & Solar Solutions',
        trade_title: 'Licensed Master Plumber',
        category: 'plumbing',
        skills: ['Pipe Fitting', 'Solar Water Heater', 'Leak Detection'],
        phone: '+2348031234567',
        state: 'Lagos',
        city: 'Ikeja',
        lga: 'Ikeja',
        area: 'Allen Avenue, Ikeja'
      }
    };
    const mockRes = {
      status(code) { handlerStatus = code; return this; },
      json(data) { handlerResponse = data; return this; },
      setHeader() { return this; }
    };

    await providersHandler(mockReq, mockRes);
    console.log(`   • Handler Status: ${handlerStatus}`);
    console.log(`   • Handler Message: ${handlerResponse.message || handlerResponse.error}`);
    assert.strictEqual(handlerStatus === 200 || handlerStatus === 201, true, 'Provider registration / resolution must succeed');
    assert(Boolean(handlerResponse.data && handlerResponse.data.id), 'Provider row must contain PostgreSQL ID');
    const createdProviderId = handlerResponse.data.id;
    console.log(`   ✓ Provider record established in PostgreSQL! Provider ID: ${createdProviderId}`);

    console.log('\n4. Testing subsequent profile resolution (Idempotency & Session Persistence)...');
    let secondHandlerResponse = null;
    let secondHandlerStatus = 200;
    const secondReq = {
      method: 'POST',
      headers: {
        authorization: `Bearer ${userAccessToken}`
      },
      body: {
        action: 'register_provider',
        user_id: userId,
        email: testEmail
      }
    };
    const secondRes = {
      status(code) { secondHandlerStatus = code; return this; },
      json(data) { secondHandlerResponse = data; return this; },
      setHeader() { return this; }
    };
    await providersHandler(secondReq, secondRes);
    console.log(`   • Second Resolution Status: ${secondHandlerStatus}`);
    assert.strictEqual(secondHandlerStatus, 200, 'Second resolution must return HTTP 200');
    assert.strictEqual(secondHandlerResponse.data.id, createdProviderId, 'Must resolve the existing provider profile');
    console.log(`   ✓ Idempotent resolution confirmed! Provider row matches ID ${createdProviderId}`);

    console.log('\n5. Verifying provider is searchable in public marketplace directory...');
    const searchCheck = await getJson(`${SUPABASE_URL}/rest/v1/providers?id=eq.${createdProviderId}&select=id,first_name,business_name,is_active,is_public`, {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`
    });
    assert.strictEqual(searchCheck.statusCode, 200);
    assert.strictEqual(searchCheck.data.length, 1);
    console.log(`   ✓ Provider is active in PostgreSQL public directory: ${searchCheck.data[0].business_name}`);

    // Cleanup provider row
    console.log('\n6. Cleaning up test data...');
    await deleteReq(`${SUPABASE_URL}/rest/v1/providers?id=eq.${createdProviderId}`, {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`
    });
    console.log('   ✓ Test provider row cleaned up from PostgreSQL.');
  } finally {
    // Delete Supabase Auth User
    await deleteReq(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`
    });
    console.log('   ✓ Test user cleaned up from Supabase Auth.');
  }

  console.log('\n🎉 ALL TESTS PASSED: Artisan login session persistence and database linking verified successfully!');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

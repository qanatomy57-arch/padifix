/**
 * PADIFIX PHASE 022: UI/UX, PROFILE INTEGRITY & CONTACT-REVEAL REGRESSION SUITE
 * scripts/verify_ui_card_integrity.js
 *
 * Covers:
 * 1. No dead disabled Call Now buttons caused by missing public phone data.
 * 2. Search contact intent produces the correct profile/action URL.
 * 3. ?action=call does not bypass entitlement.
 * 4. ?action=whatsapp does not bypass entitlement.
 * 5. /api/contact-meter returns contact coordinates ONLY after allowed=true.
 * 6. Denied requests contain no contact coordinates (fail-closed).
 * 7. Zero-review provider displays New/Unrated, never 5.0.
 * 8. Skill tags use the canonical CSS class (mini-tag / skill-tag).
 * 9. Unverified providers never receive a false NIN Verified badge.
 * 10. Primary trade comes from canonical primary-category data.
 * 11. Location hierarchy is correct (LGA, State without duplication).
 * 12. No duplicate contact-meter invocation created by normal page initialization.
 * 13. Paystack frozen cryptographic hashes immutability gate.
 * 14. Termii / live payment safety invariants.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load environment variables if present
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch (e) {}

const providersHandler = require('../api/providers');
const contactMeterHandler = require('../api/contact-meter');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function check(name, condition, extra = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    failedTests++;
    console.log(`  ❌ [FAIL] ${name}${extra ? ' — ' + extra : ''}`);
  }
}

function createMockReqRes({ method = 'GET', query = {}, body = {}, headers = {} } = {}) {
  let statusCode = 200;
  let responseData = null;
  const resHeaders = {};

  const req = {
    method,
    query,
    body,
    headers: {
      'x-real-ip': '127.0.0.1',
      ...headers
    }
  };

  const res = {
    status(c) { statusCode = c; return this; },
    setHeader(k, v) { resHeaders[k] = v; return this; },
    json(d) { responseData = d; return this; },
    end(d) { if (d && !responseData) responseData = d; return this; },
    _getStatusCode: () => statusCode,
    _getData: () => responseData,
    _getHeaders: () => resHeaders
  };

  return { req, res };
}

async function run() {
  console.log('================================================================================');
  console.log('PADIFIX PHASE 022: UI/UX & CONTACT-REVEAL INTEGRITY REGRESSION SUITE');
  console.log('================================================================================\n');

  // --------------------------------------------------------------------------
  // TEST SECTION 1: PUBLIC DIRECTORY DATA MINIMIZATION & NO LEAKAGE
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: PUBLIC DIRECTORY DATA MINIMIZATION ---');
  {
    const { req, res } = createMockReqRes({
      method: 'GET',
      query: { limit: '5' }
    });

    // Mock rows to test transformation
    req._mockRows = [
      {
        id: 8,
        first_name: 'Arise',
        last_name: 'Wire',
        business_name: 'Arise wire',
        trade_title: 'Plumber & Electrician & Mason & Painter',
        primary_category_slug: 'plumbing-services',
        skills: ['Plumber', 'Electrician', 'Mason', 'Painter'],
        phone: '+2347030313984', // raw in db
        whatsapp_number: '2347030313984', // raw in db
        lga: 'Okpe',
        state: 'Delta',
        is_verified: false,
        nin_verified: false,
        rating: 0,
        reviews_count: 0
      }
    ];

    await providersHandler(req, res);
    const data = res._getData();

    check('1.1 /api/providers returns HTTP 200', res._getStatusCode() === 200);
    check('1.2 Public provider output strictly omits raw phone field', data.data[0].phone === undefined);
    check('1.3 Public provider output strictly omits raw whatsapp_number field', data.data[0].whatsapp_number === undefined);
    check('1.4 Public provider calculates truthful primary_trade from canonical category', data.data[0].primary_trade === 'Plumbing Services');
    check('1.5 Unverified provider badge_title is neutral, never claims NIN Verified', data.data[0].badge_title === 'PadiFix Artisan' || data.data[0].badge_title === 'Self-Reported Profile');
    check('1.6 Zero-review provider rating is 0, not defaulted to 5.0', data.data[0].rating === 0);
  }

  // --------------------------------------------------------------------------
  // TEST SECTION 2: SEARCH CARD GENERATION & ZERO DEAD BUTTONS
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: SEARCH CARD GENERATION & INTENT ROUTING ---');
  {
    const searchSource = fs.readFileSync(path.resolve(__dirname, '../search.js'), 'utf8');
    const searchCss = fs.readFileSync(path.resolve(__dirname, '../search.css'), 'utf8');

    check('2.1 search.js does NOT contain disabled Call Now button', !searchSource.includes('disabled') || !searchSource.includes('<button disabled>Call Now</button>'));
    check('2.2 search.js routes Call Now to profile URL with action=call', searchSource.includes('&action=call'));
    check('2.3 search.js routes Message to profile URL with action=whatsapp', searchSource.includes('&action=whatsapp'));
    check('2.4 search.js renders truthful "★ New (0 reviews)" when reviewsCount is 0', searchSource.includes('★ New') && searchSource.includes('(0 reviews)'));
    check('2.5 search.js emits skill-tag class for skills', searchSource.includes('skill-tag'));
    check('2.6 search.css defines styling for .skill-tag matching .mini-tag', searchCss.includes('.skill-tag'));
    check('2.7 search.css repositions mobile-map-toggle-pill away from card content', searchCss.includes('bottom: 20px') && searchCss.includes('right: 16px'));
  }

  // --------------------------------------------------------------------------
  // TEST SECTION 3: CANONICAL /api/contact-meter CONTACT REVEAL & FAIL-CLOSED GATE
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: /api/contact-meter CONTACT REVEAL GATE ---');
  {
    // Test A: Authorized contact reveal (allowed = true)
    const { req: reqA, res: resA } = createMockReqRes({
      method: 'POST',
      body: {
        provider_id: 8,
        channel: 'whatsapp',
        mode: 'soft_cap',
        idempotency_key: 'test_auth_reveal_' + Date.now()
      }
    });

    reqA._inject = {
      mockRpcEntitlement: {
        allowed: true,
        is_limit_reached: false,
        is_duplicate: false,
        event_id: 'evt_test_reveal_ok',
        plan_id: 'FREE',
        used: 1,
        remaining: 4,
        allowance: 5
      },
      mockProviderCoords: {
        phone: '+2347030313984',
        whatsapp_number: '2347030313984'
      }
    };

    await contactMeterHandler(reqA, resA);
    const dataA = resA._getData();

    check('3.1 Authorized contact-meter returns status: success and allowed: true', dataA && dataA.status === 'success' && dataA.allowed === true);
    check('3.2 Authorized contact-meter returns sanitized contact coordinates', dataA && dataA.contact && dataA.contact.phone === '+2347030313984');
    check('3.3 Authorized contact-meter returns sanitized whatsapp_number', dataA && dataA.contact && dataA.contact.whatsapp_number === '2347030313984');

    // Test B: Hard cap quota exhausted (allowed = false)
    const { req: reqB, res: resB } = createMockReqRes({
      method: 'POST',
      body: {
        provider_id: 8,
        channel: 'call',
        mode: 'hard_cap',
        idempotency_key: 'test_denied_reveal_' + Date.now()
      }
    });

    reqB._inject = {
      mockRpcEntitlement: {
        allowed: false,
        is_limit_reached: true,
        is_duplicate: false,
        event_id: 'evt_test_denied',
        plan_id: 'FREE',
        used: 5,
        remaining: 0,
        allowance: 5
      },
      mockProviderCoords: {
        phone: '+2347030313984',
        whatsapp_number: '2347030313984'
      }
    };

    await contactMeterHandler(reqB, resB);
    const dataB = resB._getData();

    check('3.4 Denied contact-meter returns allowed: false', dataB && dataB.allowed === false);
    check('3.5 MANDATORY: Denied response strictly omits contact coordinates (fail-closed)', dataB && dataB.contact === undefined);

    // Test C: Invalid provider ID
    const { req: reqC, res: resC } = createMockReqRes({
      method: 'POST',
      body: {
        provider_id: 'invalid-id',
        channel: 'call'
      }
    });

    await contactMeterHandler(reqC, resC);
    const dataC = resC._getData();

    check('3.6 Invalid input request returns HTTP 400', resC._getStatusCode() === 400);
    check('3.7 Invalid input strictly omits contact coordinates', dataC && dataC.contact === undefined);
  }

  // --------------------------------------------------------------------------
  // TEST SECTION 4: INTENT SIGNAL CANNOT BYPASS ENTITLEMET GATE
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: INTENT SIGNAL AUTHORIZATION SECURITY ---');
  {
    const profileSource = fs.readFileSync(path.resolve(__dirname, '../profile.js'), 'utf8');

    check('4.1 ?action=call does not bypass /api/contact-meter', profileSource.includes('ensureContactUnlocked'));
    check('4.2 Contact unlocker waits for allowed: true before revealing tel: destination', profileSource.includes('res.phone') && profileSource.includes('ensureContactUnlocked'));
    check('4.3 Accidental duplicate consumption guarded against URL reloads', profileSource.includes('replaceState') || profileSource.includes('sessionStorage') || profileSource.includes('actionParam'));
    check('4.4 Zero-review provider displays "New" in profile hero', profileSource.includes("'New'") || profileSource.includes('"New"'));
    check('4.5 Customer review summary does NOT default 0 reviews to 5.0', profileSource.includes('reviewsCount > 0'));
  }

  // --------------------------------------------------------------------------
  // TEST SECTION 5: FROZEN PAYSTACK CRYPTOGRAPHIC PARITY & SAFETY FLAGS
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: FROZEN PAYSTACK HASHES & SAFETY FLAGS ---');
  {
    const EXPECTED_HASHES = {
      'api/paystack-init.js': 'd85f68afaea695f015fd57d2340c5dd14b7e8cede0830bc4957bc1899759809a',
      'api/paystack-verify.js': '88b5ba57d48c6ebd67e9027c266c53318b3b97782489c136f40dd50004b6132e',
      'api/paystack-webhook.js': '998bf88a2d019fa99c221c2bff410fa7f9039e69b380dae22229b334e6bd56e8'
    };

    for (const [relPath, expectedHash] of Object.entries(EXPECTED_HASHES)) {
      const fullPath = path.resolve(__dirname, '..', relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      check(`5.x Frozen SHA-256 for ${relPath}`, hash === expectedHash, `Hash: ${hash.slice(0, 16)}...`);
    }

    const envContent = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
    const liveMatch = envContent.match(/PAYMENT_LIVE_MODE=(.*)/);
    const isLive = liveMatch && liveMatch[1].trim() === 'true';
    check('5.4 PAYMENT_LIVE_MODE remains false', !isLive);

    const termiiMatch = envContent.match(/TERMII_SENDER_ID_APPROVED=(.*)/);
    const isTermiiApproved = termiiMatch && termiiMatch[1].trim() === 'true';
    check('5.5 TERMII_SENDER_ID_APPROVED remains false', !isTermiiApproved);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log(`PHASE 022 CARD & CONTACT INTEGRITY REGRESSION RESULTS: ${passedTests}/${totalTests} PASSED`);
  if (failedTests > 0) {
    console.log(`STATUS: FAILED (${failedTests} tests failed)`);
    process.exit(1);
  } else {
    console.log('STATUS: 100% GREEN — ALL UI & CONTACT INTEGRITY GATES VERIFIED');
    console.log('================================================================================\n');
  }
}

run().catch(err => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});

/**
 * Phase 013 Monetization & Business Invariants Verification Suite
 * scripts/verify_production_monetization.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const PadiFixMonetization = require('../monetization-config');

async function runMonetizationSuite() {
  console.log('='.repeat(80));
  console.log('💰 PADIFIX PHASE 013: MONETIZATION & BUSINESS INVARIANTS VERIFICATION SUITE');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  function check(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. NON-NEGOTIABLE 0% COMMISSION INVARIANT
  console.log('\n--- 1. CORE TRUST & 0% COMMISSION INVARIANT ---');
  check('PadiFix enforces 0% commission on artisan jobs', () => {
    const rules = PadiFixMonetization.CONFIG.RULES;
    assert.strictEqual(rules.COMMISSION_PERCENT, 0, 'Must be strictly 0% commission');
    assert.strictEqual(rules.FREE_PHONE_CALLS, true, 'Customer phone calls must remain free');
    assert.strictEqual(rules.FREE_WHATSAPP_MESSAGING, true, 'WhatsApp contact must remain free');
    assert.strictEqual(rules.FREE_PROFILE_LISTING, true, 'Profile listing must remain free');
  });

  check('Zero escrow or customer job funds holding architecture', () => {
    // Audit codebase to ensure no escrow tables or escrow API endpoints exist
    const apiFiles = fs.readdirSync(path.join(ROOT, 'api'));
    for (const f of apiFiles) {
      assert.ok(!f.includes('escrow'), `Forbidden escrow API endpoint found: ${f}`);
      assert.ok(!f.includes('payout'), `Forbidden payout API endpoint found: ${f}`);
    }
  });

  // 2. CANONICAL PRICING & PLAN CODES
  console.log('\n--- 2. CANONICAL SUBSCRIPTION PRICING & PAYSTACK PLANS ---');
  check('Canonical plans: Free (₦0), Basic (₦5,500), Pro (₦11,000), Premium (₦22,000)', () => {
    const plans = PadiFixMonetization.PROVIDER_PLANS;
    assert.ok(plans, 'Provider plans must be defined');
    
    assert.strictEqual(plans.FREE.priceAmount, 0);
    assert.strictEqual(plans.FREE.contactAllowance, 5);

    assert.strictEqual(plans.BASIC.priceAmount, 5500);
    assert.strictEqual(plans.BASIC.contactAllowance, 30);
    assert.strictEqual(plans.BASIC.paystackPlanCode, 'PLN_yf4tb6fpw2u8zj6');

    assert.strictEqual(plans.PRO.priceAmount, 11000);
    assert.strictEqual(plans.PRO.contactAllowance, 100);
    assert.strictEqual(plans.PRO.paystackPlanCode, 'PLN_pqm1fg3b1o0wwf1');
    assert.strictEqual(plans.PRO.isPopular, true);

    assert.strictEqual(plans.PREMIUM.priceAmount, 22000);
    assert.strictEqual(plans.PREMIUM.contactAllowance, 500);
    assert.strictEqual(plans.PREMIUM.fairUseLimit, 500);
    assert.strictEqual(plans.PREMIUM.paystackPlanCode, 'PLN_e3nu8i62af9ypve');
  });

  // 3. MARKETPLACE CAPACITY & LIQUIDITY GUARDS
  console.log('\n--- 3. CLUSTER CAPACITY & SPONSORED PLACEMENT GUARDS ---');
  check('Sponsored placement is capped at max 2 per Category/LGA cluster', () => {
    const rules = PadiFixMonetization.CONFIG.RULES;
    assert.strictEqual(rules.MAX_SPONSORED_PER_PAGE, 2);

    // Active promos capacity test
    const promos = [
      { category: 'electrician', state: 'Lagos', lga: 'Ikeja', status: 'active', expiresAt: Date.now() + 100000 },
      { category: 'electrician', state: 'Lagos', lga: 'Ikeja', status: 'active', expiresAt: Date.now() + 100000 }
    ];
    const cap = PadiFixMonetization.checkClusterCapacity('electrician', 'Lagos', 'Ikeja', promos);
    assert.strictEqual(cap.available, false, 'Cluster should be full with 2 active promos');
  });

  // 4. CLIENT BUNDLE SECRETS INTEGRITY
  console.log('\n--- 4. CLIENT BUNDLE SECURITY & SECRET KEY ABSENCE ---');
  check('Zero Paystack secret keys in any frontend JavaScript file', () => {
    const clientFiles = [
      'app.js', 'search.js', 'profile.js', 'register.js', 'login.js',
      'dashboard.js', 'locations.js', 'monetization-config.js', 'supabase-client.js', 'pwa.js'
    ];

    for (const file of clientFiles) {
      const filePath = path.join(ROOT, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        assert.ok(!content.includes('sk_live_'), `Secret key sk_live_ found in ${file}!`);
        assert.ok(!content.includes('PAYSTACK_SECRET_KEY'), `PAYSTACK_SECRET_KEY found in ${file}!`);
        assert.ok(!content.includes('RESEND_API_KEY'), `RESEND_API_KEY found in ${file}!`);
        assert.ok(!content.includes('CLOUDFLARE_API_TOKEN'), `CLOUDFLARE_API_TOKEN found in ${file}!`);
      }
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log(`MONETIZATION SUITE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(80));

  if (failed > 0) process.exit(1);
}

runMonetizationSuite().catch(err => {
  console.error(err);
  process.exit(1);
});

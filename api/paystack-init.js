/**
 * PADIFIX — VERCEL SERVERLESS API: Paystack Transaction Initialization
 * POST /api/paystack-init
 *
 * Enforces canonical provider-subscription-only monetization:
 * Free (₦0), Basic (₦5,500/mo & ₦55,000/yr), Pro (₦11,000/mo & ₦110,000/yr), Premium (₦22,000/mo & ₦220,000/yr).
 * Rejects legacy products (PROMOTED_LISTING_STARTER, TRUST_VERIFICATION_AUDIT) and client-supplied pricing overrides.
 * Strictly server-authoritative pricing in kobo.
 */

const https = require('https');
const { withSentry } = require('../lib/sentry-server');

// Legacy products explicitly prohibited from initialization in executable code
const RETIRED_LEGACY_PRODUCTS = new Set([
  'PROMOTED_LISTING_STARTER',
  'TRUST_VERIFICATION_AUDIT',
  'PROMOTED_DISCOVERY',
  'TRUST_VERIFICATION'
]);

function postJson(urlStr, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyStr = JSON.stringify(data);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let resBody = '';
      res.on('data', (chunk) => resBody += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(resBody);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Paystack API timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

// Authoritative Canonical Provider Subscription Plans
const CANONICAL_PLANS = {
  FREE: { id: 'FREE', name: 'Free', amount_kobo: 0, amount_display: '₦0', contacts: 5, paystack_plan_code: null },
  BASIC: {
    id: 'BASIC',
    name: 'Basic',
    amount_kobo: 550000,
    amount_display: '₦5,500',
    annual_amount_kobo: 5500000,
    annual_amount_display: '₦55,000',
    contacts: 30,
    paystack_plan_code: 'PLN_yf4tb6fpw2u8zj6'
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    amount_kobo: 1100000,
    amount_display: '₦11,000',
    annual_amount_kobo: 11000000,
    annual_amount_display: '₦110,000',
    contacts: 100,
    paystack_plan_code: 'PLN_pqm1fg3b1o0wwf1'
  },
  PREMIUM: {
    id: 'PREMIUM',
    name: 'Premium',
    amount_kobo: 2200000,
    amount_display: '₦22,000',
    annual_amount_kobo: 22000000,
    annual_amount_display: '₦220,000',
    contacts: 500,
    paystack_plan_code: 'PLN_e3nu8i62af9ypve'
  }
};

const paystackInitHandler = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const {
      provider_id,
      plan_id,
      product_id,
      email,
      interval,
      billing_interval,
      amount: clientAmount,
      currency: clientCurrency
    } = req.body || {};

    // 1. Reject retired legacy monetization products unconditionally
    const requestedProduct = String(product_id || '').toUpperCase();
    if (requestedProduct && RETIRED_LEGACY_PRODUCTS.has(requestedProduct)) {
      return res.status(400).json({
        error: 'LEGACY_PRODUCT_DEPRECATED',
        message: `Product '${product_id}' has been permanently retired. PadiFix monetization is provider-subscription only.`
      });
    }

    // 2. Validate required provider identifier
    if (!provider_id) {
      return res.status(400).json({ error: 'Missing required provider_id' });
    }

    // 3. Reject initialization attempts without a plan_id (no legacy fallback permitted)
    if (!plan_id) {
      return res.status(400).json({
        error: 'MISSING_PLAN_ID',
        message: 'Plan ID is required. PadiFix monetization operates strictly on provider subscriptions (FREE, BASIC, PRO, PREMIUM).'
      });
    }

    // 4. Validate canonical plan
    const normPlan = String(plan_id).toUpperCase();
    const targetPlan = CANONICAL_PLANS[normPlan];
    if (!targetPlan) {
      return res.status(400).json({
        error: 'INVALID_PLAN_ID',
        message: `Invalid plan_id '${plan_id}'. Authoritative plans are FREE, BASIC, PRO, or PREMIUM.`
      });
    }

    // 5. Free plan: Instant direct activation, no payment gateway involvement
    if (targetPlan.id === 'FREE') {
      return res.status(200).json({
        status: 'success',
        mode: 'DIRECT_ACTIVATION',
        plan_id: 'FREE',
        plan_name: targetPlan.name,
        amount: 0,
        contacts_allowance: targetPlan.contacts,
        message: 'Free plan activated successfully.'
      });
    }

    // 6. Validate billing interval (Monthly or Annual/Annually)
    const rawInterval = String(interval || billing_interval || 'monthly').toLowerCase().trim();
    let canonicalInterval;
    let isAnnual = false;

    if (rawInterval === 'monthly') {
      canonicalInterval = 'monthly';
      isAnnual = false;
    } else if (rawInterval === 'annual' || rawInterval === 'annually' || rawInterval === 'yearly') {
      canonicalInterval = 'annually'; // Authoritative Paystack recurring interval naming
      isAnnual = true;
    } else {
      return res.status(400).json({
        error: 'INVALID_INTERVAL',
        message: `Invalid billing interval '${rawInterval}'. Must be 'monthly' or 'annually'.`
      });
    }

    // 7. Resolve authoritative server-side amount & currency (NEVER TRUST CLIENT VALUES)
    const amountKobo = isAnnual ? targetPlan.annual_amount_kobo : targetPlan.amount_kobo;
    const amountDisplay = isAnnual ? targetPlan.annual_amount_display : targetPlan.amount_display;
    const durationDays = isAnnual ? 365 : 30;

    // Reject client tamper attempts on amount or currency
    if (clientAmount !== undefined && Number(clientAmount) !== amountKobo && Number(clientAmount) !== (amountKobo / 100)) {
      return res.status(400).json({
        error: 'CLIENT_AMOUNT_OVERRIDE_REJECTED',
        message: `Amount cannot be overridden by client. Canonical price is ${amountDisplay} (${amountKobo} kobo).`
      });
    }

    if (clientCurrency !== undefined && String(clientCurrency).toUpperCase() !== 'NGN') {
      return res.status(400).json({
        error: 'CLIENT_CURRENCY_OVERRIDE_REJECTED',
        message: 'Currency cannot be overridden. PadiFix operates strictly in NGN.'
      });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const isLiveMode = process.env.PAYMENT_LIVE_MODE === 'true';

    // Environment consistency validation: Prevent test/live key mixing and fail closed
    if (isLiveMode) {
      if (!secretKey) {
        return res.status(500).json({ error: 'Server Configuration Error: Missing PAYSTACK_SECRET_KEY in Live Mode.' });
      }
      if (!secretKey.startsWith('sk_live_')) {
        return res.status(500).json({ error: 'Environment Mismatch: Non-live secret key configured in Live Mode.' });
      }
    } else {
      if (secretKey && secretKey.startsWith('sk_live_')) {
        return res.status(500).json({ error: 'Environment Mismatch: Live secret key configured in Test Mode.' });
      }
    }

    const timestamp = Date.now();
    const randSuffix = Math.random().toString(36).substring(2, 7);
    const reference = `lok_sub_${timestamp}_${randSuffix}`;
    const orderId = `ord_sub_${timestamp}_${provider_id}`;

    const order = {
      order_id: orderId,
      provider_id: Number(provider_id),
      plan_id: targetPlan.id,
      plan_name: targetPlan.name,
      amount: amountKobo,
      amount_display: amountDisplay,
      currency: 'NGN',
      billing_interval: canonicalInterval,
      duration_days: durationDays,
      paystack_plan_code: isAnnual ? null : targetPlan.paystack_plan_code,
      reference: reference,
      action: 'subscription_upgrade',
      status: 'payment_pending',
      live_mode: isLiveMode,
      created_at: new Date().toISOString()
    };

    const providerEmail = email || `artisan_${provider_id}@padifix.ng`;
    const origin = (req.headers && req.headers.origin) || 'https://padifix.vercel.app';
    const callbackUrl = `${origin}/dashboard.html?payment_ref=${reference}&payment_status=callback&action=subscription`;

    if (secretKey) {
      const initPayload = {
        email: providerEmail,
        amount: amountKobo,
        reference: reference,
        currency: 'NGN',
        callback_url: callbackUrl,
        metadata: {
          order_id: orderId,
          provider_id: Number(provider_id),
          plan_id: targetPlan.id,
          plan_name: targetPlan.name,
          paystack_plan_code: isAnnual ? null : targetPlan.paystack_plan_code,
          action: 'subscription_upgrade',
          billing_interval: canonicalInterval,
          duration_days: durationDays
        }
      };

      // Attach Paystack Recurring Plan Code if monthly has a configured plan code
      if (targetPlan.paystack_plan_code && !isAnnual) {
        initPayload.plan = targetPlan.paystack_plan_code;
      }

      const paystackRes = await postJson('https://api.paystack.co/transaction/initialize', initPayload, {
        'Authorization': `Bearer ${secretKey}`
      });

      if (paystackRes.status === 200 && paystackRes.data && paystackRes.data.status) {
        return res.status(200).json({
          status: 'success',
          authorization_url: paystackRes.data.data.authorization_url,
          access_code: paystackRes.data.data.access_code,
          reference: reference,
          plan: targetPlan,
          paystack_plan_code: isAnnual ? null : targetPlan.paystack_plan_code,
          order: order
        });
      } else {
        return res.status(502).json({
          error: 'Paystack subscription transaction initialization failed',
          details: paystackRes.data ? paystackRes.data.message : 'Unknown gateway error'
        });
      }
    }

    // Fail-closed in live mode: never allow sandbox mock in live mode
    if (isLiveMode) {
      return res.status(500).json({ error: 'Server Configuration Error: Live mode requires active secret key.' });
    }

    // Test sandbox mode fallback
    const mockAuthUrl = `https://checkout.paystack.com/test-mock-${reference}`;
    return res.status(200).json({
      status: 'success',
      mode: 'TEST_SANDBOX',
      authorization_url: mockAuthUrl,
      reference: reference,
      plan: targetPlan,
      paystack_plan_code: isAnnual ? null : targetPlan.paystack_plan_code,
      order: order
    });

  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = withSentry(paystackInitHandler, 'paystack_init');


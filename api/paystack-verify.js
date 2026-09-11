/**
 * LOKATOR.NG — VERCEL SERVERLESS API: Paystack Transaction Verification
 * POST /api/paystack-verify
 *
 * Verifies Paystack transaction server-side against Paystack API.
 * Validates: status === 'success', amount === 200000 kobo, currency === 'NGN', matching reference.
 * Idempotently fulfills PROMOTED_LISTING with 14-day expiration.
 */

const https = require('https');
const { withSentry } = require('../lib/sentry-server');

function getJson(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: headers,
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
    req.on('timeout', () => { req.destroy(); reject(new Error('Paystack Verify API timeout')); });
    req.end();
  });
}

const CANONICAL_PLANS = {
  BASIC: {
    id: 'BASIC',
    name: 'Basic',
    amount_kobo: 550000,
    amount_display: '₦5,500',
    annual_amount_kobo: 5500000,
    annual_amount_display: '₦55,000',
    contacts: 30,
    search_boost: 5,
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
    search_boost: 15,
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
    search_boost: 25,
    paystack_plan_code: 'PLN_e3nu8i62af9ypve'
  }
};

const paystackVerifyHandler = async (req, res) => {
  // ── Consolidated Route: Receipt Resend ──────────────────────────
  // Vercel rewrite: /api/receipt-resend → /api/paystack-verify?__route=receipt-resend
  // This avoids exceeding the 12-function Hobby plan limit.
  const routeOverride = req.query?.__route || (req.url && new URL(req.url, 'http://localhost').searchParams.get('__route'));
  if (routeOverride === 'receipt-resend') {
    const receiptResendHandler = require('./receipt-resend');
    return receiptResendHandler(req, res);
  }

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
    const { reference, provider_id, plan_id, interval } = req.body || {};

    if (!reference) {
      return res.status(400).json({ error: 'Missing required reference' });
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

    const now = Date.now();
    const isSubscription = reference.startsWith('lok_sub_') || Boolean(plan_id);

    if (secretKey) {
      const verifyRes = await getJson(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        'Authorization': `Bearer ${secretKey}`
      });

      if (verifyRes.status !== 200 || !verifyRes.data || !verifyRes.data.status) {
        return res.status(400).json({
          status: 'failed',
          error: 'Transaction verification failed at gateway',
          gateway_message: verifyRes.data ? verifyRes.data.message : 'Invalid transaction'
        });
      }

      const tx = verifyRes.data.data;

      // 1. Validate status
      if (tx.status !== 'success') {
        return res.status(400).json({
          status: 'failed',
          error: `Transaction status is '${tx.status}', expected 'success'`
        });
      }

      // 2. Validate currency
      if (tx.currency !== 'NGN') {
        return res.status(400).json({
          status: 'failed',
          error: `Transaction currency mismatch: received ${tx.currency}, expected 'NGN'`
        });
      }

      const meta = tx.metadata || {};
      const targetProviderId = meta.provider_id || provider_id;

      // Branch A: Subscription Transaction Verification
      if (isSubscription || meta.action === 'subscription_upgrade' || meta.plan_id) {
        const resolvedPlanKey = String(meta.plan_id || plan_id || '').toUpperCase();
        let targetPlan = CANONICAL_PLANS[resolvedPlanKey];
        if (!targetPlan) {
          // Fallback resolution by exact amount (monthly or annual)
          targetPlan = Object.values(CANONICAL_PLANS).find(p => p.amount_kobo === tx.amount || p.annual_amount_kobo === tx.amount);
        }

        if (!targetPlan) {
          return res.status(400).json({
            status: 'failed',
            error: `Unrecognized subscription plan or amount: ${tx.amount} kobo`
          });
        }

        const isAnnualTx = (tx.amount === targetPlan.annual_amount_kobo) || 
                           (meta.billing_interval === 'annual') || 
                           (String(interval).toLowerCase() === 'annual');
        const expectedAmount = isAnnualTx ? targetPlan.annual_amount_kobo : targetPlan.amount_kobo;

        // Authoritative amount validation
        if (tx.amount !== expectedAmount) {
          return res.status(400).json({
            status: 'failed',
            error: `Transaction amount mismatch: received ${tx.amount}, expected ${expectedAmount} kobo for ${targetPlan.name}`
          });
        }

        const durationDays = isAnnualTx ? 365 : 30;
        const subDurationMs = durationDays * 24 * 60 * 60 * 1000;
        const subExpiresAt = new Date(now + subDurationMs).toISOString();

        return res.status(200).json({
          status: 'success',
          verified: true,
          reference: tx.reference,
          amount: tx.amount,
          currency: tx.currency,
          provider_id: targetProviderId,
          plan_id: targetPlan.id,
          plan_name: targetPlan.name,
          subscription: {
            status: 'active',
            plan_id: targetPlan.id,
            plan_name: targetPlan.name,
            paystack_plan_code: targetPlan.paystack_plan_code,
            effective_from: new Date(now).toISOString(),
            effective_until: subExpiresAt,
            contacts_allowance: targetPlan.contacts,
            search_boost_percent: targetPlan.search_boost,
            billing_interval: isAnnualTx ? 'annual' : 'monthly',
            duration_days: durationDays
          },
          message: `Payment verified successfully. ${targetPlan.name} subscription is active.`
        });
      }

      // Branch B: Pilot Promoted Listing Verification (₦2,000 / 200,000 kobo)
      if (tx.amount !== 200000) {
        return res.status(400).json({
          status: 'failed',
          error: `Transaction amount mismatch: received ${tx.amount}, expected 200000 kobo`
        });
      }

      const durationMs = 14 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(now + durationMs).toISOString();

      return res.status(200).json({
        status: 'success',
        verified: true,
        reference: tx.reference,
        amount: tx.amount,
        currency: tx.currency,
        provider_id: targetProviderId,
        product_id: 'PROMOTED_LISTING_STARTER',
        entitlement: {
          key: 'PROMOTED_LISTING',
          status: 'active',
          effective_from: new Date(now).toISOString(),
          effective_until: expiresAt,
          duration_days: 14
        },
        message: 'Payment verified successfully. Promoted Category Placement is active.'
      });
    }

    // Fail-closed in live mode
    if (isLiveMode) {
      return res.status(500).json({ error: 'Server Configuration Error: Live mode requires active secret key.' });
    }

    // Standard test sandbox verification response
    if (isSubscription) {
      const resolvedPlanKey = String(plan_id || 'PRO').toUpperCase();
      const targetPlan = CANONICAL_PLANS[resolvedPlanKey] || CANONICAL_PLANS.PRO;
      const isAnnualTx = String(interval).toLowerCase() === 'annual';
      const durationDays = isAnnualTx ? 365 : 30;
      const subDurationMs = durationDays * 24 * 60 * 60 * 1000;
      const subExpiresAt = new Date(now + subDurationMs).toISOString();
      const amountKobo = isAnnualTx ? targetPlan.annual_amount_kobo : targetPlan.amount_kobo;

      return res.status(200).json({
        status: 'success',
        mode: 'TEST_SANDBOX',
        verified: true,
        reference: reference,
        amount: amountKobo,
        currency: 'NGN',
        provider_id: provider_id,
        plan_id: targetPlan.id,
        plan_name: targetPlan.name,
        subscription: {
          status: 'active',
          plan_id: targetPlan.id,
          plan_name: targetPlan.name,
          effective_from: new Date(now).toISOString(),
          effective_until: subExpiresAt,
          contacts_allowance: targetPlan.contacts,
          search_boost_percent: targetPlan.search_boost,
          billing_interval: isAnnualTx ? 'annual' : 'monthly',
          duration_days: durationDays
        },
        message: `Test sandbox payment verified. ${targetPlan.name} subscription is active.`
      });
    }

    const durationMs = 14 * 24 * 60 * 60 * 1000; // 14 days
    const expiresAt = new Date(now + durationMs).toISOString();

    return res.status(200).json({
      status: 'success',
      mode: 'TEST_SANDBOX',
      verified: true,
      reference: reference,
      amount: 200000,
      currency: 'NGN',
      provider_id: provider_id,
      product_id: 'PROMOTED_LISTING_STARTER',
      entitlement: {
        key: 'PROMOTED_LISTING',
        status: 'active',
        effective_from: new Date(now).toISOString(),
        effective_until: expiresAt,
        duration_days: 14
      },
      message: 'Test sandbox payment verified. Promoted Category Placement is active.'
    });

  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = withSentry(paystackVerifyHandler, 'paystack_verify');

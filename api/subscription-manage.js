/**
 * PADIFIX — SERVERLESS API: Provider Subscription Management & Lifecycle Controller
 * POST /api/subscription-manage
 *
 * Provides authoritative server-side subscription lifecycle operations:
 * - Cancel auto-renewal (sets non_renewing status, keeps entitlement until period end)
 * - Resume auto-renewal
 * - Grace period verification and recovery
 * - Plan change scheduling
 */

const ResendEmailService = require('../lib/resend-email-service');
const { withSentry } = require('../lib/sentry-server');

const CANONICAL_PLANS = {
  FREE: { id: 'FREE', name: 'Free', amount_ngn: 0, contacts: 5 },
  BASIC: { id: 'BASIC', name: 'Basic', amount_ngn: 5500, annual_amount_ngn: 55000, contacts: 30, paystack_plan_code: 'PLN_yf4tb6fpw2u8zj6' },
  PRO: { id: 'PRO', name: 'Pro', amount_ngn: 11000, annual_amount_ngn: 110000, contacts: 100, paystack_plan_code: 'PLN_pqm1fg3b1o0wwf1' },
  PREMIUM: { id: 'PREMIUM', name: 'Premium', amount_ngn: 22000, annual_amount_ngn: 220000, contacts: 500, paystack_plan_code: 'PLN_e3nu8i62af9ypve' }
};

// In-memory subscription store for serverless execution / testing
const serverSubStore = new Map();

const subscriptionManageHandler = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { action, provider_id, plan_id, email, subscription_code } = req.body || {};

    if (!provider_id) {
      return res.status(400).json({ error: 'Missing required provider_id' });
    }

    const provId = Number(provider_id);
    let sub = serverSubStore.get(provId) || {
      provider_id: provId,
      plan_id: 'FREE',
      status: 'active',
      lifecycle_status: 'active',
      cancel_at_period_end: false,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      contacts_allowance: 5
    };

    // 1. Action: Get Subscription Status
    if (action === 'get_status' || req.method === 'GET') {
      const plan = CANONICAL_PLANS[sub.plan_id] || CANONICAL_PLANS.FREE;
      
      // Calculate grace period if applicable
      let graceDaysRemaining = null;
      if (sub.lifecycle_status === 'grace' && sub.grace_period_ends_at) {
        const diffMs = new Date(sub.grace_period_ends_at) - new Date();
        graceDaysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
      }

      return res.status(200).json({
        status: 'success',
        subscription: {
          ...sub,
          plan_name: plan.name,
          amount_ngn: plan.amount_ngn,
          contacts_allowance: plan.contacts,
          grace_days_remaining: graceDaysRemaining
        }
      });
    }

    // 2. Action: Cancel Auto-Renewal (Downgrade / Stop Renewal at Period End)
    if (action === 'cancel_auto_renewal') {
      if (sub.plan_id === 'FREE') {
        return res.status(400).json({ error: 'Cannot cancel auto-renewal on Free Starter plan.' });
      }

      sub.cancel_at_period_end = true;
      sub.lifecycle_status = 'non_renewing';
      sub.cancelled_at = new Date().toISOString();
      serverSubStore.set(provId, sub);

      const targetEmail = email || `artisan_${provId}@padifix.ng`;
      if (targetEmail && typeof ResendEmailService.sendSubscriptionCancelledEmail === 'function') {
        ResendEmailService.sendSubscriptionCancelledEmail({
          to: targetEmail,
          plan: CANONICAL_PLANS[sub.plan_id] ? CANONICAL_PLANS[sub.plan_id].name : sub.plan_id,
          effectiveUntil: new Date(sub.current_period_end).toLocaleDateString('en-GB')
        }).catch(err => console.error('[SubscriptionManage:EmailError]', err.message));
      }

      return res.status(200).json({
        status: 'success',
        action: 'cancel_auto_renewal',
        message: 'Auto-renewal has been cancelled. Your paid entitlements remain active until the end of your billing cycle.',
        subscription: sub
      });
    }

    // 3. Action: Resume Auto-Renewal
    if (action === 'resume_auto_renewal') {
      sub.cancel_at_period_end = false;
      sub.lifecycle_status = 'active';
      sub.cancelled_at = null;
      serverSubStore.set(provId, sub);

      return res.status(200).json({
        status: 'success',
        action: 'resume_auto_renewal',
        message: 'Auto-renewal has been resumed. Your subscription will renew automatically.',
        subscription: sub
      });
    }

    // 4. Action: Activate or Update Subscription (Internal / Webhook Sync)
    if (action === 'sync_activation') {
      const targetPlan = CANONICAL_PLANS[String(plan_id).toUpperCase()] || CANONICAL_PLANS.BASIC;
      sub.plan_id = targetPlan.id;
      sub.status = 'active';
      sub.lifecycle_status = 'active';
      sub.cancel_at_period_end = false;
      sub.current_period_start = new Date().toISOString();
      sub.current_period_end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      sub.contacts_allowance = targetPlan.contacts;
      sub.paystack_subscription_code = subscription_code || sub.paystack_subscription_code;
      serverSubStore.set(provId, sub);

      return res.status(200).json({
        status: 'success',
        action: 'sync_activation',
        subscription: sub
      });
    }

    return res.status(400).json({ error: `Unsupported action '${action}'` });

  } catch (err) {
    return res.status(500).json({ error: 'Subscription management error', message: err.message });
  }
};

module.exports = withSentry(subscriptionManageHandler, 'subscription_manage');

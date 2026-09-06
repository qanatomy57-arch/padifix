/**
 * LOKATOR.NG — VERCEL SERVERLESS API: Paystack Webhook Handler
 * POST /api/paystack-webhook
 *
 * Validates Paystack HMAC-SHA512 signature in `x-paystack-signature` header.
 * Idempotently processes `charge.success` events for the Promoted Category Placement pilot.
 */

const crypto = require('crypto');
const ResendEmailService = require('../lib/resend-email-service');
const { withSentry } = require('../lib/sentry-server');

// In-memory processed webhook event ID cache with payload hash for replay/tamper detection
const processedEvents = new Map();
// In-memory email receipt delivery deduplication cache (Email Idempotency Guard)
const sentReceipts = new Set();

// Canonical Plan Map for verification (Phase 012 Launch Subscription Pricing)
const WEBHOOK_PLANS = {
  // Monthly Plans
  550000: { id: 'BASIC', name: 'Basic', contacts: 30, amount_display: '₦5,500', interval: 'monthly', paystack_plan_code: 'PLN_yf4tb6fpw2u8zj6' },
  1100000: { id: 'PRO', name: 'Pro', contacts: 100, amount_display: '₦11,000', interval: 'monthly', paystack_plan_code: 'PLN_pqm1fg3b1o0wwf1' },
  2200000: { id: 'PREMIUM', name: 'Premium', contacts: 500, amount_display: '₦22,000', interval: 'monthly', paystack_plan_code: 'PLN_e3nu8i62af9ypve' },
  // Annual Plans (2 months free discount)
  5500000: { id: 'BASIC', name: 'Basic (Annual)', contacts: 30, amount_display: '₦55,000', interval: 'annual', paystack_plan_code: null },
  11000000: { id: 'PRO', name: 'Pro (Annual)', contacts: 100, amount_display: '₦110,000', interval: 'annual', paystack_plan_code: null },
  22000000: { id: 'PREMIUM', name: 'Premium (Annual)', contacts: 500, amount_display: '₦220,000', interval: 'annual', paystack_plan_code: null }
};

const WEBHOOK_PLAN_CODES = {
  'PLN_yf4tb6fpw2u8zj6': { id: 'BASIC', name: 'Basic', contacts: 30, amount: 550000, amount_display: '₦5,500' },
  'PLN_pqm1fg3b1o0wwf1': { id: 'PRO', name: 'Pro', contacts: 100, amount: 1100000, amount_display: '₦11,000' },
  'PLN_e3nu8i62af9ypve': { id: 'PREMIUM', name: 'Premium', contacts: 500, amount: 2200000, amount_display: '₦22,000' },
  // Backward compatibility aliases
  'PLN_padifix_basic': { id: 'BASIC', name: 'Basic', contacts: 30, amount: 550000, amount_display: '₦5,500' },
  'PLN_padifix_pro': { id: 'PRO', name: 'Pro', contacts: 100, amount: 1100000, amount_display: '₦11,000' },
  'PLN_padifix_premium': { id: 'PREMIUM', name: 'Premium', contacts: 500, amount: 2200000, amount_display: '₦22,000' }
};

const paystackWebhookHandler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const signature = req.headers['x-paystack-signature'];
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

    // Retrieve raw request body for HMAC verification
    let rawBody = req.body;
    if (typeof rawBody === 'object' && rawBody !== null && !Buffer.isBuffer(rawBody)) {
      rawBody = JSON.stringify(rawBody);
    } else if (Buffer.isBuffer(rawBody)) {
      rawBody = rawBody.toString('utf8');
    }

    // Require secret key in production or live mode
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production' || isLiveMode;
    if (!secretKey && isProd) {
      return res.status(500).json({ error: 'Server Configuration Error: Missing PAYSTACK_SECRET_KEY in production.' });
    }

    if (secretKey) {
      if (!signature) {
        return res.status(401).json({ error: 'Missing x-paystack-signature header' });
      }

      const expectedSignature = crypto
        .createHmac('sha512', secretKey)
        .update(rawBody || '')
        .digest('hex');

      // Constant-time signature comparison to prevent timing attacks
      let isSigValid = false;
      try {
        const signatureBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        if (signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
          isSigValid = true;
        }
      } catch (sigErr) {
        return res.status(401).json({ error: 'Invalid webhook signature format' });
      }

      if (!isSigValid) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    // Safely parse JSON payload with explicit bad request handling
    let event = null;
    try {
      event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch (parseErr) {
      return res.status(400).json({ error: 'Malformed JSON payload in webhook request' });
    }

    if (!event || typeof event !== 'object') {
      return res.status(400).json({ error: 'Invalid webhook payload structure' });
    }

    const eventId = String(event && (event.id || (event.data && event.data.id) || (event.data && event.data.reference) || ''));

    // Compute payload hash for replay tamper detection
    const payloadHash = crypto.createHash('sha256').update(rawBody || '').digest('hex');

    // Replay attack and idempotency check
    if (eventId && processedEvents.has(eventId)) {
      const priorHash = processedEvents.get(eventId);
      if (priorHash !== payloadHash) {
        return res.status(409).json({ error: 'Tampered payload replay with recycled event ID' });
      }
      return res.status(200).json({ status: 'success', message: 'Event already processed (idempotent)', idempotent: true });
    }

    if (eventId) {
      processedEvents.set(eventId, payloadHash);
      // Clean cache if too large (FIFO max 1000 items)
      if (processedEvents.size > 1000) {
        const oldestKey = processedEvents.keys().next().value;
        processedEvents.delete(oldestKey);
      }
    }

    const eventType = event ? event.event : '';
    const data = (event && event.data) || {};
    const reference = data.reference || '';
    const amount = data.amount;
    const currency = data.currency;
    const metadata = data.metadata || {};

    // 1. Handle Successful Payment (charge.success)
    if (eventType === 'charge.success') {
      if (currency !== 'NGN') {
        return res.status(400).json({ error: 'Invalid currency' });
      }

      // Branch A: Subscription Plan Charge
      const isSub = (reference && reference.startsWith('lok_sub_')) || 
                    metadata.action === 'subscription_upgrade' || 
                    Boolean(metadata.plan_id) ||
                    Boolean(data.plan) ||
                    Boolean(data.subscription_code) ||
                    Boolean(WEBHOOK_PLANS[amount]);

      if (isSub) {
        let plan = WEBHOOK_PLANS[amount];
        if (!plan && data.plan && data.plan.plan_code) {
          plan = WEBHOOK_PLAN_CODES[data.plan.plan_code];
        }
        if (!plan) {
          const planKey = String(metadata.plan_id || 'PRO').toUpperCase();
          plan = Object.values(WEBHOOK_PLANS).find(p => p.id === planKey) || WEBHOOK_PLANS[1100000];
        }

        const isRenewal = Boolean(data.subscription_code || data.subscription || metadata.is_renewal);
        const recipientEmail = (data.customer && data.customer.email) || metadata.email;

        // Asynchronously dispatch Resend receipt email with Email Idempotency Guard (preventing duplicate receipts on webhook retries)
        const isReceiptAlreadySent = reference && sentReceipts.has(reference);
        if (!isReceiptAlreadySent && recipientEmail && typeof ResendEmailService.sendPaymentSuccessfulEmail === 'function') {
          if (reference) sentReceipts.add(reference);
          ResendEmailService.sendPaymentSuccessfulEmail({
            to: recipientEmail,
            providerName: metadata.provider_name || 'Artisan',
            amount: plan.amount_display || `₦${(amount / 100).toLocaleString()}`,
            plan: plan.name,
            reference: reference,
            nextRenewal: plan.interval === 'annual' ? '365 days from today' : '30 days from today',
            isRenewal
          }).catch(err => {
            console.error('[Webhook:EmailError]', err.message);
            // On network failure, clear deduplication guard to permit retry
            if (reference) sentReceipts.delete(reference);
          });
        }

        const isAnnualPlan = plan.interval === 'annual';
        const durationDays = isAnnualPlan ? 365 : 30;

        return res.status(200).json({
          status: 'success',
          event: 'charge.success',
          reference: reference,
          provider_id: metadata.provider_id,
          fulfilled: true,
          entitlement: 'SUBSCRIPTION',
          plan_id: plan.id,
          plan_name: plan.name,
          paystack_plan_code: plan.paystack_plan_code,
          contacts_allowance: plan.contacts,
          is_renewal: isRenewal,
          billing_interval: plan.interval || 'monthly',
          subscription_code: data.subscription_code || (data.subscription && data.subscription.subscription_code) || null,
          duration_days: durationDays
        });
      }

      // Branch B: Promoted Category Placement Pilot (200000 kobo = ₦2,000)
      if (amount === 200000) {
        return res.status(200).json({
          status: 'success',
          event: 'charge.success',
          reference: reference,
          provider_id: metadata.provider_id,
          fulfilled: true,
          entitlement: 'PROMOTED_LISTING',
          duration_days: 14
        });
      }
    }

    // 2. Handle Subscription Creation (subscription.create)
    if (eventType === 'subscription.create') {
      const planCode = data.plan && data.plan.plan_code;
      const resolvedPlan = WEBHOOK_PLAN_CODES[planCode] || WEBHOOK_PLANS[data.amount] || { id: 'PRO', name: 'Pro', contacts: 100, amount_display: '₦11,000/month' };
      const recipientEmail = data.customer && data.customer.email;

      if (recipientEmail && typeof ResendEmailService.sendSubscriptionActivatedEmail === 'function') {
        ResendEmailService.sendSubscriptionActivatedEmail({
          to: recipientEmail,
          providerName: (data.customer && data.customer.first_name) || 'Artisan',
          plan: resolvedPlan.name,
          price: resolvedPlan.amount_display || '₦11,000/month',
          nextRenewalDate: data.next_payment_date ? new Date(data.next_payment_date).toLocaleDateString('en-GB') : 'Next Month',
          contactAllowance: resolvedPlan.contacts || 100
        }).catch(err => console.error('[Webhook:EmailError]', err.message));
      }

      return res.status(200).json({
        status: 'success',
        event: 'subscription.create',
        subscription_code: data.subscription_code,
        customer_email: recipientEmail,
        plan_id: resolvedPlan.id,
        plan_code: planCode,
        next_payment_date: data.next_payment_date,
        status_applied: 'active'
      });
    }

    // 3. Handle Renewal Payment Failure (invoice.payment_failed)
    if (eventType === 'invoice.payment_failed') {
      const graceDays = 3;
      const gracePeriodEndsAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000).toISOString();
      const recipientEmail = data.customer && data.customer.email;

      if (recipientEmail && typeof ResendEmailService.sendPaymentFailedEmail === 'function') {
        ResendEmailService.sendPaymentFailedEmail({
          to: recipientEmail,
          providerName: (data.customer && data.customer.first_name) || 'Artisan',
          plan: (data.plan && data.plan.name) || 'Pro',
          reason: (data.description || 'Card payment declined'),
          graceDaysRemaining: graceDays
        }).catch(err => console.error('[Webhook:EmailError]', err.message));
      }

      return res.status(200).json({
        status: 'success',
        event: 'invoice.payment_failed',
        subscription_code: data.subscription_code,
        status_applied: 'past_due',
        lifecycle_status: 'grace',
        grace_period_days: graceDays,
        grace_period_ends_at: gracePeriodEndsAt,
        notice: `Provider subscription entered ${graceDays}-day grace period. Profile remains visible and searchable.`
      });
    }

    // 4. Handle Subscription Disable / Cancellation (subscription.disable)
    if (eventType === 'subscription.disable') {
      const recipientEmail = data.customer && data.customer.email;

      if (recipientEmail && typeof ResendEmailService.sendSubscriptionCancelledEmail === 'function') {
        ResendEmailService.sendSubscriptionCancelledEmail({
          to: recipientEmail,
          providerName: (data.customer && data.customer.first_name) || 'Artisan',
          plan: (data.plan && data.plan.name) || 'Pro',
          effectiveUntil: 'Current billing period end'
        }).catch(err => console.error('[Webhook:EmailError]', err.message));
      }

      return res.status(200).json({
        status: 'success',
        event: 'subscription.disable',
        subscription_code: data.subscription_code,
        status_applied: 'cancelled',
        lifecycle_status: 'non_renewing',
        notice: 'Provider subscription auto-renewal cancelled. Entitlement remains valid through paid period.'
      });
    }

    // 5. Handle Upcoming Invoice Notification (invoice.create)
    if (eventType === 'invoice.create') {
      return res.status(200).json({
        status: 'success',
        event: 'invoice.create',
        subscription_code: data.subscription_code,
        amount: data.amount,
        period_start: data.period_start,
        period_end: data.period_end,
        notice: 'Upcoming renewal invoice acknowledged.'
      });
    }

    // Acknowledge other webhook events safely
    return res.status(200).json({ status: 'success', message: 'Webhook acknowledged', event: eventType });

  } catch (err) {
    return res.status(500).json({ error: 'Webhook processing error', message: err.message });
  }
};

module.exports = withSentry(paystackWebhookHandler, 'paystack_webhook');

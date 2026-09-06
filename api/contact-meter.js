/**
 * PADIFIX — SERVERLESS API: Contact & Lead Metering Gateway
 * POST /api/contact-meter
 *
 * Implements server-authoritative, atomic contact metering with idempotency.
 * Counts:
 *   - WhatsApp initiation = 1 contact
 *   - Phone call initiation = 1 contact
 *
 * Invariants:
 *   - Never stores or inspects WhatsApp message content.
 *   - Never records or stores phone call audio.
 *   - Prevents double-consumption via 15-minute idempotency window.
 *   - Enforces Free limit (5/month) without deleting or hiding provider.
 */

const crypto = require('crypto');
const { withSentry } = require('../lib/sentry-server');

// In-memory usage store for serverless execution / testing
// Structure: Map<`${provider_id}_${billing_period}`, { used, whatsapp, call, plan_id }>
const usageStore = new Map();

// Idempotency cache: Map<idempotency_key, { timestamp, response }>
const idempotencyCache = new Map();

const PLAN_ALLOWANCES = {
  FREE: { id: 'FREE', name: 'Free', allowance: 5, fairUse: 5 },
  BASIC: { id: 'BASIC', name: 'Basic', allowance: 30, fairUse: 30 },
  PRO: { id: 'PRO', name: 'Pro', allowance: 100, fairUse: 100 },
  PREMIUM: { id: 'PREMIUM', name: 'Premium', allowance: 'unlimited', fairUse: 500 }
};

function getLagosBillingPeriod(date = new Date()) {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit'
  });
  return formatter.format(d).substring(0, 7); // 'YYYY-MM'
}

const contactMeterHandler = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Read-only check of current usage
  if (req.method === 'GET') {
    try {
      const providerId = req.query.provider_id || (req.url && new URL(req.url, 'http://localhost').searchParams.get('provider_id'));
      if (!providerId) {
        return res.status(400).json({ error: 'Missing provider_id' });
      }
      const period = getLagosBillingPeriod();
      const storeKey = `${providerId}_${period}`;
      const record = usageStore.get(storeKey) || { used: 0, whatsapp: 0, call: 0, plan_id: 'FREE' };
      const plan = PLAN_ALLOWANCES[record.plan_id] || PLAN_ALLOWANCES.FREE;
      const isUnlimited = plan.allowance === 'unlimited';
      const cap = isUnlimited ? plan.fairUse : plan.allowance;
      const remaining = Math.max(0, cap - record.used);

      return res.status(200).json({
        status: 'success',
        provider_id: Number(providerId),
        billing_period: period,
        plan_id: plan.id,
        plan_name: plan.name,
        allowance: plan.allowance,
        contacts_used: record.used,
        whatsapp_contacts: record.whatsapp,
        phone_contacts: record.call,
        contacts_remaining: remaining,
        limit_reached: record.used >= cap
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { provider_id, channel, idempotency_key, session_token, plan_id, reset_period } = req.body || {};

    if (!provider_id) {
      return res.status(400).json({ error: 'Missing required provider_id' });
    }

    const normChannel = String(channel || '').toLowerCase().trim();
    if (!['whatsapp', 'call'].includes(normChannel)) {
      return res.status(400).json({ error: "Invalid channel. Must be 'whatsapp' or 'call'." });
    }

    const period = getLagosBillingPeriod();
    const storeKey = `${provider_id}_${period}`;

    // Admin / Test simulation: Reset period usage if requested in non-production test mode
    if (reset_period) {
      const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
      if (isProd) {
        return res.status(403).json({ error: 'Forbidden: Reset simulation hook is strictly disabled in production.' });
      }
      usageStore.set(storeKey, { used: 0, whatsapp: 0, call: 0, plan_id: plan_id || 'FREE' });
      return res.status(200).json({ status: 'success', message: `Usage reset for ${storeKey}` });
    }

    // Resolve or generate idempotency key
    // Requirement A: duplicate tap suppression (same key -> cached deduplication)
    // Requirement B: independent contact preservation (distinct event UUIDs -> distinct metering)
    const clientHeaderKey = req.headers && req.headers['x-idempotency-key'];
    const timeBucket15m = Math.floor(Date.now() / (15 * 60 * 1000));
    const effectiveKey = idempotency_key || clientHeaderKey || 
      (session_token 
        ? `idem_${provider_id}_${normChannel}_${session_token}_${timeBucket15m}` 
        : `idem_${provider_id}_${normChannel}_${crypto.randomUUID()}`);

    // Check idempotency cache (Prevents double clicks, browser refreshes, network retries)
    if (idempotencyCache.has(effectiveKey)) {
      const cached = idempotencyCache.get(effectiveKey);
      const currentRec = usageStore.get(storeKey);
      return res.status(200).json({
        ...cached,
        contacts_used: currentRec ? currentRec.used : cached.contacts_used,
        is_duplicate: true,
        idempotent: true
      });
    }

    // Resolve Provider Plan and current usage
    let record = usageStore.get(storeKey);
    if (!record) {
      const initialPlan = String(plan_id || 'FREE').toUpperCase();
      record = { used: 0, whatsapp: 0, call: 0, plan_id: initialPlan };
      usageStore.set(storeKey, record);
    } else if (plan_id && plan_id !== record.plan_id) {
      // Reflect updated plan entitlement
      record.plan_id = String(plan_id).toUpperCase();
    }

    const plan = PLAN_ALLOWANCES[record.plan_id] || PLAN_ALLOWANCES.FREE;
    const isUnlimited = plan.allowance === 'unlimited';
    const limit = isUnlimited ? plan.fairUse : plan.allowance;

    // Enforcement: Check if monthly limit reached
    if (record.used >= limit) {
      const isSoftCap = Boolean(req.body && (req.body.mode === 'soft_cap' || req.body.soft_cap));

      if (isSoftCap) {
        record.used += 1;
        if (normChannel === 'whatsapp') {
          record.whatsapp += 1;
        } else {
          record.call += 1;
        }
      }

      const responsePayload = {
        status: isSoftCap ? 'success' : 'limit_reached',
        allowed: isSoftCap ? true : false,
        soft_cap: isSoftCap,
        limit_reached: true,
        quota_exhausted: true,
        upgrade_required: true,
        provider_id: Number(provider_id),
        channel: normChannel,
        billing_period: period,
        plan_id: plan.id,
        plan_name: plan.name,
        contacts_used: record.used,
        contacts_remaining: 0,
        allowance: plan.allowance,
        idempotency_key: effectiveKey,
        upgrade_recommended: plan.id === 'FREE' ? 'BASIC' : 'PRO',
        upgrade_price_display: '₦5,500/month',
        message: plan.id === 'FREE'
          ? "You've reached your 5 customer contact limit for this month. Upgrade to Basic — ₦5,500/month."
          : `Monthly contact limit of ${limit} reached for ${plan.name} plan.`
      };

      // Cache response for idempotency
      idempotencyCache.set(effectiveKey, responsePayload);
      if (idempotencyCache.size > 2000) {
        const oldestKey = idempotencyCache.keys().next().value;
        idempotencyCache.delete(oldestKey);
      }
      return res.status(200).json(responsePayload);
    }

    // Atomic increment
    record.used += 1;
    if (normChannel === 'whatsapp') {
      record.whatsapp += 1;
    } else {
      record.call += 1;
    }

    const remaining = isUnlimited ? Math.max(0, plan.fairUse - record.used) : Math.max(0, plan.allowance - record.used);

    const successResponse = {
      status: 'success',
      allowed: true,
      limit_reached: record.used >= limit,
      quota_exhausted: false,
      upgrade_required: false,
      provider_id: Number(provider_id),
      channel: normChannel,
      billing_period: period,
      plan_id: plan.id,
      plan_name: plan.name,
      contacts_used: record.used,
      contacts_remaining: remaining,
      allowance: plan.allowance,
      idempotency_key: effectiveKey,
      message: 'Contact initiated successfully.'
    };

    // Store in idempotency cache
    idempotencyCache.set(effectiveKey, successResponse);
    if (idempotencyCache.size > 2000) {
      const oldestKey = idempotencyCache.keys().next().value;
      idempotencyCache.delete(oldestKey);
    }

    return res.status(200).json(successResponse);

  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = withSentry(contactMeterHandler, 'contact_meter');

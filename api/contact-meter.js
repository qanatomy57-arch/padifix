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
const LeadStore = require('../lib/lead-store');
const { dispatchArtisanLeadAlert } = require('../lib/artisan-notification-service');

// Supabase PostgreSQL Ledger Configuration
const TARGET_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${TARGET_PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const SUPABASE_AUTH_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

/**
 * Authoritatively persist contact event to PostgreSQL public.contact_events.
 * Enforces durable cross-restart idempotency via PostgreSQL unique constraint on idempotency_key.
 */
async function persistContactEvent({ provider_id, channel, idempotency_key, billing_period, locality, intent_tag, session_token }) {
  if (!SUPABASE_URL || !SUPABASE_AUTH_KEY) {
    return { success: true, isDuplicate: false, offline: true };
  }
  try {
    const cleanLocality = locality ? String(locality).replace(/<[^>]*>/g, '').trim().substring(0, 80) : null;
    const cleanIntent = intent_tag ? String(intent_tag).replace(/<[^>]*>/g, '').trim().substring(0, 80) : null;
    const eventId = crypto.randomUUID();

    const res = await fetch(`${SUPABASE_URL}/rest/v1/contact_events`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_AUTH_KEY,
        'Authorization': `Bearer ${SUPABASE_AUTH_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        id: eventId,
        provider_id: Number(provider_id),
        channel,
        idempotency_key: idempotency_key || null,
        billing_period,
        session_token: session_token || null,
        locality: cleanLocality,
        intent_tag: cleanIntent,
        status: 'new'
      })
    });

    if (res.status === 201) {
      return { success: true, isDuplicate: false, eventId };
    }
    if (res.status === 409) {
      // PostgreSQL unique constraint 23505 (durable idempotency)
      try {
        const errJson = await res.json();
        if (errJson && (errJson.code === '23505' || (errJson.message && errJson.message.includes('duplicate')))) {
          return { success: true, isDuplicate: true };
        }
        return { success: false, isDuplicate: false, error: errJson.message || 'Constraint violation' };
      } catch (e) {
        return { success: true, isDuplicate: true };
      }
    }
    return { success: true, isDuplicate: false, status: res.status };
  } catch (err) {
    return { success: true, isDuplicate: false, error: err.message };
  }
}

/**
 * Look up sanitized contact coordinates (phone & WhatsApp) upon authorized contact entitlement.
 * Enforces server-controlled contact disclosure gate.
 */
async function fetchProviderContactCoordinates(providerId) {
  if (!providerId) return null;
  const numId = Number(providerId);
  if (SUPABASE_URL && SUPABASE_AUTH_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/providers?select=phone,whatsapp_number&id=eq.${numId}&limit=1`, {
        headers: {
          'apikey': SUPABASE_AUTH_KEY,
          'Authorization': `Bearer ${SUPABASE_AUTH_KEY}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return {
            phone: data[0].phone || null,
            whatsapp_number: data[0].whatsapp_number || data[0].phone || null
          };
        }
      }
    } catch (err) {
      console.error('[ContactMeter:CoordsError]', err.message);
    }
  }
  return null;
}

/**
 * Authoritatively consume contact entitlement via PostgreSQL stored function
 * public.consume_contact_entitlement (Migration 043)
 */
async function consumeContactEntitlementPg({ provider_id, channel, idempotency_key, billing_period, locality, intent_tag, session_token }) {
  if (!SUPABASE_URL || !SUPABASE_AUTH_KEY) {
    return null;
  }
  try {
    const cleanLocality = locality ? String(locality).replace(/<[^>]*>/g, '').trim().substring(0, 80) : null;
    const cleanIntent = intent_tag ? String(intent_tag).replace(/<[^>]*>/g, '').trim().substring(0, 80) : null;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_contact_entitlement`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_AUTH_KEY,
        'Authorization': `Bearer ${SUPABASE_AUTH_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_provider_id: Number(provider_id),
        p_channel: channel,
        p_idempotency_key: idempotency_key || null,
        p_billing_period: billing_period,
        p_session_token: session_token || null,
        p_locality: cleanLocality,
        p_intent_tag: cleanIntent
      })
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    } else {
      const errText = await res.text();
      console.error('consumeContactEntitlementPg failed:', res.status, errText);
      return { status: 'rpc_error', http_status: res.status, error_detail: errText };
    }
  } catch (err) {
    console.error('consumeContactEntitlementPg network exception:', err.message);
  }
  return null;
}

// In-memory usage store for serverless execution / testing
// Structure: Map<`${provider_id}_${billing_period}`, { used, whatsapp, call, plan_id }>
const usageStore = LeadStore.usageStore;

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

// In-memory rate limiting store: Map<key, Array<number>> (timestamps in ms)
const memoryRateLimits = new Map();

function resetRateLimitsForTest() {
  memoryRateLimits.clear();
}

/**
 * Strict IP validator and normalizer.
 * Handles IPv4, IPv6, IPv4-mapped IPv6 (::ffff:192.168.1.1).
 */
const IPV4_REGEX = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function sanitizeAndNormalizeIp(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let candidate = raw.trim();
  if (candidate.length > 45) candidate = candidate.substring(0, 45);

  // Normalize IPv4-mapped IPv6 address (e.g. ::ffff:192.168.1.1)
  if (candidate.startsWith('::ffff:')) {
    candidate = candidate.substring(7);
  }

  // Validate IPv4
  if (IPV4_REGEX.test(candidate)) {
    return candidate;
  }

  // Validate IPv6 (hex and colons)
  if (candidate.includes(':') && candidate.length <= 45 && /^[0-9a-fA-F:]+$/.test(candidate)) {
    return candidate.toLowerCase();
  }

  return null;
}

/**
 * Extracts client IP with Nigerian mobile ISP proxy & CGNAT resilience.
 * Security Trust Model:
 * On Vercel / serverless deployments, `x-real-ip` is injected authoritatively by the edge proxy
 * from the client's actual TCP connection and CANNOT be forged by the client.
 * If `x-real-ip` is present, it is trusted unconditionally over client-controlled `x-forwarded-for`.
 */
function extractClientIp(req) {
  if (!req) return null;
  if (req._mockIp) return sanitizeAndNormalizeIp(req._mockIp) || req._mockIp;

  // 1. Authoritative Edge IP (Vercel sets x-real-ip from connecting client socket)
  const realIp = req.headers && req.headers['x-real-ip'];
  if (realIp) {
    const validated = sanitizeAndNormalizeIp(String(realIp));
    if (validated) return validated;
  }

  // 2. Vercel Forwarded For / Standard Forwarded For
  // If behind multiple proxies and x-real-ip is unavailable, sanitize candidate
  const forwarded = req.headers && (req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for']);
  if (forwarded) {
    const parts = String(forwarded).split(',');
    for (const part of parts) {
      const validated = sanitizeAndNormalizeIp(part);
      if (validated) return validated;
    }
  }

  // 3. Underlying socket connection
  if (req.socket && req.socket.remoteAddress) {
    const validated = sanitizeAndNormalizeIp(req.socket.remoteAddress);
    if (validated) return validated;
  }
  if (req.connection && req.connection.remoteAddress) {
    const validated = sanitizeAndNormalizeIp(req.connection.remoteAddress);
    if (validated) return validated;
  }

  return req.headers ? '127.0.0.1' : null;
}

/**
 * Canonicalize consumer identity for pair-limiting without leaking PII.
 * If phone is provided, normalize to digits and hash with SHA-256.
 * If session token is provided, sanitize it.
 * Otherwise, fall back to sanitized client IP.
 */
function getCanonicalConsumerKey(session_token, clientIp, rawPhone) {
  if (rawPhone) {
    const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 10) {
      const hashed = crypto.createHash('sha256').update(`phone_${cleanPhone}`).digest('hex').substring(0, 32);
      return `phone:${hashed}`;
    }
  }
  if (session_token && typeof session_token === 'string') {
    const cleanToken = session_token.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
    if (cleanToken.length >= 4) {
      return `sess:${cleanToken}`;
    }
  }
  if (clientIp) {
    return `ip:${clientIp}`;
  }
  return 'anon';
}

/**
 * Evaluates rate limit against PostgreSQL RPC or in-memory sliding window
 */
async function checkRateLimit({ key, maxRequests = 5, windowSeconds = 60, _inject }) {
  if (_inject?.mockRateLimitExceeded) {
    return { allowed: false, retryAfter: 60 };
  }

  // Attempt atomic distributed rate limit via Supabase PostgreSQL RPC if configured
  if (SUPABASE_URL && SUPABASE_ANON_KEY && !_inject?.forceMemoryRateLimit) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_key: key,
          p_max_hits: maxRequests,
          p_window_seconds: windowSeconds
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const result = await res.json();
        return {
          allowed: Boolean(result?.allowed),
          retryAfter: Number(result?.retry_after || windowSeconds)
        };
      }
    } catch (e) {
      // Fallback seamlessly to local in-memory sliding window
    }
  }

  // In-memory sliding window fallback
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  let timestamps = memoryRateLimits.get(key) || [];
  timestamps = timestamps.filter(t => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0];
    const retryAfterMs = Math.max(1000, windowMs - (now - oldest));
    const retryAfter = Math.ceil(retryAfterMs / 1000);
    return { allowed: false, retryAfter };
  }

  timestamps.push(now);
  memoryRateLimits.set(key, timestamps);
  return { allowed: true, retryAfter: 0 };
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
    const {
      provider_id,
      channel,
      idempotency_key,
      session_token,
      consumer_phone,
      phone,
      plan_id,
      reset_period,
      locality,
      intent_tag,
      mode,
      soft_cap,
      _inject
    } = req.body || {};
    const effectiveInject = _inject || req._inject || {};

    if (!provider_id) {
      return res.status(400).json({ error: 'Missing required provider_id' });
    }
    const provId = Number(provider_id);
    if (isNaN(provId) || provId <= 0) {
      return res.status(400).json({ error: 'Invalid provider_id' });
    }

    const normChannel = String(channel || '').toLowerCase().trim();
    if (!['whatsapp', 'call'].includes(normChannel)) {
      return res.status(400).json({ error: "Invalid channel. Must be 'whatsapp' or 'call'." });
    }

    const period = getLagosBillingPeriod();
    const storeKey = `${provId}_${period}`;

    // Admin / Test simulation: Reset period usage if requested in non-production test mode
    if (reset_period) {
      const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
      if (isProd) {
        return res.status(403).json({ error: 'Forbidden: Reset simulation hook is strictly disabled in production.' });
      }
      usageStore.set(storeKey, { used: 0, whatsapp: 0, call: 0, plan_id: plan_id || 'FREE' });
      LeadStore.resetUsageForTest(provId, plan_id || 'FREE', 0);
      return res.status(200).json({ status: 'success', message: `Usage reset for ${storeKey}` });
    }

    // Resolve or generate idempotency key
    // Requirement A: duplicate tap suppression (same key -> cached deduplication)
    // Requirement B: independent contact preservation (distinct event UUIDs -> distinct metering)
    const clientHeaderKey = req.headers && req.headers['x-idempotency-key'];
    const timeBucket15m = Math.floor(Date.now() / (15 * 60 * 1000));
    const effectiveKey = idempotency_key || clientHeaderKey || 
      (session_token 
        ? `idem_${provId}_${normChannel}_${session_token}_${timeBucket15m}` 
        : `idem_${provId}_${normChannel}_${crypto.randomUUID()}`);

    // Check idempotency cache (Prevents double clicks, browser refreshes, network retries)
    if (idempotencyCache.has(effectiveKey)) {
      const cached = idempotencyCache.get(effectiveKey);
      if (cached.provider_id && Number(cached.provider_id) !== Number(provId)) {
        return res.status(409).json({
          status: 'error',
          allowed: false,
          error: 'cross_provider_idempotency_conflict',
          message: 'Idempotency key has already been used for another provider'
        });
      }
      const currentRec = usageStore.get(storeKey);
      return res.status(200).json({
        ...cached,
        contacts_used: currentRec ? currentRec.used : cached.contacts_used,
        is_duplicate: true,
        idempotent: true
      });
    }

    // --------------------------------------------------------------------------
    // ATOMIC SYNCHRONOUS IN-MEMORY QUOTA RESERVATION (Concurrency Guard)
    // Ensures concurrent requests arriving in same event loop tick serialize correctly.
    // --------------------------------------------------------------------------
    const isSoftCap = Boolean(mode === 'soft_cap' || soft_cap);
    let inMemoryReservation = null;

    const shouldPrepareMemory = effectiveInject?.forceMemoryQuota || 
                                !SUPABASE_URL || 
                                !SUPABASE_ANON_KEY || 
                                process.env.VERCEL_ENV !== 'production';

    if (shouldPrepareMemory) {
      let rec = usageStore.get(storeKey);
      const activePlanId = effectiveInject?.overridePlanId ? String(effectiveInject.overridePlanId).toUpperCase() : (rec ? rec.plan_id : 'FREE');
      const planConfig = PLAN_ALLOWANCES[activePlanId] || PLAN_ALLOWANCES.FREE;
      const isUnlimited = planConfig.allowance === 'unlimited';
      const maxLimit = isUnlimited ? planConfig.fairUse : planConfig.allowance;

      if (!rec) {
        rec = { used: 0, whatsapp: 0, call: 0, plan_id: activePlanId };
        usageStore.set(storeKey, rec);
      } else if (effectiveInject?.overridePlanId) {
        rec.plan_id = activePlanId;
      }

      if (rec.used >= maxLimit && !isSoftCap) {
        inMemoryReservation = {
          allowed: false,
          used: rec.used,
          remaining: 0,
          limitReached: true,
          plan: planConfig
        };
      } else {
        rec.used += 1;
        if (normChannel === 'whatsapp') rec.whatsapp += 1;
        else rec.call += 1;
        inMemoryReservation = {
          allowed: true,
          used: rec.used,
          remaining: Math.max(0, maxLimit - rec.used),
          limitReached: rec.used >= maxLimit,
          plan: planConfig
        };
      }
    }

    // --------------------------------------------------------------------------
    // RULE A: NEVER LOSE THE LEAD (Section 20) & ATOMIC ENTITLEMENT (F-03)
    // Contact intent/event persistence happens BEFORE abuse/SMS side-effects.
    // In production, public.consume_contact_entitlement enforces atomic row-locked metering.
    // --------------------------------------------------------------------------
    let pgResult = { success: true, isDuplicate: false, eventId: null };
    let rpcEntitlement = null;

    if (!effectiveInject?.forceMemoryQuota && SUPABASE_URL && SUPABASE_ANON_KEY) {
      rpcEntitlement = await consumeContactEntitlementPg({
        provider_id: provId,
        channel: normChannel,
        locality,
        intent_tag,
        idempotency_key: effectiveKey,
        billing_period: period,
        session_token
      });

      if (rpcEntitlement && (rpcEntitlement.status === 'success' || rpcEntitlement.status === 'limit_reached')) {
        pgResult = {
          success: true,
          isDuplicate: Boolean(rpcEntitlement.is_duplicate),
          eventId: rpcEntitlement.event_id || null
        };
      }
    }

    // Only fallback to standalone table insertion if the atomic RPC was unreachable or errored
    if (!effectiveInject?.forceMemoryQuota && (!rpcEntitlement || (rpcEntitlement.status !== 'success' && rpcEntitlement.status !== 'limit_reached'))) {
      pgResult = await persistContactEvent({
        provider_id: provId,
        channel: normChannel,
        locality,
        intent_tag,
        idempotency_key: effectiveKey,
        billing_period: period,
        session_token
      });
    }

    // Canonical UUID for contact event & lead notification audit trail
    const canonicalEventId = (rpcEntitlement && rpcEntitlement.event_id) || pgResult.eventId || crypto.randomUUID();

    LeadStore.logContactLead({
      provider_id: provId,
      channel: normChannel,
      locality,
      intent_tag,
      idempotency_key: effectiveKey,
      billing_period: period,
      session_token
    });

    // --------------------------------------------------------------------------
    // TIER 1 IP RATE LIMITING GATE (Section 10 & 13)
    // 5 requests / minute / IP.
    // Lead is already captured above, but throttled clients receive 429
    // and outbound SMS notification is strictly prevented.
    // --------------------------------------------------------------------------
    const clientIp = extractClientIp(req);
    if (clientIp && !_inject?.bypassRateLimit) {
      const ipLimitStatus = await checkRateLimit({
        key: `ip:${clientIp}`,
        maxRequests: 5,
        windowSeconds: 60,
        _inject
      });
      if (!ipLimitStatus.allowed) {
        res.setHeader('Retry-After', String(ipLimitStatus.retryAfter || 60));
        return res.status(429).json({
          error: 'Too many requests. Please try again shortly.',
          retry_after: Number(ipLimitStatus.retryAfter || 60),
          lead_saved: true
        });
      }
    }

    // --------------------------------------------------------------------------
    // PRODUCTION AUTHORITY: POSTGRESQL ATOMIC ENTITLEMENT DECISION (F-03)
    // --------------------------------------------------------------------------
    if (rpcEntitlement && rpcEntitlement.error === 'cross_provider_idempotency_conflict') {
      return res.status(409).json({
        status: 'error',
        allowed: false,
        error: 'cross_provider_idempotency_conflict',
        message: 'Idempotency key has already been used for another provider'
      });
    }

    if (rpcEntitlement && (rpcEntitlement.status === 'success' || rpcEntitlement.status === 'limit_reached')) {
      const used = Number(rpcEntitlement.contacts_used || 0);
      const allowance = Number(rpcEntitlement.allowance || 5);
      const remaining = Number(rpcEntitlement.contacts_remaining != null ? rpcEntitlement.contacts_remaining : Math.max(0, allowance - used));
      const planId = String(rpcEntitlement.plan_id || 'FREE').toUpperCase();
      const planName = rpcEntitlement.plan_name || 'Free';
      const isLimitReached = Boolean(rpcEntitlement.limit_reached || rpcEntitlement.status === 'limit_reached');

      usageStore.set(storeKey, {
        used,
        whatsapp: normChannel === 'whatsapp' ? 1 : 0,
        call: normChannel === 'call' ? 1 : 0,
        plan_id: planId
      });

      if (rpcEntitlement.is_duplicate) {
        let coords = null;
        if (!effectiveInject?.skipContactLookup) {
          coords = await fetchProviderContactCoordinates(provId);
        }
        return res.status(200).json({
          status: 'success',
          allowed: true,
          limit_reached: isLimitReached,
          quota_exhausted: isLimitReached,
          upgrade_required: isLimitReached,
          provider_id: provId,
          channel: normChannel,
          billing_period: period,
          plan_id: planId,
          plan_name: planName,
          contacts_used: used,
          contacts_remaining: remaining,
          allowance: allowance,
          idempotency_key: effectiveKey,
          is_duplicate: true,
          idempotent: true,
          contact: coords ? { phone: coords.phone, whatsapp_number: coords.whatsapp_number } : undefined,
          message: 'Contact initiated successfully (idempotent replay).'
        });
      }

      if (isLimitReached && !isSoftCap) {
        const responsePayload = {
          status: 'limit_reached',
          allowed: false,
          soft_cap: false,
          limit_reached: true,
          quota_exhausted: true,
          upgrade_required: true,
          provider_id: provId,
          channel: normChannel,
          billing_period: period,
          plan_id: planId,
          plan_name: planName,
          contacts_used: used,
          contacts_remaining: 0,
          allowance: allowance,
          idempotency_key: effectiveKey,
          upgrade_recommended: planId === 'FREE' ? 'BASIC' : 'PRO',
          upgrade_price_display: '₦5,500/month',
          message: planId === 'FREE'
            ? "You've reached your 5 customer contact limit for this month. Upgrade to Basic — ₦5,500/month."
            : `Monthly contact limit of ${allowance} reached for ${planName} plan.`
        };
        idempotencyCache.set(effectiveKey, responsePayload);
        return res.status(200).json(responsePayload);
      }

      // Allowed (within allowance or soft_cap = true)
      const consumerIdentity = getCanonicalConsumerKey(session_token, clientIp, consumer_phone || phone);
      const pairLimitKey = `contact_pair:${consumerIdentity}:${provId}`;
      const pairLimitStatus = await checkRateLimit({
        key: pairLimitKey,
        maxRequests: 1,
        windowSeconds: 15 * 60,
        _inject
      });

      if (pairLimitStatus.allowed) {
        dispatchArtisanLeadAlert({
          contactEventId: canonicalEventId,
          providerId: provId,
          locality,
          intentTag: intent_tag,
          _inject
        }).catch(alertErr => {
          console.error('[ContactMeter:AlertError:Pg]', alertErr.message);
        });
      }

      let coords = null;
      if (!effectiveInject?.skipContactLookup) {
        coords = await fetchProviderContactCoordinates(provId);
      }

      const responsePayload = {
        status: 'success',
        allowed: true,
        soft_cap: isLimitReached && isSoftCap,
        limit_reached: isLimitReached,
        quota_exhausted: isLimitReached,
        upgrade_required: isLimitReached,
        provider_id: provId,
        channel: normChannel,
        billing_period: period,
        plan_id: planId,
        plan_name: planName,
        contacts_used: used,
        contacts_remaining: remaining,
        allowance: allowance,
        idempotency_key: effectiveKey,
        upgrade_recommended: planId === 'FREE' ? 'BASIC' : 'PRO',
        upgrade_price_display: '₦5,500/month',
        contact: coords ? { phone: coords.phone, whatsapp_number: coords.whatsapp_number } : undefined,
        message: isLimitReached
          ? (planId === 'FREE'
              ? "You've reached your 5 customer contact limit for this month. Upgrade to Basic — ₦5,500/month."
              : `Monthly contact limit of ${allowance} reached for ${planName} plan.`)
          : 'Contact initiated successfully.'
      };
      idempotencyCache.set(effectiveKey, responsePayload);
      return res.status(200).json(responsePayload);
    }

    // --------------------------------------------------------------------------
    // IN-MEMORY QUOTA ENFORCEMENT & RESPONSE DISPATCH (Offline / Test Scenarios)
    // --------------------------------------------------------------------------
    if (inMemoryReservation) {
      if (pgResult.isDuplicate) {
        // Roll back in-memory reservation if this turn was an idempotent duplicate
        let rec = usageStore.get(storeKey);
        if (rec && inMemoryReservation.allowed) {
          rec.used = Math.max(0, rec.used - 1);
        }
        return res.status(200).json({
          status: 'success',
          allowed: true,
          limit_reached: rec ? rec.used >= inMemoryReservation.plan.allowance : false,
          quota_exhausted: false,
          upgrade_required: false,
          provider_id: provId,
          channel: normChannel,
          billing_period: period,
          plan_id: inMemoryReservation.plan.id,
          plan_name: inMemoryReservation.plan.name,
          contacts_used: rec ? rec.used : 1,
          contacts_remaining: rec ? Math.max(0, inMemoryReservation.plan.allowance - rec.used) : 0,
          allowance: inMemoryReservation.plan.allowance,
          idempotency_key: effectiveKey,
          is_duplicate: true,
          idempotent: true,
          message: 'Contact initiated successfully (idempotent replay).'
        });
      }

      if (!inMemoryReservation.allowed) {
        const responsePayload = {
          status: 'limit_reached',
          allowed: false,
          soft_cap: false,
          limit_reached: true,
          quota_exhausted: true,
          upgrade_required: true,
          provider_id: provId,
          channel: normChannel,
          billing_period: period,
          plan_id: inMemoryReservation.plan.id,
          plan_name: inMemoryReservation.plan.name,
          contacts_used: inMemoryReservation.used,
          contacts_remaining: 0,
          allowance: inMemoryReservation.plan.allowance,
          idempotency_key: effectiveKey,
          upgrade_recommended: inMemoryReservation.plan.id === 'FREE' ? 'BASIC' : 'PRO',
          upgrade_price_display: '₦5,500/month',
          message: inMemoryReservation.plan.id === 'FREE'
            ? "You've reached your 5 customer contact limit for this month. Upgrade to Basic — ₦5,500/month."
            : `Monthly contact limit of ${inMemoryReservation.plan.allowance} reached for ${inMemoryReservation.plan.name} plan.`
        };
        idempotencyCache.set(effectiveKey, responsePayload);
        return res.status(200).json(responsePayload);
      }

      // Allowed under inMemoryReservation
      const consumerIdentity = getCanonicalConsumerKey(session_token, clientIp, consumer_phone || phone);
      const pairLimitKey = `contact_pair:${consumerIdentity}:${provId}`;
      const pairLimitStatus = await checkRateLimit({
        key: pairLimitKey,
        maxRequests: 1,
        windowSeconds: 15 * 60,
        _inject: effectiveInject
      });

      if (pairLimitStatus.allowed) {
        dispatchArtisanLeadAlert({
          contactEventId: canonicalEventId,
          providerId: provId,
          locality,
          intentTag: intent_tag,
          _inject: effectiveInject
        }).catch(alertErr => {
          console.error('[ContactMeter:AlertError:Memory]', alertErr.message);
        });
      }

      let coords = null;
      if (!effectiveInject?.skipContactLookup) {
        coords = await fetchProviderContactCoordinates(provId);
      }

      const responsePayload = {
        status: 'success',
        allowed: true,
        soft_cap: inMemoryReservation.limitReached && isSoftCap,
        limit_reached: inMemoryReservation.limitReached,
        quota_exhausted: inMemoryReservation.limitReached,
        upgrade_required: inMemoryReservation.limitReached,
        provider_id: provId,
        channel: normChannel,
        billing_period: period,
        plan_id: inMemoryReservation.plan.id,
        plan_name: inMemoryReservation.plan.name,
        contacts_used: inMemoryReservation.used,
        contacts_remaining: inMemoryReservation.remaining,
        allowance: inMemoryReservation.plan.allowance,
        idempotency_key: effectiveKey,
        upgrade_recommended: inMemoryReservation.plan.id === 'FREE' ? 'BASIC' : 'PRO',
        upgrade_price_display: '₦5,500/month',
        contact: coords ? { phone: coords.phone, whatsapp_number: coords.whatsapp_number } : undefined,
        message: inMemoryReservation.limitReached
          ? (inMemoryReservation.plan.id === 'FREE'
              ? "You've reached your 5 customer contact limit for this month. Upgrade to Basic — ₦5,500/month."
              : `Monthly contact limit of ${inMemoryReservation.plan.allowance} reached for ${inMemoryReservation.plan.name} plan.`)
          : 'Contact initiated successfully.'
      };
      idempotencyCache.set(effectiveKey, responsePayload);
      return res.status(200).json(responsePayload);
    }

    // Fail closed if neither database authority nor in-memory reservation handled the turn
    return res.status(503).json({
      status: 'store_unavailable',
      allowed: false,
      limit_reached: true,
      error: 'Entitlement authority temporarily unavailable. Contact lead was safely persisted.',
      lead_saved: true
    });

  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

const handler = withSentry(contactMeterHandler, 'contact_meter');
handler.extractClientIp = extractClientIp;
handler.checkRateLimit = checkRateLimit;
handler.resetRateLimitsForTest = resetRateLimitsForTest;
handler.memoryRateLimits = memoryRateLimits;
handler.contactMeterHandler = contactMeterHandler;

module.exports = handler;

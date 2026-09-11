/**
 * PADIFIX — SERVERLESS API: Telemetry & Core Web Vitals Ingestion Proxy
 * POST /api/telemetry
 *
 * Implements:
 * 1. Privacy-conscious edge telemetry proxy for browser batches
 * 2. Keyed HMAC ephemeral rate-limiting in process memory (60 req/min/client)
 * 3. Strict schema gating:
 *    - Request body size <= 16 KB
 *    - Batch size <= 10 events
 *    - Regex event_name: ^[a-z0-9_]{3,64}$
 *    - device_class in ('desktop', 'tablet', 'mobile')
 *    - Event-specific property allowlist
 *    - Immediate HTTP 400 rejection for unknown properties, nested objects, or PII/forbidden fields
 * 4. Zero IP storage, zero user-agent storage, zero raw search query storage
 * 5. Server-side constructed record inserted via Supabase service_role
 * 6. Sentry error wrapping without leaking client payload data
 */

const crypto = require('crypto');
const { withSentry } = require('../lib/sentry-server');

// Target Supabase Project
const TARGET_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${TARGET_PROJECT_REF}.supabase.co`;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Ephemeral HMAC secret generated at process startup (process memory only, never persisted)
const EPHEMERAL_HMAC_SECRET = crypto.randomBytes(32);

// In-Memory Rate Limiting (60 requests/minute per client HMAC key)
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;
const rateLimitBuckets = new Map();

// Periodic cleanup of expired rate-limit buckets
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitBuckets.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

function checkRateLimit(req) {
  const rawIp = req.headers['cf-connecting-ip'] ||
                req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                req.headers['x-real-ip'] ||
                req.socket?.remoteAddress ||
                '127.0.0.1';

  // Ephemeral HMAC key: transient process memory only, never stored in DB or logs
  const clientKey = crypto.createHmac('sha256', EPHEMERAL_HMAC_SECRET)
    .update(rawIp)
    .digest('hex')
    .substring(0, 16);

  const now = Date.now();
  let bucket = rateLimitBuckets.get(clientKey);
  if (!bucket || (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS)) {
    bucket = { count: 1, windowStart: now };
    rateLimitBuckets.set(clientKey, bucket);
    return { allowed: true };
  }

  bucket.count++;
  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, count: bucket.count };
  }

  return { allowed: true };
}

// Security & Privacy: Forbidden field names that trigger immediate rejection
const FORBIDDEN_SECURITY_KEYS = new Set([
  'email', 'phone', 'ip', 'ip_address', 'client_ip', 'x-forwarded-for', 'x-real-ip', 'forwarded',
  'user_agent', 'user-agent', 'authorization', 'jwt', 'raw_query', 'query', 'search_query',
  'password', 'token', 'access_token', 'refresh_token', 'secret', 'nin', 'vnin', 'bvn',
  'card', 'card_number', 'cvv', 'pan', 'pin', 'session-derived', 'cookie', 'cookies'
]);

// Canonical Event Property Allowlist
const EVENT_PROPERTY_ALLOWLIST = {
  page_view: {
    maxProperties: 4,
    allowed: {
      title: { type: 'string', maxLen: 128 },
      normalized_page: { type: 'string', maxLen: 32 },
      referrer_type: { type: 'string', maxLen: 32 }
    }
  },
  search_executed: {
    maxProperties: 4,
    allowed: {
      category_slug: { type: 'string', maxLen: 40 },
      state: { type: 'string', maxLen: 32 },
      lga: { type: 'string', maxLen: 40 },
      results_count: { type: 'number', min: 0, max: 1000 }
    }
  },
  profile_viewed: {
    maxProperties: 3,
    allowed: {
      provider_id: { type: 'number', min: 1 },
      trade: { type: 'string', maxLen: 40 },
      is_verified: { type: 'boolean' }
    }
  },
  contact_intent_clicked: {
    maxProperties: 4,
    allowed: {
      provider_id: { type: 'number', min: 1 },
      channel: { type: 'string', enum: ['call', 'whatsapp'] },
      action: { type: 'string', enum: ['call', 'whatsapp'] },
      intent_tag: { type: 'string', maxLen: 40 }
    }
  },
  web_vitals_summary: {
    maxProperties: 10,
    allowed: {
      page: { type: 'string', maxLen: 32 },
      device_class: { type: 'string', maxLen: 16 },
      lcp: { type: 'number', min: 0, max: 60000 },
      lcp_ms: { type: 'number', min: 0, max: 60000 },
      inp: { type: 'number', min: 0, max: 60000 },
      inp_ms: { type: 'number', min: 0, max: 60000 },
      cls: { type: 'number', min: 0, max: 10 },
      ttfb: { type: 'number', min: 0, max: 60000 },
      ttfb_ms: { type: 'number', min: 0, max: 60000 },
      fcp: { type: 'number', min: 0, max: 60000 },
      fcp_ms: { type: 'number', min: 0, max: 60000 },
      dom_ready_ms: { type: 'number', min: 0, max: 60000 }
    }
  },
  hero_search_submitted: {
    maxProperties: 6,
    allowed: {
      service: { type: 'string', maxLen: 64 },
      location: { type: 'string', maxLen: 64 },
      state: { type: 'string', maxLen: 32 },
      lga: { type: 'string', maxLen: 40 }
    }
  },
  search_result_viewed: {
    maxProperties: 8,
    allowed: {
      totalCount: { type: 'number', min: 0, max: 10000 },
      page: { type: 'number', min: 1, max: 1000 },
      category: { type: 'string', maxLen: 40 },
      state: { type: 'string', maxLen: 32 },
      lga: { type: 'string', maxLen: 40 },
      city: { type: 'string', maxLen: 40 }
    }
  },
  search_no_results: {
    maxProperties: 8,
    allowed: {
      query: { type: 'string', maxLen: 64 },
      category: { type: 'string', maxLen: 40 },
      state: { type: 'string', maxLen: 32 },
      lga: { type: 'string', maxLen: 40 },
      city: { type: 'string', maxLen: 40 }
    }
  },
  provider_profile_viewed: {
    maxProperties: 8,
    allowed: {
      providerId: { type: 'number', min: 1 },
      trade: { type: 'string', maxLen: 40 },
      category: { type: 'string', maxLen: 40 },
      city: { type: 'string', maxLen: 40 },
      state: { type: 'string', maxLen: 32 },
      lga: { type: 'string', maxLen: 40 },
      verificationStatus: { type: 'string', maxLen: 32 }
    }
  },
  phone_clicked: {
    maxProperties: 8,
    allowed: {
      providerId: { type: 'number', min: 1 },
      trade: { type: 'string', maxLen: 40 },
      category: { type: 'string', maxLen: 40 },
      city: { type: 'string', maxLen: 40 },
      state: { type: 'string', maxLen: 32 },
      lga: { type: 'string', maxLen: 40 },
      verificationStatus: { type: 'string', maxLen: 32 }
    }
  },
  whatsapp_clicked: {
    maxProperties: 8,
    allowed: {
      providerId: { type: 'number', min: 1 },
      trade: { type: 'string', maxLen: 40 },
      category: { type: 'string', maxLen: 40 },
      city: { type: 'string', maxLen: 40 },
      state: { type: 'string', maxLen: 32 },
      lga: { type: 'string', maxLen: 40 },
      verificationStatus: { type: 'string', maxLen: 32 }
    }
  },
  provider_share_clicked: {
    maxProperties: 4,
    allowed: {
      providerId: { type: 'number', min: 1 },
      trade: { type: 'string', maxLen: 40 },
      channel: { type: 'string', maxLen: 32 }
    }
  },
  client_error: {
    maxProperties: 3,
    allowed: {
      message: { type: 'string', maxLen: 100 },
      error_type: { type: 'string', maxLen: 40 },
      path: { type: 'string', maxLen: 64 }
    }
  },
  pwa_installed: {
    maxProperties: 2,
    allowed: {
      outcome: { type: 'string', enum: ['accepted', 'dismissed'] }
    }
  }
};

const EVENT_NAME_REGEX = /^[a-z0-9_]{3,64}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16 * 1024; // 16 KB

function validateEventProperties(eventName, props) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    return { valid: false, error: 'Properties must be a plain key-value object' };
  }

  const spec = EVENT_PROPERTY_ALLOWLIST[eventName];
  if (!spec) {
    return { valid: false, error: `Unsupported event '${eventName}'` };
  }

  const keys = Object.keys(props);
  if (keys.length > spec.maxProperties) {
    return { valid: false, error: `Too many properties for event '${eventName}'. Max ${spec.maxProperties}` };
  }

  const cleanProps = {};

  for (const key of keys) {
    const lowerKey = key.toLowerCase();

    // Rejection rule 1: Forbidden PII / Auth / Network keys
    if (FORBIDDEN_SECURITY_KEYS.has(lowerKey)) {
      return { valid: false, error: `Forbidden security/privacy property '${key}' detected` };
    }

    // Rejection rule 2: Unknown properties not in allowlist
    const rule = spec.allowed[key];
    if (!rule) {
      return { valid: false, error: `Unknown property '${key}' for event '${eventName}'` };
    }

    const val = props[key];

    // Rejection rule 3: Reject nested objects or arrays
    if (typeof val === 'object' && val !== null) {
      return { valid: false, error: `Nested objects are forbidden for property '${key}'` };
    }

    // Rejection rule 4: Data type validation
    if (rule.type === 'string') {
      if (typeof val !== 'string') {
        return { valid: false, error: `Property '${key}' must be a string` };
      }
      if (rule.maxLen && val.length > rule.maxLen) {
        return { valid: false, error: `Property '${key}' exceeds max length of ${rule.maxLen}` };
      }
      if (rule.enum && !rule.enum.includes(val)) {
        return { valid: false, error: `Property '${key}' has invalid value. Allowed: ${rule.enum.join(', ')}` };
      }
      cleanProps[key] = val;
    } else if (rule.type === 'number') {
      if (typeof val !== 'number' || isNaN(val)) {
        return { valid: false, error: `Property '${key}' must be a number` };
      }
      if (typeof rule.min === 'number' && val < rule.min) {
        return { valid: false, error: `Property '${key}' below minimum ${rule.min}` };
      }
      if (typeof rule.max === 'number' && val > rule.max) {
        return { valid: false, error: `Property '${key}' exceeds maximum ${rule.max}` };
      }
      cleanProps[key] = val;
    } else if (rule.type === 'boolean') {
      if (typeof val !== 'boolean') {
        return { valid: false, error: `Property '${key}' must be a boolean` };
      }
      cleanProps[key] = val;
    }
  }

  return { valid: true, properties: cleanProps };
}

const telemetryHandler = async (req, res) => {
  // CORS Headers
  const origin = req.headers.origin || '';
  const isAllowedOrigin = origin.includes('padifix.vercel.app') ||
                          origin.includes('localhost') ||
                          origin.includes('127.0.0.1');

  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin ? origin : 'https://padifix.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Rate Limiting Gate
  const rateLimit = checkRateLimit(req);
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too Many Requests', retryAfter: 60 });
  }

  // Body Size Gate (16 KB max)
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload Too Large. Max size is 16 KB' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        return res.status(413).json({ error: 'Payload Too Large. Max size is 16 KB' });
      }
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }
    }

    if (!body) {
      return res.status(400).json({ error: 'Empty payload' });
    }

    const rawEvents = Array.isArray(body) ? body : [body];

    // Batch Size Gate: Max 10 events per batch
    if (rawEvents.length === 0 || rawEvents.length > 10) {
      return res.status(400).json({
        error: 'Batch size must be between 1 and 10 events'
      });
    }

    const sanitizedBatch = [];
    for (const evt of rawEvents) {
      if (!evt || typeof evt !== 'object' || Array.isArray(evt)) {
        return res.status(400).json({ error: 'Each event must be a valid object' });
      }

      const eventName = String(evt.event_name || evt.name || '').trim().toLowerCase();
      if (!EVENT_NAME_REGEX.test(eventName)) {
        return res.status(400).json({
          error: `Invalid event_name '${eventName}'. Must conform to ^[a-z0-9_]{3,64}$`
        });
      }

      let sessionId = String(evt.session_id || '').trim();
      if (!UUID_REGEX.test(sessionId)) {
        sessionId = crypto.createHash('md5').update(sessionId || 'anon_session').digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
      }

      const rawPath = String(evt.page_path || evt.path || 'home').trim().toLowerCase().split('?')[0].substring(0, 64);
      const pagePath = rawPath || 'home';

      const rawProps = { ...(evt.properties || evt.props || {}) };
      const rawDevice = String(evt.device_class || rawProps.device_class || 'desktop').toLowerCase();
      delete rawProps.device_class;

      if (!['desktop', 'tablet', 'mobile'].includes(rawDevice)) {
        return res.status(400).json({
          error: `Invalid device_class '${rawDevice}'. Must be desktop, tablet, or mobile`
        });
      }

      // Validate properties against event-specific allowlist
      const propResult = validateEventProperties(eventName, rawProps);
      if (!propResult.valid) {
        return res.status(400).json({ error: propResult.error });
      }

      sanitizedBatch.push({
        session_id: sessionId,
        event_name: eventName,
        page_path: pagePath,
        device_class: rawDevice,
        properties: propResult.properties,
        created_at: new Date().toISOString()
      });
    }

    // Persist to Supabase if service role key is active
    if (SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(sanitizedBatch)
        });

        if (!dbRes.ok && dbRes.status !== 201) {
          // Fail soft without throwing
        }
      } catch (dbErr) {
        // Fail soft without impacting client
      }
    }

    return res.status(200).json({
      success: true,
      count: sanitizedBatch.length
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = withSentry(telemetryHandler);

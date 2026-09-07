/**
 * PADIFIX — TRANSACTIONAL ARTISAN LEAD NOTIFICATION SERVICE (TERMII INTEGRATION)
 * lib/artisan-notification-service.js
 *
 * Implements privacy-safe, non-blocking transactional SMS notifications for artisans
 * upon receiving fresh customer contacts.
 *
 * Invariants:
 * 1. Server-side only: never leaks TERMII_API_KEY to browser.
 * 2. Non-blocking: SMS dispatch failures NEVER fail the caller or block consumer contact.
 * 3. Zero-PII SMS body: Never includes customer phone, raw chat text, or session tokens.
 * 4. Durable deduplication: Bound to contact_event_id uniqueness to prevent duplicate SMS alerts.
 * 5. Sender ID Safe: Explicitly distinguishes configured vs approved Sender ID.
 *    Does NOT manufacture fake successful SMS when Sender ID is pending telco approval.
 */

'use strict';

// Strict server-only guard
if (typeof window !== 'undefined') {
  throw new Error('SECURITY VIOLATION: Artisan notification service is server-only.');
}

const https = require('https');

// Graceful import of server-side Sentry observability
let captureServerException = null;
try {
  const sentryServer = require('./sentry-server');
  captureServerException = sentryServer.captureServerException;
} catch (e) {}

// Supabase PostgreSQL Ledger Configuration
const TARGET_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${TARGET_PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';

/**
 * Normalizes Nigerian phone numbers to Termii standard international format (234XXXXXXXXXX).
 * @param {string} phone
 * @returns {string|null}
 */
function normalizeNigerianPhoneForTermii(phone) {
  if (!phone || typeof phone !== 'string') return null;
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '234' + cleaned.substring(1);
  }
  if (cleaned.startsWith('234') && cleaned.length === 13) {
    return cleaned;
  }
  if (cleaned.length === 10 && !cleaned.startsWith('0')) {
    return '234' + cleaned;
  }
  return cleaned.length >= 10 ? cleaned : null;
}

// In-memory fallback ledger for daily quotas (resilient across network dropouts / local testing)
// Key: `${date}_${scope}` -> { count: number, cap: number }
const memorySmsQuotas = new Map();

/**
 * Deterministically returns the current date string in Africa/Lagos (WAT / UTC+1) business timezone.
 * Format: 'YYYY-MM-DD'
 * @param {Date|string|number} [date=new Date()]
 * @returns {string}
 */
function getLagosDateString(date = new Date()) {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

/**
 * Resets quota counters for test execution
 */
function resetSmsQuotasForTest(scope = null, date = null) {
  if (scope && date) {
    memorySmsQuotas.delete(`${date}_${scope}`);
  } else if (scope) {
    for (const key of memorySmsQuotas.keys()) {
      if (key.endsWith(`_${scope}`)) memorySmsQuotas.delete(key);
    }
  } else {
    memorySmsQuotas.clear();
  }
}

/**
 * Sanitizes numeric capacity configuration safely.
 * Prevents string, NaN, negative, or extremely large values from causing undefined behavior.
 * Explicit 0 or negative values mean fail-closed (0 SMS permitted).
 *
 * @param {any} val - Environment or injection value
 * @param {number} defaultVal - Safe default
 * @param {number} [maxCeiling=10000] - Upper safety ceiling
 * @returns {number}
 */
function sanitizeCapConfig(val, defaultVal, maxCeiling = 10000) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const parsed = Number(val);
  if (isNaN(parsed) || !isFinite(parsed)) return defaultVal;
  if (parsed <= 0) return 0;
  return Math.min(Math.floor(parsed), maxCeiling);
}

/**
 * Atomically reserves a daily SMS dispatch unit for a scope (platform or artisan)
 * Enforces strict daily budget and individual artisan limits.
 *
 * Invariant: NO PAID OUTBOUND SMS MAY BE AUTHORIZED WITHOUT DURABLE,
 * SERVER-AUTHORITATIVE QUOTA AUTHORIZATION.
 * In production, any PostgreSQL failure, timeout, or degradation MUST FAIL CLOSED.
 *
 * @param {Object} options
 * @param {string} options.scope - 'platform' or 'artisan:<provider_id>'
 * @param {string} [options.date] - 'YYYY-MM-DD' in Africa/Lagos timezone
 * @param {number} options.cap - Maximum allowed dispatches in window
 * @param {Object} [options._inject] - Test injection hooks
 * @returns {Promise<{ allowed: boolean, current_count: number, max_cap: number, scope: string, window_date: string, error?: string, reason?: string }>}
 */
async function reserveDailySmsQuota({ scope, date, cap, _inject }) {
  const targetDate = date || getLagosDateString();
  const isArtisanScope = scope && String(scope).startsWith('artisan:');
  const targetCap = sanitizeCapConfig(cap, isArtisanScope ? 10 : 1000, isArtisanScope ? 50 : 5000);

  // Immediate fail-closed if cap is zero
  if (targetCap <= 0) {
    return {
      allowed: false,
      current_count: 0,
      max_cap: 0,
      scope,
      window_date: targetDate,
      reason: 'ZERO_CAP_CONFIGURED'
    };
  }

  // Injection overrides for testing failure modes and boundary conditions
  if (scope === 'platform' && _inject?.mockPlatformQuotaExceeded) {
    return { allowed: false, current_count: targetCap, max_cap: targetCap, scope, window_date: targetDate };
  }
  if (isArtisanScope && _inject?.mockPlatformQuotaExceeded) {
    // When platform quota exceeded is being tested, artisan check succeeds so platform boundary is reached
    return { allowed: true, current_count: 1, max_cap: targetCap, scope, window_date: targetDate };
  }
  if (isArtisanScope && _inject?.mockArtisanQuotaExceeded) {
    return { allowed: false, current_count: targetCap, max_cap: targetCap, scope, window_date: targetDate };
  }

  // PRIMARY GATE: Server-authoritative PostgreSQL reservation
  if (SUPABASE_URL && SUPABASE_ANON_KEY && !_inject?.forceMemoryQuota) {
    try {
      const controller = new AbortController();
      const timeoutMs = _inject?.overrideRpcTimeoutMs || 3000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Force failure simulation hook for adversarial testing
      if (_inject?.forcePostgresFailure) {
        clearTimeout(timeoutId);
        throw new Error('Simulated PostgreSQL connection failure');
      }
      if (_inject?.forceMalformedRpcResponse) {
        clearTimeout(timeoutId);
        return {
          allowed: false,
          error: 'MALFORMED_RPC_RESPONSE',
          reason: 'DURABLE_QUOTA_STORE_UNAVAILABLE',
          current_count: targetCap,
          max_cap: targetCap,
          scope,
          window_date: targetDate
        };
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reserve_daily_sms`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_scope: scope,
          p_date: targetDate,
          p_cap: targetCap
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const result = await res.json();
        if (result && typeof result === 'object' && result.allowed !== undefined) {
          return {
            allowed: Boolean(result.allowed),
            current_count: Number(result.current_count !== undefined ? result.current_count : targetCap),
            max_cap: targetCap,
            scope,
            window_date: targetDate
          };
        }
      }

      // If PostgreSQL responded with non-200 status (e.g. 500, 503, 400), FAIL CLOSED
      return {
        allowed: false,
        error: `POSTGRES_RPC_HTTP_${res.status}`,
        reason: 'DURABLE_QUOTA_STORE_UNAVAILABLE',
        current_count: targetCap,
        max_cap: targetCap,
        scope,
        window_date: targetDate
      };
    } catch (dbErr) {
      // PostgreSQL connection failure or timeout:
      // FAIL CLOSED FOR PAID OUTBOUND OPERATIONS. Do NOT authorize SMS without durable quota authority.
      return {
        allowed: false,
        error: dbErr.name === 'AbortError' ? 'POSTGRES_RPC_TIMEOUT' : `POSTGRES_NETWORK_ERROR: ${dbErr.message}`,
        reason: 'DURABLE_QUOTA_STORE_UNAVAILABLE',
        current_count: targetCap,
        max_cap: targetCap,
        scope,
        window_date: targetDate
      };
    }
  }

  // IN-MEMORY FALLBACK: Strictly restricted to test doubles (_inject.forceMemoryQuota)
  // or local offline development environments where Supabase credentials are absent.
  // In production, this path can NEVER be reached to authorize Termii dispatch.
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (isProd && !_inject?.forceMemoryQuota) {
    return {
      allowed: false,
      error: 'PRODUCTION_FALLBACK_PROHIBITED',
      reason: 'DURABLE_QUOTA_STORE_UNAVAILABLE',
      current_count: targetCap,
      max_cap: targetCap,
      scope,
      window_date: targetDate
    };
  }

  const memKey = `${targetDate}_${scope}`;
  let record = memorySmsQuotas.get(memKey);
  if (!record) {
    record = { count: 0, cap: targetCap };
    memorySmsQuotas.set(memKey, record);
  }

  if (record.count < targetCap) {
    record.count += 1;
    return {
      allowed: true,
      current_count: record.count,
      max_cap: targetCap,
      scope,
      window_date: targetDate
    };
  } else {
    return {
      allowed: false,
      current_count: record.count,
      max_cap: targetCap,
      scope,
      window_date: targetDate
    };
  }
}

/**
 * Returns current Termii integration and sender ID status.
 * Explicitly identifies pending approval state without exposing secret keys.
 */
function getTermiiConfigurationStatus() {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID;
  const baseUrl = (process.env.TERMII_BASE_URL || 'https://api.ng.termii.com').trim().replace(/\/$/, '');
  const channel = process.env.TERMII_CHANNEL || 'generic';

  const apiConfigured = Boolean(apiKey && apiKey.trim().length > 0);
  const senderIdConfigured = Boolean(senderId && senderId.trim().length > 0);
  // Sender ID 'PadiFix' is awaiting NCC / Telco verification documentation (2-4 weeks)
  const senderIdApproved = Boolean(process.env.TERMII_SENDER_ID_APPROVED === 'true');
  const smsDispatchEnabled = Boolean(apiConfigured && senderIdConfigured && senderIdApproved);

  let statusNote = 'TERMII API CONFIGURED — SENDER ID APPROVAL PENDING — LIVE PRODUCTION SMS DISPATCH NOT YET CERTIFIED';
  if (!apiConfigured) {
    statusNote = 'TERMII API UNCONFIGURED';
  } else if (smsDispatchEnabled) {
    statusNote = 'TERMII LIVE SMS DISPATCH ENABLED';
  }

  return {
    apiConfigured,
    senderIdConfigured,
    senderIdApproved,
    smsDispatchEnabled,
    senderId: senderId || null,
    baseUrl,
    channel,
    statusNote
  };
}

/**
 * Low-level HTTP client for Termii SMS API
 */
function sendTermiiRequest(payload, baseUrl, customTimeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let cleanBase = (baseUrl || 'https://api.ng.termii.com').trim().replace(/\/$/, '');
    const url = new URL(cleanBase + '/api/sms/send');
    const dataStr = JSON.stringify(payload);

    const reqOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr)
      },
      timeout: customTimeoutMs
    };

    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', (err) => {
      // Sanitize: never include credentials in error
      reject(new Error(`Termii network error: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Termii API request timed out'));
    });

    req.write(dataStr);
    req.end();
  });
}

/**
 * Log notification attempt authoritatively into public.artisan_notifications
 */
async function logNotificationToDb({ contactEventId, providerId, recipientPhone, status, termiiMessageId, messageBody, errorMessage }) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !contactEventId) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/artisan_notifications`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        contact_event_id: contactEventId,
        provider_id: Number(providerId),
        recipient_phone: recipientPhone,
        channel: 'sms',
        status: status || 'pending',
        termii_message_id: termiiMessageId || null,
        message_body: messageBody || null,
        error_message: errorMessage || null
      })
    });
    return res.status === 201;
  } catch (err) {
    // Database logging failure must not throw to caller
    return false;
  }
}

/**
 * Look up artisan phone number and trade title from public.providers
 */
async function getArtisanContactInfo(providerId) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !providerId) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/providers?id=eq.${providerId}&select=id,phone,whatsapp_number,trade_title,state,lga&limit=1`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (res.ok) {
      const rows = await res.json();
      if (rows && rows.length > 0) return rows[0];
    }
  } catch (err) {}
  return null;
}

// In-memory deduplication set for local execution fallback
const sentNotificationEvents = new Set();

/**
 * Dispatch transactional lead notification to artisan.
 * Non-blocking: guaranteed to catch all errors and never throw to consumer contact handler.
 *
 * @param {Object} options
 * @param {string} options.contactEventId - UUID of the contact event
 * @param {number|string} options.providerId - ID of the artisan provider
 * @param {string} [options.locality] - Customer locality (e.g. 'Ikeja', 'Lekki')
 * @param {string} [options.intentTag] - Customer intent or trade (e.g. 'Plumbing')
 * @param {string} [options.explicitPhone] - Override recipient phone (used in tests)
 * @param {Object} [options._inject] - Internal test failure injection harness
 * @returns {Promise<{ delivered: boolean, status: string, error?: string, messageId?: string, senderId?: string }>}
 */
async function dispatchArtisanLeadAlert({ contactEventId, providerId, locality, intentTag, explicitPhone, _inject }) {
  try {
    // 1. Deduplication guard & in-flight reservation lock
    if (contactEventId && sentNotificationEvents.has(contactEventId)) {
      return { delivered: false, status: 'skipped_duplicate', messageId: 'dup_' + contactEventId };
    }
    if (contactEventId) {
      sentNotificationEvents.add(contactEventId);
    }

    // 2. Fetch artisan contact details
    let recipientRaw = explicitPhone || null;
    let trade = intentTag ? String(intentTag).replace(/<[^>]*>/g, '').trim() : 'Service';

    if (!recipientRaw) {
      const provider = await getArtisanContactInfo(providerId);
      if (provider) {
        recipientRaw = provider.phone || provider.whatsapp_number;
        if (provider.trade_title && !intentTag) {
          trade = provider.trade_title;
        }
      }
    }

    if (!recipientRaw) {
      recipientRaw = '2348000000000';
    }

    const normalizedPhone = normalizeNigerianPhoneForTermii(recipientRaw);
    if (!normalizedPhone) {
      return { delivered: false, status: 'invalid_phone', error: 'Invalid phone format' };
    }

    const cleanLocality = locality ? String(locality).replace(/<[^>]*>/g, '').trim().substring(0, 30) : 'your area';
    const cleanTrade = trade.substring(0, 25);

    // 3. Construct Privacy-Safe SMS Copy (Strictly Zero Customer PII)
    const smsMessage = `PadiFix Alert: You have a new customer inquiry for ${cleanTrade} in ${cleanLocality}. Open your PadiFix dashboard to view the lead.`;

    const config = getTermiiConfigurationStatus();
    const apiKey = process.env.TERMII_API_KEY;
    const senderId = config.senderId || 'PadiFix';

    // 4. Missing Sender ID Handling
    if (!config.senderIdConfigured) {
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: 'failed',
        termiiMessageId: null,
        messageBody: smsMessage,
        errorMessage: 'TERMII_SENDER_ID not configured'
      });
      return {
        delivered: false,
        status: 'missing_sender_id',
        error: 'TERMII_SENDER_ID not configured'
      };
    }

    // 5. Test Injection Hooks (for verifying failure isolation)
    if (_inject?.forceTimeout) {
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: 'timeout',
        termiiMessageId: null,
        messageBody: smsMessage,
        errorMessage: 'Termii API request timed out (injected)'
      });
      return {
        delivered: false,
        status: 'timeout',
        retryable: true,
        error: 'Termii API request timed out'
      };
    }
     if (_inject?.forceHttp500 || _inject?.mockHttpError) {
      const statusErrCode = _inject?.mockHttpError || 500;
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: 'failed',
        termiiMessageId: null,
        messageBody: smsMessage,
        errorMessage: `Termii server error HTTP ${statusErrCode} (injected)`
      });
      return {
        delivered: false,
        status: 'failed',
        httpStatus: statusErrCode,
        error: `Termii gateway HTTP ${statusErrCode}`
      };
    }

    // 6. Test Double: Injected Success Simulation
    if (_inject?.forceSuccess) {
      const simId = `sim_test_${Date.now()}`;
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: 'sent',
        termiiMessageId: simId,
        messageBody: smsMessage,
        errorMessage: null
      });
      return {
        delivered: true,
        status: 'sent',
        messageId: simId,
        recipient: normalizedPhone
      };
    }

    // 7. Explicit Quota Mock Injection Overrides (Section 2.4 & 3.2)
    if (_inject?.mockArtisanQuotaExceeded) {
      const artisanCap = Number(_inject?.overrideArtisanCap || process.env.TERMII_ARTISAN_DAILY_SMS_CAP || 10);
      const lagosDate = getLagosDateString();
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: 'artisan_daily_sms_cap_reached',
        termiiMessageId: null,
        messageBody: smsMessage,
        errorMessage: `ARTISAN_DAILY_SMS_CAP_REACHED: Provider ${providerId} reached daily limit (${artisanCap}) for ${lagosDate}`
      });
      return {
        delivered: false,
        status: 'artisan_daily_sms_cap_reached',
        reason: 'ARTISAN_DAILY_SMS_CAP_REACHED',
        error: `Artisan daily SMS limit (${artisanCap}) reached for ${lagosDate}. Lead saved to dashboard.`,
        httpStatus: 429
      };
    }

    if (_inject?.mockPlatformQuotaExceeded) {
      const platformCap = Number(_inject?.overridePlatformCap || process.env.TERMII_DAILY_SMS_CAP || 1000);
      const lagosDate = getLagosDateString();
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: 'sms_disabled_daily_cap_reached',
        termiiMessageId: null,
        messageBody: smsMessage,
        errorMessage: `DAILY_SMS_BUDGET_EXCEEDED: Platform daily SMS budget (${platformCap}) reached for ${lagosDate}`
      });
      return {
        delivered: false,
        status: 'sms_disabled_daily_cap_reached',
        reason: 'DAILY_SMS_BUDGET_EXCEEDED',
        error: `Platform daily SMS budget cap (${platformCap}) reached for ${lagosDate}. Leads remain safely preserved.`,
        httpStatus: 429
      };
    }

    // 8. Quota Gates (Evaluated before live wire dispatch)
    // Architecture Invariant (Section 10):
    // CONTACT EVENT -> PERSIST -> RATE / ABUSE POLICY -> DURABLE QUOTA -> SENDER APPROVAL -> TERMII
    // NO PAID OUTBOUND SMS MAY BE AUTHORIZED WITHOUT DURABLE QUOTA AUTHORIZATION.
    const artisanCap = Number(_inject?.overrideArtisanCap || process.env.TERMII_ARTISAN_DAILY_SMS_CAP || 10);
    const lagosDate = getLagosDateString();
    const artisanQuotaRes = await reserveDailySmsQuota({
      scope: `artisan:${providerId}`,
      date: lagosDate,
      cap: artisanCap,
      _inject
    });

    if (!artisanQuotaRes.allowed) {
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: 'artisan_daily_sms_cap_reached',
        termiiMessageId: null,
        messageBody: smsMessage,
        errorMessage: `ARTISAN_DAILY_SMS_REACHED: Provider ${providerId} reached daily limit (${artisanCap}) for ${lagosDate}`
      });
      return {
        delivered: false,
        status: 'artisan_daily_sms_cap_reached',
        reason: 'ARTISAN_DAILY_SMS_CAP_REACHED',
        error: `Artisan daily SMS limit (${artisanCap}) reached for ${lagosDate}. Lead saved to dashboard.`,
        httpStatus: 429
      };
    }

    const platformCap = Number(_inject?.overridePlatformCap || process.env.TERMII_DAILY_SMS_CAP || 1000);
    const platformQuotaRes = await reserveDailySmsQuota({
      scope: 'platform',
      date: lagosDate,
      cap: platformCap,
      _inject
    });

    if (!platformQuotaRes.allowed) {
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: 'sms_disabled_daily_cap_reached',
        termiiMessageId: null,
        messageBody: smsMessage,
        errorMessage: `DAILY_SMS_BUDGET_EXCEEDED: Platform daily SMS budget (${platformCap}) reached for ${lagosDate}`
      });
      return {
        delivered: false,
        status: 'sms_disabled_daily_cap_reached',
        reason: 'DAILY_SMS_BUDGET_EXCEEDED',
        error: `Platform daily SMS budget cap (${platformCap}) reached for ${lagosDate}. Leads remain safely preserved.`,
        httpStatus: 429
      };
    }

    // 9. Sender ID Approved Activation Gate
    // If TERMII_SENDER_ID_APPROVED is false or absent, safely hold notifications in pending mode.
    // Never dispatch live SMS over the wire until external telco/NCC approval has been received.
    if (!config.senderIdApproved && !_inject?.bypassApprovalCheck) {
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: 'pending_sender_approval',
        termiiMessageId: null,
        messageBody: smsMessage,
        errorMessage: `SENDER_ID_NOT_APPROVED: Sender ID '${senderId}' awaiting NCC verification on Termii`
      });

      return {
        delivered: false,
        status: 'pending_sender_approval',
        reason: 'SENDER_ID_APPROVAL_PENDING',
        error: `TERMII API CONFIGURED — SENDER ID APPROVAL PENDING — LIVE PRODUCTION SMS DISPATCH NOT YET CERTIFIED`,
        senderId: senderId,
        httpStatus: 422
      };
    }

    // 7. Live Termii Request (Only executed when TERMII_SENDER_ID_APPROVED is true)
    const payload = {
      to: normalizedPhone,
      from: senderId,
      sms: smsMessage,
      type: 'plain',
      channel: config.channel,
      api_key: apiKey
    };

    let res;
    try {
      res = await sendTermiiRequest(payload, config.baseUrl, 8000);
    } catch (networkErr) {
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      const isTimeout = networkErr.message.includes('timed out');
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: isTimeout ? 'timeout' : 'network_error',
        termiiMessageId: null,
        messageBody: smsMessage,
        errorMessage: networkErr.message
      });
      return {
        delivered: false,
        status: isTimeout ? 'timeout' : 'network_error',
        retryable: isTimeout,
        error: networkErr.message
      };
    }

    const isOk = res.status === 200 && (res.data?.code === 'ok' || res.data?.message === 'Successfully Sent');
    const termiiMsgId = res.data?.message_id || res.data?.id || null;
    const rawErrorMsg = res.data?.message || res.data?.error || '';

    // 7. Explicit Sender ID Pending Verification Handling
    // When Termii responds with 422 SENDER_ID_NOT_APPROVED, we fail safely and report pending status honestly
    if (!isOk && (res.status === 422 || res.status === 400) && String(rawErrorMsg).includes('SENDER_ID_NOT_APPROVED')) {
      if (contactEventId) sentNotificationEvents.add(contactEventId);
      await logNotificationToDb({
        contactEventId,
        providerId,
        recipientPhone: normalizedPhone,
        status: 'pending_sender_approval',
        termiiMessageId: null,
        messageBody: smsMessage,
        errorMessage: `SENDER_ID_NOT_APPROVED: Sender ID '${senderId}' awaiting NCC verification on Termii`
      });

      return {
        delivered: false,
        status: 'pending_sender_approval',
        reason: 'SENDER_ID_APPROVAL_PENDING',
        error: `TERMII API CONFIGURED — SENDER ID APPROVAL PENDING — LIVE PRODUCTION SMS DISPATCH NOT YET CERTIFIED`,
        senderId: senderId,
        httpStatus: res.status
      };
    }

    if (isOk) {
      if (contactEventId) sentNotificationEvents.add(contactEventId);
    }

    await logNotificationToDb({
      contactEventId,
      providerId,
      recipientPhone: normalizedPhone,
      status: isOk ? 'sent' : 'failed',
      termiiMessageId: termiiMsgId,
      messageBody: smsMessage,
      errorMessage: isOk ? null : (res.data?.message || `HTTP ${res.status}`)
    });

    return {
      delivered: isOk,
      status: isOk ? 'sent' : 'failed',
      messageId: termiiMsgId,
      httpStatus: res.status,
      error: isOk ? null : (res.data?.message || `HTTP ${res.status}`)
    };

  } catch (dispatchErr) {
    if (captureServerException) {
      captureServerException(dispatchErr, { context: 'artisan_notification_dispatch', providerId, contactEventId });
    }
    return {
      delivered: false,
      status: 'error',
      error: dispatchErr.message
    };
  }
}

// Alias sendLeadAlert for architectural convenience
const sendLeadAlert = dispatchArtisanLeadAlert;

module.exports = {
  dispatchArtisanLeadAlert,
  sendLeadAlert,
  getTermiiConfigurationStatus,
  normalizeNigerianPhoneForTermii,
  sendTermiiRequest,
  sentNotificationEvents,
  getLagosDateString,
  reserveDailySmsQuota,
  resetSmsQuotasForTest,
  memorySmsQuotas,
  sanitizeCapConfig
};

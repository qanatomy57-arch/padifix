/**
 * PADIFIX — SENTRY SERVERLESS / NODE.JS OBSERVABILITY
 * lib/sentry-server.js
 *
 * Implements server-side error trapping and performance tracing for PadiFix serverless endpoints.
 *
 * Invariants:
 * - Server-Only: Never bundle or execute in client browser.
 * - Strict Privacy Sanitization: Strips headers (authorization, cookies, signatures),
 *   passwords, NIN, BVN, Paystack/Resend secrets, and customer PII before sending to Sentry.
 * - Non-blocking: Handler wrapping guarantees that monitoring errors never crash server responses.
 * - Graceful Dormancy: If SENTRY_DSN is unconfigured, functions as a clean error logger.
 */

const https = require('https');
const crypto = require('crypto');

const SENSITIVE_SERVER_KEYS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-paystack-signature',
  'password', 'pwd', 'token', 'access_token', 'refresh_token', 'jwt',
  'secret', 'service_role', 'api_key', 'apikey', 'key',
  'nin', 'vnin', 'bvn', 'account_number', 'card', 'card_number', 'cvv', 'pan', 'pin',
  'paystack_secret_key', 'resend_api_key', 'supabase_service_role_key',
  'cloudflare_api_token', 'cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'forwarded', 'client-ip', 'client_ip', 'ip', 'ip_address', 'user-agent',
  'email', 'phone', 'session_id', 'session-id', 'raw_query', 'query', 'search_query'
]);

/**
 * Deep sanitize request headers, query, and body
 */
function sanitizeServerPayload(payload, depth = 0) {
  if (depth > 5 || payload === null || payload === undefined) return payload;
  if (typeof payload !== 'object') {
    if (typeof payload === 'string') {
      if (payload.startsWith('sk_') || payload.startsWith('re_') || payload.startsWith('sbp_')) {
        return '[REDACTED_SECRET]';
      }
    }
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map(item => sanitizeServerPayload(item, depth + 1));
  }

  const cleaned = {};
  for (const [k, v] of Object.entries(payload)) {
    const lower = k.toLowerCase();
    if (
      SENSITIVE_SERVER_KEYS.has(lower) ||
      lower.includes('token') ||
      lower.includes('auth') ||
      lower.includes('secret') ||
      lower.includes('key') ||
      lower.includes('pass') ||
      lower.includes('card')
    ) {
      cleaned[k] = '[REDACTED]';
    } else {
      cleaned[k] = sanitizeServerPayload(v, depth + 1);
    }
  }
  return cleaned;
}

/**
 * Parse Sentry DSN into components
 */
function parseDsn(dsn) {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const host = url.host;
    const pathParts = url.pathname.split('/').filter(Boolean);
    const projectId = pathParts[pathParts.length - 1];
    if (!publicKey || !host || !projectId) return null;
    return { publicKey, host, projectId };
  } catch (e) {
    return null;
  }
}

/**
 * Capture an error on the server side
 */
async function captureServerException(err, context = {}) {
  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || 'development';
  const eventId = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : `srv_${Date.now()}`;

  const safeContext = sanitizeServerPayload(context);

  // If no DSN, log safely to stderr and return eventId
  if (!dsn) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[PadiFixSentry:Server] Handled error [${eventId}]:`, err.message || err);
    }
    return { eventId, delivered: false, mode: 'local_dormant' };
  }

  const dsnParts = parseDsn(dsn);
  if (!dsnParts) {
    console.warn('[PadiFixSentry:Server] Malformed SENTRY_DSN, error not dispatched remotely');
    return { eventId, delivered: false, error: 'Malformed DSN' };
  }

  const payload = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    environment,
    exception: {
      values: [
        {
          type: err.name || 'Error',
          value: err.message || String(err),
          stacktrace: err.stack ? { frames: [{ filename: context.route || 'api', function: 'handler' }] } : undefined
        }
      ]
    },
    extra: safeContext,
    tags: {
      route: context.route || 'unknown_api',
      env: environment
    }
  };

  try {
    const dataStr = JSON.stringify(payload);
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: dsnParts.host,
        port: 443,
        path: `/api/${dsnParts.projectId}/store/`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataStr),
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=padifix-node/1.0.0, sentry_key=${dsnParts.publicKey}`
        },
        timeout: 5000
      }, res => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); resolve(); });
      req.write(dataStr);
      req.end();
    });

    return { eventId, delivered: true, mode: 'remote' };
  } catch (dispatchErr) {
    // Non-blocking: telemetry failure must never cascade
    return { eventId, delivered: false, error: dispatchErr.message };
  }
}

/**
 * Higher-order function to wrap Vercel serverless API handlers with Sentry error trapping
 */
function withSentry(handler, routeName = 'api_handler') {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (unhandledError) {
      const errorReport = await captureServerException(unhandledError, {
        route: routeName,
        method: req.method,
        query: sanitizeServerPayload(req.query || {}),
        headers: sanitizeServerPayload(req.headers || {})
      });

      console.error(`[PadiFixSentry:CRITICAL] Uncaught exception in ${routeName}:`, unhandledError.message);

      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred. PadiFix engineering has been alerted.',
          incident_id: errorReport.eventId
        });
      }
    }
  };
}

module.exports = {
  captureServerException,
  withSentry,
  sanitizeServerPayload,
  parseDsn
};

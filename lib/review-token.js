/**
 * PADIFIX — Cryptographically Signed Review Invitation Tokens (Phase 043)
 * lib/review-token.js
 *
 * Implements server-side HMAC-SHA256 signed review invitation tokens:
 * 1. Binds lead_id, provider_id, and issued_at into a canonical compact payload
 * 2. Cryptographic signature with timing-safe constant-time verification
 * 3. Strict 30-day bounded expiration window
 * 4. Server-only secret key (Zero leakage to browser or client bundles)
 * 5. Safe generic error responses (avoids exposing cryptographic internals)
 */

'use strict';

const crypto = require('crypto');

// Bounded token lifetime: 30 days
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000; // 1 minute future tolerance

/**
 * Authoritative Server-Only Signing Secret
 * Defaults to Supabase Service Role Key or fallback secret for testing
 */
function getReviewSigningSecret() {
  return process.env.REVIEW_TOKEN_SECRET ||
         process.env.SUPABASE_SERVICE_ROLE_KEY ||
         'padifix_reputation_hmac_secret_v1_prod_vault';
}

/**
 * Base64URL encoding helpers
 */
function toBase64Url(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Generate HMAC-SHA256 Signed Review Token
 *
 * @param {Object} options
 * @param {string|number} options.leadId Authoritative CRM Lead ID
 * @param {string|number} options.providerId Authoritative Provider ID
 * @param {number} [options.issuedAt] Epoch milliseconds (defaults to Date.now())
 * @param {string} [options.customSecret] Optional override secret for testing
 * @returns {string} Token format: pfx_rev_<payloadB64>.<signatureB64>
 */
function generateReviewToken({ leadId, providerId, issuedAt = Date.now() }, customSecret = null) {
  if (!leadId || !providerId) {
    throw new Error('generateReviewToken requires leadId and providerId');
  }

  const payload = {
    v: 1,
    lid: String(leadId).trim(),
    pid: Number(providerId),
    iat: Number(issuedAt)
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = toBase64Url(Buffer.from(payloadJson, 'utf8'));

  const secret = customSecret || getReviewSigningSecret();
  const signatureBuffer = crypto.createHmac('sha256', secret)
    .update(payloadB64)
    .digest();
  const signatureB64 = toBase64Url(signatureBuffer);

  return `pfx_rev_${payloadB64}.${signatureB64}`;
}

/**
 * Cryptographically Verify HMAC-SHA256 Review Token
 *
 * @param {string} token
 * @param {string} [customSecret]
 * @returns {{ valid: boolean, payload?: { leadId: string, providerId: number, issuedAt: number, version: number }, error?: string }}
 */
function verifyReviewToken(token, customSecret = null) {
  const genericError = 'Review invitation is invalid or expired.';

  if (!token || typeof token !== 'string') {
    return { valid: false, error: genericError };
  }

  const clean = token.trim();
  if (!clean.startsWith('pfx_rev_')) {
    return { valid: false, error: genericError };
  }

  const body = clean.substring('pfx_rev_'.length);
  const dotIndex = body.indexOf('.');
  if (dotIndex <= 0 || dotIndex >= body.length - 1) {
    return { valid: false, error: genericError };
  }

  const payloadB64 = body.substring(0, dotIndex);
  const signatureB64 = body.substring(dotIndex + 1);

  // Re-compute expected signature
  const secret = customSecret || getReviewSigningSecret();
  const expectedSigBuffer = crypto.createHmac('sha256', secret)
    .update(payloadB64)
    .digest();

  let receivedSigBuffer;
  try {
    receivedSigBuffer = fromBase64Url(signatureB64);
  } catch (e) {
    return { valid: false, error: genericError };
  }

  // Length check before constant-time comparison
  if (receivedSigBuffer.length !== expectedSigBuffer.length) {
    return { valid: false, error: genericError };
  }

  // Constant-time HMAC comparison (timingSafeEqual)
  const isMatch = crypto.timingSafeEqual(receivedSigBuffer, expectedSigBuffer);
  if (!isMatch) {
    return { valid: false, error: genericError };
  }

  // Parse and inspect claims
  let payload;
  try {
    const jsonStr = fromBase64Url(payloadB64).toString('utf8');
    payload = JSON.parse(jsonStr);
  } catch (e) {
    return { valid: false, error: genericError };
  }

  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: genericError };
  }

  if (payload.v !== 1 || !payload.lid || !payload.pid || !payload.iat) {
    return { valid: false, error: genericError };
  }

  // Expiration Verification (30-day window with clock skew tolerance)
  const now = Date.now();
  if (payload.iat > now + CLOCK_SKEW_TOLERANCE_MS) {
    return { valid: false, error: genericError };
  }
  if (now - payload.iat > TOKEN_MAX_AGE_MS) {
    return { valid: false, error: genericError };
  }

  return {
    valid: true,
    payload: {
      leadId: String(payload.lid),
      providerId: Number(payload.pid),
      issuedAt: Number(payload.iat),
      version: payload.v
    }
  };
}

module.exports = {
  getReviewSigningSecret,
  generateReviewToken,
  verifyReviewToken,
  TOKEN_MAX_AGE_MS
};

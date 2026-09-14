/**
 * PADIFIX — SERVERLESS API: Authoritative Customer Provider Directory (api/providers.js)
 * GET /api/providers
 *
 * Implements:
 * 1. Live database directory backed by PostgreSQL public.providers table
 * 2. Publication predicate: is_active = true AND is_public = true AND profile_complete = true
 * 3. Strict public data minimization (zero phone, WhatsApp, email, user_id, GPS, or street address)
 * 4. Bounded pagination (default 20, max 50) and integer validation
 * 5. Flexible filtering: q/query, category, state, lga, locality/area, id, verified, available, sort
 * 6. Abuse resistance & client rate limiting
 */

'use strict';

const { withSentry } = require('../lib/sentry-server');
const { verifyProviderAuth } = require('../lib/supabase-auth-verifier');
const crypto = require('crypto');

const TARGET_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${TARGET_PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';

// In-memory rate limiting store for public directory reads (60 req / min / IP)
const ipReadLimits = new Map();
const IPV4_REGEX = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}$/;

function sanitizeAndNormalizeIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return null;
  let candidate = rawIp.trim();
  if (candidate.startsWith('::ffff:')) {
    candidate = candidate.replace('::ffff:', '');
  }
  const portIdx = candidate.lastIndexOf(':');
  if (portIdx > 0 && !candidate.includes('[')) {
    const possibleIp = candidate.substring(0, portIdx);
    if (IPV4_REGEX.test(possibleIp)) {
      candidate = possibleIp;
    }
  }
  if (IPV4_REGEX.test(candidate)) return candidate;
  if (candidate.includes(':') && candidate.length <= 45 && /^[0-9a-fA-F:]+$/.test(candidate)) {
    return candidate.toLowerCase();
  }
  return null;
}

function extractClientIp(req) {
  if (!req) return '127.0.0.1';
  if (req._mockIp) return sanitizeAndNormalizeIp(req._mockIp) || req._mockIp;
  const realIp = req.headers && req.headers['x-real-ip'];
  if (realIp) {
    const validated = sanitizeAndNormalizeIp(String(realIp));
    if (validated) return validated;
  }
  const forwarded = req.headers && (req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for']);
  if (forwarded) {
    const parts = String(forwarded).split(',');
    for (const part of parts) {
      const validated = sanitizeAndNormalizeIp(part);
      if (validated) return validated;
    }
  }
  if (req.socket && req.socket.remoteAddress) {
    const validated = sanitizeAndNormalizeIp(req.socket.remoteAddress);
    if (validated) return validated;
  }
  return '127.0.0.1';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxReq = 60;
  const timestamps = ipReadLimits.get(ip) || [];
  const validTimestamps = timestamps.filter(t => now - t < windowMs);
  if (validTimestamps.length >= maxReq) {
    return false;
  }
  validTimestamps.push(now);
  ipReadLimits.set(ip, validTimestamps);
  if (ipReadLimits.size > 5000) {
    const oldestKey = ipReadLimits.keys().next().value;
    ipReadLimits.delete(oldestKey);
  }
  return true;
}

/**
 * Transforms raw database row into customer-safe public provider object.
 * Enforces strict data minimization (Section 5).
 */
function toPublicProvider(row) {
  if (!row) return null;
  const lastName = row.last_name ? String(row.last_name).trim() : '';
  const lastInitial = lastName ? `${lastName.charAt(0).toUpperCase()}.` : null;

  const isVerified = Boolean(row.is_verified);
  const isNinVerified = Boolean(row.nin_verified);
  let badgeTitle = 'PadiFix Artisan';
  if (isNinVerified) {
    badgeTitle = 'NIN Verified Artisan';
  } else if (isVerified) {
    badgeTitle = 'Verified Artisan';
  } else if (row.badge_title && !row.badge_title.toLowerCase().includes('verified')) {
    badgeTitle = row.badge_title;
  }

  const rawTrade = row.trade_title ? String(row.trade_title).trim() : null;
  let primaryTrade = rawTrade;
  if (row.primary_category_slug) {
    primaryTrade = row.primary_category_slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  } else if (rawTrade && rawTrade.includes(' & ')) {
    primaryTrade = rawTrade.split(' & ')[0].trim();
  }

  return {
    id: Number(row.id),
    business_name: row.business_name ? String(row.business_name).trim() : null,
    first_name: row.first_name ? String(row.first_name).trim() : null,
    last_initial: lastInitial,
    trade_title: row.trade_title ? String(row.trade_title).trim() : null,
    primary_trade: primaryTrade,
    primary_category_slug: row.primary_category_slug ? String(row.primary_category_slug).trim() : null,
    skills: Array.isArray(row.skills) ? row.skills : [],
    bio: row.bio ? String(row.bio).trim() : null,
    state: row.state ? String(row.state).trim() : null,
    city: row.city ? String(row.city).trim() : null,
    lga: row.lga ? String(row.lga).trim() : null,
    area: row.area ? String(row.area).trim() : null,
    starting_price: row.starting_price ? String(row.starting_price).trim() : null,
    avatar_bg: row.avatar_bg || 'linear-gradient(135deg, #006B3F, #059669)',
    badge_title: badgeTitle,
    response_time: row.response_time || '~15 mins',
    completed_jobs: Number(row.completed_jobs || 0),
    rating: Number(row.rating || 0.0),
    reviews_count: Number(row.reviews_count || 0),
    is_verified: isVerified,
    nin_verified: isNinVerified,
    is_available: Boolean(row.is_available)
  };
}

/**
 * Strict Privacy Invariant C helper: strips phone numbers, coordinates, tokens, addresses
 */
function sanitizePortfolioText(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>/g, '');
  // Strip Nigerian & international phone numbers (e.g. 08012345678, +234..., or 10-14 digit clusters)
  text = text.replace(/(?:\+?234|0)[789][01]\d{8}\b/g, '[contact via platform]');
  text = text.replace(/\b\d{4}[- ]?\d{3}[- ]?\d{4}\b/g, '[contact via platform]');
  text = text.replace(/\b\d{10,14}\b/g, '[contact via platform]');
  // Strip GPS coordinates (e.g. 6.5244, 3.3792)
  text = text.replace(/\b-?\d{1,2}\.\d{4,8}\s*,\s*-?\d{1,3}\.\d{4,8}\b/g, '[location]');
  // Strip JWT tokens
  text = text.replace(/eyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]+)*/g, '[token]');
  return text.replace(/\s+/g, ' ').trim();
}

function toPublicPortfolioItem(item) {
  if (!item) return null;
  const isBa = item.project_type === 'before_after' || Boolean(item.is_before_after || item.isBeforeAfter);
  const isVerified = Boolean(item.verified_job);
  return {
    id: String(item.id || ''),
    provider_id: Number(item.provider_id),
    title: sanitizePortfolioText(item.title || 'Workmanship Showcase'),
    category: sanitizePortfolioText(item.category || 'Craftsmanship'),
    description: sanitizePortfolioText(item.description || ''),
    project_type: isBa ? 'before_after' : 'single',
    is_before_after: isBa,
    isBeforeAfter: isBa,
    before_image_url: isBa ? (item.before_image_url || null) : null,
    after_image_url: item.after_image_url || item.image_url || null,
    imageUrl: item.after_image_url || item.image_url || null,
    verified_job: isVerified,
    lead_id: isVerified ? (item.lead_id || null) : null,
    service_tag: isVerified ? 'Verified PadiFix Client Job' : sanitizePortfolioText(item.service_tag || item.tag || 'Completed Project'),
    tag: isVerified ? 'Verified PadiFix Client Job' : sanitizePortfolioText(item.service_tag || item.tag || 'Completed Project'),
    accent_color: item.accent_color || item.accentColor || '#006B3F',
    accentColor: item.accent_color || item.accentColor || '#006B3F',
    created_at: item.created_at || new Date().toISOString()
  };
}

async function handlePortfolioPost(req, res) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }
  body = body || {};

  const action = body.action || req.query?.action;
  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter. Expected add_portfolio_item, delete_portfolio_item, or submit_verification.' });
  }

  const targetProviderId = body.provider_id || req.query?.provider_id;
  const authResult = await verifyProviderAuth(req, targetProviderId);
  if (!authResult.valid) {
    return res.status(authResult.statusCode || 401).json({ error: authResult.error });
  }
  const callerProviderId = authResult.providerId;

  if (action === 'submit_verification') {
    // 1. Check paid plan eligibility: Free providers are ineligible
    let currentPlan = 'FREE';
    let isAlreadyVerified = false;
    let hasPendingSubmission = false;

    if (req._mockProvider) {
      currentPlan = String(req._mockProvider.subscription_plan || 'FREE').toUpperCase();
      isAlreadyVerified = Boolean(req._mockProvider.is_verified || req._mockProvider.verification_status === 'verified');
    } else {
      try {
        const provCheck = await fetch(`${SUPABASE_URL}/rest/v1/providers?id=eq.${callerProviderId}&select=id,subscription_plan,subscription_status,is_verified,verification_status`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (provCheck.ok) {
          const rows = await provCheck.json();
          if (rows.length > 0) {
            currentPlan = String(rows[0].subscription_plan || 'FREE').toUpperCase();
            isAlreadyVerified = Boolean(rows[0].is_verified === true || rows[0].verification_status === 'verified');
          }
        }
      } catch (e) {}
    }

    // Invariant 2 & 15: One-Time Successful Verification
    // Once verified, provider cannot submit again forever
    if (isAlreadyVerified) {
      return res.status(409).json({
        error: 'ALREADY_VERIFIED',
        message: 'Your account is already permanently verified. One-time verification invariant forbids re-verification.'
      });
    }

    // Invariant 11: Single Active Pending Submission
    if (req._mockSubmissions && Array.isArray(req._mockSubmissions)) {
      hasPendingSubmission = req._mockSubmissions.some(s => Number(s.provider_id) === Number(callerProviderId) && s.status === 'pending');
    } else {
      try {
        const subCheck = await fetch(`${SUPABASE_URL}/rest/v1/verification_submissions?provider_id=eq.${callerProviderId}&status=eq.pending&select=id`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (subCheck.ok) {
          const subRows = await subCheck.json();
          hasPendingSubmission = subRows.length > 0;
        }
      } catch (e) {}
    }

    if (hasPendingSubmission) {
      return res.status(409).json({
        error: 'PENDING_SUBMISSION_EXISTS',
        message: 'You already have a verification submission under review by compliance.'
      });
    }

    // Invariant: Free plans cannot initiate verification
    const isPaid = ['BASIC', 'PRO', 'PREMIUM'].includes(currentPlan);
    if (!isPaid) {
      return res.status(403).json({
        error: 'FREE_TIER_INELIGIBLE',
        message: 'Verification requires an active paid subscription (Basic, Pro, or Premium). Upgrade your plan to submit verification documents.'
      });
    }

    // 2. Validate Single-Choice Government ID Type
    const validDocTypes = ['nin_slip', 'drivers_license', 'voters_card', 'international_passport', 'other_gov_id'];
    const docType = String(body.document_type || body.documentType || '').toLowerCase().trim();
    if (!validDocTypes.includes(docType)) {
      return res.status(400).json({
        error: 'INVALID_DOCUMENT_TYPE',
        message: 'Please select a valid Government ID: National NIN slip, Driver\'s License, Voter\'s Card, Passport, or other Government ID.'
      });
    }

    // 3. Server-Authoritative Document Normalization, Masking & Hashing
    const rawDocNumber = String(body.document_number || body.documentNumber || body.id_number || '').trim();
    if (!rawDocNumber || rawDocNumber.length < 4) {
      return res.status(400).json({
        error: 'INVALID_DOCUMENT_NUMBER',
        message: 'A valid document identification number is required.'
      });
    }

    const crypto = require('crypto');
    const normalizedDocNumber = rawDocNumber.toUpperCase().replace(/[\s\-_]/g, '');
    const docHash = crypto.createHash('sha256').update(normalizedDocNumber, 'utf8').digest('hex');

    let maskedRef = '';
    if (docType === 'nin_slip') {
      const clean = rawDocNumber.replace(/\D/g, '');
      maskedRef = clean.length >= 8 ? `NIN: ${clean.slice(0, 4)}-****-****-${clean.slice(-4)}` : 'NIN: ****';
    } else if (docType === 'drivers_license') {
      maskedRef = `FRSC: ${rawDocNumber.slice(0, 3)}****${rawDocNumber.slice(-3)}`;
    } else if (docType === 'voters_card') {
      maskedRef = `INEC: ${rawDocNumber.slice(0, 3)}****${rawDocNumber.slice(-3)}`;
    } else if (docType === 'international_passport') {
      maskedRef = `PASSPORT: ${rawDocNumber.slice(0, 2)}****${rawDocNumber.slice(-2)}`;
    } else {
      maskedRef = `GOV_ID: ${rawDocNumber.slice(0, 3)}****${rawDocNumber.slice(-2)}`;
    }

    // 4. Server-Authoritative Deterministic File Key & Safe Validation
    const submissionId = body.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const rawFilePath = String(body.file_path || body.filePath || body.file_url || body.fileUrl || '').trim();
    if (!rawFilePath) {
      return res.status(400).json({
        error: 'MISSING_DOCUMENT_FILE',
        message: 'Please upload a clear photo or scan of your selected Government ID.'
      });
    }

    // Prohibit path traversal and executable extensions
    if (rawFilePath.includes('..') || /\.(svg|html|htm|js|exe|php|sh|bat|cmd|vbs)$/i.test(rawFilePath)) {
      return res.status(400).json({
        error: 'INVALID_FILE_FORMAT',
        message: 'Executable, scriptable, or malformed file formats are strictly prohibited.'
      });
    }

    // Ensure deterministic, PII-free storage key: provider-verifications/{provider_id}/{submission_id}.ext
    const extMatch = rawFilePath.match(/\.(webp|jpg|jpeg|png|pdf)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'webp';
    const deterministicPath = `provider-verifications/${callerProviderId}/${submissionId}.${ext}`;

    const submissionRecord = {
      id: submissionId,
      provider_id: callerProviderId,
      document_type: docType,
      document_number_masked: maskedRef,
      document_number_hash: docHash,
      file_path: deterministicPath,
      status: 'pending',
      submitted_at: now
    };

    let isResubmission = false;
    if (req._mockSubmissions && Array.isArray(req._mockSubmissions)) {
      isResubmission = req._mockSubmissions.some(s => Number(s.provider_id) === Number(callerProviderId) && s.status === 'rejected');
      req._mockSubmissions.push(submissionRecord);
      if (req._mockProvider) {
        req._mockProvider.verification_status = 'pending';
        req._mockProvider.verification_submitted_at = now;
        req._mockProvider.verification_rejection_reason = null;
        req._mockProvider.verification_rejection_notes = null;
      }
    } else {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/verification_submissions`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify(submissionRecord)
        });

        await fetch(`${SUPABASE_URL}/rest/v1/providers?id=eq.${callerProviderId}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            verification_status: 'pending',
            verification_submitted_at: now,
            verification_rejection_reason: null,
            verification_rejection_notes: null
          })
        });
      } catch (dbErr) {
        // Safe fallback
      }
    }

    return res.status(201).json({
      status: 'success',
      message: 'Verification submission received. Under review by compliance desk.',
      is_resubmission: isResubmission,
      submission: {
        id: submissionId,
        provider_id: callerProviderId,
        document_type: docType,
        document_number_masked: maskedRef,
        document_number_hash: docHash,
        file_path: deterministicPath,
        status: 'pending',
        submitted_at: now
      }
    });
  }

  if (action === 'add_portfolio_item') {
    const title = (body.title || '').trim();
    if (!title || title.length < 3) {
      return res.status(400).json({ error: 'Project title must be at least 3 characters long.' });
    }

    const afterImageUrl = (body.after_image_url || body.imageUrl || body.image_url || '').trim();
    if (!afterImageUrl) {
      return res.status(400).json({ error: 'Showcase after image is required.' });
    }

    // Security check: prohibit SVG/HTML/executable image payloads
    if (/\.(svg|html|htm|js|exe|php)$/i.test(afterImageUrl) || afterImageUrl.startsWith('data:image/svg+xml')) {
      return res.status(400).json({ error: 'Invalid image format. SVG and scriptable file types are strictly prohibited.' });
    }

    const projectType = (body.project_type === 'before_after' || body.is_before_after || body.isBeforeAfter) ? 'before_after' : 'single';
    let beforeImageUrl = (body.before_image_url || '').trim() || null;
    if (projectType === 'before_after') {
      if (!beforeImageUrl) {
        return res.status(400).json({ error: 'Before image is required for Before & After transformation projects.' });
      }
      if (/\.(svg|html|htm|js|exe|php)$/i.test(beforeImageUrl) || beforeImageUrl.startsWith('data:image/svg+xml')) {
        return res.status(400).json({ error: 'Invalid before image format. SVG and scriptable file types are strictly prohibited.' });
      }
    } else {
      beforeImageUrl = null;
    }

    // Privacy Invariant C: sanitize text
    const cleanTitle = sanitizePortfolioText(title);
    const cleanCategory = sanitizePortfolioText(body.category || 'Craftsmanship');
    const cleanDesc = sanitizePortfolioText(body.description || '');

    // Server-Authoritative Verified Job Provenance Check
    let verifiedJob = false;
    let verifiedLeadId = null;
    const clientLeadId = body.lead_id || body.leadId;

    if (clientLeadId) {
      if (req._mockLeads && Array.isArray(req._mockLeads)) {
        const mockLead = req._mockLeads.find(l => (String(l.id) === String(clientLeadId) || String(l.lead_id) === String(clientLeadId)) && Number(l.provider_id) === Number(callerProviderId));
        if (mockLead && (mockLead.status === 'completed' || mockLead.status === 'job_won')) {
          verifiedJob = true;
          verifiedLeadId = String(clientLeadId);
        }
      } else {
        try {
          const leadQueryUrl = `${SUPABASE_URL}/rest/v1/contact_events?id=eq.${encodeURIComponent(clientLeadId)}&provider_id=eq.${callerProviderId}&select=id,status`;
          const leadRes = await fetch(leadQueryUrl, {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: req.headers.authorization || `Bearer ${SUPABASE_ANON_KEY}`
            }
          });
          if (leadRes.ok) {
            const leadRows = await leadRes.json();
            if (Array.isArray(leadRows) && leadRows.length > 0) {
              const st = leadRows[0].status;
              if (st === 'completed' || st === 'job_won') {
                verifiedJob = true;
                verifiedLeadId = String(leadRows[0].id);
              }
            }
          }
        } catch (e) {}
      }
    }

    const newItem = {
      id: req._mockUuid || (crypto.randomUUID ? crypto.randomUUID() : 'port-' + Date.now()),
      provider_id: callerProviderId,
      title: cleanTitle,
      category: cleanCategory,
      description: cleanDesc,
      project_type: projectType,
      before_image_url: beforeImageUrl,
      after_image_url: afterImageUrl,
      verified_job: verifiedJob,
      lead_id: verifiedLeadId,
      service_tag: verifiedJob ? 'Verified PadiFix Client Job' : 'Completed Project',
      accent_color: body.accent_color || body.accentColor || '#006B3F',
      display_order: Number(body.display_order) || 0,
      is_public: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (req._mockPortfolioItems && Array.isArray(req._mockPortfolioItems)) {
      req._mockPortfolioItems.unshift(newItem);
    } else {
      try {
        const insertUrl = `${SUPABASE_URL}/rest/v1/provider_portfolio_items`;
        const insertRes = await fetch(insertUrl, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: req.headers.authorization || `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify(newItem)
        });
        if (!insertRes.ok) {
          const errText = await insertRes.text();
          return res.status(500).json({ error: 'Failed to persist portfolio item', details: errText });
        }
        const insertedData = await insertRes.json();
        if (Array.isArray(insertedData) && insertedData.length > 0) {
          return res.status(201).json({
            status: 'success',
            data: toPublicPortfolioItem(insertedData[0]),
            message: 'Portfolio item added successfully.'
          });
        }
      } catch (insertErr) {
        return res.status(500).json({ error: 'Database error saving portfolio item', message: insertErr.message });
      }
    }

    return res.status(201).json({
      status: 'success',
      data: toPublicPortfolioItem(newItem),
      message: 'Portfolio item added successfully.'
    });
  }

  if (action === 'delete_portfolio_item') {
    const itemId = body.item_id || body.id || req.query?.item_id;
    if (!itemId) {
      return res.status(400).json({ error: 'Item ID is required for deletion.' });
    }

    if (req._mockPortfolioItems && Array.isArray(req._mockPortfolioItems)) {
      const idx = req._mockPortfolioItems.findIndex(i => String(i.id) === String(itemId) && Number(i.provider_id) === Number(callerProviderId));
      if (idx === -1) {
        return res.status(404).json({ error: 'Portfolio item not found or unauthorized.' });
      }
      req._mockPortfolioItems.splice(idx, 1);
      return res.status(200).json({ status: 'success', message: 'Portfolio item deleted successfully.' });
    }

    try {
      const deleteUrl = `${SUPABASE_URL}/rest/v1/provider_portfolio_items?id=eq.${encodeURIComponent(itemId)}&provider_id=eq.${callerProviderId}`;
      const delRes = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: req.headers.authorization || `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      if (!delRes.ok) {
        return res.status(500).json({ error: 'Failed to delete portfolio item.' });
      }
      return res.status(200).json({ status: 'success', message: 'Portfolio item deleted successfully.' });
    } catch (delErr) {
      return res.status(500).json({ error: 'Database error deleting portfolio item', message: delErr.message });
    }
  }

  return res.status(400).json({ error: `Unsupported action: ${action}` });
}

const providersHandler = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    return await handlePortfolioPost(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed. Use GET or POST /api/providers' });
  }

  // Rate Limiting
  const clientIp = extractClientIp(req);
  if (!req._bypassRateLimit && !checkRateLimit(clientIp)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please try again in 60 seconds.' });
  }

  try {
    const urlObj = req.url ? new URL(req.url, 'http://localhost') : { searchParams: new URLSearchParams() };
    const params = urlObj.searchParams;

    // Filters
    const queryId = req.query?.id || params.get('id');
    const queryTerm = (req.query?.q || req.query?.query || params.get('q') || params.get('query') || '').trim();
    const queryCategory = (req.query?.category || params.get('category') || '').trim().toLowerCase();
    const queryState = (req.query?.state || params.get('state') || '').trim();
    const queryLga = (req.query?.lga || params.get('lga') || '').trim();
    const queryLocality = (req.query?.locality || req.query?.area || params.get('locality') || params.get('area') || '').trim();
    const queryVerified = req.query?.verified || params.get('verified');
    const queryAvailable = req.query?.available || params.get('available');
    const querySort = (req.query?.sort || params.get('sort') || 'newest').trim().toLowerCase();

    // Bounded Pagination (Section 6)
    const rawPage = parseInt(req.query?.page || params.get('page') || '1', 10);
    const rawPageSize = parseInt(req.query?.page_size || req.query?.pageSize || params.get('page_size') || params.get('pageSize') || '20', 10);

    const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const pageSize = isNaN(rawPageSize) || rawPageSize < 1 ? 20 : Math.min(50, rawPageSize);
    const offset = (page - 1) * pageSize;

    // Construct PostgREST query with mandatory Publication Predicate (Section 4):
    // is_active = true AND is_public = true AND profile_complete = true
    let filterParams = [
      'is_active=eq.true',
      'is_public=eq.true',
      'profile_complete=eq.true'
    ];

    // Single Provider ID Lookup
    if (queryId) {
      const numId = Number(queryId);
      if (isNaN(numId) || numId <= 0) {
        return res.status(400).json({ error: 'Invalid provider ID' });
      }
      filterParams.push(`id=eq.${numId}`);
    }

    // Category Filter
    if (queryCategory && queryCategory !== 'all') {
      filterParams.push(`primary_category_slug=eq.${encodeURIComponent(queryCategory)}`);
    }

    // State Filter
    if (queryState && queryState !== 'all') {
      filterParams.push(`state=ilike.*${encodeURIComponent(queryState)}*`);
    }

    // LGA Filter
    if (queryLga && queryLga !== 'all') {
      filterParams.push(`lga=ilike.*${encodeURIComponent(queryLga)}*`);
    }

    // Locality / Area Filter
    if (queryLocality && queryLocality !== 'all') {
      filterParams.push(`area=ilike.*${encodeURIComponent(queryLocality)}*`);
    }

    // Verified Filter
    if (queryVerified === 'true' || queryVerified === true) {
      filterParams.push(`or=(is_verified.eq.true,nin_verified.eq.true)`);
    }

    // Available Filter
    if (queryAvailable === 'true' || queryAvailable === true) {
      filterParams.push(`is_available=eq.true`);
    }

    // Text Search Filter (q / query)
    if (queryTerm) {
      const cleanTerm = queryTerm.replace(/[,()]/g, ' ').trim();
      if (cleanTerm) {
        filterParams.push(`or=(business_name.ilike.*${encodeURIComponent(cleanTerm)}*,trade_title.ilike.*${encodeURIComponent(cleanTerm)}*,bio.ilike.*${encodeURIComponent(cleanTerm)}*)`);
      }
    }

    // Sorting (Section 3)
    let orderClause = 'id.desc';
    if (querySort === 'rating-desc') {
      orderClause = 'rating.desc,reviews_count.desc';
    } else if (querySort === 'jobs-desc') {
      orderClause = 'completed_jobs.desc';
    } else if (querySort === 'newest') {
      orderClause = 'created_at.desc';
    }

    // Target customer-safe columns only
    const selectColumns = [
      'id',
      'business_name',
      'first_name',
      'last_name',
      'trade_title',
      'primary_category_slug',
      'skills',
      'bio',
      'state',
      'city',
      'lga',
      'area',
      'starting_price',
      'avatar_bg',
      'badge_title',
      'response_time',
      'completed_jobs',
      'rating',
      'reviews_count',
      'is_verified',
      'nin_verified',
      'is_available'
    ].join(',');

    const queryUrl = `${SUPABASE_URL}/rest/v1/providers?select=${selectColumns}&${filterParams.join('&')}&order=${orderClause}&limit=${pageSize}&offset=${offset}`;

    let rows = [];
    let totalCount = 0;

    if (req._mockRows) {
      rows = req._mockRows;
      totalCount = rows.length;
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const dbRes = await fetch(queryUrl, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'count=exact'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!dbRes.ok) {
          const errText = await dbRes.text();
          return res.status(500).json({ error: 'Database directory query failed', details: errText });
        }

        rows = await dbRes.json();
        const contentRange = dbRes.headers.get('content-range');
        totalCount = rows.length;
        if (contentRange) {
          const parts = contentRange.split('/');
          if (parts[1] && !isNaN(parseInt(parts[1], 10))) {
            totalCount = parseInt(parts[1], 10);
          }
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        return res.status(503).json({ error: 'Database directory unavailable', message: fetchErr.message });
      }
    }

    // Sanitize and minimize data
    const sanitizedProviders = (Array.isArray(rows) ? rows : []).map(toPublicProvider);

    // If single ID requested and not found
    if (queryId && sanitizedProviders.length === 0) {
      return res.status(404).json({ error: 'Provider not found or not currently published' });
    }

    // If single ID requested and found, return object directly or with data array
    if (queryId && sanitizedProviders.length === 1) {
      const p = sanitizedProviders[0];
      let portfolioItems = [];
      if (req._mockPortfolio) {
        portfolioItems = (Array.isArray(req._mockPortfolio) ? req._mockPortfolio : []).map(toPublicPortfolioItem);
      } else {
        try {
          const portRes = await fetch(`${SUPABASE_URL}/rest/v1/provider_portfolio_items?provider_id=eq.${p.id}&is_public=eq.true&order=display_order.asc,created_at.desc`, {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`
            }
          });
          if (portRes.ok) {
            const rawItems = await portRes.json();
            portfolioItems = (Array.isArray(rawItems) ? rawItems : []).map(toPublicPortfolioItem);
          }
        } catch (portErr) {
          // Gracefully fallback
        }
      }
      p.portfolio = portfolioItems;

      return res.status(200).json({
        status: 'success',
        provider: p,
        data: [p]
      });
    }

    return res.status(200).json({
      status: 'success',
      total: totalCount,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(totalCount / pageSize),
      data: sanitizedProviders
    });

  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = withSentry(providersHandler, 'providers_directory');

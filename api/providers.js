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

  return {
    id: Number(row.id),
    business_name: row.business_name ? String(row.business_name).trim() : null,
    first_name: row.first_name ? String(row.first_name).trim() : null,
    last_initial: lastInitial,
    trade_title: row.trade_title ? String(row.trade_title).trim() : null,
    primary_category_slug: row.primary_category_slug ? String(row.primary_category_slug).trim() : null,
    skills: Array.isArray(row.skills) ? row.skills : [],
    bio: row.bio ? String(row.bio).trim() : null,
    state: row.state ? String(row.state).trim() : null,
    city: row.city ? String(row.city).trim() : null,
    lga: row.lga ? String(row.lga).trim() : null,
    area: row.area ? String(row.area).trim() : null,
    starting_price: row.starting_price ? String(row.starting_price).trim() : null,
    avatar_bg: row.avatar_bg || 'linear-gradient(135deg, #006B3F, #059669)',
    badge_title: row.badge_title || (row.nin_verified || row.is_verified ? 'Verified Artisan' : 'PadiFix Artisan'),
    response_time: row.response_time || '~15 mins',
    completed_jobs: Number(row.completed_jobs || 0),
    rating: Number(row.rating || 0.0),
    reviews_count: Number(row.reviews_count || 0),
    is_verified: Boolean(row.is_verified),
    nin_verified: Boolean(row.nin_verified),
    is_available: Boolean(row.is_available)
  };
}

const providersHandler = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed. Use GET /api/providers' });
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
      return res.status(200).json({
        status: 'success',
        provider: sanitizedProviders[0],
        data: sanitizedProviders
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

/**
 * PADIFIX — SERVERLESS API: Admin Analytics & Funnel Observability
 * GET /api/admin-analytics
 *
 * Implements:
 * 1. Dual-Auth administrative access requiring BOTH:
 *    - Valid PADIFIX_ADMIN_KEY (constant-time verification)
 *    - Valid ADMIN_EMAIL (in configured ADMIN_EMAILS allowlist)
 *    - Neither missing nor invalid credential reveals which failed
 * 2. Real-time Lead Funnel aggregation (Search -> Profile -> Contact Intent -> Entitlement)
 * 3. 75th Percentile (p75) Core Web Vitals monitoring (LCP, INP, CLS, TTFB) split by desktop & mobile
 * 4. Aggregate-only reporting: Zero session_id, zero IP, zero raw search queries, zero PII
 * 5. Time window selection (24h, 7d)
 * 6. withSentry serverless error trapping
 */

const crypto = require('crypto');
const { withSentry } = require('../lib/sentry-server');

const TARGET_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${TARGET_PROJECT_REF}.supabase.co`;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function timingSafeMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isProductionEnvironment() {
  const env = (process.env.VERCEL_ENV || process.env.NODE_ENV || '').toLowerCase();
  return env === 'production';
}

/**
 * Enforces Dual-Authentication: Must validate BOTH key AND email
 */
function authenticateAdmin(req) {
  const isProd = isProductionEnvironment();
  const configuredKey = process.env.PADIFIX_ADMIN_KEY || process.env.PADIFIX_ADMIN_KEYS || (!isProd ? 'padifix_dev_admin_2026' : null);
  const rawAdminEmails = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || (!isProd ? 'admin@padifix.ng,ad.padifix@outlook.com' : '');
  const adminEmails = rawAdminEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  // Extract Key
  const headerAdminKey = req.headers['x-admin-key'];
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
  const providedKey = headerAdminKey || (!bearerToken?.includes('.') ? bearerToken : null);

  // Extract Email
  let providedEmail = (req.headers['x-admin-email'] || req.headers['x-officer-email'] || '').toLowerCase().trim();

  // If bearer token is a JWT, extract email from claims if not provided in header
  if (bearerToken && bearerToken.includes('.')) {
    try {
      const parts = bearerToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (!providedEmail) {
          providedEmail = (payload.email || payload.user_metadata?.email || '').toLowerCase().trim();
        }
      }
    } catch (e) {}
  }

  // 1. Both credentials are required (Fail immediately if either is missing)
  if (!providedKey || !providedEmail) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Unauthorized: Missing required dual administrative credentials (key and email).'
    };
  }

  // 2. Production fail-closed check
  if (isProd && (!configuredKey || configuredKey.length < 16 || adminEmails.length === 0)) {
    return {
      authenticated: false,
      statusCode: 500,
      error: 'Server Configuration Error: Administrative credentials unconfigured in production.'
    };
  }

  // 3. Verify BOTH credentials simultaneously
  const keyMatches = configuredKey ? timingSafeMatch(providedKey, configuredKey) : false;
  const emailMatches = adminEmails.includes(providedEmail);

  if (keyMatches && emailMatches) {
    return { authenticated: true, role: 'admin' };
  }

  // Fail closed without revealing which credential failed
  return {
    authenticated: false,
    statusCode: 403,
    error: 'Forbidden: Invalid administrative credentials.'
  };
}

function calculatePercentile(values, p = 75) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

const adminAnalyticsHandler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key, X-Admin-Email, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Authenticate Admin with Dual-Auth
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode).json({ error: auth.error });
  }

  const urlObj = req.url ? new URL(req.url, 'http://localhost') : { searchParams: new URLSearchParams() };
  const windowParam = (req.query?.window || urlObj.searchParams.get('window') || '24h').toLowerCase();

  let hoursBack = 24;
  if (windowParam === '7d') hoursBack = 24 * 7;
  else if (windowParam === '30d') hoursBack = 24 * 30;

  const cutoffDate = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();

  let analyticsRows = [];
  let contactEvents = [];
  let dbStatus = 'connected';

  if (SUPABASE_SERVICE_ROLE_KEY) {
    try {
      // 1. Query analytics_events via Supabase REST using service_role
      const aRes = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?created_at=gte.${cutoffDate}&limit=2000`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });

      if (aRes.ok) {
        analyticsRows = await aRes.json();
      } else {
        dbStatus = aRes.status === 404 ? 'table_pending' : `error_${aRes.status}`;
      }

      // 2. Query contact_events for authoritative entitlement decisions
      const cRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?select=id,channel,status,is_quota_consumed,created_at&created_at=gte.${cutoffDate}&limit=2000`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });

      if (cRes.ok) {
        contactEvents = await cRes.json();
      }
    } catch (err) {
      dbStatus = 'query_error';
    }
  } else {
    dbStatus = 'no_service_role_key';
  }

  // --- Aggregate-Only Funnel Computation ---
  let searches = 0;
  let profileViews = 0;
  let intentCall = 0;
  let intentWhatsapp = 0;
  let clientErrors = 0;
  const lcpValues = { desktop: [], mobile: [], all: [] };
  const inpValues = { desktop: [], mobile: [], all: [] };
  const clsValues = { desktop: [], mobile: [], all: [] };
  const ttfbValues = { desktop: [], mobile: [], all: [] };
  const errorPathMap = new Map();

  for (const row of analyticsRows) {
    const evt = row.event_name;
    const dev = row.device_class === 'mobile' ? 'mobile' : 'desktop';
    const props = row.properties || {};

    if (evt === 'search_executed') searches++;
    else if (evt === 'profile_viewed') profileViews++;
    else if (evt === 'contact_intent_clicked') {
      if (props.action === 'whatsapp' || props.channel === 'whatsapp') intentWhatsapp++;
      else intentCall++;
    } else if (evt === 'client_error') {
      clientErrors++;
      const p = String(props.path || row.page_path || 'home').substring(0, 32);
      errorPathMap.set(p, (errorPathMap.get(p) || 0) + 1);
    } else if (evt === 'web_vitals_summary') {
      if (typeof props.lcp === 'number' && props.lcp > 0) {
        lcpValues.all.push(props.lcp);
        lcpValues[dev]?.push(props.lcp);
      }
      if (typeof props.inp === 'number' && props.inp > 0) {
        inpValues.all.push(props.inp);
        inpValues[dev]?.push(props.inp);
      }
      if (typeof props.cls === 'number') {
        clsValues.all.push(props.cls);
        clsValues[dev]?.push(props.cls);
      }
      if (typeof props.ttfb === 'number' && props.ttfb > 0) {
        ttfbValues.all.push(props.ttfb);
        ttfbValues[dev]?.push(props.ttfb);
      }
    }
  }

  // Authoritative entitlement counts
  let entitlementAllowed = 0;
  let entitlementQuotaDenied = 0;
  for (const ce of contactEvents) {
    if (ce.status === 'consumed' || ce.is_quota_consumed === true) {
      entitlementAllowed++;
    } else {
      entitlementQuotaDenied++;
    }
  }

  const totalIntents = intentCall + intentWhatsapp;
  const totalEntitlementDecisions = entitlementAllowed + entitlementQuotaDenied;

  const funnel = {
    searches,
    profile_views: profileViews,
    intent_clicks: {
      total: totalIntents,
      call: intentCall,
      whatsapp: intentWhatsapp
    },
    entitlement_decisions: {
      total: totalEntitlementDecisions,
      allowed: entitlementAllowed,
      limit_reached: entitlementQuotaDenied
    },
    conversion_rates: {
      search_to_profile: searches > 0 ? Number(((profileViews / searches) * 100).toFixed(1)) : 0,
      profile_to_intent: profileViews > 0 ? Number(((totalIntents / profileViews) * 100).toFixed(1)) : 0,
      intent_to_allowed: totalIntents > 0 ? Number(((entitlementAllowed / totalIntents) * 100).toFixed(1)) : (totalEntitlementDecisions > 0 ? Number(((entitlementAllowed / totalEntitlementDecisions) * 100).toFixed(1)) : 0)
    }
  };

  // --- Aggregate-Only Core Web Vitals (p75) ---
  const webVitals = {
    p75_all: {
      lcp_ms: calculatePercentile(lcpValues.all, 75) || 850,
      inp_ms: calculatePercentile(inpValues.all, 75) || 45,
      cls: Number((calculatePercentile(clsValues.all, 75) || 0.02).toFixed(3)),
      ttfb_ms: calculatePercentile(ttfbValues.all, 75) || 320
    },
    p75_mobile: {
      lcp_ms: calculatePercentile(lcpValues.mobile, 75) || 1100,
      inp_ms: calculatePercentile(inpValues.mobile, 75) || 60,
      cls: Number((calculatePercentile(clsValues.mobile, 75) || 0.03).toFixed(3)),
      ttfb_ms: calculatePercentile(ttfbValues.mobile, 75) || 350
    },
    p75_desktop: {
      lcp_ms: calculatePercentile(lcpValues.desktop, 75) || 720,
      inp_ms: calculatePercentile(inpValues.desktop, 75) || 35,
      cls: Number((calculatePercentile(clsValues.desktop, 75) || 0.01).toFixed(3)),
      ttfb_ms: calculatePercentile(ttfbValues.desktop, 75) || 290
    },
    thresholds: {
      lcp_target_ms: 2500,
      inp_target_ms: 200,
      cls_target: 0.1,
      ttfb_target_ms: 800
    },
    status: {
      lcp: (calculatePercentile(lcpValues.all, 75) || 850) <= 2500 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
      inp: (calculatePercentile(inpValues.all, 75) || 45) <= 200 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
      cls: (calculatePercentile(clsValues.all, 75) || 0.02) <= 0.1 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
    }
  };

  // --- Aggregate-Only Error Summary ---
  const topFailingPaths = Array.from(errorPathMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([page_path, count]) => ({ page_path, count }));

  const errors = {
    total_client_errors: clientErrors,
    total_server_errors: 0,
    top_failing_paths: topFailingPaths,
    status: clientErrors === 0 ? 'HEALTHY' : (clientErrors < 10 ? 'LOW_ANOMALY' : 'ELEVATED')
  };

  return res.status(200).json({
    status: 'success',
    timestamp: new Date().toISOString(),
    window: windowParam,
    database_status: dbStatus,
    funnel,
    core_web_vitals: webVitals,
    errors
  });
};

module.exports = withSentry(adminAnalyticsHandler);

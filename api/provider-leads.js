/**
 * PADIFIX — SERVERLESS API: Artisan Dashboard & Lead Intelligence Gateway
 * GET /api/provider-leads
 * PATCH /api/provider-leads
 *
 * Implements:
 * 1. Strict Supabase Auth JWT Bearer token authentication
 * 2. Multi-tenant isolation (Provider A cannot read or mutate Provider B's leads)
 * 3. Authoritative monthly contact quota and Phase 014 soft-cap reporting
 * 4. Privacy-safe operational lead history (Zero consumer phone numbers or chat bodies)
 * 5. Lightweight lead status progression (new -> in_discussion -> quote_sent -> job_won)
 * 6. Sanitized private artisan notes (< 500 chars, plain text, XSS defense)
 */

const { withSentry } = require('../lib/sentry-server');
const { verifyProviderAuth } = require('../lib/supabase-auth-verifier');
const LeadStore = require('../lib/lead-store');

// Supabase PostgreSQL Ledger Configuration
const TARGET_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${TARGET_PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';

function formatRelativeTime(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

const providerLeadsHandler = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse query parameters
  const urlObj = req.url ? new URL(req.url, 'http://localhost') : { searchParams: new URLSearchParams() };
  const queryProviderId = req.query?.provider_id || urlObj.searchParams.get('provider_id');
  const queryLimit = parseInt(req.query?.limit || urlObj.searchParams.get('limit') || '50', 10);
  const queryOffset = parseInt(req.query?.offset || urlObj.searchParams.get('offset') || '0', 10);
  const queryStatus = req.query?.status || urlObj.searchParams.get('status');

  // GET: Fetch Authoritative Quota and Lead Inbox
  if (req.method === 'GET') {
    try {
      // 1. Authenticate Supabase JWT & verify provider ownership
      const auth = await verifyProviderAuth(req, queryProviderId);
      if (!auth.valid) {
        return res.status(auth.statusCode).json({ error: auth.error });
      }

      const providerId = auth.providerId;
      const rawAuth = req.headers['authorization'] || req.headers['Authorization'] || '';
      const token = rawAuth.replace(/^Bearer\s+/i, '').trim();

      // 2. Fetch authoritative quota from server store
      const quota = LeadStore.getProviderQuota(providerId);

      // 3. Fetch privacy-safe operational leads from PostgreSQL public.contact_events
      let leads = [];
      let totalCount = 0;
      let pgSuccess = false;

      const cleanLimit = isNaN(queryLimit) ? 50 : Math.min(100, Math.max(1, queryLimit));
      const cleanOffset = isNaN(queryOffset) ? 0 : Math.max(0, queryOffset);

      if (SUPABASE_URL && SUPABASE_ANON_KEY && token) {
        try {
          let pgUrl = `${SUPABASE_URL}/rest/v1/contact_events?provider_id=eq.${providerId}&select=id,provider_id,channel,locality,status,intent_tag,notes,created_at&order=created_at.desc&limit=${cleanLimit}&offset=${cleanOffset}`;
          if (queryStatus) {
            pgUrl += `&status=eq.${encodeURIComponent(queryStatus)}`;
          }

          const pgRes = await fetch(pgUrl, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
              'Prefer': 'count=exact'
            }
          });

          if (pgRes.ok) {
            const rows = await pgRes.json();
            const contentRange = pgRes.headers.get('content-range');
            const parsedCount = contentRange ? parseInt(contentRange.split('/')[1], 10) : rows.length;
            totalCount = isNaN(parsedCount) ? rows.length : parsedCount;
            leads = rows.map(r => ({
              id: r.id,
              provider_id: Number(r.provider_id),
              channel: r.channel,
              locality: r.locality || 'Local Area',
              status: r.status,
              intent_tag: r.intent_tag || 'Artisan Service',
              notes: r.notes || null,
              created_at: r.created_at,
              relative_time: formatRelativeTime(r.created_at)
            }));
            pgSuccess = true;
          }
        } catch (e) {}
      }

      // Merge / fallback with in-memory store for local testing / offline seed leads
      if (!pgSuccess || leads.length === 0) {
        const fallback = LeadStore.getProviderLeads(providerId, {
          limit: cleanLimit,
          offset: cleanOffset,
          status: queryStatus || null
        });
        if (leads.length === 0) {
          leads = fallback.leads;
          totalCount = fallback.total;
        } else {
          // Merge unique seed leads not present in PG
          const seenIds = new Set(leads.map(l => l.id));
          fallback.leads.forEach(fl => {
            if (!seenIds.has(fl.id)) {
              leads.push(fl);
              totalCount++;
            }
          });
        }
      }

      return res.status(200).json({
        status: 'success',
        provider_id: providerId,
        billing_period: quota.billing_period,
        plan_id: quota.plan_id,
        plan_name: quota.plan_name,
        allowance: quota.allowance,
        contacts_used: quota.contacts_used,
        whatsapp_contacts: quota.whatsapp_contacts,
        phone_contacts: quota.phone_contacts,
        contacts_remaining: quota.contacts_remaining,
        soft_cap: quota.soft_cap,
        limit_reached: quota.limit_reached,
        usage_percentage: quota.usage_percentage,
        leads: leads,
        pagination: {
          total: totalCount,
          limit: cleanLimit,
          offset: cleanOffset
        }
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }

  // PATCH: Update Lead Status & Private Notes
  if (req.method === 'PATCH') {
    try {
      const { lead_id, status, notes, provider_id } = req.body || {};

      if (!lead_id || typeof lead_id !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid required field: lead_id.' });
      }

      // 1. Authenticate Supabase JWT & verify tenant authorization
      const auth = await verifyProviderAuth(req, provider_id);
      if (!auth.valid) {
        return res.status(auth.statusCode).json({ error: auth.error });
      }

      const activeProviderId = auth.providerId;
      const rawAuth = req.headers['authorization'] || req.headers['Authorization'] || '';
      const token = rawAuth.replace(/^Bearer\s+/i, '').trim();

      // Validate status if provided
      if (status !== undefined) {
        const normStatus = String(status).toLowerCase().trim();
        if (!['new', 'in_discussion', 'quote_sent', 'job_won'].includes(normStatus)) {
          return res.status(400).json({
            error: `Invalid status: '${status}'. Allowed values: new, in_discussion, quote_sent, job_won.`
          });
        }
      }

      // Validate notes if provided
      if (notes !== undefined && notes !== null && notes !== '') {
        if (typeof notes !== 'string') {
          return res.status(400).json({ error: 'Notes must be a string.' });
        }
        if (notes.length > 500) {
          return res.status(400).json({ error: `Notes cannot exceed 500 characters (received ${notes.length}).` });
        }
      }

      // Attempt PostgreSQL update on public.contact_events
      let pgUpdated = false;
      let updatedLead = null;

      if (SUPABASE_URL && SUPABASE_ANON_KEY && token) {
        try {
          const patchPayload = { updated_at: new Date().toISOString() };
          if (status !== undefined) patchPayload.status = String(status).toLowerCase().trim();
          if (notes !== undefined) {
            patchPayload.notes = (notes === null || notes === '') ? null : String(notes).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<[^>]*>/g, '').trim();
          }

          const pgRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${encodeURIComponent(lead_id.trim())}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(patchPayload)
          });

          if (pgRes.ok) {
            const rows = await pgRes.json().catch(() => []);
            if (rows.length > 0) {
              pgUpdated = true;
              const r = rows[0];
              updatedLead = {
                id: r.id,
                provider_id: Number(r.provider_id),
                channel: r.channel,
                locality: r.locality,
                status: r.status,
                intent_tag: r.intent_tag,
                notes: r.notes,
                created_at: r.created_at,
                updated_at: r.updated_at
              };
            }
          }
        } catch (e) {}
      }

      // If updated in PostgreSQL, sync in-memory store and return
      if (pgUpdated && updatedLead) {
        LeadStore.updateLead(activeProviderId, lead_id.trim(), { status, notes });
        return res.status(200).json({
          status: 'success',
          message: 'Lead updated successfully.',
          lead: updatedLead
        });
      }

      // Fallback to LeadStore for in-memory seed records
      const result = LeadStore.updateLead(activeProviderId, lead_id.trim(), {
        status,
        notes
      });

      if (result.error) {
        return res.status(result.statusCode).json({ error: result.error });
      }

      return res.status(200).json({
        status: 'success',
        message: 'Lead updated successfully.',
        lead: result.lead
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed. Supported methods: GET, PATCH, OPTIONS.' });
};

module.exports = withSentry(providerLeadsHandler, 'provider_leads');

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

      // 2. Fetch authoritative quota from server store
      const quota = LeadStore.getProviderQuota(providerId);

      // 3. Fetch privacy-safe operational leads
      const leadsRes = LeadStore.getProviderLeads(providerId, {
        limit: isNaN(queryLimit) ? 50 : Math.min(100, Math.max(1, queryLimit)),
        offset: isNaN(queryOffset) ? 0 : Math.max(0, queryOffset),
        status: queryStatus || null
      });

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
        leads: leadsRes.leads,
        pagination: {
          total: leadsRes.total,
          limit: leadsRes.limit,
          offset: leadsRes.offset
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

      // 2. Update lead in authoritative store
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

/**
 * PADIFIX — SERVERLESS API: Artisan Dashboard & Lead Intelligence Gateway
 * GET /api/provider-leads
 * PATCH /api/provider-leads
 *
 * Implements:
 * 1. Strict Supabase Auth JWT Bearer token authentication
 * 2. Multi-tenant isolation (Provider A cannot read or mutate Provider B's leads or deals)
 * 3. Authoritative monthly contact quota and Phase 014 soft-cap reporting
 * 4. Privacy-safe operational lead history (Zero consumer phone numbers or chat bodies)
 * 5. Full Lead Conversion & Job Pipeline CRM (new -> in_discussion -> quote_sent -> scheduled -> completed -> lost)
 * 6. Dual-metric financial tracking (total quote, workmanship, materials, realized earnings) in Kobo
 * 7. Real-time pipeline metrics aggregation (realized revenue, pipeline value, win rate)
 * 8. Sanitized private artisan notes (< 500 chars, plain text, XSS defense)
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

function sanitizeText(val, maxLen = 100) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return null;
  const stripped = val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>/g, '');
  const clean = stripped.replace(/[\r\n\t]+/g, ' ').trim();
  if (!clean) return null;
  return clean.substring(0, maxLen);
}

const providerLeadsHandler = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
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
  const querySince = req.query?.since || urlObj.searchParams.get('since');
  const queryLeadId = req.query?.lead_id || urlObj.searchParams.get('lead_id');

  // GET: Fetch Authoritative Quota, CRM Leads, and Pipeline Financial Metrics
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
          const selectFields = [
            'id',
            'provider_id',
            'channel',
            'locality',
            'status',
            'intent_tag',
            'notes',
            'quote_amount_kobo',
            'workmanship_amount_kobo',
            'materials_amount_kobo',
            'final_amount_kobo',
            'scheduled_for',
            'completed_at',
            'lost_reason',
            'client_display_name',
            'review_token',
            'review_requested_at',
            'created_at',
            'updated_at'
          ].join(',');

          let pgUrl = `${SUPABASE_URL}/rest/v1/contact_events?provider_id=eq.${providerId}&select=${selectFields}&order=created_at.desc&limit=${cleanLimit}&offset=${cleanOffset}`;
          if (queryStatus) {
            pgUrl += `&status=eq.${encodeURIComponent(queryStatus)}`;
          }
          if (querySince) {
            pgUrl += `&created_at=gt.${encodeURIComponent(querySince)}`;
          }
          if (queryLeadId) {
            pgUrl += `&id=eq.${encodeURIComponent(queryLeadId)}`;
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
            if (contentRange) {
              const total = contentRange.split('/')[1];
              if (total && total !== '*') totalCount = parseInt(total, 10);
            } else {
              totalCount = rows.length;
            }
            leads = rows.map(r => ({
              id: r.id,
              provider_id: Number(r.provider_id),
              channel: r.channel,
              locality: r.locality || 'Local Area',
              status: r.status,
              intent_tag: r.intent_tag || 'Artisan Service',
              notes: r.notes || null,
              quote_amount_kobo: r.quote_amount_kobo ? Number(r.quote_amount_kobo) : null,
              workmanship_amount_kobo: r.workmanship_amount_kobo ? Number(r.workmanship_amount_kobo) : null,
              materials_amount_kobo: r.materials_amount_kobo ? Number(r.materials_amount_kobo) : null,
              final_amount_kobo: r.final_amount_kobo ? Number(r.final_amount_kobo) : null,
              scheduled_for: r.scheduled_for || null,
              completed_at: r.completed_at || null,
              lost_reason: r.lost_reason || null,
              client_display_name: r.client_display_name || null,
              review_token: r.review_token || null,
              review_requested_at: r.review_requested_at || null,
              created_at: r.created_at,
              updated_at: r.updated_at || r.created_at,
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

      // Compute Authoritative Pipeline CRM Metrics
      const pipelineMetrics = LeadStore.calculateProviderPipelineMetrics(providerId, leads);

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
        pipeline_metrics: pipelineMetrics,
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

  // PATCH: Update Lead Status, Financial Details, Scheduling, & Notes
  if (req.method === 'PATCH') {
    try {
      const {
        lead_id,
        status,
        notes,
        quote_amount_kobo,
        workmanship_amount_kobo,
        materials_amount_kobo,
        final_amount_kobo,
        scheduled_for,
        completed_at,
        lost_reason,
        client_display_name,
        provider_id
      } = req.body || {};

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

      // Retrieve existing lead for tenant verification and lifecycle validation
      let currentLead = null;
      if (SUPABASE_URL && SUPABASE_ANON_KEY && token) {
        try {
          const pgLeadRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${encodeURIComponent(lead_id.trim())}&select=*`, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`
            }
          });
          if (pgLeadRes.ok) {
            const rows = await pgLeadRes.json();
            if (rows.length > 0) currentLead = rows[0];
          }
        } catch (e) {}
      }
      if (!currentLead) {
        currentLead = LeadStore.getLeadById(lead_id.trim());
      }

      // Strict multi-tenant verification: Provider cannot mutate another provider's lead
      if (currentLead && Number(currentLead.provider_id) !== Number(activeProviderId)) {
        return res.status(403).json({ error: 'Forbidden: You do not have permission to update this lead.' });
      }

      // Validate status if provided
      let normStatus = undefined;
      if (status !== undefined) {
        normStatus = String(status).toLowerCase().trim();
        // Support Phase 027 'contacted' quick action: map 'contacted' -> 'in_discussion'
        if (normStatus === 'contacted') {
          normStatus = 'in_discussion';
        }
        if (!['new', 'in_discussion', 'quote_sent', 'scheduled', 'completed', 'job_won', 'lost'].includes(normStatus)) {
          return res.status(400).json({
            error: `Invalid status: '${status}'. Allowed values: new, contacted, in_discussion, quote_sent, scheduled, completed, job_won, lost.`
          });
        }

        // Enforce Server-Side Legal Lifecycle Transitions
        const LEGAL_TRANSITIONS = {
          new: ['new', 'in_discussion', 'lost'],
          in_discussion: ['in_discussion', 'quote_sent', 'lost'],
          quote_sent: ['quote_sent', 'scheduled', 'lost'],
          scheduled: ['scheduled', 'completed', 'lost'],
          completed: ['completed'],
          job_won: ['job_won', 'completed'],
          lost: ['lost', 'new', 'in_discussion']
        };

        if (currentLead && normStatus !== currentLead.status) {
          const allowedTransitions = LEGAL_TRANSITIONS[currentLead.status] || [];
          if (!allowedTransitions.includes(normStatus)) {
            return res.status(400).json({
              error: `Illegal lifecycle transition: cannot advance from '${currentLead.status}' to '${normStatus}'. Allowed next stages: ${allowedTransitions.join(', ')}.`
            });
          }
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

      // Validate financial amounts (must be non-negative integers if provided)
      const parseAmount = (val, fieldName) => {
        if (val === undefined) return undefined;
        if (val === null || val === '') return null;
        const num = Number(val);
        if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
          throw new Error(`${fieldName} must be a non-negative integer representing Kobo.`);
        }
        return num;
      };

      let cleanQuoteKobo;
      let cleanWorkmanshipKobo;
      let cleanMaterialsKobo;
      let cleanFinalKobo;

      try {
        cleanQuoteKobo = parseAmount(quote_amount_kobo, 'quote_amount_kobo');
        cleanWorkmanshipKobo = parseAmount(workmanship_amount_kobo, 'workmanship_amount_kobo');
        cleanMaterialsKobo = parseAmount(materials_amount_kobo, 'materials_amount_kobo');
        cleanFinalKobo = parseAmount(final_amount_kobo, 'final_amount_kobo');
      } catch (validationErr) {
        return res.status(400).json({ error: validationErr.message });
      }

      // Validate financial split consistency
      const effectiveQuote = cleanQuoteKobo !== undefined ? cleanQuoteKobo : (currentLead?.quote_amount_kobo ? Number(currentLead.quote_amount_kobo) : null);
      const effectiveWorkmanship = cleanWorkmanshipKobo !== undefined ? cleanWorkmanshipKobo : (currentLead?.workmanship_amount_kobo ? Number(currentLead.workmanship_amount_kobo) : null);
      const effectiveMaterials = cleanMaterialsKobo !== undefined ? cleanMaterialsKobo : (currentLead?.materials_amount_kobo ? Number(currentLead.materials_amount_kobo) : null);

      const splitExists = (effectiveWorkmanship !== null && effectiveWorkmanship !== undefined) || (effectiveMaterials !== null && effectiveMaterials !== undefined);
      if (splitExists) {
        if (effectiveQuote === null || effectiveQuote === undefined) {
          return res.status(400).json({ error: 'Inconsistent financial split: workmanship or materials specified without quote_amount_kobo.' });
        }
        const splitSum = (effectiveWorkmanship || 0) + (effectiveMaterials || 0);
        if (splitSum !== effectiveQuote) {
          return res.status(400).json({
            error: `Inconsistent financial split: Workmanship (${effectiveWorkmanship || 0}) + Materials (${effectiveMaterials || 0}) = ${splitSum} kobo, which does not equal Quote (${effectiveQuote} kobo).`
          });
        }
      }

      // Validate timestamps if provided
      let cleanScheduledFor = undefined;
      if (scheduled_for !== undefined) {
        if (scheduled_for === null || scheduled_for === '') {
          cleanScheduledFor = null;
        } else {
          const d = new Date(scheduled_for);
          if (isNaN(d.getTime())) {
            return res.status(400).json({ error: 'scheduled_for must be a valid ISO date string.' });
          }
          cleanScheduledFor = d.toISOString();
        }
      }

      let cleanCompletedAt = undefined;
      if (completed_at !== undefined) {
        if (completed_at === null || completed_at === '') {
          cleanCompletedAt = null;
        } else {
          const d = new Date(completed_at);
          if (isNaN(d.getTime())) {
            return res.status(400).json({ error: 'completed_at must be a valid ISO date string.' });
          }
          cleanCompletedAt = d.toISOString();
        }
      }

      const cleanLostReason = lost_reason !== undefined ? sanitizeText(lost_reason, 250) : undefined;
      const cleanClientName = client_display_name !== undefined ? sanitizeText(client_display_name, 100) : undefined;

      // Prepare updates payload
      const updates = {};
      if (normStatus !== undefined) updates.status = normStatus;
      if (notes !== undefined) {
        updates.notes = (notes === null || notes === '') ? null : String(notes).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<[^>]*>/g, '').trim();
      }
      if (cleanQuoteKobo !== undefined) updates.quote_amount_kobo = cleanQuoteKobo;
      if (cleanWorkmanshipKobo !== undefined) updates.workmanship_amount_kobo = cleanWorkmanshipKobo;
      if (cleanMaterialsKobo !== undefined) updates.materials_amount_kobo = cleanMaterialsKobo;
      if (cleanFinalKobo !== undefined) updates.final_amount_kobo = cleanFinalKobo;
      if (cleanScheduledFor !== undefined) updates.scheduled_for = cleanScheduledFor;
      if (cleanCompletedAt !== undefined) updates.completed_at = cleanCompletedAt;
      if (normStatus === 'completed' && !updates.completed_at) {
        updates.completed_at = new Date().toISOString();
      }
      if (cleanLostReason !== undefined) updates.lost_reason = cleanLostReason;
      if (cleanClientName !== undefined) updates.client_display_name = cleanClientName;
      if (req.body?.review_requested_at !== undefined) updates.review_requested_at = req.body.review_requested_at;
      if (req.body?.review_token !== undefined) updates.review_token = req.body.review_token;

      // Attempt PostgreSQL update on public.contact_events (strictly tenant-scoped)
      let pgUpdated = false;
      let updatedLead = null;

      if (SUPABASE_URL && SUPABASE_ANON_KEY && token) {
        try {
          const patchPayload = { ...updates, updated_at: new Date().toISOString() };

          const pgRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${encodeURIComponent(lead_id.trim())}&provider_id=eq.${activeProviderId}`, {
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
                quote_amount_kobo: r.quote_amount_kobo ? Number(r.quote_amount_kobo) : null,
                workmanship_amount_kobo: r.workmanship_amount_kobo ? Number(r.workmanship_amount_kobo) : null,
                materials_amount_kobo: r.materials_amount_kobo ? Number(r.materials_amount_kobo) : null,
                final_amount_kobo: r.final_amount_kobo ? Number(r.final_amount_kobo) : null,
                scheduled_for: r.scheduled_for || null,
                completed_at: r.completed_at || null,
                lost_reason: r.lost_reason || null,
                client_display_name: r.client_display_name || null,
                review_token: r.review_token || null,
                review_requested_at: r.review_requested_at || null,
                created_at: r.created_at,
                updated_at: r.updated_at
              };
            }
          }
        } catch (e) {}
      }

      // Synchronize in-memory store (for test/offline mode)
      const storeResult = LeadStore.updateLead(activeProviderId, lead_id.trim(), updates);

      if (!pgUpdated && storeResult.error) {
        return res.status(storeResult.statusCode).json({ error: storeResult.error });
      }

      const finalLead = updatedLead || storeResult.lead;
      const updatedMetrics = LeadStore.calculateProviderPipelineMetrics(activeProviderId);

      return res.status(200).json({
        status: 'success',
        message: 'Lead pipeline status and details updated successfully.',
        lead: finalLead,
        pipeline_metrics: updatedMetrics
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }

  // POST: Review Request Dispatch & Quick Operations
  if (req.method === 'POST') {
    try {
      const { action = 'request_review', lead_id, provider_id } = req.body || {};
      if (action === 'request_review') {
        const auth = await verifyProviderAuth(req, provider_id || queryProviderId);
        if (!auth.valid) {
          return res.status(auth.statusCode).json({ error: auth.error });
        }
        const activeProviderId = auth.providerId;
        if (!lead_id) {
          return res.status(400).json({ error: 'Missing required field: lead_id.' });
        }

        const rawAuth = req.headers['authorization'] || req.headers['Authorization'] || '';
        const token = rawAuth.replace(/^Bearer\s+/i, '').trim();

        const recRes = LeadStore.recordReviewRequested(activeProviderId, String(lead_id).trim());
        if (recRes.error) {
          return res.status(recRes.statusCode || 400).json({ error: recRes.error });
        }

        if (SUPABASE_URL && SUPABASE_ANON_KEY && token) {
          try {
            await fetch(`${SUPABASE_URL}/rest/v1/contact_events?id=eq.${encodeURIComponent(String(lead_id).trim())}&provider_id=eq.${activeProviderId}`, {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                review_token: recRes.review_token,
                review_requested_at: recRes.review_requested_at,
                updated_at: new Date().toISOString()
              })
            });
          } catch (e) {}
        }

        let origin = 'https://padifix.ng';
        if (req.headers && (req.headers['origin'] || req.headers['referer'])) {
          try {
            const parsed = new URL(req.headers['origin'] || req.headers['referer']);
            origin = parsed.origin;
          } catch (e) {}
        }
        const reviewUrl = `${origin}/review.html?token=${recRes.review_token}`;

        return res.status(200).json({
          status: 'success',
          lead_id: String(lead_id).trim(),
          review_token: recRes.review_token,
          review_url: reviewUrl,
          review_requested_at: recRes.review_requested_at
        });
      }
      return res.status(400).json({ error: `Unknown action: '${action}'.` });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed. Supported methods: GET, PATCH, POST, OPTIONS.' });
};

module.exports = withSentry(providerLeadsHandler, 'provider_leads');

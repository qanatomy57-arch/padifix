/**
 * PADIFIX — LEAD & CONTACT EVENT DATA STORE (lib/lead-store.js)
 * Privacy-First Operational Lead Intelligence & Pipeline CRM Store
 *
 * Invariants:
 * - Never stores or returns customer phone numbers or raw message bodies.
 * - Canonical pipeline statuses: 'new', 'in_discussion', 'quote_sent', 'scheduled', 'completed', 'job_won', 'lost'.
 * - Financial amounts tracked in Kobo (1 Naira = 100 Kobo).
 * - Private notes: max 500 chars, plain text, XSS-neutralized.
 * - Strict multi-tenant isolation.
 */

const crypto = require('crypto');

// Canonical plan definitions matching api/paystack-init and contact-meter
const CANONICAL_PLANS = {
  FREE: { id: 'FREE', name: 'Free Starter', allowance: 5, fairUse: 5 },
  BASIC: { id: 'BASIC', name: 'Basic', allowance: 30, fairUse: 30 },
  PRO: { id: 'PRO', name: 'Pro', allowance: 100, fairUse: 100 },
  PREMIUM: { id: 'PREMIUM', name: 'Premium', allowance: 500, fairUse: 500 }
};

const ALLOWED_STATUSES = new Set([
  'new',
  'in_discussion',
  'quote_sent',
  'scheduled',
  'completed',
  'job_won',
  'lost'
]);

// In-memory lead store: Map<lead_id, LeadRecord>
const leadRecords = new Map();

// Provider to Lead IDs index: Map<provider_id, Set<lead_id>>
const providerLeadsIndex = new Map();

// In-memory provider usage store: Map<`${provider_id}_${billing_period}`, UsageRecord>
const providerUsageMap = new Map();

function getLagosBillingPeriod(date = new Date()) {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit'
  });
  return formatter.format(d).substring(0, 7); // 'YYYY-MM'
}

function stripTagsAndScripts(val) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>/g, '');
}

function sanitizeText(val, maxLen = 100) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return null;
  const stripped = stripTagsAndScripts(val);
  const clean = stripped.replace(/[\r\n\t]+/g, ' ').trim();
  if (!clean) return null;
  return clean.substring(0, maxLen);
}

function sanitizeNotes(val) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return null;
  const stripped = stripTagsAndScripts(val);
  const clean = stripped.trim();
  return clean;
}

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

// Seed Initial Realistic Operational Leads for standard demo/test providers (e.g. Provider 101, Provider 8)
function seedInitialLeads() {
  if (leadRecords.size > 0) return;

  const now = Date.now();
  const initialSeeds = [
    // Provider 101 Leads (Full CRM Pipeline representation)
    {
      id: 'lead_seed_101_01',
      provider_id: 101,
      channel: 'whatsapp',
      locality: 'Ikeja, Lagos',
      status: 'new',
      intent_tag: 'Electrical Wiring Inspection',
      notes: null,
      quote_amount_kobo: null,
      workmanship_amount_kobo: null,
      materials_amount_kobo: null,
      final_amount_kobo: null,
      scheduled_for: null,
      completed_at: null,
      lost_reason: null,
      client_display_name: null,
      created_at: new Date(now - 15 * 60 * 1000).toISOString()
    },
    {
      id: 'lead_seed_101_02',
      provider_id: 101,
      channel: 'whatsapp',
      locality: 'Surulere, Lagos',
      status: 'in_discussion',
      intent_tag: 'Inverter & Solar Installation',
      notes: 'Customer requested 5kVA solar quote',
      quote_amount_kobo: null,
      workmanship_amount_kobo: null,
      materials_amount_kobo: null,
      final_amount_kobo: null,
      scheduled_for: null,
      completed_at: null,
      lost_reason: null,
      client_display_name: 'Alhaji Musa',
      created_at: new Date(now - 2 * 3600 * 1000).toISOString()
    },
    {
      id: 'lead_seed_101_03',
      provider_id: 101,
      channel: 'call',
      locality: 'Yaba, Lagos',
      status: 'quote_sent',
      intent_tag: 'Distribution Board Repair',
      notes: 'Sent formal quotation for materials and labor',
      quote_amount_kobo: 8500000, // ₦85,000
      workmanship_amount_kobo: 3500000, // ₦35,000
      materials_amount_kobo: 5000000, // ₦50,000
      final_amount_kobo: null,
      scheduled_for: null,
      completed_at: null,
      lost_reason: null,
      client_display_name: 'Dr. Johnson',
      created_at: new Date(now - 24 * 3600 * 1000).toISOString()
    },
    {
      id: 'lead_seed_101_04',
      provider_id: 101,
      channel: 'whatsapp',
      locality: 'Lekki Phase 1, Lagos',
      status: 'scheduled',
      intent_tag: 'Pre-paid Meter Wiring & Earthing',
      notes: 'Site visit scheduled for Saturday 10:00 AM',
      quote_amount_kobo: 12000000, // ₦120,000
      workmanship_amount_kobo: 6000000,
      materials_amount_kobo: 6000000,
      final_amount_kobo: null,
      scheduled_for: new Date(now + 24 * 3600 * 1000).toISOString(),
      completed_at: null,
      lost_reason: null,
      client_display_name: 'Madam Folake',
      created_at: new Date(now - 48 * 3600 * 1000).toISOString()
    },
    {
      id: 'lead_seed_101_05',
      provider_id: 101,
      channel: 'whatsapp',
      locality: 'Victoria Island, Lagos',
      status: 'completed',
      intent_tag: 'AC Inverter Troubleshooting',
      notes: 'Completed in 2 hours. Customer very satisfied.',
      quote_amount_kobo: 4500000,
      workmanship_amount_kobo: 3000000,
      materials_amount_kobo: 1500000,
      final_amount_kobo: 4500000, // ₦45,000 realized
      scheduled_for: new Date(now - 72 * 3600 * 1000).toISOString(),
      completed_at: new Date(now - 70 * 3600 * 1000).toISOString(),
      lost_reason: null,
      client_display_name: 'Engr. Emeka',
      created_at: new Date(now - 75 * 3600 * 1000).toISOString()
    },
    // Provider 8 Leads
    {
      id: 'lead_seed_8_01',
      provider_id: 8,
      channel: 'whatsapp',
      locality: 'Victoria Island, Lagos',
      status: 'new',
      intent_tag: 'Emergency Plumbing Repair',
      notes: null,
      quote_amount_kobo: null,
      workmanship_amount_kobo: null,
      materials_amount_kobo: null,
      final_amount_kobo: null,
      scheduled_for: null,
      completed_at: null,
      lost_reason: null,
      client_display_name: null,
      created_at: new Date(now - 30 * 60 * 1000).toISOString()
    },
    {
      id: 'lead_seed_8_02',
      provider_id: 8,
      channel: 'call',
      locality: 'Ikoyi, Lagos',
      status: 'completed',
      intent_tag: 'Water Heater Installation',
      notes: 'Installed Ariston 50L heater',
      quote_amount_kobo: 5500000,
      workmanship_amount_kobo: 2500000,
      materials_amount_kobo: 3000000,
      final_amount_kobo: 5500000, // ₦55,000
      scheduled_for: new Date(now - 48 * 3600 * 1000).toISOString(),
      completed_at: new Date(now - 46 * 3600 * 1000).toISOString(),
      lost_reason: null,
      client_display_name: 'Chief Adeleke',
      created_at: new Date(now - 50 * 3600 * 1000).toISOString()
    }
  ];

  initialSeeds.forEach(lead => {
    leadRecords.set(lead.id, lead);
    if (!providerLeadsIndex.has(lead.provider_id)) {
      providerLeadsIndex.set(lead.provider_id, new Set());
    }
    providerLeadsIndex.get(lead.provider_id).add(lead.id);
  });
}

seedInitialLeads();

const LeadStore = {
  CANONICAL_PLANS,
  ALLOWED_STATUSES,

  /**
   * Log an operational contact event / lead from consumer contact initiation
   */
  logContactLead({ provider_id, channel, locality, intent_tag, idempotency_key, billing_period, session_token }) {
    const provId = Number(provider_id);
    const normChannel = String(channel || 'whatsapp').toLowerCase().trim();
    const period = billing_period || getLagosBillingPeriod();
    const cleanLocality = sanitizeText(locality, 80);
    const cleanIntent = sanitizeText(intent_tag, 80);

    const leadId = `lead_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const lead = {
      id: leadId,
      provider_id: provId,
      channel: normChannel,
      locality: cleanLocality,
      status: 'new',
      intent_tag: cleanIntent,
      notes: null,
      quote_amount_kobo: null,
      workmanship_amount_kobo: null,
      materials_amount_kobo: null,
      final_amount_kobo: null,
      scheduled_for: null,
      completed_at: null,
      lost_reason: null,
      client_display_name: null,
      idempotency_key: idempotency_key || null,
      billing_period: period,
      session_token: session_token || null,
      created_at: new Date().toISOString()
    };

    leadRecords.set(leadId, lead);
    if (!providerLeadsIndex.has(provId)) {
      providerLeadsIndex.set(provId, new Set());
    }
    providerLeadsIndex.get(provId).add(leadId);

    return lead;
  },

  /**
   * Fetch paginated operational leads for a verified provider
   */
  getProviderLeads(providerId, { limit = 50, offset = 0, status = null } = {}) {
    const provId = Number(providerId);
    const leadIds = providerLeadsIndex.get(provId);
    if (!leadIds || leadIds.size === 0) {
      return { leads: [], total: 0, limit, offset };
    }

    let allLeads = [];
    leadIds.forEach(id => {
      const rec = leadRecords.get(id);
      if (rec) {
        if (!status || rec.status === status) {
          allLeads.push({
            id: rec.id,
            provider_id: rec.provider_id,
            channel: rec.channel,
            locality: rec.locality || 'Local Area',
            status: rec.status,
            intent_tag: rec.intent_tag || 'Artisan Service',
            notes: rec.notes || null,
            quote_amount_kobo: rec.quote_amount_kobo || null,
            workmanship_amount_kobo: rec.workmanship_amount_kobo || null,
            materials_amount_kobo: rec.materials_amount_kobo || null,
            final_amount_kobo: rec.final_amount_kobo || null,
            scheduled_for: rec.scheduled_for || null,
            completed_at: rec.completed_at || null,
            lost_reason: rec.lost_reason || null,
            client_display_name: rec.client_display_name || null,
            created_at: rec.created_at,
            updated_at: rec.updated_at || rec.created_at,
            relative_time: formatRelativeTime(rec.created_at)
          });
        }
      }
    });

    // Sort newest first
    allLeads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = allLeads.length;
    const paginated = allLeads.slice(offset, offset + limit);

    return {
      leads: paginated,
      total,
      limit,
      offset
    };
  },

  /**
   * Atomically update a lead's status, private notes, and financial pipeline details
   */
  updateLead(providerId, leadId, updates = {}) {
    const provId = Number(providerId);
    const lead = leadRecords.get(leadId);

    if (!lead) {
      return { error: 'Lead not found.', statusCode: 404 };
    }

    // Strict multi-tenant isolation: cannot modify another provider's lead
    if (lead.provider_id !== provId) {
      return { error: 'Forbidden: You do not have permission to update this lead.', statusCode: 403 };
    }

    const {
      status,
      notes,
      quote_amount_kobo,
      workmanship_amount_kobo,
      materials_amount_kobo,
      final_amount_kobo,
      scheduled_for,
      completed_at,
      lost_reason,
      client_display_name
    } = updates;

    // Legal transition matrix
    const LEGAL_TRANSITIONS = {
      new: ['new', 'in_discussion', 'lost'],
      in_discussion: ['in_discussion', 'quote_sent', 'lost'],
      quote_sent: ['quote_sent', 'scheduled', 'lost'],
      scheduled: ['scheduled', 'completed', 'lost'],
      completed: ['completed'],
      job_won: ['job_won', 'completed'],
      lost: ['lost', 'new', 'in_discussion']
    };

    // Validate status if provided
    if (status !== undefined) {
      let normStatus = String(status).toLowerCase().trim();
      if (normStatus === 'contacted') normStatus = 'in_discussion';
      if (!ALLOWED_STATUSES.has(normStatus)) {
        return {
          error: `Invalid status: '${status}'. Allowed values: ${Array.from(ALLOWED_STATUSES).join(', ')}.`,
          statusCode: 400
        };
      }

      // Check legal transition from current status
      if (normStatus !== lead.status) {
        const allowedNext = LEGAL_TRANSITIONS[lead.status] || [];
        if (!allowedNext.includes(normStatus)) {
          return {
            error: `Illegal lifecycle transition: cannot advance from '${lead.status}' to '${normStatus}'. Allowed transitions: ${allowedNext.join(', ')}.`,
            statusCode: 400
          };
        }
      }
      lead.status = normStatus;
    }

    // Validate notes if provided
    if (notes !== undefined) {
      if (notes === null || notes === '') {
        lead.notes = null;
      } else {
        if (typeof notes !== 'string') {
          return { error: 'Notes must be a string.', statusCode: 400 };
        }
        if (notes.length > 500) {
          return { error: `Notes cannot exceed 500 characters (received ${notes.length}).`, statusCode: 400 };
        }
        lead.notes = sanitizeNotes(notes);
      }
    }

    // Validate and parse financial parameters
    let nextQuote = lead.quote_amount_kobo;
    let nextWorkmanship = lead.workmanship_amount_kobo;
    let nextMaterials = lead.materials_amount_kobo;

    if (quote_amount_kobo !== undefined) {
      if (quote_amount_kobo === null) {
        nextQuote = null;
      } else {
        const val = Number(quote_amount_kobo);
        if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
          return { error: 'quote_amount_kobo must be a non-negative integer.', statusCode: 400 };
        }
        nextQuote = val;
      }
    }

    if (workmanship_amount_kobo !== undefined) {
      if (workmanship_amount_kobo === null) {
        nextWorkmanship = null;
      } else {
        const val = Number(workmanship_amount_kobo);
        if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
          return { error: 'workmanship_amount_kobo must be a non-negative integer.', statusCode: 400 };
        }
        nextWorkmanship = val;
      }
    }

    if (materials_amount_kobo !== undefined) {
      if (materials_amount_kobo === null) {
        nextMaterials = null;
      } else {
        const val = Number(materials_amount_kobo);
        if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
          return { error: 'materials_amount_kobo must be a non-negative integer.', statusCode: 400 };
        }
        nextMaterials = val;
      }
    }

    // Financial split rule: if a split exists, workmanship + materials must equal quote
    const splitExists = (nextWorkmanship !== null && nextWorkmanship !== undefined) || (nextMaterials !== null && nextMaterials !== undefined);
    if (splitExists) {
      if (nextQuote === null || nextQuote === undefined) {
        return { error: 'Inconsistent financial split: workmanship or materials specified without a quote amount.', statusCode: 400 };
      }
      const splitSum = (nextWorkmanship || 0) + (nextMaterials || 0);
      if (splitSum !== nextQuote) {
        return {
          error: `Inconsistent financial split: Workmanship (${nextWorkmanship || 0}) + Materials (${nextMaterials || 0}) = ${splitSum} kobo, which does not equal Quote (${nextQuote} kobo).`,
          statusCode: 400
        };
      }
    }

    lead.quote_amount_kobo = nextQuote;
    lead.workmanship_amount_kobo = nextWorkmanship;
    lead.materials_amount_kobo = nextMaterials;

    if (final_amount_kobo !== undefined) {
      if (final_amount_kobo === null) {
        lead.final_amount_kobo = null;
      } else {
        const val = Number(final_amount_kobo);
        if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
          return { error: 'final_amount_kobo must be a non-negative integer.', statusCode: 400 };
        }
        lead.final_amount_kobo = val;
      }
    }

    // Schedule / Completion Timestamps
    if (scheduled_for !== undefined) {
      if (scheduled_for === null || scheduled_for === '') {
        lead.scheduled_for = null;
      } else {
        const d = new Date(scheduled_for);
        if (isNaN(d.getTime())) {
          return { error: 'scheduled_for must be a valid ISO timestamp.', statusCode: 400 };
        }
        lead.scheduled_for = d.toISOString();
      }
    }

    if (completed_at !== undefined) {
      if (completed_at === null || completed_at === '') {
        lead.completed_at = null;
      } else {
        const d = new Date(completed_at);
        if (isNaN(d.getTime())) {
          return { error: 'completed_at must be a valid ISO timestamp.', statusCode: 400 };
        }
        lead.completed_at = d.toISOString();
      }
    }

    if (lost_reason !== undefined) {
      lead.lost_reason = sanitizeText(lost_reason, 250);
    }

    if (client_display_name !== undefined) {
      lead.client_display_name = sanitizeText(client_display_name, 100);
    }

    lead.updated_at = new Date().toISOString();

    return {
      status: 'success',
      lead: {
        id: lead.id,
        provider_id: lead.provider_id,
        channel: lead.channel,
        locality: lead.locality || 'Local Area',
        status: lead.status,
        intent_tag: lead.intent_tag || 'Artisan Service',
        notes: lead.notes,
        quote_amount_kobo: lead.quote_amount_kobo,
        workmanship_amount_kobo: lead.workmanship_amount_kobo,
        materials_amount_kobo: lead.materials_amount_kobo,
        final_amount_kobo: lead.final_amount_kobo,
        scheduled_for: lead.scheduled_for,
        completed_at: lead.completed_at,
        lost_reason: lead.lost_reason,
        client_display_name: lead.client_display_name,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
        relative_time: formatRelativeTime(lead.created_at)
      }
    };
  },

  /**
   * Compute comprehensive financial and pipeline conversion metrics for a provider
   */
  calculateProviderPipelineMetrics(providerId, leadsList = null) {
    const provId = Number(providerId);
    let leads = leadsList;
    if (!leads) {
      const leadIds = providerLeadsIndex.get(provId);
      leads = [];
      if (leadIds) {
        leadIds.forEach(id => {
          const l = leadRecords.get(id);
          if (l) leads.push(l);
        });
      }
    }

    let totalLeads = leads.length;
    let newLeads = 0;
    let inDiscussion = 0;
    let quoteSent = 0;
    let scheduled = 0;
    let wonCompleted = 0;
    let lost = 0;

    let pipelineValueKobo = 0; // Active quotes & scheduled jobs
    let realizedRevenueKobo = 0; // Completed & job_won

    leads.forEach(l => {
      const st = l.status;
      if (st === 'new') newLeads++;
      else if (st === 'in_discussion') inDiscussion++;
      else if (st === 'quote_sent') {
        quoteSent++;
        if (l.quote_amount_kobo) pipelineValueKobo += Number(l.quote_amount_kobo);
      } else if (st === 'scheduled') {
        scheduled++;
        if (l.quote_amount_kobo) pipelineValueKobo += Number(l.quote_amount_kobo);
      } else if (st === 'completed' || st === 'job_won') {
        wonCompleted++;
        const amount = l.final_amount_kobo || l.quote_amount_kobo || 0;
        realizedRevenueKobo += Number(amount);
      } else if (st === 'lost') {
        lost++;
      }
    });

    const activeDeals = newLeads + inDiscussion + quoteSent + scheduled;
    const resolvedOutcomes = wonCompleted + lost;
    const winRatePct = resolvedOutcomes > 0 ? Math.round((wonCompleted / resolvedOutcomes) * 100) : 0;
    const avgDealKobo = wonCompleted > 0 ? Math.round(realizedRevenueKobo / wonCompleted) : 0;

    return {
      total_leads: totalLeads,
      active_deals: activeDeals,
      stage_counts: {
        new: newLeads,
        in_discussion: inDiscussion,
        quote_sent: quoteSent,
        scheduled: scheduled,
        completed: wonCompleted,
        lost: lost
      },
      pipeline_value_kobo: pipelineValueKobo,
      pipeline_value_ngn: Math.round(pipelineValueKobo / 100),
      realized_revenue_kobo: realizedRevenueKobo,
      realized_revenue_ngn: Math.round(realizedRevenueKobo / 100),
      avg_deal_kobo: avgDealKobo,
      avg_deal_ngn: Math.round(avgDealKobo / 100),
      win_rate_percentage: winRatePct
    };
  },

  /**
   * Get authoritative provider quota and monthly usage
   */
  getProviderQuota(providerId, planId = null) {
    const provId = Number(providerId);
    const period = getLagosBillingPeriod();
    const key = `${provId}_${period}`;

    let record = providerUsageMap.get(key);
    if (!record) {
      // Calculate from existing leads this period or default 0
      const leadIds = providerLeadsIndex.get(provId);
      let waCount = 0;
      let callCount = 0;
      if (leadIds) {
        leadIds.forEach(id => {
          const l = leadRecords.get(id);
          if (l && l.billing_period === period) {
            if (l.channel === 'whatsapp') waCount++;
            else callCount++;
          }
        });
      }
      const initialPlan = String(planId || 'FREE').toUpperCase();
      record = {
        used: waCount + callCount,
        whatsapp: waCount,
        call: callCount,
        plan_id: initialPlan
      };
      providerUsageMap.set(key, record);
    } else if (planId && planId !== record.plan_id) {
      record.plan_id = String(planId).toUpperCase();
    }

    const plan = CANONICAL_PLANS[record.plan_id] || CANONICAL_PLANS.FREE;
    const allowance = plan.allowance;
    const isSoftCap = record.used > allowance;
    const remaining = Math.max(0, allowance - record.used);
    const usagePct = allowance > 0 ? Math.round((record.used / allowance) * 100) : 0;

    return {
      provider_id: provId,
      billing_period: period,
      plan_id: plan.id,
      plan_name: plan.name,
      allowance: allowance,
      contacts_used: record.used,
      whatsapp_contacts: record.whatsapp,
      phone_contacts: record.call,
      contacts_remaining: remaining,
      soft_cap: isSoftCap,
      limit_reached: record.used >= allowance,
      usage_percentage: usagePct
    };
  },

  /**
   * Atomically record usage increment
   */
  incrementUsage(providerId, channel, planId = null) {
    const provId = Number(providerId);
    const period = getLagosBillingPeriod();
    const key = `${provId}_${period}`;
    const normChannel = String(channel).toLowerCase().trim();

    let record = providerUsageMap.get(key);
    if (!record) {
      const initialPlan = String(planId || 'FREE').toUpperCase();
      record = { used: 0, whatsapp: 0, call: 0, plan_id: initialPlan };
      providerUsageMap.set(key, record);
    } else if (planId) {
      record.plan_id = String(planId).toUpperCase();
    }

    record.used += 1;
    if (normChannel === 'whatsapp') {
      record.whatsapp += 1;
    } else {
      record.call += 1;
    }

    return this.getProviderQuota(provId, record.plan_id);
  },

  /**
   * Test-only helper: reset usage in non-production
   */
  resetUsageForTest(providerId, planId = 'FREE', used = 0) {
    const provId = Number(providerId);
    const period = getLagosBillingPeriod();
    const key = `${provId}_${period}`;
    const cleanPlan = String(planId).toUpperCase();
    providerUsageMap.set(key, {
      used: Number(used),
      whatsapp: Math.floor(Number(used) / 2),
      call: Math.ceil(Number(used) / 2),
      plan_id: cleanPlan
    });
  },

  getLeadById(id) {
    return leadRecords.get(id);
  },

  clearStore() {
    leadRecords.clear();
    providerLeadsIndex.clear();
  },

  usageStore: providerUsageMap
};

module.exports = LeadStore;

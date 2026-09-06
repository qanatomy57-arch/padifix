/**
 * PADIFIX — LEAD & CONTACT EVENT DATA STORE (lib/lead-store.js)
 * Privacy-First Operational Lead Intelligence Store
 *
 * Invariants:
 * - Never stores or returns customer phone numbers or raw message bodies.
 * - Allowed fields: id, provider_id, channel, locality, status, intent_tag, notes, created_at.
 * - Status vocabulary: 'new', 'in_discussion', 'quote_sent', 'job_won'.
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

const ALLOWED_STATUSES = new Set(['new', 'in_discussion', 'quote_sent', 'job_won']);

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

  const initialSeeds = [
    {
      id: 'lead_seed_101_01',
      provider_id: 101,
      channel: 'whatsapp',
      locality: 'Ikeja, Lagos',
      status: 'new',
      intent_tag: 'Electrical Wiring Inspection',
      notes: null,
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
    },
    {
      id: 'lead_seed_101_02',
      provider_id: 101,
      channel: 'whatsapp',
      locality: 'Surulere, Lagos',
      status: 'in_discussion',
      intent_tag: 'Inverter & Solar Installation',
      notes: 'Customer requested 5kVA solar quote',
      created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    },
    {
      id: 'lead_seed_101_03',
      provider_id: 101,
      channel: 'call',
      locality: 'Yaba, Lagos',
      status: 'quote_sent',
      intent_tag: 'Distribution Board Repair',
      notes: 'Sent formal quotation for materials and labor',
      created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    },
    {
      id: 'lead_seed_8_01',
      provider_id: 8,
      channel: 'whatsapp',
      locality: 'Victoria Island, Lagos',
      status: 'new',
      intent_tag: 'Emergency Plumbing Repair',
      notes: null,
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString()
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
            created_at: rec.created_at,
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
   * Atomically update a lead's status and/or private notes
   */
  updateLead(providerId, leadId, { status, notes }) {
    const provId = Number(providerId);
    const lead = leadRecords.get(leadId);

    if (!lead) {
      return { error: 'Lead not found.', statusCode: 404 };
    }

    // Strict multi-tenant isolation: cannot modify another provider's lead
    if (lead.provider_id !== provId) {
      return { error: 'Forbidden: You do not have permission to update this lead.', statusCode: 403 };
    }

    // Validate status if provided
    if (status !== undefined) {
      const normStatus = String(status).toLowerCase().trim();
      if (!ALLOWED_STATUSES.has(normStatus)) {
        return {
          error: `Invalid status: '${status}'. Allowed values: ${Array.from(ALLOWED_STATUSES).join(', ')}.`,
          statusCode: 400
        };
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
        created_at: lead.created_at,
        relative_time: formatRelativeTime(lead.created_at)
      }
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

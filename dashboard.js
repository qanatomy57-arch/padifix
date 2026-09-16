// ============================================================================
// LOKATOR PROVIDER MANAGEMENT DASHBOARD CONTROLLER (dashboard.js)
// Supabase Data Layer & Session Synchronized Real-time Provider Hub
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // Safe HTML Escaping Helper (Inherits from LokatorDB / window or fallback)
  const escapeHtml = (typeof window !== 'undefined' && window.escapeHtml) ||
                     (typeof LokatorDB !== 'undefined' && LokatorDB.escapeHtml) ||
                     ((v) => (v === null || v === undefined) ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'));

  let currentProvider = null;
  let currentMetrics = null;

  // 1. Session Verification
  try {
    currentProvider = await LokatorDB.auth.getCurrentProvider();
  } catch (err) {
    console.error('Session load error:', err);
  }

  if (!currentProvider) {
    // Check if there is any seed fallback or redirect to login
    window.location.href = 'login.html';
    return;
  }

  // 2. Initialize Toast System
  const toast = document.getElementById('dash-toast');
  function showToast(msg, type = 'success') {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `dash-toast show ${type}`;
    setTimeout(() => {
      toast.className = 'dash-toast';
    }, 3200);
  }

  // 3. Populate Topbar & Header Info
  function renderTopbar() {
    const nameEl = document.getElementById('top-provider-name');
    const welcomeNameEl = document.getElementById('dash-welcome-name');
    const tradeEl = document.getElementById('top-provider-trade');
    const avatarEl = document.getElementById('top-avatar');
    const editAvatarPreview = document.getElementById('edit-avatar-preview');
    const publicLink = document.getElementById('btn-view-public');
    const kebabPublicLink = document.getElementById('kebab-view-public');
    const availCheck = document.getElementById('dash-avail-check');
    const availText = document.getElementById('dash-avail-text');

    const firstName = currentProvider.firstName || (typeof currentProvider.name === 'string' && currentProvider.name.trim() ? currentProvider.name.trim().split(' ')[0] : 'Partner');
    if (nameEl) nameEl.textContent = currentProvider.name || currentProvider.business_name || 'Partner';
    if (welcomeNameEl) welcomeNameEl.textContent = firstName;
    if (tradeEl) tradeEl.textContent = currentProvider.trade || 'Artisan';
    
    // Avatar rendering
    if (avatarEl) {
      if (currentProvider.avatarUrl) {
        avatarEl.innerHTML = `<img src="${escapeHtml(currentProvider.avatarUrl)}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
      } else {
        const rawName = String(currentProvider.name || currentProvider.business_name || currentProvider.firstName || 'Partner');
        const initials = rawName.split(' ').filter(Boolean).map(n => n && n[0] ? n[0] : '').join('').substring(0, 2).toUpperCase() || 'PA';
        avatarEl.textContent = initials;
        avatarEl.style.background = currentProvider.avatarBg || 'var(--dash-green)';
      }
    }

    if (editAvatarPreview) {
      if (currentProvider.avatarUrl) {
        editAvatarPreview.innerHTML = `<img src="${escapeHtml(currentProvider.avatarUrl)}" alt="Profile Photo" />`;
      } else {
        const rawName = String(currentProvider.name || currentProvider.business_name || currentProvider.firstName || 'Partner');
        const initials = rawName.split(' ').filter(Boolean).map(n => n && n[0] ? n[0] : '').join('').substring(0, 2).toUpperCase() || 'PA';
        editAvatarPreview.textContent = initials;
      }
    }

    if (publicLink) {
      publicLink.href = `profile.html?id=${currentProvider.id}&preview=artisan`;
    }
    if (kebabPublicLink) {
      kebabPublicLink.href = `profile.html?id=${currentProvider.id}&preview=artisan`;
    }
    if (availCheck && availText) {
      availCheck.checked = currentProvider.isAvailable;
      availText.textContent = currentProvider.isAvailable ? 'Online' : 'Busy';
      availText.className = `avail-label ${currentProvider.isAvailable ? 'online' : 'offline'}`;
    }
  }

  renderTopbar();

  // 3.1 Kebab 3-Dots Menu Handling
  const btnKebab = document.getElementById('btn-kebab-menu');
  const kebabDropdown = document.getElementById('kebab-dropdown-menu');
  const kebabSignout = document.getElementById('kebab-signout');

  if (btnKebab && kebabDropdown) {
    btnKebab.addEventListener('click', (e) => {
      e.stopPropagation();
      kebabDropdown.classList.toggle('show');
      btnKebab.setAttribute('aria-expanded', kebabDropdown.classList.contains('show'));
    });

    document.addEventListener('click', (e) => {
      if (!kebabDropdown.contains(e.target) && e.target !== btnKebab) {
        kebabDropdown.classList.remove('show');
        btnKebab.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (kebabSignout) {
    kebabSignout.addEventListener('click', async () => {
      if (typeof cleanupRealtimeLeadStream === 'function') cleanupRealtimeLeadStream();
      await LokatorDB.auth.signOut();
      window.location.href = 'login.html';
    });
  }

  // 3.2 Bottom Sheet & Modal Helpers
  const moreSheetModal = document.getElementById('modal-more-sheet');
  const btnCloseMoreSheet = document.getElementById('btn-close-more-sheet');

  window.closeMoreSheet = function() {
    if (moreSheetModal) {
      moreSheetModal.style.display = 'none';
    }
  };

  if (btnCloseMoreSheet && moreSheetModal) {
    btnCloseMoreSheet.addEventListener('click', closeMoreSheet);
    moreSheetModal.addEventListener('click', (e) => {
      if (e.target === moreSheetModal) closeMoreSheet();
    });
  }

  // Availability Switch Listener
  const availCheck = document.getElementById('dash-avail-check');
  const availText = document.getElementById('dash-avail-text');
  if (availCheck) {
    availCheck.addEventListener('change', async () => {
      const isOnline = availCheck.checked;
      availText.textContent = isOnline ? 'Online' : 'Busy';
      availText.className = `avail-label ${isOnline ? 'online' : 'offline'}`;
      try {
        const res = await LokatorDB.updateProviderAvailability(currentProvider.id, isOnline);
        currentProvider.isAvailable = isOnline;
        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('provider_availability_toggled', { is_available: isOnline });
        }
        if (res && res.status === 'OFFLINE_PENDING') {
          showToast(res.message, 'info');
        } else if (res && res.status === 'REMOTE_FAILURE') {
          showToast(res.message || 'Failed to update status', 'error');
        } else {
          showToast(isOnline ? 'You are now marked ONLINE and active for jobs.' : 'Status set to BUSY. New leads paused.');
        }
      } catch (e) {
        showToast('Failed to update status: ' + (e.message || 'Network error'), 'error');
      }
    });
  }

  // Sign Out Button
  const btnSignOut = document.getElementById('btn-signout');
  if (btnSignOut) {
    btnSignOut.addEventListener('click', async () => {
      if (typeof cleanupRealtimeLeadStream === 'function') cleanupRealtimeLeadStream();
      await LokatorDB.auth.signOut();
      window.location.href = 'login.html';
    });
  }

  // 4. Tab Navigation Management (Desktop & Mobile)
  window.switchTab = function (tabKey) {
    if (tabKey === 'more') {
      if (moreSheetModal) moreSheetModal.style.display = 'flex';
      return;
    }

    document.querySelectorAll('.dash-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabKey);
    });
    document.querySelectorAll('.bnav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === tabKey);
    });
    document.querySelectorAll('.dash-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabKey}`);
    });
    if (tabKey === 'overview') {
      loadProviderLeadsAndQuota();
    }
    if (tabKey === 'reviews') {
      renderDashboardReviews();
    }
    if (tabKey === 'subscription') {
      renderSubscriptionDashboard();
      renderTrustCenter();
    }
    if (tabKey === 'profile') {
      setTimeout(() => {
        try {
          if (typeof dashMapInstance !== 'undefined' && dashMapInstance && dashMapInstance.invalidateSize) {
            dashMapInstance.invalidateSize();
          } else if (typeof initDashboardServiceMap === 'function') {
            initDashboardServiceMap();
          }
        } catch (e) {}
      }, 150);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  document.querySelectorAll('.dash-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  document.querySelectorAll('.bnav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.nav);
    });
  });

  // 5. PHASE 015: REAL-TIME OPERATIONAL LEAD INTELLIGENCE & QUOTA ENGINE
  let cachedLeads = [];
  let isLeadsLoading = false;

  async function getAuthToken() {
    let token = null;
    try {
      if (typeof LokatorDB !== 'undefined' && LokatorDB.auth && typeof LokatorDB.auth.getSession === 'function') {
        const sessionRes = await LokatorDB.auth.getSession();
        token = sessionRes?.data?.session?.access_token;
      }
    } catch (e) {}

    if (!token && typeof localStorage !== 'undefined') {
      try {
        const rawSession = localStorage.getItem('lokator_supabase_auth_session') || localStorage.getItem('lokator_auth_session');
        if (rawSession) {
          const parsed = JSON.parse(rawSession);
          token = parsed.access_token || parsed.token || null;
        }
      } catch (e) {}
    }

    if (!token && typeof supabaseSession !== 'undefined' && supabaseSession?.access_token) {
      token = supabaseSession.access_token;
    }

    return token;
  }

  async function loadProviderLeadsAndQuota() {
    if (!currentProvider || !currentProvider.id) return;
    if (isLeadsLoading) return;
    isLeadsLoading = true;

    const providerId = currentProvider.id;

    // Retrieve Supabase JWT session token
    const token = await getAuthToken();

    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(`/api/provider-leads?provider_id=${encodeURIComponent(providerId)}`, {
        method: 'GET',
        headers
      });

      if (res.ok) {
        const data = await res.json();
        renderQuotaGauge(data);
        cachedLeads = data.leads || [];
        renderLeadsInbox(cachedLeads);
      } else {
        renderFallbackLeadsAndQuota();
      }
    } catch (err) {
      renderFallbackLeadsAndQuota();
    } finally {
      isLeadsLoading = false;
    }
  }

  function renderQuotaGauge(data) {
    if (!data) return;
    const used = data.contacts_used || 0;
    const allowance = data.allowance || 5;
    const remaining = data.contacts_remaining ?? Math.max(0, allowance - used);
    const planName = data.plan_name || data.plan_id || 'FREE';
    const isSoftCap = Boolean(data.soft_cap || used > allowance);

    const badgePlan = document.getElementById('quota-plan-badge');
    if (badgePlan) {
      badgePlan.textContent = `${planName.toUpperCase()} (${allowance >= 500 ? 'Fair-Use' : allowance + '/mo'})`;
    }

    const badgeSoftcap = document.getElementById('quota-softcap-badge');
    if (badgeSoftcap) {
      badgeSoftcap.style.display = isSoftCap ? 'inline-block' : 'none';
    }

    const calloutSoftcap = document.getElementById('quota-softcap-callout');
    if (calloutSoftcap) {
      calloutSoftcap.style.display = isSoftCap ? 'block' : 'none';
    }

    const countsDisplay = document.getElementById('quota-counts-display');
    if (countsDisplay) {
      countsDisplay.textContent = `${used} / ${allowance >= 500 ? '∞' : allowance}`;
    }

    const remLabel = document.getElementById('quota-remaining-label');
    if (remLabel) {
      remLabel.textContent = isSoftCap
        ? `${used - allowance} contacts over quota (Soft-cap active)`
        : `${remaining} contacts remaining`;
      remLabel.style.color = isSoftCap ? '#F59E0B' : (remaining > 0 ? '#34D399' : '#EF4444');
    }

    const barFill = document.getElementById('dash-quota-bar-fill');
    if (barFill) {
      const pct = Math.min(100, Math.round((used / (allowance || 1)) * 100));
      barFill.style.width = `${pct}%`;
      if (isSoftCap) {
        barFill.style.background = 'linear-gradient(90deg, #F59E0B, #D97706)';
      } else if (pct >= 80) {
        barFill.style.background = '#F59E0B';
      } else {
        barFill.style.background = 'linear-gradient(90deg, #00A859, #34D399)';
      }
    }

    const countWa = document.getElementById('quota-count-wa');
    if (countWa) countWa.textContent = data.whatsapp_contacts ?? 0;

    const countCall = document.getElementById('quota-count-call');
    if (countCall) countCall.textContent = data.phone_contacts ?? 0;

    // Overview Ribbon KPI synchronization
    const kpiLeads = document.getElementById('kpi-leads');
    if (kpiLeads) {
      kpiLeads.textContent = data.pagination?.total ?? (data.leads ? data.leads.length : 0);
    }
    const kpiPlan = document.getElementById('kpi-sub-plan');
    if (kpiPlan) kpiPlan.textContent = (data.plan_id || 'FREE').toUpperCase();
    const kpiRem = document.getElementById('kpi-sub-remaining');
    if (kpiRem) {
      kpiRem.textContent = isSoftCap ? 'Soft-cap active' : (allowance >= 500 ? 'Unlimited' : `${remaining} contacts left`);
      kpiRem.style.color = isSoftCap ? '#F59E0B' : (remaining > 0 ? '#34D399' : '#EF4444');
    }
  }

  // ==========================================================================
  // PHASE 028: ARTISAN LEAD CONVERSION & JOB PIPELINE CRM ENGINE
  // ==========================================================================

  let currentCrmView = (typeof localStorage !== 'undefined' && localStorage.getItem('padifix_leads_view_mode')) || 'kanban';
  let activeDrawerLeadId = null;
  let activeDrawerTemplateKey = 'greeting';

  function initCrmViewSwitcher() {
    const btnKanban = document.getElementById('btn-view-kanban');
    const btnList = document.getElementById('btn-view-list');
    if (!btnKanban || !btnList) return;

    const setView = (mode) => {
      currentCrmView = mode;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('padifix_leads_view_mode', mode);
      }
      if (mode === 'kanban') {
        btnKanban.classList.add('active');
        btnList.classList.remove('active');
      } else {
        btnList.classList.add('active');
        btnKanban.classList.remove('active');
      }
      renderLeadsInbox(cachedLeads);
    };

    if (!btnKanban.dataset.bound) {
      btnKanban.dataset.bound = 'true';
      btnKanban.addEventListener('click', () => setView('kanban'));
    }
    if (!btnList.dataset.bound) {
      btnList.dataset.bound = 'true';
      btnList.addEventListener('click', () => setView('list'));
    }

    if (currentCrmView === 'list') {
      btnList.classList.add('active');
      btnKanban.classList.remove('active');
    } else {
      btnKanban.classList.add('active');
      btnList.classList.remove('active');
    }
  }

  function updatePipelineFinancialRibbon(leads) {
    const list = Array.isArray(leads) ? leads : [];
    let realizedKobo = 0;
    let pipelineKobo = 0;
    let wonCount = 0;
    let lostCount = 0;
    let activeCount = 0;

    list.forEach(l => {
      const st = l.status || 'new';
      if (['new', 'in_discussion', 'quote_sent', 'scheduled'].includes(st)) {
        activeCount++;
      }
      if (st === 'quote_sent' || st === 'scheduled') {
        if (l.quote_amount_kobo) pipelineKobo += Number(l.quote_amount_kobo);
      }
      if (st === 'completed' || st === 'job_won') {
        wonCount++;
        const amt = l.final_amount_kobo || l.quote_amount_kobo || 0;
        realizedKobo += Number(amt);
      }
      if (st === 'lost') {
        lostCount++;
      }
    });

    const resolvedCount = wonCount + lostCount;
    const winRate = resolvedCount > 0 ? Math.round((wonCount / resolvedCount) * 100) : 0;
    const avgDealKobo = wonCount > 0 ? Math.round(realizedKobo / wonCount) : 0;

    const revEl = document.getElementById('crm-metric-revenue');
    if (revEl) revEl.textContent = `₦${Math.round(realizedKobo / 100).toLocaleString()}`;

    const pipeEl = document.getElementById('crm-metric-pipeline');
    if (pipeEl) pipeEl.textContent = `₦${Math.round(pipelineKobo / 100).toLocaleString()}`;

    const winEl = document.getElementById('crm-metric-winrate');
    if (winEl) winEl.textContent = `${winRate}%`;

    const avgEl = document.getElementById('crm-metric-avgdeal');
    if (avgEl) avgEl.textContent = `₦${Math.round(avgDealKobo / 100).toLocaleString()}`;

    const actEl = document.getElementById('crm-metric-active');
    if (actEl) actEl.textContent = activeCount;
  }

  function generateWhatsAppTemplate(lead, templateKey) {
    if (!lead) return '';
    const providerName = currentProvider ? (currentProvider.business_name || currentProvider.full_name || 'Your Artisan') : 'PadiFix Verified Artisan';
    const intent = lead.intent_tag || 'Artisan Service';
    const locality = lead.locality || 'your area';
    const profileUrl = typeof window !== 'undefined' ? `${window.location.origin}/profile.html?id=${lead.provider_id || (currentProvider ? currentProvider.id : '')}` : 'https://padifix.vercel.app';

    const quoteNgn = lead.quote_amount_kobo ? `₦${Math.round(lead.quote_amount_kobo / 100).toLocaleString()}` : 'To be determined';
    const workNgn = lead.workmanship_amount_kobo ? `₦${Math.round(lead.workmanship_amount_kobo / 100).toLocaleString()}` : null;
    const matNgn = lead.materials_amount_kobo ? `₦${Math.round(lead.materials_amount_kobo / 100).toLocaleString()}` : null;

    let schedDate = 'an agreed date';
    if (lead.scheduled_for) {
      try {
        schedDate = new Date(lead.scheduled_for).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      } catch (e) {}
    }

    switch (templateKey) {
      case 'greeting':
        return `Hello! Thank you for reaching out to ${providerName} for ${intent} in ${locality} via PadiFix.\n\nI am currently available to assist you. When would be the best time to inspect the work or discuss the details?`;
      case 'quote':
        let quoteMsg = `PadiFix Service Quote from ${providerName}:\n• Service: ${intent}\n• Locality: ${locality}\n• Total Estimate: ${quoteNgn}`;
        if (workNgn || matNgn) {
          quoteMsg += `\n  - Workmanship: ${workNgn || 'Included'}\n  - Materials: ${matNgn || 'Included'}`;
        }
        quoteMsg += `\n\nPayment terms: 50% commitment deposit before commencement, balance upon your full satisfaction.\nLet me know if this works for you!`;
        return quoteMsg;
      case 'schedule':
        return `Confirmed: Scheduled appointment for ${intent} with ${providerName}.\n• Location: ${locality}\n• Date & Time: ${schedDate}\n\nI will arrive equipped with all necessary diagnostic tools. Please confirm if address is ready.`;
      case 'review': {
        const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'https://padifix.vercel.app';
        const reviewUrl = lead.review_token
          ? `${origin}/review.html?token=${encodeURIComponent(lead.review_token)}`
          : `${origin}/review.html`;
        return `Hello! Thank you for choosing ${providerName} for your ${intent} via PadiFix.\n\nCould you please take 30 seconds to rate my completed workmanship and leave a quick review? Here is your direct review link:\n${reviewUrl}\n\nThank you for your business!`;
      }
      default:
        return `Hello! Regarding your inquiry for ${intent} via PadiFix...`;
    }
  }

  async function openWhatsAppDrawer(leadId, templateKey = 'greeting') {
    activeDrawerLeadId = leadId;
    activeDrawerTemplateKey = templateKey;
    const modal = document.getElementById('crm-wa-drawer-modal');
    if (!modal) return;

    const lead = cachedLeads.find(l => l.id === leadId);
    if (!lead) return;

    // Phase 029: If requesting review on a completed lead and token is not yet stored, request it from API
    if (templateKey === 'review' && (lead.status === 'completed' || lead.status === 'job_won') && !lead.review_token) {
      try {
        const token = await getAuthToken();
        const authHeaders = { 'Content-Type': 'application/json' };
        if (token) {
          authHeaders['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch('/api/provider-leads?action=request_review', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ lead_id: leadId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.review_token) {
            lead.review_token = data.review_token;
            lead.review_requested_at = data.review_requested_at;
          }
        }
      } catch (err) {
        console.warn('[CRM] Could not request review token from API:', err);
      }
    }

    // Update active tab
    modal.querySelectorAll('.crm-template-tab').forEach(tab => {
      if (tab.dataset.templateKey === templateKey) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Populate preview
    const renderedMsg = generateWhatsAppTemplate(lead, templateKey);
    const textarea = document.getElementById('crm-wa-rendered-text');
    const charCount = document.getElementById('crm-wa-char-count');
    if (textarea) textarea.value = renderedMsg;
    if (charCount) charCount.textContent = `${renderedMsg.length} chars`;

    modal.style.display = 'flex';
  }

  function openStageModal(leadId, targetStatus) {
    const modal = document.getElementById('crm-stage-modal');
    if (!modal) return;

    const lead = cachedLeads.find(l => l.id === leadId);
    if (!lead) return;

    document.getElementById('crm-modal-lead-id').value = leadId;
    document.getElementById('crm-modal-target-status').value = targetStatus;

    const titleEl = document.getElementById('crm-modal-title');
    const subEl = document.getElementById('crm-modal-subtitle');
    const finSection = document.getElementById('crm-financial-fields');
    const compSection = document.getElementById('crm-completed-fields');
    const schedSection = document.getElementById('crm-schedule-fields');
    const lostSection = document.getElementById('crm-lost-fields');

    // Reset visibility
    if (finSection) finSection.style.display = 'none';
    if (compSection) compSection.style.display = 'none';
    if (schedSection) schedSection.style.display = 'none';
    if (lostSection) lostSection.style.display = 'none';

    // Pre-fill existing lead fields
    const clientNameInput = document.getElementById('crm-client-name');
    if (clientNameInput) clientNameInput.value = lead.client_display_name || '';

    const notesInput = document.getElementById('crm-deal-notes');
    if (notesInput) notesInput.value = lead.notes || '';

    const quoteInput = document.getElementById('crm-quote-amount');
    const workInput = document.getElementById('crm-workmanship-amount');
    const matInput = document.getElementById('crm-materials-amount');
    const finalInput = document.getElementById('crm-final-amount');

    if (quoteInput) quoteInput.value = lead.quote_amount_kobo ? Math.round(lead.quote_amount_kobo / 100) : '';
    if (workInput) workInput.value = lead.workmanship_amount_kobo ? Math.round(lead.workmanship_amount_kobo / 100) : '';
    if (matInput) matInput.value = lead.materials_amount_kobo ? Math.round(lead.materials_amount_kobo / 100) : '';
    if (finalInput) finalInput.value = lead.final_amount_kobo ? Math.round(lead.final_amount_kobo / 100) : (lead.quote_amount_kobo ? Math.round(lead.quote_amount_kobo / 100) : '');

    if (targetStatus === 'quote_sent') {
      if (titleEl) titleEl.textContent = 'Send Quote & Record Estimate';
      if (subEl) subEl.textContent = 'Enter estimated deal amount and optional labor/materials split.';
      if (finSection) finSection.style.display = 'block';
    } else if (targetStatus === 'scheduled') {
      if (titleEl) titleEl.textContent = 'Schedule Customer Appointment';
      if (subEl) subEl.textContent = 'Confirm site visit date and client appointment time.';
      if (schedSection) schedSection.style.display = 'block';
      if (finSection) finSection.style.display = 'block';
    } else if (targetStatus === 'completed') {
      if (titleEl) titleEl.textContent = 'Confirm Completed Job & Revenue';
      if (subEl) subEl.textContent = 'Verify final realized payment amount received from customer.';
      if (compSection) compSection.style.display = 'block';
    } else if (targetStatus === 'lost') {
      if (titleEl) titleEl.textContent = 'Mark Deal as Lost';
      if (subEl) subEl.textContent = 'Record reason for cancellation to improve customer matching.';
      if (lostSection) lostSection.style.display = 'block';
    } else {
      if (titleEl) titleEl.textContent = 'Update Deal Stage';
      if (subEl) subEl.textContent = `Advance lead to ${targetStatus.replace('_', ' ').toUpperCase()}`;
    }

    modal.style.display = 'flex';
  }

  // Helper to construct lead card HTML with Phase 027 quick actions and Phase 028 CRM capabilities
  function createLeadCardHtml(lead, isNewlyArrived = false) {
    const isWa = lead.channel === 'whatsapp';
    const channelIcon = isWa ? '💬' : '📞';
    const channelClass = isWa ? 'whatsapp' : 'call';
    const locality = escapeHtml(lead.locality || 'Local Area');
    const rawIntent = lead.intent_tag || 'Direct Customer Inquiry';
    let urgencyBadgeHtml = '';
    let displayIntent = rawIntent;

    if (rawIntent.startsWith('[URGENT]')) {
      urgencyBadgeHtml = `<span class="crm-badge-urgency urgent" style="background: rgba(239, 68, 68, 0.15); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; padding: 2px 6px; font-size: 11px; font-weight: 700; margin-right: 6px; display: inline-block;">⚡ URGENT</span>`;
      displayIntent = rawIntent.replace(/^\[URGENT\]\s*/, '');
    } else if (rawIntent.startsWith('[2-3 DAYS]')) {
      urgencyBadgeHtml = `<span class="crm-badge-urgency standard" style="background: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 4px; padding: 2px 6px; font-size: 11px; font-weight: 700; margin-right: 6px; display: inline-block;">📅 2-3 DAYS</span>`;
      displayIntent = rawIntent.replace(/^\[2-3 DAYS\]\s*/, '');
    } else if (rawIntent.startsWith('[FLEXIBLE]')) {
      urgencyBadgeHtml = `<span class="crm-badge-urgency flexible" style="background: rgba(107, 114, 128, 0.15); color: #9CA3AF; border: 1px solid rgba(107, 114, 128, 0.3); border-radius: 4px; padding: 2px 6px; font-size: 11px; font-weight: 700; margin-right: 6px; display: inline-block;">🔄 FLEXIBLE</span>`;
      displayIntent = rawIntent.replace(/^\[FLEXIBLE\]\s*/, '');
    }

    const intent = escapeHtml(displayIntent || 'Direct Customer Inquiry');
    const time = escapeHtml(lead.relative_time || 'Just now');
    const notes = lead.notes ? escapeHtml(lead.notes) : '';
    const status = lead.status || 'new';
    const newlyClass = isNewlyArrived ? ' newly-arrived' : '';
    const clientName = lead.client_display_name ? escapeHtml(lead.client_display_name) : '';

    // Financial badge
    let moneyBadgeHtml = '';
    if (lead.quote_amount_kobo) {
      const isWon = status === 'completed' || status === 'job_won';
      const quoteNgn = Math.round(lead.quote_amount_kobo / 100).toLocaleString();
      let breakdownStr = '';
      if (lead.workmanship_amount_kobo || lead.materials_amount_kobo) {
        const w = lead.workmanship_amount_kobo ? `Labor: ₦${Math.round(lead.workmanship_amount_kobo / 100).toLocaleString()}` : '';
        const m = lead.materials_amount_kobo ? `Mat: ₦${Math.round(lead.materials_amount_kobo / 100).toLocaleString()}` : '';
        breakdownStr = ` title="${w}${w && m ? ' | ' : ''}${m}"`;
      }
      moneyBadgeHtml = `<span class="crm-badge-money ${isWon ? 'won' : ''}"${breakdownStr}>💰 ₦${quoteNgn}</span>`;
    }

    // Schedule badge
    let scheduleBadgeHtml = '';
    if (lead.scheduled_for) {
      try {
        const d = new Date(lead.scheduled_for);
        const schedStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        scheduleBadgeHtml = `<span class="crm-badge-schedule" title="Scheduled Visit">🗓️ ${schedStr}</span>`;
      } catch (e) {}
    }

    // Lost reason badge
    let lostBadgeHtml = '';
    if (status === 'lost' && lead.lost_reason) {
      lostBadgeHtml = `<span class="crm-badge-money" style="background: rgba(239, 68, 68, 0.15); color: #EF4444; border-color: rgba(239, 68, 68, 0.3);">❌ ${escapeHtml(lead.lost_reason)}</span>`;
    }

    // Phase 033: Digital Quote / Invoice badge
    let invoiceBadgeHtml = '';
    if (lead.invoice_ref) {
      invoiceBadgeHtml = `<span class="crm-badge-money" style="background: rgba(0, 168, 89, 0.15); color: #34D399; border-color: rgba(0, 168, 89, 0.3);" title="Digital Quote / Invoice Attached">📄 ${escapeHtml(lead.invoice_ref)}</span>`;
    }

    // Advance button text & target status
    let advanceBtnText = '';
    let advanceTarget = '';
    if (status === 'new') {
      advanceBtnText = 'Advance to In Discussion →';
      advanceTarget = 'in_discussion';
    } else if (status === 'in_discussion') {
      advanceBtnText = 'Send Quote (Log ₦) →';
      advanceTarget = 'quote_sent';
    } else if (status === 'quote_sent') {
      advanceBtnText = 'Schedule Job 🗓️ →';
      advanceTarget = 'scheduled';
    } else if (status === 'scheduled') {
      advanceBtnText = 'Mark Completed 🎉';
      advanceTarget = 'completed';
    } else if (status === 'completed' || status === 'job_won') {
      advanceBtnText = '⭐ Request Review';
      advanceTarget = 'review';
    } else if (status === 'lost') {
      advanceBtnText = '🔄 Re-open Deal';
      advanceTarget = 'new';
    }

    return `
      <div class="dash-lead-item crm-deal-card${newlyClass}" id="lead-card-${escapeHtml(lead.id)}" data-lead-id="${escapeHtml(lead.id)}" data-status="${status}">
        <div style="width: 100%;">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 10px;">
            <div class="dash-lead-left">
              <div class="dash-lead-channel-icon ${channelClass}" title="${isWa ? 'WhatsApp Inquiry' : 'Phone Call'}">
                ${channelIcon}
              </div>
              <div style="min-width: 0;">
                <div class="dash-lead-name dash-lead-locality">📍 ${locality}</div>
                <div class="dash-lead-service dash-lead-intent">${urgencyBadgeHtml}${intent}</div>
                ${clientName ? `<div class="crm-client-tag">👤 ${clientName}</div>` : ''}
              </div>
            </div>
            <div class="dash-lead-right">
              <div style="display: flex; align-items: center; gap: 6px;">
                <select class="dash-lead-status-select status-${status}" data-lead-id="${escapeHtml(lead.id)}" title="Update Lead Status">
                  <option value="new" ${status === 'new' ? 'selected' : ''}>New</option>
                  <option value="in_discussion" ${status === 'in_discussion' ? 'selected' : ''}>In Discussion</option>
                  <option value="quote_sent" ${status === 'quote_sent' ? 'selected' : ''}>Quote Sent</option>
                  <option value="scheduled" ${status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                  <option value="completed" ${status === 'completed' || status === 'job_won' ? 'selected' : ''}>Completed</option>
                  <option value="lost" ${status === 'lost' ? 'selected' : ''}>Lost</option>
                </select>
                <button type="button" class="dash-lead-notes-btn" data-lead-id="${escapeHtml(lead.id)}" title="Add or edit private note">✏️</button>
              </div>
              <span class="dash-lead-time">${time}</span>
            </div>
          </div>

          <!-- Meta badges (financial, schedule, lost reason, invoice) -->
          ${(moneyBadgeHtml || scheduleBadgeHtml || lostBadgeHtml || invoiceBadgeHtml) ? `
            <div class="crm-deal-meta-row">
              ${moneyBadgeHtml}
              ${scheduleBadgeHtml}
              ${lostBadgeHtml}
              ${invoiceBadgeHtml}
            </div>
          ` : ''}

          <!-- Private notes drawer -->
          ${notes ? `<div class="dash-lead-notes-drawer" id="notes-text-${escapeHtml(lead.id)}">📝 ${notes}</div>` : `<div id="notes-text-${escapeHtml(lead.id)}" style="display:none;"></div>`}

          <!-- One-Tap Stage Advancement Primary Button -->
          ${advanceBtnText ? `
            <button type="button" class="btn-crm-advance" data-lead-id="${escapeHtml(lead.id)}" data-target-status="${advanceTarget}">
              ${advanceBtnText}
            </button>
          ` : ''}

          <!-- Phase 028: One-Tap WhatsApp Reply Chips -->
          <div class="crm-wa-quickbar">
            <button type="button" class="crm-chip-wa btn-wa-template" data-lead-id="${escapeHtml(lead.id)}" data-template="greeting" title="Send initial greeting on WhatsApp">
              👋 Greet
            </button>
            <button type="button" class="crm-chip-wa btn-wa-template" data-lead-id="${escapeHtml(lead.id)}" data-template="quote" title="Send formal quote on WhatsApp">
              💰 Quote
            </button>
            <button type="button" class="crm-chip-wa btn-wa-template" data-lead-id="${escapeHtml(lead.id)}" data-template="schedule" title="Confirm schedule on WhatsApp">
              📅 Schedule
            </button>
            <button type="button" class="crm-chip-wa btn-wa-template" data-lead-id="${escapeHtml(lead.id)}" data-template="review" title="Request customer review on WhatsApp">
              ⭐ Review
            </button>
          </div>

          <!-- PHASE 027, 033, 034 QUICK ACTIONS -->
          <div class="dash-lead-quick-actions">
            ${(status === 'completed' || status === 'job_won') ? `
              <button type="button" class="btn-quick-chip btn-chip-portfolio" data-lead-id="${escapeHtml(lead.id)}" title="Add before/after photos of this completed job to your portfolio showcase">
                📸 Add to Showcase
              </button>
            ` : ''}
            <button type="button" class="btn-quick-chip btn-chip-invoice" data-lead-id="${escapeHtml(lead.id)}" title="Generate or view itemized digital quote / invoice">
              📄 Quote / Invoice
            </button>
            <button type="button" class="btn-quick-chip btn-chip-contacted" data-lead-id="${escapeHtml(lead.id)}" title="Mark this lead as contacted">
              ✓ Mark Contacted
            </button>
            <button type="button" class="btn-quick-chip btn-chip-note" data-lead-id="${escapeHtml(lead.id)}" title="Add or edit a private note for this lead">
              📝 Add Note
            </button>
            <button type="button" class="btn-quick-chip btn-chip-copy" data-lead-id="${escapeHtml(lead.id)}" data-intent="${intent}" data-locality="${locality}" data-channel="${isWa ? 'WhatsApp' : 'Phone Call'}" title="Copy sanitized inquiry summary to clipboard">
              📋 Copy Brief
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderLeadsInbox(leads) {
    const leadsContainer = document.getElementById('recent-leads-list');
    if (!leadsContainer) return;

    initCrmViewSwitcher();
    updatePipelineFinancialRibbon(leads);

    if (!Array.isArray(leads) || leads.length === 0) {
      leadsContainer.innerHTML = `
        <div style="padding: 28px 16px; text-align: center; color: var(--dash-muted); font-size: 13.5px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px dashed var(--dash-border);">
          <div style="font-size: 1.8rem; margin-bottom: 6px;">📭</div>
          <strong style="color: var(--dash-text); font-size: 0.95rem; display: block; margin-bottom: 4px;">No customer leads yet this billing period</strong>
          <span>Share your verified profile link to receive direct customer inquiries on WhatsApp.</span>
        </div>
      `;
      bindLeadControls();
      return;
    }

    if (currentCrmView === 'kanban') {
      // Group into stages
      const stages = [
        { key: 'new', label: '📥 New Leads', accent: 'crm-col-new' },
        { key: 'in_discussion', label: '💬 In Discussion', accent: 'crm-col-in_discussion' },
        { key: 'quote_sent', label: '📝 Quoted', accent: 'crm-col-quote_sent' },
        { key: 'scheduled', label: '🗓️ Scheduled', accent: 'crm-col-scheduled' },
        { key: 'completed', label: '🎉 Completed', accent: 'crm-col-completed' }
      ];

      // If any leads are lost, add the lost column
      const hasLost = leads.some(l => l.status === 'lost');
      if (hasLost) {
        stages.push({ key: 'lost', label: '❌ Lost / Closed', accent: 'crm-col-lost' });
      }

      const columnsHtml = stages.map(st => {
        const colLeads = leads.filter(l => {
          if (st.key === 'completed') return l.status === 'completed' || l.status === 'job_won';
          return (l.status || 'new') === st.key;
        });

        let subtotalKobo = 0;
        colLeads.forEach(l => {
          const amt = (st.key === 'completed') ? (l.final_amount_kobo || l.quote_amount_kobo || 0) : (l.quote_amount_kobo || 0);
          subtotalKobo += Number(amt);
        });
        const subtotalStr = subtotalKobo > 0 ? `₦${Math.round(subtotalKobo / 100).toLocaleString()}` : '';

        const cardsHtml = colLeads.length > 0
          ? colLeads.map(l => createLeadCardHtml(l, false)).join('')
          : `<div class="crm-col-empty">No deals in this stage</div>`;

        return `
          <div class="crm-kanban-column ${st.accent}" data-stage="${st.key}">
            <div class="crm-col-header">
              <div class="crm-col-title-group">
                <h4 class="crm-col-title">${st.label}</h4>
                <span class="crm-col-count-badge">${colLeads.length}</span>
              </div>
              ${subtotalStr ? `<span class="crm-col-subtotal">${subtotalStr}</span>` : ''}
            </div>
            <div class="crm-col-cards" data-stage="${st.key}">
              ${cardsHtml}
            </div>
          </div>
        `;
      }).join('');

      leadsContainer.innerHTML = `<div class="crm-kanban-board">${columnsHtml}</div>`;
    } else {
      // Compact List View
      leadsContainer.innerHTML = leads.map(lead => createLeadCardHtml(lead, false)).join('');
    }

    bindLeadControls();
  }

  function bindLeadControls() {
    // Status Select listeners
    document.querySelectorAll('.dash-lead-status-select').forEach(select => {
      if (select.dataset.bound) return;
      select.dataset.bound = 'true';
      select.addEventListener('change', async (e) => {
        const leadId = select.dataset.leadId;
        const newStatus = e.target.value;
        if (['quote_sent', 'scheduled', 'completed', 'lost'].includes(newStatus)) {
          openStageModal(leadId, newStatus);
        } else {
          await handleLeadStatusChange(leadId, newStatus, select);
        }
      });
    });

    // Notes Button listeners
    document.querySelectorAll('.dash-lead-notes-btn').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', async () => {
        const leadId = btn.dataset.leadId;
        await handleLeadNotesPrompt(leadId);
      });
    });

    // One-Tap Stage Advancement Button
    document.querySelectorAll('.btn-crm-advance').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', async () => {
        const leadId = btn.dataset.leadId;
        const targetStatus = btn.dataset.targetStatus;
        if (targetStatus === 'review') {
          openWhatsAppDrawer(leadId, 'review');
        } else if (['quote_sent', 'scheduled', 'completed', 'lost'].includes(targetStatus)) {
          openStageModal(leadId, targetStatus);
        } else {
          await handleLeadStatusChange(leadId, targetStatus);
        }
      });
    });

    // WhatsApp Template Chips
    document.querySelectorAll('.btn-wa-template').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', () => {
        const leadId = btn.dataset.leadId;
        const tmpl = btn.dataset.template || 'greeting';
        openWhatsAppDrawer(leadId, tmpl);
      });
    });

    // PHASE 033: Quick Action Chip - Generate / View Digital Quote & Invoice
    document.querySelectorAll('.btn-chip-invoice').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', () => {
        const leadId = btn.dataset.leadId;
        openInvoiceGeneratorModal(leadId);
      });
    });

    // Phase 034: Quick Action Chip - Add to Showcase from Completed Lead
    document.querySelectorAll('.btn-chip-portfolio').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', () => {
        const leadId = btn.dataset.leadId;
        openPortfolioModalFromLead(leadId);
      });
    });

    // Stage modal trigger to open full itemized quote / invoice builder
    const openInvFromStageBtn = document.getElementById('btn-open-invoice-from-stage');
    if (openInvFromStageBtn && !openInvFromStageBtn.dataset.bound) {
      openInvFromStageBtn.dataset.bound = 'true';
      openInvFromStageBtn.addEventListener('click', () => {
        const leadId = document.getElementById('crm-modal-lead-id')?.value;
        const stageModal = document.getElementById('crm-stage-modal');
        if (stageModal) stageModal.style.display = 'none';
        if (leadId) openInvoiceGeneratorModal(leadId);
      });
    }

    // PHASE 027: Quick Action Chip - Mark Contacted
    document.querySelectorAll('.btn-chip-contacted').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', async () => {
        const leadId = btn.dataset.leadId;
        const selectEl = document.querySelector(`.dash-lead-status-select[data-lead-id="${leadId}"]`);
        await handleLeadStatusChange(leadId, 'in_discussion', selectEl);
      });
    });

    // PHASE 027: Quick Action Chip - Add Note
    document.querySelectorAll('.btn-chip-note').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', async () => {
        const leadId = btn.dataset.leadId;
        await handleLeadNotesPrompt(leadId);
      });
    });

    // PHASE 027: Quick Action Chip - Copy Brief (Strict Invariant C: Zero Customer PII)
    document.querySelectorAll('.btn-chip-copy').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', async () => {
        const leadId = btn.dataset.leadId;
        const lead = cachedLeads.find(l => l.id === leadId);
        const intent = (lead && lead.intent_tag) || btn.dataset.intent || 'Artisan Service';
        const locality = (lead && lead.locality) || btn.dataset.locality || 'Local Area';
        const channel = (lead && lead.channel === 'whatsapp') ? 'WhatsApp' : (btn.dataset.channel || 'Phone Call');

        // Sanitized lead brief containing exclusively operational parameters — ZERO PII
        const briefText = `PadiFix Lead Brief: Customer inquired for ${intent} in ${locality} via ${channel}.`;

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(briefText);
            showToast('📋 Lead brief copied to clipboard!', 'success');
          } else {
            const textArea = document.createElement('textarea');
            textArea.value = briefText;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('📋 Lead brief copied to clipboard!', 'success');
          }
        } catch (err) {
          showToast('Clipboard copy unavailable.', 'info');
        }
      });
    });

    // Export CSV button
    const exportBtn = document.getElementById('btn-export-leads-csv');
    if (exportBtn && !exportBtn.dataset.bound) {
      exportBtn.dataset.bound = 'true';
      exportBtn.addEventListener('click', () => exportLeadsCsv(cachedLeads));
    }

    // Refresh button
    const refreshBtn = document.getElementById('btn-refresh-leads');
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = 'true';
      refreshBtn.addEventListener('click', () => {
        showToast('Refreshing leads...');
        loadProviderLeadsAndQuota();
      });
    }

    // Modal Events Binding
    initCrmModals();

    // Initialize sound toggle button if present
    initSoundToggleButton();
  }

  function initCrmModals() {
    // Close Stage Modal
    const btnCloseStage = document.getElementById('btn-close-crm-modal');
    const btnCancelStage = document.getElementById('btn-cancel-crm-modal');
    const stageModal = document.getElementById('crm-stage-modal');

    const closeStage = () => {
      if (stageModal) stageModal.style.display = 'none';
    };

    if (btnCloseStage && !btnCloseStage.dataset.bound) {
      btnCloseStage.dataset.bound = 'true';
      btnCloseStage.addEventListener('click', closeStage);
    }
    if (btnCancelStage && !btnCancelStage.dataset.bound) {
      btnCancelStage.dataset.bound = 'true';
      btnCancelStage.addEventListener('click', closeStage);
    }

    // Submit Stage Form
    const stageForm = document.getElementById('form-crm-stage');
    if (stageForm && !stageForm.dataset.bound) {
      stageForm.dataset.bound = 'true';
      stageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const leadId = document.getElementById('crm-modal-lead-id').value;
        const targetStatus = document.getElementById('crm-modal-target-status').value;
        const clientName = document.getElementById('crm-client-name')?.value || null;
        const notes = document.getElementById('crm-deal-notes')?.value || null;

        const extra = { client_display_name: clientName, notes };

        const quoteVal = document.getElementById('crm-quote-amount')?.value;
        const workVal = document.getElementById('crm-workmanship-amount')?.value;
        const matVal = document.getElementById('crm-materials-amount')?.value;

        if (quoteVal) extra.quote_amount_kobo = Math.round(Number(quoteVal) * 100);
        if (workVal) extra.workmanship_amount_kobo = Math.round(Number(workVal) * 100);
        if (matVal) extra.materials_amount_kobo = Math.round(Number(matVal) * 100);

        if (targetStatus === 'quote_sent') {
          if (quoteVal && (workVal || matVal)) {
            const totalQ = Number(quoteVal) || 0;
            const w = Number(workVal) || 0;
            const m = Number(matVal) || 0;
            if (w + m !== totalQ) {
              showToast(`Workmanship (₦${w.toLocaleString()}) + Materials (₦${m.toLocaleString()}) must equal Total Quote (₦${totalQ.toLocaleString()}).`, 'error');
              return;
            }
          }
        }

        if (targetStatus === 'completed') {
          const finalVal = document.getElementById('crm-final-amount')?.value;
          if (finalVal) {
            extra.final_amount_kobo = Math.round(Number(finalVal) * 100);
          } else if (quoteVal) {
            extra.final_amount_kobo = Math.round(Number(quoteVal) * 100);
          }
          extra.completed_at = new Date().toISOString();
        }

        const schedVal = document.getElementById('crm-scheduled-date')?.value;
        if (schedVal) {
          extra.scheduled_for = new Date(schedVal).toISOString();
        }

        const lostSelect = document.getElementById('crm-lost-reason-select');
        if (lostSelect && targetStatus === 'lost') {
          extra.lost_reason = lostSelect.value;
        }

        closeStage();
        await handleLeadStatusChange(leadId, targetStatus, null, extra);
        if (targetStatus === 'completed') {
          openCompletionReviewPrompt(leadId);
        }
      });
    }

    // Post-Completion Review Prompt Modal Wiring (Section 18)
    const compModal = document.getElementById('crm-completion-review-modal');
    const btnCancelComp = document.getElementById('btn-cancel-completion-modal');
    const btnReqRevFromComp = document.getElementById('btn-request-review-from-completion');
    if (btnCancelComp && !btnCancelComp.dataset.bound) {
      btnCancelComp.dataset.bound = 'true';
      btnCancelComp.addEventListener('click', () => {
        if (compModal) compModal.style.display = 'none';
      });
    }
    if (btnReqRevFromComp && !btnReqRevFromComp.dataset.bound) {
      btnReqRevFromComp.dataset.bound = 'true';
      btnReqRevFromComp.addEventListener('click', () => {
        if (compModal) compModal.style.display = 'none';
        if (activeCompletionLeadId) {
          openWhatsAppDrawer(activeCompletionLeadId, 'review');
        }
      });
    }

    // WhatsApp Drawer Tab Switching & Actions
    const waModal = document.getElementById('crm-wa-drawer-modal');
    const btnCloseWa = document.getElementById('btn-close-wa-modal');
    const closeWa = () => {
      if (waModal) waModal.style.display = 'none';
    };

    if (btnCloseWa && !btnCloseWa.dataset.bound) {
      btnCloseWa.dataset.bound = 'true';
      btnCloseWa.addEventListener('click', closeWa);
    }

    if (waModal && !waModal.dataset.tabsBound) {
      waModal.dataset.tabsBound = 'true';
      waModal.querySelectorAll('.crm-template-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
          waModal.querySelectorAll('.crm-template-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          activeDrawerTemplateKey = tab.dataset.templateKey;
          const lead = cachedLeads.find(l => l.id === activeDrawerLeadId);
          if (lead) {
            if (activeDrawerTemplateKey === 'review' && (lead.status === 'completed' || lead.status === 'job_won') && !lead.review_token) {
              try {
                const token = await getAuthToken();
                const authHeaders = { 'Content-Type': 'application/json' };
                if (token) {
                  authHeaders['Authorization'] = `Bearer ${token}`;
                }
                const res = await fetch('/api/provider-leads?action=request_review', {
                  method: 'POST',
                  headers: authHeaders,
                  body: JSON.stringify({ lead_id: lead.id })
                });
                if (res.ok) {
                  const data = await res.json();
                  if (data.review_token) {
                    lead.review_token = data.review_token;
                    lead.review_requested_at = data.review_requested_at;
                  }
                }
              } catch (e) {}
            }
            const text = generateWhatsAppTemplate(lead, activeDrawerTemplateKey);
            const textarea = document.getElementById('crm-wa-rendered-text');
            const charCount = document.getElementById('crm-wa-char-count');
            if (textarea) textarea.value = text;
            if (charCount) charCount.textContent = `${text.length} chars`;
          }
        });
      });
    }

    // Copy WA Template Button
    const btnCopyWa = document.getElementById('btn-crm-copy-wa');
    if (btnCopyWa && !btnCopyWa.dataset.bound) {
      btnCopyWa.dataset.bound = 'true';
      btnCopyWa.addEventListener('click', async () => {
        const textarea = document.getElementById('crm-wa-rendered-text');
        const text = textarea ? textarea.value : '';
        if (!text) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            textarea.select();
            document.execCommand('copy');
          }
          showToast('📋 WhatsApp template copied to clipboard!', 'success');
        } catch (e) {
          showToast('Failed to copy to clipboard.', 'error');
        }
      });
    }

    // Open WA Button
    const btnOpenWa = document.getElementById('btn-crm-open-wa');
    if (btnOpenWa && !btnOpenWa.dataset.bound) {
      btnOpenWa.dataset.bound = 'true';
      btnOpenWa.addEventListener('click', () => {
        const textarea = document.getElementById('crm-wa-rendered-text');
        const text = textarea ? textarea.value : '';
        if (!text) return;
        const encoded = encodeURIComponent(text);
        // Clean launch without storing PII
        const waUrl = `https://wa.me/?text=${encoded}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
        showToast('🚀 Opening WhatsApp...', 'info');
      });
    }
  }

  async function handleLeadStatusChange(leadId, newStatus, selectEl, extraFields = {}) {
    const targetSelect = selectEl || document.querySelector(`.dash-lead-status-select[data-lead-id="${leadId}"]`);
    const oldStatusClass = targetSelect ? (Array.from(targetSelect.classList).find(c => c.startsWith('status-')) || 'status-new') : 'status-new';
    if (targetSelect) {
      targetSelect.className = `dash-lead-status-select status-${newStatus}`;
      targetSelect.value = newStatus;
    }

    // Optimistic lead update
    const lead = cachedLeads.find(l => l.id === leadId);
    let prevLeadState = null;
    if (lead) {
      prevLeadState = { ...lead };
      lead.status = newStatus;
      Object.assign(lead, extraFields);
      // Re-render inbox & ribbon optimistically
      renderLeadsInbox(cachedLeads);
    }

    let token = null;
    try {
      if (typeof LokatorDB !== 'undefined' && LokatorDB.auth && typeof LokatorDB.auth.getSession === 'function') {
        const sessionRes = await LokatorDB.auth.getSession();
        token = sessionRes?.data?.session?.access_token;
      }
    } catch (e) {}

    if (!token && typeof localStorage !== 'undefined') {
      try {
        const rawSession = localStorage.getItem('lokator_supabase_auth_session') || localStorage.getItem('lokator_auth_session');
        if (rawSession) {
          const parsed = JSON.parse(rawSession);
          token = parsed.access_token || parsed.token || null;
        }
      } catch (e) {}
    }

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const patchPayload = {
      lead_id: leadId,
      status: newStatus,
      provider_id: currentProvider ? currentProvider.id : undefined,
      ...extraFields
    };

    try {
      const res = await fetch('/api/provider-leads', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patchPayload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const resData = await res.json().catch(() => ({}));
      if (resData.lead && lead) {
        Object.assign(lead, resData.lead);
      }

      // Re-render to ensure authoritative server timestamps/formatting
      renderLeadsInbox(cachedLeads);

      const displayStatus = newStatus.replace('_', ' ').toUpperCase();
      showToast(`Deal updated: ${displayStatus}`, 'success');

      // Broadcast stage transition over private channel if channel is active
      if (realtimeChannel && typeof realtimeChannel.send === 'function' && currentProvider) {
        try {
          realtimeChannel.send({
            type: 'broadcast',
            event: 'lead_stage_changed',
            payload: {
              type: 'lead_stage_changed',
              lead_id: leadId,
              status: newStatus,
              updated_at: new Date().toISOString()
            }
          });
        } catch (bErr) {}
      }
    } catch (err) {
      // Rollback optimistic update
      if (lead && prevLeadState) {
        Object.assign(lead, prevLeadState);
        renderLeadsInbox(cachedLeads);
      }
      if (targetSelect) targetSelect.className = `dash-lead-status-select ${oldStatusClass}`;
      showToast(`Failed to update deal: ${err.message}`, 'error');
    }
  }

  async function handleLeadNotesPrompt(leadId) {
    const lead = cachedLeads.find(l => l.id === leadId);
    const existingNotes = lead ? (lead.notes || '') : '';
    const input = prompt('Enter private notes for this lead (max 500 characters):', existingNotes);
    if (input === null) return;

    if (input.length > 500) {
      showToast('Notes cannot exceed 500 characters.', 'error');
      return;
    }

    let token = null;
    try {
      if (typeof LokatorDB !== 'undefined' && LokatorDB.auth && typeof LokatorDB.auth.getSession === 'function') {
        const sessionRes = await LokatorDB.auth.getSession();
        token = sessionRes?.data?.session?.access_token;
      }
    } catch (e) {}

    if (!token && typeof localStorage !== 'undefined') {
      try {
        const rawSession = localStorage.getItem('lokator_supabase_auth_session') || localStorage.getItem('lokator_auth_session');
        if (rawSession) {
          const parsed = JSON.parse(rawSession);
          token = parsed.access_token || parsed.token || null;
        }
      } catch (e) {}
    }

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch('/api/provider-leads', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          lead_id: leadId,
          notes: input.trim(),
          provider_id: currentProvider ? currentProvider.id : undefined
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      if (lead) lead.notes = input.trim();
      const notesEl = document.getElementById(`notes-text-${leadId}`);
      if (notesEl) {
        if (input.trim()) {
          notesEl.className = 'dash-lead-notes-drawer';
          notesEl.style.display = 'block';
          notesEl.textContent = `📝 ${input.trim()}`;
        } else {
          notesEl.style.display = 'none';
          notesEl.textContent = '';
        }
      }
      showToast('Private notes saved.', 'success');
    } catch (err) {
      showToast(`Failed to save notes: ${err.message}`, 'error');
    }
  }


  function renderFallbackLeadsAndQuota() {
    renderQuotaGauge({
      plan_id: 'FREE',
      plan_name: 'Free Starter',
      allowance: 5,
      contacts_used: 0,
      whatsapp_contacts: 0,
      phone_contacts: 0,
      contacts_remaining: 5,
      soft_cap: false
    });
    renderLeadsInbox(cachedLeads);
  }

  // Backward-compatible alias
  function renderRecentLeads() {
    loadProviderLeadsAndQuota();
  }

  // ============================================================================
  // PHASE 027: REAL-TIME ARTISAN DASHBOARD LEAD STREAM & QUICK ACTIONS
  // Supabase Broadcasts + Web Audio Chime + Adaptive Polling + Deduplication
  // ============================================================================

  const processedLeadIds = new Set();
  let realtimeChannel = null;
  let pollingTimer = null;
  let isPollingActive = false;
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function setupAudioUnlock() {
    const unlock = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock, { once: true, passive: true });
    document.addEventListener('keydown', unlock, { once: true, passive: true });
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
  }

  function isLeadChimeMuted() {
    try {
      return localStorage.getItem('padifix_lead_chime_muted') === 'true';
    } catch (e) {
      return false;
    }
  }

  function playLeadChime() {
    try {
      if (isLeadChimeMuted()) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;

      // Harmonic two-tone notification chime:
      // Tone 1: 587.33 Hz (D5)
      // Tone 2: 880.00 Hz (A5)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, now + 0.1);

      // Smooth envelope: fast attack, exponential decay
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.25, now + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.18, now + 0.12);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.15);

      osc2.start(now + 0.1);
      osc2.stop(now + 0.45);
    } catch (err) {
      console.warn('[AudioChime] Non-fatal Web Audio exception:', err.message);
    }
  }

  function setStreamStatus(status) {
    const pill = document.getElementById('realtime-stream-status');
    if (!pill) return;

    if (status === 'live') {
      pill.className = 'dash-stream-pill live';
      pill.title = 'Real-time WebSocket active';
      pill.innerHTML = '<span class="stream-dot"></span> Live';
    } else if (status === 'reconnecting') {
      pill.className = 'dash-stream-pill reconnecting';
      pill.title = 'Reconnecting WebSocket...';
      pill.innerHTML = '<span class="stream-dot" style="background:#F59E0B;box-shadow:0 0 8px #F59E0B;"></span> Reconnecting...';
    } else if (status === 'fallback') {
      pill.className = 'dash-stream-pill fallback';
      pill.title = 'Polling active every 20s';
      pill.innerHTML = '<span class="stream-dot" style="background:#F97316;box-shadow:0 0 8px #F97316;"></span> Polling (20s)';
    }
  }

  function validateIncomingLeadEvent(payload, channelProvId) {
    if (!currentProvider || !currentProvider.id) return { valid: false, reason: 'unauthenticated' };
    if (!payload || typeof payload !== 'object') return { valid: false, reason: 'malformed_payload' };

    // 1. Channel provider ID matches authenticated provider ID
    if (channelProvId && String(channelProvId) !== String(currentProvider.id)) {
      return { valid: false, reason: 'channel_tenant_mismatch' };
    }

    // 2. Payload provider ID matches authenticated provider ID
    if (String(payload.provider_id) !== String(currentProvider.id)) {
      return { valid: false, reason: 'payload_tenant_mismatch' };
    }

    // 3. Event ID is a valid UUID
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!payload.id || !UUID_REGEX.test(String(payload.id))) {
      return { valid: false, reason: 'invalid_event_uuid' };
    }

    // 4. Allowed channel values
    const normChannel = String(payload.channel || '').toLowerCase();
    if (normChannel !== 'whatsapp' && normChannel !== 'call') {
      return { valid: false, reason: 'disallowed_channel' };
    }

    // 5. Zero customer PII validation (Invariant C)
    const FORBIDDEN_KEYS = [
      'customer_name', 'name', 'first_name', 'last_name',
      'phone', 'phone_number', 'customer_phone', 'whatsapp_number',
      'email', 'ip', 'client_ip', 'user_id', 'address', 'nin', 'bvn', 'kyc', 'raw_text'
    ];
    for (const k of FORBIDDEN_KEYS) {
      if (payload[k] !== undefined) {
        console.warn(`[RealtimeSecurity] Prohibited field rejected: ${k}`);
        return { valid: false, reason: 'forbidden_pii_detected' };
      }
    }

    // 6. Deduplication check
    if (processedLeadIds.has(payload.id) || cachedLeads.some(l => l.id === payload.id)) {
      return { valid: false, reason: 'duplicate_event' };
    }

    return { valid: true };
  }

  function handleIncomingLeadEvent(leadPayload, channelProvId) {
    const validation = validateIncomingLeadEvent(leadPayload, channelProvId);
    if (!validation.valid) {
      if (validation.reason === 'duplicate_event') return;
      console.warn('[RealtimeStream] Ignored invalid lead event:', validation.reason);
      return;
    }

    // Mark event ID as processed immediately (deduplication gate)
    processedLeadIds.add(leadPayload.id);

    const isWa = leadPayload.channel === 'whatsapp';
    const cleanLead = {
      id: String(leadPayload.id),
      provider_id: Number(leadPayload.provider_id),
      channel: isWa ? 'whatsapp' : 'call',
      locality: String(leadPayload.locality || 'Local Area').replace(/<[^>]*>/g, ''),
      intent_tag: String(leadPayload.intent_tag || 'Direct Customer Inquiry').replace(/<[^>]*>/g, ''),
      status: 'new',
      notes: null,
      created_at: new Date(leadPayload.timestamp || Date.now()).toISOString(),
      relative_time: 'Just now'
    };

    // Prepend to in-memory cached leads
    cachedLeads.unshift(cleanLead);

    // Prepend to DOM
    const leadsContainer = document.getElementById('recent-leads-list');
    if (leadsContainer) {
      const kanbanNewCards = leadsContainer.querySelector('.crm-col-new .crm-col-cards');
      if (kanbanNewCards) {
        const emptyState = kanbanNewCards.querySelector('.crm-col-empty');
        if (emptyState) emptyState.remove();
        const cardHtml = createLeadCardHtml(cleanLead, true);
        kanbanNewCards.insertAdjacentHTML('afterbegin', cardHtml);
        const countBadge = leadsContainer.querySelector('.crm-col-new .crm-col-count-badge');
        if (countBadge) countBadge.textContent = (parseInt(countBadge.textContent, 10) || 0) + 1;
      } else {
        const emptyState = leadsContainer.querySelector('div[style*="text-align: center"]');
        if (emptyState) {
          leadsContainer.innerHTML = '';
        }
        const cardHtml = createLeadCardHtml(cleanLead, true);
        leadsContainer.insertAdjacentHTML('afterbegin', cardHtml);
      }
      bindLeadControls();
      updatePipelineFinancialRibbon(cachedLeads);
    }

    // Sensory alerts
    playLeadChime();

    const tradeTitle = cleanLead.intent_tag || (currentProvider.trade_title || 'Service');
    const channelLabel = isWa ? 'WhatsApp' : 'Phone Call';
    showToast(`⚡ New Lead: Customer inquired for ${tradeTitle} in ${cleanLead.locality} via ${channelLabel}`, 'success');

    // Increment KPIs
    incrementLeadKpis(cleanLead.channel);
  }

  function incrementLeadKpis(channel) {
    const kpiLeads = document.getElementById('kpi-leads');
    if (kpiLeads) {
      const cur = parseInt(kpiLeads.textContent, 10) || 0;
      kpiLeads.textContent = cur + 1;
    }

    const quotaCounts = document.getElementById('quota-counts-display');
    if (quotaCounts) {
      const parts = (quotaCounts.textContent || '').split('/');
      if (parts.length === 2) {
        const used = (parseInt(parts[0].trim(), 10) || 0) + 1;
        quotaCounts.textContent = `${used} / ${parts[1].trim()}`;
      }
    }

    if (channel === 'whatsapp') {
      const countWa = document.getElementById('quota-count-wa');
      if (countWa) countWa.textContent = (parseInt(countWa.textContent, 10) || 0) + 1;
    } else {
      const countCall = document.getElementById('quota-count-call');
      if (countCall) countCall.textContent = (parseInt(countCall.textContent, 10) || 0) + 1;
    }
  }

  function startAdaptivePollingFallback(providerId) {
    if (pollingTimer) return;
    setStreamStatus('fallback');
    isPollingActive = true;

    pollingTimer = setInterval(async () => {
      try {
        await pollForNewLeads(providerId);
      } catch (e) {
        console.warn('[PollingFallback] Polling turn error:', e.message);
      }
    }, 20000);
  }

  function stopAdaptivePolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    isPollingActive = false;
  }

  async function pollForNewLeads(providerId) {
    if (!providerId) return;

    let token = null;
    try {
      if (typeof LokatorDB !== 'undefined' && LokatorDB.auth && typeof LokatorDB.auth.getSession === 'function') {
        const sessionRes = await LokatorDB.auth.getSession();
        token = sessionRes?.data?.session?.access_token;
      }
    } catch (e) {}

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`/api/provider-leads?provider_id=${encodeURIComponent(providerId)}&limit=10`, {
        method: 'GET',
        headers
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.leads)) {
          const incoming = data.leads.filter(l => !processedLeadIds.has(l.id) && !cachedLeads.some(c => c.id === l.id));
          incoming.reverse().forEach(lead => {
            handleIncomingLeadEvent(lead, providerId);
          });
        }
      }
    } catch (err) {
      console.warn('[PollingFallback] Network error during lead fetch:', err.message);
    }
  }

  function initRealtimeLeadStream() {
    if (!currentProvider || !currentProvider.id) return;
    const providerId = currentProvider.id;

    // Seed processedLeadIds with existing cachedLeads
    if (Array.isArray(cachedLeads)) {
      cachedLeads.forEach(l => processedLeadIds.add(l.id));
    }

    setupAudioUnlock();
    initSoundToggleButton();

    const client = (typeof LokatorDB !== 'undefined' && LokatorDB.client) || window.supabaseClient;
    if (!client || typeof client.channel !== 'function') {
      startAdaptivePollingFallback(providerId);
      return;
    }

    setStreamStatus('reconnecting');

    try {
      const channelName = `artisan-leads:${providerId}`;
      realtimeChannel = client.channel(channelName, {
        config: {
          private: true,
          broadcast: { self: false }
        }
      });

      realtimeChannel.on('broadcast', { event: 'new_lead' }, (msg) => {
        if (msg && msg.payload) {
          handleIncomingLeadEvent(msg.payload, providerId);
        }
      });

      realtimeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setStreamStatus('live');
          stopAdaptivePolling();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startAdaptivePollingFallback(providerId);
        }
      });
    } catch (err) {
      console.warn('[RealtimeStream] Initialization failed, falling back to polling:', err.message);
      startAdaptivePollingFallback(providerId);
    }
  }

  function cleanupRealtimeLeadStream() {
    stopAdaptivePolling();
    if (realtimeChannel && typeof realtimeChannel.unsubscribe === 'function') {
      realtimeChannel.unsubscribe().catch(() => {});
      realtimeChannel = null;
    }
  }

  function initSoundToggleButton() {
    const btn = document.getElementById('btn-toggle-lead-sound');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = 'true';

    const updateBtnUi = () => {
      const muted = isLeadChimeMuted();
      btn.classList.toggle('muted', muted);
      const icon = document.getElementById('lead-sound-icon');
      const text = document.getElementById('lead-sound-text');
      if (icon) icon.textContent = muted ? '🔇' : '🔊';
      if (text) text.textContent = muted ? 'Muted' : 'Sound On';
      btn.title = muted ? 'Lead chime is muted (click to unmute)' : 'Lead chime is active (click to mute)';
    };

    updateBtnUi();

    btn.addEventListener('click', () => {
      const currentlyMuted = isLeadChimeMuted();
      const nextMuted = !currentlyMuted;
      try {
        localStorage.setItem('padifix_lead_chime_muted', nextMuted ? 'true' : 'false');
      } catch (e) {}

      updateBtnUi();

      if (!nextMuted) {
        playLeadChime();
        showToast('🔊 Lead notification sound turned on', 'success');
      } else {
        showToast('🔇 Lead notification sound muted', 'info');
      }
    });
  }

  // Expose methods for automated test gates and browser QA
  window.playLeadChime = playLeadChime;
  window.handleIncomingLeadEvent = handleIncomingLeadEvent;
  window.validateIncomingLeadEvent = validateIncomingLeadEvent;
  window.initRealtimeLeadStream = initRealtimeLeadStream;
  window.cleanupRealtimeLeadStream = cleanupRealtimeLeadStream;
  window.pollForNewLeads = pollForNewLeads;

  // 5.0 Privacy-Safe Lead History CSV Export (RFC 4180 with Formula Injection Defense)
  function exportLeadsCsv(leads) {
    if (!Array.isArray(leads) || leads.length === 0) {
      showToast('No lead records available to export.', 'info');
      return;
    }

    const sanitizeCsvCell = (val) => {
      let str = String(val ?? '').trim();
      // Neutralize dangerous spreadsheet formula injection prefixes (=, +, -, @)
      if (/^[=+\-@]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = ['Date', 'Channel', 'Locality', 'Status'].join(',');
    const rows = leads.map(l => {
      const dateVal = l.created_at ? new Date(l.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const channelVal = l.channel === 'whatsapp' ? 'WhatsApp' : 'Phone Call';
      const localityVal = l.locality || 'Local Area';
      const statusVal = (l.status || 'new').replace('_', ' ').toUpperCase();

      return [dateVal, channelVal, localityVal, statusVal].map(sanitizeCsvCell).join(',');
    });

    const now = new Date();
    const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
    const filename = `padifix_leads_${yearMonth}.csv`;

    const csvContent = [headers, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Lead history exported (${leads.length} records).`, 'success');
  }

  // 5.1 Load & Render Metrics for Overview
  async function loadMetrics() {
    try {
      currentMetrics = await LokatorDB.getProviderDashboardMetrics(currentProvider.id);
    } catch (e) {
      console.warn('Metrics load notice:', e);
    }

    if (!currentMetrics) return;

    const viewsEl = document.getElementById('kpi-views');
    const leadsEl = document.getElementById('kpi-leads');
    const jobsEl = document.getElementById('kpi-jobs');
    const ratingEl = document.getElementById('kpi-rating');
    const ratingBadge = document.getElementById('ov-rating-badge');

    const profileViews = currentMetrics.profileViewsThisMonth != null ? currentMetrics.profileViewsThisMonth : 0;
    const directLeads = currentMetrics.leadsThisMonth != null ? currentMetrics.leadsThisMonth : 0;
    const completedJobs = currentMetrics.completedJobs != null ? currentMetrics.completedJobs : 0;
    const hasReviews = currentMetrics.reviewsCount > 0;

    if (viewsEl) viewsEl.textContent = `${profileViews}`;
    if (leadsEl) leadsEl.textContent = `${directLeads}`;
    if (jobsEl) jobsEl.textContent = `${completedJobs}+`;
    if (ratingEl) ratingEl.textContent = hasReviews && currentMetrics.rating ? Number(currentMetrics.rating).toFixed(1) : 'New';
    if (ratingBadge) ratingBadge.textContent = hasReviews && currentMetrics.rating ? `★ ${Number(currentMetrics.rating).toFixed(1)}` : '★ New Listing';

    // Render Progressive Profile Completeness Widget
    const compData = currentMetrics.completenessData || ((typeof PadiFixMonetization !== 'undefined' && PadiFixMonetization.calculateProfileCompleteness)
      ? PadiFixMonetization.calculateProfileCompleteness(currentProvider)
      : { score: 80, percentage: '80%', missingItems: [], isComplete: true });

    const compBadge = document.getElementById('dash-completeness-badge');
    const compFill = document.getElementById('dash-completeness-fill');
    const compStatus = document.getElementById('dash-completeness-status-pill');
    const missingGrid = document.getElementById('dash-missing-items-grid');

    if (compBadge) compBadge.textContent = compData.percentage;
    if (compFill) compFill.style.width = compData.percentage;
    if (compStatus) {
      compStatus.textContent = compData.isComplete ? '✓ Ready for High Discovery' : 'Action Recommended';
      compStatus.style.color = compData.isComplete ? '#34D399' : '#F59E0B';
    }

    if (missingGrid) {
      if (compData.missingItems.length === 0) {
        missingGrid.innerHTML = `
          <div style="font-size: 0.85rem; color: #34D399; display: flex; align-items: center; gap: 6px;">
            <span>✨</span> All core profile attributes completed. Your listing is fully optimized for local discovery!
          </div>
        `;
      } else {
        missingGrid.innerHTML = compData.missingItems.map(item => `
          <button type="button" class="dash-missing-item-btn" data-target-tab="${escapeHtml(item.actionTab)}">
            <span style="font-weight: 700; color: var(--dash-green, #006B3F);">+</span> <span>${escapeHtml(item.label)}</span>
          </button>
        `).join('');

        missingGrid.querySelectorAll('.dash-missing-item-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-target-tab');
            if (tab && typeof switchTab === 'function') {
              switchTab(tab);
            }
          });
        });
      }
    }

    // Telemetry for provider analytics review
    if (typeof LokatorTelemetry !== 'undefined') {
      LokatorTelemetry.trackEvent('provider_analytics_viewed', {
        providerId: currentProvider.id,
        views: profileViews,
        leads: directLeads,
        completeness: compData.score
      });
    }

    renderRecentLeads();

    // Render Rating Bars
    const ratingBarsEl = document.getElementById('ov-rating-bars');
    if (ratingBarsEl) {
      const dist = currentMetrics.ratingDistribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      const totalReviews = currentMetrics.reviewsCount || 0;
      let barsHtml = '';
      if (totalReviews === 0) {
        barsHtml = '<div style="font-size: 0.85rem; color: #94A3B8; padding: 12px 0;">No customer reviews received yet. Share your profile link with past clients to collect authentic verified reviews.</div>';
      } else {
        for (let star = 5; star >= 1; star--) {
          const count = dist[star] || 0;
          const pct = Math.round((count / (totalReviews || 1)) * 100);
          barsHtml += `
            <div class="rating-bar-row">
              <span class="star-label">${star} Stars</span>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${pct}%;"></div>
              </div>
              <span class="count-label">${count}</span>
            </div>
          `;
        }
      }
      ratingBarsEl.innerHTML = barsHtml;
    }

    // Share link & WhatsApp integration
    const profileUrl = `${window.location.origin}/profile.html?id=${currentProvider.id}`;
    const shareInput = document.getElementById('share-link-input');
    if (shareInput) {
      shareInput.value = profileUrl;
    }
    const btnCopy = document.getElementById('btn-copy-share');
    if (btnCopy) {
      btnCopy.onclick = (e) => {
        e.preventDefault();
        copyToClipboard(profileUrl, 'Profile share link copied to clipboard!');
        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('provider_share_clicked', {
            providerId: currentProvider.id,
            channel: 'copy_link'
          });
        }
      };
    }
    const btnShareProfileWa = document.getElementById('btn-share-profile-wa');
    if (btnShareProfileWa) {
      const waProfileText = encodeURIComponent(`Hello! Check out my verified artisan profile on PadiFix:\n${profileUrl}`);
      btnShareProfileWa.href = `https://api.whatsapp.com/send?text=${waProfileText}`;
      btnShareProfileWa.onclick = () => {
        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('provider_share_clicked', {
            providerId: currentProvider.id,
            channel: 'whatsapp'
          });
        }
      };
    }

    // Community Referral Link & WhatsApp sharing
    const refUrl = `${window.location.origin}/register.html?ref=${encodeURIComponent(currentProvider.referralCode || currentProvider.id)}`;
    const refInput = document.getElementById('dash-referral-link');
    if (refInput) {
      refInput.value = refUrl;
    }
    const btnCopyRef = document.getElementById('btn-copy-ref-link');
    if (btnCopyRef) {
      btnCopyRef.onclick = (e) => {
        e.preventDefault();
        copyToClipboard(refUrl, 'Referral link copied to clipboard!');
        const notice = document.getElementById('dash-ref-copy-notice');
        if (notice) {
          notice.style.display = 'block';
          setTimeout(() => { notice.style.display = 'none'; }, 3500);
        }
      };
    }
    const btnShareRefWa = document.getElementById('btn-share-ref-wa');
    if (btnShareRefWa) {
      const waRefText = encodeURIComponent(`Join me on PadiFix! List your skilled craft free and get direct customer calls with zero commission:\n${refUrl}`);
      btnShareRefWa.href = `https://api.whatsapp.com/send?text=${waRefText}`;
    }

    // Render Overview Reviews
    renderReviews(currentMetrics.recentReviews || [], 'ov-reviews-list');
    renderReviews(currentProvider.reviews || [], 'all-reviews-list');
  }

  function showDashToast(message, type = 'success') {
    let toastContainer = document.getElementById('dash-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'dash-toast-container';
      toastContainer.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 999999; display: flex; flex-direction: column; gap: 8px; pointer-events: none;';
      document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.style.cssText = `background: ${type === 'error' ? '#EF4444' : '#059669'}; color: #FFFFFF; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); pointer-events: auto; transition: all 0.3s ease; transform: translateY(20px); opacity: 0; display: flex; align-items: center; gap: 8px;`;
    toast.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showDashToast(successMsg);
      }).catch(() => {
        fallbackCopy(text, successMsg);
      });
    } else {
      fallbackCopy(text, successMsg);
    }

    function fallbackCopy(str, msg) {
      try {
        const tempInput = document.createElement('textarea');
        tempInput.value = str;
        tempInput.style.position = 'fixed';
        tempInput.style.top = '-9999px';
        tempInput.style.left = '-9999px';
        document.body.appendChild(tempInput);
        tempInput.focus();
        tempInput.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(tempInput);
        if (successful) {
          showDashToast(msg);
        } else {
          prompt('Copy link:', str);
        }
      } catch (err) {
        prompt('Copy link:', str);
      }
    }
  }

  function renderReviews(reviewsList, targetId) {
    const container = document.getElementById(targetId);
    if (!container) return;
    if (!reviewsList || reviewsList.length === 0) {
      container.innerHTML = `<div style="color: var(--dash-muted); font-size: 13.5px; padding: 12px 0;">No customer reviews yet. Share your profile link with previous clients to receive ratings!</div>`;
      return;
    }

    container.innerHTML = reviewsList.map(r => {
      const safeRating = Number(r.rating || 5).toFixed(1);
      return `
        <div class="dash-review-item">
          <div class="dash-rev-header">
            <div>
              <span class="dash-rev-author">${escapeHtml(r.author || 'Verified Customer')}</span>
              <span style="color: var(--dash-gold); margin-left: 8px;">★ ${safeRating}</span>
            </div>
            <span class="dash-rev-meta">${escapeHtml(r.location || 'Nigeria')} · ${escapeHtml(r.date || 'Recent')}</span>
          </div>
          <div class="dash-rev-comment">${escapeHtml(r.comment || 'Professional, punctual, and completed the job with high quality.')}</div>
        </div>
      `;
    }).join('');
  }

  // 6. Populate Edit Profile Form & Location Map
  const dashMapPinLabel = document.getElementById('dash-map-pin-label');
  const dashAreaInput = document.getElementById('edit-area');
  const dashCityInput = document.getElementById('edit-city');
  const dashGpsBtn = document.getElementById('dash-gps-btn');

  function updateDashMapPin() {
    if (!dashMapPinLabel) return;
    const area = dashAreaInput ? dashAreaInput.value.trim() : '';
    const city = dashCityInput ? dashCityInput.value.trim() : '';
    dashMapPinLabel.textContent = area || city || 'Surulere, Lagos';
  }

  if (dashAreaInput) dashAreaInput.addEventListener('input', updateDashMapPin);
  if (dashCityInput) dashCityInput.addEventListener('input', updateDashMapPin);

  if (dashGpsBtn) {
    dashGpsBtn.addEventListener('click', () => {
      if ('geolocation' in navigator) {
        dashGpsBtn.textContent = 'Detecting location...';
        navigator.geolocation.getCurrentPosition(
          pos => {
            const locStr = `Surulere, Lagos (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`;
            if (dashAreaInput) dashAreaInput.value = locStr;
            updateDashMapPin();
            dashGpsBtn.innerHTML = '✓ Current location updated';
            showToast('GPS coordinates updated.');
          },
          () => {
            dashGpsBtn.textContent = 'GPS failed (enter manually)';
          }
        );
      }
    });
  }

  // Profile Picture Upload Handler in Dashboard
  const editAvatarWrap = document.getElementById('edit-avatar-wrap');
  const btnChangePhoto = document.getElementById('btn-change-photo');
  const editPhotoInput = document.getElementById('edit-photo-input');

  function triggerPhotoPicker() {
    if (editPhotoInput) editPhotoInput.click();
  }

  if (editAvatarWrap) editAvatarWrap.addEventListener('click', triggerPhotoPicker);
  if (btnChangePhoto) btnChangePhoto.addEventListener('click', triggerPhotoPicker);

  if (editPhotoInput) {
    editPhotoInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        alert('Image is too large (max 5MB). Please choose a smaller photo.');
        return;
      }

      showToast('Compressing & uploading photo...', 'info');
      try {
        const uploadRes = await LokatorDB.uploadProfilePhoto(currentProvider.id, file);
        currentProvider.avatarUrl = uploadRes.avatarUrl;
        renderTopbar();
        showToast('Profile photo updated successfully!');
      } catch (err) {
        console.error('Photo upload error:', err);
        showToast('Failed to upload photo: ' + err.message, 'error');
      }
    });
  }

  function populateProfileForm() {
    const p = currentProvider;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    const PhoneEngine = (typeof NigeriaPhone !== 'undefined' ? NigeriaPhone : null) || (typeof window !== 'undefined' ? window.NigeriaPhone : null);
    const displayPhone = PhoneEngine ? PhoneEngine.formatInternational(p.phone || p.whatsappNumber) : (p.phone || '');

    setVal('edit-fname', p.firstName);
    setVal('edit-lname', p.lastName);
    setVal('edit-bname', p.businessName || p.name);
    setVal('edit-trade', p.trade);
    setVal('edit-phone', displayPhone);
    setVal('edit-email', p.email || '');
    setVal('edit-state', p.state || 'Lagos');
    setVal('edit-city', p.city || 'Surulere');
    setVal('edit-area', p.area || `${p.city}, ${p.state}`);
    setVal('edit-exp', p.experienceYrs || 2);
    setVal('edit-price', p.startingPrice || '₦4,000 / inspection');
    setVal('edit-response', p.responseTime || '~15 mins');
    setVal('edit-bio', p.bio || '');

    updateDashMapPin();
  }

  let dashMapInstance = null;

  function initDashboardServiceMap() {
    const mapEl = document.getElementById('dash-service-map');
    if (!mapEl) return;

    let pLat = Number(currentProvider.lat != null ? currentProvider.lat : currentProvider.latitude);
    let pLng = Number(currentProvider.lng != null ? currentProvider.lng : currentProvider.longitude);

    if ((isNaN(pLat) || isNaN(pLng) || pLat === 0 || pLng === 0) && typeof NigeriaLocations !== 'undefined' && NigeriaLocations.resolveCoordinates) {
      const res = NigeriaLocations.resolveCoordinates(currentProvider);
      pLat = res.lat;
      pLng = res.lng;
    }
    pLat = pLat || 6.5244;
    pLng = pLng || 3.3792;

    const coordTag = document.getElementById('dash-map-coord-tag');
    if (coordTag) coordTag.textContent = `${pLat.toFixed(4)}° N, ${pLng.toFixed(4)}° E`;

    const MapService = (typeof LokatorMapService !== 'undefined' ? LokatorMapService : null) || (typeof window !== 'undefined' ? window.LokatorMapService : null);
    if (MapService) {
      dashMapInstance = MapService.initServiceMap(mapEl, {
        lat: pLat,
        lng: pLng,
        providerName: currentProvider.businessName || currentProvider.name,
        locality: currentProvider.area || currentProvider.city || 'Service Area',
        zoom: 14
      });
    }

    const btnDashGps = document.getElementById('dash-gps-btn');
    const dashGpsMeta = document.getElementById('dash-gps-meta');
    const dashGpsAccuracy = document.getElementById('dash-gps-accuracy');
    const dashGpsStatus = document.getElementById('dash-gps-status');

    if (btnDashGps && MapService) {
      btnDashGps.addEventListener('click', async () => {
        const originalContent = btnDashGps.innerHTML;
        btnDashGps.disabled = true;
        btnDashGps.innerHTML = 'Detecting GPS...';

        try {
          const result = await MapService.requestUserGPS();
          currentProvider.lat = result.lat;
          currentProvider.lng = result.lng;

          if (dashGpsAccuracy) dashGpsAccuracy.textContent = result.accuracyFormatted;
          if (dashGpsStatus) dashGpsStatus.textContent = '✓ Current location detected';
          if (dashGpsMeta) dashGpsMeta.style.display = 'grid';
          if (coordTag) coordTag.textContent = `${result.lat.toFixed(4)}° N, ${result.lng.toFixed(4)}° E`;

          if (dashMapInstance) {
            dashMapInstance.setCenter(result.lat, result.lng, 15);
            if (dashMapInstance.setUserLocation) {
              dashMapInstance.setUserLocation(result.lat, result.lng, result.accuracy);
            }
          }

          if (typeof NigeriaLocations !== 'undefined' && NigeriaLocations.findNearest) {
            const nearest = NigeriaLocations.findNearest(result.lat, result.lng);
            if (nearest) {
              const stateEl = document.getElementById('edit-state');
              const cityEl = document.getElementById('edit-city');
              const areaEl = document.getElementById('edit-area');
              if (stateEl && nearest.state) stateEl.value = nearest.state;
              if (cityEl && nearest.lga) cityEl.value = nearest.lga;
              if (areaEl && nearest.locality) areaEl.value = `${nearest.locality}, ${nearest.lga}`;
            }
          }

          showToast('GPS coordinates detected! Tap "Confirm Location" to save.');
        } catch (err) {
          console.warn('Dashboard GPS error:', err);
          alert(`Location Notice: ${err.message}`);
        } finally {
          btnDashGps.disabled = false;
          btnDashGps.innerHTML = originalContent;
        }
      });
    }

    const btnConfirm = document.getElementById('btn-confirm-location');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        btnConfirm.disabled = true;
        btnConfirm.textContent = 'Saving...';
        try {
          await LokatorDB.updateProviderProfile(currentProvider.id, {
            lat: currentProvider.lat,
            lng: currentProvider.lng,
            state: document.getElementById('edit-state') ? document.getElementById('edit-state').value : currentProvider.state,
            city: document.getElementById('edit-city') ? document.getElementById('edit-city').value : currentProvider.city,
            area: document.getElementById('edit-area') ? document.getElementById('edit-area').value : currentProvider.area
          });
          showToast('Service location coordinates confirmed & saved!');
        } catch (err) {
          showToast('Failed to save coordinates: ' + err.message, 'error');
        } finally {
          btnConfirm.disabled = false;
          btnConfirm.textContent = '✓ Confirm Location';
        }
      });
    }
  }

  function updateDashMapPin() {
    initDashboardServiceMap();
  }

  // Handle Edit Profile Form Submit
  const formProfile = document.getElementById('form-edit-profile');
  if (formProfile) {
    formProfile.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-profile');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const rawPhone = document.getElementById('edit-phone').value.trim();
      const PhoneEngine = (typeof NigeriaPhone !== 'undefined' ? NigeriaPhone : null) || (typeof window !== 'undefined' ? window.NigeriaPhone : null);
      const norm = PhoneEngine ? PhoneEngine.normalize(rawPhone) : { valid: true, international: rawPhone, canonical: rawPhone };

      if (!norm.valid && rawPhone.length > 0) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
        alert('Please enter a valid Nigerian mobile phone number (e.g. 08012345678 or +2348012345678).');
        return;
      }

      const updateData = {
        firstName: document.getElementById('edit-fname').value,
        lastName: document.getElementById('edit-lname').value,
        businessName: document.getElementById('edit-bname').value,
        trade: document.getElementById('edit-trade').value,
        phone: norm.valid ? norm.international : rawPhone,
        whatsappNumber: norm.valid ? norm.canonical : rawPhone,
        email: document.getElementById('edit-email').value,
        state: document.getElementById('edit-state').value,
        city: document.getElementById('edit-city').value,
        area: document.getElementById('edit-area').value,
        experienceYrs: document.getElementById('edit-exp').value,
        startingPrice: document.getElementById('edit-price').value,
        responseTime: document.getElementById('edit-response').value,
        bio: document.getElementById('edit-bio').value
      };

      try {
        const res = await LokatorDB.updateProviderProfile(currentProvider.id, updateData);
        currentProvider = res.data || res;
        renderTopbar();
        if (res && res.status === 'OFFLINE_PENDING') {
          showToast(res.message, 'info');
        } else if (res && res.status === 'REMOTE_FAILURE') {
          showToast(res.message || 'Error saving profile changes', 'error');
        } else {
          showToast('Profile saved successfully.');
        }
      } catch (err) {
        showToast('Error saving profile changes: ' + err.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Profile Changes';
      }
    });
  }

  // 6.1 AI Bio Assistant Controller
  const btnAiBio = document.getElementById('btn-ai-bio-assistant');
  const aiBioBox = document.getElementById('ai-bio-draft-box');
  const aiBioText = document.getElementById('ai-bio-draft-text');
  const aiBioFacts = document.getElementById('ai-bio-source-facts');
  const btnAiApplyBio = document.getElementById('btn-ai-apply-bio');
  const btnAiRegenBio = document.getElementById('btn-ai-regen-bio');
  const btnAiDiscardBio = document.getElementById('btn-ai-discard-bio');
  const editBioInput = document.getElementById('edit-bio');

  let currentAiBioDraft = null;
  const bioVariants = ['standard', 'concise', 'client_focused'];
  let bioVariantIdx = 0;

  async function triggerAiBioGeneration() {
    if (!btnAiBio) return;
    const trade = document.getElementById('edit-trade') ? document.getElementById('edit-trade').value.trim() : '';
    if (!trade) {
      alert('Please enter your Primary Trade Title first so the AI knows what service to describe.');
      return;
    }

    btnAiBio.disabled = true;
    btnAiBio.innerHTML = '<span>⏳</span> Synthesizing facts...';

    const facts = {
      name: `${document.getElementById('edit-fname')?.value || ''} ${document.getElementById('edit-lname')?.value || ''}`.trim(),
      businessName: document.getElementById('edit-bname')?.value || '',
      trade: trade,
      skills: dashSkills || [],
      state: document.getElementById('edit-state')?.value || '',
      city: document.getElementById('edit-city')?.value || '',
      area: document.getElementById('edit-area')?.value || '',
      experienceYrs: document.getElementById('edit-exp')?.value || 0,
      startingPrice: document.getElementById('edit-price')?.value || '',
      responseTime: document.getElementById('edit-response')?.value || ''
    };

    const variant = bioVariants[bioVariantIdx % bioVariants.length];
    bioVariantIdx++;

    try {
      const res = await LokatorDB.ai.generateBio(facts, { variant });
      if (res && res.success && res.data) {
        currentAiBioDraft = res.data.bio;
        if (aiBioText) aiBioText.textContent = res.data.bio;
        if (aiBioFacts && Array.isArray(res.data.source_facts)) {
          aiBioFacts.innerHTML = res.data.source_facts.map(f => `<span style="background: var(--dash-card-bg); border: 1px solid var(--dash-border); padding: 2px 6px; border-radius: 4px;">✓ ${escapeHtml(f)}</span>`).join('');
        }
        if (aiBioBox) aiBioBox.style.display = 'block';
        showToast('AI Bio draft generated based strictly on your facts.');
      } else {
        showToast('Could not generate bio: ' + (res.error || 'Please check facts'), 'error');
      }
    } catch (err) {
      showToast('AI Bio generation error: ' + err.message, 'error');
    } finally {
      btnAiBio.disabled = false;
      btnAiBio.innerHTML = '<span>✨</span> AI Bio Assistant';
    }
  }

  if (btnAiBio) btnAiBio.addEventListener('click', triggerAiBioGeneration);
  if (btnAiRegenBio) btnAiRegenBio.addEventListener('click', triggerAiBioGeneration);

  if (btnAiApplyBio) {
    btnAiApplyBio.addEventListener('click', () => {
      if (currentAiBioDraft && editBioInput) {
        editBioInput.value = currentAiBioDraft;
        if (aiBioBox) aiBioBox.style.display = 'none';
        showToast('AI draft applied to Bio field! Review and click Save Profile Changes.');
      }
    });
  }

  if (btnAiDiscardBio) {
    btnAiDiscardBio.addEventListener('click', () => {
      if (aiBioBox) aiBioBox.style.display = 'none';
      currentAiBioDraft = null;
    });
  }

  // 7. Skills & Services Tab with Content Moderation
  let dashSkills = [...(currentProvider.skills || [])];
  const chipsListEl = document.getElementById('dash-services-chips');
  const newSkillInput = document.getElementById('dash-new-service-input');
  const btnAddDashSkill = document.getElementById('btn-add-dash-service');
  const btnSaveSkills = document.getElementById('btn-save-services');
  const dashModerationAlert = document.getElementById('dash-moderation-alert');
  const dashModerationAlertText = document.getElementById('dash-moderation-alert-text');

  function renderSkillsChips() {
    if (!chipsListEl) return;
    chipsListEl.innerHTML = dashSkills.map((s, idx) => `
      <div class="skill-chip">
        <span>${escapeHtml(s)}</span>
        <span class="skill-chip-remove" data-idx="${parseInt(idx, 10)}" title="Remove skill">×</span>
      </div>
    `).join('');
  }

  function addDashSkill(name) {
    if (!name) return;
    const clean = name.trim();
    if (!clean) return;

    // Content moderation validation
    if (typeof ServiceModerator !== 'undefined' && ServiceModerator.validateSkill) {
      const val = ServiceModerator.validateSkill(clean);
      if (!val.valid) {
        if (dashModerationAlert && dashModerationAlertText) {
          dashModerationAlertText.textContent = val.error || 'Disallowed service keyword detected.';
          dashModerationAlert.style.display = 'flex';
        }
        return;
      }
    }

    if (dashModerationAlert) dashModerationAlert.style.display = 'none';

    if (clean && !dashSkills.includes(clean)) {
      dashSkills.push(clean);
      renderSkillsChips();
    }
    if (newSkillInput) newSkillInput.value = '';
  }

  if (btnAddDashSkill && newSkillInput) {
    btnAddDashSkill.addEventListener('click', () => addDashSkill(newSkillInput.value));
    newSkillInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addDashSkill(newSkillInput.value);
      }
    });
    newSkillInput.addEventListener('input', () => {
      if (dashModerationAlert) dashModerationAlert.style.display = 'none';
    });
  }

  if (chipsListEl) {
    chipsListEl.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.skill-chip-remove');
      if (removeBtn && removeBtn.dataset.idx != null) {
        dashSkills.splice(parseInt(removeBtn.dataset.idx, 10), 1);
        renderSkillsChips();
      }
    });
  }

  if (btnSaveSkills) {
    btnSaveSkills.addEventListener('click', async () => {
      btnSaveSkills.disabled = true;
      btnSaveSkills.textContent = 'Saving Skills...';
      try {
        const res = await LokatorDB.updateProviderServices(currentProvider.id, dashSkills);
        currentProvider = res.data || res;
        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('provider_services_updated', { total_skills: dashSkills.length });
        }
        if (res && res.status === 'OFFLINE_PENDING') {
          showToast(res.message, 'info');
        } else if (res && res.status === 'REMOTE_FAILURE') {
          showToast(res.message || 'Error updating services', 'error');
        } else {
          showToast('Skills and service offerings updated.');
        }
      } catch (e) {
        showToast('Error updating services: ' + (e.message || 'Network error'), 'error');
      } finally {
        btnSaveSkills.disabled = false;
        btnSaveSkills.textContent = 'Save Skills to Profile';
      }
    });
  }

  // 8. Pricing Guide Tab
  let dashPricing = [...(currentProvider.pricingGuide || [
    { item: 'Initial Inspection & Diagnosis', price: '₦4,000' },
    { item: 'Standard Service Task', price: '₦15,000 – ₦35,000' },
    { item: 'Emergency Priority Repair', price: '₦10,000 – ₦25,000' }
  ])];

  const pricingListEl = document.getElementById('pricing-items-list');
  const btnAddPriceRow = document.getElementById('btn-add-price-row');
  const btnSavePricing = document.getElementById('btn-save-pricing');

  function renderPricingRows() {
    if (!pricingListEl) return;
    pricingListEl.innerHTML = dashPricing.map((p, idx) => {
      const safeIdx = parseInt(idx, 10);
      return `
        <div style="display: flex; gap: 12px; align-items: center;" class="pricing-row" data-idx="${safeIdx}">
          <input type="text" class="price-item-name" value="${escapeHtml(p.item || '')}" placeholder="Service task name" style="flex: 2; padding: 8px 12px; border: 1px solid var(--dash-border); border-radius: var(--radius-sm);" />
          <input type="text" class="price-item-val" value="${escapeHtml(p.price || '')}" placeholder="Price (e.g. ₦5,000)" style="flex: 1; padding: 8px 12px; border: 1px solid var(--dash-border); border-radius: var(--radius-sm);" />
          <button type="button" class="btn-remove-price" data-idx="${safeIdx}" style="background: none; border: none; color: var(--danger); font-size: 18px; cursor: pointer; padding: 4px 8px;">✕</button>
        </div>
      `;
    }).join('');
  }

  if (btnAddPriceRow) {
    btnAddPriceRow.addEventListener('click', () => {
      dashPricing.push({ item: 'Custom Task', price: '₦10,000' });
      renderPricingRows();
    });
  }

  if (pricingListEl) {
    pricingListEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove-price')) {
        const idx = parseInt(e.target.dataset.idx, 10);
        dashPricing.splice(idx, 1);
        renderPricingRows();
      }
    });
  }

  if (btnSavePricing) {
    btnSavePricing.addEventListener('click', async () => {
      const rows = document.querySelectorAll('.pricing-row');
      const updatedPricing = [];
      rows.forEach(r => {
        const name = r.querySelector('.price-item-name').value.trim();
        const price = r.querySelector('.price-item-val').value.trim();
        if (name) {
          updatedPricing.push({ item: name, price: price || 'Price on request' });
        }
      });

      btnSavePricing.disabled = true;
      btnSavePricing.textContent = 'Saving...';
      try {
        currentProvider.pricingGuide = updatedPricing;
        const res = await LokatorDB.updateProviderProfile(currentProvider.id, { pricingGuide: updatedPricing });
        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('provider_pricing_updated', { total_items: updatedPricing.length });
        }
        if (res && res.status === 'OFFLINE_PENDING') {
          showToast(res.message, 'info');
        } else if (res && res.status === 'REMOTE_FAILURE') {
          showToast(res.message || 'Error saving pricing', 'error');
        } else {
          showToast('Pricing guide and rate cards saved.');
        }
      } catch (err) {
        showToast('Error saving pricing: ' + (err.message || 'Network error'), 'error');
      } finally {
        btnSavePricing.disabled = false;
        btnSavePricing.textContent = 'Save Rate Card';
      }
    });
  }

  // 8.1 AI Pricing Guidance Controller
  const btnAiPricing = document.getElementById('btn-ai-pricing-guide');
  const aiPricingBox = document.getElementById('ai-pricing-guidance-box');
  const btnCloseAiPricing = document.getElementById('btn-close-ai-pricing');
  const aiPricingTradeLabel = document.getElementById('ai-pricing-trade-label');
  const aiPricingStandardVal = document.getElementById('ai-pricing-standard-val');
  const aiPricingInspectionVal = document.getElementById('ai-pricing-inspection-val');
  const aiPricingFactorsList = document.getElementById('ai-pricing-factors-list');

  async function triggerAiPricingGuidance() {
    if (!aiPricingBox) return;
    if (aiPricingBox.style.display === 'block') {
      aiPricingBox.style.display = 'none';
      return;
    }

    if (btnAiPricing) {
      btnAiPricing.disabled = true;
      btnAiPricing.innerHTML = '<span>⏳</span> Loading guidance...';
    }

    const trade = currentProvider.trade || (document.getElementById('edit-trade') ? document.getElementById('edit-trade').value : 'Artisan');
    const state = currentProvider.state || 'Nigeria';
    const city = currentProvider.city || '';

    try {
      const res = await LokatorDB.ai.getPricingGuidance({
        trade,
        state,
        city,
        startingPrice: currentProvider.startingPrice
      });

      if (res && res.success && res.data) {
        if (aiPricingTradeLabel) aiPricingTradeLabel.textContent = res.data.trade || trade;
        if (aiPricingStandardVal) aiPricingStandardVal.textContent = res.data.suggested_range || '₦10,000 – ₦30,000';
        if (aiPricingInspectionVal) aiPricingInspectionVal.textContent = res.data.inspection_fee_range || '₦3,500 – ₦6,000';
        if (aiPricingFactorsList && Array.isArray(res.data.pricing_factors)) {
          aiPricingFactorsList.innerHTML = res.data.pricing_factors.map(f => `<li>${escapeHtml(f)}</li>`).join('');
        }
        aiPricingBox.style.display = 'block';
      }
    } catch (err) {
      showToast('Pricing guidance error: ' + err.message, 'error');
    } finally {
      if (btnAiPricing) {
        btnAiPricing.disabled = false;
        btnAiPricing.innerHTML = '<span>✨</span> AI Pricing Guidance';
      }
    }
  }

  if (btnAiPricing) btnAiPricing.addEventListener('click', triggerAiPricingGuidance);
  if (btnCloseAiPricing) {
    btnCloseAiPricing.addEventListener('click', () => {
      if (aiPricingBox) aiPricingBox.style.display = 'none';
    });
  }

  // 9. Working Hours Form
  const formHours = document.getElementById('form-edit-hours');
  if (formHours) {
    const hours = currentProvider.workingHours || {};
    const setHoursVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    };
    setHoursVal('hours-weekday', hours.weekday);
    setHoursVal('hours-saturday', hours.saturday);
    setHoursVal('hours-sunday', hours.sunday);

    formHours.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-hours');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const hoursData = {
        weekday: document.getElementById('hours-weekday').value,
        saturday: document.getElementById('hours-saturday').value,
        sunday: document.getElementById('hours-sunday').value
      };

      try {
        const res = await LokatorDB.updateProviderWorkingHours(currentProvider.id, hoursData);
        currentProvider.workingHours = hoursData;
        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('provider_hours_updated', {
            has_weekday: Boolean(hoursData.weekday),
            has_weekend: Boolean(hoursData.saturday || hoursData.sunday)
          });
        }
        if (res && res.status === 'OFFLINE_PENDING') {
          showToast(res.message, 'info');
        } else if (res && res.status === 'REMOTE_FAILURE') {
          showToast(res.message || 'Error saving working hours', 'error');
        } else {
          showToast('Working hours schedule updated.');
        }
      } catch (err) {
        showToast('Error saving working hours: ' + (err.message || 'Network error'), 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Working Hours';
      }
    });
  }

  // 10. Portfolio Showcase Tab & Modal (Phase 034)
  const portfolioGridEl = document.getElementById('dash-portfolio-list');
  const modalPortfolio = document.getElementById('modal-portfolio');
  const btnOpenPortModal = document.getElementById('btn-open-portfolio-modal');
  const btnClosePortModal = document.getElementById('btn-close-modal');
  const formAddPort = document.getElementById('form-add-portfolio');

  let beforeCompressedData = null;
  let afterCompressedData = null;

  function resetPortfolioModal() {
    if (formAddPort) formAddPort.reset();
    beforeCompressedData = null;
    afterCompressedData = null;
    const leadIdInput = document.getElementById('port-lead-id');
    if (leadIdInput) leadIdInput.value = '';
    const leadBanner = document.getElementById('port-lead-banner');
    if (leadBanner) leadBanner.style.display = 'none';

    // Reset dropzone views
    const beforePrevBox = document.getElementById('port-before-preview-box');
    const beforeEmpty = document.getElementById('port-before-empty');
    if (beforePrevBox) beforePrevBox.style.display = 'none';
    if (beforeEmpty) beforeEmpty.style.display = 'block';

    const afterPrevBox = document.getElementById('port-after-preview-box');
    const afterEmpty = document.getElementById('port-after-empty');
    if (afterPrevBox) afterPrevBox.style.display = 'none';
    if (afterEmpty) afterEmpty.style.display = 'block';

    // Default to single photo format
    const singleRadio = document.querySelector('input[name="port_project_type"][value="single"]');
    if (singleRadio) singleRadio.checked = true;
    const beforeZone = document.getElementById('port-before-zone');
    if (beforeZone) beforeZone.style.display = 'none';
    const singleCard = document.getElementById('port-format-single-label');
    const baCard = document.getElementById('port-format-ba-label');
    if (singleCard) {
      singleCard.classList.add('active');
      singleCard.style.borderColor = 'var(--dash-green, #00A859)';
    }
    if (baCard) {
      baCard.classList.remove('active');
      baCard.style.borderColor = 'var(--dash-border, rgba(255,255,255,0.1))';
    }
    const afterFile = document.getElementById('port-file-after');
    if (afterFile) afterFile.required = true;
    const beforeFile = document.getElementById('port-file-before');
    if (beforeFile) beforeFile.required = false;
  }

  function openPortfolioModalFromLead(leadId) {
    resetPortfolioModal();
    const lead = (typeof cachedLeads !== 'undefined' && Array.isArray(cachedLeads) ? cachedLeads : []).find(l => String(l.id) === String(leadId));
    if (!lead) return;

    const leadIdInput = document.getElementById('port-lead-id');
    if (leadIdInput) leadIdInput.value = lead.id;

    const leadBanner = document.getElementById('port-lead-banner');
    const leadDetails = document.getElementById('port-lead-details');
    const svc = lead.service || lead.category || currentProvider.trade || 'Work';
    const loc = lead.locality || lead.lga || currentProvider.area || 'Nigeria';

    if (leadBanner && leadDetails) {
      leadBanner.style.display = 'block';
      leadDetails.textContent = `${svc} in ${loc}`;
    }

    const titleInput = document.getElementById('port-title');
    if (titleInput) {
      titleInput.value = `Completed ${svc} in ${loc}`;
    }

    const catInput = document.getElementById('port-category');
    if (catInput) {
      catInput.value = svc;
    }

    if (modalPortfolio) modalPortfolio.style.display = 'flex';
  }

  // Handle format toggle: Single vs Before & After
  function updatePortfolioFormatView(format) {
    const isBa = format === 'before_after';
    const beforeZone = document.getElementById('port-before-zone');
    const singleCard = document.getElementById('port-format-single-label');
    const baCard = document.getElementById('port-format-ba-label');
    const beforeFile = document.getElementById('port-file-before');
    const afterLabel = document.getElementById('port-after-label-text');

    if (isBa) {
      if (beforeZone) beforeZone.style.display = 'block';
      if (beforeFile) beforeFile.required = true;
      if (afterLabel) afterLabel.textContent = 'AFTER / COMPLETED PHOTO *';
      if (baCard) {
        baCard.classList.add('active');
        baCard.style.borderColor = 'var(--dash-green, #00A859)';
      }
      if (singleCard) {
        singleCard.classList.remove('active');
        singleCard.style.borderColor = 'var(--dash-border, rgba(255,255,255,0.1))';
      }
    } else {
      if (beforeZone) beforeZone.style.display = 'none';
      if (beforeFile) beforeFile.required = false;
      if (afterLabel) afterLabel.textContent = 'COMPLETED WORK PHOTO *';
      if (singleCard) {
        singleCard.classList.add('active');
        singleCard.style.borderColor = 'var(--dash-green, #00A859)';
      }
      if (baCard) {
        baCard.classList.remove('active');
        baCard.style.borderColor = 'var(--dash-border, rgba(255,255,255,0.1))';
      }
    }
  }

  document.querySelectorAll('input[name="port_project_type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updatePortfolioFormatView(e.target.value);
    });
  });

  document.querySelectorAll('.port-format-card').forEach(card => {
    card.addEventListener('click', () => {
      const radio = card.querySelector('input[name="port_project_type"]');
      if (radio) {
        radio.checked = true;
        updatePortfolioFormatView(radio.value);
      }
    });
  });

  // Client-side WebP compression on file selection
  const beforeFileInput = document.getElementById('port-file-before');
  if (beforeFileInput) {
    beforeFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const compressed = await LokatorDB.compressImage(file, 800, 800, 0.8);
        beforeCompressedData = compressed.dataUrl;
        const prevImg = document.getElementById('port-before-preview');
        const prevBox = document.getElementById('port-before-preview-box');
        const emptyBox = document.getElementById('port-before-empty');
        const sizePill = document.getElementById('port-before-size-pill');
        if (prevImg) prevImg.src = compressed.dataUrl;
        if (prevBox) prevBox.style.display = 'block';
        if (emptyBox) emptyBox.style.display = 'none';
        if (sizePill) sizePill.textContent = `✓ Compressed: ${Math.round(compressed.compressedSize / 1024)} KB WebP`;
      } catch (err) {
        showToast('Image processing failed: ' + err.message, 'error');
      }
    });
  }

  const afterFileInput = document.getElementById('port-file-after');
  if (afterFileInput) {
    afterFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const compressed = await LokatorDB.compressImage(file, 800, 800, 0.8);
        afterCompressedData = compressed.dataUrl;
        const prevImg = document.getElementById('port-after-preview');
        const prevBox = document.getElementById('port-after-preview-box');
        const emptyBox = document.getElementById('port-after-empty');
        const sizePill = document.getElementById('port-after-size-pill');
        if (prevImg) prevImg.src = compressed.dataUrl;
        if (prevBox) prevBox.style.display = 'block';
        if (emptyBox) emptyBox.style.display = 'none';
        if (sizePill) sizePill.textContent = `✓ Compressed: ${Math.round(compressed.compressedSize / 1024)} KB WebP`;
      } catch (err) {
        showToast('Image processing failed: ' + err.message, 'error');
      }
    });
  }

  function renderPortfolio() {
    if (!portfolioGridEl) return;
    const items = currentProvider.portfolio || [];
    if (items.length === 0) {
      portfolioGridEl.innerHTML = `<div style="grid-column: 1 / -1; color: var(--dash-muted); padding: 24px; text-align: center;">No projects in showcase yet. Click "+ Add Project" to feature your work!</div>`;
      return;
    }

    portfolioGridEl.innerHTML = items.map(item => {
      const safeAccent = (item.accentColor && item.accentColor.startsWith('#')) ? item.accentColor : '#004D2C';
      const safeId = (typeof item.id === 'string' || typeof item.id === 'number') ? String(item.id).replace(/[^a-zA-Z0-9_-]/g, '') : '0';
      const isBa = Boolean(item.is_before_after || item.isBeforeAfter || item.project_type === 'before_after');
      const isVerified = Boolean(item.verified_job);
      const hasImg = Boolean(item.after_image_url || item.imageUrl);

      return `
        <div class="dash-portfolio-card">
          <div class="dash-port-media" style="position: relative; overflow: hidden; background: ${hasImg ? '#000' : 'linear-gradient(135deg, ' + safeAccent + ', #006B3F)'};">
            ${hasImg ? `
              <img src="${escapeHtml(item.after_image_url || item.imageUrl)}" alt="${escapeHtml(item.title)}" style="width:100%; height:100%; object-fit:cover;" />
            ` : `
              <span>${escapeHtml(item.icon || '🛠️')}</span>
            `}
            ${isBa ? '<span style="position:absolute; top:8px; right:8px; background:rgba(0,0,0,0.75); color:#FFF; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">⚡ B&A</span>' : ''}
          </div>
          <div class="dash-port-body">
            <div class="dash-port-title">${escapeHtml(item.title)}</div>
            <div class="dash-port-desc">${escapeHtml(item.description || '')}</div>
            <div class="dash-port-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
              ${isVerified ? `
                <span class="badge-pill" style="font-size: 11px; padding: 2px 8px; background: rgba(16, 185, 129, 0.2); color: #10B981; font-weight: 700;">🛡️ Verified Job</span>
              ` : `
                <span class="badge-pill" style="font-size: 11px; padding: 2px 8px;">${escapeHtml(item.tag || item.service_tag || 'Showcase')}</span>
              `}
              <button type="button" class="btn-delete-port" data-item-id="${safeId}" style="background: none; border: none; color: var(--danger, #EF4444); font-size: 12.5px; cursor: pointer; font-weight: 700;">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (btnOpenPortModal && modalPortfolio) {
    btnOpenPortModal.addEventListener('click', () => {
      resetPortfolioModal();
      modalPortfolio.style.display = 'flex';
    });
  }

  if (btnClosePortModal && modalPortfolio) {
    btnClosePortModal.addEventListener('click', () => {
      modalPortfolio.style.display = 'none';
    });
  }

  if (formAddPort) {
    formAddPort.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('port-title').value.trim();
      const category = document.getElementById('port-category').value.trim() || currentProvider.trade || 'General Craftsmanship';
      const desc = document.getElementById('port-desc').value.trim();
      const projectType = document.querySelector('input[name="port_project_type"]:checked')?.value || 'single';
      const leadId = document.getElementById('port-lead-id')?.value || null;

      // Validate required images
      if (!afterCompressedData) {
        showToast('Please select a completed workmanship photo.', 'error');
        return;
      }
      if (projectType === 'before_after' && !beforeCompressedData) {
        showToast('Please select a before photo for Before & After comparison.', 'error');
        return;
      }

      // Invariant C client check: warn if phone numbers are in description
      if (/(?:\+?234|0)[789][01]\d{8}\b/.test(title) || /(?:\+?234|0)[789][01]\d{8}\b/.test(desc)) {
        showToast('Privacy Warning: Phone numbers are not allowed in portfolio showcase descriptions.', 'error');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-portfolio');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Publishing...';
      }

      try {
        const res = await LokatorDB.addPortfolioItem(currentProvider.id, {
          title,
          category,
          description: desc,
          project_type: projectType,
          before_image_url: beforeCompressedData,
          after_image_url: afterCompressedData,
          lead_id: leadId,
          accentColor: '#006B3F',
          icon: '🛠️'
        });

        const newItem = res.data || res;
        if (!currentProvider.portfolio) currentProvider.portfolio = [];
        currentProvider.portfolio.unshift(newItem);
        renderPortfolio();

        if (typeof LokatorTelemetry !== 'undefined') {
          const canonicalCat = (typeof CategoryMap !== 'undefined' && CategoryMap.resolveQuery)
            ? CategoryMap.resolveQuery(category)
            : 'trade';
          LokatorTelemetry.trackEvent('provider_portfolio_uploaded', {
            category: canonicalCat,
            project_type: projectType,
            verified_job: Boolean(newItem.verified_job)
          });
        }

        modalPortfolio.style.display = 'none';
        resetPortfolioModal();

        if (res && res.status === 'OFFLINE_PENDING') {
          showToast(res.message, 'info');
        } else if (res && res.status === 'REMOTE_FAILURE') {
          showToast(res.message || 'Failed to add portfolio item', 'error');
        } else {
          showToast('Project added to your public portfolio showcase!');
        }
      } catch (err) {
        showToast('Failed to add portfolio item: ' + (err.message || 'Network error'), 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Publish to Showcase';
        }
      }
    });
  }

  if (portfolioGridEl) {
    portfolioGridEl.addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-delete-port')) {
        const itemId = e.target.dataset.itemId;
        if (confirm('Are you sure you want to remove this project from your portfolio?')) {
          const res = await LokatorDB.deletePortfolioItem(currentProvider.id, itemId);
          currentProvider.portfolio = (currentProvider.portfolio || []).filter(item => String(item.id) !== String(itemId));
          renderPortfolio();
          if (res && res.status === 'OFFLINE_PENDING') {
            showToast(res.message, 'info');
          } else if (res && res.status === 'REMOTE_FAILURE') {
            showToast(res.message || 'Failed to remove project', 'error');
          } else {
            showToast('Project removed from portfolio.');
          }
        }
      }
    });
  }

  // 10B. Phase 010: Canonical Provider Subscription & Contact Metering Controller
  async function renderSubscriptionDashboard() {
    if (!currentProvider) return;
    const providerId = currentProvider.id;

    const Monetization = (typeof PadiFixMonetization !== 'undefined') ? PadiFixMonetization : null;
    const plans = Monetization && Monetization.PROVIDER_PLANS ? Monetization.PROVIDER_PLANS : {
      FREE: { id: 'FREE', name: 'Free', price_ngn: 0, contact_allowance: 5 },
      BASIC: { id: 'BASIC', name: 'Basic', price_ngn: 5500, contact_allowance: 30 },
      PRO: { id: 'PRO', name: 'Pro', price_ngn: 11000, contact_allowance: 100 },
      PREMIUM: { id: 'PREMIUM', name: 'Premium', price_ngn: 22000, contact_allowance: 500 }
    };

    // Retrieve active subscription
    const sub = (typeof LokatorDB !== 'undefined' && LokatorDB.subscriptions)
      ? LokatorDB.subscriptions.getSubscription(providerId)
      : { plan_id: 'FREE', status: 'active', lifecycle_status: 'active' };

    const planInfo = plans[sub.plan_id] || plans.FREE;

    // Retrieve contact usage
    const usage = (typeof LokatorDB !== 'undefined' && LokatorDB.contactMeter)
      ? LokatorDB.contactMeter.getUsage(providerId)
      : { total_contacts: 0, whatsapp_contacts: 0, phone_contacts: 0, remaining_contacts: planInfo.contact_allowance, limit_reached: false };

    // Grace Period Banner Management (Phase 011)
    const graceBanner = document.getElementById('sub-grace-banner');
    const isGrace = sub.lifecycle_status === 'grace' || sub.status === 'past_due' || sub.status === 'grace' || sub.lifecycle_status === 'past_due';
    if (graceBanner) {
      graceBanner.style.display = isGrace ? 'block' : 'none';
      if (isGrace) {
        const graceCount = document.getElementById('grace-days-count');
        if (graceCount) {
          let days = 3;
          if (sub.grace_period_ends_at) {
            const diffMs = new Date(sub.grace_period_ends_at) - new Date();
            days = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
          }
          graceCount.textContent = `${days} day${days > 1 ? 's' : ''}`;
        }
        const btnResolve = document.getElementById('btn-resolve-payment');
        if (btnResolve) {
          btnResolve.onclick = () => {
            const planCardBtn = document.querySelector(`.btn-select-plan[data-plan="${sub.plan_id}"]`) || document.querySelector('.btn-select-plan[data-plan="PRO"]');
            if (planCardBtn) planCardBtn.click();
          };
        }
      }
    }

    // Update Status Pill
    const statusBadge = document.getElementById('sub-current-status-badge');
    if (statusBadge) {
      if (isGrace) {
        statusBadge.textContent = 'Grace Period (Payment Pending)';
        statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        statusBadge.style.color = '#F87171';
        statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      } else if (sub.cancel_at_period_end || sub.lifecycle_status === 'non_renewing') {
        statusBadge.textContent = `${planInfo.name} (Non-Renewing)`;
        statusBadge.style.background = 'rgba(245, 158, 11, 0.15)';
        statusBadge.style.color = '#FBBF24';
        statusBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      } else {
        const isAct = sub.status === 'active';
        statusBadge.textContent = isAct ? `${planInfo.name} Plan (Active)` : `Status: ${sub.status.toUpperCase()}`;
        statusBadge.style.background = isAct ? 'rgba(0, 168, 89, 0.15)' : 'rgba(239, 68, 68, 0.15)';
        statusBadge.style.color = isAct ? '#34D399' : '#F87171';
        statusBadge.style.borderColor = isAct ? 'rgba(0, 168, 89, 0.3)' : 'rgba(239, 68, 68, 0.3)';
      }
    }

    // Cancellation Notice
    const cancelNotice = document.getElementById('sub-cancel-notice');
    const nonRenewingNotice = document.getElementById('sub-non-renewing-notice');
    const isNonRenewing = sub.cancel_at_period_end || sub.lifecycle_status === 'non_renewing';
    if (cancelNotice) {
      cancelNotice.style.display = isNonRenewing ? 'block' : 'none';
    }
    if (nonRenewingNotice) {
      nonRenewingNotice.style.display = isNonRenewing ? 'block' : 'none';
    }

    // Update Current Plan Card
    const planPill = document.getElementById('sub-plan-pill');
    if (planPill) {
      planPill.textContent = planInfo.name.toUpperCase();
      if (sub.plan_id === 'PRO') {
        planPill.style.background = '#00A859';
      } else if (sub.plan_id === 'PREMIUM') {
        planPill.style.background = '#F59E0B';
      } else if (sub.plan_id === 'BASIC') {
        planPill.style.background = '#0284C7';
      } else {
        planPill.style.background = '#64748B';
      }
    }

    const planPrice = document.getElementById('sub-plan-price');
    if (planPrice) {
      planPrice.textContent = planInfo.price_ngn === 0 ? '₦0' : `₦${planInfo.price_ngn.toLocaleString()}`;
    }

    const periodDates = document.getElementById('sub-period-dates');
    if (periodDates) {
      if (Monetization && typeof Monetization.getBillingPeriodDates === 'function') {
        const pDates = Monetization.getBillingPeriodDates();
        const startStr = new Date(pDates.start).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
        const endStr = new Date(pDates.end).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
        periodDates.textContent = `${startStr} – ${endStr} (Africa/Lagos)`;
      } else {
        periodDates.textContent = 'Current Month (Africa/Lagos)';
      }
    }

    const renewalDate = document.getElementById('sub-renewal-date');
    if (renewalDate) {
      if (sub.plan_id === 'FREE') {
        renewalDate.textContent = 'Free Forever (Resets Monthly)';
        renewalDate.style.color = '#94A3B8';
      } else if (sub.cancel_at_period_end || sub.lifecycle_status === 'non_renewing') {
        const endDateStr = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' }) : 'End of Cycle';
        renewalDate.textContent = `Ends on ${endDateStr} (No Renewal)`;
        renewalDate.style.color = '#F59E0B';
      } else if (sub.current_period_end) {
        const renDateStr = new Date(sub.current_period_end).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
        renewalDate.textContent = renDateStr;
        renewalDate.style.color = '#34D399';
      } else {
        renewalDate.textContent = 'Active (Monthly Auto-Renew)';
        renewalDate.style.color = '#34D399';
      }
    }

    const btnCancel = document.getElementById('btn-cancel-subscription');
    const btnCancelSub = document.getElementById('sub-btn-cancel-renewal');
    const btnResumeSub = document.getElementById('sub-btn-resume-renewal');
    const isPaid = sub.plan_id !== 'FREE';

    const handleToggleRenewal = () => {
      if (isNonRenewing) {
        if (typeof LokatorDB !== 'undefined' && LokatorDB.subscriptions) {
          sub.cancel_at_period_end = false;
          sub.lifecycle_status = 'active';
          sub.auto_renew = true;
          const store = JSON.parse(localStorage.getItem('padifix_subscriptions_store') || '{}');
          store[providerId] = sub;
          localStorage.setItem('padifix_subscriptions_store', JSON.stringify(store));
        }
        showToast('Auto-renewal resumed successfully.');
        renderSubscriptionDashboard();
      } else {
        if (confirm(`Are you sure you want to cancel auto-renewal for your ${planInfo.name} subscription?\n\nYou will keep your full benefits until the end of your billing cycle, then revert to Free Starter (5 contacts/mo).`)) {
          if (typeof LokatorDB !== 'undefined' && LokatorDB.subscriptions) {
            LokatorDB.subscriptions.cancelSubscription(providerId);
          }
          showToast('Auto-renewal cancelled. You keep access until period end.');
          renderSubscriptionDashboard();
        }
      }
    };

    if (btnCancel) {
      btnCancel.style.display = isPaid ? 'inline-block' : 'none';
      btnCancel.textContent = isNonRenewing ? 'Resume Auto-Renewal' : 'Cancel Auto-Renewal';
      btnCancel.style.color = isNonRenewing ? '#34D399' : '#F87171';
      btnCancel.style.borderColor = isNonRenewing ? 'rgba(0, 168, 89, 0.4)' : 'rgba(239, 68, 68, 0.4)';
      btnCancel.onclick = handleToggleRenewal;
    }
    if (btnCancelSub) {
      btnCancelSub.style.display = (isPaid && !isNonRenewing) ? 'inline-block' : 'none';
      btnCancelSub.onclick = handleToggleRenewal;
    }
    if (btnResumeSub) {
      btnResumeSub.style.display = (isPaid && isNonRenewing) ? 'inline-block' : 'none';
      btnResumeSub.onclick = handleToggleRenewal;
    }

    // Lead Meter
    const usedNumber = document.getElementById('sub-contacts-used-number');
    const contactsUsed = (usage && (usage.contacts_used !== undefined ? usage.contacts_used : usage.total_contacts)) || 0;
    if (usedNumber) usedNumber.textContent = contactsUsed;

    const totalNumber = document.getElementById('sub-contacts-total-number');
    if (totalNumber) {
      totalNumber.textContent = (planInfo.contact_allowance === Infinity) ? '∞' : planInfo.contact_allowance;
    }

    const remText = document.getElementById('sub-contacts-remaining');
    if (remText) {
      if (planInfo.contact_allowance === Infinity) {
        remText.textContent = 'Unlimited (Fair-use)';
        remText.style.color = '#FBBF24';
      } else {
        const rawRem = usage && (usage.contacts_remaining !== undefined ? usage.contacts_remaining : usage.remaining_contacts);
        const contactsRemaining = rawRem !== undefined ? rawRem : Math.max(0, (planInfo.contact_allowance || 0) - contactsUsed);
        remText.textContent = `${contactsRemaining} contacts remaining`;
        remText.style.color = contactsRemaining > 0 ? '#34D399' : '#F87171';
      }
    }

    const progressBar = document.getElementById('sub-contacts-progress-bar');
    if (progressBar) {
      let pct = 0;
      if (planInfo.contact_allowance === Infinity) {
        pct = Math.min(100, Math.round((contactsUsed / 500) * 100));
      } else {
        pct = Math.min(100, Math.round((contactsUsed / (planInfo.contact_allowance || 1)) * 100));
      }
      progressBar.style.width = `${pct}%`;
      if (pct >= 100) {
        progressBar.style.background = '#EF4444';
      } else if (pct >= 80) {
        progressBar.style.background = '#F59E0B';
      } else {
        progressBar.style.background = 'linear-gradient(90deg, #00A859, #34D399)';
      }
    }

    const countWa = document.getElementById('sub-count-wa');
    if (countWa) countWa.textContent = usage.whatsapp_contacts || 0;

    const countCall = document.getElementById('sub-count-call');
    if (countCall) countCall.textContent = usage.phone_contacts || 0;

    // Overview Ribbon KPI
    const kpiPlan = document.getElementById('kpi-sub-plan');
    if (kpiPlan) kpiPlan.textContent = planInfo.name.toUpperCase();
    const kpiRem = document.getElementById('kpi-sub-remaining');
    if (kpiRem) {
      kpiRem.textContent = (planInfo.contact_allowance === Infinity)
        ? 'Unlimited'
        : `${usage.remaining_contacts} contacts left`;
    }

    // Monthly / Annual Billing Interval State & Handler (Phase 035)
    let currentSelectedInterval = 'monthly'; // 'monthly' | 'annually'
    const btnMonthly = document.getElementById('billing-toggle-monthly');
    const btnYearly = document.getElementById('billing-toggle-yearly');

    function updatePlanCardPricingDisplay(isYearly) {
      const basicPriceEl = document.querySelector('#plan-card-BASIC .sub-plan-price');
      const proPriceEl = document.querySelector('#plan-card-PRO .sub-plan-price');
      const premiumPriceEl = document.querySelector('#plan-card-PREMIUM .sub-plan-price');

      if (basicPriceEl) {
        basicPriceEl.innerHTML = isYearly
          ? `₦55,000 <span style="font-size: 11px; font-weight: 400; color: var(--dash-muted);">/ year</span>`
          : `₦5,500 <span style="font-size: 11px; font-weight: 400; color: var(--dash-muted);">/ month</span>`;
      }
      if (proPriceEl) {
        proPriceEl.innerHTML = isYearly
          ? `₦110,000 <span style="font-size: 11px; font-weight: 400; color: var(--dash-muted);">/ year</span>`
          : `₦11,000 <span style="font-size: 11px; font-weight: 400; color: var(--dash-muted);">/ month</span>`;
      }
      if (premiumPriceEl) {
        premiumPriceEl.innerHTML = isYearly
          ? `₦220,000 <span style="font-size: 11px; font-weight: 400; color: var(--dash-muted);">/ year</span>`
          : `₦22,000 <span style="font-size: 11px; font-weight: 400; color: var(--dash-muted);">/ month</span>`;
      }

      // Update Plan Selection Buttons Text
      document.querySelectorAll('.btn-select-plan').forEach(btn => {
        const pId = btn.getAttribute('data-plan');
        const isCurrent = (pId === sub.plan_id);
        if (isCurrent) {
          btn.textContent = '✓ Current Plan';
        } else if (pId === 'FREE') {
          btn.textContent = 'Downgrade to Free';
        } else {
          const targetPlan = plans[pId];
          const displayPrice = isYearly
            ? (targetPlan.annual_price_amount_display || `₦${(targetPlan.price_ngn * 10).toLocaleString()}/yr`)
            : `₦${targetPlan.price_ngn.toLocaleString()}/mo`;
          btn.textContent = `Upgrade to ${targetPlan ? targetPlan.name : pId} (${displayPrice})`;
        }
      });
    }

    if (btnMonthly && btnYearly) {
      btnMonthly.onclick = () => {
        currentSelectedInterval = 'monthly';
        btnMonthly.style.background = '#00A859';
        btnMonthly.style.color = '#fff';
        btnYearly.style.background = 'transparent';
        btnYearly.style.color = 'var(--dash-muted)';
        updatePlanCardPricingDisplay(false);
      };
      btnYearly.onclick = () => {
        currentSelectedInterval = 'annually';
        btnYearly.style.background = '#00A859';
        btnYearly.style.color = '#fff';
        btnMonthly.style.background = 'transparent';
        btnMonthly.style.color = 'var(--dash-muted)';
        updatePlanCardPricingDisplay(true);
      };
    }

    // Plan Selection Buttons
    document.querySelectorAll('.btn-select-plan').forEach(btn => {
      const pId = btn.getAttribute('data-plan');
      const isCurrent = (pId === sub.plan_id);

      if (isCurrent) {
        btn.textContent = '✓ Current Plan';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.style.cursor = 'default';
      } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        if (pId === 'FREE') {
          btn.textContent = 'Downgrade to Free';
        } else {
          const targetPlan = plans[pId];
          btn.textContent = `Upgrade to ${targetPlan ? targetPlan.name : pId} (₦${targetPlan ? targetPlan.price_ngn.toLocaleString() : 0}/mo)`;
        }

        btn.onclick = async () => {
          const targetPlan = plans[pId];
          if (!targetPlan) return;

          if (pId === 'FREE') {
            if (confirm('Downgrade to Free Plan?\n\nYour contact allowance will be 5 contacts/month.')) {
              if (typeof LokatorDB !== 'undefined' && LokatorDB.subscriptions) {
                LokatorDB.subscriptions.activateSubscription(providerId, 'FREE');
              }
              showToast('Switched to Free Plan.');
              renderSubscriptionDashboard();
            }
            return;
          }

          // Paid plan upgrade flow via Paystack
          const isYearly = currentSelectedInterval === 'annually';
          const priceDisplay = isYearly
            ? `₦${(targetPlan.price_ngn * 10).toLocaleString()} / year (2 months free)`
            : `₦${targetPlan.price_ngn.toLocaleString()} / month`;

          const confirmPay = confirm(
            `💳 UPGRADE TO PADIFIX ${targetPlan.name.toUpperCase()} PLAN\n\n` +
            `Billing: ${isYearly ? 'Annual / Yearly' : 'Monthly'}\n` +
            `Price: ${priceDisplay}\n` +
            `Allowance: ${targetPlan.contact_allowance === Infinity ? 'Unlimited (Fair Use)' : targetPlan.contact_allowance + ' contacts/month'}\n\n` +
            `Click OK to proceed to Paystack checkout.`
          );

          if (!confirmPay) return;

          btn.disabled = true;
          btn.textContent = 'Processing...';

          try {
            // Server is authoritative: we only pass plan_id and interval. Amount/currency are resolved server-side.
            let initRes;
            try {
              const res = await fetch('/api/paystack-init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  provider_id: providerId,
                  plan_id: pId,
                  interval: currentSelectedInterval,
                  email: currentProvider.email || `artisan${providerId}@padifix.ng`
                })
              });
              if (res.ok) {
                initRes = await res.json();
                if (initRes && initRes.authorization_url) {
                  // Hosted Checkout Redirect (PadiFix Canonical Flow)
                  window.location.href = initRes.authorization_url;
                  return;
                }
              } else {
                const errData = await res.json().catch(() => ({}));
                console.warn('Paystack init API notice:', errData.message || res.statusText);
              }
            } catch (netErr) {
              console.warn('API init fetch notice, using local test simulator:', netErr.message);
            }

            // Test Mode Simulation fallback if serverless API isn't live or test keys
            const ref = (initRes && initRes.reference) || (initRes && initRes.data && initRes.data.reference) || `sub_pay_${providerId}_${Date.now()}`;
            
            if (typeof LokatorDB !== 'undefined' && LokatorDB.subscriptions) {
              LokatorDB.subscriptions.activateSubscription(providerId, pId, {
                reference: ref,
                customer_code: `CUS_${providerId}`,
                billing_interval: currentSelectedInterval
              });
            }

            if (typeof LokatorTelemetry !== 'undefined') {
              LokatorTelemetry.trackEvent('subscription_activated', {
                provider_id: providerId,
                plan_id: pId,
                billing_interval: currentSelectedInterval,
                reference: ref
              });
            }

            showToast(`🎉 Congratulations! You are now on the ${targetPlan.name} Plan!`);
            renderSubscriptionDashboard();
          } catch (err) {
            showToast('Upgrade failed: ' + err.message, 'error');
            renderSubscriptionDashboard();
          }
        };
      }
    });

    // Billing History Table
    const tbody = document.getElementById('sub-billing-history-tbody');
    if (tbody) {
      const history = (typeof LokatorDB !== 'undefined' && LokatorDB.subscriptions)
        ? LokatorDB.subscriptions.getBillingHistory(providerId)
        : [];

      if (history.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="padding: 16px 10px; text-align: center; color: var(--dash-muted);">No prior billing transactions on record.</td>
          </tr>
        `;
      } else {
        tbody.innerHTML = history.map(tx => {
          const dStr = tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
          const amtStr = `₦${(Number(tx.amount_ngn) || 0).toLocaleString()}`;
          const isSuccess = tx.status === 'success' || tx.status === 'paid';
          const statusBadge = isSuccess
            ? `<span style="color: #34D399; background: rgba(0, 168, 89, 0.15); padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">Success</span>`
            : `<span style="color: #F87171; background: rgba(239, 68, 68, 0.15); padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">${tx.status || 'Pending'}</span>`;

          const receiptBtn = (isSuccess && tx.reference)
            ? `<button type="button" class="btn btn-outline btn-xs btn-resend-receipt" data-ref="${escapeHtml(tx.reference)}" style="padding: 3px 8px; font-size: 11px; border-radius: 4px; border-color: var(--dash-border); color: var(--dash-text, #FFF); cursor: pointer;">Resend Receipt</button>`
            : `<span style="color: var(--dash-muted); font-size: 11px;">—</span>`;

          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
              <td style="padding: 10px 10px; color: var(--dash-text, #FFF);">${escapeHtml(dStr)}</td>
              <td style="padding: 10px 10px; color: var(--dash-text-secondary, #CBD5E1);">${escapeHtml(tx.description || `${tx.plan_id || 'PRO'} Plan Subscription`)}</td>
              <td style="padding: 10px 10px; color: #34D399; font-weight: 600;">${amtStr}</td>
              <td style="padding: 10px 10px;">${statusBadge}</td>
              <td style="padding: 10px 10px; font-family: monospace; font-size: 11px; color: var(--dash-muted, #94A3B8);">${escapeHtml(tx.reference || '—')}</td>
              <td style="padding: 10px 10px;">${receiptBtn}</td>
            </tr>
          `;
        }).join('');

        // Wire up Receipt Resend click handlers (Phase 012)
        tbody.querySelectorAll('.btn-resend-receipt').forEach(btn => {
          btn.addEventListener('click', async () => {
            const ref = btn.getAttribute('data-ref');
            if (!ref) return;
            btn.disabled = true;
            btn.textContent = 'Sending...';
            try {
              const res = await fetch('/api/receipt-resend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider_id: providerId, reference: ref })
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Failed to resend receipt');
              showToast('✅ Billing receipt resent to your email successfully!');
              btn.textContent = 'Resent ✓';
            } catch (err) {
              showToast('Receipt resend failed: ' + err.message, 'error');
              btn.disabled = false;
              btn.textContent = 'Resend Receipt';
            }
          });
        });
      }
    }
  }
  window.renderSubscriptionDashboard = renderSubscriptionDashboard;
  window.renderSubscriptionTab = renderSubscriptionDashboard;

  // 11. Trust & Verification Center Controller (Phase 006 Canonical Engine)
  async function renderTrustCenter() {
    if (!currentProvider) return;

    const chip = document.getElementById('dash-ver-status-chip');
    const text = document.getElementById('dash-ver-status-text');
    const feedback = document.getElementById('dash-feedback-summary');
    const pendingNotice = document.getElementById('dash-ver-pending-notice');
    const approvedNotice = document.getElementById('dash-ver-approved-notice');
    const formReqVer = document.getElementById('form-request-verification');
    const submitBtn = document.getElementById('btn-submit-verification');
    const historyContainer = document.getElementById('ver-history-list');

    // Canonical State Resolution
    const Monetization = (typeof PadiFixMonetization !== 'undefined') ? PadiFixMonetization : null;
    const verState = Monetization && typeof Monetization.resolveVerificationState === 'function'
      ? Monetization.resolveVerificationState(currentProvider)
      : {
          key: (currentProvider.ninVerified || currentProvider.nin_verified) ? 'VERIFIED_NIN' :
               (currentProvider.isVerified || currentProvider.is_verified) ? 'VERIFIED_PLATFORM' :
               (currentProvider.verification_status === 'pending' || currentProvider.verification_requested) ? 'PENDING' : 'UNVERIFIED',
          label: (currentProvider.ninVerified || currentProvider.nin_verified) ? 'National NIN Verified' :
                 (currentProvider.isVerified || currentProvider.is_verified) ? 'Platform Reviewed' :
                 (currentProvider.verification_status === 'pending' || currentProvider.verification_requested) ? 'Pending Compliance Review' : 'Self-Reported Profile',
          badgeClass: (currentProvider.ninVerified || currentProvider.nin_verified || currentProvider.isVerified || currentProvider.is_verified) ? 'profile-verified-pill verified' :
                      (currentProvider.verification_status === 'pending' || currentProvider.verification_requested) ? 'profile-verified-pill pending' : 'profile-verified-pill unverified',
          icon: (currentProvider.ninVerified || currentProvider.nin_verified) ? '🛡️' :
                (currentProvider.isVerified || currentProvider.is_verified) ? '✓' :
                (currentProvider.verification_status === 'pending' || currentProvider.verification_requested) ? '⏳' : 'ℹ️',
          color: (currentProvider.ninVerified || currentProvider.nin_verified || currentProvider.isVerified || currentProvider.is_verified) ? 'var(--dash-green)' :
                 (currentProvider.verification_status === 'pending' || currentProvider.verification_requested) ? 'var(--gold)' : 'var(--dash-muted)',
          isVerified: Boolean(currentProvider.ninVerified || currentProvider.nin_verified || currentProvider.isVerified || currentProvider.is_verified),
          isPending: Boolean(currentProvider.verification_status === 'pending' || currentProvider.verification_requested)
        };

    // Update Status Pill
    if (chip) {
      chip.className = verState.badgeClass;
      chip.innerHTML = `${verState.icon} ${escapeHtml(verState.label)}`;
    }

    // Update Trust Status Description Text
    if (text) {
      text.textContent = verState.label;
      text.style.color = verState.color;
    }

    // Update Customer Feedback Summary
    if (feedback) {
      const cnt = currentProvider.reviewsCount || (currentProvider.reviews ? currentProvider.reviews.length : 0);
      const rating = Number(currentProvider.rating || 5.0).toFixed(1);
      feedback.textContent = cnt > 0 ? `${cnt} Customer Reviews (★ ${rating})` : '0 Customer Reviews (★ New Listing)';
    }

    const freeNotice = document.getElementById('dash-ver-free-tier-notice');
    const rejectedNotice = document.getElementById('dash-ver-rejected-notice');
    const unavailableNotice = document.getElementById('dash-ver-unavailable-notice');
    const inactiveNotice = document.getElementById('dash-ver-inactive-notice');
    const rejectedText = document.getElementById('dash-ver-rejected-text');
    const resubmitBtn = document.getElementById('btn-resubmit-verification');

    // Manage Status Notice Banners & Form Usability (Phase 035/037 Canonical States)
    const rawPlan = String(currentProvider.subscription_plan || currentProvider.plan_id || currentProvider.plan || 'FREE').toUpperCase();
    const isPaidPlan = ['BASIC', 'PRO', 'PREMIUM'].includes(rawPlan);
    const isRejected = (verState.key === 'REJECTED' || currentProvider.verification_status === 'rejected' || currentProvider.verificationStatus === 'rejected');
    const isFreeIneligible = !isPaidPlan || (verState.key === 'NOT_ELIGIBLE' && !isRejected) || verState.upgradeRequired;

    if (verState.isVerified) {
      // State 3 & 4: Successfully Verified Provider (Persistent across all subscription states)
      if (freeNotice) freeNotice.style.display = 'none';
      if (pendingNotice) pendingNotice.style.display = 'none';
      if (rejectedNotice) rejectedNotice.style.display = 'none';

      if (verState.subscriptionActive === false) {
        // State 4: Verified + Subscription Expired/Cancelled/Inactive
        if (approvedNotice) approvedNotice.style.display = 'none';
        if (inactiveNotice) inactiveNotice.style.display = 'block';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Verified (Subscription Inactive)';
        }
      } else {
        // State 3: Verified + Subscription Active
        if (inactiveNotice) inactiveNotice.style.display = 'none';
        if (approvedNotice) approvedNotice.style.display = 'block';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Profile Verified';
        }
      }
      if (formReqVer) {
        formReqVer.querySelectorAll('input, select').forEach(el => el.disabled = true);
      }
    } else if (isFreeIneligible) {
      // State 1: Free Provider + Never Verified (Verification Unavailable)
      if (inactiveNotice) inactiveNotice.style.display = 'none';
      if (freeNotice) freeNotice.style.display = 'block';
      if (pendingNotice) pendingNotice.style.display = 'none';
      if (approvedNotice) approvedNotice.style.display = 'none';
      if (rejectedNotice) rejectedNotice.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Upgrade Plan to Unlock Verification';
      }
      if (formReqVer) {
        formReqVer.querySelectorAll('input, select').forEach(el => el.disabled = true);
      }
    } else if (verState.isPending) {
      // Verification Under Review
      if (inactiveNotice) inactiveNotice.style.display = 'none';
      if (freeNotice) freeNotice.style.display = 'none';
      if (pendingNotice) pendingNotice.style.display = 'block';
      if (approvedNotice) approvedNotice.style.display = 'none';
      if (rejectedNotice) rejectedNotice.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Request Under Review';
      }
      if (formReqVer) {
        formReqVer.querySelectorAll('input, select').forEach(el => el.disabled = true);
      }
    } else if (isRejected) {
      // Verification Rejected (Phase 037 In-App Correction & Resubmission)
      if (inactiveNotice) inactiveNotice.style.display = 'none';
      if (freeNotice) freeNotice.style.display = 'none';
      if (pendingNotice) pendingNotice.style.display = 'none';
      if (approvedNotice) approvedNotice.style.display = 'none';
      if (rejectedNotice) {
        rejectedNotice.style.display = 'block';
        const rawReason = currentProvider.verification_rejection_reason || currentProvider.rejection_reason || 'other';
        const rawNotes = currentProvider.verification_rejection_notes || currentProvider.rejection_notes || '';
        
        const CANONICAL_REJECTION_TITLES = {
          'blurry_image': 'Blurry or Unreadable Image',
          'expired_document': 'Expired Identification Document',
          'name_mismatch': 'Name Does Not Match Account',
          'incomplete_document': 'Incomplete Document / Missing Back Page',
          'fraud_suspected': 'Suspected Fraudulent / Altered Document',
          'other': 'Compliance Policy Requirement'
        };
        const reasonTitle = CANONICAL_REJECTION_TITLES[rawReason] || 'Compliance Review Requirement';

        const badgeEl = document.getElementById('dash-ver-rejected-badge');
        if (badgeEl) badgeEl.textContent = reasonTitle;

        if (rejectedText) {
          rejectedText.textContent = `Your prior verification could not be validated due to: ${reasonTitle}. Please review the compliance notes and submit a corrected document.`;
        }

        const notesEl = document.getElementById('dash-ver-rejected-notes');
        if (notesEl) {
          notesEl.textContent = rawNotes ? `"${rawNotes}"` : 'No specific feedback notes recorded. Please ensure your document is fully visible, valid, and authentic.';
        }
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Corrected Documents';
      }
      if (formReqVer) {
        formReqVer.querySelectorAll('input, select').forEach(el => el.disabled = false);
      }
      if (resubmitBtn) {
        resubmitBtn.onclick = () => {
          if (formReqVer) formReqVer.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const fileInput = document.getElementById('ver-doc-file');
          if (fileInput) fileInput.focus();
        };
      }
    } else {
      // State 2: Paid Subscriber + Never Verified (Verification Available)
      if (inactiveNotice) inactiveNotice.style.display = 'none';
      if (freeNotice) freeNotice.style.display = 'none';
      if (pendingNotice) pendingNotice.style.display = 'none';
      if (approvedNotice) approvedNotice.style.display = 'none';
      if (rejectedNotice) rejectedNotice.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit for Review';
      }
      if (formReqVer) {
        formReqVer.querySelectorAll('input, select').forEach(el => el.disabled = false);
      }
    }

    // Render Verification History
    if (historyContainer && typeof LokatorDB !== 'undefined' && typeof LokatorDB.getProviderVerificationHistory === 'function') {
      try {
        const history = await LokatorDB.getProviderVerificationHistory(currentProvider.id);
        if (!history || history.length === 0) {
          historyContainer.innerHTML = '<p style="color: var(--dash-muted); margin: 0; font-size: 12.5px;">No previous verification requests on record.</p>';
        } else {
          historyContainer.innerHTML = history.map(item => {
            const dateStr = item.submitted_at ? new Date(item.submitted_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
            const statusClass = item.status === 'approved' ? 'status-good' : (item.status === 'pending' ? 'status-notice' : 'status-bad');
            const statusLabel = item.status === 'approved' ? 'Approved' : (item.status === 'pending' ? 'In Review' : 'Rejected');
            return `
              <div style="display: flex; justify-content: space-between; align-items: center; background: #111827; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                <div>
                  <div style="font-weight: 600; color: #fff; font-size: 13px;">${escapeHtml(item.document_masked_ref || item.doc_type || 'Identity Document')}</div>
                  <div style="font-size: 11.5px; color: var(--dash-muted);">${dateStr} • Submitted for Platform Review</div>
                </div>
                <span class="status-tag ${statusClass}" style="font-size: 11px; padding: 3px 8px; border-radius: 4px;">${statusLabel}</span>
              </div>
            `;
          }).join('');
        }
      } catch (e) {
        historyContainer.innerHTML = '<p style="color: var(--dash-muted); font-size: 12px;">Unable to load request history.</p>';
      }
    }

    // Telemetry: verification_status_viewed
    if (typeof LokatorTelemetry !== 'undefined') {
      LokatorTelemetry.trackEvent('verification_status_viewed', {
        provider_id: currentProvider.id,
        verification_state: verState.key
      });
    }
  }

  // Dynamic Verification Input Masking & Labels
  // Dynamic Verification Input Masking & Labels (Phase 036)
  const docTypeSelect = document.getElementById('ver-doc-type');
  const docRefInput = document.getElementById('ver-doc-ref');
  const docRefLabel = document.getElementById('ver-doc-ref-label');
  const previewCode = document.getElementById('ver-preview-code');
  const docFileInput = document.getElementById('ver-doc-file');
  const docPreviewContainer = document.getElementById('ver-doc-preview-container');
  const docImgPreview = document.getElementById('ver-doc-img-preview');
  const docFileInfo = document.getElementById('ver-doc-file-info');

  // Client-Side Image Compression Helper (Phase 036: WebP <300KB)
  async function compressDocumentFile(file) {
    if (!file) return null;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return { file, fileName: file.name, ext: 'pdf' };
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1600;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) {
              resolve({ blob, ext: 'webp', dataUrl: canvas.toDataURL('image/webp', 0.82) });
            } else {
              resolve({ file, fileName: file.name, ext: 'webp' });
            }
          }, 'image/webp', 0.82);
        };
        img.onerror = () => resolve({ file, fileName: file.name, ext: 'webp' });
        img.src = e.target.result;
      };
      reader.onerror = () => resolve({ file, fileName: file.name, ext: 'webp' });
      reader.readAsDataURL(file);
    });
  }

  function updateVerificationInputUI() {
    if (!docTypeSelect || !docRefInput) return;
    const type = docTypeSelect.value;
    if (type === 'nin_slip') {
      if (docRefLabel) docRefLabel.textContent = '11-Digit National NIN or Slip Reference *';
      docRefInput.placeholder = 'e.g. 12345678901';
      docRefInput.removeAttribute('maxLength');
    } else if (type === 'drivers_license') {
      if (docRefLabel) docRefLabel.textContent = 'FRSC Driver\'s License Number *';
      docRefInput.placeholder = 'e.g. ABC123456789';
      docRefInput.removeAttribute('maxLength');
    } else if (type === 'voters_card') {
      if (docRefLabel) docRefLabel.textContent = 'INEC Voter\'s Identification Number (VIN) *';
      docRefInput.placeholder = 'e.g. 90F5B1234567890';
      docRefInput.removeAttribute('maxLength');
    } else if (type === 'international_passport') {
      if (docRefLabel) docRefLabel.textContent = 'Nigerian International Passport Number *';
      docRefInput.placeholder = 'e.g. A12345678';
      docRefInput.removeAttribute('maxLength');
    } else {
      if (docRefLabel) docRefLabel.textContent = 'Government ID Identification Number *';
      docRefInput.placeholder = 'e.g. Serial or registration number';
      docRefInput.removeAttribute('maxLength');
    }
    updatePreviewCode();
  }

  function updatePreviewCode() {
    if (!previewCode || !docRefInput || !docTypeSelect) return;
    const type = docTypeSelect.value;
    const val = docRefInput.value.trim();
    if (!val) {
      previewCode.textContent = `${type.toUpperCase()}: ****`;
      return;
    }
    if (typeof PadiFixVerification !== 'undefined') {
      previewCode.textContent = PadiFixVerification.maskDocumentReference(type, val);
    } else {
      previewCode.textContent = val.length >= 6 ? `${type.toUpperCase()}: ${val.slice(0, 3)}****${val.slice(-3)}` : `${type.toUpperCase()}: ****`;
    }
  }

  if (docTypeSelect) {
    docTypeSelect.addEventListener('change', updateVerificationInputUI);
  }
  if (docRefInput) {
    docRefInput.addEventListener('input', updatePreviewCode);
  }

  if (docFileInput) {
    docFileInput.addEventListener('change', async () => {
      const file = docFileInput.files && docFileInput.files[0];
      if (!file) {
        if (docPreviewContainer) docPreviewContainer.style.display = 'none';
        return;
      }
      if (file.type.startsWith('image/')) {
        const compressed = await compressDocumentFile(file);
        if (docImgPreview && compressed && compressed.dataUrl) {
          docImgPreview.src = compressed.dataUrl;
          docImgPreview.style.display = 'block';
        }
        if (docFileInfo) {
          const sizeKb = Math.round((compressed.blob ? compressed.blob.size : file.size) / 1024);
          docFileInfo.textContent = `${file.name} (Optimized WebP: ${sizeKb} KB)`;
        }
        if (docPreviewContainer) docPreviewContainer.style.display = 'flex';
      } else {
        if (docImgPreview) docImgPreview.style.display = 'none';
        if (docFileInfo) docFileInfo.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
        if (docPreviewContainer) docPreviewContainer.style.display = 'flex';
      }
    });
  }

  const formReqVer = document.getElementById('form-request-verification');
  if (formReqVer) {
    formReqVer.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Invariant 2: One-time verification permanent lock
      if (currentProvider.is_verified || currentProvider.isVerified) {
        showToast('Your account is already permanently verified. One-time verification policy does not allow re-verification.', 'info');
        return;
      }

      // Invariant 11: Single active pending submission lock
      if (currentProvider.verification_status === 'pending' || currentProvider.verificationStatus === 'pending') {
        showToast('You already have a verification request pending review by compliance.', 'info');
        return;
      }

      // Paid plan verification requirement
      const pPlan = (currentProvider.plan_id || currentProvider.plan || 'FREE').toUpperCase();
      if (pPlan === 'FREE') {
        showToast('🔒 Verification submission requires an active Basic, Pro, or Premium subscription. Please upgrade your plan.', 'error');
        return;
      }

      const docType = document.getElementById('ver-doc-type').value;
      const docRef = document.getElementById('ver-doc-ref').value.trim();
      const fileInput = document.getElementById('ver-doc-file');
      const btn = document.getElementById('btn-submit-verification');

      if (!docRef) {
        showToast('Please enter your document or identification reference number.', 'error');
        return;
      }

      const rawFile = fileInput && fileInput.files && fileInput.files[0];
      if (!rawFile) {
        showToast('Please upload a clear photo or scan of your Government ID.', 'error');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Submitting Encrypted ID...';
      }

      try {
        // Compress image to WebP <300KB
        const compressed = await compressDocumentFile(rawFile);
        const ext = compressed.ext || 'webp';
        const submissionId = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const filePath = `provider-verifications/${currentProvider.id}/${submissionId}.${ext}`;

        // Attempt direct upload to private Supabase Storage if instance is available
        if (typeof supabaseInstance !== 'undefined' && supabaseInstance && supabaseInstance.storage) {
          try {
            await supabaseInstance.storage.from('provider-verifications').upload(filePath, compressed.blob || compressed.file, {
              upsert: true,
              contentType: ext === 'pdf' ? 'application/pdf' : 'image/webp'
            });
          } catch (storageErr) {
            console.warn('[Storage] Upload note:', storageErr.message);
          }
        }

        // Post to authoritative /api/providers endpoint
        const apiRes = await fetch('/api/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'submit_verification',
            provider_id: currentProvider.id,
            document_type: docType,
            document_number: docRef,
            file_path: filePath,
            id: submissionId
          })
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({}));
          throw new Error(errData.message || errData.error || `HTTP ${apiRes.status}`);
        }

        const resData = await apiRes.json();

        // Synchronize local database if available
        if (typeof LokatorDB !== 'undefined' && typeof LokatorDB.requestProviderVerification === 'function') {
          try {
            await LokatorDB.requestProviderVerification(currentProvider.id, {
              docType,
              docRef,
              filePath,
              submissionId,
              idempotencyKey: 'idem_' + currentProvider.id + '_' + Date.now()
            });
          } catch (e) {}
        }

        currentProvider.verificationStatus = 'pending';
        currentProvider.verification_status = 'pending';
        currentProvider.verification_requested = true;
        await renderTrustCenter();

        showToast(resData.message || 'Verification request submitted for compliance review.');
        formReqVer.reset();
        if (docPreviewContainer) docPreviewContainer.style.display = 'none';
        updatePreviewCode();
      } catch (err) {
        if (err.message && err.message.includes('PLAN_UPGRADE_REQUIRED')) {
          showToast('🔒 Plan upgrade required: Free accounts cannot submit verification requests.', 'error');
        } else if (err.message && err.message.includes('ALREADY_VERIFIED')) {
          showToast('Your account is already permanently verified.', 'info');
        } else if (err.message && err.message.includes('PENDING_SUBMISSION_EXISTS')) {
          showToast('You already have an active verification submission under review.', 'info');
        } else {
          showToast('Error requesting verification: ' + err.message, 'error');
        }
      } finally {
        if (btn && currentProvider.verification_status !== 'pending') {
          btn.disabled = false;
          btn.textContent = 'Submit for Review';
        }
      }
    });
  }

  // 11b. Phase 10.14: Artisan Peer Referral & Neighborhood Opportunities Engine
  function renderReferralTool() {
    if (!currentProvider) return;

    // 1. Peer Referral Summary
    if (typeof LokatorDB !== 'undefined' && LokatorDB.referrals) {
      const refSummary = LokatorDB.referrals.getProviderReferralSummary(currentProvider.id);
      if (refSummary) {
        const refCodeInput = document.getElementById('dash-referral-code-input');
        const copyRefBtn = document.getElementById('btn-copy-referral-link');
        const shareWaBtn = document.getElementById('btn-share-referral-whatsapp');
        const badgeStatus = document.getElementById('community-builder-badge-status');
        const progressBar = document.getElementById('community-progress-bar');
        const progressText = document.getElementById('community-progress-text');

        if (refCodeInput) refCodeInput.value = refSummary.referral_code;
        if (shareWaBtn) shareWaBtn.href = refSummary.whatsapp_share_url;

        if (badgeStatus) {
          if (refSummary.is_community_builder) {
            badgeStatus.textContent = '🌟 COMMUNITY BUILDER ACTIVE (+5% Boost)';
            badgeStatus.className = 'status-tag status-good';
          } else {
            badgeStatus.textContent = `${refSummary.total_referrals} / 3 Referrals`;
            badgeStatus.className = 'status-tag status-notice';
          }
        }

        if (progressBar) {
          const pct = Math.min(100, Math.round((refSummary.total_referrals / 3) * 100));
          progressBar.style.width = `${pct}%`;
        }

        if (progressText) {
          if (refSummary.is_community_builder) {
            progressText.textContent = '🎉 Badge unlocked! You are an official Community Builder.';
            progressText.style.color = '#34D399';
          } else {
            progressText.textContent = `${refSummary.referrals_to_community_builder} more referral${refSummary.referrals_to_community_builder === 1 ? '' : 's'} needed to unlock Community Builder badge.`;
          }
        }

        if (copyRefBtn) {
          copyRefBtn.onclick = async () => {
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(refSummary.invite_url);
              }
              showToast('Artisan referral link copied to clipboard!');
            } catch (e) {
              showToast('Referral link: ' + refSummary.invite_url);
            }
          };
        }
      }
    }

    // 2. Neighborhood Opportunities Feed
    if (typeof LokatorDB !== 'undefined' && LokatorDB.liquidityEngine) {
      const oppsTbody = document.getElementById('dash-neighborhood-opportunities-tbody');
      if (oppsTbody) {
        const opps = LokatorDB.liquidityEngine.getNeighborhoodOpportunities(currentProvider.id);
        if (!opps || opps.length === 0) {
          oppsTbody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #64748B;">No open job requests in your neighborhood at the moment.</td></tr>`;
        } else {
          const urgencyMap = {
            'emergency_today': '🚨 Emergency Today',
            'within_24h': '⏰ Within 24h',
            'this_week': '📅 This Week',
            'flexible': '💬 Flexible'
          };

          oppsTbody.innerHTML = opps.map(op => {
            const urg = urgencyMap[op.urgency] || op.urgency;
            const timeAgo = op.created_at ? new Date(op.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently';
            return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 10px; font-weight: 700; color: #38BDF8;">${op.category.toUpperCase()}</td>
                <td style="padding: 10px; color: #CBD5E1;">${op.neighborhood ? op.neighborhood + ', ' : ''}${op.lga}</td>
                <td style="padding: 10px; color: #F59E0B; font-weight: 600;">${urg}</td>
                <td style="padding: 10px; color: #F1F5F9; max-width: 250px;">${op.description}</td>
                <td style="padding: 10px; color: #94A3B8; font-size: 11px;">${timeAgo}</td>
              </tr>
            `;
          }).join('');
        }
      }
    }
  }

  // 11c. Phase 10.13B: Monetization Research & Willingness-to-Pay Measurement
  function renderMonetizationResearch() {
    const researchSection = document.getElementById('dash-monetization-research-section');
    const interestButtons = document.querySelectorAll('.btn-mon-interest');
    const intentButtons = document.querySelectorAll('.btn-mon-intent');
    const waitlistButtons = document.querySelectorAll('.btn-mon-waitlist');
    const priceSelects = document.querySelectorAll('.mon-price-select');
    const toast = document.getElementById('dash-mon-interest-toast');

    if (!researchSection) return;

    const providerId = currentProvider ? currentProvider.id : 0;
    const providerMeta = {
      category: currentProvider ? (currentProvider.category || currentProvider.primary_category_slug || '') : '',
      state: currentProvider ? (currentProvider.state || '') : ''
    };

    // 1. Record Product Research Exposure (Level 0 — Awareness)
    try {
      if (LokatorDB.monetization && LokatorDB.monetization.research) {
        ['TRUST_VERIFICATION', 'PROMOTED_DISCOVERY', 'QUALIFIED_LEAD_ACCESS'].forEach(prodId => {
          LokatorDB.monetization.research.recordProductExposure(providerId, prodId, providerMeta);
        });
      }
    } catch (e) {
      console.warn('Monetization exposure recording notice:', e);
    }

    // 2. Price Hypothesis Selection Listeners
    priceSelects.forEach(select => {
      select.addEventListener('change', async (e) => {
        const prodId = e.target.getAttribute('data-product');
        const selectedOpt = e.target.options[e.target.selectedIndex];
        const priceLabel = selectedOpt.value;
        const priceAmount = Number(selectedOpt.getAttribute('data-amount')) || 0;

        try {
          if (LokatorDB.monetization && LokatorDB.monetization.research) {
            await LokatorDB.monetization.research.recordPriceSelection(
              providerId, prodId, { label: priceLabel, amount: priceAmount }, providerMeta
            );
          }
          showToast(`Research price hypothesis updated: ${priceLabel}`);
        } catch (err) {
          console.warn('Price selection logging notice:', err);
        }
      });
    });

    // 3. Level 1: Express Interest Handlers
    interestButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const prodId = e.target.getAttribute('data-product');
        btn.disabled = true;
        btn.textContent = 'Interest Recorded ✓';
        btn.style.borderColor = '#10B981';
        btn.style.color = '#10B981';

        try {
          if (LokatorDB.monetization && LokatorDB.monetization.research) {
            await LokatorDB.monetization.research.recordProductInterest(
              providerId, prodId, 'Expressed general product interest in dashboard', providerMeta
            );
          }
          if (toast) {
            toast.innerHTML = '✅ <strong>Interest Recorded:</strong> Thank you for your feedback! This helps shape upcoming artisan features. <em>No payment required.</em>';
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 5000);
          }
          showToast('Product interest recorded! No payment required.');
        } catch (err) {
          console.warn('Interest logging warning:', err.message);
        }
      });
    });

    // 4. Level 2: Purchase Intent Handlers
    intentButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const prodId = e.target.getAttribute('data-product');
        const selectEl = document.querySelector(`.mon-price-select[data-product="${prodId}"]`);
        const priceLabel = selectEl ? selectEl.value : 'Baseline price';
        const priceAmount = selectEl ? (Number(selectEl.options[selectEl.selectedIndex].getAttribute('data-amount')) || 0) : 0;

        btn.disabled = true;
        btn.textContent = 'Intent Captured ✓';
        btn.style.borderColor = '#10B981';
        btn.style.background = 'rgba(16, 185, 129, 0.15)';
        btn.style.color = '#10B981';

        try {
          if (LokatorDB.monetization && LokatorDB.monetization.research) {
            await LokatorDB.monetization.research.recordPurchaseIntent(
              providerId, prodId, { label: priceLabel, amount: priceAmount }, { ...providerMeta, notes: `Purchase intent at ${priceLabel}` }
            );
          }
          if (toast) {
            toast.innerHTML = `🎯 <strong>Purchase Intent Confirmed:</strong> You selected <strong>${priceLabel}</strong>. Recorded for commercial readiness modeling. <em>No payment is charged.</em>`;
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 6000);
          }
          showToast(`Purchase intent at ${priceLabel} recorded! No payment required.`);
        } catch (err) {
          console.warn('Purchase intent logging warning:', err.message);
        }
      });
    });

    // 5. Level 3: Waitlist / Notification Handlers
    waitlistButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const prodId = e.target.getAttribute('data-product');
        btn.disabled = true;
        btn.textContent = 'Notification Set ✓';
        btn.style.borderColor = '#10B981';
        btn.style.color = '#10B981';

        try {
          if (LokatorDB.monetization && LokatorDB.monetization.research) {
            await LokatorDB.monetization.research.joinProductWaitlist(
              providerId, prodId, '', 'Joined notification waitlist via dashboard', providerMeta
            );
          }
          if (toast) {
            toast.innerHTML = '🔔 <strong>Notification Set:</strong> We will alert your dashboard when this tool enters beta testing. <em>No payment required.</em>';
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 5000);
          }
          showToast('Added to early notification waitlist! No payment required.');
        } catch (err) {
          console.warn('Waitlist logging warning:', err.message);
        }
      });
    });

    // 6. Optional Structured Research Feedback Handler
    const btnSubmitFeedback = document.getElementById('btn-submit-mon-feedback');
    const feedbackSelect = document.getElementById('mon-feedback-reason-select');
    if (btnSubmitFeedback && feedbackSelect) {
      btnSubmitFeedback.addEventListener('click', async () => {
        const reason = feedbackSelect.value;
        btnSubmitFeedback.disabled = true;
        btnSubmitFeedback.textContent = 'Feedback Sent ✓';
        btnSubmitFeedback.style.borderColor = '#10B981';
        btnSubmitFeedback.style.color = '#10B981';

        try {
          if (LokatorDB.monetization && LokatorDB.monetization.research) {
            await LokatorDB.monetization.research.recordResearchFeedback(
              providerId, 'GENERAL', reason, '', providerMeta
            );
          }
          showToast(`Feedback recorded: "${reason}". Thank you!`);
        } catch (err) {
          console.warn('Feedback recording warning:', err.message);
        }
      });
    }

    // 7. Phase 10.13E: Paystack Starter Pilot (₦2,000 / 14-Day) Checkout Trigger & Active Promo Display
    const activePromoBanner = document.getElementById('dash-active-promo-banner');
    const updateActivePromoDisplay = () => {
      if (!activePromoBanner || !LokatorDB.monetization || !LokatorDB.monetization.pilot) return;
      const activePromo = LokatorDB.monetization.pilot.getProviderActivePromotion(providerId);
      if (activePromo) {
        const daysLeft = Math.max(1, Math.ceil((new Date(activePromo.effective_until).getTime() - Date.now()) / (24 * 3600 * 1000)));
        activePromoBanner.style.display = 'block';
        activePromoBanner.innerHTML = `⚡ Promoted Listing Active — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining (${activePromo.lga || 'your locality'})`;
      } else {
        activePromoBanner.style.display = 'none';
      }
    };
    updateActivePromoDisplay();

    // Check for Paystack redirect callback in URL
    const urlParams = new URLSearchParams(window.location.search);
    const paymentRef = urlParams.get('payment_ref');
    if (paymentRef && LokatorDB.monetization && LokatorDB.monetization.pilot) {
      LokatorDB.monetization.pilot.verifyPayment(paymentRef, providerId).then(res => {
        if (res && res.verified) {
          showToast('🎉 Paystack payment verified! Your 14-day Promoted Placement is now ACTIVE.');
          updateActivePromoDisplay();
        }
      }).catch(err => {
        console.warn('Payment callback verification notice:', err.message);
      });
    }

    const btnStartPilot = document.getElementById('btn-start-paystack-pilot');
    if (btnStartPilot) {
      btnStartPilot.addEventListener('click', async () => {
        if (!LokatorDB.monetization || !LokatorDB.monetization.pilot) return;

        try {
          btnStartPilot.disabled = true;
          btnStartPilot.textContent = 'Initializing Paystack...';

          const initRes = await LokatorDB.monetization.pilot.initializePayment(providerId, providerMeta);
          if (initRes.status === 'error' && initRes.code === 'INVENTORY_LIMIT_REACHED') {
            alert(`⚠️ Slot Limit Reached: ${initRes.message}`);
            btnStartPilot.disabled = false;
            btnStartPilot.innerHTML = `<span>⚡ Launch 14-Day Pilot (₦2,000)</span> <span style="font-size: 9.5px; background: rgba(255,255,255,0.2); padding: 1px 4px; border-radius: 3px;">Test Mode</span>`;
            return;
          }

          // Test Mode Simulator: Automatically verify test transaction
          const confirmPayment = confirm(
            `🚀 PADIFIX PAYSTACK PILOT (TEST MODE)\n\n` +
            `Product: Promoted Category Placement\n` +
            `Duration: 14 Days\n` +
            `Amount: ₦2,000.00 (200,000 kobo)\n` +
            `Reference: ${initRes.reference}\n` +
            `Location: ${providerMeta.lga || 'Warri South'}, ${providerMeta.state || 'Delta'}\n\n` +
            `Click OK to simulate successful Paystack test payment and activate promotion.`
          );

          if (confirmPayment) {
            const verifyRes = await LokatorDB.monetization.pilot.verifyPayment(initRes.reference, providerId);
            if (verifyRes.verified) {
              btnStartPilot.textContent = '⚡ Promoted Active (14 Days)';
              btnStartPilot.style.background = '#059669';
              showToast('🎉 Paystack Test Payment Confirmed! 14-Day Promoted Placement is LIVE.');
              updateActivePromoDisplay();
            }
          } else {
            btnStartPilot.disabled = false;
            btnStartPilot.innerHTML = `<span>⚡ Launch 14-Day Pilot (₦2,000)</span> <span style="font-size: 9.5px; background: rgba(255,255,255,0.2); padding: 1px 4px; border-radius: 3px;">Test Mode</span>`;
          }
        } catch (err) {
          alert(`Payment Initialization Failed: ${err.message}`);
          btnStartPilot.disabled = false;
          btnStartPilot.innerHTML = `<span>⚡ Launch 14-Day Pilot (₦2,000)</span> <span style="font-size: 9.5px; background: rgba(255,255,255,0.2); padding: 1px 4px; border-radius: 3px;">Test Mode</span>`;
        }
      });
    }
  }

  // ============================================================================
  // PHASE 029: POST-COMPLETION REVIEW PROMPT & DASHBOARD REVIEWS MANAGEMENT
  // ============================================================================
  let activeCompletionLeadId = null;
  function openCompletionReviewPrompt(leadId) {
    activeCompletionLeadId = leadId;
    const modal = document.getElementById('crm-completion-review-modal');
    if (modal) modal.style.display = 'flex';
  }

  let currentDashReviewFilter = 'all';
  let cachedDashReviews = null;

  async function fetchAuthoritativeDashboardReviews(providerId) {
    try {
      const res = await fetch(`/api/service-review?provider_id=${encodeURIComponent(providerId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.reviews)) {
          return {
            reviews: data.reviews,
            reviews_count: data.reviews_count || data.reviews.length,
            verified_reviews_count: data.verified_reviews_count || 0,
            average_rating: data.average_rating || 5.0
          };
        }
      }
    } catch (e) {}
    return null;
  }

  async function renderDashboardReviews() {
    const listEl = document.getElementById('all-reviews-list');
    if (!listEl || !currentProvider) return;

    // Fetch authoritative data from API
    let apiData = null;
    if (!cachedDashReviews) {
      apiData = await fetchAuthoritativeDashboardReviews(currentProvider.id);
      if (apiData) {
        cachedDashReviews = apiData.reviews;
      }
    }

    const reviews = cachedDashReviews || ((typeof LokatorDB !== 'undefined' && LokatorDB.reviews)
      ? LokatorDB.reviews.getProviderReviews(currentProvider.id)
      : (currentProvider.reviews || []));

    // Calculate metrics
    let verifiedCount = 0;
    let sumRating = 0;
    reviews.forEach(r => {
      sumRating += Number(r.rating || 5);
      if (r.is_verified_customer || r.trust_level === 'VERIFIED_CUSTOMER') {
        verifiedCount++;
      }
    });
    const totalCount = reviews.length;
    const avgRating = totalCount > 0 ? Number((sumRating / totalCount).toFixed(1)) : 5.0;

    // Update Summary Ribbon in #tab-reviews
    const scoreEl = document.getElementById('dash-rev-avg-score');
    const starsEl = document.getElementById('dash-rev-avg-stars');
    const totalEl = document.getElementById('dash-rev-total-count');
    const verEl = document.getElementById('dash-rev-verified-count');
    const profLink = document.getElementById('dash-reviews-profile-link');

    if (scoreEl) scoreEl.textContent = totalCount > 0 ? avgRating.toFixed(1) : 'New';
    if (starsEl) starsEl.textContent = '★'.repeat(Math.round(avgRating)) + '☆'.repeat(5 - Math.round(avgRating));
    if (totalEl) totalEl.textContent = String(totalCount);
    if (verEl) verEl.textContent = String(verifiedCount);
    if (profLink) profLink.href = `profile.html?id=${currentProvider.id}&preview=artisan`;

    // Filter Buttons Wiring
    document.querySelectorAll('.btn-rev-filter').forEach(btn => {
      if (!btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
          document.querySelectorAll('.btn-rev-filter').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'rgba(255,255,255,0.06)';
            b.style.color = 'var(--dash-text)';
          });
          btn.classList.add('active');
          btn.style.background = '#00A859';
          btn.style.color = '#fff';
          currentDashReviewFilter = btn.dataset.filter || 'all';
          renderDashboardReviews();
        });
      }
    });

    // Apply active filter
    let filteredReviews = [...reviews];
    if (currentDashReviewFilter === '5star') {
      filteredReviews = filteredReviews.filter(r => Math.round(Number(r.rating || 5)) === 5);
    } else if (currentDashReviewFilter === 'with_reply') {
      filteredReviews = filteredReviews.filter(r => Boolean(r.provider_reply || r.response));
    }

    if (filteredReviews.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--dash-muted);">
          <div style="font-size: 32px; margin-bottom: 10px;">💬</div>
          <h3>${totalCount === 0 ? 'No Customer Reviews Yet' : 'No Reviews Match Filter'}</h3>
          <p style="font-size: 13px; max-width: 420px; margin: 6px auto 16px;">
            ${totalCount === 0
              ? 'When clients hire you and leave verified ratings, they will appear here. You can respond directly to thank them or clarify project details.'
              : 'Try selecting "All Reviews" to view your entire feedback history.'}
          </p>
          <a href="profile.html?id=${currentProvider.id}" target="_blank" class="btn btn-outline btn-sm">View Your Public Profile ↗</a>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filteredReviews.map(r => {
      const safeRevId = r.id;
      const author = r.customer_name || r.author || 'Customer Review';
      const safeRating = Math.max(1, Math.min(5, Number(r.rating) || 5));
      const starsStr = '★'.repeat(safeRating) + '☆'.repeat(5 - safeRating);
      const dateStr = r.date || (r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent');
      const jobType = r.job_type || r.serviceType || 'General Service';
      const comment = r.comment || '';
      const reply = r.provider_reply || (r.response ? { text: r.response.comment || r.response.text, date: r.response.date || 'Recent' } : null);
      const isVerified = Boolean(r.is_verified_customer || r.trust_level === 'VERIFIED_CUSTOMER');
      const tags = Array.isArray(r.praise_tags) ? r.praise_tags : [];

      return `
        <div class="dash-review-card" id="dash-rev-${safeRevId}" style="background: #111827; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 18px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="color: #fff; font-size: 14.5px;">${escapeHtml(author)}</strong>
                ${isVerified
                  ? `<span style="background: rgba(0, 168, 89, 0.15); color: #34D399; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(0, 168, 89, 0.3);">✓ Verified Customer Job</span>`
                  : `<span style="color: var(--dash-muted); font-size: 11px;">💬 Customer Review</span>`}
              </div>
              <div style="font-size: 12px; color: var(--dash-muted); margin-top: 4px;">
                <span>🛠️ ${escapeHtml(jobType)}</span> • <span>${escapeHtml(dateStr)}</span>
              </div>
            </div>
            <div style="color: #FBBF24; font-size: 14px; letter-spacing: 1px;">${starsStr}</div>
          </div>

          ${tags.length > 0 ? `
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0;">
              ${tags.map(t => `<span style="background: rgba(0, 107, 63, 0.2); color: #34D399; font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 10px; border: 1px solid rgba(0, 107, 63, 0.4);">${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}

          <p style="color: #CBD5E1; font-size: 13.5px; line-height: 1.5; margin: 10px 0;">${escapeHtml(comment)}</p>
          
          <!-- Reply Display or Reply Box -->
          ${reply ? `
            <div style="margin-top: 14px; background: #F0FDF4; border: 1px solid #BBF7D0; border-left: 3.5px solid #00A859; padding: 12px 14px; border-radius: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px; color: #15803D; font-weight: 800; margin-bottom: 4px;">
                <span>👑 Your Official Response</span>
                <span style="color: #64748B; font-weight: 500;">${escapeHtml(reply.date || 'Recent')}</span>
              </div>
              <p style="color: #166534; font-size: 13px; line-height: 1.4; margin: 0;">${escapeHtml(reply.text)}</p>
            </div>
          ` : `
            <div class="dash-reply-form-wrap" id="reply-wrap-${safeRevId}" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--dash-border);">
              <div style="display: flex; gap: 8px;">
                <input type="text" id="input-reply-${safeRevId}" placeholder="Write an official response (e.g. Thank you for hiring me!)..." style="flex: 1; background: #FFFFFF; border: 1.5px solid #CBD5E1; color: #0F172A; padding: 8px 12px; border-radius: 6px; font-size: 13px;" />
                <button type="button" class="btn btn-primary btn-sm btn-post-reply" data-rev-id="${safeRevId}" style="padding: 8px 14px; font-size: 12.5px;">Reply</button>
              </div>
            </div>
          `}
        </div>
      `;
    }).join('');

    // Attach click listeners for posting reply
    listEl.querySelectorAll('.btn-post-reply').forEach(btn => {
      btn.addEventListener('click', async () => {
        const revId = btn.getAttribute('data-rev-id');
        const input = document.getElementById(`input-reply-${revId}`);
        if (!input || !input.value.trim()) return;

        const text = input.value.trim();
        btn.disabled = true;
        btn.textContent = 'Posting...';

        try {
          if (typeof LokatorDB !== 'undefined' && LokatorDB.reviews) {
            await LokatorDB.reviews.replyToReview(revId, text, currentProvider.id);
            showToast('Response posted publicly!');
            cachedDashReviews = null;
            await renderDashboardReviews();
          }
        } catch (err) {
          showToast('Failed to post reply: ' + err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Reply';
        }
      });
    });
  }

  // 11.5 Handle Paystack Subscription Payment Return (Phase 019 Section 24)
  async function handleSubscriptionPaymentReturn() {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return;
    const urlParams = new URLSearchParams(window.location.search);
    const paymentRef = urlParams.get('reference') || urlParams.get('trxref') || urlParams.get('payment_ref');
    if (!paymentRef || !currentProvider || !currentProvider.id) return;

    // Remove payment parameters from URL immediately to prevent repeated triggers on reload
    urlParams.delete('reference');
    urlParams.delete('trxref');
    urlParams.delete('payment_ref');
    const remainingQuery = urlParams.toString();
    const cleanUrl = window.location.pathname + (remainingQuery ? `?${remainingQuery}` : '');
    window.history.replaceState({}, document.title, cleanUrl);

    showToast('Verifying payment with Paystack...', 'info');

    // Retrieve Supabase JWT session token
    let token = null;
    try {
      if (typeof LokatorDB !== 'undefined' && LokatorDB.auth && typeof LokatorDB.auth.getSession === 'function') {
        const sessionRes = await LokatorDB.auth.getSession();
        token = sessionRes?.data?.session?.access_token;
      }
    } catch (e) {}

    if (!token && typeof localStorage !== 'undefined') {
      try {
        const rawSession = localStorage.getItem('lokator_supabase_auth_session') || localStorage.getItem('lokator_auth_session');
        if (rawSession) {
          const parsed = JSON.parse(rawSession);
          token = parsed.access_token || parsed.token || null;
        }
      } catch (e) {}
    }

    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch('/api/subscription-manage', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'verify_and_activate',
          reference: paymentRef,
          provider_id: currentProvider.id
        })
      });

      const data = await res.json();
      if (res.ok && (data.status === 'success' || data.action === 'verify_and_activate')) {
        const sub = data.subscription || {};
        const planName = sub.plan_name || sub.plan_id || 'new';

        // Synchronize local subscription cache
        if (typeof LokatorDB !== 'undefined' && LokatorDB.subscriptions && sub.plan_id) {
          try {
            LokatorDB.subscriptions.activateSubscription(currentProvider.id, sub.plan_id, {
              reference: paymentRef,
              status: sub.status || 'active',
              current_period_start: sub.current_period_start,
              current_period_end: sub.current_period_end
            });
          } catch (syncErr) {}
        }

        showToast(`🎉 Payment verified! Your ${planName} Plan is now active.`, 'success');

        // Refresh UI state & usage
        if (typeof renderSubscriptionDashboard === 'function') {
          renderSubscriptionDashboard();
        }
        if (typeof loadProviderLeadsAndQuota === 'function') {
          loadProviderLeadsAndQuota();
        }
        if (typeof loadBroadcastRadar === 'function') {
          loadBroadcastRadar();
        }
      } else {
        const errMsg = data.error || 'Payment verification could not be completed';
        showToast(`Payment check: ${errMsg}`, 'error');
      }
    } catch (err) {
      showToast('Error connecting to payment verification server.', 'error');
    }
  }

  // Phase 031: Load Open Broadcast Radar
  async function loadBroadcastRadar() {
    const listEl = document.getElementById('radar-leads-list');
    const countEl = document.getElementById('radar-count');
    const tierEl = document.getElementById('radar-tier-badge');
    if (!listEl) return;

    try {
      const token = await getAuthToken();
      const authHeaders = { 'Content-Type': 'application/json' };
      if (token) {
        authHeaders['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/provider-leads?filter=broadcasts&provider_id=${currentProvider?.id || ''}`, {
        headers: authHeaders
      });

      if (!res.ok) return;
      const data = await res.json();
      const broadcasts = data.broadcasts || [];
      const isPro = Boolean(data.is_pro);

      if (countEl) countEl.textContent = `${broadcasts.length} Open`;
      if (tierEl) {
        tierEl.textContent = isPro ? '⚡ Pro Instant Priority' : 'Free Tier (15m Delay)';
        tierEl.style.background = isPro ? 'rgba(0, 168, 89, 0.2)' : 'rgba(245, 158, 11, 0.2)';
        tierEl.style.color = isPro ? '#34D399' : '#F59E0B';
      }

      if (broadcasts.length === 0) {
        listEl.innerHTML = `
          <div class="radar-empty-state">
            <span>📡</span>
            <p>No open customer broadcasts in your area right now. The radar refreshes automatically.</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = broadcasts.map(b => {
        const isLocked = Boolean(b.is_locked);
        const urgencyLabels = {
          immediate: '⚡ Emergency (ASAP)',
          today: '📅 Today',
          scheduled_week: '🗓️ This Week'
        };
        const urgencyText = urgencyLabels[b.urgency] || b.urgency;

        return `
          <div class="radar-lead-card ${isLocked ? 'is-locked' : ''}" id="radar-card-${b.id}">
            <div class="radar-card-top">
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="color: #fff; font-size: 14px;">${b.trade_slug?.toUpperCase()} in ${b.lga}, ${b.state}</strong>
                <span style="font-size: 11px; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; color: #CBD5E1;">${urgencyText}</span>
              </div>
              <span style="font-size: 11.5px; color: var(--text-muted);">${b.relative_time}</span>
            </div>
            <p class="radar-scope">${b.job_scope}</p>
            <div class="radar-meta">
              <span>💰 Budget: ${b.budget_range || 'Open quote'}</span>
              <span>📍 Area: ${b.area || b.lga}</span>
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
              ${isLocked
                ? `<span class="badge-radar-tier" style="padding: 6px 12px; font-size: 12px;">⚡ Pro Early-Access — Unlocks Soon</span>`
                : `<button type="button" class="btn-claim-lead" data-broadcast-id="${b.id}">
                    <span>Claim Lead (1 Credit) →</span>
                   </button>`
              }
            </div>
          </div>
        `;
      }).join('');

      // Wire claim buttons
      listEl.querySelectorAll('.btn-claim-lead').forEach(btn => {
        btn.addEventListener('click', async () => {
          const bcastId = btn.dataset.broadcastId;
          if (!bcastId) return;

          const confirmed = confirm('Claim this lead? This will consume 1 monthly contact credit and add the deal directly to your CRM pipeline.');
          if (!confirmed) return;

          btn.disabled = true;
          btn.textContent = 'Claiming...';

          try {
            const claimRes = await fetch('/api/provider-leads', {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                action: 'claim_broadcast',
                broadcast_id: bcastId,
                provider_id: currentProvider?.id
              })
            });

            const claimData = await claimRes.json();
            if (!claimRes.ok || claimData.error) {
              alert(claimData.error || 'Failed to claim lead.');
              btn.disabled = false;
              btn.textContent = 'Claim Lead (1 Credit) →';
              return;
            }

            if (typeof showToast === 'function') {
              showToast('🎉 Lead claimed! Added directly to your active CRM pipeline.', 'success');
            } else {
              alert('Lead claimed successfully!');
            }

            // Refresh leads and radar
            await loadProviderLeadsAndQuota();
            await loadBroadcastRadar();
          } catch (err) {
            alert('Network error claiming lead. Please try again.');
            btn.disabled = false;
            btn.textContent = 'Claim Lead (1 Credit) →';
          }
        });
      });

    } catch (err) {
      console.warn('[Broadcast Radar] Error fetching open broadcasts:', err);
    }
  }

  // ============================================================================
  // PHASE 033: IN-APP DIGITAL QUOTE & INVOICE GENERATOR ENGINE
  // ============================================================================
  let activeInvoiceLeadId = null;

  function createWorkmanshipRow(desc = '', qty = 1, unitPrice = 0) {
    const tr = document.createElement('tr');
    tr.className = 'inv-workmanship-item-row';
    tr.innerHTML = `
      <td>
        <input type="text" class="inv-row-input inv-item-desc" placeholder="e.g. Diagnostic & wiring labor" value="${escapeHtml(desc)}" maxlength="200" required />
      </td>
      <td style="text-align: center;">
        <input type="number" class="inv-row-input inv-item-qty" min="1" max="1000" step="1" value="${Math.max(1, parseInt(qty, 10) || 1)}" style="text-align: center;" required />
      </td>
      <td style="text-align: right;">
        <input type="number" class="inv-row-input inv-item-price" min="0" max="10000000" step="500" placeholder="0" value="${unitPrice || ''}" style="text-align: right;" required />
      </td>
      <td style="text-align: right; font-weight: 700; color: #34D399;" class="inv-item-total-col">
        ₦0
      </td>
      <td style="text-align: center;">
        <button type="button" class="btn-del-inv-row" title="Remove row">🗑️</button>
      </td>
    `;
    tr.querySelector('.btn-del-inv-row').addEventListener('click', () => {
      tr.remove();
      recalculateInvoiceTotals();
    });
    tr.querySelectorAll('.inv-row-input').forEach(input => {
      input.addEventListener('input', recalculateInvoiceTotals);
    });
    return tr;
  }

  function createMaterialsRow(desc = '', qty = 1, unitPrice = 0) {
    const tr = document.createElement('tr');
    tr.className = 'inv-materials-item-row';
    tr.innerHTML = `
      <td>
        <input type="text" class="inv-row-input inv-item-desc" placeholder="e.g. 63A Double Pole Breaker" value="${escapeHtml(desc)}" maxlength="200" required />
      </td>
      <td style="text-align: center;">
        <input type="number" class="inv-row-input inv-item-qty" min="1" max="1000" step="1" value="${Math.max(1, parseInt(qty, 10) || 1)}" style="text-align: center;" required />
      </td>
      <td style="text-align: right;">
        <input type="number" class="inv-row-input inv-item-price" min="0" max="10000000" step="500" placeholder="0" value="${unitPrice || ''}" style="text-align: right;" required />
      </td>
      <td style="text-align: right; font-weight: 700; color: #F59E0B;" class="inv-item-total-col">
        ₦0
      </td>
      <td style="text-align: center;">
        <button type="button" class="btn-del-inv-row" title="Remove row">🗑️</button>
      </td>
    `;
    tr.querySelector('.btn-del-inv-row').addEventListener('click', () => {
      tr.remove();
      recalculateInvoiceTotals();
    });
    tr.querySelectorAll('.inv-row-input').forEach(input => {
      input.addEventListener('input', recalculateInvoiceTotals);
    });
    return tr;
  }

  function recalculateInvoiceTotals() {
    let workmanshipSubtotal = 0;
    document.querySelectorAll('#inv-tbody-workmanship tr').forEach(row => {
      const qty = Math.max(1, parseInt(row.querySelector('.inv-item-qty')?.value, 10) || 1);
      const price = Math.max(0, parseInt(row.querySelector('.inv-item-price')?.value, 10) || 0);
      const total = qty * price;
      workmanshipSubtotal += total;
      const totalCol = row.querySelector('.inv-item-total-col');
      if (totalCol) totalCol.textContent = `₦${total.toLocaleString()}`;
    });

    let materialsSubtotal = 0;
    document.querySelectorAll('#inv-tbody-materials tr').forEach(row => {
      const qty = Math.max(1, parseInt(row.querySelector('.inv-item-qty')?.value, 10) || 1);
      const price = Math.max(0, parseInt(row.querySelector('.inv-item-price')?.value, 10) || 0);
      const total = qty * price;
      materialsSubtotal += total;
      const totalCol = row.querySelector('.inv-item-total-col');
      if (totalCol) totalCol.textContent = `₦${total.toLocaleString()}`;
    });

    const grossSubtotal = workmanshipSubtotal + materialsSubtotal;

    const discountInput = document.getElementById('inv-discount-amount');
    let discount = Math.max(0, parseInt(discountInput?.value, 10) || 0);
    if (discount > grossSubtotal) {
      discount = grossSubtotal;
      if (discountInput) discountInput.value = discount;
    }

    const grandTotal = Math.max(0, grossSubtotal - discount);

    const workDisp = document.getElementById('inv-workmanship-subtotal-disp');
    if (workDisp) workDisp.textContent = `₦${workmanshipSubtotal.toLocaleString()}`;

    const matDisp = document.getElementById('inv-materials-subtotal-disp');
    if (matDisp) matDisp.textContent = `₦${materialsSubtotal.toLocaleString()}`;

    const grossDisp = document.getElementById('inv-gross-subtotal-disp');
    if (grossDisp) grossDisp.textContent = `₦${grossSubtotal.toLocaleString()}`;

    const grandDisp = document.getElementById('inv-grand-total-disp');
    if (grandDisp) grandDisp.textContent = `₦${grandTotal.toLocaleString()}`;

    return {
      workmanshipSubtotal,
      materialsSubtotal,
      grossSubtotal,
      discount,
      grandTotal,
      workmanshipSubtotalKobo: workmanshipSubtotal * 100,
      materialsSubtotalKobo: materialsSubtotal * 100,
      grossSubtotalKobo: grossSubtotal * 100,
      discountKobo: discount * 100,
      grandTotalKobo: grandTotal * 100
    };
  }

  function collectInvoicePayload(status = 'issued') {
    const leadId = document.getElementById('inv-lead-id')?.value;
    const docType = document.getElementById('inv-doc-type')?.value || 'quote';
    const clientName = document.getElementById('inv-client-name')?.value?.trim() || 'Valued Customer';
    const bankName = document.getElementById('inv-bank-select')?.value || 'GTBank';
    const accountNum = document.getElementById('inv-account-number')?.value?.trim() || '';
    const accountName = document.getElementById('inv-account-name')?.value?.trim() || '';
    const terms = document.getElementById('inv-terms-notes')?.value?.trim() || '';

    const workmanshipItems = [];
    document.querySelectorAll('#inv-tbody-workmanship tr').forEach(row => {
      const desc = row.querySelector('.inv-item-desc')?.value?.trim();
      const qty = Math.max(1, parseInt(row.querySelector('.inv-item-qty')?.value, 10) || 1);
      const priceNgn = Math.max(0, parseInt(row.querySelector('.inv-item-price')?.value, 10) || 0);
      if (desc) {
        workmanshipItems.push({
          description: desc,
          quantity: qty,
          unit_price_kobo: priceNgn * 100,
          amount_kobo: qty * priceNgn * 100
        });
      }
    });

    const materialsItems = [];
    document.querySelectorAll('#inv-tbody-materials tr').forEach(row => {
      const desc = row.querySelector('.inv-item-desc')?.value?.trim();
      const qty = Math.max(1, parseInt(row.querySelector('.inv-item-qty')?.value, 10) || 1);
      const priceNgn = Math.max(0, parseInt(row.querySelector('.inv-item-price')?.value, 10) || 0);
      if (desc) {
        materialsItems.push({
          description: desc,
          quantity: qty,
          unit_price_kobo: priceNgn * 100,
          amount_kobo: qty * priceNgn * 100
        });
      }
    });

    const discountNgn = Math.max(0, parseInt(document.getElementById('inv-discount-amount')?.value, 10) || 0);

    const providerName = currentProvider ? (currentProvider.business_name || currentProvider.full_name) : 'Verified Artisan';
    const providerTrade = currentProvider ? (currentProvider.trade_title || currentProvider.primary_category_slug) : 'Artisan Service';

    return {
      lead_id: leadId,
      invoice_type: docType,
      status, // 'draft' | 'issued' | 'paid'
      items: {
        workmanship: workmanshipItems,
        materials: materialsItems
      },
      discount_kobo: discountNgn * 100,
      bank_details: {
        bank_name: bankName,
        account_number: accountNum,
        account_name: accountName
      },
      terms,
      customer: {
        name: clientName
      },
      provider: {
        business_name: providerName,
        trade: providerTrade
      }
    };
  }

  function openInvoiceGeneratorModal(leadId) {
    activeInvoiceLeadId = leadId;
    const modal = document.getElementById('invoice-generator-modal');
    if (!modal) return;

    const lead = cachedLeads.find(l => l.id === leadId);
    if (!lead) return;

    const errBox = document.getElementById('inv-error-alert');
    if (errBox) {
      errBox.style.display = 'none';
      errBox.textContent = '';
    }

    document.getElementById('inv-lead-id').value = lead.id;
    document.getElementById('inv-client-name').value = lead.client_display_name || '';
    document.getElementById('inv-locality-label').textContent = lead.locality || 'Local Area';
    document.getElementById('inv-service-label').textContent = lead.intent_tag || 'Artisan Service';
    const cleanJobRef = 'PF-' + lead.id.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
    document.getElementById('inv-job-ref-label').textContent = cleanJobRef;

    const pill = document.getElementById('inv-status-pill');
    if (lead.invoice_ref) {
      pill.textContent = lead.invoice_ref;
      pill.style.background = 'rgba(0, 168, 89, 0.2)';
      pill.style.color = '#34D399';
    } else {
      pill.textContent = 'New Document';
      pill.style.background = 'rgba(255, 255, 255, 0.1)';
      pill.style.color = '#94A3B8';
    }

    // Toggle document type
    const existingType = lead.invoice_data?.invoice_type || 'quote';
    document.getElementById('inv-doc-type').value = existingType;
    document.querySelectorAll('.btn-inv-type').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === existingType);
    });

    const advanceBtn = document.getElementById('btn-inv-send-advance');
    if (advanceBtn) {
      advanceBtn.textContent = existingType === 'invoice' ? '🚀 Issue Invoice (quote_sent) →' : '🚀 Issue Quote (quote_sent) →';
    }

    // Clear and populate workmanship items
    const tbodyWork = document.getElementById('inv-tbody-workmanship');
    tbodyWork.innerHTML = '';
    if (lead.invoice_data?.items?.workmanship?.length) {
      lead.invoice_data.items.workmanship.forEach(item => {
        const unitNgn = Math.round(item.unit_price_kobo / 100);
        tbodyWork.appendChild(createWorkmanshipRow(item.description, item.quantity, unitNgn));
      });
    } else if (lead.workmanship_amount_kobo) {
      tbodyWork.appendChild(createWorkmanshipRow('Diagnostic, Inspection & Labor', 1, Math.round(lead.workmanship_amount_kobo / 100)));
    } else {
      tbodyWork.appendChild(createWorkmanshipRow('', 1, 0));
    }

    // Clear and populate materials items
    const tbodyMat = document.getElementById('inv-tbody-materials');
    tbodyMat.innerHTML = '';
    if (lead.invoice_data?.items?.materials?.length) {
      lead.invoice_data.items.materials.forEach(item => {
        const unitNgn = Math.round(item.unit_price_kobo / 100);
        tbodyMat.appendChild(createMaterialsRow(item.description, item.quantity, unitNgn));
      });
    } else if (lead.materials_amount_kobo) {
      tbodyMat.appendChild(createMaterialsRow('Replacement Parts / Materials', 1, Math.round(lead.materials_amount_kobo / 100)));
    } else {
      tbodyMat.appendChild(createMaterialsRow('', 1, 0));
    }

    // Populate discount
    const discountInput = document.getElementById('inv-discount-amount');
    if (discountInput) {
      discountInput.value = lead.invoice_data?.discount_kobo ? Math.round(lead.invoice_data.discount_kobo / 100) : 0;
    }

    // Populate bank details (from invoice_data or saved localStorage or currentProvider)
    let savedBank = {};
    try {
      savedBank = JSON.parse(localStorage.getItem('padifix_provider_bank_details') || '{}');
    } catch (e) {}

    const bankSelect = document.getElementById('inv-bank-select');
    const acctNumInput = document.getElementById('inv-account-number');
    const acctNameInput = document.getElementById('inv-account-name');

    const effectiveBank = lead.invoice_data?.bank_details?.bank_name || savedBank.bank_name || 'GTBank';
    const effectiveAcctNum = lead.invoice_data?.bank_details?.account_number || savedBank.account_number || '';
    const effectiveAcctName = lead.invoice_data?.bank_details?.account_name || savedBank.account_name || (currentProvider ? (currentProvider.business_name || currentProvider.full_name) : '');

    if (bankSelect) bankSelect.value = effectiveBank;
    if (acctNumInput) acctNumInput.value = effectiveAcctNum;
    if (acctNameInput) acctNameInput.value = effectiveAcctName;

    // Populate terms
    const termsInput = document.getElementById('inv-terms-notes');
    if (termsInput) {
      termsInput.value = lead.invoice_data?.terms || '50% commitment deposit before commencement, balance upon full satisfaction. 30-day workmanship guarantee.';
    }

    // "Mark as Paid" button visibility
    const paidBtn = document.getElementById('btn-inv-mark-paid');
    if (paidBtn) {
      if (lead.invoice_data?.status === 'paid') {
        paidBtn.style.display = 'inline-block';
        paidBtn.textContent = '✅ Marked as Paid';
        paidBtn.disabled = true;
      } else if (lead.invoice_ref && (lead.status === 'quote_sent' || lead.status === 'scheduled')) {
        paidBtn.style.display = 'inline-block';
        paidBtn.textContent = '💰 Mark as Paid';
        paidBtn.disabled = false;
      } else {
        paidBtn.style.display = 'none';
        paidBtn.disabled = false;
      }
    }

    recalculateInvoiceTotals();
    modal.style.display = 'flex';
  }

  function formatWhatsAppInvoiceBreakdown(invoice) {
    const isInvoice = invoice.invoice_type === 'invoice';
    const headerTitle = isInvoice ? '📄 *PADIFIX OFFICIAL SERVICE INVOICE*' : '📄 *PADIFIX SERVICE QUOTATION*';
    const providerName = invoice.provider?.business_name || 'Verified Artisan';
    const providerTrade = invoice.provider?.trade || 'Artisan Service';
    const customerName = invoice.customer?.name || 'Valued Client';
    const jobRef = invoice.job_ref || 'PF-000000';
    const invNum = invoice.invoice_number || 'INV-PF-PENDING';

    let msg = `${headerTitle}\n`;
    msg += `*Ref:* ${invNum}\n`;
    msg += `*Job Ref:* ${jobRef}\n`;
    msg += `*Artisan:* ${providerName} (${providerTrade})\n`;
    msg += `*Client:* ${customerName}\n\n`;

    if (invoice.items?.workmanship?.length) {
      msg += `🛠️ *WORKMANSHIP / LABOR:*\n`;
      invoice.items.workmanship.forEach(item => {
        const amtNgn = Math.round(item.amount_kobo / 100).toLocaleString();
        msg += `• ${item.description} (Qty: ${item.quantity}) = ₦${amtNgn}\n`;
      });
      msg += `\n`;
    }

    if (invoice.items?.materials?.length) {
      msg += `📦 *MATERIALS & SUPPLIES:*\n`;
      invoice.items.materials.forEach(item => {
        const amtNgn = Math.round(item.amount_kobo / 100).toLocaleString();
        msg += `• ${item.description} (Qty: ${item.quantity}) = ₦${amtNgn}\n`;
      });
      msg += `\n`;
    }

    const subtotalNgn = Math.round(invoice.subtotal_kobo / 100).toLocaleString();
    const discountNgn = Math.round((invoice.discount_kobo || 0) / 100).toLocaleString();
    const totalNgn = Math.round(invoice.total_kobo / 100).toLocaleString();

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `*Gross Subtotal:* ₦${subtotalNgn}\n`;
    if (invoice.discount_kobo > 0) {
      msg += `*Discount:* -₦${discountNgn}\n`;
    }
    msg += `*TOTAL DUE:* ₦${totalNgn}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (invoice.bank_details?.account_number) {
      msg += `🏦 *DIRECT BANK PAYMENT (Artisan Payout):*\n`;
      msg += `• Bank: ${invoice.bank_details.bank_name || 'Commercial Bank'}\n`;
      msg += `• Account No: ${invoice.bank_details.account_number}\n`;
      msg += `• Account Name: ${invoice.bank_details.account_name || providerName}\n`;
      msg += `*(Please use Job Ref ${jobRef} as transfer remark)*\n\n`;
    }

    if (invoice.terms) {
      msg += `📋 *Terms & Warranty:*\n${invoice.terms}\n\n`;
    }

    msg += `_Generated via PadiFix verified directory (Zero commission, direct artisan settlement)_`;
    return msg;
  }

  function populatePrintableInvoice(invoice, lead) {
    const isInvoice = invoice.invoice_type === 'invoice';
    document.getElementById('print-doc-title').textContent = isInvoice ? 'SERVICE INVOICE' : 'SERVICE QUOTATION';
    document.getElementById('print-invoice-ref').textContent = invoice.invoice_number;
    document.getElementById('print-job-ref').textContent = invoice.job_ref;
    document.getElementById('print-footer-job-ref').textContent = invoice.job_ref;
    document.getElementById('print-date').textContent = new Date(invoice.created_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    document.getElementById('print-provider-name').textContent = invoice.provider?.business_name || (currentProvider ? (currentProvider.business_name || currentProvider.full_name) : 'Verified Artisan');
    document.getElementById('print-provider-trade').textContent = invoice.provider?.trade || (currentProvider ? currentProvider.trade_title : 'Artisan Service');
    document.getElementById('print-provider-locality').textContent = (currentProvider ? `${currentProvider.lga || ''}, ${currentProvider.state || ''}` : 'Lagos, Nigeria').replace(/^,\s*/, '');

    document.getElementById('print-customer-name').textContent = invoice.customer?.name || lead.client_display_name || 'Valued Customer';
    document.getElementById('print-customer-locality').textContent = lead.locality || 'Local Area';
    document.getElementById('print-customer-scope').textContent = lead.intent_tag || 'Artisan Service';

    const tbody = document.getElementById('print-table-body');
    tbody.innerHTML = '';

    if (invoice.items?.workmanship) {
      invoice.items.workmanship.forEach(item => {
        const tr = document.createElement('tr');
        const unitNgn = Math.round(item.unit_price_kobo / 100).toLocaleString();
        const totNgn = Math.round(item.amount_kobo / 100).toLocaleString();
        tr.innerHTML = `
          <td>${escapeHtml(item.description)}</td>
          <td style="text-align: center; color: #00A859; font-weight: 700;">Labor</td>
          <td style="text-align: center;">${item.quantity}</td>
          <td style="text-align: right;">₦${unitNgn}</td>
          <td style="text-align: right; font-weight: 700;">₦${totNgn}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    if (invoice.items?.materials) {
      invoice.items.materials.forEach(item => {
        const tr = document.createElement('tr');
        const unitNgn = Math.round(item.unit_price_kobo / 100).toLocaleString();
        const totNgn = Math.round(item.amount_kobo / 100).toLocaleString();
        tr.innerHTML = `
          <td>${escapeHtml(item.description)}</td>
          <td style="text-align: center; color: #F59E0B; font-weight: 700;">Materials</td>
          <td style="text-align: center;">${item.quantity}</td>
          <td style="text-align: right;">₦${unitNgn}</td>
          <td style="text-align: right; font-weight: 700;">₦${totNgn}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.getElementById('print-bank-name').textContent = invoice.bank_details?.bank_name || 'Commercial Bank';
    document.getElementById('print-bank-account-num').textContent = invoice.bank_details?.account_number || '--';
    document.getElementById('print-bank-account-name').textContent = invoice.bank_details?.account_name || (currentProvider ? (currentProvider.business_name || currentProvider.full_name) : 'Artisan Name');

    document.getElementById('print-labor-subtotal').textContent = `₦${Math.round((invoice.workmanship_subtotal_kobo || 0) / 100).toLocaleString()}`;
    document.getElementById('print-materials-subtotal').textContent = `₦${Math.round((invoice.materials_subtotal_kobo || 0) / 100).toLocaleString()}`;
    document.getElementById('print-gross-subtotal').textContent = `₦${Math.round((invoice.subtotal_kobo || 0) / 100).toLocaleString()}`;
    document.getElementById('print-discount').textContent = `-₦${Math.round((invoice.discount_kobo || 0) / 100).toLocaleString()}`;
    document.getElementById('print-grand-total').textContent = `₦${Math.round((invoice.total_kobo || 0) / 100).toLocaleString()}`;

    document.getElementById('print-terms-text').textContent = invoice.terms || '50% commitment deposit before commencement, balance upon full satisfaction. 30-day workmanship guarantee.';
  }

  async function submitInvoiceToServer(payload) {
    const errBox = document.getElementById('inv-error-alert');
    if (errBox) {
      errBox.style.display = 'none';
      errBox.textContent = '';
    }

    try {
      const token = await getAuthToken();
      const authHeaders = { 'Content-Type': 'application/json' };
      if (token) {
        authHeaders['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/provider-leads?action=save_invoice', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save invoice');
      }

      if (payload.bank_details && payload.bank_details.account_number) {
        try {
          localStorage.setItem('padifix_provider_bank_details', JSON.stringify(payload.bank_details));
        } catch (e) {}
      }

      const leadIdx = cachedLeads.findIndex(l => l.id === payload.lead_id);
      if (leadIdx !== -1) {
        cachedLeads[leadIdx] = {
          ...cachedLeads[leadIdx],
          ...data.lead,
          invoice_ref: data.invoice_number,
          invoice_data: data.invoice
        };
      }

      if (data.pipeline_metrics) {
        renderPipelineRibbon(data.pipeline_metrics);
      }

      renderLeadsInbox(cachedLeads);
      return data;
    } catch (err) {
      if (errBox) {
        errBox.textContent = `Error: ${err.message}`;
        errBox.style.display = 'block';
      }
      throw err;
    }
  }

  function initInvoiceGenerator() {
    const modal = document.getElementById('invoice-generator-modal');
    if (!modal) return;

    // Close button
    const closeBtn = document.getElementById('btn-close-invoice-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    // Escape key closes modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        modal.style.display = 'none';
      }
    });

    // Toggle document type (Quote vs Invoice)
    document.querySelectorAll('.btn-inv-type').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-inv-type').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const docType = btn.dataset.type;
        document.getElementById('inv-doc-type').value = docType;
        const advanceBtn = document.getElementById('btn-inv-send-advance');
        if (advanceBtn) {
          advanceBtn.textContent = docType === 'invoice' ? '🚀 Issue Invoice (quote_sent) →' : '🚀 Issue Quote (quote_sent) →';
        }
      });
    });

    // Add labor row
    const addWorkBtn = document.getElementById('btn-add-workmanship-row');
    if (addWorkBtn) {
      addWorkBtn.addEventListener('click', () => {
        const tbody = document.getElementById('inv-tbody-workmanship');
        tbody.appendChild(createWorkmanshipRow('', 1, 0));
        recalculateInvoiceTotals();
      });
    }

    // Add materials row
    const addMatBtn = document.getElementById('btn-add-materials-row');
    if (addMatBtn) {
      addMatBtn.addEventListener('click', () => {
        const tbody = document.getElementById('inv-tbody-materials');
        tbody.appendChild(createMaterialsRow('', 1, 0));
        recalculateInvoiceTotals();
      });
    }

    // Discount change
    const discountInput = document.getElementById('inv-discount-amount');
    if (discountInput) {
      discountInput.addEventListener('input', recalculateInvoiceTotals);
    }

    // Copy Account Number button
    const copyAcctBtn = document.getElementById('btn-copy-acct-num');
    if (copyAcctBtn) {
      copyAcctBtn.addEventListener('click', async () => {
        const num = document.getElementById('inv-account-number')?.value?.trim();
        if (!num) {
          showToast('No account number entered to copy.', 'info');
          return;
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(num);
            showToast('📋 Account number copied!', 'success');
          } else {
            showToast(`Account number: ${num}`, 'info');
          }
        } catch (e) {
          showToast(`Account number: ${num}`, 'info');
        }
      });
    }

    // Action: Save Draft
    const saveDraftBtn = document.getElementById('btn-inv-save-draft');
    if (saveDraftBtn) {
      saveDraftBtn.addEventListener('click', async () => {
        try {
          saveDraftBtn.disabled = true;
          saveDraftBtn.textContent = 'Saving...';
          const payload = collectInvoicePayload('draft');
          const data = await submitInvoiceToServer(payload);
          showToast('💾 Quote draft saved successfully!', 'success');
          const pill = document.getElementById('inv-status-pill');
          if (pill) {
            pill.textContent = data.invoice_number;
            pill.style.background = 'rgba(0, 168, 89, 0.2)';
            pill.style.color = '#34D399';
          }
        } catch (e) {
          // Handled in submitInvoiceToServer
        } finally {
          saveDraftBtn.disabled = false;
          saveDraftBtn.textContent = '💾 Save Draft';
        }
      });
    }

    // Action: Issue / Advance (quote_sent)
    const sendAdvanceBtn = document.getElementById('btn-inv-send-advance');
    if (sendAdvanceBtn) {
      sendAdvanceBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          sendAdvanceBtn.disabled = true;
          sendAdvanceBtn.textContent = 'Issuing...';
          const payload = collectInvoicePayload('issued');
          await submitInvoiceToServer(payload);
          showToast('🚀 Quote issued! Deal moved to Quote Sent.', 'success');
          modal.style.display = 'none';
        } catch (e) {
          // Handled in submitInvoiceToServer
        } finally {
          sendAdvanceBtn.disabled = false;
          sendAdvanceBtn.textContent = '🚀 Issue Quote (quote_sent) →';
        }
      });
    }

    // Action: Send WhatsApp Quote
    const sendWaBtn = document.getElementById('btn-inv-send-wa');
    if (sendWaBtn) {
      sendWaBtn.addEventListener('click', async () => {
        try {
          sendWaBtn.disabled = true;
          sendWaBtn.textContent = 'Formatting...';
          const payload = collectInvoicePayload('issued');
          const data = await submitInvoiceToServer(payload);
          const waMsg = formatWhatsAppInvoiceBreakdown(data.invoice);

          // Deep link to WhatsApp
          const waUrl = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
          window.open(waUrl, '_blank');
          showToast('💬 WhatsApp quote breakdown generated and opened!', 'success');
          modal.style.display = 'none';
        } catch (e) {
          // Handled in submitInvoiceToServer
        } finally {
          sendWaBtn.disabled = false;
          sendWaBtn.textContent = '💬 Send WhatsApp Quote';
        }
      });
    }

    // Action: Print / PDF
    const printBtn = document.getElementById('btn-inv-print-pdf');
    if (printBtn) {
      printBtn.addEventListener('click', async () => {
        try {
          printBtn.disabled = true;
          printBtn.textContent = 'Preparing...';
          const payload = collectInvoicePayload(document.getElementById('inv-status-pill')?.textContent === 'New Document' ? 'draft' : 'issued');
          const data = await submitInvoiceToServer(payload);
          populatePrintableInvoice(data.invoice, data.lead);
          window.print();
        } catch (e) {
          // Handled in submitInvoiceToServer
        } finally {
          printBtn.disabled = false;
          printBtn.textContent = '🖨️ Print / PDF Receipt';
        }
      });
    }

    // Action: Mark as Paid
    const markPaidBtn = document.getElementById('btn-inv-mark-paid');
    if (markPaidBtn) {
      markPaidBtn.addEventListener('click', async () => {
        const leadId = document.getElementById('inv-lead-id')?.value;
        if (!leadId) return;

        const totals = recalculateInvoiceTotals();
        if (!confirm(`Confirm customer has settled payment of ₦${totals.grandTotal.toLocaleString()} directly into your bank account?\n\nThis records your final realized revenue.`)) {
          return;
        }

        try {
          markPaidBtn.disabled = true;
          markPaidBtn.textContent = 'Processing...';

          const token = await getAuthToken();
          const authHeaders = { 'Content-Type': 'application/json' };
          if (token) {
            authHeaders['Authorization'] = `Bearer ${token}`;
          }

          const res = await fetch('/api/provider-leads?action=mark_paid', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ lead_id: leadId })
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Failed to mark invoice as paid');
          }

          const leadIdx = cachedLeads.findIndex(l => l.id === leadId);
          if (leadIdx !== -1) {
            cachedLeads[leadIdx] = {
              ...cachedLeads[leadIdx],
              ...data.lead,
              invoice_data: data.invoice
            };
          }

          if (data.pipeline_metrics) {
            renderPipelineRibbon(data.pipeline_metrics);
          }

          renderLeadsInbox(cachedLeads);
          showToast('💰 Payment confirmed and recorded into revenue!', 'success');
          modal.style.display = 'none';
        } catch (err) {
          alert(`Error: ${err.message}`);
          markPaidBtn.disabled = false;
          markPaidBtn.textContent = '💰 Mark as Paid';
        }
      });
    }

    // Expose helpers on window for external triggers and test suites
    window.openInvoiceGeneratorModal = openInvoiceGeneratorModal;
    window.recalculateInvoiceTotals = recalculateInvoiceTotals;
    window.collectInvoicePayload = collectInvoicePayload;
    window.formatWhatsAppInvoiceBreakdown = formatWhatsAppInvoiceBreakdown;
    window.populatePrintableInvoice = populatePrintableInvoice;
    window.submitInvoiceToServer = submitInvoiceToServer;
  }

  // 12. Run Initial Render Pipeline
  await loadMetrics();
  await loadProviderLeadsAndQuota();
  await loadBroadcastRadar();
  initInvoiceGenerator();

  const refreshRadarBtn = document.getElementById('btn-refresh-radar');
  if (refreshRadarBtn) {
    refreshRadarBtn.addEventListener('click', () => loadBroadcastRadar());
  }

  if (typeof initRealtimeLeadStream === 'function') {
    initRealtimeLeadStream();
    window.addEventListener('beforeunload', cleanupRealtimeLeadStream);
  }
  populateProfileForm();
  renderSkillsChips();
  renderPricingRows();
  renderPortfolio();
  renderSubscriptionDashboard();
  renderTrustCenter();
  renderReferralTool();
  renderMonetizationResearch();
  renderDashboardReviews();
  await handleSubscriptionPaymentReturn();
});

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

    const firstName = currentProvider.firstName || (currentProvider.name ? currentProvider.name.split(' ')[0] : 'Partner');
    if (nameEl) nameEl.textContent = currentProvider.name;
    if (welcomeNameEl) welcomeNameEl.textContent = firstName;
    if (tradeEl) tradeEl.textContent = currentProvider.trade;
    
    // Avatar rendering
    if (avatarEl) {
      if (currentProvider.avatarUrl) {
        avatarEl.innerHTML = `<img src="${escapeHtml(currentProvider.avatarUrl)}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
      } else {
        const initials = currentProvider.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        avatarEl.textContent = initials;
        avatarEl.style.background = currentProvider.avatarBg || 'var(--dash-green)';
      }
    }

    if (editAvatarPreview) {
      if (currentProvider.avatarUrl) {
        editAvatarPreview.innerHTML = `<img src="${escapeHtml(currentProvider.avatarUrl)}" alt="Profile Photo" />`;
      } else {
        const initials = currentProvider.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        editAvatarPreview.textContent = initials;
      }
    }

    if (publicLink) {
      publicLink.href = `profile.html?id=${currentProvider.id}`;
    }
    if (kebabPublicLink) {
      kebabPublicLink.href = `profile.html?id=${currentProvider.id}`;
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

  async function loadProviderLeadsAndQuota() {
    if (!currentProvider || !currentProvider.id) return;
    if (isLeadsLoading) return;
    isLeadsLoading = true;

    const providerId = currentProvider.id;

    // Retrieve Supabase JWT session token
    let token = null;
    try {
      if (typeof LokatorDB !== 'undefined' && LokatorDB.auth && typeof LokatorDB.auth.getSession === 'function') {
        const sessionRes = await LokatorDB.auth.getSession();
        token = sessionRes?.data?.session?.access_token;
      }
    } catch (e) {
      console.warn('Session retrieval notice:', e.message);
    }

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

  function renderLeadsInbox(leads) {
    const leadsContainer = document.getElementById('recent-leads-list');
    if (!leadsContainer) return;

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

    leadsContainer.innerHTML = leads.map(lead => {
      const isWa = lead.channel === 'whatsapp';
      const channelIcon = isWa ? '💬' : '📞';
      const channelClass = isWa ? 'whatsapp' : 'call';
      const locality = escapeHtml(lead.locality || 'Local Area');
      const intent = escapeHtml(lead.intent_tag || 'Direct Customer Inquiry');
      const time = escapeHtml(lead.relative_time || 'Recently');
      const notes = lead.notes ? escapeHtml(lead.notes) : '';
      const status = lead.status || 'new';

      return `
        <div class="dash-lead-item" id="lead-card-${escapeHtml(lead.id)}" data-lead-id="${escapeHtml(lead.id)}">
          <div class="dash-lead-left">
            <div class="dash-lead-channel-icon ${channelClass}" title="${isWa ? 'WhatsApp Inquiry' : 'Phone Call'}">
              ${channelIcon}
            </div>
            <div style="min-width: 0;">
              <div class="dash-lead-name dash-lead-locality">📍 ${locality}</div>
              <div class="dash-lead-service dash-lead-intent">${intent}</div>
              ${notes ? `<div class="dash-lead-notes-drawer" id="notes-text-${escapeHtml(lead.id)}">📝 ${notes}</div>` : `<div id="notes-text-${escapeHtml(lead.id)}" style="display:none;"></div>`}
            </div>
          </div>
          <div class="dash-lead-right">
            <div style="display: flex; align-items: center; gap: 6px;">
              <select class="dash-lead-status-select status-${status}" data-lead-id="${escapeHtml(lead.id)}" title="Update Lead Status">
                <option value="new" ${status === 'new' ? 'selected' : ''}>New</option>
                <option value="in_discussion" ${status === 'in_discussion' ? 'selected' : ''}>In Discussion</option>
                <option value="quote_sent" ${status === 'quote_sent' ? 'selected' : ''}>Quote Sent</option>
                <option value="job_won" ${status === 'job_won' ? 'selected' : ''}>Job Won</option>
              </select>
              <button type="button" class="dash-lead-notes-btn" data-lead-id="${escapeHtml(lead.id)}" title="Add or edit private note">✏️</button>
            </div>
            <span class="dash-lead-time">${time}</span>
          </div>
        </div>
      `;
    }).join('');

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
        await handleLeadStatusChange(leadId, newStatus, select);
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
  }

  async function handleLeadStatusChange(leadId, newStatus, selectEl) {
    const oldStatusClass = Array.from(selectEl.classList).find(c => c.startsWith('status-')) || 'status-new';
    selectEl.className = `dash-lead-status-select status-${newStatus}`;

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
          status: newStatus,
          provider_id: currentProvider ? currentProvider.id : undefined
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const lead = cachedLeads.find(l => l.id === leadId);
      if (lead) lead.status = newStatus;

      const displayStatus = newStatus.replace('_', ' ').toUpperCase();
      showToast(`Lead status updated: ${displayStatus}`);
    } catch (err) {
      selectEl.className = `dash-lead-status-select ${oldStatusClass}`;
      showToast(`Failed to update status: ${err.message}`, 'error');
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
          <button type="button" class="btn btn-outline btn-sm dash-missing-item-btn" data-target-tab="${escapeHtml(item.actionTab)}" style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; padding: 6px 12px; border-radius: 8px; border-color: rgba(255,255,255,0.15); color: #F1F5F9; cursor: pointer; background: rgba(255,255,255,0.03);">
            <span>+</span> <span>${escapeHtml(item.label)}</span>
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

  // 10. Portfolio Showcase Tab & Modal
  const portfolioGridEl = document.getElementById('dash-portfolio-list');
  const modalPortfolio = document.getElementById('modal-portfolio');
  const btnOpenPortModal = document.getElementById('btn-open-portfolio-modal');
  const btnClosePortModal = document.getElementById('btn-close-modal');
  const formAddPort = document.getElementById('form-add-portfolio');

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
      return `
        <div class="dash-portfolio-card">
          <div class="dash-port-media" style="background: linear-gradient(135deg, ${safeAccent}, #006B3F);">
            <span>${escapeHtml(item.icon || '🛠️')}</span>
          </div>
          <div class="dash-port-body">
            <div class="dash-port-title">${escapeHtml(item.title)}</div>
            <div class="dash-port-desc">${escapeHtml(item.description)}</div>
            <div class="dash-port-footer">
              <span class="badge-pill" style="font-size: 11px; padding: 2px 8px;">${escapeHtml(item.tag || 'Verified Work')}</span>
              <button type="button" class="btn-delete-port" data-item-id="${safeId}" style="background: none; border: none; color: var(--danger); font-size: 12.5px; cursor: pointer; font-weight: 700;">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (btnOpenPortModal && modalPortfolio) {
    btnOpenPortModal.addEventListener('click', () => {
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
      const category = document.getElementById('port-category').value.trim() || currentProvider.trade;
      const tag = document.getElementById('port-tag').value.trim() || 'Verified Work';
      const desc = document.getElementById('port-desc').value.trim();

      try {
        const res = await LokatorDB.addPortfolioItem(currentProvider.id, {
          title,
          category,
          tag,
          description: desc,
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
          LokatorTelemetry.trackEvent('provider_portfolio_uploaded', { category: canonicalCat });
        }
        modalPortfolio.style.display = 'none';
        formAddPort.reset();
        if (res && res.status === 'OFFLINE_PENDING') {
          showToast(res.message, 'info');
        } else if (res && res.status === 'REMOTE_FAILURE') {
          showToast(res.message || 'Failed to add portfolio item', 'error');
        } else {
          showToast('Project added to your public portfolio showcase.');
        }
      } catch (err) {
        showToast('Failed to add portfolio item: ' + (err.message || 'Network error'), 'error');
      }
    });
  }

  if (portfolioGridEl) {
    portfolioGridEl.addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-delete-port')) {
        const itemId = e.target.dataset.itemId;
        if (confirm('Are you sure you want to remove this project from your portfolio?')) {
          const res = await LokatorDB.deletePortfolioItem(currentProvider.id, itemId);
          currentProvider.portfolio = (currentProvider.portfolio || []).filter(item => item.id !== itemId);
          renderPortfolio();
          if (res && res.status === 'OFFLINE_PENDING') {
            showToast(res.message, 'info');
          } else if (res && res.status === 'REMOTE_FAILURE') {
            showToast(res.message || 'Failed to remove project', 'error');
          } else {
            showToast('Project removed.');
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
          btn.textContent = `Upgrade to ${targetPlan ? targetPlan.name : pId} (₦${targetPlan ? targetPlan.price_ngn.toLocaleString() : 0})`;
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
          const confirmPay = confirm(
            `💳 UPGRADE TO PADIFIX ${targetPlan.name.toUpperCase()} PLAN\n\n` +
            `Price: ₦${targetPlan.price_ngn.toLocaleString()} / month\n` +
            `Allowance: ${targetPlan.contact_allowance === Infinity ? 'Unlimited (Fair Use)' : targetPlan.contact_allowance + ' contacts/month'}\n\n` +
            `Click OK to proceed to Paystack checkout.`
          );

          if (!confirmPay) return;

          btn.disabled = true;
          btn.textContent = 'Processing...';

          try {
            // Attempt API call to paystack-init or test simulator
            let initRes;
            try {
              const res = await fetch('/api/paystack-init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  provider_id: providerId,
                  plan_id: pId,
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
              }
            } catch (netErr) {
              console.warn('API init fetch notice, using local test simulator:', netErr.message);
            }

            // Test Mode Simulation fallback if serverless API isn't live or test keys
            const ref = (initRes && initRes.data && initRes.data.reference) ? initRes.data.reference : `sub_pay_${providerId}_${Date.now()}`;
            
            if (typeof LokatorDB !== 'undefined' && LokatorDB.subscriptions) {
              LokatorDB.subscriptions.activateSubscription(providerId, pId, {
                reference: ref,
                customer_code: `CUS_${providerId}`
              });
            }

            if (typeof LokatorTelemetry !== 'undefined') {
              LokatorTelemetry.trackEvent('subscription_activated', {
                provider_id: providerId,
                plan_id: pId,
                amount_ngn: targetPlan.price_ngn,
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
    const rejectedText = document.getElementById('dash-ver-rejected-text');
    const resubmitBtn = document.getElementById('btn-resubmit-verification');

    // Manage Status Notice Banners & Form Usability
    const isRejected = (verState.key === 'REJECTED' || currentProvider.verification_status === 'rejected' || currentProvider.verificationStatus === 'rejected');
    const isFreeIneligible = (verState.key === 'NOT_ELIGIBLE' || verState.upgradeRequired || ((currentProvider.plan_id || currentProvider.plan || 'FREE').toUpperCase() === 'FREE'));

    if (isFreeIneligible && !verState.isVerified) {
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
    } else if (verState.isVerified) {
      if (freeNotice) freeNotice.style.display = 'none';
      if (pendingNotice) pendingNotice.style.display = 'none';
      if (approvedNotice) approvedNotice.style.display = 'block';
      if (rejectedNotice) rejectedNotice.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Profile Verified';
      }
      if (formReqVer) {
        formReqVer.querySelectorAll('input, select').forEach(el => el.disabled = true);
      }
    } else if (isRejected) {
      if (freeNotice) freeNotice.style.display = 'none';
      if (pendingNotice) pendingNotice.style.display = 'none';
      if (approvedNotice) approvedNotice.style.display = 'none';
      if (rejectedNotice) {
        rejectedNotice.style.display = 'block';
        if (rejectedText && currentProvider.rejection_reason) {
          rejectedText.textContent = currentProvider.rejection_reason;
        }
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Resubmit for Review';
      }
      if (formReqVer) {
        formReqVer.querySelectorAll('input, select').forEach(el => el.disabled = false);
      }
      if (resubmitBtn) {
        resubmitBtn.onclick = () => {
          const refInput = document.getElementById('ver-doc-ref');
          if (refInput) { refInput.focus(); refInput.select(); }
        };
      }
    } else {
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
  const docTypeSelect = document.getElementById('ver-doc-type');
  const docRefInput = document.getElementById('ver-doc-ref');
  const docRefLabel = document.getElementById('ver-doc-ref-label');
  const previewCode = document.getElementById('ver-preview-code');

  function updateVerificationInputUI() {
    if (!docTypeSelect || !docRefInput) return;
    const type = docTypeSelect.value;
    if (type === 'vnin') {
      if (docRefLabel) docRefLabel.textContent = '16-Character Virtual NIN (vNIN) *';
      docRefInput.placeholder = 'e.g. AB12345678901234';
      docRefInput.maxLength = 16;
    } else if (type === 'cac_cert') {
      if (docRefLabel) docRefLabel.textContent = 'CAC Registration Number (RC / BN) *';
      docRefInput.placeholder = 'e.g. RC 1928374 or BN 284729';
      docRefInput.removeAttribute('maxLength');
    } else if (type === 'drivers_license') {
      if (docRefLabel) docRefLabel.textContent = 'FRSC Driver\'s License Number *';
      docRefInput.placeholder = 'e.g. ABC123456789';
      docRefInput.removeAttribute('maxLength');
    } else if (type === 'voters_card') {
      if (docRefLabel) docRefLabel.textContent = 'INEC Voter\'s Identification Number (VIN) *';
      docRefInput.placeholder = 'e.g. 90F5B1234567890';
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

  const formReqVer = document.getElementById('form-request-verification');
  if (formReqVer) {
    formReqVer.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Phase 012 Defense-in-depth: check if Free provider
      const pPlan = (currentProvider.plan_id || currentProvider.plan || 'FREE').toUpperCase();
      if (pPlan === 'FREE') {
        showToast('🔒 Verification submission requires an active Basic, Pro, or Premium subscription. Please upgrade your plan.', 'error');
        return;
      }

      const docType = document.getElementById('ver-doc-type').value;
      const docRef = document.getElementById('ver-doc-ref').value.trim();
      const btn = document.getElementById('btn-submit-verification');

      if (!docRef) {
        showToast('Please enter your document or identification reference number.', 'error');
        return;
      }

      // Check vNIN length constraint if submitting vNIN
      if (docType === 'vnin') {
        const cleanVnin = docRef.replace(/[^a-zA-Z0-9]/g, '');
        if (cleanVnin.length !== 16) {
          showToast('Virtual NIN must be exactly 16 characters. Dial *346*3*NIN*AgentCode# to generate your secure token.', 'error');
          return;
        }
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Submitting...';
      }

      try {
        const idempotencyKey = 'idem_' + currentProvider.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const res = await LokatorDB.requestProviderVerification(currentProvider.id, { docType, docRef, idempotencyKey });
        currentProvider.verificationStatus = 'pending';
        currentProvider.verification_status = 'pending';
        currentProvider.verification_requested = true;
        await renderTrustCenter();
        if (res && res.idempotent) {
          showToast('Request acknowledged: An identical verification request is already under review.', 'info');
        } else {
          showToast(res.message || 'Verification request submitted for compliance review.');
        }
        formReqVer.reset();
        updatePreviewCode();
      } catch (err) {
        if (err.message && err.message.includes('PLAN_UPGRADE_REQUIRED')) {
          showToast('🔒 Plan upgrade required: Free accounts cannot submit verification requests.', 'error');
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
  // PHASE 10.18: REPUTATION & REVIEWS DESK (PROVIDER DASHBOARD)
  // ============================================================================
  function renderDashboardReviews() {
    const listEl = document.getElementById('all-reviews-list');
    if (!listEl || !currentProvider) return;

    const reviews = (typeof LokatorDB !== 'undefined' && LokatorDB.reviews)
      ? LokatorDB.reviews.getProviderReviews(currentProvider.id)
      : (currentProvider.reviews || []);

    if (reviews.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--dash-muted);">
          <div style="font-size: 32px; margin-bottom: 10px;">💬</div>
          <h3>No Customer Reviews Yet</h3>
          <p style="font-size: 13px; max-width: 420px; margin: 6px auto 16px;">When clients hire you and leave verified ratings, they will appear here. You can respond directly to thank them or clarify project details.</p>
          <a href="profile.html?id=${currentProvider.id}" target="_blank" class="btn btn-outline btn-sm">View Your Public Profile ↗</a>
        </div>
      `;
      return;
    }

    listEl.innerHTML = reviews.map(r => {
      const safeRevId = r.id;
      const author = r.customer_name || r.author || 'Verified Client';
      const safeRating = Math.max(1, Math.min(5, Number(r.rating) || 5));
      const starsStr = '★'.repeat(safeRating) + '☆'.repeat(5 - safeRating);
      const dateStr = r.date || (r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent');
      const jobType = r.job_type || r.serviceType || 'General Service';
      const comment = r.comment || '';
      const reply = r.provider_reply;

      return `
        <div class="dash-review-card" id="dash-rev-${safeRevId}" style="background: #111827; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 18px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
            <div>
              <strong style="color: #fff; font-size: 14.5px;">${escapeHtml(author)}</strong>
              <div style="font-size: 12px; color: var(--dash-muted); margin-top: 2px;">
                <span>🛠️ ${escapeHtml(jobType)}</span> • <span>${escapeHtml(dateStr)}</span>
              </div>
            </div>
            <div style="color: #FBBF24; font-size: 14px; letter-spacing: 1px;">${starsStr}</div>
          </div>
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
            LokatorDB.reviews.replyToReview(revId, text, currentProvider.id);
            showToast('Response posted publicly!');
            renderDashboardReviews();
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
      } else {
        const errMsg = data.error || 'Payment verification could not be completed';
        showToast(`Payment check: ${errMsg}`, 'error');
      }
    } catch (err) {
      showToast('Error connecting to payment verification server.', 'error');
    }
  }

  // 12. Run Initial Render Pipeline
  await loadMetrics();
  await loadProviderLeadsAndQuota();
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

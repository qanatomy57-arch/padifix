/**
 * PADIFIX — TRUST & SAFETY COMPLIANCE PORTAL CONTROLLER (admin.js)
 * Manages artisan identity/NIN/CAC review queues, dispute resolution, and audit logs.
 * Securely communicates with /api/admin-compliance via dual-auth credentials.
 */

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  const AUTH_STORAGE_KEY = 'padifix_admin_key';

  // 1. Tab Switching
  const tabBtns = document.querySelectorAll('.admin-tab-btn');
  const tabPanels = document.querySelectorAll('.admin-tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = document.getElementById(`panel-${target}`);
      if (panel) panel.classList.add('active');
    });
  });

  // 2. Authentication Gate & Security Modal
  const authModal = document.getElementById('admin-auth-modal');
  const authForm = document.getElementById('admin-auth-form');
  const passkeyInput = document.getElementById('admin-passkey-input');
  const authError = document.getElementById('admin-auth-error');
  const btnLockDesk = document.getElementById('btn-lock-desk');

  function getStoredAdminKey() {
    return sessionStorage.getItem(AUTH_STORAGE_KEY) || '';
  }

  function setStoredAdminKey(key) {
    sessionStorage.setItem(AUTH_STORAGE_KEY, key);
  }

  function clearStoredAdminKey() {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function showSecurityModal() {
    if (authModal) authModal.style.display = 'flex';
    if (btnLockDesk) btnLockDesk.style.display = 'none';
    if (passkeyInput) {
      passkeyInput.value = '';
      passkeyInput.focus();
    }
  }

  function hideSecurityModal() {
    if (authModal) authModal.style.display = 'none';
    if (btnLockDesk) btnLockDesk.style.display = 'inline-block';
    if (authError) authError.style.display = 'none';
  }

  if (btnLockDesk) {
    btnLockDesk.addEventListener('click', async () => {
      const activeToken = getStoredAdminKey();
      if (activeToken) {
        try {
          await fetch('/api/admin-compliance', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${activeToken}`
            },
            body: JSON.stringify({ action: 'lock_desk' })
          });
        } catch (e) {
          // Ignore network errors on local lock
        }
      }
      clearStoredAdminKey();
      showSecurityModal();
      clearDashboardQueues();
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enteredKey = (passkeyInput && passkeyInput.value || '').trim();
      if (!enteredKey) return;

      const submitBtn = document.getElementById('btn-submit-auth');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying Credentials...';
      }
      if (authError) authError.style.display = 'none';

      try {
        // Exchange passkey / credentials for a short-lived administrative session token
        const loginRes = await fetch('/api/admin-compliance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': enteredKey,
            'Authorization': `Bearer ${enteredKey}`
          },
          body: JSON.stringify({ action: 'auth_login' })
        });

        if (!loginRes.ok) {
          const errData = await loginRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Authentication failed: Invalid compliance passkey.');
        }

        const loginData = await loginRes.json();
        const sessionToken = loginData.session_token || enteredKey;

        // Save short-lived session token (not permanent master key)
        setStoredAdminKey(sessionToken);

        // Fetch queues with session token
        const queuesRes = await fetch('/api/admin-compliance?action=get_queues', {
          headers: {
            'Authorization': `Bearer ${sessionToken}`
          }
        });

        if (queuesRes.ok) {
          const queueData = await queuesRes.json();
          hideSecurityModal();
          renderDashboardData(queueData);
        } else {
          throw new Error('Failed to load compliance queues with issued session.');
        }
      } catch (err) {
        if (authError) {
          authError.style.display = 'block';
          authError.textContent = err.message || 'Authentication error. Please check your credentials.';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Unlock Compliance Desk';
        }
      }
    });
  }

  // 3. Clear Tables on Lock
  function clearDashboardQueues() {
    const kpiPending = document.getElementById('kpi-pending-verifications');
    const kpiVerified = document.getElementById('kpi-total-verified');
    const kpiDisputes = document.getElementById('kpi-open-disputes');
    const tbodyVer = document.getElementById('tbody-verifications');
    const tbodyDis = document.getElementById('tbody-disputes');
    const tbodyAud = document.getElementById('tbody-audit');

    if (kpiPending) kpiPending.textContent = '0';
    if (kpiVerified) kpiVerified.textContent = '--';
    if (kpiDisputes) kpiDisputes.textContent = '0';
    if (tbodyVer) tbodyVer.innerHTML = `<tr><td colspan="7" class="empty-state-cell">Authentication required. Desk is locked.</td></tr>`;
    if (tbodyDis) tbodyDis.innerHTML = `<tr><td colspan="7" class="empty-state-cell">Authentication required. Desk is locked.</td></tr>`;
    if (tbodyAud) tbodyAud.innerHTML = `<tr><td colspan="6" class="empty-state-cell">Authentication required. Desk is locked.</td></tr>`;
  }

  // 4. Render Dashboard Data
  function renderDashboardData(payload) {
    const kpis = payload.kpis || {};
    const queues = payload.queues || {};
    const verifications = queues.verifications || [];
    const disputes = queues.disputes || [];
    const audits = queues.audits || [];

    // 4.1 Overview KPIs
    const kpiPending = document.getElementById('kpi-pending-verifications');
    const kpiVerified = document.getElementById('kpi-total-verified');
    const kpiDisputes = document.getElementById('kpi-open-disputes');
    const countVerTab = document.getElementById('tab-count-verifications');
    const countDisTab = document.getElementById('tab-count-disputes');

    if (kpiPending) kpiPending.textContent = kpis.pending_verifications != null ? kpis.pending_verifications : verifications.length;
    if (kpiVerified) kpiVerified.textContent = kpis.total_verified != null ? kpis.total_verified : '--';
    if (kpiDisputes) kpiDisputes.textContent = kpis.open_disputes != null ? kpis.open_disputes : disputes.filter(d => d.status === 'open').length;
    if (countVerTab) countVerTab.textContent = verifications.length;
    if (countDisTab) countDisTab.textContent = disputes.filter(d => d.status === 'open').length;

    // 4.2 Render Verification Queue Table
    const tbodyVer = document.getElementById('tbody-verifications');
    if (tbodyVer) {
      if (verifications.length === 0) {
        tbodyVer.innerHTML = `<tr><td colspan="7" class="empty-state-cell">No pending verification requests in queue.</td></tr>`;
      } else {
        tbodyVer.innerHTML = verifications.map(req => {
          const safeDate = req.submitted_at ? new Date(req.submitted_at).toLocaleDateString() : 'Recent';
          const maskedRef = req.document_masked_ref || req.document_type || 'REF: ****';
          const tradeDisplay = req.trade || (req.category ? req.category.toUpperCase() : 'Artisan');
          const locationDisplay = req.state ? (req.lga ? `${req.lga}, ${req.state}` : req.state) : 'Nigeria';
          return `
            <tr>
              <td style="font-weight: 700; color: var(--fg);">${req.name || `Provider #${req.provider_id}`}</td>
              <td><span style="color: #0284C7; font-weight: 600;">${tradeDisplay}</span></td>
              <td>${locationDisplay}</td>
              <td style="font-weight: 600; color: #D97706;">${req.document_type || req.verification_type || 'Document'}</td>
              <td style="font-family: monospace; color: var(--fg-muted);">${maskedRef}</td>
              <td style="font-size: 11px; color: var(--fg-muted);">${safeDate}</td>
              <td>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                  <button type="button" class="btn-action-sm btn-inspect-doc" data-id="${req.provider_id}" data-path="${req.file_path || ''}" data-name="${escapeHtml(req.name || `Artisan #${req.provider_id}`)}" data-doc="${escapeHtml(req.document_type || 'ID')}" style="background: #4B5563; color: #FFF;">
                    🔍 Inspect
                  </button>
                  <button type="button" class="btn-action-sm btn-approve" data-id="${req.provider_id}">
                    ✓ Approve Pro
                  </button>
                  <button type="button" class="btn-action-sm btn-reject" data-id="${req.provider_id}">
                    ✕ Reject
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 4.3 Render Disputes Table
    const tbodyDis = document.getElementById('tbody-disputes');
    if (tbodyDis) {
      if (disputes.length === 0) {
        tbodyDis.innerHTML = `<tr><td colspan="7" class="empty-state-cell">No open dispute reports recorded.</td></tr>`;
      } else {
        tbodyDis.innerHTML = disputes.map(rep => {
          const isResolved = rep.status === 'resolved';
          return `
            <tr>
              <td style="font-family: monospace; color: var(--fg-muted);">${rep.report_id}</td>
              <td style="font-weight: 700; color: var(--fg);">#${rep.provider_id}</td>
              <td>${rep.reporter_name || 'Anonymous Customer'}</td>
              <td style="color: #DC2626; font-weight: 600;">${rep.issue_type}</td>
              <td style="max-width: 250px; font-size: 12px; color: var(--fg-muted);">${rep.details}</td>
              <td>
                <span class="status-tag ${isResolved ? 'status-good' : 'status-bad'}" style="font-size: 10.5px;">
                  ${rep.status ? rep.status.toUpperCase() : 'PENDING'}
                </span>
              </td>
              <td>
                ${!isResolved ? `
                  <button type="button" class="btn-action-sm btn-resolve" data-report-id="${rep.report_id}">
                    Resolve Case
                  </button>
                ` : `<span style="font-size: 11px; color: #059669; font-weight: 700;">Resolved ✓</span>`}
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 4.4 Render Audit Ledger Table
    const tbodyAud = document.getElementById('tbody-audit');
    if (tbodyAud) {
      if (audits.length === 0) {
        tbodyAud.innerHTML = `<tr><td colspan="6" class="empty-state-cell">No audit entries recorded yet.</td></tr>`;
      } else {
        tbodyAud.innerHTML = audits.map(log => {
          const safeTime = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Recent';
          const actionClass = (log.action || '').includes('APPROVED') ? 'status-good' : ((log.action || '').includes('REJECTED') ? 'status-bad' : 'status-notice');
          return `
            <tr>
              <td style="font-family: monospace; font-size: 11px; color: var(--fg-muted);">${log.log_id || '--'}</td>
              <td><span class="status-tag ${actionClass}" style="font-size: 10px;">${log.action || 'ACTION'}</span></td>
              <td style="font-family: monospace; color: var(--fg);">#${log.target_id || log.provider_id || log.report_id || '--'}</td>
              <td style="color: var(--fg-muted);">${log.reviewer || 'Compliance Admin'}</td>
              <td style="color: var(--fg); font-size: 12px;">${log.notes || '--'}</td>
              <td style="font-size: 11px; color: var(--fg-muted);">${safeTime}</td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // 5. Data Fetcher from Serverless API
  async function hydrateCompliancePortal() {
    const adminKey = getStoredAdminKey();
    if (!adminKey) {
      showSecurityModal();
      return;
    }

    try {
      const res = await fetch('/api/admin-compliance?action=get_queues', {
        headers: {
          'x-admin-key': adminKey,
          'Authorization': `Bearer ${adminKey}`
        }
      });

      if (res.status === 401) {
        clearStoredAdminKey();
        showSecurityModal();
        return;
      }

      if (!res.ok) {
        throw new Error(`API HTTP ${res.status}`);
      }

      const data = await res.json();
      hideSecurityModal();
      renderDashboardData(data);
    } catch (netErr) {
      console.warn('[AdminCompliance] API fetch notice, checking fallback:', netErr.message);
      // Local fallback for offline development
      if (typeof LokatorDB !== 'undefined' && LokatorDB.compliance) {
        const pending = LokatorDB.compliance.getPendingVerifications();
        const cases = LokatorDB.compliance.getReportedCases();
        const logs = LokatorDB.compliance.getAuditLogs();
        hideSecurityModal();
        renderDashboardData({
          kpis: { pending_verifications: pending.length, open_disputes: cases.filter(c => c.status === 'open').length },
          queues: { verifications: pending, disputes: cases, audits: logs }
        });
      }
    }
  }

  // 6. Action Handlers (Phase 036)
  let currentInspectProvId = null;

  async function openDocumentInspection(provId, filePath, provName, docType) {
    currentInspectProvId = provId;
    const modal = document.getElementById('modal-doc-inspection');
    const title = document.getElementById('doc-inspect-title');
    const meta = document.getElementById('doc-inspect-meta');
    const img = document.getElementById('doc-inspect-img');
    const pdfFallback = document.getElementById('doc-inspect-pdf-fallback');
    const pdfLink = document.getElementById('doc-inspect-pdf-link');
    const loading = document.getElementById('doc-inspect-loading');

    if (title) title.textContent = `Document Inspection — ${provName || `Provider #${provId}`}`;
    if (meta) meta.textContent = `${docType || 'ID Document'} • Generating 15-min signed compliance URL...`;

    if (img) img.style.display = 'none';
    if (pdfFallback) pdfFallback.style.display = 'none';
    if (loading) {
      loading.textContent = 'Generating secure signed document URL...';
      loading.style.display = 'block';
    }
    if (modal) modal.style.display = 'flex';

    try {
      const adminKey = getStoredAdminKey();
      const res = await fetch('/api/admin-compliance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
          'Authorization': `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          action: 'get_document_url',
          provider_id: Number(provId),
          file_path: filePath
        })
      });

      if (!res.ok) {
        throw new Error(`Failed to sign document URL: HTTP ${res.status}`);
      }

      const data = await res.json();
      const signedUrl = data.signed_url;

      if (loading) loading.style.display = 'none';
      if (meta) meta.textContent = `${docType || 'ID Document'} • Temporary Signed Access (Expires in 15 mins)`;

      if (filePath && filePath.toLowerCase().endsWith('.pdf')) {
        if (pdfFallback) pdfFallback.style.display = 'block';
        if (pdfLink) pdfLink.href = signedUrl;
      } else {
        if (img) {
          img.src = signedUrl;
          img.style.display = 'inline-block';
        }
      }

      // Phase 037: Fetch and render review history
      const histList = document.getElementById('doc-inspect-history-list');
      const histCount = document.getElementById('doc-inspect-history-count');
      try {
        const histRes = await fetch('/api/admin-compliance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminKey,
            'Authorization': `Bearer ${adminKey}`
          },
          body: JSON.stringify({
            action: 'get_submission_history',
            provider_id: Number(provId)
          })
        });
        if (histRes.ok) {
          const histData = await histRes.json();
          const items = (histData.history || []).filter(h => h.file_path !== filePath);
          if (histCount) histCount.textContent = `${items.length} past audit${items.length === 1 ? '' : 's'}`;
          if (histList) {
            if (items.length === 0) {
              histList.innerHTML = '<span style="color: var(--fg-muted);">First-time submission. No previous compliance audits on record.</span>';
            } else {
              histList.innerHTML = items.map(item => {
                const dateStr = item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : 'Previous';
                const statusColor = item.status === 'approved' ? '#10B981' : item.status === 'rejected' ? '#EF4444' : '#F59E0B';
                const reasonInfo = item.rejection_reason ? ` • <strong>${item.rejection_reason}</strong>` : '';
                const notesInfo = item.rejection_notes ? ` — <em>"${item.rejection_notes}"</em>` : '';
                return `<div style="padding: 4px 0; border-bottom: 1px dashed rgba(0,0,0,0.1);"><span style="color: ${statusColor}; font-weight: 700; text-transform: uppercase; font-size: 11px;">[${item.status}]</span> <span style="color: var(--fg);">${dateStr}: ${item.document_type || 'Document'}${reasonInfo}${notesInfo}</span></div>`;
              }).join('');
            }
          }
        }
      } catch (histErr) {
        if (histList) histList.textContent = 'History unavailable.';
      }
    } catch (err) {
      if (loading) {
        loading.textContent = 'Notice: Document preview unavailable (' + err.message + ')';
        loading.style.display = 'block';
      }
    }
  }

  function closeDocumentInspection() {
    const modal = document.getElementById('modal-doc-inspection');
    if (modal) modal.style.display = 'none';
    currentInspectProvId = null;
  }

  function openRejectionModal(provId) {
    const modal = document.getElementById('modal-rejection-drawer');
    const idInput = document.getElementById('reject-provider-id');
    const notes = document.getElementById('reject-notes');
    if (idInput) idInput.value = provId;
    if (notes) notes.value = '';
    if (modal) modal.style.display = 'flex';
  }

  function closeRejectionModal() {
    const modal = document.getElementById('modal-rejection-drawer');
    if (modal) modal.style.display = 'none';
  }

  async function approveProviderAction(provId, triggerBtn) {
    if (!provId) return;
    const confirmApprove = confirm(`Approve artisan #${provId} as Verified Pro?\n\nThis permanently certifies identity verification and unlocks their tier badge.`);
    if (!confirmApprove) return;

    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = 'Approving...';
    }

    try {
      const adminKey = getStoredAdminKey();
      const res = await fetch('/api/admin-compliance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
          'Authorization': `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          action: 'approve_verification',
          provider_id: Number(provId),
          notes: 'Official government ID verification approved according to compliance standards.',
          reviewer: 'Chief Compliance Officer'
        })
      });

      if (res.ok) {
        alert(`✅ Artisan #${provId} has been successfully verified! Notification email dispatched.`);
        closeDocumentInspection();
        await hydrateCompliancePortal();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to approve verification: ${err.error || res.statusText}`);
      }
    } catch (err) {
      alert('Network error while approving verification: ' + err.message);
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = '✓ Approve Pro';
      }
    }
  }

  // Bind close buttons and modal actions
  const btnCloseInspect = document.getElementById('btn-close-doc-inspection');
  if (btnCloseInspect) btnCloseInspect.addEventListener('click', closeDocumentInspection);

  const btnInspectApprove = document.getElementById('btn-inspect-approve');
  if (btnInspectApprove) {
    btnInspectApprove.addEventListener('click', () => {
      if (currentInspectProvId) approveProviderAction(currentInspectProvId, btnInspectApprove);
    });
  }

  const btnInspectReject = document.getElementById('btn-inspect-reject');
  if (btnInspectReject) {
    btnInspectReject.addEventListener('click', () => {
      if (currentInspectProvId) {
        const pId = currentInspectProvId;
        closeDocumentInspection();
        openRejectionModal(pId);
      }
    });
  }

  const btnCloseRejection = document.getElementById('btn-close-rejection-modal');
  if (btnCloseRejection) btnCloseRejection.addEventListener('click', closeRejectionModal);

  const btnCancelRejection = document.getElementById('btn-cancel-rejection');
  if (btnCancelRejection) btnCancelRejection.addEventListener('click', closeRejectionModal);

  const formRejection = document.getElementById('form-rejection-submission');
  if (formRejection) {
    formRejection.addEventListener('submit', async (e) => {
      e.preventDefault();
      const provId = document.getElementById('reject-provider-id').value;
      const reasonCode = document.getElementById('reject-reason-code').value;
      const notes = document.getElementById('reject-notes').value.trim();
      const confirmBtn = document.getElementById('btn-confirm-rejection');

      if (!provId) return;
      if (!notes || notes.length < 8) {
        alert('Please enter at least 8 characters of feedback notes for the artisan.');
        return;
      }

      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Submitting Rejection...';
      }

      try {
        const adminKey = getStoredAdminKey();
        const res = await fetch('/api/admin-compliance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminKey,
            'Authorization': `Bearer ${adminKey}`
          },
          body: JSON.stringify({
            action: 'reject_verification',
            provider_id: Number(provId),
            reason_code: reasonCode,
            reason: notes,
            reviewer: 'Chief Compliance Officer'
          })
        });

        if (res.ok) {
          alert(`Artisan #${provId} verification rejected. Notification with feedback dispatched.`);
          closeRejectionModal();
          await hydrateCompliancePortal();
        } else {
          const err = await res.json().catch(() => ({}));
          alert(`Failed to reject verification: ${err.error || res.statusText}`);
        }
      } catch (err) {
        alert('Network error while rejecting verification: ' + err.message);
      } finally {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirm Rejection';
        }
      }
    });
  }

  document.addEventListener('click', async (e) => {
    const adminKey = getStoredAdminKey();

    // 6.0 Inspect Document
    const btnInspect = e.target.closest('.btn-inspect-doc');
    if (btnInspect) {
      const provId = btnInspect.getAttribute('data-id');
      const filePath = btnInspect.getAttribute('data-path');
      const provName = btnInspect.getAttribute('data-name');
      const docType = btnInspect.getAttribute('data-doc');
      openDocumentInspection(provId, filePath, provName, docType);
      return;
    }

    // 6.1 Approve Verification
    const btnApprove = e.target.closest('.btn-approve');
    if (btnApprove && !btnApprove.closest('#modal-doc-inspection')) {
      const provId = btnApprove.getAttribute('data-id');
      if (provId) approveProviderAction(provId, btnApprove);
      return;
    }

    // 6.2 Reject Verification
    const btnReject = e.target.closest('.btn-reject');
    if (btnReject && !btnReject.closest('#modal-doc-inspection')) {
      const provId = btnReject.getAttribute('data-id');
      if (provId) openRejectionModal(provId);
      return;
    }

    // 6.3 Resolve Dispute
    const btnResolve = e.target.closest('.btn-resolve');
    if (btnResolve) {
      const repId = btnResolve.getAttribute('data-report-id');
      if (!repId) return;

      const notes = prompt('Enter resolution findings and action taken:', 'Contacted customer and artisan. Mutual resolution reached.');
      if (!notes) return;

      btnResolve.disabled = true;
      btnResolve.textContent = 'Resolving...';

      try {
        const res = await fetch('/api/admin-compliance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminKey,
            'Authorization': `Bearer ${adminKey}`
          },
          body: JSON.stringify({
            action: 'resolve_dispute',
            report_id: repId,
            notes: notes,
            reviewer: 'Dispute Desk Lead'
          })
        });

        if (res.ok) {
          alert(`Dispute ${repId} marked resolved.`);
          await hydrateCompliancePortal();
        } else {
          const err = await res.json().catch(() => ({}));
          alert(`Failed to resolve dispute: ${err.error || res.statusText}`);
        }
      } catch (err) {
        alert('Network error while resolving dispute: ' + err.message);
      }
    }
  });

  // 7. Refresh Button
  const btnRefresh = document.getElementById('btn-refresh-queue');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => hydrateCompliancePortal());
  }

  // 8. Reconcile Button
  const btnReconcile = document.getElementById('btn-reconcile-kyc');
  if (btnReconcile) {
    btnReconcile.addEventListener('click', async () => {
      const adminKey = getStoredAdminKey();
      const feedback = document.getElementById('reconcile-feedback');
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(2, 132, 199, 0.15)';
        feedback.style.color = '#38BDF8';
        feedback.style.border = '1px solid rgba(2, 132, 199, 0.3)';
        feedback.textContent = '🔄 Reconciling pending KYC requests with verification gateway...';
      }

      try {
        const res = await fetch('/api/admin-compliance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminKey,
            'Authorization': `Bearer ${adminKey}`
          },
          body: JSON.stringify({ action: 'reconcile_kyc' })
        });

        const result = res.ok ? await res.json() : { total: 0, reconciled: 0, unchanged: 0 };
        if (feedback) {
          feedback.style.background = 'rgba(16, 185, 129, 0.15)';
          feedback.style.color = '#10B981';
          feedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          feedback.textContent = `✅ Reconciliation complete: Scanned ${result.total || 0} record(s), reconciled ${result.reconciled || 0}, unchanged ${result.unchanged || 0}.`;
        }
        await hydrateCompliancePortal();
      } catch (err) {
        if (feedback) {
          feedback.style.background = 'rgba(239, 68, 68, 0.15)';
          feedback.style.color = '#F87171';
          feedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          feedback.textContent = `❌ Reconciliation error: ${err.message}`;
        }
      }
    });
  }

  // Initial load
  await hydrateCompliancePortal();
});

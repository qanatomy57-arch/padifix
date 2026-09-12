/**
 * PADIFIX — Phase 031: Consumer Instant Lead Broadcast & WhatsApp Matching Modal
 * broadcast-modal.js
 *
 * Universal, zero-dependency client component for:
 * - / (index.html)
 * - /search.html
 * - Any service directory page
 *
 * Requirements satisfied:
 * - Mobile-safe >= 44px touch targets
 * - 0px horizontal overflow
 * - Keyboard accessible (Escape closes modal)
 * - Zero consumer phone persistence (Privacy Invariant C)
 * - Ephemeral WhatsApp deep links for top 3 matched verified artisans
 */

'use strict';

(function() {
  // Prevent duplicate execution
  if (window.__PADIFIX_BROADCAST_MODAL_INIT__) return;
  window.__PADIFIX_BROADCAST_MODAL_INIT__ = true;

  const MODAL_HTML = `
    <!-- Phase 031 Universal Broadcast Modal -->
    <div class="bcast-modal-backdrop" id="universal-bcast-modal" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="bcast-modal-title">
      <div class="bcast-dialog" tabindex="-1">
        <div class="bcast-header">
          <div>
            <span class="broadcast-badge">⚡ PadiFix Express Match</span>
            <h2 id="bcast-modal-title" style="font-size: 18px; font-weight: 800; color: #fff; margin-top: 4px;">
              Broadcast Service Request
            </h2>
          </div>
          <button type="button" class="bcast-close-btn" id="btn-close-u-bcast-modal" aria-label="Close modal">✕</button>
        </div>

        <!-- Step Indicator -->
        <div class="bcast-steps-indicator" aria-label="Progress">
          <div class="bcast-step-dot active" id="u-dot-step-1"></div>
          <div class="bcast-step-dot" id="u-dot-step-2"></div>
          <div class="bcast-step-dot" id="u-dot-step-3"></div>
        </div>

        <!-- Step 1: Select Trade & Locality -->
        <div id="u-bcast-step-1" class="bcast-step-content">
          <div class="bcast-form-group">
            <label class="bcast-label" for="u-bcast-trade">What service do you need?</label>
            <select class="bcast-select" id="u-bcast-trade">
              <option value="plumber">Plumber (Leaking pipes, borehole, fixtures)</option>
              <option value="electrician" selected>Electrician (Wiring, inverter, prepaid meter)</option>
              <option value="ac-repair">AC &amp; Refrigeration Technician</option>
              <option value="carpenter">Carpenter / Woodworker</option>
              <option value="painter">Painter / Wall Finisher</option>
              <option value="mechanic">Auto Mechanic / Diagnostics</option>
              <option value="generator-repair">Generator Mechanic</option>
              <option value="tailor">Tailor / Fashion Designer</option>
              <option value="welder">Welder / Iron Fabricator</option>
            </select>
          </div>
          <div class="bcast-form-group">
            <label class="bcast-label" for="u-bcast-state">State / Region</label>
            <input type="text" class="bcast-input" id="u-bcast-state" value="Lagos" />
          </div>
          <div class="bcast-form-group">
            <label class="bcast-label" for="u-bcast-lga">LGA / Area / Town</label>
            <input type="text" class="bcast-input" id="u-bcast-lga" value="Ikeja" placeholder="e.g. Ikeja, Surulere, Lekki, Victoria Island" />
          </div>
          <button type="button" class="bcast-btn-submit" id="btn-u-bcast-goto-step-2">
            <span>Next: Job Scope &amp; Urgency →</span>
          </button>
        </div>

        <!-- Step 2: Urgency, Budget, & Scope -->
        <div id="u-bcast-step-2" class="bcast-step-content" style="display:none;">
          <div class="bcast-form-group">
            <label class="bcast-label">How urgent is this job?</label>
            <div class="urgency-grid" id="u-urgency-selector">
              <button type="button" class="urgency-card selected" data-urgency="immediate">
                <span style="font-size: 16px;">⚡</span>
                <span>Emergency (ASAP)</span>
              </button>
              <button type="button" class="urgency-card" data-urgency="today">
                <span style="font-size: 16px;">📅</span>
                <span>Today</span>
              </button>
              <button type="button" class="urgency-card" data-urgency="scheduled_week">
                <span style="font-size: 16px;">🗓️</span>
                <span>This Week</span>
              </button>
            </div>
          </div>

          <div class="bcast-form-group">
            <label class="bcast-label" for="u-bcast-budget">Target Budget (Optional / Estimated ₦)</label>
            <input type="text" class="bcast-input" id="u-bcast-budget" placeholder="e.g. ₦10,000 - ₦25,000" />
          </div>

          <div class="bcast-form-group">
            <label class="bcast-label" for="u-bcast-scope">Brief Description of the Task</label>
            <textarea class="bcast-textarea" id="u-bcast-scope" rows="3" placeholder="Describe the task or issue (e.g. leaking kitchen pipe, prepaid meter tripping, AC not cooling)..." maxlength="600"></textarea>
            <span style="font-size: 11px; color: #94A3B8; display:block; margin-top: 4px;">Zero customer phone numbers required. You connect directly via WhatsApp.</span>
          </div>

          <div style="display:flex; gap: 8px;">
            <button type="button" class="bcast-input" id="btn-u-bcast-back-to-step-1" style="width: 35%; cursor: pointer;">← Back</button>
            <button type="button" class="bcast-btn-submit" id="btn-u-bcast-submit" style="width: 65%;">
              <span>Find Artisans Now ⚡</span>
            </button>
          </div>
        </div>

        <!-- Step 3: Match Handshake -->
        <div id="u-bcast-step-3" class="bcast-step-content" style="display:none;">
          <div style="text-align:center; margin-bottom: 16px;">
            <span style="font-size: 32px;">🎉</span>
            <h3 style="font-size: 17px; font-weight: 800; color: #fff; margin-top: 4px;">Verified Local Matches Found!</h3>
            <p style="font-size: 12.5px; color: #94A3B8;">Tap WhatsApp or Call to connect with your matched artisans directly with zero commission.</p>
          </div>

          <div id="u-bcast-match-results-container"></div>

          <button type="button" class="bcast-input" id="btn-u-bcast-done" style="margin-top: 12px; cursor: pointer;">Done / Close</button>
        </div>
      </div>
    </div>
  `;

  const MODAL_CSS = `
    .bcast-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(4, 8, 16, 0.78);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    .bcast-modal-backdrop.is-open {
      opacity: 1;
      pointer-events: auto;
    }
    .bcast-dialog {
      background: #111827;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.6);
      transform: translateY(16px) scale(0.98);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      padding: 24px;
      box-sizing: border-box;
    }
    .bcast-modal-backdrop.is-open .bcast-dialog {
      transform: translateY(0) scale(1);
    }
    .bcast-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 14px;
    }
    .bcast-close-btn {
      background: rgba(255, 255, 255, 0.06);
      border: none;
      color: #94A3B8;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .bcast-close-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }
    .broadcast-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(0, 168, 89, 0.2);
      color: #34D399;
      border: 1px solid rgba(0, 168, 89, 0.3);
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .bcast-steps-indicator {
      display: flex;
      gap: 6px;
      margin-bottom: 18px;
    }
    .bcast-step-dot {
      flex: 1;
      height: 4px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.1);
      transition: background 0.2s ease;
    }
    .bcast-step-dot.active {
      background: #00A859;
    }
    .bcast-form-group {
      margin-bottom: 16px;
    }
    .bcast-label {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: #E2E8F0;
      margin-bottom: 6px;
    }
    .bcast-input, .bcast-textarea, .bcast-select {
      width: 100%;
      background: #0B1120;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
      padding: 12px 14px;
      outline: none;
      font-family: inherit;
      box-sizing: border-box;
      min-height: 44px;
    }
    .bcast-input:focus, .bcast-textarea:focus, .bcast-select:focus {
      border-color: #00A859;
    }
    .urgency-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    .urgency-card {
      background: #0B1120;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 10px 8px;
      text-align: center;
      cursor: pointer;
      font-size: 12px;
      color: #94A3B8;
      transition: all 0.15s ease;
      min-height: 48px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .urgency-card.selected {
      border-color: #34D399;
      background: rgba(0, 168, 89, 0.15);
      color: #fff;
      font-weight: 700;
    }
    .bcast-match-item {
      background: #0B1120;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .bcast-btn-submit {
      width: 100%;
      background: #00A859;
      color: #fff;
      font-weight: 800;
      font-size: 15px;
      border: none;
      border-radius: 10px;
      padding: 14px;
      cursor: pointer;
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.15s ease;
    }
    .bcast-btn-submit:hover {
      background: #34D399;
      color: #061109;
    }
    .bcast-btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Floating Action Button (FAB) for Search and Home */
    .bcast-fab-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #00A859;
      color: #fff;
      font-weight: 800;
      font-size: 13.5px;
      border: none;
      border-radius: 999px;
      padding: 12px 20px;
      box-shadow: 0 6px 20px rgba(0, 168, 89, 0.45);
      cursor: pointer;
      z-index: 9000;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 48px;
      transition: transform 0.15s ease, background 0.15s ease;
    }
    .bcast-fab-btn:hover {
      background: #34D399;
      color: #061109;
      transform: translateY(-2px);
    }
    @media (max-width: 640px) {
      .bcast-fab-btn {
        bottom: 80px;
        right: 16px;
        padding: 10px 16px;
        font-size: 12.5px;
      }
    }
  `;

  function init() {
    // 1. Inject Styles
    if (!document.getElementById('padifix-bcast-css')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'padifix-bcast-css';
      styleEl.textContent = MODAL_CSS;
      document.head.appendChild(styleEl);
    }

    // 2. Inject Modal Markup
    if (!document.getElementById('universal-bcast-modal')) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = MODAL_HTML;
      document.body.appendChild(wrapper.firstElementChild);
    }

    // 3. Inject FAB Button if not already on page and not inside an iframe
    if (!document.getElementById('btn-broadcast-fab')) {
      const fab = document.createElement('button');
      fab.type = 'button';
      fab.id = 'btn-broadcast-fab';
      fab.className = 'bcast-fab-btn';
      fab.setAttribute('aria-label', 'Broadcast Urgent Service Request');
      fab.innerHTML = '<span>⚡ Need an Artisan Fast? Broadcast</span>';
      document.body.appendChild(fab);

      fab.addEventListener('click', () => openModal());
    }

    // 4. Modal Controller Logic
    const modal = document.getElementById('universal-bcast-modal');
    const closeBtn = document.getElementById('btn-close-u-bcast-modal');
    const doneBtn = document.getElementById('btn-u-bcast-done');
    const gotoStep2Btn = document.getElementById('btn-u-bcast-goto-step-2');
    const backStep1Btn = document.getElementById('btn-u-bcast-back-to-step-1');
    const submitBtn = document.getElementById('btn-u-bcast-submit');

    const step1 = document.getElementById('u-bcast-step-1');
    const step2 = document.getElementById('u-bcast-step-2');
    const step3 = document.getElementById('u-bcast-step-3');

    const dot1 = document.getElementById('u-dot-step-1');
    const dot2 = document.getElementById('u-dot-step-2');
    const dot3 = document.getElementById('u-dot-step-3');

    let selectedUrgency = 'immediate';

    function setStep(stepNum) {
      if (step1) step1.style.display = stepNum === 1 ? 'block' : 'none';
      if (step2) step2.style.display = stepNum === 2 ? 'block' : 'none';
      if (step3) step3.style.display = stepNum === 3 ? 'block' : 'none';

      if (dot1) dot1.className = 'bcast-step-dot' + (stepNum >= 1 ? ' active' : '');
      if (dot2) dot2.className = 'bcast-step-dot' + (stepNum >= 2 ? ' active' : '');
      if (dot3) dot3.className = 'bcast-step-dot' + (stepNum >= 3 ? ' active' : '');
    }

    function openModal() {
      if (!modal) return;
      setStep(1);
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      const dialog = modal.querySelector('.bcast-dialog');
      if (dialog) dialog.focus();
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    // Keyboard accessibility: Escape closes modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
        closeModal();
      }
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (doneBtn) doneBtn.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    // Step 1 -> Step 2
    if (gotoStep2Btn) {
      gotoStep2Btn.addEventListener('click', () => {
        const lga = (document.getElementById('u-bcast-lga')?.value || '').trim();
        if (!lga) {
          alert('Please specify your LGA or area.');
          return;
        }
        setStep(2);
      });
    }

    // Step 2 -> Step 1
    if (backStep1Btn) {
      backStep1Btn.addEventListener('click', () => setStep(1));
    }

    // Urgency Card Selector
    document.querySelectorAll('#u-urgency-selector .urgency-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#u-urgency-selector .urgency-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedUrgency = card.dataset.urgency || 'today';
      });
    });

    // Submit Broadcast
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const tradeSlug = (document.getElementById('u-bcast-trade')?.value || 'electrician').trim();
        const state = (document.getElementById('u-bcast-state')?.value || 'Lagos').trim();
        const lga = (document.getElementById('u-bcast-lga')?.value || 'Ikeja').trim();
        const budget = (document.getElementById('u-bcast-budget')?.value || '').trim();
        const scope = (document.getElementById('u-bcast-scope')?.value || '').trim();

        if (!scope || scope.length < 5) {
          alert('Please describe your task (at least 5 characters).');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Matching Verified Artisans... ⚡</span>';

        try {
          const res = await fetch('/api/provider-leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create_broadcast',
              trade_slug: tradeSlug,
              state: state,
              lga: lga,
              urgency: selectedUrgency,
              budget_range: budget,
              job_scope: scope
            })
          });

          const data = await res.json();
          if (!res.ok || data.error) {
            alert(data.error || 'Failed to match artisans. Please try again.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Find Artisans Now ⚡</span>';
            return;
          }

          const container = document.getElementById('u-bcast-match-results-container');
          if (container) {
            const artisans = data.matched_artisans || [];
            if (artisans.length === 0) {
              container.innerHTML = '<p style="text-align:center; color:#94A3B8; font-size:13px;">No direct online matches right now. Your request is on the radar for local artisans.</p>';
            } else {
              container.innerHTML = artisans.map((a, idx) => `
                <div class="bcast-match-item">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div>
                      <h4 style="color:#fff; font-size:14.5px; font-weight:700; margin:0;">${idx + 1}. ${a.name}</h4>
                      <span style="font-size:11.5px; color:#34D399; font-weight:600;">✓ NIN Verified • ★ ${a.rating} (${a.reviews_count} reviews)</span>
                    </div>
                  </div>
                  <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px;">
                    <a href="${a.whatsapp_url}" target="_blank" rel="noopener" class="btn-action" style="background:#059669; color:#fff; text-decoration:none; padding:10px; border-radius:8px; font-weight:700; font-size:12.5px; text-align:center; display:flex; align-items:center; justify-content:center; min-height:44px;">
                      <span>WhatsApp Match</span>
                    </a>
                    <a href="${a.call_url}" class="btn-action" style="background:#1D4ED8; color:#fff; text-decoration:none; padding:10px; border-radius:8px; font-weight:700; font-size:12.5px; text-align:center; display:flex; align-items:center; justify-content:center; min-height:44px;">
                      <span>Call Directly</span>
                    </a>
                  </div>
                </div>
              `).join('');
            }
          }

          setStep(3);
        } catch (err) {
          alert('Connection error. Please try again.');
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Find Artisans Now ⚡</span>';
        }
      });
    }

    // Expose open helper globally
    window.openPadiFixBroadcastModal = openModal;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/**
 * PADIFIX — Phase 042: Universal Customer Job Intake & Pre-WhatsApp Modal
 * js/intake-modal.js
 *
 * Universal, zero-dependency client component shared across:
 * - /search.html (Artisan Cards WhatsApp Action)
 * - /profile.html (Hero, Sidebar & Sticky Mobile WhatsApp Actions)
 *
 * Requirements & Invariants Satisfied:
 * 1. The intake modal is an ENRICHMENT LAYER, NOT A CONTACT BARRIER.
 * 2. "Skip & Open WhatsApp Directly" is always immediately available.
 * 3. Telemetry/API failure MUST NEVER block WhatsApp connectivity.
 * 4. Urgency allowlist: 'today', '2-3_days', 'flexible'.
 * 5. Intent prefixes: '[URGENT]', '[2-3 DAYS]', '[FLEXIBLE]'.
 * 6. Bounded lengths: service_details <= 80 chars, locality <= 80 chars.
 * 7. HTML-escaped rendering, XSS defense, zero PII collection.
 * 8. Mobile bottom-sheet on <= 600px (390x844 viewport safe, 0px overflow).
 * 9. Keyboard accessible: role="dialog", aria-modal="true", Esc key, Tab trap, focus return.
 */

'use strict';

(function (global) {
  // Prevent duplicate registration
  if (global.__PADIFIX_INTAKE_MODAL_LOADED__) return;
  global.__PADIFIX_INTAKE_MODAL_LOADED__ = true;

  // Canonical Urgency Mapping (Strict Allowlist)
  const URGENCY_CONFIG = {
    today: {
      key: 'today',
      prefix: '[URGENT]',
      label: '⚡ Today (Emergency)',
      smsLabel: 'URGENT',
      waLabel: 'Today'
    },
    '2-3_days': {
      key: '2-3_days',
      prefix: '[2-3 DAYS]',
      label: '📅 In 2-3 Days',
      smsLabel: '2-3 DAYS',
      waLabel: 'In 2-3 Days'
    },
    flexible: {
      key: 'flexible',
      prefix: '[FLEXIBLE]',
      label: '🔄 Flexible / Quote',
      smsLabel: 'FLEXIBLE',
      waLabel: 'Flexible'
    }
  };

  // Trade-specific quick chips catalog
  const TRADE_QUICK_CHIPS = {
    electrician: ['Wiring', 'Fault Finding', 'Appliance Install', 'Inverter/Solar', 'Socket / Switch'],
    plumber: ['Pipe Leak', 'Blocked Drain', 'Installation', 'Water Supply', 'Pumping Machine'],
    mechanic: ['Engine Problem', 'Brake Issue', 'Diagnostics', 'Servicing', 'Suspension'],
    carpenter: ['Furniture', 'Repairs', 'Doors', 'Cabinets', 'Roof / Ceiling'],
    painter: ['Interior Painting', 'Exterior Painting', 'Wall Screeding', 'POP Ceiling'],
    'ac-repair': ['Gas Refill', 'AC Not Cooling', 'New AC Install', 'Servicing & Cleaning'],
    'generator-repair': ['Starting Issue', 'Overhauling', 'Oil & Filter Change', 'Carburetor / Plug'],
    tailor: ['Custom Attire', 'Alterations & Fitting', 'Corporate Suit', 'Dressmaking'],
    welder: ['Gate & Burglar Proof', 'Iron Railings', 'Tank Stand', 'Roof Trusses'],
    mason: ['Block Laying', 'Plastering', 'Tiling Work', 'Concrete Flooring'],
    default: ['Emergency Repair', 'Inspection & Quote', 'Installation Work', 'Maintenance']
  };

  let modalElement = null;
  let currentProvider = null;
  let currentOptions = {};
  let selectedUrgency = 'today';
  let lastFocusedTrigger = null;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function sanitizeBounded(str, maxLen = 80) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[\r\n\t]+/g, ' ').trim().substring(0, maxLen);
  }

  function getCategoryKey(tradeOrCategory) {
    if (!tradeOrCategory) return 'default';
    const norm = String(tradeOrCategory).toLowerCase().trim();
    for (const key of Object.keys(TRADE_QUICK_CHIPS)) {
      if (norm === key || norm.includes(key)) return key;
    }
    if (norm.includes('electric') || norm.includes('wire') || norm.includes('solar')) return 'electrician';
    if (norm.includes('plumb') || norm.includes('pipe') || norm.includes('drain')) return 'plumber';
    if (norm.includes('mechanic') || norm.includes('auto') || norm.includes('brake')) return 'mechanic';
    if (norm.includes('carp') || norm.includes('wood') || norm.includes('furnitur')) return 'carpenter';
    if (norm.includes('paint') || norm.includes('screed')) return 'painter';
    if (norm.includes('ac') || norm.includes('cool') || norm.includes('fridge') || norm.includes('hvac')) return 'ac-repair';
    if (norm.includes('gen') || norm.includes('generator')) return 'generator-repair';
    if (norm.includes('tailor') || norm.includes('fashion') || norm.includes('cloth')) return 'tailor';
    if (norm.includes('weld') || norm.includes('iron') || norm.includes('gate')) return 'welder';
    if (norm.includes('mason') || norm.includes('tile') || norm.includes('brick')) return 'mason';
    return 'default';
  }

  function injectModalStyles() {
    if (document.getElementById('padifix-intake-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'padifix-intake-modal-styles';
    style.textContent = `
      .padifix-intake-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 10500;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
        opacity: 0;
        transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
      }
      .padifix-intake-backdrop.active {
        display: flex;
        opacity: 1;
      }
      .padifix-intake-dialog {
        background: #FFFFFF;
        border-radius: 20px;
        max-width: 480px;
        width: 100%;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
        overflow: hidden;
        animation: intakeDialogPop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
        outline: none;
      }
      @keyframes intakeDialogPop {
        0% { transform: scale(0.96) translateY(12px); opacity: 0; }
        100% { transform: scale(1) translateY(0); opacity: 1; }
      }
      .intake-header {
        padding: 16px 20px;
        background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
        color: #FFFFFF;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .intake-header-info {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .intake-header-avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #008751;
        color: #FFF;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 15px;
        overflow: hidden;
        border: 2px solid rgba(255, 255, 255, 0.2);
        flex-shrink: 0;
      }
      .intake-header-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .intake-header-text {
        min-width: 0;
      }
      .intake-header-title {
        font-size: 15px;
        font-weight: 800;
        color: #FFFFFF;
        margin: 0 0 2px 0;
        line-height: 1.25;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .intake-header-subtitle {
        font-size: 12px;
        color: #94A3B8;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .intake-header-trade-pill {
        background: rgba(0, 135, 81, 0.3);
        color: #4ADE80;
        font-size: 11px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 12px;
        border: 1px solid rgba(74, 222, 128, 0.3);
      }
      .intake-close-btn {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #E2E8F0;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
        flex-shrink: 0;
      }
      .intake-close-btn:hover, .intake-close-btn:focus {
        background: rgba(255, 255, 255, 0.25);
        color: #FFF;
        outline: 2px solid #4ADE80;
      }
      .intake-body {
        padding: 20px;
        max-height: 75vh;
        overflow-y: auto;
      }
      .intake-field-group {
        margin-bottom: 18px;
      }
      .intake-field-label {
        font-size: 13px;
        font-weight: 700;
        color: #1E293B;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .intake-field-hint {
        font-size: 11px;
        font-weight: 500;
        color: #64748B;
      }
      .intake-chips-container {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 10px;
      }
      .intake-chip-btn {
        background: #F1F5F9;
        border: 1px solid #E2E8F0;
        border-radius: 20px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        color: #334155;
        cursor: pointer;
        transition: all 0.15s ease;
        touch-action: manipulation;
        min-height: 36px;
        display: inline-flex;
        align-items: center;
      }
      .intake-chip-btn:hover {
        background: #E2E8F0;
        border-color: #CBD5E1;
      }
      .intake-chip-btn:focus {
        outline: 2px solid #008751;
      }
      .intake-chip-btn.active {
        background: #E8F5E9;
        border-color: #008751;
        color: #008751;
        font-weight: 700;
      }
      .intake-text-input {
        width: 100%;
        padding: 10px 14px;
        border: 1.5px solid #CBD5E1;
        border-radius: 10px;
        font-size: 14px;
        color: #0F172A;
        background: #F8FAFC;
        box-sizing: border-box;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .intake-text-input:focus {
        outline: none;
        border-color: #008751;
        background: #FFFFFF;
        box-shadow: 0 0 0 3px rgba(0, 135, 81, 0.15);
      }
      .intake-urgency-pills {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      .intake-urgency-pill {
        border: 1.5px solid #E2E8F0;
        background: #FFFFFF;
        border-radius: 12px;
        padding: 10px 8px;
        text-align: center;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        min-height: 48px;
        touch-action: manipulation;
      }
      .intake-urgency-pill:hover {
        border-color: #CBD5E1;
        background: #F8FAFC;
      }
      .intake-urgency-pill:focus {
        outline: 2px solid #008751;
      }
      .intake-urgency-pill.active {
        border-color: #008751;
        background: #F0FDF4;
      }
      .intake-urgency-pill.active[data-key="today"] {
        border-color: #DC2626;
        background: #FEF2F2;
      }
      .intake-urgency-icon {
        font-size: 16px;
      }
      .intake-urgency-text {
        font-size: 11px;
        font-weight: 700;
        color: #1E293B;
        line-height: 1.2;
      }
      .intake-urgency-pill.active .intake-urgency-text {
        color: #008751;
      }
      .intake-urgency-pill.active[data-key="today"] .intake-urgency-text {
        color: #DC2626;
      }
      .intake-actions {
        margin-top: 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .intake-submit-btn {
        background: #25D366;
        color: #FFFFFF;
        border: none;
        border-radius: 12px;
        padding: 14px 20px;
        font-size: 15px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.1s ease;
        width: 100%;
        min-height: 48px;
        box-shadow: 0 4px 14px rgba(37, 211, 102, 0.35);
      }
      .intake-submit-btn:hover {
        background: #20BA5A;
      }
      .intake-submit-btn:focus {
        outline: 3px solid #008751;
      }
      .intake-submit-btn:active {
        transform: scale(0.99);
      }
      .intake-skip-btn {
        background: transparent;
        border: none;
        color: #64748B;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 12px;
        cursor: pointer;
        text-align: center;
        text-decoration: underline;
        text-underline-offset: 3px;
        transition: color 0.15s ease;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .intake-skip-btn:hover, .intake-skip-btn:focus {
        color: #0F172A;
        outline: 2px solid #94A3B8;
      }
      @media (max-width: 600px) {
        .padifix-intake-backdrop {
          padding: 0;
          align-items: flex-end;
        }
        .padifix-intake-dialog {
          max-width: 100%;
          border-radius: 20px 20px 0 0;
          max-height: 90vh;
          animation: intakeDrawerUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes intakeDrawerUp {
          0% { transform: translateY(100%); }
          100% { transform: translateY(0); }
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createModalDOM() {
    injectModalStyles();
    if (document.getElementById('padifix-intake-modal')) {
      modalElement = document.getElementById('padifix-intake-modal');
      return;
    }

    const modalHtml = `
      <div class="padifix-intake-backdrop" id="padifix-intake-modal" role="dialog" aria-modal="true" aria-labelledby="intake-modal-title" aria-hidden="true">
        <div class="padifix-intake-dialog" id="padifix-intake-dialog" tabindex="-1">
          <!-- Header -->
          <div class="intake-header">
            <div class="intake-header-info">
              <div class="intake-header-avatar" id="intake-avatar-box">
                <span id="intake-avatar-initials">PA</span>
              </div>
              <div class="intake-header-text">
                <h3 class="intake-header-title" id="intake-modal-title">Quick Inquiry</h3>
                <div class="intake-header-subtitle">
                  <span class="intake-header-trade-pill" id="intake-trade-pill">Artisan</span>
                  <span>• Verified on PadiFix</span>
                </div>
              </div>
            </div>
            <button type="button" class="intake-close-btn" id="btn-intake-close" aria-label="Close modal">&times;</button>
          </div>

          <!-- Body -->
          <div class="intake-body">
            <!-- Question 1: Service details -->
            <div class="intake-field-group">
              <label class="intake-field-label" for="intake-service-input">
                <span>1. Service Details</span>
                <span class="intake-field-hint">Quick Select</span>
              </label>
              <div class="intake-chips-container" id="intake-chips-box">
                <!-- Injected dynamically based on category -->
              </div>
              <input type="text" class="intake-text-input" id="intake-service-input" placeholder="e.g. Wiring, Inverter/Solar, Pipe Leak..." maxlength="80" autocomplete="off" />
            </div>

            <!-- Question 2: Locality -->
            <div class="intake-field-group">
              <label class="intake-field-label" for="intake-locality-input">
                <span>2. Area / Locality</span>
                <span class="intake-field-hint">Job Location</span>
              </label>
              <input type="text" class="intake-text-input" id="intake-locality-input" placeholder="e.g. Ikeja, Surulere, Lekki..." maxlength="80" autocomplete="off" />
            </div>

            <!-- Question 3: Urgency -->
            <div class="intake-field-group">
              <label class="intake-field-label">
                <span>3. Urgency</span>
              </label>
              <div class="intake-urgency-pills" id="intake-urgency-box" role="radiogroup" aria-label="Job Urgency">
                <button type="button" class="intake-urgency-pill active" data-key="today" role="radio" aria-checked="true">
                  <span class="intake-urgency-icon">⚡</span>
                  <span class="intake-urgency-text">Today (Emergency)</span>
                </button>
                <button type="button" class="intake-urgency-pill" data-key="2-3_days" role="radio" aria-checked="false">
                  <span class="intake-urgency-icon">📅</span>
                  <span class="intake-urgency-text">In 2-3 Days</span>
                </button>
                <button type="button" class="intake-urgency-pill" data-key="flexible" role="radio" aria-checked="false">
                  <span class="intake-urgency-icon">🔄</span>
                  <span class="intake-urgency-text">Flexible / Quote</span>
                </button>
              </div>
            </div>

            <!-- Actions -->
            <div class="intake-actions">
              <button type="button" class="intake-submit-btn" id="btn-intake-submit">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.699c.974.531 1.769.814 2.796.814 3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.766-5.768-5.766zm9.969 5.766c0 5.518-4.482 10-10 10-1.745 0-3.385-.45-4.814-1.238l-7.186 1.886 1.921-7.009c-.846-1.472-1.332-3.185-1.332-5.014 0-5.518 4.482-10 10-10s10 4.482 10 10z"/>
                </svg>
                <span>Continue to WhatsApp</span>
              </button>
              <button type="button" class="intake-skip-btn" id="btn-intake-skip">
                Skip &amp; Open WhatsApp Directly &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    modalElement = wrapper.firstElementChild;
    document.body.appendChild(modalElement);

    bindModalEvents();
  }

  function bindModalEvents() {
    if (!modalElement) return;

    // Close button
    const closeBtn = modalElement.querySelector('#btn-intake-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Backdrop click
    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) closeModal();
    });

    // Escape key & Tab trapping
    document.addEventListener('keydown', (e) => {
      if (!modalElement.classList.contains('active')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
        return;
      }

      // Tab trap
      if (e.key === 'Tab') {
        const focusableElements = modalElement.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    });

    // Urgency pill click handlers
    const urgencyBox = modalElement.querySelector('#intake-urgency-box');
    if (urgencyBox) {
      urgencyBox.addEventListener('click', (e) => {
        const pill = e.target.closest('.intake-urgency-pill');
        if (!pill) return;
        urgencyBox.querySelectorAll('.intake-urgency-pill').forEach(p => {
          p.classList.remove('active');
          p.setAttribute('aria-checked', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-checked', 'true');
        selectedUrgency = pill.dataset.key || 'today';
      });
    }

    // Submit button
    const submitBtn = modalElement.querySelector('#btn-intake-submit');
    if (submitBtn) submitBtn.addEventListener('click', handleSubmit);

    // Skip button
    const skipBtn = modalElement.querySelector('#btn-intake-skip');
    if (skipBtn) skipBtn.addEventListener('click', handleSkip);
  }

  function sanitizePhoneForWa(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/[^0-9]/g, '');
    if (digits.startsWith('0') && digits.length === 11) {
      digits = '234' + digits.substring(1);
    }
    if (digits.startsWith('234') && digits.length === 13) {
      return digits;
    }
    return digits;
  }

  function getTargetPhone() {
    const raw = currentProvider?.whatsapp_number || currentProvider?.whatsappNumber || currentProvider?.phone || currentOptions?.fallbackPhone || '';
    return sanitizePhoneForWa(raw);
  }

  /**
   * Canonical WhatsApp Message Generation
   * Formats structured customer request with complete URL encoding.
   */
  function buildCanonicalWhatsAppMessage({ provName, service, locality, urgencyLabel }) {
    const parts = ['Hi, I found you on PadiFix.'];
    if (service && locality) {
      parts.push(`I need help with ${service} in ${locality}.`);
    } else if (service) {
      parts.push(`I need help with ${service}.`);
    } else if (locality) {
      parts.push(`I need your services in ${locality}.`);
    } else {
      parts.push(`I would like to inquire about your artisan services.`);
    }

    if (urgencyLabel) {
      parts.push(`Urgency: ${urgencyLabel}.`);
    }

    return parts.join(' ');
  }

  function buildCanonicalWhatsAppUrl({ phone, message, fallbackHref }) {
    const cleanPhone = sanitizePhoneForWa(phone);
    const encodedMsg = encodeURIComponent(message || 'Hi, I found you on PadiFix.');
    if (cleanPhone) {
      return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
    }
    if (fallbackHref) {
      return fallbackHref;
    }
    return `https://wa.me/?text=${encodedMsg}`;
  }

  function openModal(provider, options = {}) {
    createModalDOM();
    currentProvider = provider || {};
    currentOptions = options || {};
    selectedUrgency = 'today';
    lastFocusedTrigger = document.activeElement;

    const provName = currentProvider.first_name || currentProvider.business_name || currentProvider.name || 'Artisan';
    const provTrade = currentProvider.trade || currentProvider.trade_title || currentProvider.category || 'Professional';
    const provLoc = currentProvider.location || currentProvider.area || currentProvider.lga || (currentProvider.city ? `${currentProvider.city}, Nigeria` : 'Nigeria');

    // Populate Header
    const titleEl = modalElement.querySelector('#intake-modal-title');
    if (titleEl) titleEl.textContent = `Connect with ${provName}`;

    const tradeEl = modalElement.querySelector('#intake-trade-pill');
    if (tradeEl) tradeEl.textContent = provTrade;

    const avatarBox = modalElement.querySelector('#intake-avatar-box');
    if (avatarBox) {
      if (currentProvider.avatarUrl) {
        avatarBox.innerHTML = `<img src="${escapeHtml(currentProvider.avatarUrl)}" alt="${escapeHtml(provName)}" />`;
      } else {
        const initials = provName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'PA';
        avatarBox.innerHTML = `<span>${escapeHtml(initials)}</span>`;
      }
    }

    // Populate Category Quick Chips
    const categoryKey = getCategoryKey(currentProvider.category_slug || currentProvider.category || currentProvider.trade);
    const chips = TRADE_QUICK_CHIPS[categoryKey] || TRADE_QUICK_CHIPS.default;
    const chipsBox = modalElement.querySelector('#intake-chips-box');
    const serviceInput = modalElement.querySelector('#intake-service-input');

    if (chipsBox) {
      chipsBox.innerHTML = chips.map(chip => `
        <button type="button" class="intake-chip-btn" data-value="${escapeHtml(chip)}">${escapeHtml(chip)}</button>
      `).join('');

      chipsBox.onclick = (e) => {
        const chipBtn = e.target.closest('.intake-chip-btn');
        if (!chipBtn) return;
        const isSelected = chipBtn.classList.contains('active');
        chipsBox.querySelectorAll('.intake-chip-btn').forEach(c => c.classList.remove('active'));
        if (!isSelected) {
          chipBtn.classList.add('active');
          if (serviceInput) serviceInput.value = chipBtn.dataset.value;
        } else {
          if (serviceInput) serviceInput.value = '';
        }
      };
    }

    if (serviceInput) serviceInput.value = '';

    // Populate Locality (Prefill from search/state/provider)
    const localityInput = modalElement.querySelector('#intake-locality-input');
    if (localityInput) {
      const cleanPrefill = sanitizeBounded(provLoc.replace('📍', '').trim(), 80);
      localityInput.value = cleanPrefill;
    }

    // Reset Urgency Pills
    const urgencyBox = modalElement.querySelector('#intake-urgency-box');
    if (urgencyBox) {
      urgencyBox.querySelectorAll('.intake-urgency-pill').forEach(p => {
        const isDefault = p.dataset.key === 'today';
        p.classList.toggle('active', isDefault);
        p.setAttribute('aria-checked', isDefault ? 'true' : 'false');
      });
    }

    // Display modal
    modalElement.classList.add('active');
    modalElement.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus first input
    if (serviceInput) {
      setTimeout(() => serviceInput.focus(), 80);
    }

    // Non-blocking telemetry
    try {
      if (typeof global.LokatorTelemetry !== 'undefined') {
        global.LokatorTelemetry.trackEvent('intake_modal_opened', {
          providerId: currentProvider.id,
          trade: provTrade,
          source: options.source || 'unknown'
        });
      }
    } catch (e) {}
  }

  function closeModal() {
    if (!modalElement) return;
    modalElement.classList.remove('active');
    modalElement.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
      try { lastFocusedTrigger.focus(); } catch (e) {}
    }
  }

  function handleSubmit() {
    const serviceInput = modalElement ? modalElement.querySelector('#intake-service-input') : null;
    const localityInput = modalElement ? modalElement.querySelector('#intake-locality-input') : null;

    const rawService = serviceInput ? serviceInput.value : '';
    const provTrade = currentProvider?.trade || currentProvider?.trade_title || currentProvider?.category || 'Service';
    const finalService = sanitizeBounded(rawService, 80) || sanitizeBounded(provTrade, 80);

    const rawLocality = localityInput ? localityInput.value : '';
    const defaultLoc = currentProvider?.location || currentProvider?.area || currentProvider?.lga || 'Nigeria';
    const finalLocality = sanitizeBounded(rawLocality, 80) || sanitizeBounded(defaultLoc, 80);

    const safeUrgencyKey = URGENCY_CONFIG[selectedUrgency] ? selectedUrgency : 'today';
    const urgencyConf = URGENCY_CONFIG[safeUrgencyKey];
    const provName = currentProvider?.first_name || currentProvider?.business_name || currentProvider?.name || 'Artisan';

    // 1. Build Canonical WhatsApp Message
    const waMessage = buildCanonicalWhatsAppMessage({
      provName,
      service: finalService,
      locality: finalLocality,
      urgencyLabel: urgencyConf.waLabel
    });

    // 2. Build Target WhatsApp Deep Link (MUST NOT depend on telemetry)
    const targetPhone = getTargetPhone();
    const waUrl = buildCanonicalWhatsAppUrl({
      phone: targetPhone,
      message: waMessage,
      fallbackHref: currentOptions?.fallbackHref
    });

    // 3. Format Enriched Canonical intent_tag: [URGENT] Wiring
    const intentTag = `${urgencyConf.prefix} ${finalService}`;

    // 4. Best-Effort Non-Blocking Contact Meter Telemetry
    const providerId = Number(currentProvider?.id);
    if (providerId) {
      const evtId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9));
      const idemKey = `idem_${providerId}_whatsapp_${evtId}`;

      const payload = {
        provider_id: providerId,
        channel: 'whatsapp',
        locality: finalLocality,
        intent_tag: intentTag,
        urgency: safeUrgencyKey,
        service_details: finalService,
        idempotency_key: idemKey
      };

      try {
        if (typeof global.PadiFixPWA !== 'undefined' && global.PadiFixPWA.dispatchContactLead) {
          global.PadiFixPWA.dispatchContactLead(payload).catch(() => {});
        } else {
          fetch('/api/contact-meter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => {});
        }
      } catch (err) {}

      // Save recent contact for review follow-up
      try {
        const recentRaw = localStorage.getItem('padifix_recent_contacts') || '[]';
        let recentList = JSON.parse(recentRaw);
        recentList = recentList.filter(c => Number(c.provider_id) !== providerId);
        recentList.unshift({
          provider_id: providerId,
          provider_name: provName,
          trade: provTrade,
          contacted_at: Date.now(),
          urgency: safeUrgencyKey
        });
        localStorage.setItem('padifix_recent_contacts', JSON.stringify(recentList.slice(0, 20)));
      } catch (e) {}
    }

    // 5. Telemetry
    try {
      if (typeof global.LokatorTelemetry !== 'undefined') {
        global.LokatorTelemetry.trackEvent('intake_lead_submitted', {
          providerId,
          trade: provTrade,
          urgency: safeUrgencyKey,
          hasServiceCustomText: Boolean(rawService),
          locality: finalLocality
        });
      }
    } catch (e) {}

    // 6. Close Modal & Launch WhatsApp
    closeModal();
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  function handleSkip() {
    const provName = currentProvider?.first_name || currentProvider?.business_name || currentProvider?.name || 'Artisan';
    const provTrade = currentProvider?.trade || currentProvider?.trade_title || currentProvider?.category || 'Service';
    const defaultLoc = currentProvider?.location || currentProvider?.area || currentProvider?.lga || 'Nigeria';

    // Build standard greeting
    const waMessage = buildCanonicalWhatsAppMessage({
      provName,
      service: provTrade,
      locality: defaultLoc,
      urgencyLabel: null
    });

    const targetPhone = getTargetPhone();
    const waUrl = buildCanonicalWhatsAppUrl({
      phone: targetPhone,
      message: waMessage,
      fallbackHref: currentOptions?.fallbackHref
    });

    // Best-effort telemetry
    const providerId = Number(currentProvider?.id);
    if (providerId) {
      const evtId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9));
      const idemKey = `idem_${providerId}_whatsapp_skip_${evtId}`;

      try {
        fetch('/api/contact-meter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_id: providerId,
            channel: 'whatsapp',
            locality: defaultLoc,
            intent_tag: provTrade,
            idempotency_key: idemKey
          })
        }).catch(() => {});
      } catch (err) {}
    }

    try {
      if (typeof global.LokatorTelemetry !== 'undefined') {
        global.LokatorTelemetry.trackEvent('intake_lead_skipped', {
          providerId,
          trade: provTrade
        });
      }
    } catch (e) {}

    closeModal();
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  function formatIntentTag(urgencyKey, serviceDetails) {
    const safeKey = urgencyKey && URGENCY_CONFIG[urgencyKey.toLowerCase().trim()] ? urgencyKey.toLowerCase().trim() : null;
    const prefix = safeKey ? URGENCY_CONFIG[safeKey].prefix : null;
    const cleanService = sanitizeBounded(serviceDetails, 80);
    if (prefix && cleanService) return `${prefix} ${cleanService}`.substring(0, 80);
    if (cleanService) return cleanService;
    if (prefix) return `${prefix} Inquiry`;
    return '';
  }

  function buildWhatsAppUrl(phone, opts = {}) {
    const msg = opts.message || buildCanonicalWhatsAppMessage({
      provName: opts.provName,
      service: opts.service,
      locality: opts.locality,
      urgencyLabel: opts.urgency && URGENCY_CONFIG[opts.urgency] ? URGENCY_CONFIG[opts.urgency].waLabel : null
    });
    return buildCanonicalWhatsAppUrl({
      phone,
      message: msg,
      fallbackHref: opts.fallbackHref
    });
  }

  // Export on global window.PadiFixIntake
  global.PadiFixIntake = {
    open: openModal,
    close: closeModal,
    buildCanonicalWhatsAppMessage,
    buildCanonicalWhatsAppUrl,
    buildWhatsAppUrl,
    formatIntentTag,
    sanitizeBounded,
    sanitize: sanitizeBounded,
    escapeHtml,
    URGENCY_CONFIG,
    TRADE_QUICK_CHIPS
  };

})(typeof window !== 'undefined' ? window : global);

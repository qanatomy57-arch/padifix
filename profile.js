// ============================================================================
// LOKATOR PROVIDER PROFILE CONTROLLER (profile.js) — SUPABASE REAL DATA
// Database-driven single provider profile, real WhatsApp/Call actions, and reviews
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // Safe HTML Escaping Helper (Inherits from LokatorDB / window or fallback)
  const escapeHtml = (typeof window !== 'undefined' && window.escapeHtml) ||
                     (typeof LokatorDB !== 'undefined' && LokatorDB.escapeHtml) ||
                     ((v) => (v === null || v === undefined) ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'));

  // 1. Get Provider ID from URL query parameters
  const params = new URLSearchParams(window.location.search);
  const providerId = parseInt(params.get('id'), 10);

  if (!providerId) {
    showNotFound();
    return;
  }

  // 2. Fetch Provider Record from Supabase Data Layer
  let provider = null;
  try {
    provider = await LokatorDB.getProviderById(providerId);
  } catch (err) {
    console.error('Failed to load provider from Supabase:', err);
  }

  if (!provider) {
    showNotFound();
    return;
  }

  function showNotFound() {
    document.title = 'Provider Not Found — PadiFix';
    const main = document.querySelector('.profile-page-main');
    if (main) {
      main.innerHTML = `
        <div class="container" style="text-align: center; padding: 80px 20px;">
          <div style="font-size: 56px; margin-bottom: 12px;">🔍</div>
          <h2 style="font-size: 26px; font-weight: 800; color: var(--fg);">Provider Not Found</h2>
          <p style="color: var(--fg-muted); margin: 12px auto 24px; max-width: 480px;">
            The artisan profile you requested does not exist or is no longer publicly listed. Browse all active service providers in our directory.
          </p>
          <a href="search.html" class="btn btn-primary btn-lg">Browse Service Directory →</a>
        </div>
      `;
    }
    const stickyBar = document.getElementById('profile-mobile-sticky-bar');
    if (stickyBar) stickyBar.style.display = 'none';
    document.body.classList.remove('has-sticky-bar');
    const searchContextBanner = document.getElementById('profile-search-context-banner');
    if (searchContextBanner) searchContextBanner.style.display = 'none';
  }

  // Update Page Title & Meta
  document.title = `${provider.name || 'Artisan'} — ${provider.trade || 'Service'} | PadiFix`;

  // 3. Populate Breadcrumbs & Hero Header with Phase 10.9 & Phase 10.21 Discovery Context
  const queryParam = params.get('q') || '';
  const skillParam = params.get('skill') || params.get('service');
  const actionParam = params.get('action') || '';
  const locParam = params.get('loc') || '';
  const urgencyParam = params.get('urgency') || '';
  const budgetParam = params.get('budget') || '';
  const stateParam = params.get('state') || provider.state;
  const lgaParam = params.get('lga') || provider.lga;
  const cityParam = params.get('city') || provider.city;
  const indParam = params.get('industry');
  const sourceParam = params.get('source');

  // Phase 10.21: Search Context Notice Banner
  const contextBanner = document.getElementById('profile-search-context-banner');
  const contextTitle = document.getElementById('context-banner-query-title');
  const contextSubtext = document.getElementById('context-banner-subtext');
  if (contextBanner && (queryParam || skillParam || locParam || actionParam)) {
    contextBanner.style.display = 'flex';
    if (contextTitle) {
      contextTitle.textContent = queryParam ? `Your Request: "${queryParam}"` : `Request: ${skillParam || provider.trade}`;
    }
    if (contextSubtext) {
      const parts = [];
      if (skillParam) parts.push(skillParam);
      if (actionParam) parts.push(actionParam.toUpperCase());
      if (locParam) parts.push(`in ${locParam}`);
      if (urgencyParam) parts.push(`(${urgencyParam})`);
      contextSubtext.textContent = parts.length > 0 ? `Context pre-filled: ${parts.join(' • ')}` : 'Context pre-filled into WhatsApp Job Brief below';
    }
  }

  const breadcrumbsEl = document.querySelector('.profile-breadcrumbs');
  if (breadcrumbsEl && typeof MarketplaceTaxonomy !== 'undefined') {
    const context = MarketplaceTaxonomy.buildDiscoveryContext({
      industry: indParam,
      skill: skillParam || provider.trade,
      state: stateParam,
      lga: lgaParam,
      city: cityParam,
      source: sourceParam || 'profile'
    });

    const crumbs = [{ label: 'Home', url: 'index.html' }];
    if (context.industry) {
      crumbs.push({ label: context.industry.name, url: `search.html?industry=${encodeURIComponent(context.industry.id)}` });
    }
    if (stateParam) {
      crumbs.push({ label: stateParam, url: `search.html?state=${encodeURIComponent(stateParam)}` });
    }
    if (lgaParam && lgaParam !== stateParam) {
      crumbs.push({ label: lgaParam, url: `search.html?state=${encodeURIComponent(stateParam || '')}&lga=${encodeURIComponent(lgaParam)}` });
    }
    if (queryParam) {
      crumbs.push({ label: `Search: "${queryParam}"`, url: `search.html?q=${encodeURIComponent(queryParam)}` });
    } else {
      crumbs.push({ label: provider.trade, url: `search.html?service=${encodeURIComponent(provider.trade)}${stateParam ? '&state=' + encodeURIComponent(stateParam) : ''}` });
    }
    crumbs.push({ label: provider.name, url: null });

    breadcrumbsEl.innerHTML = crumbs.map((c, i) => {
      if (i === crumbs.length - 1) {
        return `<span class="current" id="crumb-provider-name">${escapeHtml(c.label)}</span>`;
      }
      return `<a href="${escapeHtml(c.url)}">${escapeHtml(c.label)}</a><span class="sep">/</span>`;
    }).join(' ');
  } else {
    const crumbName = document.getElementById('crumb-provider-name');
    if (crumbName) crumbName.textContent = provider.name;
    const searchBackLink = document.getElementById('breadcrumb-search-link');
    if (searchBackLink && queryParam) {
      searchBackLink.href = `search.html?q=${encodeURIComponent(queryParam)}`;
    }
  }

  const heroAvatar = document.getElementById('hero-avatar');
  if (heroAvatar) {
    if (provider.avatarUrl) {
      heroAvatar.innerHTML = `<img src="${escapeHtml(provider.avatarUrl)}" alt="${escapeHtml(provider.name)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
    } else {
      const parts = (provider.name || 'Artisan').trim().split(/\s+/).filter(Boolean);
      const initials = parts.length > 0 ? (parts.length === 1 ? parts[0].substring(0, 2) : (parts[0][0] + parts[parts.length - 1][0])).toUpperCase() : 'LK';
      heroAvatar.textContent = initials;
      heroAvatar.style.background = provider.avatarBg || 'var(--green)';
    }
  }

  const heroStatus = document.getElementById('hero-status-badge');
  if (heroStatus) {
    heroStatus.className = `profile-status-badge ${provider.isAvailable ? 'online' : 'offline'}`;
    heroStatus.title = provider.isAvailable ? 'Available today for jobs' : 'Currently busy';
  }

  const heroName = document.getElementById('hero-name');
  if (heroName) {
    heroName.innerHTML = `
      ${escapeHtml(provider.name || 'Service Provider')}
      ${provider.isTop ? '<span class="badge-tag-top" style="font-size: 12px; vertical-align: middle; margin-left: 8px;">⭐ Top Pick</span>' : ''}
    `;
  }

  const heroTrade = document.getElementById('hero-trade');
  if (heroTrade) {
    let rawTrade = provider.trade_title || provider.trade || provider.category || 'Specialist Artisan';
    if (provider.name && rawTrade.startsWith(provider.name + ' - ')) {
      rawTrade = rawTrade.replace(provider.name + ' - ', '').trim();
    }
    heroTrade.textContent = rawTrade;
  }

  const heroLocationText = document.getElementById('hero-location-text');
  if (heroLocationText) {
    const displayLoc = provider.area || (provider.lga && provider.state ? `${provider.lga}, ${provider.state}` : (provider.city || 'Nigeria'));
    heroLocationText.textContent = displayLoc;
  }

  const revCount = parseInt(provider.reviewsCount != null ? provider.reviewsCount : (provider.reviews ? provider.reviews.length : 0), 10);
  const heroRatingStars = document.getElementById('hero-rating-stars');
  if (heroRatingStars) {
    if (revCount > 0) {
      heroRatingStars.innerHTML = `★ <strong id="hero-rating-val">${Number(provider.rating != null ? provider.rating : 5).toFixed(1)}</strong> (<span id="hero-reviews-count">${revCount}</span> reviews)`;
    } else {
      heroRatingStars.innerHTML = `⭐ <strong id="hero-rating-val">New</strong> (<span id="hero-reviews-count">0</span> reviews)`;
    }
  } else {
    const heroRatingVal = document.getElementById('hero-rating-val');
    if (heroRatingVal) heroRatingVal.textContent = revCount > 0 ? Number(provider.rating != null ? provider.rating : 5).toFixed(1) : 'New';

    const heroReviewsCount = document.getElementById('hero-reviews-count');
    if (heroReviewsCount) heroReviewsCount.textContent = String(revCount);
  }

  // 3.1 Dynamic Verification & Trust Badge (Phase 006 Canonical Engine)
  const heroVerifiedBadge = document.getElementById('hero-verified-badge');
  if (heroVerifiedBadge) {
    const Monetization = (typeof PadiFixMonetization !== 'undefined') ? PadiFixMonetization : null;
    const verState = Monetization && typeof Monetization.resolveVerificationState === 'function'
      ? Monetization.resolveVerificationState(provider)
      : {
          key: (provider.ninVerified || provider.nin_verified) ? 'VERIFIED_NIN' :
               (provider.isVerified || provider.is_verified) ? 'VERIFIED_PLATFORM' :
               (provider.verificationStatus === 'pending' || provider.verification_requested) ? 'PENDING' : 'UNVERIFIED',
          publicBadgeText: (provider.ninVerified || provider.nin_verified) ? 'National NIN Verified' :
                           (provider.isVerified || provider.is_verified) ? 'Platform Reviewed' :
                           (provider.verificationStatus === 'pending' || provider.verification_requested) ? 'Pending Verification' : 'Self-Reported Profile',
          badgeClass: (provider.ninVerified || provider.nin_verified || provider.isVerified || provider.is_verified) ? 'profile-verified-pill verified' :
                      (provider.verificationStatus === 'pending' || provider.verification_requested) ? 'profile-verified-pill pending' : 'profile-verified-pill unverified',
          icon: (provider.ninVerified || provider.nin_verified) ? '🛡️' :
                (provider.isVerified || provider.is_verified) ? '✓' :
                (provider.verificationStatus === 'pending' || provider.verification_requested) ? '⏳' : 'ℹ️',
          description: (provider.ninVerified || provider.nin_verified) ? 'National identity validated via Virtual NIN tokenization.' :
                       (provider.isVerified || provider.is_verified) ? 'Trade credentials vetted by PadiFix compliance.' :
                       'Self-reported listing details supplied by provider.'
        };

    heroVerifiedBadge.className = verState.badgeClass;
    if (verState.icon === '🛡️') {
      heroVerifiedBadge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ${escapeHtml(verState.publicBadgeText)}`;
    } else if (verState.icon === '✓') {
      heroVerifiedBadge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ${escapeHtml(verState.publicBadgeText)}`;
    } else {
      heroVerifiedBadge.innerHTML = `${verState.icon} ${escapeHtml(verState.publicBadgeText)}`;
    }
    heroVerifiedBadge.style.display = 'inline-flex';
    heroVerifiedBadge.setAttribute('title', verState.description || 'View trust details');
    heroVerifiedBadge.setAttribute('role', 'button');
    heroVerifiedBadge.setAttribute('tabindex', '0');
    heroVerifiedBadge.setAttribute('aria-label', `${verState.publicBadgeText}. Click to view verification details.`);
    heroVerifiedBadge.style.cursor = 'pointer';

    // Interactive Trust Badge Explainer Trigger
    heroVerifiedBadge.onclick = () => showTrustBadgeExplainer(verState, provider);
    heroVerifiedBadge.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showTrustBadgeExplainer(verState, provider);
      }
    };
  }

  function showTrustBadgeExplainer(verState, prov) {
    const modal = document.getElementById('modal-trust-explainer');
    if (!modal) return;

    const modalIcon = document.getElementById('trust-modal-icon');
    const modalHeading = document.getElementById('trust-modal-heading');
    const modalDesc = document.getElementById('trust-modal-description');
    const modalPillars = document.getElementById('trust-modal-pillars');
    const btnClose = document.getElementById('btn-close-trust-modal');
    const btnDismiss = document.getElementById('btn-dismiss-trust-modal');

    if (modalIcon) modalIcon.textContent = verState.icon || '🛡️';
    if (modalHeading) modalHeading.textContent = verState.publicBadgeText || 'Trust Details';
    if (modalDesc) modalDesc.textContent = verState.description || 'PadiFix distinguishes self-reported information from official compliance verification.';

    if (modalPillars) {
      const Monetization = (typeof PadiFixMonetization !== 'undefined') ? PadiFixMonetization : null;
      const signals = Monetization && typeof Monetization.getTrustSignals === 'function'
        ? Monetization.getTrustSignals(prov)
        : { trustPillars: [] };

      if (signals.trustPillars && signals.trustPillars.length > 0) {
        modalPillars.innerHTML = signals.trustPillars.map(pillar => `
          <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 14px; display: flex; align-items: flex-start; gap: 10px;">
            <span style="font-size: 16px; line-height: 1.2;">${pillar.icon}</span>
            <div>
              <div style="font-weight: 600; font-size: 13px; color: #fff;">${escapeHtml(pillar.title)}</div>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">${escapeHtml(pillar.text)}</div>
            </div>
          </div>
        `).join('');
      } else {
        modalPillars.innerHTML = `
          <div style="background: rgba(255,255,255,0.04); border-radius: 8px; padding: 10px 14px; font-size: 12.5px; color: #cbd5e1;">
            ${escapeHtml(verState.description)}
          </div>
        `;
      }
    }

    modal.style.display = 'flex';

    const closeModal = () => {
      modal.style.display = 'none';
      if (heroVerifiedBadge) heroVerifiedBadge.focus();
    };

    if (btnClose) btnClose.onclick = closeModal;
    if (btnDismiss) btnDismiss.onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    });
  }

  // 4. Populate Metric Badges
  const metricRating = document.getElementById('metric-rating');
  if (metricRating) metricRating.textContent = revCount > 0 ? `★ ${Number(provider.rating != null ? provider.rating : 5).toFixed(1)}` : '★ New';

  const metricJobs = document.getElementById('metric-jobs');
  if (metricJobs) metricJobs.textContent = `${parseInt(provider.completedJobs, 10) || 50}+`;

  const metricExp = document.getElementById('metric-exp');
  if (metricExp) metricExp.textContent = `${parseInt(provider.experienceYrs, 10) || 3} Years`;

  const metricResponse = document.getElementById('metric-response');
  if (metricResponse) metricResponse.textContent = provider.responseTime || '~15 mins';

  // 5. Hero Action Buttons (Direct Call & WhatsApp via NigeriaPhone)
  const PhoneEngine = (typeof NigeriaPhone !== 'undefined' ? NigeriaPhone : null) || (typeof window !== 'undefined' ? window.NigeriaPhone : null);
  const providerLocation = provider.area || (provider.lga && provider.state ? `${provider.lga}, ${provider.state}` : provider.city) || 'your area';
  
  function getTelUrl() {
    return PhoneEngine ? PhoneEngine.buildTelUrl(provider) : (provider.phone ? `tel:${provider.phone}` : '');
  }

  function getWaUrl(customMsg = null) {
    if (PhoneEngine) {
      if (customMsg) return PhoneEngine.buildWhatsAppUrl(provider, { customMessage: customMsg });
      return PhoneEngine.buildSmartWhatsAppUrl
        ? PhoneEngine.buildSmartWhatsAppUrl(provider, { service: provider.trade, lga: provider.lga, state: provider.state })
        : PhoneEngine.buildWhatsAppUrl(provider, { service: provider.trade, location: providerLocation });
    }
    const cleanNum = (provider.whatsapp_number || provider.phone || '').replace(/\D/g, '');
    if (!cleanNum) return '';
    return customMsg ? `https://wa.me/${cleanNum}?text=${encodeURIComponent(customMsg)}` : `https://wa.me/${cleanNum}`;
  }

  let heroTelUrl = getTelUrl();
  let heroWaUrl = getWaUrl();

  // Phase 010 / Phase 014: Server-side contact metering with idempotency, soft-cap, and PWA outbox
  function checkOrMeterContact(channel, e) {
    if (channel === 'whatsapp') {
      // Phase 014 Product Invariant — Zero-Friction Consumer Guarantee:
      // CONSUMERS MUST NEVER BE BLOCKED FROM CONTACTING AN ARTISAN ON WHATSAPP.

      // 1. Record minimal recent contact locally for 24-48h review follow-up
      try {
        const rawContacts = localStorage.getItem('padifix_recent_contacts') || '[]';
        let recentList = JSON.parse(rawContacts);
        recentList = recentList.filter(c => String(c.provider_id) !== String(provider.id));
        recentList.unshift({
          provider_id: provider.id,
          provider_name: provider.name || '',
          trade: provider.trade || '',
          contacted_at: Date.now()
        });
        localStorage.setItem('padifix_recent_contacts', JSON.stringify(recentList.slice(0, 20)));
      } catch (err) {}

      // 2. Asynchronous non-blocking lead metering / offline queueing
      // Phase 014: Cryptographic attempt UUID with 30s duplicate-tap debounce
      if (!window._padifixContactAttempts) window._padifixContactAttempts = new Map();
      const attemptCacheKey = `${provider.id}_whatsapp`;
      const nowTime = Date.now();
      let idemKey;
      const cachedAttempt = window._padifixContactAttempts.get(attemptCacheKey);
      if (cachedAttempt && (nowTime - cachedAttempt.time) < 30000) {
        idemKey = cachedAttempt.key;
      } else {
        const evtId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9));
        idemKey = `idem_${provider.id}_whatsapp_${evtId}`;
        window._padifixContactAttempts.set(attemptCacheKey, { key: idemKey, time: nowTime });
      }

      if (typeof PadiFixPWA !== 'undefined' && PadiFixPWA.dispatchContactLead) {
        PadiFixPWA.dispatchContactLead({
          provider_id: provider.id,
          channel: 'whatsapp',
          idempotency_key: idemKey
        }).catch(() => {});
      } else if (typeof LokatorDB !== 'undefined' && LokatorDB.contactMeter) {
        let visitorSession = sessionStorage.getItem('padifix_visitor_session');
        if (!visitorSession) {
          visitorSession = 'vis_' + Math.random().toString(36).substring(2, 9);
          sessionStorage.setItem('padifix_visitor_session', visitorSession);
        }
        try {
          LokatorDB.contactMeter.meterContact(provider.id, 'whatsapp', {
            session_token: visitorSession,
            mode: 'soft_cap',
            soft_cap: true,
            idempotency_key: idemKey
          });
        } catch (mErr) {}
      }

      // Consumer is NEVER blocked on WhatsApp
      return true;
    }

    // Direct phone call or other channels retain standard flow
    if (typeof LokatorDB !== 'undefined' && LokatorDB.contactMeter) {
      let visitorSession = sessionStorage.getItem('padifix_visitor_session');
      if (!visitorSession) {
        visitorSession = 'vis_' + Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem('padifix_visitor_session', visitorSession);
      }

      const meterRes = LokatorDB.contactMeter.meterContact(provider.id, channel, {
        session_token: visitorSession
      });

      if (!meterRes.allowed && meterRes.limit_reached) {
        if (e && e.preventDefault) {
          e.preventDefault();
          e.stopPropagation();
        }
        const limitModal = document.getElementById('contact-limit-modal');
        if (limitModal) {
          limitModal.classList.add('active');
          limitModal.setAttribute('aria-hidden', 'false');
          document.body.style.overflow = 'hidden';
        } else {
          showProfileToast("This artisan has reached their monthly customer inquiry limit. Please explore other artisans.", 4000);
        }
        return false;
      }
    }
    return true;
  }

  // Bind Contact Limit Modal Close Controls
  const btnCloseContactLimit = document.getElementById('btn-close-contact-limit');
  const contactLimitModal = document.getElementById('contact-limit-modal');
  if (btnCloseContactLimit && contactLimitModal) {
    btnCloseContactLimit.addEventListener('click', () => {
      contactLimitModal.classList.remove('active');
      contactLimitModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    });
    contactLimitModal.addEventListener('click', (e) => {
      if (e.target === contactLimitModal) {
        contactLimitModal.classList.remove('active');
        contactLimitModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
    });
  }

  // Unified Contact Coordinate Unlocker via /api/contact-meter
  let contactUnlockPromise = null;
  async function ensureContactUnlocked(channel = 'whatsapp') {
    if (provider.phone && (channel !== 'whatsapp' || provider.whatsapp_number)) {
      return { phone: provider.phone, whatsapp: provider.whatsapp_number || provider.phone };
    }
    if (contactUnlockPromise) return contactUnlockPromise;

    contactUnlockPromise = (async () => {
      try {
        if (typeof PadiFixPWA !== 'undefined' && PadiFixPWA.dispatchContactLead) {
          const res = await PadiFixPWA.dispatchContactLead({
            provider_id: provider.id,
            channel: channel
          });
          if (res && res.contact) {
            if (res.contact.phone) provider.phone = res.contact.phone;
            if (res.contact.whatsapp_number) provider.whatsapp_number = res.contact.whatsapp_number;
            refreshAllContactButtons();
            return { phone: provider.phone, whatsapp: provider.whatsapp_number || provider.phone };
          }
          if (res && !res.allowed && res.limit_reached) {
            return { limitReached: true };
          }
        }
      } catch (err) {
        console.warn('Contact coordinate unlock failed:', err);
      } finally {
        contactUnlockPromise = null;
      }
      return { phone: provider.phone, whatsapp: provider.whatsapp_number || provider.phone };
    })();
    return contactUnlockPromise;
  }

  function refreshAllContactButtons() {
    heroTelUrl = getTelUrl();
    heroWaUrl = getWaUrl();

    const heroCall = document.getElementById('btn-call-hero');
    const heroWa = document.getElementById('btn-wa-hero');
    const sideCall = document.getElementById('sidebar-call-btn');
    const sidePhone = document.getElementById('sidebar-phone-text');
    const stickCall = document.getElementById('sticky-call-btn');
    const waSend = document.getElementById('wa-send-btn');

    if (heroCall && heroTelUrl) heroCall.href = heroTelUrl;
    if (heroWa && heroWaUrl) heroWa.href = heroWaUrl;
    if (sideCall && heroTelUrl) sideCall.href = heroTelUrl;
    if (sidePhone && provider.phone) {
      sidePhone.textContent = provider.phoneDisplay || provider.phone;
    }
    if (stickCall && heroTelUrl) stickCall.href = heroTelUrl;
    if (waSend && heroWaUrl) waSend.href = heroWaUrl;
    if (typeof updateWhatsAppPreview === 'function') {
      try { updateWhatsAppPreview(); } catch (e) {}
    }
  }

  function showContactLimitModal() {
    const limitModal = document.getElementById('contact-limit-modal');
    if (limitModal) {
      limitModal.classList.add('active');
      limitModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    } else {
      showProfileToast("This artisan has reached their monthly customer inquiry limit. Please explore other artisans.", 4000);
    }
  }

  const btnCallHero = document.getElementById('btn-call-hero');
  if (btnCallHero) {
    btnCallHero.style.display = 'inline-flex';
    if (heroTelUrl) btnCallHero.href = heroTelUrl;
    btnCallHero.addEventListener('click', async (e) => {
      if (!provider.phone) {
        e.preventDefault();
        const prevText = btnCallHero.innerHTML;
        btnCallHero.innerHTML = `Connecting...`;
        const res = await ensureContactUnlocked('call');
        btnCallHero.innerHTML = prevText;
        if (res && res.limitReached) {
          showContactLimitModal();
          return;
        }
        if (res && res.phone) {
          window.location.href = `tel:${res.phone}`;
        }
        return;
      }
      if (!checkOrMeterContact('call', e)) return;
      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('phone_clicked', {
          providerId: provider.id,
          trade: provider.trade,
          category: provider.primary_category_slug || provider.categorySlug || provider.trade,
          city: provider.city,
          state: provider.state || stateParam,
          lga: provider.lga || lgaParam,
          verificationStatus: provider.verificationStatus || (provider.ninVerified ? 'verified' : (provider.isVerified ? 'reviewed' : 'unverified'))
        });
      }
      if (typeof LokatorDB !== 'undefined' && LokatorDB.marketplaceDiscovery) {
        LokatorDB.marketplaceDiscovery.trackDiscoveryEvent('phone_clicked', {
          provider_id: provider.id,
          trade: provider.trade,
          city: provider.city,
          state: provider.state || stateParam
        }).catch(() => {});
      }
    });
  }

  const btnWaHero = document.getElementById('btn-wa-hero');
  if (btnWaHero) {
    btnWaHero.style.display = 'inline-flex';
    if (heroWaUrl) btnWaHero.href = heroWaUrl;
    btnWaHero.addEventListener('click', async (e) => {
      if (!provider.phone && !provider.whatsapp_number) {
        e.preventDefault();
        const prevText = btnWaHero.innerHTML;
        btnWaHero.innerHTML = `Opening WhatsApp...`;
        const res = await ensureContactUnlocked('whatsapp');
        btnWaHero.innerHTML = prevText;
        if (res && res.limitReached) {
          showContactLimitModal();
          return;
        }
        const targetWa = (res && res.whatsapp) ? res.whatsapp : (res && res.phone ? res.phone : null);
        if (targetWa) {
          const num = targetWa.replace(/\D/g, '');
          const encodedMsg = encodeURIComponent(`Hello ${provider.name}, I found your verified profile on PadiFix and would like to inquire about your ${provider.trade} services.`);
          window.open(`https://wa.me/${num}?text=${encodedMsg}`, '_blank', 'noopener,noreferrer');
        }
        return;
      }
      if (!checkOrMeterContact('whatsapp', e)) return;
      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('whatsapp_clicked', {
          providerId: provider.id,
          trade: provider.trade,
          category: provider.primary_category_slug || provider.categorySlug || provider.trade,
          city: provider.city,
          state: provider.state || stateParam,
          lga: provider.lga || lgaParam,
          verificationStatus: provider.verificationStatus || (provider.ninVerified ? 'verified' : (provider.isVerified ? 'reviewed' : 'unverified'))
        });
      }
      if (typeof LokatorDB !== 'undefined' && LokatorDB.marketplaceDiscovery) {
        LokatorDB.marketplaceDiscovery.trackDiscoveryEvent('whatsapp_clicked', {
          provider_id: provider.id,
          trade: provider.trade,
          city: provider.city,
          state: provider.state || stateParam
        }).catch(() => {});
      }
    });
  }

  // Track profile view
  if (typeof LokatorTelemetry !== 'undefined') {
    LokatorTelemetry.trackEvent('provider_profile_viewed', {
      providerId: provider.id,
      trade: provider.trade,
      category: provider.primary_category_slug || provider.categorySlug || provider.trade,
      city: provider.city,
      state: provider.state || stateParam,
      lga: provider.lga || lgaParam,
      verificationStatus: provider.verificationStatus || (provider.ninVerified ? 'verified' : (provider.isVerified ? 'reviewed' : 'unverified'))
    });
  }
  if (typeof LokatorDB !== 'undefined' && LokatorDB.marketplaceDiscovery) {
    LokatorDB.marketplaceDiscovery.trackDiscoveryEvent('provider_profile_opened', {
      provider_id: provider.id,
      trade: provider.trade,
      city: provider.city,
      state: provider.state || stateParam
    }).catch(() => {});
  }

  // Share profile (Phase 005 Enhanced Shareability)
  const btnShare = document.getElementById('btn-share-profile');
  if (btnShare) {
    btnShare.addEventListener('click', () => {
      const shareData = {
        title: `${provider.name} — ${provider.trade} on PadiFix`,
        text: `Check out ${provider.name} (${provider.trade}) on PadiFix!`,
        url: window.location.href
      };

      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('provider_share_clicked', {
          providerId: provider.id,
          trade: provider.trade,
          channel: navigator.share ? 'native_share' : 'clipboard'
        });
      }

      if (navigator.share) {
        navigator.share(shareData).catch(() => {});
      } else {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(window.location.href);
        }
        const toast = document.createElement('div');
        toast.className = 'share-copied-toast';
        toast.textContent = '✓ Profile link copied to clipboard!';
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#006B3F;color:#FFF;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:700;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.4);transition:opacity 0.3s ease;';
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }, 2500);
      }
    });
  }

  // 5b. Bookmark Save Handler (Phase 10.15)
  const btnBookmarkHero = document.getElementById('btn-profile-bookmark');
  const iconBookmarkHero = document.getElementById('profile-bookmark-icon');
  if (btnBookmarkHero && typeof LokatorDB !== 'undefined' && LokatorDB.offline) {
    const isSaved = LokatorDB.offline.isProviderSaved(provider.id);
    if (iconBookmarkHero) iconBookmarkHero.textContent = isSaved ? '❤️' : '🤍';
    if (isSaved) btnBookmarkHero.classList.add('is-saved');

    btnBookmarkHero.addEventListener('click', () => {
      const nowSaved = LokatorDB.offline.isProviderSaved(provider.id);
      if (nowSaved) {
        LokatorDB.offline.removeProviderBookmark(provider.id);
        if (iconBookmarkHero) iconBookmarkHero.textContent = '🤍';
        btnBookmarkHero.classList.remove('is-saved');
        alert('Removed from your saved offline contacts.');
      } else {
        LokatorDB.offline.saveProviderBookmark(provider);
        if (iconBookmarkHero) iconBookmarkHero.textContent = '❤️';
        btnBookmarkHero.classList.add('is-saved');
        alert('Saved! You can access this artisan contact anytime, even when offline.');
      }
    });
  }

  // 6. Bio and Skills
  const bioFullText = document.getElementById('bio-full-text');
  if (bioFullText) bioFullText.textContent = provider.bio;

  const skillsContainer = document.getElementById('skills-container');
  if (skillsContainer && provider.skills) {
    skillsContainer.innerHTML = provider.skills.map(s => `
      <a href="search.html?q=${encodeURIComponent(s)}" class="skill-tag-pill" title="Discover ${escapeHtml(s)} specialists on PadiFix">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        <span>${escapeHtml(s)}</span>
      </a>
    `).join('');
  }

  // 7. Transparent Pricing Guide
  const pricingListContainer = document.getElementById('pricing-list-container');
  if (pricingListContainer && provider.pricingGuide) {
    pricingListContainer.innerHTML = provider.pricingGuide.map(item => `
      <div class="pricing-item-row">
        <strong>${escapeHtml(item.item)}</strong>
        <span class="price-val">${escapeHtml(item.price)}</span>
      </div>
    `).join('');
  }

  // 8. Portfolio Showcase & Lightbox
  const portfolioGrid = document.getElementById('portfolio-grid');
  const lightbox = document.getElementById('portfolio-lightbox');
  const lightboxClose = document.getElementById('lightbox-close-btn');
  const lightboxBanner = document.getElementById('lightbox-banner');
  const lightboxTitle = document.getElementById('lightbox-title');
  const lightboxDesc = document.getElementById('lightbox-desc');
  const lightboxTag = document.getElementById('lightbox-tag');

  let activePortfolioItems = [];
  let currentLightboxIdx = -1;

  function showLightboxItem(idx) {
    if (!lightbox || !activePortfolioItems || activePortfolioItems.length === 0) return;
    currentLightboxIdx = (idx + activePortfolioItems.length) % activePortfolioItems.length;
    const item = activePortfolioItems[currentLightboxIdx];
    if (!item) return;

    lightboxBanner.textContent = item.icon || '🛠️';
    lightboxBanner.style.background = `linear-gradient(135deg, ${item.accentColor || '#006B3F'}, #020D05)`;
    lightboxTitle.textContent = item.title;
    lightboxDesc.textContent = item.description;
    lightboxTag.textContent = `${item.tag || 'Verified Work'} • ${currentLightboxIdx + 1}/${activePortfolioItems.length}`;
    lightbox.classList.add('active');
    lightbox.setAttribute('aria-hidden', 'false');
  }

  function renderPortfolio(filter = 'all') {
    if (!portfolioGrid || !provider.portfolio) return;

    let items = provider.portfolio;
    if (filter === 'before-after') {
      items = items.filter(p => p.isBeforeAfter);
    } else if (filter === 'completed') {
      items = items.filter(p => !p.isBeforeAfter);
    }

    activePortfolioItems = items;

    if (items.length === 0) {
      portfolioGrid.innerHTML = `<p style="grid-column: 1/-1; color: var(--fg-muted); padding: 16px 0;">No items found in this category.</p>`;
      return;
    }

    portfolioGrid.innerHTML = items.map((item, idx) => {
      const safeIdx = parseInt(idx, 10);
      const safeAccent = (item.accentColor && item.accentColor.startsWith('#')) ? item.accentColor : '#006B3F';
      return `
        <div class="portfolio-card" data-idx="${safeIdx}" tabindex="0" role="button" aria-label="${escapeHtml(item.title)}">
          <div class="portfolio-card-thumb" style="background: linear-gradient(135deg, ${safeAccent}, #06180D);">
            <span class="portfolio-card-badge">${escapeHtml(item.tag || 'Verified Work')}</span>
            <span class="thumb-icon">${escapeHtml(item.icon || '🛠️')}</span>
          </div>
          <div class="portfolio-card-body">
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.description)}</p>
          </div>
        </div>
      `;
    }).join('');

    portfolioGrid.querySelectorAll('.portfolio-card').forEach(card => {
      const idx = parseInt(card.dataset.idx, 10);
      const openLb = () => {
        showLightboxItem(idx);
      };
      card.addEventListener('click', openLb);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openLb();
      });
    });
  }

  document.querySelectorAll('.ptab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ptab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPortfolio(btn.dataset.filter);
    });
  });

  renderPortfolio('all');

  if (lightboxClose && lightbox) {
    lightboxClose.addEventListener('click', () => {
      lightbox.classList.remove('active');
      lightbox.setAttribute('aria-hidden', 'true');
    });
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
      }
    });

    // Touch Swipe Gesture Navigation (Mobile Lightbox)
    let touchStartX = 0;
    let touchStartY = 0;

    lightbox.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    lightbox.addEventListener('touchend', (e) => {
      if (!lightbox.classList.contains('active') || currentLightboxIdx < 0) return;
      if (e.changedTouches && e.changedTouches.length > 0) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;

        // Ensure horizontal intent with >= 40px threshold
        if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
          if (deltaX < 0) {
            // Swiped left -> next
            showLightboxItem(currentLightboxIdx + 1);
          } else {
            // Swiped right -> previous
            showLightboxItem(currentLightboxIdx - 1);
          }
        }
      }
    }, { passive: true });

    // Keyboard navigation (Escape to close, ArrowLeft/ArrowRight to navigate)
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') {
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
      } else if (e.key === 'ArrowRight') {
        showLightboxItem(currentLightboxIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        showLightboxItem(currentLightboxIdx - 1);
      }
    });
  }

  // 9. Customer Reviews & 5-Star Histogram Calculation
  let currentReviewFilter = 'all';

  function showProfileToast(msg, type = 'success') {
    const toast = document.getElementById('profile-toast');
    if (!toast) {
      console.log(`[Toast ${type}]`, msg);
      return;
    }
    toast.textContent = msg;
    toast.className = `profile-toast ${type} active`;
    setTimeout(() => {
      toast.classList.remove('active');
    }, 4000);
  }

  function renderReviews(filter = 'all') {
    currentReviewFilter = filter;
    
    // Fetch live reviews from LokatorDB.reviews if available
    const liveReviews = (typeof LokatorDB !== 'undefined' && LokatorDB.reviews)
      ? LokatorDB.reviews.getProviderReviews(provider.id)
      : (provider.reviews || []);

    const summary = (typeof LokatorDB !== 'undefined' && LokatorDB.reviews)
      ? LokatorDB.reviews.getReviewSummary(provider.id)
      : {
          averageRating: provider.rating || 5.0,
          totalCount: liveReviews.length,
          distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        };

    const reviewsCount = summary.totalCount || liveReviews.length;
    const avgRating = summary.averageRating || provider.rating || 0;

    const scoreBig = document.getElementById('score-big-val');
    if (scoreBig) scoreBig.textContent = reviewsCount > 0 ? avgRating.toFixed(1) : 'New';

    const scoreBigStars = document.getElementById('score-big-stars');
    if (scoreBigStars) {
      scoreBigStars.textContent = reviewsCount > 0 ? ('★'.repeat(Math.round(avgRating)) + '☆'.repeat(5 - Math.round(avgRating))) : '☆☆☆☆☆';
    }

    const scoreSub = document.getElementById('score-sub-text');
    if (scoreSub) scoreSub.textContent = reviewsCount > 0 ? `Based on ${reviewsCount} verified review${reviewsCount === 1 ? '' : 's'}` : 'No customer reviews yet';

    if (heroRatingVal) heroRatingVal.textContent = reviewsCount > 0 ? avgRating.toFixed(1) : 'New';
    if (heroReviewsCount) heroReviewsCount.textContent = String(reviewsCount);
    if (metricRating) metricRating.textContent = reviewsCount > 0 ? `★ ${avgRating.toFixed(1)}` : '★ New';

    // Histogram
    const dist = summary.distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (let s = 1; s <= 5; s++) {
      const cntVal = dist[s] || 0;
      const pct = reviewsCount > 0 ? Math.round((cntVal / reviewsCount) * 100) : 0;
      const bar = document.getElementById(`histo-bar-${s}`);
      const cnt = document.getElementById(`histo-cnt-${s}`);
      if (bar) bar.style.width = `${pct}%`;
      if (cnt) cnt.textContent = `${pct}%`;
    }

    // Filter reviews
    let filteredReviews = [...liveReviews];
    if (filter === '5star') {
      filteredReviews = filteredReviews.filter(r => Math.round(Number(r.rating || 5)) === 5);
    } else if (filter === '4star') {
      filteredReviews = filteredReviews.filter(r => Math.round(Number(r.rating || 5)) === 4);
    } else if (filter === 'with_reply') {
      filteredReviews = filteredReviews.filter(r => Boolean(r.provider_reply));
    }

    const reviewsContainer = document.getElementById('reviews-container');
    if (reviewsContainer) {
      if (filteredReviews.length === 0) {
        reviewsContainer.innerHTML = `<p style="color: var(--fg-muted); padding: 16px 0; text-align: center;">No reviews match this filter.</p>`;
        return;
      }

      reviewsContainer.innerHTML = filteredReviews.map(r => {
        const safeRating = Math.min(5, Math.max(1, parseInt(r.rating, 10) || 5));
        const starsStr = '★'.repeat(safeRating) + '☆'.repeat(5 - safeRating);
        const author = r.customer_name || r.author || 'Verified Client';
        const initials = author.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const safeRevId = r.id || Date.now();
        const dateStr = r.date || (r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent');
        const jobType = r.job_type || r.serviceType || 'Verified Task';
        const isVerifiedClient = r.is_verified_client !== false && r.isVerifiedCustomer !== false;
        const reply = r.provider_reply;
        const tags = Array.isArray(r.praise_tags) ? r.praise_tags : [];
        const photos = Array.isArray(r.photos) ? r.photos : [];

        return `
          <div class="review-item-card" id="rev-${safeRevId}">
            <div class="review-item-header">
              <div class="review-author-info">
                <div class="review-author-avatar">${escapeHtml(initials)}</div>
                <div class="review-author-name">
                  <strong>${escapeHtml(author)}</strong>
                  <span>📍 ${escapeHtml(r.location || 'Nigeria')} • ${escapeHtml(dateStr)}</span>
                </div>
              </div>
              <div class="review-stars">${starsStr}</div>
            </div>
            ${jobType ? `<span class="review-service-tag">✓ ${escapeHtml(jobType)}</span>` : ''}
            ${r.job_completed ? `<span style="background: rgba(0, 168, 89, 0.15); color: #34D399; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(0, 168, 89, 0.3); display: inline-flex; align-items: center; gap: 4px;">✓ Job Completed</span>` : ''}
            
            <!-- Sub-Ratings Breakdown -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; font-size: 11px; color: var(--fg-muted);">
              ${r.quality ? `<span style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">⭐ Quality: ${r.quality}★</span>` : ''}
              ${r.professionalism ? `<span style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">🤝 Professionalism: ${r.professionalism}★</span>` : ''}
              ${r.communication ? `<span style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">💬 Communication: ${r.communication}★</span>` : ''}
              ${r.pricing ? `<span style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">💰 Value: ${r.pricing}★</span>` : ''}
              ${r.punctuality ? `<span style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">⏱️ Punctuality: ${r.punctuality}★</span>` : ''}
            </div>

            <!-- Praise Tags -->
            ${tags.length > 0 ? `
              <div style="display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0;">
                ${tags.map(t => `<span style="background: rgba(0, 107, 63, 0.15); color: #34D399; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(0, 107, 63, 0.3);">${escapeHtml(t)}</span>`).join('')}
              </div>
            ` : ''}

            <p class="review-comment-text">${escapeHtml(r.comment)}</p>

            <!-- Attached Work Photos -->
            ${photos.length > 0 ? `
              <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
                ${photos.map(src => `
                  <div style="width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15);">
                    <img src="${escapeHtml(src)}" alt="Work photo" style="width: 100%; height: 100%; object-fit: cover;" />
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <!-- Nested Official Provider Response -->
            ${reply ? `
              <div style="margin-top: 12px; background: #F0FDF4; border: 1px solid #BBF7D0; border-left: 3.5px solid #006B3F; padding: 12px 14px; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: #15803D; font-weight: 800; margin-bottom: 3px;">
                  <span>👑 Response from Artisan</span>
                  <span style="color: var(--fg-muted); font-weight: 500;">${escapeHtml(reply.date || 'Recent')}</span>
                </div>
                <p style="color: #166534; font-size: 13px; margin: 0; line-height: 1.4;">${escapeHtml(reply.text)}</p>
              </div>
            ` : ''}

            <div class="review-item-footer">
              <span style="display: inline-flex; align-items: center; gap: 4px; color: ${isVerifiedClient ? '#006B3F' : 'var(--fg-muted)'}; font-weight: 600; font-size: 12px;">
                ${isVerifiedClient 
                  ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Verified Customer' 
                  : '💬 Customer Review'}
              </span>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="btn-report-review" data-rev-id="${safeRevId}" style="background: none; border: none; color: var(--fg-muted); font-size: 11.5px; cursor: pointer; padding: 4px 8px; border-radius: 4px;">
                  🚩 Report
                </button>
                <button class="btn-helpful" onclick="this.textContent = '✓ Helpful (1)'; this.disabled = true;">
                  👍 Helpful (${parseInt(r.helpfulCount, 10) || 0})
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  renderReviews('all');

  document.querySelectorAll('.btn-review-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-review-filter').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'rgba(255,255,255,0.06)';
        b.style.color = '#94A3B8';
        b.style.border = '1px solid rgba(255,255,255,0.1)';
      });
      btn.classList.add('active');
      btn.style.background = '#006B3F';
      btn.style.color = '#FFF';
      btn.style.border = 'none';
      renderReviews(btn.dataset.filter);
    });
  });

  // 10. Multi-Dimensional Interactive Write a Review Modal & Drawer Form
  const reviewModal = document.getElementById('review-modal');
  const btnOpenReviewModal = document.getElementById('btn-open-review-modal');
  const btnCloseReviewModal = document.getElementById('review-modal-close');
  const btnCancelReview = document.getElementById('btn-cancel-review');
  const reviewForm = document.getElementById('review-form');
  const starPicker = document.getElementById('star-picker');
  const ratingMoodBadge = document.getElementById('rating-mood-badge');
  const revCommentInput = document.getElementById('rev-comment');
  const revCommentCounter = document.getElementById('rev-comment-counter');
  const photoInput = document.getElementById('review-photo-input');
  const btnTriggerPhoto = document.getElementById('btn-trigger-photo-upload');
  const photoPreviewGrid = document.getElementById('review-photos-preview-grid');
  const livePreviewWrap = document.getElementById('live-review-preview-wrap');
  const livePreviewCard = document.getElementById('live-review-preview-card');

  let selectedOverallRating = 5;
  let selectedHiredStatus = 'completed';
  let selectedSubRatings = {
    quality: 5,
    professionalism: 5,
    communication: 5,
    pricing: 5,
    punctuality: 5
  };
  const selectedPraiseTags = new Set();
  const attachedPhotos = []; // Array of Data URLs

  // Phase 010: Post-Service Hired Status Toggle
  const hiredStatusButtons = document.querySelectorAll('.hired-status-btn');
  const jobCompletedFields = document.getElementById('job-completed-fields');
  const hiredFeedback = document.getElementById('hired-status-feedback');
  if (hiredStatusButtons.length > 0) {
    hiredStatusButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        hiredStatusButtons.forEach(b => {
          b.classList.remove('active');
          b.style.borderColor = 'rgba(255,255,255,0.15)';
          b.style.color = '#E2E8F0';
          b.style.background = 'transparent';
        });
        btn.classList.add('active');
        btn.style.borderColor = '#00A859';
        btn.style.color = '#34D399';
        btn.style.background = 'rgba(0, 168, 89, 0.15)';
        selectedHiredStatus = btn.dataset.status;
        if (selectedHiredStatus === 'completed') {
          if (jobCompletedFields) jobCompletedFields.style.display = 'block';
          if (hiredFeedback) hiredFeedback.textContent = 'Verified customer post-service feedback helps maintain genuine marketplace reputation.';
        } else if (selectedHiredStatus === 'in_progress') {
          if (jobCompletedFields) jobCompletedFields.style.display = 'none';
          if (hiredFeedback) hiredFeedback.textContent = 'Job in progress: You can submit your review once the artisan finishes the job.';
        } else {
          if (jobCompletedFields) jobCompletedFields.style.display = 'none';
          if (hiredFeedback) hiredFeedback.textContent = 'Not hired: Thank you for letting us know! Reviews are reserved for completed jobs to protect authentic reputation.';
        }
      });
    });
  }

  const MOOD_MAP = {
    1: '😡 Disappointing (1.0)',
    2: '🙁 Fair (2.0)',
    3: '😐 Good (3.0)',
    4: '😊 Very Good (4.0)',
    5: '🌟 Exceptional (5.0)'
  };

  // 10.1 Star Picker Handler (Overall)
  if (starPicker) {
    const starBtns = starPicker.querySelectorAll('.star-pick-btn');
    starBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        selectedOverallRating = parseInt(btn.dataset.val, 10);
        starBtns.forEach((b, i) => {
          b.classList.toggle('active', i < selectedOverallRating);
        });
        if (ratingMoodBadge) {
          ratingMoodBadge.textContent = MOOD_MAP[selectedOverallRating] || `${selectedOverallRating}.0`;
          if (selectedOverallRating <= 2) {
            ratingMoodBadge.style.color = '#F87171';
            ratingMoodBadge.style.background = 'rgba(239, 68, 68, 0.15)';
            ratingMoodBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
          } else if (selectedOverallRating === 3) {
            ratingMoodBadge.style.color = '#FBBF24';
            ratingMoodBadge.style.background = 'rgba(245, 158, 11, 0.15)';
            ratingMoodBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
          } else {
            ratingMoodBadge.style.color = '#34D399';
            ratingMoodBadge.style.background = 'rgba(52, 211, 153, 0.15)';
            ratingMoodBadge.style.borderColor = 'rgba(52, 211, 153, 0.3)';
          }
        }
        updateLiveReviewPreview();
      });
    });
  }

  // 10.2 Sub-Criteria Star Pickers
  document.querySelectorAll('.star-picker-sub').forEach(picker => {
    const field = picker.dataset.field;
    const btns = picker.querySelectorAll('.star-sub-btn');
    const labelVal = document.getElementById(`val-${field}`);

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val, 10);
        selectedSubRatings[field] = val;
        btns.forEach((b, i) => {
          b.classList.toggle('active', i < val);
        });
        if (labelVal) labelVal.textContent = `${val} ★`;
        updateLiveReviewPreview();
      });
    });
  });

  // 10.3 Praise Tags
  document.querySelectorAll('.praise-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const tag = pill.dataset.tag;
      if (selectedPraiseTags.has(tag)) {
        selectedPraiseTags.delete(tag);
        pill.classList.remove('active');
      } else {
        selectedPraiseTags.add(tag);
        pill.classList.add('active');
      }
      updateLiveReviewPreview();
    });
  });

  // 10.4 Character Counter
  if (revCommentInput && revCommentCounter) {
    revCommentInput.addEventListener('input', () => {
      const len = revCommentInput.value.length;
      revCommentCounter.textContent = `${len} / 500`;
      if (len > 450) {
        revCommentCounter.style.color = '#F87171';
      } else {
        revCommentCounter.style.color = '#94A3B8';
      }
      updateLiveReviewPreview();
    });
  }

  // 10.5 Photo Upload & Image Previews
  if (btnTriggerPhoto && photoInput) {
    btnTriggerPhoto.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => {
        if (attachedPhotos.length >= 3) return;
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (loadEvt) => {
          if (attachedPhotos.length < 3) {
            attachedPhotos.push(loadEvt.target.result);
            renderPhotoPreviews();
            updateLiveReviewPreview();
          }
        };
        reader.readAsDataURL(file);
      });
      photoInput.value = '';
    });
  }

  function renderPhotoPreviews() {
    if (!photoPreviewGrid) return;
    photoPreviewGrid.innerHTML = attachedPhotos.map((src, idx) => `
      <div class="photo-preview-thumb">
        <img src="${src}" alt="Attached photo" />
        <button type="button" class="btn-remove-thumb" data-idx="${idx}" aria-label="Remove image">✕</button>
      </div>
    `).join('');

    photoPreviewGrid.querySelectorAll('.btn-remove-thumb').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        attachedPhotos.splice(idx, 1);
        renderPhotoPreviews();
        updateLiveReviewPreview();
      });
    });
  }

  // 10.6 Live Review Preview Generator
  function updateLiveReviewPreview() {
    if (!livePreviewWrap || !livePreviewCard) return;
    const authorVal = (document.getElementById('rev-author')?.value || '').trim();
    const commentVal = (revCommentInput?.value || '').trim();
    const locationVal = (document.getElementById('rev-location')?.value || '').trim();
    const serviceVal = (document.getElementById('rev-service')?.value || '').trim();

    if (!authorVal && !commentVal) {
      livePreviewWrap.style.display = 'none';
      return;
    }

    livePreviewWrap.style.display = 'block';
    const starsStr = '★'.repeat(selectedOverallRating) + '☆'.repeat(5 - selectedOverallRating);
    const initials = (authorVal || 'You').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const tagsArr = Array.from(selectedPraiseTags);

    livePreviewCard.innerHTML = `
      <div class="review-item-header">
        <div class="review-author-info">
          <div class="review-author-avatar">${escapeHtml(initials)}</div>
          <div class="review-author-name">
            <strong>${escapeHtml(authorVal || 'Your Name')}</strong>
            <span>📍 ${escapeHtml(locationVal || 'Your Location')} • Just Now</span>
          </div>
        </div>
        <div class="review-stars">${starsStr}</div>
      </div>
      ${serviceVal ? `<span class="review-service-tag">✓ ${escapeHtml(serviceVal)}</span>` : ''}
      
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0; font-size: 11px; color: #94A3B8;">
        <span>⏱️ Punctuality: ${selectedSubRatings.punctuality}★</span>
        <span>💰 Pricing: ${selectedSubRatings.pricing}★</span>
        <span>⭐ Quality: ${selectedSubRatings.quality}★</span>
      </div>

      ${tagsArr.length > 0 ? `
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0;">
          ${tagsArr.map(t => `<span style="background: rgba(0, 107, 63, 0.2); color: #34D399; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 12px;">${escapeHtml(t)}</span>`).join('')}
        </div>
      ` : ''}

      <p class="review-comment-text">${escapeHtml(commentVal || 'Your review text will appear here...')}</p>

      ${attachedPhotos.length > 0 ? `
        <div style="display: flex; gap: 6px; margin-top: 8px;">
          ${attachedPhotos.map(src => `
            <div style="width: 50px; height: 50px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2);">
              <img src="${src}" alt="Attached preview" style="width: 100%; height: 100%; object-fit: cover;" />
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  // Live input binding
  ['rev-author', 'rev-location', 'rev-service'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateLiveReviewPreview);
  });

  // Modal Open & Close Triggers
  const openModalHandler = () => {
    if (reviewModal) {
      reviewModal.classList.add('active');
      reviewModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden'; // Lock scroll
    }
  };

  const closeModalHandler = () => {
    if (reviewModal) {
      reviewModal.classList.remove('active');
      reviewModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  };

  if (btnOpenReviewModal) btnOpenReviewModal.addEventListener('click', openModalHandler);
  if (btnCloseReviewModal) btnCloseReviewModal.addEventListener('click', closeModalHandler);
  if (btnCancelReview) btnCancelReview.addEventListener('click', closeModalHandler);

  if (reviewModal) {
    reviewModal.addEventListener('click', (e) => {
      if (e.target === reviewModal) closeModalHandler();
    });
  }

  // 10.7 Review Form Submission
  if (reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const author = document.getElementById('rev-author').value.trim();
      const location = document.getElementById('rev-location') ? document.getElementById('rev-location').value.trim() : 'Nigeria';
      const service = document.getElementById('rev-service') ? document.getElementById('rev-service').value.trim() : (provider.trade || 'General Service');
      const comment = revCommentInput ? revCommentInput.value.trim() : '';
      const dateOption = document.getElementById('rev-date') ? document.getElementById('rev-date').value : 'This Week';
      const isVerifiedChecked = document.getElementById('rev-verified-check') ? document.getElementById('rev-verified-check').checked : true;

      if (selectedHiredStatus !== 'completed') {
        showProfileToast('Thank you for letting us know! Reviews can only be published for completed jobs to protect authentic marketplace trust.', 'info');
        closeModalHandler();
        return;
      }

      // Phase 010 Anti-Abuse: Prevent provider self-review
      const currentProvider = (typeof LokatorDB !== 'undefined' && LokatorDB.getCurrentProvider) ? LokatorDB.getCurrentProvider() : null;
      if (currentProvider && currentProvider.id === provider.id) {
        showProfileToast('Artisans are not permitted to review their own profile.', 'error');
        return;
      }

      if (!author || !comment) {
        showProfileToast('Please enter your name and review comments.', 'error');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-review-form');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Publishing Review...';
      }

      try {
        const reviewRecord = {
          provider_id: provider.id,
          customer_name: author,
          location: location,
          rating: selectedOverallRating,
          quality: selectedSubRatings.quality || 5,
          professionalism: selectedSubRatings.professionalism || 5,
          communication: selectedSubRatings.communication || 5,
          pricing: selectedSubRatings.pricing || 5,
          punctuality: selectedSubRatings.punctuality || 5,
          job_completed: true,
          hired_status: 'completed',
          praise_tags: Array.from(selectedPraiseTags),
          photos: [...attachedPhotos],
          comment: comment,
          job_type: service,
          date: dateOption,
          is_verified_client: isVerifiedChecked,
          isVerifiedCustomer: isVerifiedChecked,
          helpfulCount: 0,
          created_at: new Date().toISOString()
        };

        if (typeof LokatorDB !== 'undefined' && LokatorDB.reviews) {
          LokatorDB.reviews.addReview(reviewRecord);
        }

        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('provider_review_submitted', {
            rating: selectedOverallRating,
            quality: selectedSubRatings.quality,
            professionalism: selectedSubRatings.professionalism,
            communication: selectedSubRatings.communication,
            pricing: selectedSubRatings.pricing,
            punctuality: selectedSubRatings.punctuality,
            job_completed: true,
            has_photos: attachedPhotos.length > 0,
            praise_tags_count: selectedPraiseTags.size,
            provider_id: provider.id,
            page: 'profile'
          });
        }

        // Re-render UI
        renderReviews(currentReviewFilter);
        reviewForm.reset();
        selectedOverallRating = 5;
        selectedHiredStatus = 'completed';
        selectedSubRatings = { quality: 5, professionalism: 5, communication: 5, pricing: 5, punctuality: 5 };
        selectedPraiseTags.clear();
        attachedPhotos.length = 0;
        document.querySelectorAll('.praise-pill').forEach(p => p.classList.remove('active'));
        if (starPicker) {
          starPicker.querySelectorAll('.star-pick-btn').forEach(b => b.classList.add('active'));
        }
        document.querySelectorAll('.star-picker-sub').forEach(p => {
          p.querySelectorAll('.star-sub-btn').forEach(b => b.classList.add('active'));
        });
        if (ratingMoodBadge) {
          ratingMoodBadge.textContent = '🌟 Exceptional (5.0)';
          ratingMoodBadge.style.color = '#34D399';
          ratingMoodBadge.style.background = 'rgba(52, 211, 153, 0.15)';
        }
        renderPhotoPreviews();
        if (livePreviewWrap) livePreviewWrap.style.display = 'none';

        closeModalHandler();
        showProfileToast('🎉 Thank you! Your verified review has been published.');

        // Phase 014: Mark review completed in padifix_recent_contacts to prevent follow-up prompt
        try {
          const rawContacts = localStorage.getItem('padifix_recent_contacts');
          if (rawContacts) {
            let contactsList = JSON.parse(rawContacts);
            let updated = false;
            contactsList = contactsList.map(c => {
              if (String(c.provider_id) === String(provider.id)) {
                updated = true;
                return { ...c, review_completed: true, reviewed_at: Date.now() };
              }
              return c;
            });
            if (updated) {
              localStorage.setItem('padifix_recent_contacts', JSON.stringify(contactsList));
            }
          }
          const activeBanner = document.getElementById('review-followup-banner');
          if (activeBanner) activeBanner.remove();
        } catch (e) {}

      } catch (err) {
        showProfileToast('Could not submit review: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Publish Verified Review
          `;
        }
      }
    });
  }

  // 10.75 Phase 014: Lightweight 24-48h Review Follow-up Experience
  function checkReviewFollowup() {
    try {
      const raw = localStorage.getItem('padifix_recent_contacts');
      if (!raw) return;
      const contacts = JSON.parse(raw);
      if (!Array.isArray(contacts)) return;
      const entry = contacts.find(c => String(c.provider_id) === String(provider.id));
      if (!entry) return;

      // Anti-spam checks:
      if (entry.review_completed) return;
      if (entry.dismissed_at) return;
      if (entry.prompted_at) return;

      // Check 24-hour threshold (or ?test_followup=1 for test automation)
      const now = Date.now();
      const elapsed = now - (entry.contacted_at || 0);
      const isTest = params.get('test_followup') === '1';
      const hours24 = 24 * 60 * 60 * 1000;

      if (elapsed < hours24 && !isTest) return;

      // Render subtle non-intrusive follow-up prompt
      const banner = document.createElement('div');
      banner.id = 'review-followup-banner';
      banner.setAttribute('role', 'region');
      banner.setAttribute('aria-label', 'Review reminder');
      banner.style.cssText = 'margin: 16px 0 24px; padding: 14px 18px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 78, 59, 0.25)); border: 1px solid rgba(52, 211, 153, 0.35); border-radius: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
      
      banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; color: #F1F5F9; font-size: 0.95rem;">
          <span style="font-size: 1.3rem;">💬</span>
          <span>Did you connect with <strong>${escapeHtml(entry.provider_name || provider.name)}</strong>? Rate their service on PadiFix.</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button type="button" id="btn-followup-rate" class="btn btn-sm btn-gold" style="font-weight: 700; padding: 6px 14px; font-size: 0.85rem;">Rate Service</button>
          <button type="button" id="btn-followup-dismiss" class="btn btn-sm btn-outline" style="padding: 6px 10px; color: #94A3B8; border-color: rgba(255,255,255,0.15); font-size: 0.85rem;" aria-label="Dismiss">✕</button>
        </div>
      `;

      // Insert into hero or profile container
      const targetContainer = document.querySelector('.profile-hero-content') || document.querySelector('.profile-page-main .container') || document.body;
      targetContainer.insertBefore(banner, targetContainer.firstChild);

      const rateBtn = banner.querySelector('#btn-followup-rate');
      const dismissBtn = banner.querySelector('#btn-followup-dismiss');

      if (rateBtn) {
        rateBtn.addEventListener('click', () => {
          entry.prompted_at = Date.now();
          try {
            localStorage.setItem('padifix_recent_contacts', JSON.stringify(contacts));
          } catch (e) {}
          banner.remove();
          if (typeof openModalHandler === 'function') {
            openModalHandler();
          } else {
            const rModal = document.getElementById('review-modal');
            if (rModal) {
              rModal.classList.add('active');
              rModal.setAttribute('aria-hidden', 'false');
            }
          }
        });
      }

      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          entry.dismissed_at = Date.now();
          try {
            localStorage.setItem('padifix_recent_contacts', JSON.stringify(contacts));
          } catch (e) {}
          banner.remove();
        });
      }
    } catch (err) {
      console.warn('Review followup prompt error:', err);
    }
  }

  // Check for follow-up review opportunity on subsequent visits
  checkReviewFollowup();

  // 10.8 Report Provider Modal & Handling
  const reportModal = document.getElementById('report-modal');
  const btnOpenReportModal = document.getElementById('btn-open-report-modal');
  const btnCloseReportModal = document.getElementById('report-modal-close');
  const btnCancelReport = document.getElementById('btn-cancel-report');
  const reportForm = document.getElementById('report-provider-form');

  if (btnOpenReportModal && reportModal) {
    btnOpenReportModal.addEventListener('click', () => {
      reportModal.classList.add('active');
      reportModal.setAttribute('aria-hidden', 'false');
    });
  }

  if (btnCloseReportModal && reportModal) {
    btnCloseReportModal.addEventListener('click', () => {
      reportModal.classList.remove('active');
      reportModal.setAttribute('aria-hidden', 'true');
    });
  }

  if (btnCancelReport && reportModal) {
    btnCancelReport.addEventListener('click', () => {
      reportModal.classList.remove('active');
      reportModal.setAttribute('aria-hidden', 'true');
    });
  }

  if (reportModal) {
    reportModal.addEventListener('click', (e) => {
      if (e.target === reportModal) {
        reportModal.classList.remove('active');
        reportModal.setAttribute('aria-hidden', 'true');
      }
    });
  }

  if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = document.getElementById('report-reason').value;
      const details = document.getElementById('report-details').value.trim();
      const submitBtn = document.getElementById('btn-submit-report');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
      }
      try {
        const res = await LokatorDB.reportProvider(provider.id, { reason, details });
        alert(res.message || 'Thank you for your report. Our trust & moderation team will investigate promptly.');
        reportForm.reset();
        reportModal.classList.remove('active');
        reportModal.setAttribute('aria-hidden', 'true');
      } catch (err) {
        alert('Error submitting report: ' + (err.message || 'Please try again.'));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Report';
        }
      }
    });
  }

  // 10.2 Delegation for Report Review
  const reviewsContEl = document.getElementById('reviews-container');
  if (reviewsContEl) {
    reviewsContEl.addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-report-review')) {
        const revId = e.target.dataset.revId;
        if (confirm('Flag this review for moderation review (inappropriate, spam, or false)?')) {
          await LokatorDB.reportReview(revId, { providerId: provider.id, reason: 'spam_or_fake' });
          e.target.textContent = '✓ Reported';
          e.target.disabled = true;
        }
      }
    });
  }

  // Registration CTA listener
  const navRegister = document.getElementById('nav-register');
  if (navRegister) {
    navRegister.addEventListener('click', () => {
      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('registration_cta_clicked', { source: 'profile_navbar' });
      }
    });
  }

  // 11. Sidebar Actions & Structured WhatsApp Booking Generator
  const sidebarPhoneText = document.getElementById('sidebar-phone-text');
  if (sidebarPhoneText) {
    sidebarPhoneText.textContent = provider.phone ? (provider.phoneDisplay || provider.phone) : 'Artisan Directly';
  }

  const sidebarCallBtn = document.getElementById('sidebar-call-btn');
  if (sidebarCallBtn) {
    sidebarCallBtn.style.display = 'inline-flex';
    if (heroTelUrl) sidebarCallBtn.href = heroTelUrl;
    sidebarCallBtn.addEventListener('click', async (e) => {
      if (!provider.phone) {
        e.preventDefault();
        const origText = sidebarCallBtn.innerHTML;
        sidebarCallBtn.innerHTML = `Connecting...`;
        const res = await ensureContactUnlocked('call');
        sidebarCallBtn.innerHTML = origText;
        if (res && res.limitReached) {
          showContactLimitModal();
          return;
        }
        if (res && res.phone) {
          window.location.href = `tel:${res.phone}`;
        }
        return;
      }
      if (!checkOrMeterContact('call', e)) return;
    });
  }

  // 11. Phase 10.12D / Phase 10.20: Interactive Structured WhatsApp Job Brief & Quote Generator
  const waServiceSelect = document.getElementById('wa-service-type');
  const waUserLocation = document.getElementById('wa-user-location');
  const waUrgency = document.getElementById('wa-urgency');
  const waMaterialsSelect = document.getElementById('wa-materials-select');
  const waNote = document.getElementById('wa-note');
  const waPreviewText = document.getElementById('wa-preview-text');
  const waSendBtn = document.getElementById('wa-send-btn');
  const waCopyBriefBtn = document.getElementById('wa-copy-brief-btn');
  const waPriceRangeText = document.getElementById('wa-price-range-text');
  const waPriceSubtext = document.getElementById('wa-price-subtext');
  const waHintText = document.getElementById('wa-hint-text');
  const waScopeBtns = document.querySelectorAll('.wa-scope-btn');

  let selectedJobScope = 'Inspection & Diagnosis';

  // Toast Notification Helper
  function showProfileToast(message, duration = 3200) {
    const toast = document.getElementById('profile-toast');
    if (!toast) return;
    toast.innerHTML = `<span>✓</span> <span>${escapeHtml(message)}</span>`;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // Phase 10.21: Pre-populate location from Search Intent or session
  try {
    const savedLoc = sessionStorage.getItem('lokator_temp_location_name');
    if (locParam && waUserLocation) {
      waUserLocation.value = locParam;
    } else if (savedLoc && waUserLocation) {
      waUserLocation.value = savedLoc;
    } else if (stateParam && waUserLocation) {
      waUserLocation.value = lgaParam ? `${lgaParam}, ${stateParam}` : stateParam;
    }
  } catch (e) {}

  if (waServiceSelect && provider.skills) {
    waServiceSelect.innerHTML = provider.skills.map(s => `
      <option value="${escapeHtml(s)}">${escapeHtml(s)}</option>
    `).join('');

    // Pre-select service matching search intent
    if (skillParam || queryParam) {
      const targetTerm = (skillParam || queryParam).toLowerCase();
      for (let i = 0; i < waServiceSelect.options.length; i++) {
        const optVal = waServiceSelect.options[i].value.toLowerCase();
        if (optVal.includes(targetTerm) || targetTerm.includes(optVal)) {
          waServiceSelect.selectedIndex = i;
          break;
        }
      }
    }
  }

  // Pre-select action / job scope from search intent
  if (actionParam) {
    if (actionParam === 'repair') {
      selectedJobScope = 'Emergency Repair';
    } else if (actionParam === 'installation') {
      selectedJobScope = 'New Installation';
    } else if (actionParam === 'maintenance') {
      selectedJobScope = 'Routine Maintenance';
    } else if (actionParam === 'cleaning') {
      selectedJobScope = 'Inspection & Diagnosis';
    }
  }

  // Pre-select urgency timeline from search intent
  if (urgencyParam && waUrgency) {
    if (urgencyParam === 'immediate' || urgencyParam === 'today') {
      waUrgency.value = 'Urgent / Today';
    } else if (urgencyParam === 'tomorrow') {
      waUrgency.value = 'Tomorrow';
    } else if (urgencyParam === 'weekend') {
      waUrgency.value = 'This Weekend';
    }
  }

  // Pre-fill note if search query was provided
  if (queryParam && waNote && !waNote.value) {
    waNote.value = `I need help with: ${queryParam}`;
  }

  // Scope Pill Selection Handler via Event Delegation
  const waScopePillsContainer = document.getElementById('wa-scope-pills');
  if (waScopePillsContainer) {
    // Reflect pre-selected job scope in buttons
    waScopePillsContainer.querySelectorAll('.wa-scope-btn').forEach(b => {
      const scopeVal = b.getAttribute('data-scope');
      b.classList.toggle('active', scopeVal === selectedJobScope);
    });

    waScopePillsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.wa-scope-btn');
      if (btn) {
        waScopePillsContainer.querySelectorAll('.wa-scope-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedJobScope = btn.getAttribute('data-scope') || 'Inspection & Diagnosis';
        updateWhatsAppPreview();

        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('whatsapp_brief_customized', {
            providerId: provider.id,
            trade: provider.trade,
            scope: selectedJobScope
          });
        }
      }
    });
  }

  function updateWhatsAppPreview() {
    const serviceVal = waServiceSelect ? waServiceSelect.value : provider.trade;
    const locVal = waUserLocation && waUserLocation.value.trim() ? waUserLocation.value.trim() : providerLocation;
    const urgVal = waUrgency ? waUrgency.value : 'Urgent / Today';
    const matVal = waMaterialsSelect ? waMaterialsSelect.value : 'Labor Only (I will supply materials)';
    const noteVal = waNote && waNote.value.trim() ? waNote.value.trim() : '';

    let formattedMessage = '';
    const AIService = (typeof LokatorAIService !== 'undefined' ? LokatorAIService : null) ||
                      (typeof globalThis !== 'undefined' ? globalThis.LokatorAIService : null) ||
                      (typeof window !== 'undefined' ? window.LokatorAIService : null);

    if (AIService && typeof AIService.generateStructuredJobBrief === 'function') {
      try {
        const briefObj = AIService.generateStructuredJobBrief(provider, {
          serviceType: serviceVal,
          jobScope: selectedJobScope,
          clientLocation: locVal,
          urgency: urgVal,
          materialsOption: matVal,
          details: noteVal
        });

        formattedMessage = briefObj.plainText;

        // Update pricing guidance badge
        if (briefObj.pricingGuidance) {
          const pg = briefObj.pricingGuidance;
          if (waPriceRangeText && pg.suggested_range) {
            waPriceRangeText.textContent = `Benchmark: ${pg.suggested_range}`;
          }
          if (waPriceSubtext && pg.inspection_fee_range) {
            waPriceSubtext.textContent = `Inspection fee: ${pg.inspection_fee_range} • ${pg.pricing_factors[0] || 'Labor benchmark'}`;
          }
          if (waHintText) {
            if (pg.key_questions && pg.key_questions.length > 0) {
              waHintText.textContent = `Tip: ${pg.key_questions[0]}`;
            } else {
              waHintText.textContent = 'Tip: Mention if parts or materials are already on site.';
            }
          }
        }
      } catch (err) {
        console.warn('AI Job brief generation fallback:', err);
      }
    }

    // Fallback if AI Service is unavailable
    if (!formattedMessage) {
      const detailsLine = noteVal ? `\n📝 *Job Notes:* ${noteVal}` : '';
      formattedMessage = `🛠️ *JOB INQUIRY VIA PADIFIX*\n━━━━━━━━━━━━━━━━━━━━\n👋 *Hello ${provider.name}*,\nI found your verified profile on PadiFix.\n\n📋 *Service:* ${serviceVal}\n🎯 *Job Scope:* ${selectedJobScope}\n📍 *Location:* ${locVal}\n⏰ *Preferred Time:* ${urgVal}\n📦 *Materials:* ${matVal}${detailsLine}\n\n━━━━━━━━━━━━━━━━━━━━\nAre you available to take on this job? Please let me know your availability. Thank you!`;
    }

    if (waPreviewText) waPreviewText.textContent = formattedMessage;
    
    if (waSendBtn) {
      const waLink = getWaUrl(formattedMessage);
      if (waLink) {
        waSendBtn.href = waLink;
      }
    }
  }

  // Copy Job Brief Handler
  async function copyJobBriefHandler() {
    const briefText = waPreviewText ? waPreviewText.textContent : '';
    if (!briefText) return;

    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(briefText);
        copied = true;
      } catch (e) {
        console.warn('navigator.clipboard writeText failed, using fallback:', e);
      }
    }

    if (!copied) {
      try {
        const tempEl = document.createElement('textarea');
        tempEl.value = briefText;
        tempEl.style.position = 'fixed';
        tempEl.style.left = '-9999px';
        document.body.appendChild(tempEl);
        tempEl.focus();
        tempEl.select();
        copied = document.execCommand('copy');
        document.body.removeChild(tempEl);
      } catch (err) {
        console.error('Fallback execCommand copy failed:', err);
      }
    }

    if (copied) {
      showProfileToast('📋 Job brief copied! Ready to paste into WhatsApp.');
    } else {
      showProfileToast('⚠️ Unable to copy automatically. Please copy the text above.');
    }

    if (typeof LokatorTelemetry !== 'undefined') {
      LokatorTelemetry.trackEvent('whatsapp_job_brief_copied', {
        providerId: provider.id,
        trade: provider.trade,
        scope: selectedJobScope
      });
    }
  }

  if (waCopyBriefBtn) waCopyBriefBtn.addEventListener('click', copyJobBriefHandler);

  if (waSendBtn) {
    waSendBtn.addEventListener('click', async (e) => {
      if (!provider.phone && !provider.whatsapp_number) {
        e.preventDefault();
        const origText = waSendBtn.innerHTML;
        waSendBtn.innerHTML = `Generating WhatsApp Link...`;
        const res = await ensureContactUnlocked('whatsapp');
        waSendBtn.innerHTML = origText;
        if (res && res.limitReached) {
          showContactLimitModal();
          return;
        }
        const targetWa = (res && res.whatsapp) ? res.whatsapp : (res && res.phone ? res.phone : null);
        if (targetWa) {
          const num = targetWa.replace(/\D/g, '');
          const msg = waPreviewText ? waPreviewText.textContent : `Hello ${provider.name}, I found your verified profile on PadiFix.`;
          window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
        }
        return;
      }
      if (!checkOrMeterContact('whatsapp', e)) return;
      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('whatsapp_brief_submitted', {
          providerId: provider.id,
          trade: provider.trade,
          scope: selectedJobScope,
          urgency: waUrgency ? waUrgency.value : null,
          hasSearchIntent: Boolean(queryParam || skillParam)
        });
        LokatorTelemetry.trackEvent('whatsapp_clicked', {
          providerId: provider.id,
          trade: provider.trade,
          surface: 'profile_whatsapp_brief'
        });
      }
    });
  }

  // Phase 10.21: Mobile Sticky Bottom Action Bar
  const stickyCallBtn = document.getElementById('sticky-call-btn');
  const stickyWaBtn = document.getElementById('sticky-wa-btn');
  if (stickyCallBtn) {
    stickyCallBtn.style.display = 'inline-flex';
    if (heroTelUrl) stickyCallBtn.href = heroTelUrl;
    stickyCallBtn.addEventListener('click', async (e) => {
      if (!provider.phone) {
        e.preventDefault();
        const origText = stickyCallBtn.innerHTML;
        stickyCallBtn.innerHTML = `Connecting...`;
        const res = await ensureContactUnlocked('call');
        stickyCallBtn.innerHTML = origText;
        if (res && res.limitReached) {
          showContactLimitModal();
          return;
        }
        if (res && res.phone) {
          window.location.href = `tel:${res.phone}`;
        }
        return;
      }
      if (!checkOrMeterContact('call', e)) return;
      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('call_clicked', {
          providerId: provider.id,
          trade: provider.trade,
          surface: 'profile_mobile_sticky'
        });
      }
    });
  }

  if (stickyWaBtn) {
    stickyWaBtn.addEventListener('click', (e) => {
      const waBuilder = document.getElementById('whatsapp-builder');
      if (waBuilder) {
        waBuilder.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('whatsapp_clicked', {
          providerId: provider.id,
          trade: provider.trade,
          surface: 'profile_mobile_sticky'
        });
      }
    });
  }

  // Handle incoming search intent action: ?action=call
  if (actionParam === 'call') {
    setTimeout(() => {
      if (btnCallHero) btnCallHero.click();
    }, 450);
  }

  document.body.classList.add('has-sticky-bar');

  if (waServiceSelect) waServiceSelect.addEventListener('change', () => {
    updateWhatsAppPreview();
    if (typeof LokatorTelemetry !== 'undefined') {
      LokatorTelemetry.trackEvent('whatsapp_brief_customized', { providerId: provider.id, trade: provider.trade, field: 'service' });
    }
  });

  if (waUserLocation) waUserLocation.addEventListener('input', updateWhatsAppPreview);
  if (waUrgency) waUrgency.addEventListener('change', () => {
    updateWhatsAppPreview();
    if (typeof LokatorTelemetry !== 'undefined') {
      LokatorTelemetry.trackEvent('whatsapp_brief_customized', { providerId: provider.id, trade: provider.trade, field: 'urgency' });
    }
  });

  if (waMaterialsSelect) waMaterialsSelect.addEventListener('change', updateWhatsAppPreview);
  if (waNote) waNote.addEventListener('input', updateWhatsAppPreview);

  updateWhatsAppPreview();

  // 12. Working Hours
  const workingHoursList = document.getElementById('working-hours-list');
  if (workingHoursList && provider.workingHours) {
    workingHoursList.innerHTML = `
      <div class="wh-row">
        <strong>Monday – Friday:</strong>
        <span>${escapeHtml(provider.workingHours.weekday || '8:00 AM – 7:00 PM')}</span>
      </div>
      <div class="wh-row">
        <strong>Saturday:</strong>
        <span>${escapeHtml(provider.workingHours.saturday || '8:00 AM – 6:00 PM')}</span>
      </div>
      <div class="wh-row">
        <strong>Sunday:</strong>
        <span>${escapeHtml(provider.workingHours.sunday || 'Emergency Callouts (24/7)')}</span>
      </div>
    `;
  }

  // 13. Nearby Recommended Providers
  const nearbyContainer = document.getElementById('nearby-providers-container');
  if (nearbyContainer) {
    const res = await LokatorDB.getProviders({
      state: provider.state,
      pageSize: 4
    });
    const nearbyList = (res.data || []).filter(p => p.id !== provider.id).slice(0, 3);
    
    if (nearbyList.length > 0) {
      nearbyContainer.innerHTML = nearbyList.map(n => {
        const safeNId = parseInt(n.id, 10) || 0;
        const nInitials = (n.name || '').split(' ').map(part => part[0]).join('').substring(0, 2).toUpperCase();
        const safeRating = Number(n.rating || 5).toFixed(1);
        const safeReviews = parseInt(n.reviewsCount || 0, 10);
        const safeAvatarBg = (n.avatarBg && typeof n.avatarBg === 'string' && n.avatarBg.startsWith('linear-gradient')) ? n.avatarBg : 'var(--green)';

        return `
          <article class="tp-card" style="box-shadow: var(--shadow-sm); border: 1px solid var(--border);" id="nearby-${safeNId}">
            <div class="tp-top">
              <div class="tp-avatar" style="background: ${safeAvatarBg};">${escapeHtml(nInitials)}</div>
              <div class="tp-details">
                <strong>${escapeHtml(n.name)}</strong>
                <span class="verified-badge sm"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Verified</span>
              </div>
            </div>
            <span class="tp-trade">${escapeHtml(n.trade)}</span>
            <div class="tp-rating">★★★★★ <span>${safeRating} (${safeReviews})</span></div>
            <span class="tp-loc">📍 ${escapeHtml(n.area)}</span>
            <div class="tp-actions" style="margin-top: 12px;">
              <a href="profile.html?id=${safeNId}" class="btn btn-outline btn-sm btn-block">View Profile & Reviews →</a>
            </div>
          </article>
        `;
      }).join('');
    } else {
      nearbyContainer.innerHTML = `<p style="color: var(--fg-muted);">No other providers registered in this specific area yet.</p>`;
    }
  }

  // 14. Phase 10.19: Real Location Map & Precise GPS Service Engine
  function initProfileServiceMap(p) {
    const mapEl = document.getElementById('profile-service-map');
    if (!mapEl) return;

    let pLat = Number(p.lat != null ? p.lat : p.latitude);
    let pLng = Number(p.lng != null ? p.lng : p.longitude);

    if ((isNaN(pLat) || isNaN(pLng) || pLat === 0 || pLng === 0) && typeof NigeriaLocations !== 'undefined' && NigeriaLocations.resolveCoordinates) {
      const res = NigeriaLocations.resolveCoordinates(p);
      pLat = res.lat;
      pLng = res.lng;
    }
    pLat = pLat || 6.5244;
    pLng = pLng || 3.3792;

    const displayLoc = p.area || (p.lga && p.state ? `${p.lga}, ${p.state}` : p.city) || 'Service Area';
    const locBadge = document.getElementById('service-loc-locality-badge');
    if (locBadge) locBadge.textContent = displayLoc;

    const MapService = (typeof LokatorMapService !== 'undefined' ? LokatorMapService : null) || (typeof window !== 'undefined' ? window.LokatorMapService : null);
    let mapInstance = null;

    if (MapService) {
      mapInstance = MapService.initServiceMap(mapEl, {
        lat: pLat,
        lng: pLng,
        providerName: p.name,
        locality: displayLoc,
        zoom: 14
      });
    }

    const btnGps = document.getElementById('btn-profile-gps');
    const gpsMetaContainer = document.getElementById('gps-meta-container');
    const gpsAccuracyVal = document.getElementById('gps-accuracy-val');
    const gpsTimestampVal = document.getElementById('gps-timestamp-val');
    const gpsStatusInd = document.getElementById('gps-status-indicator');
    const gpsStatusText = document.getElementById('gps-status-text');
    const gpsDistanceText = document.getElementById('gps-distance-text');

    if (btnGps && MapService) {
      btnGps.addEventListener('click', async () => {
        const originalContent = btnGps.innerHTML;
        btnGps.disabled = true;
        btnGps.innerHTML = `
          <div class="gps-cta-content">
            <span class="gps-cta-icon">⏳</span>
            <div>
              <div style="font-size: 13.5px; font-weight: 700; color: #FFFFFF;">Detecting GPS Location...</div>
              <div style="font-size: 11.5px; color: #94A3B8;">Connecting with device sensors</div>
            </div>
          </div>
        `;

        try {
          const result = await MapService.requestUserGPS();

          if (gpsAccuracyVal) gpsAccuracyVal.textContent = result.accuracyFormatted;
          if (gpsTimestampVal) gpsTimestampVal.textContent = `● ${result.timestampFormatted}`;
          if (gpsMetaContainer) gpsMetaContainer.style.display = 'grid';
          if (gpsStatusInd) gpsStatusInd.style.display = 'flex';
          if (gpsStatusText) gpsStatusText.textContent = 'Current location detected';

          if (mapInstance && mapInstance.setUserLocation) {
            mapInstance.setUserLocation(result.lat, result.lng, result.accuracy);
          }

          const distKm = MapService.calculateDistanceKm(result.lat, result.lng, pLat, pLng);
          if (gpsDistanceText && distKm !== null) {
            gpsDistanceText.textContent = `📍 ${p.name} is ${MapService.formatDistance(distKm)} (approx)`;
            gpsDistanceText.style.display = 'block';
          }

          btnGps.innerHTML = `
            <div class="gps-cta-content">
              <span class="gps-cta-icon" style="color: #10B981;">✓</span>
              <div>
                <div style="font-size: 13.5px; font-weight: 700; color: #FFFFFF;">GPS Location Active</div>
                <div style="font-size: 11.5px; color: #34D399;">Tap to refresh current location</div>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          `;
        } catch (err) {
          console.warn('GPS detection error:', err);
          alert(`Location Notice: ${err.message}`);
          btnGps.innerHTML = originalContent;
        } finally {
          btnGps.disabled = false;
        }
      });
    }
  }

  // Initialize service location map
  initProfileServiceMap(provider);

  // 15. Phase 10.19: Mobile Navigation Drawer & Accessible Hamburger Control
  const hamburger = document.getElementById('hamburger');
  const mobileDrawer = document.getElementById('mobile-nav-drawer');
  const mobileBackdrop = document.getElementById('mobile-nav-backdrop');
  const drawerCloseBtn = document.getElementById('mobile-nav-close-btn');
  const navLinks = document.getElementById('nav-links');

  function openMobileDrawer() {
    if (mobileDrawer) {
      mobileDrawer.classList.add('open');
      mobileDrawer.setAttribute('aria-hidden', 'false');
    }
    if (mobileBackdrop) {
      mobileBackdrop.classList.add('open');
      mobileBackdrop.setAttribute('aria-hidden', 'false');
    }
    if (hamburger) {
      hamburger.setAttribute('aria-expanded', 'true');
    }
    if (navLinks) {
      navLinks.classList.add('open');
    }
    document.body.classList.add('mobile-nav-open');

    if (drawerCloseBtn) drawerCloseBtn.focus();
  }

  function closeMobileDrawer() {
    if (mobileDrawer) {
      mobileDrawer.classList.remove('open');
      mobileDrawer.setAttribute('aria-hidden', 'true');
    }
    if (mobileBackdrop) {
      mobileBackdrop.classList.remove('open');
      mobileBackdrop.setAttribute('aria-hidden', 'true');
    }
    if (hamburger) {
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.focus();
    }
    if (navLinks) {
      navLinks.classList.remove('open');
    }
    document.body.classList.remove('mobile-nav-open');
  }

  if (hamburger) {
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mobileDrawer ? mobileDrawer.classList.contains('open') : (navLinks && navLinks.classList.contains('open'));
      if (isOpen) {
        closeMobileDrawer();
      } else {
        openMobileDrawer();
      }
    });
  }

  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMobileDrawer();
    });
  }

  if (mobileBackdrop) {
    mobileBackdrop.addEventListener('click', closeMobileDrawer);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileDrawer && mobileDrawer.classList.contains('open')) {
      closeMobileDrawer();
    }
  });

  if (navLinks) {
    navLinks.querySelectorAll('a, button').forEach(item => {
      item.addEventListener('click', () => {
        closeMobileDrawer();
      });
    });
  }

  // Dynamic Auth State in Drawer
  if (typeof LokatorDB !== 'undefined' && LokatorDB.auth) {
    try {
      const user = LokatorDB.auth.getUser ? (await LokatorDB.auth.getUser()) : (LokatorDB.auth.getSession ? (await LokatorDB.auth.getSession())?.user : null);
      const drawerLogin = document.getElementById('drawer-link-login');
      const drawerLogout = document.getElementById('drawer-link-logout');
      const drawerDash = document.getElementById('drawer-link-dash');
      if (user) {
        if (drawerLogin) drawerLogin.style.display = 'none';
        if (drawerLogout) drawerLogout.style.display = 'flex';
        if (drawerDash) drawerDash.style.display = 'flex';
        if (drawerLogout) {
          drawerLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            await LokatorDB.auth.signOut();
            window.location.reload();
          });
        }
      }
    } catch (e) {}
  }
});

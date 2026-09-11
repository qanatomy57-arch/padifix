/**
 * ============================================================================
 * LOKATOR.NG — PWA EXPERIENCE & INSTALL MANAGER (pwa.js / pwa-manager.js)
 * Native mobile install prompt, iOS Add to Home Screen, and SW Update UX
 * ============================================================================
 */

(function (global) {
  'use strict';

  // Non-sensitive Storage Keys
  const STORAGE_KEYS = {
    PWA_DISMISSED: 'lokator_pwa_install_dismissed',
    IOS_DISMISSED: 'lokator_ios_install_dismissed',
    PROMPTED: 'lokator_pwa_install_prompted',
    COMPLETED: 'lokator_pwa_install_completed'
  };

  const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days expiration

  let deferredPrompt = null;
  let swRegistration = null;
  let hasInteracted = false;
  let isMutationInProgress = false;

  const LokatorPWA = {
    STORAGE_KEYS,

    /**
     * Detect if running as an installed standalone PWA
     * Supports Android standalone, iOS Safari navigator.standalone, fullscreen, minimal-ui
     */
    isInstalled() {
      if (typeof window === 'undefined') return false;
      
      const isStandaloneMedia = window.matchMedia && (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches
      );
      
      const isStandaloneNav = window.navigator && Boolean(window.navigator.standalone);
      const isStoredInstalled = this._getStorage(STORAGE_KEYS.COMPLETED) === 'true';

      return Boolean(isStandaloneMedia || isStandaloneNav || isStoredInstalled);
    },

    /**
     * Backward-compatible alias
     */
    isStandaloneMode() {
      return this.isInstalled();
    },

    /**
     * Detect iOS device (iPhone / iPad / iPod) in browser mode
     */
    isIOS() {
      if (typeof navigator === 'undefined') return false;
      const ua = navigator.userAgent || '';
      return /iPhone|iPad|iPod/i.test(ua) && !this.isInstalled();
    },

    /**
     * Check if Android/PWA prompt is in dismissal cooldown
     */
    isDismissed() {
      const until = this._getStorage(STORAGE_KEYS.PWA_DISMISSED);
      if (!until) return false;
      return Date.now() < parseInt(until, 10);
    },

    /**
     * Check if iOS guide is in dismissal cooldown
     */
    isIOSDismissed() {
      const until = this._getStorage(STORAGE_KEYS.IOS_DISMISSED);
      if (!until) return false;
      return Date.now() < parseInt(until, 10);
    },

    /**
     * Dismiss prompt for cooldown period (default 7 days)
     */
    dismissPrompt(days = 7) {
      const until = Date.now() + (days * 24 * 60 * 60 * 1000);
      this._setStorage(STORAGE_KEYS.PWA_DISMISSED, String(until));
      
      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('pwa_install_dismissed', { days });
      }
    },

    /**
     * Dismiss iOS guidance drawer
     */
    dismissIOSGuidance(days = 7) {
      const until = Date.now() + (days * 24 * 60 * 60 * 1000);
      this._setStorage(STORAGE_KEYS.IOS_DISMISSED, String(until));

      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('ios_install_guide_dismissed', { days });
      }
    },

    /**
     * Mark an active mutation (e.g. form submission, portfolio upload) to prevent SW refresh interruption
     */
    setMutationInProgress(inProgress) {
      isMutationInProgress = Boolean(inProgress);
    },

    /**
     * Safe localStorage wrapper
     */
    _getStorage(key) {
      if (typeof localStorage === 'undefined') return null;
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },

    _setStorage(key, value) {
      if (typeof localStorage === 'undefined') return;
      try { localStorage.setItem(key, String(value)); } catch (e) {}
    },

    /**
     * Smoothly dismiss and remove the startup splash screen
     */
    dismissSplash() {
      if (typeof document === 'undefined') return;
      const splash = document.getElementById('pwa-app-splash');
      if (splash && !splash.classList.contains('splash-fade-out')) {
        splash.classList.add('splash-fade-out');
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
          const splashTime = Math.round(performance.now());
          if (typeof LokatorTelemetry !== 'undefined' && typeof LokatorTelemetry.setPWASplashTiming === 'function') {
            LokatorTelemetry.setPWASplashTiming(splashTime);
          }
        }
        setTimeout(() => {
          if (splash && splash.parentNode) {
            splash.parentNode.removeChild(splash);
          }
        }, 450);
      }
    },

    _dismissSplash() {
      this.dismissSplash();
    },

    /**
     * Initialize PWA lifecycle
     */
    init() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;

      // Ensure splash is dismissed smoothly
      setTimeout(() => this.dismissSplash(), 150);

      if (this.isInstalled()) {
        document.body.classList.add('pwa-mode');
        this._setStorage(STORAGE_KEYS.COMPLETED, 'true');
        this._listenForServiceWorkerUpdates();
        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('pwa_installed', { mode: 'standalone' });
        }
        return;
      }

      this._injectUI();
      this._bindEvents();
      this._listenForServiceWorkerUpdates();
      this._setupSmartTiming();
    },

    /**
     * Inject DOM elements for install banner, sheets, and SW update toast
     */
    _injectUI() {
      if (document.getElementById('pwa-install-container')) return;

      const container = document.createElement('div');
      container.id = 'pwa-install-container';
      container.innerHTML = `
        <!-- Backdrop -->
        <div id="pwa-sheet-backdrop" class="pwa-sheet-backdrop" aria-hidden="true"></div>

        <!-- Android & Desktop Custom Install Bottom Sheet -->
        <div id="pwa-install-sheet" class="pwa-install-sheet" role="dialog" aria-modal="true" aria-labelledby="pwa-sheet-title" aria-describedby="pwa-sheet-desc" aria-hidden="true">
          <div class="pwa-sheet-drag-handle"></div>
          <div class="pwa-sheet-header">
            <div class="pwa-sheet-icon">
              <img src="icons/icon-192.png" alt="PadiFix Icon" width="56" height="56">
            </div>
            <div class="pwa-sheet-title-group">
              <h3 id="pwa-sheet-title">Install PadiFix</h3>
              <p id="pwa-sheet-desc">Install PadiFix on your phone for faster access and an app-like experience.</p>
            </div>
          </div>
          <div class="pwa-sheet-perks">
            <div class="pwa-perk-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Instant home screen launch & clean full-screen view</span>
            </div>
            <div class="pwa-perk-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Works offline & saves 90% mobile data</span>
            </div>
            <div class="pwa-perk-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Direct WhatsApp & phone callout connectivity</span>
            </div>
          </div>
          <div class="pwa-sheet-actions">
            <button id="pwa-btn-dismiss" class="pwa-btn-dismiss" type="button">Not now</button>
            <button id="pwa-btn-install" class="pwa-btn-install" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Install App</span>
            </button>
          </div>
        </div>

        <!-- iOS Safari Add to Home Screen Guided Drawer -->
        <div id="pwa-ios-sheet" class="pwa-ios-sheet" role="dialog" aria-modal="true" aria-labelledby="pwa-ios-title" aria-hidden="true">
          <div class="pwa-sheet-drag-handle"></div>
          <div class="pwa-sheet-header">
            <div class="pwa-sheet-icon">
              <img src="icons/icon-192.png" alt="PadiFix Icon" width="56" height="56">
            </div>
            <div class="pwa-sheet-title-group">
              <h3 id="pwa-ios-title">Install PadiFix</h3>
              <p>Add to your iPhone Home Screen for instant access</p>
            </div>
          </div>
          <div class="pwa-ios-steps">
            <div class="pwa-ios-step-row">
              <div class="pwa-step-num">1</div>
              <div class="pwa-step-text">Tap the <strong>Share</strong> button <span class="pwa-ios-icon-badge">⎋</span> in Safari's bottom toolbar</div>
            </div>
            <div class="pwa-ios-step-row">
              <div class="pwa-step-num">2</div>
              <div class="pwa-step-text">Scroll down and tap <strong>"Add to Home Screen"</strong> <span class="pwa-ios-icon-badge">⊞</span></div>
            </div>
            <div class="pwa-ios-step-row">
              <div class="pwa-step-num">3</div>
              <div class="pwa-step-text">Tap <strong>Add</strong> in the top-right corner</div>
            </div>
          </div>
          <button id="pwa-ios-done-btn" class="pwa-ios-done-btn" type="button">Got It</button>
        </div>

        <!-- Offline Status Banner -->
        <div id="offline-status-banner">⚠️ You are currently offline. Displaying cached directory data with direct phone calling enabled.</div>

        <!-- Saved Artisans Offline Modal -->
        <div id="saved-artisans-modal" class="modal-overlay" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 999999; align-items: center; justify-content: center; padding: 16px;">
          <div style="background: #0F172A; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; width: 100%; max-width: 480px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1);">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.3rem;">❤️</span>
                <h3 style="margin: 0; font-size: 1.1rem; color: #F1F5F9;">My Saved Artisans (Offline Ready)</h3>
              </div>
              <button type="button" id="btn-close-saved-modal" style="background: none; border: none; color: #94A3B8; font-size: 1.2rem; cursor: pointer;">✕</button>
            </div>
            <div id="saved-artisans-list" style="padding: 16px 20px; overflow-y: auto; flex: 1;">
              <!-- Hydrated dynamically -->
            </div>
          </div>
        </div>

        <!-- Service Worker Floating Update Toast -->
        <div id="sw-update-toast" class="sw-update-toast" role="alert" aria-live="assertive" aria-hidden="true">
          <div class="sw-update-icon">⚡</div>
          <div class="sw-update-text">New version available</div>
          <button id="sw-update-btn" class="sw-update-btn" type="button">Update</button>
        </div>
      `;
      document.body.appendChild(container);
    },

    /**
     * Smart timing: trigger after meaningful interaction or delay
     */
    _setupSmartTiming() {
      const onFirstInteraction = () => {
        if (hasInteracted) return;
        hasInteracted = true;

        window.removeEventListener('scroll', onFirstInteraction);
        window.removeEventListener('click', onFirstInteraction);
        window.removeEventListener('keydown', onFirstInteraction);

        // If iOS and not dismissed, show gentle guidance after user has explored the app
        if (this.isIOS() && !this.isIOSDismissed()) {
          setTimeout(() => {
            this.showIOSGuidance();
          }, 60000);
        }
      };

      window.addEventListener('scroll', onFirstInteraction, { passive: true });
      window.addEventListener('click', onFirstInteraction, { passive: true });
      window.addEventListener('keydown', onFirstInteraction, { passive: true });
    },

    /**
     * Bind listeners
     */
    _bindEvents() {
      // 1. Intercept beforeinstallprompt
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        // Show header install button if exists
        const navBtn = document.getElementById('nav-pwa-install-btn');
        if (navBtn) navBtn.style.display = 'inline-flex';

        if (!this.isDismissed()) {
          setTimeout(() => {
            this.showInstallPrompt();
          }, 3500);
        }
      });

      // 2. Window installed listener
      window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        this.hideSheets();
        this._setStorage(STORAGE_KEYS.COMPLETED, 'true');
        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('pwa_install_accepted', { platform: 'native_prompt' });
          LokatorTelemetry.trackEvent('pwa_installed', { platform: 'native_prompt' });
        }
      });

      // 3. UI Buttons
      document.addEventListener('click', (e) => {
        if (e.target.closest('#pwa-btn-dismiss') || e.target.closest('#pwa-sheet-backdrop')) {
          this.dismissPrompt();
          this.hideSheets();
        }

        if (e.target.closest('#pwa-btn-install')) {
          this.triggerInstall();
        }

        if (e.target.closest('#pwa-ios-done-btn')) {
          this.dismissIOSGuidance();
          this.hideSheets();
        }

        if (e.target.closest('#nav-pwa-install-btn')) {
          if (this.isIOS()) {
            this.showIOSGuidance();
          } else {
            this.showInstallPrompt();
          }
        }
      });

      // 4. Offline / Online network event listeners (Phase 10.15)
      const updateOnlineStatus = () => {
        if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
          if (navigator.onLine) {
            document.body.classList.remove('is-offline');
            this.replayOfflineLeads();
          } else {
            document.body.classList.add('is-offline');
          }
        }
      };
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);
      updateOnlineStatus();

      // Data Saver sync
      if (typeof LokatorDB !== 'undefined' && LokatorDB.offline && LokatorDB.offline.isDataSaverActive()) {
        document.body.classList.add('data-saver-mode');
      }

      // 5. Saved Artisans Modal buttons
      document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-close-saved-modal') || e.target.closest('#btn-dismiss-saved-modal')) {
          this.closeSavedArtisansModal();
        }
        if (e.target.closest('.btn-open-saved-artisans') || e.target.closest('#nav-saved-artisans-btn')) {
          this.openSavedArtisansModal();
        }
      });

      // 6. Escape Key accessibility
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.hideSheets();
          this.closeSavedArtisansModal();
        }
      });
    },

    /**
     * Open and hydrate Saved Artisans Offline Modal (Phase 10.15)
     */
    openSavedArtisansModal() {
      const modal = document.getElementById('saved-artisans-modal');
      const listContainer = document.getElementById('saved-artisans-list');
      if (!modal || !listContainer) return;

      modal.style.display = 'flex';
      this.renderSavedArtisansList();

      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('saved_artisans_modal_opened', {});
      }
    },

    closeSavedArtisansModal() {
      const modal = document.getElementById('saved-artisans-modal');
      if (modal) modal.style.display = 'none';
    },

    renderSavedArtisansList() {
      const listContainer = document.getElementById('saved-artisans-list');
      if (!listContainer) return;

      const saved = (typeof LokatorDB !== 'undefined' && LokatorDB.offline) ? LokatorDB.offline.getSavedProviders() : [];
      if (saved.length === 0) {
        listContainer.innerHTML = `
          <div style="text-align: center; padding: 32px 16px; color: #94A3B8;">
            <div style="font-size: 2rem; margin-bottom: 8px;">📑</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #F1F5F9; margin-bottom: 4px;">No saved artisans yet</div>
            <p style="font-size: 0.8rem; margin: 0;">Tap the ❤️ icon on any artisan profile or search result to save their direct contact for offline access.</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = saved.map(p => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; font-size: 0.95rem; color: #F1F5F9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${p.name}
            </div>
            <div style="font-size: 0.78rem; color: #38BDF8; margin-bottom: 2px;">${p.trade_title || p.category}</div>
            <div style="font-size: 0.75rem; color: #94A3B8;">📍 ${p.lga ? p.lga + ', ' : ''}${p.state}</div>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <a href="tel:${p.phone}" class="btn btn-primary" style="padding: 6px 12px; font-size: 0.8rem; text-decoration: none; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
              📞 Call
            </a>
            <button type="button" class="btn btn-outline" onclick="LokatorDB.offline.removeProviderBookmark('${p.id}'); LokatorPWA.renderSavedArtisansList();" style="padding: 6px 8px; font-size: 0.8rem; border-color: rgba(255,255,255,0.2); color: #EF4444;" title="Remove bookmark">
              🗑️
            </button>
          </div>
        </div>
      `).join('');
    },

    /**
     * Show Android / Chromium Install Bottom Sheet
     */
    showInstallPrompt() {
      if (this.isInstalled()) return;
      const backdrop = document.getElementById('pwa-sheet-backdrop');
      const sheet = document.getElementById('pwa-install-sheet');
      if (backdrop) backdrop.classList.add('active');
      if (sheet) {
        sheet.classList.add('active');
        sheet.setAttribute('aria-hidden', 'false');
      }

      this._setStorage(STORAGE_KEYS.PROMPTED, 'true');

      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('pwa_install_prompt_shown', { type: 'android_bottom_sheet' });
      }
    },

    /**
     * Show iOS Safari guidance drawer
     */
    showIOSGuidance() {
      if (this.isInstalled()) return;
      const backdrop = document.getElementById('pwa-sheet-backdrop');
      const sheet = document.getElementById('pwa-ios-sheet');
      if (backdrop) backdrop.classList.add('active');
      if (sheet) {
        sheet.classList.add('active');
        sheet.setAttribute('aria-hidden', 'false');
      }

      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('ios_install_guide_shown', { type: 'safari_guide' });
      }
    },

    /**
     * Hide all active bottom sheets
     */
    hideSheets() {
      const backdrop = document.getElementById('pwa-sheet-backdrop');
      const sheet = document.getElementById('pwa-install-sheet');
      const iosSheet = document.getElementById('pwa-ios-sheet');
      if (backdrop) backdrop.classList.remove('active');
      if (sheet) {
        sheet.classList.remove('active');
        sheet.setAttribute('aria-hidden', 'true');
      }
      if (iosSheet) {
        iosSheet.classList.remove('active');
        iosSheet.setAttribute('aria-hidden', 'true');
      }
    },

    /**
     * Trigger native prompt from deferred beforeinstallprompt event
     */
    async triggerInstall() {
      if (!deferredPrompt) {
        this.hideSheets();
        return;
      }

      this.hideSheets();
      deferredPrompt.prompt();

      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        this._setStorage(STORAGE_KEYS.COMPLETED, 'true');
        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('pwa_install_accepted', { outcome: 'accepted' });
        }
      } else {
        this.dismissPrompt();
        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('pwa_install_dismissed', { outcome: 'dismissed' });
        }
      }
      deferredPrompt = null;
    },

    /**
     * Listen for Service Worker updatefound & waiting state
     */
    _listenForServiceWorkerUpdates() {
      if (!('serviceWorker' in navigator)) return;

      navigator.serviceWorker.ready.then((reg) => {
        swRegistration = reg;

        if (reg.waiting) {
          this._showUpdateToast(reg.waiting);
          return;
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this._showUpdateToast(newWorker);
            }
          });
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing && !isMutationInProgress) {
          refreshing = true;
          window.location.reload();
        }
      });
    },

    /**
     * Show floating update notification pill
     */
    _showUpdateToast(worker) {
      const toast = document.getElementById('sw-update-toast');
      const btn = document.getElementById('sw-update-btn');
      if (!toast) return;

      toast.classList.add('active');
      toast.setAttribute('aria-hidden', 'false');

      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('pwa_update_available', { version: 'latest' });
      }

      if (btn) {
        btn.onclick = () => {
          if (isMutationInProgress) {
            alert('A change or upload is currently in progress. Please wait for completion before updating.');
            return;
          }
          if (typeof LokatorTelemetry !== 'undefined') {
            LokatorTelemetry.trackEvent('pwa_update_accepted', {});
          }
          if (worker) {
            worker.postMessage({ action: 'skipWaiting' });
          }
        };
      }
    },

    /**
     * Open or initialize the IndexedDB Outbox database for offline contact leads
     * Database: padifix_offline_leads
     * Object Store: leads
     */
    _getOutboxDB() {
      return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') {
          return resolve(null);
        }
        try {
          const req = indexedDB.open('padifix_offline_leads', 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('leads')) {
              db.createObjectStore('leads', { keyPath: 'id', autoIncrement: true });
            }
          };
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = () => resolve(null);
        } catch (err) {
          resolve(null);
        }
      });
    },

    /**
     * Queue a contact lead in the offline outbox
     * Stores minimal immutable payload: { provider_id, channel, timestamp, idempotency_key }
     */
    async queueOfflineLead(leadData) {
      try {
        const eventId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9));
        const cleanPayload = {
          provider_id: Number(leadData.provider_id),
          channel: leadData.channel || 'whatsapp',
          timestamp: leadData.timestamp || Date.now(),
          idempotency_key: leadData.idempotency_key || `idem_${leadData.provider_id}_${leadData.channel || 'whatsapp'}_${eventId}`
        };

        const db = await this._getOutboxDB();
        if (!db) {
          const raw = this._getStorage('padifix_offline_leads_fallback') || '[]';
          let list = [];
          try { list = JSON.parse(raw); } catch (e) { list = []; }
          list.push(cleanPayload);
          this._setStorage('padifix_offline_leads_fallback', JSON.stringify(list));
          return true;
        }
        return new Promise((resolve) => {
          const tx = db.transaction('leads', 'readwrite');
          const store = tx.objectStore('leads');
          store.add(cleanPayload);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        });
      } catch (err) {
        return false;
      }
    },

    /**
     * Replay queued leads to /api/contact-meter once online
     * Uses mutex to prevent race conditions during concurrent online events
     */
    async replayOfflineLeads() {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { replayed: 0, pending: 0 };
      }
      if (this._isReplaying) {
        return { replayed: 0, status: 'locked' };
      }
      this._isReplaying = true;

      let replayedCount = 0;
      try {
        const db = await this._getOutboxDB();
        if (db) {
          const items = await new Promise((resolve) => {
            const tx = db.transaction('leads', 'readonly');
            const store = tx.objectStore('leads');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          });

          for (const item of items) {
            let shouldDelete = false;
            try {
              const res = await fetch('/api/contact-meter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  provider_id: item.provider_id,
                  channel: item.channel || 'whatsapp',
                  mode: 'soft_cap',
                  idempotency_key: item.idempotency_key
                })
              });
              if (res.ok) {
                shouldDelete = true;
                replayedCount++;
              } else if (res.status >= 400 && res.status < 500) {
                // Non-retryable client error (e.g. invalid payload) — delete to prevent poison pill loop
                shouldDelete = true;
              } else {
                // 5xx Server temporary error — retain item and abort batch
                break;
              }
            } catch (networkErr) {
              // Network failed again — retain and break
              break;
            }

            if (shouldDelete) {
              await new Promise((resDel) => {
                const delTx = db.transaction('leads', 'readwrite');
                delTx.objectStore('leads').delete(item.id);
                delTx.oncomplete = resDel;
                delTx.onerror = resDel;
              });
            }
          }
        }

        const rawFallback = this._getStorage('padifix_offline_leads_fallback');
        if (rawFallback) {
          let list = [];
          try { list = JSON.parse(rawFallback); } catch (e) { list = []; }
          const remaining = [];
          for (const item of list) {
            try {
              const res = await fetch('/api/contact-meter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  provider_id: item.provider_id,
                  channel: item.channel || 'whatsapp',
                  mode: 'soft_cap',
                  idempotency_key: item.idempotency_key
                })
              });
              if (res.ok) {
                replayedCount++;
              } else if (res.status >= 400 && res.status < 500) {
                // Drop non-retryable 4xx
              } else {
                remaining.push(item);
                break;
              }
            } catch (e) {
              remaining.push(item);
              break;
            }
          }
          if (remaining.length === 0) {
            this._removeStorage('padifix_offline_leads_fallback');
          } else {
            this._setStorage('padifix_offline_leads_fallback', JSON.stringify(remaining));
          }
        }
      } catch (err) {
      } finally {
        this._isReplaying = false;
      }
      return { replayed: replayedCount };
    },

    /**
     * Unified contact dispatcher: sends to /api/contact-meter, queues in outbox if offline or network error
     */
    async dispatchContactLead(leadData) {
      const eventId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9));
      const cleanData = {
        provider_id: Number(leadData.provider_id),
        channel: leadData.channel || 'whatsapp',
        timestamp: leadData.timestamp || Date.now(),
        idempotency_key: leadData.idempotency_key || `idem_${leadData.provider_id}_${leadData.channel || 'whatsapp'}_${eventId}`,
        locality: leadData.locality ? String(leadData.locality).trim() : undefined,
        intent_tag: leadData.intent_tag ? String(leadData.intent_tag).trim() : (leadData.trade ? String(leadData.trade).trim() : undefined)
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await this.queueOfflineLead(cleanData);
        return { queued: true, offline: true };
      }
      try {
        const res = await fetch('/api/contact-meter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...cleanData,
            mode: 'soft_cap'
          })
        });
        if (!res.ok) {
          // If client error 4xx, do not treat as offline
          if (res.status >= 400 && res.status < 500) {
            return { queued: false, error: `Client error: ${res.status}` };
          }
          // Server 5xx error: queue for retry
          await this.queueOfflineLead(cleanData);
          return { queued: true, error: `Server error: ${res.status}` };
        }
        return await res.json();
      } catch (networkErr) {
        // Genuine network exception (TypeError, connection refused, offline)
        await this.queueOfflineLead(cleanData);
        return { queued: true, offline: true };
      }
    }
  };

  // Expose globally under all compatible names & auto-init on DOMContentLoaded
  global.PadiFixPWA = LokatorPWA;
  global.LokatorPWA = LokatorPWA;
  global.PWAManager = LokatorPWA;

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => LokatorPWA.init());
    } else {
      LokatorPWA.init();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LokatorPWA;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

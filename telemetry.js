// ============================================================================
// LOKATOR.NG — OBSERVABILITY & PRIVACY-CONSCIOUS TELEMETRY (telemetry.js)
// Lightweight, non-blocking telemetry, Core Web Vitals & client error tracking
// ============================================================================

(function (global) {
  'use strict';

  const TELEMETRY_STORAGE_KEY = 'lokator_telemetry_events';
  const TELEMETRY_SESSION_KEY = 'lokator_telemetry_session_id';
  const MAX_STORED_EVENTS = 50;
  const MAX_BATCH_SIZE = 10;
  const FLUSH_INTERVAL_MS = 10000;
  const MAX_SESSION_EVENTS = 200; // Flood protection: max remote events per session

  // Sensitive property blocklist (Strict Privacy, SAIF & Nigerian NDPR compliance)
  const FORBIDDEN_KEYS = new Set([
    'password', 'pwd', 'token', 'access_token', 'refresh_token', 'jwt',
    'auth', 'secret', 'service_role', 'api_key', 'apikey', 'key',
    'nin', 'bvn', 'account_number', 'credit_card', 'phone', 'email',
    'whatsapp_message', 'message', 'private_message'
  ]);

  let remoteSyncEnabled = true;
  let sessionEventsCount = 0;
  let inMemoryBatch = [];
  let flushTimer = null;
  let lastEventSignature = '';
  let lastEventTime = 0;
  const DEDUPLICATION_WINDOW_MS = 350;

  // Performance & Core Web Vitals Tracking State
  let lcpValue = null;
  let inpValue = null;
  let clsValue = 0;
  let hasClsEntries = false;
  let pwaSplashValue = null;
  let vitalsSummaryEmitted = false;
  let observersInitialized = false;

  /**
   * Generates or retrieves an ephemeral, anonymous session UUID
   */
  function getSessionId() {
    if (typeof sessionStorage === 'undefined') {
      return '00000000-0000-4000-8000-000000000000';
    }
    try {
      let sId = sessionStorage.getItem(TELEMETRY_SESSION_KEY);
      if (!sId) {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          sId = crypto.randomUUID();
        } else {
          sId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        }
        sessionStorage.setItem(TELEMETRY_SESSION_KEY, sId);
      }
      return sId;
    } catch (e) {
      return '00000000-0000-4000-8000-000000000000';
    }
  }

  /**
   * Sanitizes event properties to eliminate all PII and sensitive credentials (recursively)
   */
  function sanitizeProperties(props) {
    if (!props || typeof props !== 'object') return {};
    const clean = {};
    for (const [k, v] of Object.entries(props)) {
      const lowerKey = k.toLowerCase();
      if (FORBIDDEN_KEYS.has(lowerKey)) {
        continue;
      }
      // Mask potential emails or long values
      if (typeof v === 'string') {
        if (v.includes('@') && v.includes('.')) {
          clean[k] = '[REDACTED_EMAIL]';
        } else if (v.length > 200) {
          clean[k] = v.substring(0, 200) + '...';
        } else {
          clean[k] = v;
        }
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        clean[k] = sanitizeProperties(v);
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        clean[k] = v;
      }
    }
    return clean;
  }

  /**
   * Validates event name against strict format: ^[a-z0-9_]{3,64}$
   */
  function isValidEventName(name) {
    if (!name || typeof name !== 'string') return false;
    return /^[a-z0-9_]{3,64}$/.test(name);
  }

  /**
   * Normalizes page identity and strips all query parameters, hashes, IDs, and search terms
   */
  function normalizePage(pathname) {
    if (!pathname || typeof pathname !== 'string') return 'home';
    const cleanPath = pathname.split('?')[0].split('#')[0].toLowerCase().trim();
    if (cleanPath === '' || cleanPath === '/' || cleanPath === '/index.html') return 'home';
    if (cleanPath.includes('search')) return 'search';
    if (cleanPath.includes('profile')) return 'profile';
    if (cleanPath.includes('register')) return 'register';
    if (cleanPath.includes('login')) return 'login';
    if (cleanPath.includes('dashboard')) return 'dashboard';
    if (cleanPath.includes('offline')) return 'offline';
    const base = cleanPath.replace(/^\/+/, '').replace(/\.html$/, '');
    return base ? base.substring(0, 32) : 'other';
  }

  /**
   * Coarse device classification without invasive fingerprinting
   */
  function getDeviceClass(width) {
    const w = typeof width === 'number' ? width : (typeof window !== 'undefined' ? window.innerWidth : 1024);
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  /**
   * Initialize native PerformanceObserver for Core Web Vitals (LCP, INP, CLS)
   */
  function initPerformanceObservers() {
    if (typeof window === 'undefined' || observersInitialized) return;
    observersInitialized = true;

    try {
      if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes) {
        return;
      }

      const supported = PerformanceObserver.supportedEntryTypes;

      // 1. Largest Contentful Paint (LCP)
      if (supported.includes('largest-contentful-paint')) {
        const lcpObserver = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          if (entries.length > 0) {
            const lastEntry = entries[entries.length - 1];
            if (typeof lastEntry.startTime === 'number') {
              lcpValue = Math.round(lastEntry.startTime);
            }
          }
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      }

      // 2. Interaction to Next Paint (INP)
      if (supported.includes('event')) {
        const inpObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (entry.interactionId && typeof entry.duration === 'number') {
              const dur = Math.round(entry.duration);
              if (inpValue === null || dur > inpValue) {
                inpValue = dur;
              }
            }
          }
        });
        inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });
      }

      // 3. Cumulative Layout Shift (CLS)
      if (supported.includes('layout-shift')) {
        const clsObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (!entry.hadRecentInput && typeof entry.value === 'number') {
              clsValue += entry.value;
              hasClsEntries = true;
            }
          }
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
      }
    } catch (e) {
      // PerformanceObserver initialization errors fail silently
    }
  }

  /**
   * Collect Navigation and Paint Timing supporting metrics (TTFB, FCP, DOM Ready)
   */
  function collectSupportingMetrics() {
    const metrics = {};
    try {
      if (typeof performance === 'undefined') return metrics;

      // Navigation Timing
      const navEntries = typeof performance.getEntriesByType === 'function' 
        ? performance.getEntriesByType('navigation') 
        : [];
      
      if (navEntries.length > 0) {
        const nav = navEntries[0];
        if (typeof nav.responseStart === 'number' && typeof nav.requestStart === 'number' && nav.responseStart >= nav.requestStart) {
          metrics.ttfb_ms = Math.round(nav.responseStart - nav.requestStart);
        }
        if (typeof nav.domContentLoadedEventEnd === 'number' && typeof nav.responseEnd === 'number' && nav.domContentLoadedEventEnd >= nav.responseEnd) {
          metrics.dom_ready_ms = Math.round(nav.domContentLoadedEventEnd - nav.responseEnd);
        }
      } else if (performance.timing) {
        const t = performance.timing;
        if (t.responseStart && t.requestStart && t.responseStart >= t.requestStart) {
          metrics.ttfb_ms = Math.round(t.responseStart - t.requestStart);
        }
        if (t.domContentLoadedEventEnd && t.responseEnd && t.domContentLoadedEventEnd >= t.responseEnd) {
          metrics.dom_ready_ms = Math.round(t.domContentLoadedEventEnd - t.responseEnd);
        }
      }

      // Paint Timing
      const paintEntries = typeof performance.getEntriesByType === 'function'
        ? performance.getEntriesByType('paint')
        : [];
      for (const p of paintEntries) {
        if (p.name === 'first-contentful-paint' && typeof p.startTime === 'number') {
          metrics.fcp_ms = Math.round(p.startTime);
          break;
        }
      }
    } catch (e) {}
    return metrics;
  }

  /**
   * Emit single consolidated web_vitals_summary event at page unload
   */
  function emitWebVitalsSummary() {
    if (vitalsSummaryEmitted) return;
    vitalsSummaryEmitted = true;

    try {
      const supporting = collectSupportingMetrics();
      const pathStr = (typeof window !== 'undefined' && window.location) ? window.location.pathname : '/';
      const pageId = normalizePage(pathStr);
      const devClass = getDeviceClass();

      const summary = {
        page: pageId,
        device_class: devClass
      };

      if (lcpValue !== null && lcpValue > 0) summary.lcp_ms = lcpValue;
      if (inpValue !== null && inpValue > 0) summary.inp_ms = inpValue;
      if (hasClsEntries) summary.cls = Number(clsValue.toFixed(4));
      if (supporting.ttfb_ms !== undefined && supporting.ttfb_ms >= 0) summary.ttfb_ms = supporting.ttfb_ms;
      if (supporting.fcp_ms !== undefined && supporting.fcp_ms >= 0) summary.fcp_ms = supporting.fcp_ms;
      if (supporting.dom_ready_ms !== undefined && supporting.dom_ready_ms >= 0) summary.dom_ready_ms = supporting.dom_ready_ms;
      if (pwaSplashValue !== null && pwaSplashValue > 0) summary.pwa_splash_ms = pwaSplashValue;

      LokatorTelemetry.trackEvent('web_vitals_summary', summary);
      LokatorTelemetry.flushBatch();
    } catch (e) {
      // Fail silently
    }
  }

  const LokatorTelemetry = {
    /**
     * Track a business or user interaction event
     */
    trackEvent(name, properties = {}) {
      try {
        const eventName = String(name).trim().toLowerCase();
        if (!isValidEventName(eventName)) {
          return;
        }

        const sanitizedProps = sanitizeProperties(properties);

        // Deduplicate rapid bursts (same event and properties within 350ms)
        const now = Date.now();
        const signature = `${eventName}:${JSON.stringify(sanitizedProps)}`;
        if (signature === lastEventSignature && (now - lastEventTime) < DEDUPLICATION_WINDOW_MS) {
          return; // Suppress duplicate burst
        }
        lastEventSignature = signature;
        lastEventTime = now;

        const pathStr = (typeof window !== 'undefined' && window.location) ? window.location.pathname.substring(0, 128) : '/';
        if (!sanitizedProps.device_class) {
          sanitizedProps.device_class = getDeviceClass();
        }

        const payload = {
          event: eventName,
          timestamp: new Date().toISOString(),
          path: pathStr,
          props: sanitizedProps
        };

        // 1. Emit custom browser event for local integrations
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
          const customEvent = new CustomEvent('lokator:telemetry', { detail: payload });
          window.dispatchEvent(customEvent);
        }

        // 2. Persist in local ephemeral sessionStorage buffer
        if (typeof sessionStorage !== 'undefined') {
          try {
            const raw = sessionStorage.getItem(TELEMETRY_STORAGE_KEY);
            const events = raw ? JSON.parse(raw) : [];
            events.push(payload);
            if (events.length > MAX_STORED_EVENTS) {
              events.shift();
            }
            sessionStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(events));
          } catch (e) {
            // Buffer write failed (quota); ignore silently
          }
        }

        // 3. Enqueue for remote ingestion if enabled & within session rate bounds
        if (remoteSyncEnabled && sessionEventsCount < MAX_SESSION_EVENTS) {
          sessionEventsCount++;
          const remoteRecord = {
            session_id: getSessionId(),
            event_name: eventName,
            page_path: pathStr,
            properties: sanitizedProps
          };
          inMemoryBatch.push(remoteRecord);

          if (inMemoryBatch.length >= MAX_BATCH_SIZE) {
            LokatorTelemetry.flushBatch();
          } else if (!flushTimer) {
            flushTimer = setTimeout(() => {
              flushTimer = null;
              LokatorTelemetry.flushBatch();
            }, FLUSH_INTERVAL_MS);
          }
        }
      } catch (err) {
        // Telemetry must fail silently without impacting user experience
      }
    },

    /**
     * Flushes queued telemetry batch to serverless /api/telemetry endpoint
     */
    flushBatch() {
      if (inMemoryBatch.length === 0) return Promise.resolve(null);
      const itemsToSend = inMemoryBatch.splice(0, MAX_BATCH_SIZE);

      try {
        let endpoint = '/api/telemetry';
        if (typeof window !== 'undefined' && window.APP_URL && !window.APP_URL.includes('localhost')) {
          endpoint = `${window.APP_URL.replace(/\/$/, '')}/api/telemetry`;
        } else if (typeof process !== 'undefined' && process.env && process.env.APP_URL) {
          endpoint = `${process.env.APP_URL.replace(/\/$/, '')}/api/telemetry`;
        }

        const bodyStr = JSON.stringify(itemsToSend);

        if (typeof fetch === 'function') {
          return fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: bodyStr,
            keepalive: true
          }).catch(() => {});
        } else if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const blob = new Blob([bodyStr], { type: 'application/json' });
          navigator.sendBeacon(endpoint, blob);
          return Promise.resolve(true);
        }
      } catch (e) {
        // Fail silently
      }
      return Promise.resolve(null);
    },

    /**
     * Centralized Error Logger with PadiFixSentry Bridge
     */
    reportError(error, context = {}) {
      try {
        const errMessage = error instanceof Error ? error.message : String(error);
        const payload = {
          type: 'ERROR',
          message: errMessage,
          context: sanitizeProperties(context),
          timestamp: new Date().toISOString(),
          path: (typeof window !== 'undefined' && window.location) ? window.location.pathname.substring(0, 128) : '/'
        };

        // 1. Log lightweight event in telemetry pipeline
        this.trackEvent('client_error', payload);

        // 2. Bridge to PadiFixSentry if available
        if (typeof window !== 'undefined' && window.PadiFixSentry && typeof window.PadiFixSentry.captureException === 'function') {
          try {
            window.PadiFixSentry.captureException(error instanceof Error ? error : new Error(errMessage), context);
          } catch (sentryErr) {}
        }

        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[Lokator Telemetry Notice]:', errMessage);
        }
      } catch (e) {}
    },

    /**
     * Retrieve recent session diagnostics
     */
    getRecentEvents() {
      if (typeof sessionStorage === 'undefined') return [];
      try {
        const raw = sessionStorage.getItem(TELEMETRY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    },

    /**
     * Disables remote telemetry synchronization (local-only mode)
     */
    disableRemoteSync() {
      remoteSyncEnabled = false;
      inMemoryBatch = [];
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    },

    /**
     * Enables remote telemetry synchronization
     */
    enableRemoteSync() {
      remoteSyncEnabled = true;
    },

    /**
     * Set recorded PWA splash dismissal duration
     */
    setPWASplashTiming(ms) {
      if (typeof ms === 'number' && ms > 0) {
        pwaSplashValue = Math.round(ms);
      }
    },

    /**
     * Public page normalization helper
     */
    normalizePage(path) {
      return normalizePage(path);
    },

    /**
     * Public device class helper
     */
    getDeviceClass(width) {
      return getDeviceClass(width);
    },

    /**
     * Initialize performance observers explicitly
     */
    initPerformanceObservers() {
      initPerformanceObservers();
    },

    /**
     * Emit Web Vitals summary event explicitly
     */
    emitWebVitalsSummary() {
      emitWebVitalsSummary();
    },

    /**
     * Retrieve collected performance metrics (testing & diagnostic helper)
     */
    getPerformanceMetrics() {
      const supporting = collectSupportingMetrics();
      return {
        lcp_ms: lcpValue,
        inp_ms: inpValue,
        cls: hasClsEntries ? Number(clsValue.toFixed(4)) : null,
        ttfb_ms: supporting.ttfb_ms || null,
        fcp_ms: supporting.fcp_ms || null,
        dom_ready_ms: supporting.dom_ready_ms || null,
        pwa_splash_ms: pwaSplashValue,
        page: (typeof window !== 'undefined' && window.location) ? normalizePage(window.location.pathname) : 'home',
        device_class: getDeviceClass()
      };
    },

    /**
     * Reset performance state (test harness helper)
     */
    _resetPerformanceState() {
      lcpValue = null;
      inpValue = null;
      clsValue = 0;
      hasClsEntries = false;
      pwaSplashValue = null;
      vitalsSummaryEmitted = false;
      observersInitialized = false;
    },

    /**
     * Testing hook to inspect current queue depth
     */
    _getQueueDepth() {
      return inMemoryBatch.length;
    }
  };

  // Automatic Page View, Lifecycle & Performance Tracking
  if (typeof window !== 'undefined') {
    // 1. Initialize Performance Observers as early as possible
    initPerformanceObservers();

    // 2. Track page_view event on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        LokatorTelemetry.trackEvent('page_view', {
          title: (document.title || '').substring(0, 100),
          normalized_page: normalizePage(window.location.pathname)
        });
      });
    } else {
      LokatorTelemetry.trackEvent('page_view', {
        title: (document.title || '').substring(0, 100),
        normalized_page: normalizePage(window.location.pathname)
      });
    }

    // 3. Emit web_vitals_summary and flush queue on page unload / hide
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('visibilitychange', () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          emitWebVitalsSummary();
          LokatorTelemetry.flushBatch();
        }
      });

      window.addEventListener('pagehide', () => {
        emitWebVitalsSummary();
        LokatorTelemetry.flushBatch();
      });

      window.addEventListener('beforeunload', () => {
        emitWebVitalsSummary();
      });
    }

    // 4. Global uncaught error listener
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('error', (event) => {
        LokatorTelemetry.reportError(event.error || event.message, { source: 'window.onerror' });
      });

      window.addEventListener('unhandledrejection', (event) => {
        LokatorTelemetry.reportError(event.reason || 'Unhandled Promise Rejection', { source: 'unhandledrejection' });
      });
    }
  }

  // Expose globally
  global.LokatorTelemetry = LokatorTelemetry;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LokatorTelemetry;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

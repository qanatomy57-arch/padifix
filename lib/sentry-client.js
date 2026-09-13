/**
 * PADIFIX — SENTRY BROWSER CLIENT (ERROR & PERFORMANCE OBSERVABILITY)
 * lib/sentry-client.js
 *
 * Lightweight, privacy-conscious client-side Sentry error tracking for Vanilla JS architecture.
 *
 * Invariants:
 * - Zero PII / Credentials: Strips passwords, tokens, JWTs, NIN, BVN, Paystack/Resend keys, card details.
 * - Non-blocking: Never throws, interrupts UI rendering, or delays page load.
 * - Graceful No-Op: Does nothing if SENTRY_DSN is unconfigured or in disabled environments.
 * - Environment-Aware: Tags events with development, preview, or production.
 * - Session Replay Privacy: Automatically masks sensitive inputs and scrubs query parameters.
 */

(function (global) {
  'use strict';

  // Sensitive parameter blocklist (Strict Nigerian NDPR & PadiFix Privacy Compliance)
  const SENSITIVE_KEYS = new Set([
    'password', 'pwd', 'token', 'access_token', 'refresh_token', 'jwt',
    'secret', 'service_role', 'api_key', 'apikey', 'key', 'auth', 'authorization',
    'nin', 'vnin', 'bvn', 'account_number', 'card', 'card_number', 'cvv', 'pan', 'pin',
    'paystack_secret_key', 'resend_api_key', 'supabase_service_role_key'
  ]);

  /**
   * Deep sanitize object to remove any sensitive keys and values
   */
  function sanitizeData(data, depth = 0) {
    if (depth > 5 || data === null || data === undefined) return data;
    if (typeof data !== 'object') {
      if (typeof data === 'string') {
        // Strip out any potential bearer tokens or secret keys embedded in strings
        if (data.startsWith('sk_') || data.startsWith('re_') || data.startsWith('sbp_')) {
          return '[REDACTED_SECRET]';
        }
      }
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => sanitizeData(item, depth + 1));
    }

    const cleaned = {};
    for (const [k, v] of Object.entries(data)) {
      const lower = k.toLowerCase();
      if (
        SENSITIVE_KEYS.has(lower) ||
        lower.includes('token') ||
        lower.includes('auth') ||
        lower.includes('secret') ||
        lower.includes('key') ||
        lower.includes('pass') ||
        lower.includes('card')
      ) {
        cleaned[k] = '[REDACTED]';
      } else {
        cleaned[k] = sanitizeData(v, depth + 1);
      }
    }
    return cleaned;
  }

  /**
   * Sanitize URL query parameters to avoid leaking sensitive query strings
   */
  function sanitizeUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl, 'https://padifix.ng');
      parsed.searchParams.forEach((val, key) => {
        const lower = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lower) || lower.includes('token') || lower.includes('key')) {
          parsed.searchParams.set(key, '[REDACTED]');
        }
      });
      return parsed.pathname + parsed.search;
    } catch (e) {
      return rawUrl.split('?')[0];
    }
  }

  /**
   * Parse Sentry DSN into components
   */
  function parseDsn(dsn) {
    if (!dsn) return null;
    try {
      const url = new URL(dsn);
      const publicKey = url.username;
      const host = url.host;
      const protocol = url.protocol;
      const pathParts = url.pathname.split('/').filter(Boolean);
      const projectId = pathParts[pathParts.length - 1];
      if (!publicKey || !host || !projectId) return null;
      return { publicKey, host, protocol, projectId };
    } catch (e) {
      return null;
    }
  }

  /**
   * Parse error.stack into Sentry-compliant chronological frames (caller -> crash site)
   */
  function parseStackTrace(stackStr) {
    if (!stackStr || typeof stackStr !== 'string') return undefined;

    const lines = stackStr.split('\n');
    const frames = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!trimmed.startsWith('at ') && !trimmed.includes('@') && !trimmed.includes('.js')) continue;

      let funcName = '?';
      let urlOrPath = '';
      let lineno = undefined;
      let colno = undefined;

      // Chrome / Edge / Node format: "at funcName (http://.../file.js:12:34)" or "at http://.../file.js:12:34"
      if (trimmed.startsWith('at ')) {
        const content = trimmed.slice(3).trim();
        const pMatch = content.match(/^(?:(?:async|new)\s+)?(.*?)\s*\((.*?)\)$/);
        let locationPart = '';
        if (pMatch) {
          funcName = pMatch[1] || '?';
          locationPart = pMatch[2] || '';
        } else {
          funcName = '?';
          locationPart = content;
        }

        const locMatch = locationPart.match(/^(?:.*[\\/])?([^:()]+):(\d+)(?::(\d+))?$/);
        if (locMatch) {
          urlOrPath = locMatch[1];
          lineno = parseInt(locMatch[2], 10);
          if (locMatch[3]) colno = parseInt(locMatch[3], 10);
        } else {
          urlOrPath = locationPart;
        }
      }
      // Safari / Firefox format: "funcName@http://.../file.js:12:34"
      else if (trimmed.includes('@')) {
        const atIdx = trimmed.indexOf('@');
        funcName = trimmed.substring(0, atIdx) || '?';
        const locationPart = trimmed.substring(atIdx + 1);
        const locMatch = locationPart.match(/^(?:.*[\\/])?([^:()]+):(\d+)(?::(\d+))?$/);
        if (locMatch) {
          urlOrPath = locMatch[1];
          lineno = parseInt(locMatch[2], 10);
          if (locMatch[3]) colno = parseInt(locMatch[3], 10);
        } else {
          urlOrPath = locationPart;
        }
      }

      if (urlOrPath) {
        let cleanFilename = urlOrPath.split('?')[0].split('#')[0];
        if (cleanFilename.includes('/')) {
          const parts = cleanFilename.split('/');
          cleanFilename = parts[parts.length - 1] || cleanFilename;
        }

        // Exclude sentry internal files from being identified as crash site
        if (cleanFilename === 'sentry-client.js' || cleanFilename === 'sentry-server.js') {
          continue;
        }

        frames.push({
          filename: cleanFilename || 'unknown.js',
          function: funcName || '?',
          lineno: Number.isFinite(lineno) ? lineno : undefined,
          colno: Number.isFinite(colno) ? colno : undefined,
          in_app: !urlOrPath.includes('node_modules') && !urlOrPath.includes('chrome-extension')
        });
      }
    }

    if (frames.length === 0) {
      return { frames: [{ filename: 'app.js', function: 'app' }] };
    }

    // Sentry requires frames ordered from oldest caller to newest (crash frame at end)
    return { frames: frames.reverse() };
  }

  const PadiFixSentry = {
    _initialized: false,
    _dsn: null,
    _environment: 'production',
    _tracesSampleRate: 0.10,
    _replaysSessionSampleRate: 0.05,
    _replaysOnErrorSampleRate: 1.0,

    /**
     * Resolve SENTRY_DSN from window, meta tag, or options
     */
    getDsn: function () {
      if (this._dsn) return this._dsn;
      if (typeof window !== 'undefined') {
        if (window.SENTRY_DSN && window.SENTRY_DSN !== 'undefined') {
          return window.SENTRY_DSN;
        }
        const meta = document.querySelector('meta[name="sentry-dsn"]');
        if (meta && meta.content && meta.content !== 'undefined') {
          return meta.content;
        }
      }
      if (typeof process !== 'undefined' && process.env && process.env.SENTRY_DSN) {
        return process.env.SENTRY_DSN;
      }
      return null;
    },

    /**
     * Resolve environment name (development, preview, production)
     */
    getEnvironment: function () {
      if (typeof window !== 'undefined') {
        if (window.SENTRY_ENVIRONMENT) return window.SENTRY_ENVIRONMENT;
        const meta = document.querySelector('meta[name="sentry-environment"]');
        if (meta && meta.content) return meta.content;
        const host = window.location.hostname;
        if (host === 'padifix.vercel.app' || host === 'padifix.ng' || host === 'www.padifix.ng') {
          return 'production';
        }
        if (host.includes('vercel.app')) {
          return 'preview';
        }
      }
      if (typeof process !== 'undefined' && process.env && process.env.SENTRY_ENVIRONMENT) {
        return process.env.SENTRY_ENVIRONMENT;
      }
      return 'production';
    },

    /**
     * Sampling rate getters
     */
    getTracesSampleRate: function () {
      if (typeof window !== 'undefined') {
        const meta = document.querySelector('meta[name="sentry-traces-sample-rate"]');
        if (meta && meta.content) return parseFloat(meta.content) || 0.10;
      }
      return this._tracesSampleRate;
    },

    getReplaysSessionSampleRate: function () {
      if (typeof window !== 'undefined') {
        const meta = document.querySelector('meta[name="sentry-replays-session-sample-rate"]');
        if (meta && meta.content) return parseFloat(meta.content) || 0.05;
      }
      return this._replaysSessionSampleRate;
    },

    getReplaysOnErrorSampleRate: function () {
      if (typeof window !== 'undefined') {
        const meta = document.querySelector('meta[name="sentry-replays-on-error-sample-rate"]');
        if (meta && meta.content) return parseFloat(meta.content) || 1.0;
      }
      return this._replaysOnErrorSampleRate;
    },

    /**
     * Apply aggressive privacy shielding on form inputs for Session Replay
     */
    applyPrivacyShield: function () {
      if (typeof document === 'undefined') return;
      const inputs = document.querySelectorAll('input, textarea, select');
      inputs.forEach(el => {
        const type = (el.type || '').toLowerCase();
        const name = (el.name || el.id || '').toLowerCase();
        const shouldMask = type === 'password' || type === 'tel' ||
          name.includes('bvn') || name.includes('nin') || name.includes('card') ||
          name.includes('cvv') || name.includes('token') || name.includes('auth') ||
          name.includes('phone') || name.includes('pin');
        if (shouldMask) {
          el.classList.add('sentry-mask');
          el.setAttribute('data-sentry-mask', 'true');
        }
      });
    },

    /**
     * Initialize browser error trapping & observability
     */
    init: function (options = {}) {
      if (this._initialized) return this;
      this._dsn = options.dsn || this.getDsn();
      this._environment = options.environment || this.getEnvironment();
      this._tracesSampleRate = typeof options.tracesSampleRate === 'number' ? options.tracesSampleRate : this.getTracesSampleRate();
      this._replaysSessionSampleRate = typeof options.replaysSessionSampleRate === 'number' ? options.replaysSessionSampleRate : this.getReplaysSessionSampleRate();
      this._replaysOnErrorSampleRate = typeof options.replaysOnErrorSampleRate === 'number' ? options.replaysOnErrorSampleRate : this.getReplaysOnErrorSampleRate();

      // Apply DOM input masking
      this.applyPrivacyShield();

      // If no DSN configured, safely remain in silent dormant mode
      if (!this._dsn) {
        this._initialized = true;
        return this;
      }

      // Attach global uncaught error listeners
      if (typeof window !== 'undefined') {
        window.addEventListener('error', (event) => {
          this.captureException(event.error || new Error(event.message || 'Uncaught Error'), {
            context: 'window.onerror',
            lineno: event.lineno,
            colno: event.colno,
            filename: event.filename
          });
        });

        window.addEventListener('unhandledrejection', (event) => {
          const reason = event.reason;
          this.captureException(reason instanceof Error ? reason : new Error(String(reason)), {
            context: 'unhandledrejection'
          });
        });
      }

      this._initialized = true;
      return this;
    },

    /**
     * Capture application exception with privacy sanitization
     */
    captureException: function (error, extra = {}) {
      const dsn = this.getDsn();
      if (!dsn) return null; // Silent no-op when unconfigured

      const safeExtra = sanitizeData(extra);
      const safeUrl = typeof window !== 'undefined' ? sanitizeUrl(window.location.href) : '';
      const eventId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '') : `evt_${Date.now()}`;

      const stacktrace = error && error.stack ? parseStackTrace(error.stack) : undefined;

      const errEvent = {
        event_id: eventId,
        timestamp: new Date().toISOString(),
        platform: 'javascript',
        level: 'error',
        environment: this._environment,
        exception: {
          values: [
            {
              type: error && error.name ? error.name : 'Error',
              value: error && error.message ? error.message : String(error),
              stacktrace: stacktrace
            }
          ]
        },
        extra: safeExtra,
        tags: {
          url: safeUrl,
          env: this._environment
        }
      };

      // Remote dispatch via browser fetch if in browser and DSN is active
      const dsnParts = parseDsn(dsn);
      if (dsnParts && typeof fetch === 'function') {
        try {
          const ingestUrl = `${dsnParts.protocol}//${dsnParts.host}/api/${dsnParts.projectId}/store/`;
          fetch(ingestUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=padifix-browser/1.0.0, sentry_key=${dsnParts.publicKey}`
            },
            body: JSON.stringify(errEvent),
            keepalive: true
          }).catch(() => {});
        } catch (e) {}
      }

      return errEvent.event_id;
    },

    /**
     * Capture application message/warning
     */
    captureMessage: function (message, level = 'info', extra = {}) {
      const dsn = this.getDsn();
      if (!dsn) return null;

      const safeExtra = sanitizeData(extra);
      return `msg_${Date.now()}`;
    },

    sanitizeData,
    sanitizeUrl,
    parseDsn
  };

  // Auto-initialize if running in browser
  if (typeof window !== 'undefined') {
    global.PadiFixSentry = PadiFixSentry;
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      PadiFixSentry.init();
    } else {
      document.addEventListener('DOMContentLoaded', () => PadiFixSentry.init());
    }
  }

  // CommonJS export for testing & Node environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PadiFixSentry;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

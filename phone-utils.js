// ============================================================================
// LOKATOR.NG — NIGERIAN PHONE NORMALIZATION & WHATSAPP CONVERSION UTILITY
// Single Canonical Source of Truth for Nigerian Phone Numbers, Tel Links & WhatsApp URLs
// ============================================================================

(function (global) {
  'use strict';

  // Valid Nigerian Mobile Prefixes (2-digit after leading zero: 70, 71, 80, 81, 90, 91)
  const NIGERIA_MOBILE_PREFIX_REGEX = /^(?:70|71|80|81|90|91)\d{8}$/;

  /**
   * Nigerian Phone Utilities Engine
   */
  const NigeriaPhone = {
    /**
     * Sanitizes raw input into digits only, stripping +, spaces, dashes, brackets
     * @param {string|number} input
     * @returns {string} Digits-only string
     */
    sanitizeDigits(input) {
      if (input === null || input === undefined) return '';
      return String(input).replace(/\D/g, '');
    },

    /**
     * Normalizes any supported Nigerian phone input format into canonical structured representation
     * Supported formats:
     * - 08012345678 (11-digit national)
     * - +2348012345678 (E.164 international with +)
     * - 2348012345678 (13-digit international without +)
     * - 8012345678 (10-digit without leading 0)
     * - 080 1234 5678 / 080-1234-5678 / (080) 1234 5678
     * - +23408012345678 / 23408012345678 (accidental double prefix)
     *
     * @param {string|number} rawInput
     * @returns {{
     *   valid: boolean,
     *   canonical: string|null,
     *   national: string|null,
     *   international: string|null,
     *   display: string|null,
     *   displayInternational: string|null,
     *   telUri: string|null,
     *   whatsapp: string|null,
     *   whatsappUrl: string|null
     * }}
     */
    normalize(rawInput) {
      const invalidResult = {
        valid: false,
        raw: rawInput != null ? String(rawInput) : '',
        canonical: null,
        national: null,
        international: null,
        display: null,
        displayInternational: null,
        telUri: null,
        whatsapp: null,
        whatsappUrl: null
      };

      if (rawInput === null || rawInput === undefined) {
        return invalidResult;
      }

      let digits = this.sanitizeDigits(rawInput);
      if (!digits || digits.length < 10 || digits.length > 14) {
        return invalidResult;
      }

      let core10 = '';

      // Case 1: 14 digits starting with 2340 (e.g. 23408012345678)
      if (digits.length === 14 && digits.startsWith('2340')) {
        core10 = digits.substring(4);
      }
      // Case 2: 13 digits starting with 234 (e.g. 2348012345678)
      else if (digits.length === 13 && digits.startsWith('234')) {
        core10 = digits.substring(3);
      }
      // Case 3: 11 digits starting with 0 (e.g. 08012345678)
      else if (digits.length === 11 && digits.startsWith('0')) {
        core10 = digits.substring(1);
      }
      // Case 4: 10 digits directly (e.g. 8012345678)
      else if (digits.length === 10) {
        core10 = digits;
      } else {
        return invalidResult;
      }

      // Verify core 10 digits match Nigerian mobile prefixes
      if (!NIGERIA_MOBILE_PREFIX_REGEX.test(core10)) {
        return invalidResult;
      }

      const canonical = `234${core10}`;
      const national = `0${core10}`;
      const international = `+234${core10}`;
      
      // Formatted national display: 0801 234 5678
      const display = `${national.substring(0, 4)} ${national.substring(4, 7)} ${national.substring(7)}`;
      // Formatted international display: +234 801 234 5678
      const displayInternational = `+234 ${core10.substring(0, 3)} ${core10.substring(3, 6)} ${core10.substring(6)}`;
      const telUri = `tel:+234${core10}`;
      const whatsapp = canonical;
      const whatsappUrl = `https://wa.me/${canonical}`;

      return {
        valid: true,
        raw: String(rawInput),
        canonical,
        national,
        international,
        display,
        displayInternational,
        telUri,
        whatsapp,
        whatsappUrl
      };
    },

    /**
     * Checks if an input is a valid Nigerian phone number
     * @param {string|number} rawInput
     * @returns {boolean}
     */
    isValid(rawInput) {
      return this.normalize(rawInput).valid;
    },

    /**
     * Returns canonical 234XXXXXXXXXX string or null
     * @param {string|number} rawInput
     * @returns {string|null}
     */
    toCanonical(rawInput) {
      const res = this.normalize(rawInput);
      return res.valid ? res.canonical : null;
    },

    /**
     * Returns formatted national string (e.g. "0801 234 5678") or fallback
     * @param {string|number} rawInput
     * @param {string} fallback
     * @returns {string}
     */
    formatDisplay(rawInput, fallback = '') {
      const res = this.normalize(rawInput);
      return res.valid ? res.display : (rawInput ? String(rawInput) : fallback);
    },

    /**
     * Returns formatted international string (e.g. "+234 801 234 5678") or fallback
     * @param {string|number} rawInput
     * @param {string} fallback
     * @returns {string}
     */
    formatInternational(rawInput, fallback = '') {
      const res = this.normalize(rawInput);
      return res.valid ? res.displayInternational : (rawInput ? String(rawInput) : fallback);
    },

    /**
     * Builds RFC 3966 compliant tel: URI (e.g. "tel:+2348012345678")
     * @param {string|object} phoneOrProvider
     * @returns {string} tel URI or empty string
     */
    buildTelUrl(phoneOrProvider) {
      let rawPhone = phoneOrProvider;
      if (phoneOrProvider && typeof phoneOrProvider === 'object') {
        rawPhone = phoneOrProvider.phone || phoneOrProvider.telephone || phoneOrProvider.whatsappNumber;
      }
      const res = this.normalize(rawPhone);
      return res.valid ? res.telUri : '';
    },

    /**
     * Builds standard, polite Nigerian-native prefilled message for WhatsApp conversion
     * @param {object} context
     * @returns {string} Formatted plain text message
     */
    buildContextualMessage(context = {}) {
      const name = (context.providerName || context.name || '').trim();
      const trade = (context.service || context.trade || context.category || '').trim();
      let location = (context.location || context.area || '').trim();
      if (!location) {
        if (context.lga && context.state) {
          location = `${context.lga}, ${context.state}`;
        } else if (context.lga) {
          location = context.lga;
        } else if (context.state) {
          location = context.state;
        } else if (context.city) {
          location = context.city;
        }
      }
      const customMessage = (context.customMessage || context.message || '').trim();

      if (customMessage) {
        return customMessage;
      }

      const greetingName = name ? `Hello ${name}` : 'Hello';
      const profilePhrase = trade ? `saw your ${trade} profile on PadiFix` : 'saw your profile on PadiFix';

      // Clean location: omit if placeholder or empty
      const hasValidLocation = location && !/^(undefined|null|all|your area|nigeria)$/i.test(location);

      if (hasValidLocation) {
        return `${greetingName}, I ${profilePhrase}. I need service in ${location}. Can you provide a quote?`;
      } else {
        return `${greetingName}, I ${profilePhrase}. Can you provide a quote?`;
      }
    },

    /**
     * Centralized WhatsApp URL Generator
     * Produces: https://wa.me/2348012345678?text=...
     * Never generates double country codes (234234...) or undefined placeholders.
     *
     * @param {string|object} phoneOrProvider Raw phone string or Provider object
     * @param {object} [contextOptions] Custom context for prefilled message
     * @returns {string} Complete WhatsApp deep link URL or empty string
     */
    buildWhatsAppUrl(phoneOrProvider, contextOptions = {}) {
      let rawPhone = null;
      let providerName = '';
      let service = '';
      let location = '';

      if (phoneOrProvider && typeof phoneOrProvider === 'object') {
        rawPhone = phoneOrProvider.whatsappNumber || phoneOrProvider.phone || phoneOrProvider.whatsapp;
        providerName = phoneOrProvider.name || phoneOrProvider.firstName || `${phoneOrProvider.first_name || ''} ${phoneOrProvider.last_name || ''}`.trim();
        service = phoneOrProvider.trade || phoneOrProvider.service || phoneOrProvider.category || '';
        if (phoneOrProvider.area || phoneOrProvider.locality) {
          location = phoneOrProvider.area || phoneOrProvider.locality;
        } else if (phoneOrProvider.lga && phoneOrProvider.state) {
          location = `${phoneOrProvider.lga}, ${phoneOrProvider.state}`;
        } else if (phoneOrProvider.lga) {
          location = phoneOrProvider.lga;
        } else if (phoneOrProvider.state) {
          location = phoneOrProvider.state;
        } else if (phoneOrProvider.city) {
          location = phoneOrProvider.city;
        }
      } else {
        rawPhone = phoneOrProvider;
      }

      const norm = this.normalize(rawPhone);
      if (!norm.valid) {
        return '';
      }

      // Merge context options
      const mergedContext = {
        providerName: contextOptions.providerName || contextOptions.name || providerName,
        service: contextOptions.service || contextOptions.trade || contextOptions.category || service,
        location: contextOptions.location || location,
        lga: contextOptions.lga || (phoneOrProvider && phoneOrProvider.lga) || '',
        state: contextOptions.state || (phoneOrProvider && phoneOrProvider.state) || '',
        city: contextOptions.city || (phoneOrProvider && phoneOrProvider.city) || '',
        customMessage: contextOptions.customMessage || contextOptions.message || ''
      };

      const messageText = this.buildContextualMessage(mergedContext);
      return `https://wa.me/${norm.canonical}?text=${encodeURIComponent(messageText)}`;
    },

    /**
     * Smart Quote WhatsApp Deep Link Generator
     * Generates a context-aware 1-tap quote inquiry URL
     * @param {string|object} phoneOrProvider
     * @param {object} [contextOptions]
     * @returns {string}
     */
    buildSmartWhatsAppUrl(phoneOrProvider, contextOptions = {}) {
      return this.buildWhatsAppUrl(phoneOrProvider, { ...contextOptions, smartQuote: true });
    }
  };

  // Expose globally to window / worker / node / globalThis
  global.NigeriaPhone = NigeriaPhone;
  global.PhoneEngine = NigeriaPhone;
  if (typeof globalThis !== 'undefined') {
    globalThis.NigeriaPhone = NigeriaPhone;
    globalThis.PhoneEngine = NigeriaPhone;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NigeriaPhone, PhoneEngine };
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this)));

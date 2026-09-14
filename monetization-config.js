// ============================================================================
// PADIFIX — MARKETPLACE GROWTH & MONETIZATION CONFIGURATION (monetization-config.js)
// Authoritative pricing, feature flags, cluster capacity guards & telemetry schema
// ============================================================================

(function (global) {
  'use strict';

  const NAME = 'PadiFix Marketplace Growth & Monetization Architecture';
  const VERSION = '4.0.0';
  const PHASE = '004';
  const PHASE_010_VERSION = '5.0.0';
  const PHASE_010_ACTIVE = true;

  // 1. FEATURE FLAGS
  // Safely controls rollout of monetization layers without destructive code surgery
  const FEATURE_FLAGS = {
    // Core Gate: Controls whether any sponsored cards appear in customer searches
    sponsoredListingsEnabled: false,

    // Provider Badging: Controls display of verified identity & reputation badges
    premiumProvidersEnabled: true,

    // Recurring Subscriptions: Safe default false (enabled per provider session or deployment)
    providerSubscriptionsEnabled: false,

    // Third-Party Ad Networks: Strictly locked to protect page speed & conversion
    advertisingEnabled: false,

    // Rewarded Research / Surveys: Locked to protect core search task completion
    surveysEnabled: false,

    // Non-PII Telemetry & Funnel Tracking
    monetizationAnalyticsEnabled: true,

    // Payment Processing Mode: Strictly false for test sandbox mode
    paymentLiveMode: false,

    // Phase 005: Provider Growth & Liquidity Engine Flags
    providerProfileCompletionEnabled: true,
    providerAnalyticsEnabled: true,
    providerRecruitmentCtaEnabled: true,
    providerReferralEnabled: true,
    providerVerificationEnabled: true,

    // Phase 006: Provider Verification & Trust Infrastructure Flags
    liveKycGatewayEnabled: false, // Strictly false: external KYC vendor network calls gated

    // Phase 007: Provider Verification Operations & Identity Gateway Flags
    mockVerificationEnabled: false, // Disabled by default in production
    duplicateIdentityGuardEnabled: true,
    verificationRateLimitEnabled: true,

    // Phase 008: Real KYC Integration, Webhook Reconciliation & Compliance Operations Flags
    kycProviderMode: 'sandbox', // 'sandbox' | 'live'
    kycLiveEnabled: false, // Strictly false: live KYC fails closed unless authorized server-side
    kycWebhookVerificationEnabled: true,
    kycReconciliationEnabled: true,

    // Phase 009: KYC Vendor Selection, Production Readiness & Spending Guard Flags
    kycPrimaryProvider: 'prembly',
    kycSecondaryProvider: 'dojah',
    kycDailyVerificationCap: 50,
    kycMonthlyVerificationCap: 500,
    kycMaxCostPerVerificationNgn: 250,

    // Phase 010: Provider Subscription Plans & Contact Metering Flags
    contactMeteringEnabled: true,
    postServiceReviewLoopEnabled: true,
    paystackSubscriptionsEnabled: true
  };

  // 2. MARKETPLACE RULES & PRIVACY CONFIGURATION
  const CONFIG = {
    RULES: {
      COMMISSION_PERCENT: 0,
      FREE_PHONE_CALLS: true,
      FREE_WHATSAPP_MESSAGING: true,
      FREE_PROFILE_LISTING: true,
      MAX_SPONSORED_PER_PAGE: 2
    },
    FORBIDDEN_KEYS: [
      'password', 'token', 'jwt', 'card', 'cvv', 'pan', 'nin', 'vnin', 'bvn', 'secret',
      'apikey', 'api_key', 'rawresponse', 'raw_response', 'identitydocument', 'document'
    ]
  };

  // 3. AUTHORITATIVE MONETIZATION PRODUCTS & CATALOG
  // In Phase 035, PadiFix monetization is strictly Provider Subscriptions only.
  // Legacy transactional products (PROMOTED_LISTING_STARTER, TRUST_VERIFICATION_AUDIT) are PERMANENTLY RETIRED.
  const PRODUCTS = Object.freeze({});


  // 3.1 CANONICAL PROVIDER SUBSCRIPTION PLANS (PHASE 010)
  // Authoritative monthly subscription plans, prices, and entitlements
  const PROVIDER_PLANS = {
    FREE: {
      id: 'FREE',
      name: 'Free',
      displayName: 'Free Starter',
      priceAmount: 0,
      price_ngn: 0,
      priceKobo: 0,
      priceDisplay: '₦0/month',
      billingInterval: 'monthly',
      paystackPlanCode: null,
      paystack_plan_code: null,
      contactAllowance: 5,
      contact_allowance: 5,
      maxSkills: 3,
      max_skills: 3,
      maxPhotos: 5,
      max_photos: 5,
      maxVideos: 0,
      max_videos: 0,
      searchPriority: 0,
      searchBoostPercent: 0,
      search_visibility: 'standard',
      isPopular: false,
      is_popular: false,
      isFeatured: false,
      featured_badge: false,
      prioritySupport: false,
      verificationEligible: false,
      canRequestVerification: false,
      can_request_verification: false,
      entitlements: [
        'Basic provider profile',
        'Standard search visibility',
        'Maximum 3 skills/services',
        'Maximum 5 photos',
        'Customer reviews',
        'Standard provider dashboard',
        '5 customer contacts/month'
      ]
    },

    BASIC: {
      id: 'BASIC',
      name: 'Basic',
      displayName: 'Basic',
      priceAmount: 5500,
      price_ngn: 5500,
      priceKobo: 550000,
      priceDisplay: '₦5,500/month',
      annualPriceAmount: 55000,
      annualPriceKobo: 5500000,
      annualPriceDisplay: '₦55,000/year',
      billingInterval: 'monthly',
      paystackPlanCode: 'PLN_yf4tb6fpw2u8zj6',
      paystack_plan_code: 'PLN_yf4tb6fpw2u8zj6',
      contactAllowance: 30,
      contact_allowance: 30,
      maxSkills: 10,
      max_skills: 10,
      maxPhotos: 15,
      max_photos: 15,
      maxVideos: 1,
      max_videos: 1,
      searchPriority: 1,
      searchBoostPercent: 5,
      search_visibility: 'improved',
      isPopular: false,
      is_popular: false,
      isFeatured: false,
      featured_badge: false,
      prioritySupport: false,
      verificationEligible: true,
      canRequestVerification: true,
      can_request_verification: true,
      entitlements: [
        'Everything in Free',
        'Up to 10 skills/services',
        'Up to 15 photos',
        '1 provider video',
        'Verified Trust Assurance included',
        'Verification-document submission unlocked',
        'Availability status',
        'Improved search visibility (+5%)',
        'Lead/contact history',
        'Basic analytics',
        '30 customer contacts/month'
      ]
    },

    PRO: {
      id: 'PRO',
      name: 'Pro',
      displayName: 'Pro',
      priceAmount: 11000,
      price_ngn: 11000,
      priceKobo: 1100000,
      priceDisplay: '₦11,000/month',
      annualPriceAmount: 110000,
      annualPriceKobo: 11000000,
      annualPriceDisplay: '₦110,000/year',
      billingInterval: 'monthly',
      paystackPlanCode: 'PLN_pqm1fg3b1o0wwf1',
      paystack_plan_code: 'PLN_pqm1fg3b1o0wwf1',
      contactAllowance: 100,
      contact_allowance: 100,
      maxSkills: 25,
      max_skills: 25,
      maxPhotos: 30,
      max_photos: 30,
      maxVideos: 3,
      max_videos: 3,
      searchPriority: 2,
      searchBoostPercent: 15,
      search_visibility: 'priority',
      isPopular: true,
      is_popular: true,
      badgeText: 'MOST POPULAR',
      isFeatured: true,
      featured_badge: true,
      prioritySupport: true,
      verificationEligible: true,
      canRequestVerification: true,
      can_request_verification: true,
      entitlements: [
        'Everything in Basic',
        'Up to 25 skills/services',
        'Up to 30 photos',
        'Up to 3 provider videos',
        'Verified Trust Assurance included',
        'Verification-document submission unlocked',
        'Priority search visibility (+15%)',
        'Featured provider profile',
        'Advanced lead analytics',
        'Contact history',
        'Priority support',
        '100 customer contacts/month'
      ]
    },

    PREMIUM: {
      id: 'PREMIUM',
      name: 'Premium',
      displayName: 'Premium',
      priceAmount: 22000,
      price_ngn: 22000,
      priceKobo: 2200000,
      priceDisplay: '₦22,000/month',
      annualPriceAmount: 220000,
      annualPriceKobo: 22000000,
      annualPriceDisplay: '₦220,000/year',
      billingInterval: 'monthly',
      paystackPlanCode: 'PLN_e3nu8i62af9ypve',
      paystack_plan_code: 'PLN_e3nu8i62af9ypve',
      contactAllowance: 500,
      contact_allowance: 500,
      fairUseLimit: 500, // Anti-abuse soft-cap to protect infrastructure
      fair_use_soft_cap: 500,
      maxSkills: 999, // Unlimited
      max_skills: Infinity,
      maxPhotos: 999, // Unlimited
      max_photos: Infinity,
      maxVideos: 5,
      max_videos: 5,
      searchPriority: 3,
      searchBoostPercent: 25,
      search_visibility: 'highest',
      isPopular: false,
      is_popular: false,
      isFeatured: true,
      featured_badge: true,
      prioritySupport: true,
      promotionalOpportunities: true,
      verificationEligible: true,
      canRequestVerification: true,
      can_request_verification: true,
      entitlements: [
        'Everything in Pro',
        'Unlimited skills/services',
        'Unlimited photos',
        'Up to 5 provider videos',
        'Verified Trust Assurance included',
        'Verification-document submission unlocked',
        'Highest search visibility (+25%)',
        'Featured placement',
        'Advanced analytics',
        'Promotional opportunities',
        'VIP support',
        '500 customer contacts/month fair-use limit'
      ]
    }
  };

  // 3.2 PROVIDER SUBSCRIPTION STATE MACHINE & RECURRING LIFECYCLE (PHASE 011)
  const SUBSCRIPTION_STATES = [
    'free',
    'active',
    'trialing',
    'past_due',
    'grace',
    'non_renewing',
    'cancelled',
    'expired',
    'pending',
    'payment_failed'
  ];
  SUBSCRIPTION_STATES.FREE = 'free';
  SUBSCRIPTION_STATES.ACTIVE = 'active';
  SUBSCRIPTION_STATES.TRIALING = 'trialing';
  SUBSCRIPTION_STATES.PAST_DUE = 'past_due';
  SUBSCRIPTION_STATES.GRACE = 'grace';
  SUBSCRIPTION_STATES.NON_RENEWING = 'non_renewing';
  SUBSCRIPTION_STATES.CANCEL_AT_PERIOD_END = 'non_renewing';
  SUBSCRIPTION_STATES.CANCELLED = 'cancelled';
  SUBSCRIPTION_STATES.EXPIRED = 'expired';
  SUBSCRIPTION_STATES.PENDING = 'pending';
  SUBSCRIPTION_STATES.PAYMENT_FAILED = 'payment_failed';

  const SUBSCRIPTION_TRANSITIONS = {
    pending: ['active', 'payment_failed', 'cancelled'],
    active: ['active', 'past_due', 'grace', 'non_renewing', 'cancelled', 'expired'],
    trialing: ['active', 'cancelled', 'expired'],
    past_due: ['active', 'grace', 'expired', 'payment_failed'],
    grace: ['active', 'expired', 'cancelled'],
    non_renewing: ['active', 'expired', 'cancelled'],
    cancelled: ['active', 'expired', 'pending'],
    expired: ['pending', 'active'],
    payment_failed: ['pending', 'active']
  };

  // Phase 011 Recurring Paystack and Grace Period Settings
  const PAYSTACK_RECURRING = {
    DEFAULT_GRACE_PERIOD_DAYS: 3,
    CURRENCY: 'NGN',
    LIVE_MODE: (typeof process !== 'undefined' && process.env && process.env.PAYMENT_LIVE_MODE === 'true'),
    PLANS: {
      BASIC: {
        plan_code: 'PLN_yf4tb6fpw2u8zj6',
        name: 'PadiFix Basic',
        amount_kobo: 550000,
        amount_ngn: 5500,
        annual_amount_kobo: 5500000,
        annual_amount_ngn: 55000,
        interval: 'monthly'
      },
      BASIC_ANNUAL: {
        plan_code: 'PLN_yf4tb6fpw2u8zj6',
        name: 'PadiFix Basic Annual',
        amount_kobo: 5500000,
        amount_ngn: 55000,
        interval: 'annually'
      },
      PRO: {
        plan_code: 'PLN_pqm1fg3b1o0wwf1',
        name: 'PadiFix Pro',
        amount_kobo: 1100000,
        amount_ngn: 11000,
        annual_amount_kobo: 11000000,
        annual_amount_ngn: 110000,
        interval: 'monthly'
      },
      PRO_ANNUAL: {
        plan_code: 'PLN_pqm1fg3b1o0wwf1',
        name: 'PadiFix Pro Annual',
        amount_kobo: 11000000,
        amount_ngn: 110000,
        interval: 'annually'
      },
      PREMIUM: {
        plan_code: 'PLN_e3nu8i62af9ypve',
        name: 'PadiFix Premium',
        amount_kobo: 2200000,
        amount_ngn: 22000,
        annual_amount_kobo: 22000000,
        annual_amount_ngn: 220000,
        interval: 'monthly'
      },
      PREMIUM_ANNUAL: {
        plan_code: 'PLN_e3nu8i62af9ypve',
        name: 'PadiFix Premium Annual',
        amount_kobo: 22000000,
        amount_ngn: 220000,
        interval: 'annually'
      }
    }
  };

  // Phase 011 Resend Transactional Email Configuration
  const RESEND_EMAIL_CONFIG = {
    DEFAULT_FROM_EMAIL: 'PadiFix <notifications@padifix.ng>',
    FALLBACK_FROM_EMAIL: 'PadiFix <onboarding@resend.dev>',
    EVENTS: {
      SUBSCRIPTION_ACTIVATED: 'subscription_activated',
      PAYMENT_SUCCESSFUL: 'payment_successful',
      PAYMENT_FAILED: 'payment_failed',
      GRACE_PERIOD_WARNING: 'grace_period_warning',
      SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
      SUBSCRIPTION_EXPIRED: 'subscription_expired',
      PLAN_CHANGED: 'plan_changed'
    }
  };

  // 3.3 CONTACT METERING CONFIGURATION
  const CONTACT_METERING = {
    DEFAULT_TIMEZONE: 'Africa/Lagos',
    FAIR_USE_CEILING: 500,
    CHANNELS: ['whatsapp', 'call'],
    IDEMPOTENCY_WINDOW_SECONDS: 900, // 15 minutes window for identical interactions
    whatsapp_initiation_units: 1,
    call_initiation_units: 1,
    inspect_conversations: false,
    store_chat_contents: false,
    record_call_audio: false,
    count_individual_messages: false
  };

  // 3.4 POST-SERVICE REVIEWS TRUST CONFIGURATION
  const POST_SERVICE_REVIEWS = {
    HIRED_STATUSES: {
      COMPLETED: 'completed',
      IN_PROGRESS: 'in_progress',
      NOT_HIRED: 'not_hired'
    },
    RATING_CATEGORIES: [
      { key: 'quality', label: 'Quality of work' },
      { key: 'professionalism', label: 'Professionalism' },
      { key: 'communication', label: 'Communication' },
      { key: 'value', label: 'Value for money' },
      { key: 'reliability', label: 'Reliability' }
    ]
  };

  // 3.5 STRICT INVARIANT ARCHITECTURES (ZERO ESCROW, ZERO COMMISSION, TRUST SEPARATION)
  const SERVICE_PAYMENT_MODEL = {
    marketplace_commission_pct: 0,
    escrow_enabled: false,
    holds_customer_funds: false,
    payment_processor: 'DIRECT_CUSTOMER_TO_PROVIDER',
    negotiated_outside_platform: true
  };

  const TRUST_MONETIZATION_SEPARATION = {
    paid_plans_alter_ratings: false,
    paid_plan_can_boost_star_rating: false,
    paid_plans_remove_negative_reviews: false,
    paid_plan_can_remove_negative_reviews: false,
    paid_plans_grant_verified_badge: false,
    paid_plan_grants_verified_badge: false,
    paid_plans_bypass_compliance_vetting: false,
    allow_paid_review_placement: false
  };

  const KYC_INTEGRATION_BOUNDARY = {
    kyc_live_enabled: false,
    kyc_depends_on_subscription: false,
    premium_automatically_verified: false,
    allow_pay_for_badge: false,
    fail_closed_mode: true
  };

  // 4. TELEMETRY EVENT SCHEMA FOR MONETIZATION
  // Strict Privacy: zero PII, zero card numbers, zero passwords, zero NIN/BVN
  const MONETIZATION_EVENTS = {
    PLAN_VIEWED: 'monetization_plan_viewed',
    CTA_CLICKED: 'monetization_cta_clicked',
    CHECKOUT_STARTED: 'monetization_checkout_started',
    CHECKOUT_COMPLETED: 'monetization_checkout_completed',
    SPONSORED_IMPRESSION: 'sponsored_impression',
    SPONSORED_CLICK: 'sponsored_click',
    SPONSORED_CONTACT: 'sponsored_contact_clicked',
    CHECKOUT_INIT: 'pilot_checkout_initiated',
    PAYMENT_SUCCESS: 'pilot_payment_success',
    CAPACITY_REACHED: 'monetization_capacity_reached',
    FEEDBACK_SUBMITTED: 'monetization_feedback_submitted',

    // Phase 005 Provider Growth & Trust Events
    PROVIDER_JOIN_STARTED: 'provider_join_started',
    PROVIDER_REGISTRATION_COMPLETED: 'provider_registration_completed',
    PROVIDER_PROFILE_COMPLETED: 'provider_profile_completed',
    PROVIDER_SHARE_CLICKED: 'provider_share_clicked',
    PROVIDER_RECRUITMENT_CTA_CLICKED: 'provider_recruitment_cta_clicked',
    PROVIDER_ANALYTICS_VIEWED: 'provider_analytics_viewed',
    PROVIDER_VERIFICATION_STARTED: 'provider_verification_started',

    // Phase 006 & 007 Verification Lifecycle Events
    VERIFICATION_STARTED: 'verification_started',
    VERIFICATION_REQUEST_CREATED: 'verification_request_created',
    VERIFICATION_SUBMITTED: 'verification_submitted',
    VERIFICATION_PENDING: 'verification_pending',
    VERIFICATION_COMPLETED: 'verification_completed',
    VERIFICATION_REJECTED: 'verification_rejected',
    VERIFICATION_FAILED: 'verification_failed',
    VERIFICATION_RESUBMITTED: 'verification_resubmitted',
    VERIFICATION_STATUS_VIEWED: 'verification_status_viewed',

    // Phase 008 Real KYC & Webhook Reconciliation Events
    VERIFICATION_ATTEMPT_CREATED: 'verification_attempt_created',
    WEBHOOK_RECEIVED: 'webhook_received',
    RECONCILIATION_COMPLETED: 'reconciliation_completed',

    // Phase 009 Vendor Activation & Spending Guard Events
    KYC_SPEND_CAP_REACHED: 'kyc_spend_cap_reached',
    KYC_FAILOVER_TRIGGERED: 'kyc_failover_triggered',
    VENDOR_LATENCY_RECORDED: 'vendor_latency_recorded',

    // Phase 010 Provider Subscription & Contact Metering Telemetry
    PLAN_VIEW: 'plan_view',
    UPGRADE_STARTED: 'upgrade_started',
    PAYMENT_INITIALIZED: 'payment_initialized',
    SUBSCRIPTION_PAYMENT_SUCCESS: 'payment_success',
    PAYMENT_FAILED: 'payment_failed',
    SUBSCRIPTION_ACTIVATED: 'subscription_activated',
    SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
    CONTACT_INITIATED: 'contact_initiated',
    CONTACT_LIMIT_REACHED: 'contact_limit_reached',
    REVIEW_PROMPT_SHOWN: 'review_prompt_shown',
    REVIEW_SUBMITTED: 'review_submitted'
  };

  // Phase 008 & 009: Standardized Machine-Readable Compliance Decision Codes
  const COMPLIANCE_DECISION_CODES = {
    VERIFICATION_SUCCESS: 'VERIFICATION_SUCCESS',
    IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
    IDENTITY_NOT_FOUND: 'IDENTITY_NOT_FOUND',
    DUPLICATE_IDENTITY_REFERENCE: 'DUPLICATE_IDENTITY_REFERENCE',
    PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
    PROVIDER_ERROR: 'PROVIDER_ERROR',
    MALFORMED_PROVIDER_RESPONSE: 'MALFORMED_PROVIDER_RESPONSE',
    INVALID_WEBHOOK_SIGNATURE: 'INVALID_WEBHOOK_SIGNATURE',
    UNKNOWN_VERIFICATION_ATTEMPT: 'UNKNOWN_VERIFICATION_ATTEMPT',
    POLICY_REJECTION: 'POLICY_REJECTION',
    PENDING_REVIEW: 'PENDING_REVIEW',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    SPEND_CAP_EXCEEDED: 'SPEND_CAP_EXCEEDED',
    LIVE_KYC_DISABLED: 'LIVE_KYC_DISABLED',
    INVALID_VNIN_FORMAT: 'INVALID_VNIN_FORMAT'
  };

  // 5. ADMIN CONTROLS & ROLE-BASED ACCESS
  const ADMIN_CONTROLS = {
    ROLES: {
      super_admin: ['can_manage_promotions', 'can_trigger_refunds', 'can_modify_pricing', 'can_audit_compliance'],
      compliance_officer: ['can_audit_compliance', 'can_view_reports'],
      support_agent: ['can_view_reports']
    }
  };

  // 6. CURRENCY FORMATTING UTILITY (Nigerian Naira / NGN)
  function formatNaira(amount) {
    const num = Number(amount) || 0;
    return `₦${num.toLocaleString('en-NG')}`;
  }

  // 7. TELEMETRY SANITIZATION (Strict Non-PII Filter)
  function sanitizeTelemetryPayload(payload) {
    if (!payload || typeof payload !== 'object') return {};
    const clean = {};
    const forbidden = CONFIG.FORBIDDEN_KEYS;
    for (const [k, v] of Object.entries(payload)) {
      const lowerK = k.toLowerCase();
      const isForbidden = forbidden.some(f => lowerK.includes(f));
      if (!isForbidden) {
        clean[k] = v;
      }
    }
    return clean;
  }

  // 8. CLUSTER CAPACITY GUARD (Legacy Promotions Retired)
  // In Phase 035, sponsored listing products are retired in favor of canonical provider subscriptions
  function checkClusterCapacity(category, state, lga, activePromotions = []) {
    return {
      available: false,
      activeCount: 0,
      maxCapacity: 0,
      remainingSlots: 0,
      retired: true,
      message: 'Promoted listings are retired. PadiFix operates on canonical provider subscriptions.',
      category,
      state,
      lga
    };
  }

  // 9. AUTHORITATIVE PROVIDER VERIFICATION LIFECYCLE & STATE RESOLVER (PHASE 035)
  // Decouples persistent verification status (one-time qualification) from subscription lifecycle.
  const PROVIDER_VERIFICATION_STATES = {
    NOT_ELIGIBLE: 'Verification Unavailable',
    UNVERIFIED: 'Verification Available',
    AVAILABLE: 'Verification Available',
    PENDING: 'Pending Compliance Review',
    REJECTED: 'Verification Rejected',
    VERIFIED_PLATFORM: 'Platform Reviewed',
    VERIFIED_NIN: 'National NIN Verified',
    VERIFIED_INACTIVE: 'Verified (Subscription Inactive)'
  };

  const VERIFICATION_STATE_DETAILS = {
    NOT_ELIGIBLE: {
      key: 'NOT_ELIGIBLE',
      label: 'Verification Unavailable',
      stateLabel: 'Verification Unavailable',
      publicBadgeText: 'Self-Reported Profile',
      badgeClass: 'profile-verified-pill unverified',
      icon: '🔒',
      color: '#94A3B8',
      description: 'Subscribe to a paid plan (Basic, Pro, or Premium) to become eligible for verification.',
      isVerified: false,
      isNinVerified: false,
      isPending: false,
      isEligible: false,
      verification_status: 'never_verified',
      verification_eligible: false,
      badgeVisible: false,
      canRequestVerification: false,
      upgradeRequired: true
    },
    UNVERIFIED: {
      key: 'AVAILABLE',
      label: 'Verification Available',
      stateLabel: 'Verification Available',
      publicBadgeText: 'Self-Reported Profile',
      badgeClass: 'profile-verified-pill unverified',
      icon: 'ℹ️',
      color: '#3B82F6',
      description: 'Complete verification to receive your verified badge.',
      isVerified: false,
      isNinVerified: false,
      isPending: false,
      isEligible: true,
      verification_status: 'never_verified',
      verification_eligible: true,
      badgeVisible: false,
      canRequestVerification: true
    },
    AVAILABLE: {
      key: 'AVAILABLE',
      label: 'Verification Available',
      stateLabel: 'Verification Available',
      publicBadgeText: 'Self-Reported Profile',
      badgeClass: 'profile-verified-pill unverified',
      icon: 'ℹ️',
      color: '#3B82F6',
      description: 'Complete verification to receive your verified badge.',
      isVerified: false,
      isNinVerified: false,
      isPending: false,
      isEligible: true,
      verification_status: 'never_verified',
      verification_eligible: true,
      badgeVisible: false,
      canRequestVerification: true
    },
    PENDING: {
      key: 'PENDING',
      label: 'Pending Compliance Review',
      stateLabel: 'Under Review',
      publicBadgeText: 'Pending Verification',
      badgeClass: 'profile-verified-pill pending',
      icon: '⏳',
      color: '#F59E0B',
      description: 'Verification documents submitted and currently undergoing review by PadiFix compliance officers.',
      isVerified: false,
      isNinVerified: false,
      isPending: true,
      isEligible: true,
      verification_status: 'pending',
      verification_eligible: true,
      badgeVisible: false,
      canRequestVerification: false
    },
    REJECTED: {
      key: 'REJECTED',
      label: 'Verification Needs Resubmission',
      stateLabel: 'Verification Rejected',
      publicBadgeText: 'Self-Reported Profile',
      badgeClass: 'profile-verified-pill unverified',
      icon: '⚠️',
      color: '#EF4444',
      description: 'Prior verification documents could not be validated. Please resubmit valid credentials.',
      isVerified: false,
      isNinVerified: false,
      isPending: false,
      isEligible: true,
      verification_status: 'rejected',
      verification_eligible: true,
      badgeVisible: false,
      canRequestVerification: true
    },
    VERIFIED_PLATFORM: {
      key: 'VERIFIED_PLATFORM',
      label: 'Verified Artisan',
      stateLabel: 'Verified ✓',
      publicBadgeText: 'Verified Artisan',
      badgeClass: 'profile-verified-pill verified',
      icon: '✓',
      color: '#00A859',
      description: 'Business registration, contact authenticity, and trade competence reviewed and confirmed by PadiFix compliance.',
      isVerified: true,
      isNinVerified: false,
      isPending: false,
      isEligible: true,
      subscriptionActive: true,
      verification_status: 'verified',
      verification_eligible: true,
      badgeVisible: true,
      canRequestVerification: false
    },
    VERIFIED_NIN: {
      key: 'VERIFIED_NIN',
      label: 'Verified Artisan',
      stateLabel: 'Verified ✓',
      publicBadgeText: 'Verified Artisan',
      badgeClass: 'profile-verified-pill verified',
      icon: '🛡️',
      color: '#00A859',
      description: 'Artisan identity validated against Nigeria National Identity Management Commission standards via Virtual NIN (vNIN).',
      isVerified: true,
      isNinVerified: true,
      isPending: false,
      isEligible: true,
      subscriptionActive: true,
      verification_status: 'verified',
      verification_eligible: true,
      badgeVisible: true,
      canRequestVerification: false
    },
    VERIFIED_INACTIVE: {
      key: 'VERIFIED_INACTIVE',
      label: 'Verified ✓ (Subscription Inactive)',
      stateLabel: 'Verified (Subscription Inactive)',
      publicBadgeText: '',
      badgeClass: 'profile-verified-pill unverified',
      icon: '✓',
      color: '#64748B',
      description: 'Artisan identity is permanently recorded on account. Badge visibility is subscription-dependent and will automatically reappear upon active paid subscription renewal.',
      isVerified: true,
      isNinVerified: false,
      isPending: false,
      isEligible: false,
      subscriptionActive: false,
      verification_status: 'verified',
      verification_eligible: false,
      badgeVisible: false,
      canRequestVerification: false
    }
  };

  /**
   * Evaluates whether a provider currently holds an active, non-expired paid subscription.
   */
  function isProviderSubscriptionActive(provider) {
    if (!provider || typeof provider !== 'object') return false;
    const rawPlan = String(provider.subscription_plan || provider.plan_id || provider.plan || 'FREE').toUpperCase();
    const isPaidPlan = ['BASIC', 'PRO', 'PREMIUM'].includes(rawPlan);
    if (!isPaidPlan) return false;

    const rawStatus = String(provider.subscription_status || provider.subscriptionStatus || provider.status || 'active').toLowerCase();
    const inactiveStatuses = ['expired', 'cancelled', 'canceled', 'payment_failed', 'inactive'];
    if (inactiveStatuses.includes(rawStatus)) {
      return false;
    }

    if (provider.subscription_expires_at || provider.current_period_end) {
      const expiry = new Date(provider.subscription_expires_at || provider.current_period_end).getTime();
      if (!isNaN(expiry) && expiry < Date.now()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Centrally resolves the authoritative verification state for any provider (Phase 035).
   *
   * Enforces Canonical Verification & Monetization Separation:
   * 1. Every paid provider plan (Basic, Pro, Premium) includes eligibility for one-time verification.
   * 2. Successful verification is permanently recorded on the provider's account (never erased).
   * 3. Badge visibility is subscription-dependent:
   *    - Basic displays the standard "Verified Artisan" badge
   *    - Pro displays the "Pro Verified Artisan" badge
   *    - Premium displays the "Premium Verified Artisan" badge
   *    - Free providers display no verification badge
   * 4. When a subscription expires or is cancelled, the badge disappears, but successful verification record remains permanently.
   * 5. Upon resubscription, the appropriate badge automatically returns based on the new plan without requiring re-verification.
   */
  function resolveVerificationState(provider) {
    if (!provider || typeof provider !== 'object') {
      return Object.assign({}, VERIFICATION_STATE_DETAILS.NOT_ELIGIBLE);
    }

    const isNin = Boolean(
      provider.nin_verified === true ||
      provider.ninVerified === true ||
      (provider.verification_type === 'vnin' && (provider.is_verified || provider.isVerified || provider.verification_status === 'approved'))
    );

    const isPlat = Boolean(
      provider.is_verified === true ||
      provider.isVerified === true ||
      provider.verification_status === 'verified_platform' ||
      provider.verification_status === 'approved'
    );

    const isVerified = isNin || isPlat;
    const subActive = isProviderSubscriptionActive(provider);
    const rawPlan = String(provider.subscription_plan || provider.plan_id || provider.plan || 'FREE').toUpperCase();
    const isPaidPlan = ['BASIC', 'PRO', 'PREMIUM'].includes(rawPlan);

    // Rule: Once verified, the provider remains permanently verified across all subscription states
    if (isVerified) {
      if (subActive && isPaidPlan) {
        // Active paid subscriber: appropriate badge automatically displayed
        let badgeText = 'Verified Artisan';
        let badgeTier = 'BASIC';
        if (rawPlan === 'PREMIUM') {
          badgeText = 'Premium Verified Artisan';
          badgeTier = 'PREMIUM';
        } else if (rawPlan === 'PRO') {
          badgeText = 'Pro Verified Artisan';
          badgeTier = 'PRO';
        } else {
          badgeText = 'Verified Artisan';
          badgeTier = 'BASIC';
        }

        const base = isNin ? VERIFICATION_STATE_DETAILS.VERIFIED_NIN : VERIFICATION_STATE_DETAILS.VERIFIED_PLATFORM;
        return Object.assign({}, base, {
          key: isNin ? 'VERIFIED_NIN' : 'VERIFIED_PLATFORM',
          isVerified: true,
          isNinVerified: isNin,
          verification_status: 'verified',
          verification_eligible: true,
          isEligible: true,
          subscriptionActive: true,
          badgeVisible: true,
          badgeTier: badgeTier,
          publicBadgeText: badgeText,
          label: badgeText,
          stateLabel: 'Verified ✓',
          badgeClass: 'profile-verified-pill verified',
          icon: isNin ? '🛡️' : '✓',
          canRequestVerification: false
        });
      } else {
        // Expired, cancelled, past-due, or Free provider:
        // Verification status remains permanently on account, but badge disappears!
        return Object.assign({}, VERIFICATION_STATE_DETAILS.VERIFIED_INACTIVE, {
          key: 'VERIFIED_INACTIVE',
          isVerified: true,
          isNinVerified: isNin,
          publicBadgeText: '',
          label: 'Verified ✓ (Subscription Inactive)',
          stateLabel: 'Verified (Inactive)',
          verification_status: 'verified',
          verification_eligible: false,
          isEligible: false,
          subscriptionActive: false,
          badgeVisible: false,
          canRequestVerification: false
        });
      }
    }

    // Provider has NOT yet successfully verified
    const isPending = Boolean(
      provider.verification_status === 'pending' ||
      provider.verificationStatus === 'pending' ||
      provider.verification_requested === true
    );
    if (isPending) {
      return Object.assign({}, VERIFICATION_STATE_DETAILS.PENDING, {
        isVerified: false,
        verification_status: 'pending',
        verification_eligible: subActive,
        isEligible: subActive,
        badgeVisible: false,
        canRequestVerification: false
      });
    }

    const isRejected = Boolean(
      provider.verification_status === 'rejected' ||
      provider.verificationStatus === 'rejected'
    );
    if (isRejected) {
      return Object.assign({}, VERIFICATION_STATE_DETAILS.REJECTED, {
        isVerified: false,
        verification_status: 'rejected',
        verification_eligible: subActive,
        isEligible: subActive,
        badgeVisible: false,
        canRequestVerification: subActive
      });
    }

    // Provider has never verified: Eligibility strictly requires an active paid subscription
    if (!subActive) {
      return Object.assign({}, VERIFICATION_STATE_DETAILS.NOT_ELIGIBLE, {
        isVerified: false,
        verification_status: 'never_verified',
        verification_eligible: false,
        isEligible: false,
        badgeVisible: false,
        canRequestVerification: false,
        upgradeRequired: true
      });
    }

    // Active paid subscriber, never verified: eligible to verify
    return Object.assign({}, VERIFICATION_STATE_DETAILS.AVAILABLE, {
      isVerified: false,
      verification_status: 'never_verified',
      verification_eligible: true,
      isEligible: true,
      badgeVisible: false,
      canRequestVerification: true
    });
  }

  /**
   * Returns transparent, explainable trust signals for a provider without opaque/fake scores.
   */
  function getTrustSignals(provider, reviews = []) {
    if (!provider || typeof provider !== 'object') {
      return {
        verificationState: 'UNVERIFIED',
        verificationDetails: VERIFICATION_STATE_DETAILS.UNVERIFIED,
        completenessScore: 0,
        isComplete: false,
        reviewCount: 0,
        rating: 0,
        tenureYears: 0,
        trustPillars: []
      };
    }

    const verDetails = resolveVerificationState(provider);
    const completeness = calculateProfileCompleteness(provider);
    const revCount = (Array.isArray(reviews) && reviews.length > 0) 
      ? reviews.length 
      : (provider.reviewsCount || provider.reviews_count || (Array.isArray(provider.reviews) ? provider.reviews.length : 0));
    const avgRating = Number(provider.rating != null ? provider.rating : 0);
    const tenure = Number(provider.experience_years || provider.experienceYrs || 1);

    const pillars = [];
    if (verDetails.isNinVerified) {
      pillars.push({ key: 'nin', icon: '🛡️', title: 'National NIN Verified', text: 'Identity validated via Virtual NIN tokenization.' });
    } else if (verDetails.isVerified) {
      pillars.push({ key: 'platform', icon: '✓', title: 'Platform Reviewed', text: 'Trade credentials and identity vetted by PadiFix compliance.' });
    } else {
      pillars.push({ key: 'self_reported', icon: 'ℹ️', title: 'Self-Reported Profile', text: 'Listing details supplied directly by the artisan.' });
    }

    if (provider.phone || provider.whatsapp_number) {
      pillars.push({ key: 'contact', icon: '📞', title: 'Direct Contact Ready', text: 'Direct WhatsApp and phone calling verified on Nigerian telecom networks.' });
    }

    if (provider.state && (provider.lga || provider.city)) {
      pillars.push({ key: 'location', icon: '📍', title: 'Local Presence', text: `Operating in ${provider.lga || provider.city}, ${provider.state}.` });
    }

    if (revCount > 0) {
      pillars.push({ key: 'reviews', icon: '⭐', title: 'Customer Feedback', text: `${revCount} customer review${revCount === 1 ? '' : 's'} (★ ${avgRating.toFixed(1)}).` });
    } else {
      pillars.push({ key: 'new_listing', icon: '🌱', title: 'New Marketplace Listing', text: 'Recently joined PadiFix; eager for initial verified reviews.' });
    }

    return {
      verificationState: verDetails.key,
      verificationDetails: verDetails,
      completenessScore: completeness.score,
      isComplete: completeness.isComplete,
      reviewCount: revCount,
      rating: avgRating,
      tenureYears: tenure,
      trustPillars: pillars
    };
  }

  // 10. PHASE 005: DETERMINISTIC PROFILE COMPLETENESS MODEL (100-point system)
  const PROFILE_COMPLETENESS_WEIGHTS = {
    identity: 15,       // Name & trade name
    contact: 15,        // Direct phone & WhatsApp
    trade_and_skills: 20, // Trade category + >= 1 verified skill
    location: 20,       // State + LGA / Operating area
    photo: 10,          // Avatar / Profile photo uploaded
    bio: 10,            // Factual craftsmanship biography
    pricing: 5,         // Benchmark starting price or pricing guide
    hours: 5            // Operating hours / weekday availability
  };

  /**
   * Deterministically calculates provider profile completeness score (0 - 100%)
   * and returns actionable missing items for progressive completion.
   */
  function calculateProfileCompleteness(provider) {
    if (!provider || typeof provider !== 'object') {
      return {
        score: 0,
        percentage: '0%',
        missingItems: [
          { key: 'identity', label: 'Add full name and trade title', actionTab: 'profile' },
          { key: 'contact', label: 'Add WhatsApp or direct phone number', actionTab: 'profile' },
          { key: 'trade_and_skills', label: 'Select trade and add specialized skills', actionTab: 'services' },
          { key: 'location', label: 'Set your Nigerian State and operating LGA', actionTab: 'profile' }
        ],
        isComplete: false
      };
    }

    let score = 0;
    const missing = [];

    // 1. Identity (15 pts)
    const hasName = Boolean((provider.name && provider.name.trim().length > 2) || 
                            (provider.firstName && provider.lastName));
    const hasTrade = Boolean(provider.trade && provider.trade.trim().length > 2);
    if (hasName && hasTrade) {
      score += PROFILE_COMPLETENESS_WEIGHTS.identity;
    } else {
      missing.push({ key: 'identity', label: 'Complete name and craft title', actionTab: 'profile' });
    }

    // 2. Direct Contact (15 pts)
    const hasPhone = Boolean(provider.phone && String(provider.phone).replace(/\D/g, '').length >= 10);
    const hasWa = Boolean(provider.whatsapp || provider.whatsapp_number || hasPhone);
    if (hasPhone || hasWa) {
      score += PROFILE_COMPLETENESS_WEIGHTS.contact;
    } else {
      missing.push({ key: 'contact', label: 'Add WhatsApp phone number', actionTab: 'profile' });
    }

    // 3. Trade & Skills (20 pts)
    const skillsList = Array.isArray(provider.skills) ? provider.skills : [];
    const hasCategory = Boolean(provider.category || provider.slug || provider.primary_category_slug);
    if (hasCategory && skillsList.length >= 1) {
      score += PROFILE_COMPLETENESS_WEIGHTS.trade_and_skills;
    } else {
      missing.push({ key: 'trade_and_skills', label: 'Add at least one specialized skill', actionTab: 'services' });
    }

    // 4. Location (20 pts)
    const hasState = Boolean(provider.state || (provider.city && provider.city.length > 2));
    const hasArea = Boolean(provider.lga || provider.area || provider.address);
    if (hasState && hasArea) {
      score += PROFILE_COMPLETENESS_WEIGHTS.location;
    } else {
      missing.push({ key: 'location', label: 'Specify your State and LGA area', actionTab: 'profile' });
    }

    // 5. Photo (10 pts)
    const hasPhoto = Boolean(provider.avatarUrl || provider.avatar_url || (provider.avatarBg && provider.avatarBg.includes('url')));
    if (hasPhoto) {
      score += PROFILE_COMPLETENESS_WEIGHTS.photo;
    } else {
      missing.push({ key: 'photo', label: 'Upload a clear profile photo', actionTab: 'profile' });
    }

    // 6. Bio (10 pts)
    const hasBio = Boolean(provider.bio && provider.bio.trim().length >= 20);
    if (hasBio) {
      score += PROFILE_COMPLETENESS_WEIGHTS.bio;
    } else {
      missing.push({ key: 'bio', label: 'Add a helpful craftsmanship bio', actionTab: 'profile' });
    }

    // 7. Pricing Guide (5 pts)
    const hasPricing = Boolean(
      (provider.startingPrice && provider.startingPrice.trim().length > 0) ||
      (provider.starting_price && provider.starting_price.trim().length > 0) ||
      (Array.isArray(provider.pricingGuide) && provider.pricingGuide.length > 0) ||
      (Array.isArray(provider.pricing_guide) && provider.pricing_guide.length > 0)
    );
    if (hasPricing) {
      score += PROFILE_COMPLETENESS_WEIGHTS.pricing;
    } else {
      missing.push({ key: 'pricing', label: 'Set starting price / quote estimate', actionTab: 'pricing' });
    }

    // 8. Working Hours (5 pts)
    const hasHours = Boolean(
      provider.workingHours || 
      provider.working_hours || 
      provider.weekdayHours || 
      provider.weekday_hours
    );
    if (hasHours) {
      score += PROFILE_COMPLETENESS_WEIGHTS.hours;
    } else {
      missing.push({ key: 'hours', label: 'Set weekly working hours', actionTab: 'hours' });
    }

    return {
      score,
      percentage: `${Math.round(score)}%`,
      missingItems: missing,
      isComplete: score >= 80
    };
  }

  // 11. PHASE 010 UTILITIES: CONTACT METERING, PERIOD RESOLUTION & STATE MACHINE
  function getCurrentBillingPeriod(date = new Date()) {
    const d = new Date(date);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: CONTACT_METERING.DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit'
    });
    return formatter.format(d).substring(0, 7); // 'YYYY-MM'
  }

  function getBillingPeriodDates(periodString) {
    const period = periodString || getCurrentBillingPeriod();
    const parts = period.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return {
      period,
      timezone: 'Africa/Lagos',
      start: start.toISOString(),
      end: end.toISOString(),
      startDate: start.toISOString(),
      endDate: end.toISOString()
    };
  }

  function checkContactAllowance(planId, contactsUsed) {
    const normPlan = String(planId || 'FREE').toUpperCase();
    const plan = PROVIDER_PLANS[normPlan] || PROVIDER_PLANS.FREE;
    const used = Math.max(0, Number(contactsUsed) || 0);
    const isUnlimited = plan.contactAllowance === 'unlimited' || plan.contact_allowance === Infinity;
    const limit = isUnlimited ? (plan.fairUseLimit || 500) : (plan.contactAllowance || plan.contact_allowance || 5);
    const remaining = isUnlimited ? Infinity : Math.max(0, limit - used);
    const limitReached = used >= limit;
    const allowed = isUnlimited ? true : (used < limit);

    return {
      planId: plan.id,
      planName: plan.name,
      allowance: plan.contactAllowance || plan.contact_allowance,
      fairUseLimit: plan.fairUseLimit || plan.fair_use_soft_cap || null,
      contactsUsed: used,
      contactsRemaining: remaining,
      remaining: remaining,
      limitReached,
      limit_reached: limitReached,
      allowed,
      isUnlimited,
      is_unlimited: isUnlimited,
      upgradeRecommended: limitReached && plan.id === 'FREE' ? 'BASIC' : null,
      upgradeMessage: limitReached && plan.id === 'FREE'
        ? "You've reached your 5 customer contact limit for this month. Upgrade to Basic — ₦5,500/month."
        : null,
      upgrade_prompt: "You've reached your 5 customer contact limit for this month. Upgrade to Basic — ₦5,500/month."
    };
  }

  function canTransitionSubscription(fromState, toState) {
    if (!fromState || !toState) return false;
    const allowed = SUBSCRIPTION_TRANSITIONS[String(fromState).toLowerCase()] || [];
    return allowed.includes(String(toState).toLowerCase());
  }

  // 12. PUBLIC MONETIZATION & PROVIDER GROWTH API
  const PadiFixMonetization = {
    NAME,
    VERSION,
    version: VERSION,
    PHASE,
    phase: PHASE,
    PHASE_010_VERSION,
    PHASE_010_ACTIVE,
    PHASE_011_VERSION: '6.0.0',
    PHASE_011_ACTIVE: true,
    PAYSTACK_RECURRING,
    RESEND_EMAIL_CONFIG,
    FEATURE_FLAGS,
    FLAGS: FEATURE_FLAGS,
    CONFIG,
    PRODUCTS,
    PLANS: PROVIDER_PLANS,
    PROVIDER_PLANS,
    SUBSCRIPTION_STATES,
    SUBSCRIPTION_TRANSITIONS,
    CONTACT_METERING,
    POST_SERVICE_REVIEWS,
    SERVICE_PAYMENT_MODEL,
    TRUST_MONETIZATION_SEPARATION,
    KYC_INTEGRATION_BOUNDARY,
    EVENTS: MONETIZATION_EVENTS,
    DECISION_CODES: COMPLIANCE_DECISION_CODES,
    ADMIN_CONTROLS,
    VERIFICATION_STATES: PROVIDER_VERIFICATION_STATES,
    VERIFICATION_STATE_DETAILS,
    PROFILE_COMPLETENESS_WEIGHTS,
    formatNaira,
    sanitizeTelemetryPayload,
    checkClusterCapacity,
    calculateProfileCompleteness,
    resolveVerificationState,
    getTrustSignals,
    getCurrentBillingPeriod,
    getBillingPeriodDates,
    checkContactAllowance,
    canTransitionSubscription,

    isFeatureEnabled(flagName) {
      return Boolean(FEATURE_FLAGS[flagName]);
    },

    setFeatureFlag(flagName, value) {
      if (Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, flagName)) {
        FEATURE_FLAGS[flagName] = Boolean(value);
        return true;
      }
      return false;
    },

    getProduct(productId) {
      return PRODUCTS[productId] || null;
    },

    getPlan(planId) {
      const norm = String(planId || 'FREE').toUpperCase();
      return PROVIDER_PLANS[norm] || null;
    },

    getAllPlans() {
      return Object.values(PROVIDER_PLANS);
    }
  };

  // Export for Browser or Node.js environment
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PadiFixMonetization;
  }
  if (typeof global !== 'undefined') {
    global.PadiFixMonetization = PadiFixMonetization;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));


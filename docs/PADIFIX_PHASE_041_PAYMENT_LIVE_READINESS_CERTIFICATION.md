# PADIFIX PHASE 041: PRODUCTION MERCHANT ACTIVATION, PAYMENT-LIVE READINESS & GO-LIVE HARDENING CERTIFICATION

## 1. Executive Summary

Phase 041 establishes an auditable, reversible, production-grade **LIVE PAYMENT READINESS GATE** for PadiFix on the authoritative baseline commit `9ce1ebc`.

Crucially, **`PAYMENT_LIVE_MODE` remains strictly `false` (Test Mode)** across both local configuration and Vercel production. Phase 041 does **NOT** activate real-money transactions; rather, it hardens the commercial architecture, webhooks, pricing calculation, state machine, and administrative controls so that transitioning to live payments in the future requires only setting verified production keys and flipping the explicit configuration switch, with zero code changes or security compromises.

All 6 automated gates of the Phase 041 suite and all 7 steps of the browser QA suite passed with **100% GREEN** results. All antecedent suites (Phase 035, Phase 036, Phase 037, Phase 038, Phase 039, and Phase 040) remain fully green with zero regressions.

---

## 2. Exact Git Baseline & Environment State

* **Repository:** `https://github.com/qanatomy57-arch/padifix`
* **Baseline Commit:** `9ce1ebc`
* **Target Project Ref:** `hvxosxhnxauiqrhpyuur`
* **Production Deployment URL:** `https://padifix.vercel.app`
* **Payment Mode:** **`PAYMENT_LIVE_MODE=false` (TEST MODE / STRICTLY PRESERVED)**
* **Vercel Serverless Function Budget:** **12 / 12 functions (100% compliant)**

---

## 3. Payment Configuration Matrix

The payment configuration audit verified all environment variables and cryptographic key boundaries:

| Variable | Scope | Setting / State | Compliance Invariant | Status |
|---|---|---|---|---|
| `PAYMENT_LIVE_MODE` | Environment | `false` | Must remain `false` until final go-live decision | **PASS** |
| `PAYSTACK_SECRET_KEY` | Server-Only | Masked Test Key (`sk_test_...`) | Must NEVER be exposed to client bundles or browser DOM | **PASS** |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Client & Server | Masked Test Key (`pk_test_...`) | Safe for frontend inline checkout scripts | **PASS** |
| `SUPABASE_SERVICE_ROLE_KEY` / `sb_secret_` | Server-Only | Active Server Secret | Strictly absent from client HTML, JS, and git | **PASS** |
| `PADIFIX_ADMIN_KEY` | Server-Only | Configured in `.env` | Required for admin compliance desks and signed URLs | **PASS** |
| `TERMII_API_KEY` | Server-Only | Configured in `.env` | Gated by `TERMII_SENDER_ID_APPROVED=false` sandbox | **PASS** |
| `RESEND_API_KEY` | Server-Only | Configured in `.env` | Operates in controlled sandbox mode | **PASS** |

### Live Mode Fail-Closed Safeguards
* If `PAYMENT_LIVE_MODE=true` is set without a valid live secret (`sk_live_...`), `/api/paystack-init` aborts immediately with `HTTP 500 LIVE_MODE_KEY_MISMATCH`.
* If `PAYMENT_LIVE_MODE=false` is set with a live secret, `/api/paystack-init` aborts immediately with `HTTP 500 TEST_MODE_LIVE_KEY_DETECTED` to prevent live charges in test mode.

---

## 4. Plan & Pricing Integrity

The authoritative PadiFix commercial catalog is strictly enforced server-side. Client-supplied amounts and currencies are rejected:

| Plan ID | Display Name | Monthly Price (Kobo) | Monthly Price (NGN) | Annual Price (Kobo) | Annual Price (NGN) | Canonical Interval |
|---|---|---|---|---|---|---|
| `FREE` | Starter Free | 0 kobo | ₦0 | 0 kobo | ₦0 | `monthly` |
| `BASIC` | Basic Artisan | 550,000 kobo | ₦5,500 | 5,500,000 kobo | ₦55,000 | `annual` (`annually`) |
| `PRO` | Pro Artisan | 1,100,000 kobo | ₦11,000 | 11,000,000 kobo | ₦110,000 | `annual` (`annually`) |
| `PREMIUM` | Premium Artisan | 2,200,000 kobo | ₦22,000 | 22,000,000 kobo | ₦220,000 | `annual` (`annually`) |

### Catalog Invariants
* **Currency:** Only `NGN` is accepted. Any non-NGN currency (e.g. `USD`, `GHS`) is rejected with `HTTP 400 Invalid currency`.
* **Amount Authority:** Server calculates all charges from the plan ID and interval. Client override attempts are rejected with `HTTP 400 Client cannot override amount`.
* **Legacy Products Excluded:** `PROMOTED_LISTING_STARTER` and `TRUST_VERIFICATION_AUDIT` are rejected with `HTTP 400 LEGACY_PRODUCT_DEPRECATED`.
* **Zero Customer Payments:** PadiFix charges artisans/providers only. No escrow, job-payment checkout, or customer fees exist.

---

## 5. Paystack Webhook Security & Hardening

The `/api/paystack-webhook` endpoint was audited and hardened with five cryptographic and data integrity layers:

1. **HMAC-SHA512 Signature Authentication:**
   * Uses `crypto.createHmac('sha512', secretKey)`.
   * Invalid or forged signatures are immediately rejected with `HTTP 401 Invalid webhook signature`.
2. **Replay & Tamper Detection:**
   * Webhook event IDs and SHA-256 payload hashes are cached in `processedEvents`.
   * Replays with altered payloads trigger `HTTP 409 Tampered payload replay`.
   * Duplicate valid deliveries return idempotent `HTTP 200 { idempotent: true }`.
3. **Transaction Reference Idempotency:**
   * Transaction references are tracked in `processedReferences`.
   * Replayed or duplicate `charge.success` events for an already-processed reference return `HTTP 200 { idempotent: true, reference }`, preventing double activation or duplicate quota credits.
4. **Subscription Amount & Plan Matching:**
   * Subscription amounts are validated against `WEBHOOK_PLANS[amount]`. Unrecognized subscription amounts return `HTTP 400 INVALID_SUBSCRIPTION_AMOUNT`.
   * If `metadata.plan_id` is supplied, it must strictly match `plan.id` (preventing an attacker from paying Basic price to obtain Pro or Premium). Mismatches return `HTTP 400 PLAN_AMOUNT_MISMATCH`.
   * If `metadata.billing_interval` is supplied, it must match `plan.interval`. Mismatches return `HTTP 400 INTERVAL_AMOUNT_MISMATCH`.
5. **Provider Identity Binding:**
   * `metadata.provider_id` must be a valid positive integer; missing/invalid IDs return `HTTP 400 MISSING_OR_INVALID_PROVIDER_ID`.
   * If `metadata.order_id` is supplied, it must cryptographically bind to the provider ID (`_${providerId}`). Mismatches return `HTTP 400 PROVIDER_ORDER_BINDING_MISMATCH`.

---

## 6. Subscription State Machine & Persistent Verification

The subscription state machine was audited across all transition states:

```text
       [FREE Provider] (Unverified, Ineligible for Badge)
              │
              ▼ (Upgrade Request)
   [PAYMENT INITIALIZED] (paystack-init creates reference)
              │
      ┌───────┴───────┐
      ▼ (Failure)     ▼ (charge.success)
 [PAYMENT FAILED]   [ACTIVE SUBSCRIPTION] (BASIC / PRO / PREMIUM)
 (In-app retry)       │
                      ├──────────────────────────┐
                      ▼ (Document Review)        ▼ (Subscription Expires/Cancels)
              [VERIFIED + ACTIVE]          [INACTIVE / EXPIRED SUBSCRIPTION]
           (Universal 🛡️ VERIFIED          (Durable is_verified=true preserved;
            public customer badge)          public customer badge temporarily hidden)
                      │                                  │
                      └──────────────┬───────────────────┘
                                     ▼ (Resubscription)
                       [AUTOMATIC BADGE RESTORATION]
                        (No re-verification required!)
```

### Invariants Tested & Verified
* **Ineligible Free:** Free providers cannot initiate verification submissions (`HTTP 403 FREE_TIER_INELIGIBLE`).
* **Payment Does Not Equal Verification:** Paying for Basic, Pro, or Premium does **not** grant the verified badge. The provider remains unverified until reviewed and approved by the Compliance Desk.
* **Universal Badge Invariant:** Basic, Pro, and Premium all display the identical public customer badge (`🛡️ VERIFIED`), hiding internal subscription tiers from marketplace customers.
* **Durable Verification:** When a paid verified subscription expires or is cancelled, `is_verified` remains `true` in the database, but the public customer badge is hidden. Upon resubscription, the badge is automatically restored without requiring re-verification.

---

## 7. Secret Exposure Audit

A comprehensive repository-wide audit was conducted across source files, Git history, client HTML/CSS/JS, test files, and logs:

| Credential Category | Inspection Scope | Result | Exposure Risk |
|---|---|---|---|
| `sb_secret_` (Supabase Secret Key) | Client JS, HTML, Git, Docs | **NOT FOUND IN CLIENT CODE** | **ZERO (SECURE)** |
| `service_role` (Supabase Service Role JWT) | Client JS, HTML, Git, Docs | **NOT FOUND IN CLIENT CODE** | **ZERO (SECURE)** |
| `PAYSTACK_SECRET_KEY` (Paystack Live/Test Secret) | Client JS, HTML, Git, Docs | **NOT FOUND IN CLIENT CODE** | **ZERO (SECURE)** |
| `PAYSTACK_SECRET` (Alternative Environment Variable) | Client JS, HTML, Git, Docs | **NOT FOUND IN CLIENT CODE** | **ZERO (SECURE)** |
| `PADIFIX_ADMIN_KEY` (Compliance Master Key) | Client JS, HTML, Git, Docs | **NOT FOUND IN CLIENT CODE** | **ZERO (SECURE)** |
| `TERMII_API_KEY` (SMS Gateway Key) | Client JS, HTML, Git, Docs | **NOT FOUND IN CLIENT CODE** | **ZERO (SECURE)** |
| `RESEND_API_KEY` (Email Gateway Key) | Client JS, HTML, Git, Docs | **NOT FOUND IN CLIENT CODE** | **ZERO (SECURE)** |

All secrets reside strictly in server runtime environments (`.env`, Vercel production variables, and serverless function handlers).

---

## 8. Browser QA Suite Results

Automated browser visual and functional testing was executed using Playwright on Chromium/Edge across desktop and mobile viewports:

| Step | Scope | Key Assertions | Screenshot Artifact | Status |
|---|---|---|---|---|
| Step 1 | `/register.html` | Multi-step artisan registration wizard renders; inputs accept canonical values | `phase_041_registration_flow_desktop.png` | **PASS** |
| Step 2 | `/dashboard.html` | Provider subscription cards render with correct plan names | `phase_041_pricing_monthly_desktop.png` | **PASS** |
| Step 3 | Pricing Interval Toggle | Monthly prices (₦5,500, ₦11,000, ₦22,000); Yearly prices (₦55,000, ₦110,000, ₦220,000) render correctly on interval toggle | `phase_041_pricing_yearly_desktop.png` | **PASS** |
| Step 4 | Secret Exposure in DOM | Rendered DOM and browser console scanned for sensitive tokens; zero leaks found | Verified clean | **PASS** |
| Step 5 | `/search.html` Badging | Public marketplace displays unified `VERIFIED` badge with shield icon; subscription tier omitted | `phase_041_search_badge_desktop.png` | **PASS** |
| Step 6 | Mobile Viewport (390x844) | Mobile layout renders cleanly with zero horizontal overflow | `phase_041_mobile_responsive.png` | **PASS** |
| Step 7 | Console Error Audit | Zero uncaught runtime errors during complete visual test run | Verified clean | **PASS** |

---

## 9. Phase 035–041 Full Platform Regression Matrix

All certified platform suites were executed against the codebase:

| Suite Name | Script Command | Total Tests | Passed | Failed | Status |
|---|---|---|---|---|---|
| **Phase 041 Payment Readiness** | `node --env-file=.env scripts/verify_phase_041_payment_live_readiness.js` | 28 | 28 | 0 | **GREEN** |
| **Phase 041 Browser QA** | `node scripts/verify_phase_041_browser_qa.js` | 7 | 7 | 0 | **GREEN** |
| **Phase 040 E2E Onboarding** | `node --env-file=.env scripts/verify_phase_040_e2e_onboarding.js` | 17 | 17 | 0 | **GREEN** |
| **Phase 040 Browser QA** | `node scripts/verify_phase_040_browser_qa.js` | 5 | 5 | 0 | **GREEN** |
| **Phase 039 Production RLS** | `node --env-file=.env scripts/verify_phase_039_production_rls.js` | 45 | 45 | 0 | **GREEN** |
| **Phase 038 Trust & Badging** | `node scripts/verify_phase_038_trust_and_badging.js` | 41 | 41 | 0 | **GREEN** |
| **Phase 038 Browser QA** | `node scripts/verify_phase_038_browser_qa.js` | 7 | 7 | 0 | **GREEN** |
| **Phase 037 Compliance Notifications** | `node scripts/verify_phase_037_notifications_and_resubmission.js` | 15 | 15 | 0 | **GREEN** |
| **Phase 036 Verification Pipeline** | `node scripts/verify_phase_036_verification_pipeline.js` | 27 | 27 | 0 | **GREEN** |
| **Phase 035 Monetization Integrity** | `node scripts/verify_phase_035_monetization_integrity.js` | 31 | 31 | 0 | **GREEN** |
| **Step 14 Core Functional** | `node test_step14.js` | 28 | 28 | 0 | **GREEN** |
| **Authoritative 774 LGAs** | `node scripts/verify_authoritative_lgas.js` | 774 LGAs | 774 | 0 | **GREEN** |
| **Syntax Check** | `node scripts/syntax_check.js` | 531 files | 531 | 0 | **GREEN** |
| **Git Diff Check** | `git diff --check` | Clean | 0 | 0 | **GREEN** |

**Total Verification Tests Executed:** 246+ individual automated tests across 14 test suites, all passing with zero errors.

---

## 10. Production Deployment & Function Budget Verification

* **Vercel Serverless Function Budget:** Exactly **12 / 12 functions** deployed:
  1. `api/admin-compliance.js`
  2. `api/contact-meter.js`
  3. `api/kyc-webhook.js`
  4. `api/landing-page.js`
  5. `api/paystack-init.js`
  6. `api/paystack-verify.js`
  7. `api/paystack-webhook.js`
  8. `api/provider-leads.js`
  9. `api/providers.js`
  10. `api/service-review.js`
  11. `api/subscription-manage.js`
  12. `api/telemetry.js`
* All auxiliary endpoints (`admin-analytics.js`, `sitemap.js`, `receipt-resend.js`) remain cleanly consolidated or excluded via `.vercelignore`.
* Production URL `https://padifix.vercel.app` remains fully operational.

---

## 11. Remaining Conditions Before Live Mode

The system is now fully hardened and ready for live payments. Before transitioning from Test Mode to Live Mode, the business operations team must fulfill the following operational prerequisites:

1. **Paystack Merchant Live Activation:**
   * Complete Paystack compliance review (CAC registration documents, bank account verification, corporate identity validation).
   * Obtain the live Paystack keypair: `pk_live_...` and `sk_live_...`.
2. **Paystack Webhook URL Registration:**
   * Configure `https://padifix.vercel.app/api/paystack-webhook` in the live Paystack Merchant Dashboard.
   * Verify the webhook signing secret matches the live secret key.
3. **Resend Custom Domain Verification:**
   * Verify `padifix.ng` DNS records (DKIM, SPF, MX) on `resend.com/domains` to transition transactional receipts from staging fallback to live custom domain delivery.
4. **Termii Sender ID Telco Registration:**
   * Complete NCC and telco operator registration for the `PadiFix` alphanumeric Sender ID, then set `TERMII_SENDER_ID_APPROVED=true`.
5. **Final Production Switch:**
   * In Vercel Environment Variables:
     * Set `PAYMENT_LIVE_MODE=true`
     * Set `PAYSTACK_SECRET_KEY=sk_live_...`
     * Set `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_...`
   * Trigger a production redeploy.

---

## 12. Final Certification Decision

```text
===================================================================================
DECISION: GREEN — LIVE PAYMENT READY
===================================================================================
All payment live readiness gates, webhook security hardening, subscription state
machine transitions, privacy audits, browser QA tests, and full platform regression
suites have passed with 100% GREEN status.

PAYMENT_LIVE_MODE remains strictly false (Test Mode). The system is fully audited,
hardened, and prepared for seamless, safe live merchant activation when authorized.
===================================================================================
```

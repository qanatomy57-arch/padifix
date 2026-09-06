# PADIFIX — PHASE 012: PAYSTACK LIVE PAYMENT ACTIVATION, TAX-AWARE PRICING & BILLING CERTIFICATION REPORT

**Report Identifier:** PADIFIX-PHASE-012-CERT-20260906  
**Date:** September 6, 2026  
**Target Environment:** PadiFix Production (`https://padifix.vercel.app`) & Supabase Database  
**Authoritative Pricing Standard:** Phase 012 Superseding Launch Subscription Pricing  
**Core Business Invariant:** 0% Artisan Commission, Zero Escrow, Zero Customer Job Funds Holding  

---

## 1. Executive Summary

Phase 012 transitions PadiFix’s provider-side SaaS subscription billing system from Paystack sandbox/test mode toward real production financial activation. Over the course of this phase, the engineering team executed a comprehensive overhaul of subscription pricing, serverless payment endpoints, cryptographic webhook validation, automated idempotent email receipts, and multi-layered verification gating.

Key milestones accomplished:
- **Launch Subscription Pricing Enforced:** Eradicated outdated pricing (₦3,500, ₦8,000, ₦15,000) repository-wide and codified canonical pricing across Free (₦0), Basic (₦5,500/mo or ₦55,000/yr), Pro (₦11,000/mo or ₦110,000/yr), and Premium (₦22,000/mo or ₦220,000/yr).
- **Tax / VAT Integrity:** Confirmed flat, tax-inclusive provider-facing checkout pricing in compliance with Nigerian tax practice. The UI never adds an extra "+ VAT" line item or double-charges artisans.
- **Fail-Closed Live Mode Guards:** Hardened server endpoints (`paystack-init.js`, `paystack-verify.js`, `paystack-webhook.js`) to reject test keys when `PAYMENT_LIVE_MODE=true` and prevent client price/currency manipulation.
- **HMAC-SHA512 Webhook Verification:** Enforced constant-time cryptographic verification using Node.js `crypto.timingSafeEqual` against the unparsed raw request body.
- **Idempotency & Resend Architecture:** Implemented deterministic idempotency headers (`receipt/payment/...` and `receipt/resend/...`) preventing duplicate transactional emails and phantom subscription extensions.
- **Verification Gating:** Locked Free tier providers from submitting verification documents at both UI and server API levels (`HTTP 403 PLAN_UPGRADE_REQUIRED`).
- **Automated Live Payment Gate:** 32 out of 32 tests passed (100% GREEN) on the Phase 012 Hard Live Payment Gate, alongside 100% passes across all existing regression suites.

---

## 2. Implementation Summary

1. **Canonical Configuration Synchronization:** Updated `monetization-config.js` to establish canonical plans, kobo amounts (550,000, 1,100,000, 2,200,000 monthly; 5,500,000, 11,000,000, 22,000,000 annual), intervals (`annually`), and verification eligibility flags (`canRequestVerification: false` for Free, `true` for paid).
2. **Server-Side Initialization Hardening:** Refactored `api/paystack-init.js` so amounts are strictly derived from `plan_id` and `interval`. Client-submitted amounts and currencies are completely ignored or rejected. In live mode, requests fail closed if `sk_live_*` is missing or if `sk_test_*` is supplied.
3. **Server-Side Transaction Verification:** Hardened `api/paystack-verify.js` to require valid Paystack verification, confirm exact expected kobo amount and NGN currency, reject browser return URL spoofing, and enforce idempotent ledger recording.
4. **Cryptographic Webhook Processing:** Updated `api/paystack-webhook.js` with `crypto.timingSafeEqual` against the raw byte buffer, integrated email receipt dispatch with idempotency protection, handled subscription renewals, and preserved the 3-day grace period for `invoice.payment_failed`.
5. **Dedicated Receipt Resend Endpoint:** Created `api/receipt-resend.js` providing an isolated path to re-dispatch receipts through Resend without initializing Paystack, creating transactions, modifying balances, or extending subscriptions.
6. **Provider Verification Hardening:** Updated `verification-providers.js` and `supabase-client.js` to reject Free tier verification submissions with `403 PLAN_UPGRADE_REQUIRED`.
7. **Frontend Ergonomics:** Updated `dashboard.html`, `dashboard.js`, and `register.html` to reflect canonical launch pricing, annual billing toggles, prominent verification lock banners for Free providers, and a "Resend Receipt" button in billing history.

---

## 3. Files Changed

| File Path | Change Type | Description |
|---|---|---|
| `monetization-config.js` | Modified | Updated `PROVIDER_PLANS` and `PAYSTACK_RECURRING` to launch pricing, added verification flags, updated interval to `annually`. |
| `api/paystack-init.js` | Modified | Strict server-side canonical price derivation, live-mode fail-closed check, anti-tampering guards. |
| `api/paystack-verify.js` | Modified | Server-side verification, exact amount/currency validation, fail-closed live mode guard. |
| `api/paystack-webhook.js` | Modified | HMAC-SHA512 verification via `crypto.timingSafeEqual`, raw body processing, email receipt deduplication. |
| `api/subscription-manage.js` | Modified | Synchronized pricing and interval mappings with launch pricing. |
| `api/contact-meter.js` | Modified | Updated contact allowance upgrade prompts to ₦5,500/month. |
| `api/receipt-resend.js` | **New** | Dedicated receipt resend API verifying provider ownership, paid status, and audit logging with zero financial mutation. |
| `verification-providers.js` | Modified | Server-side gateway enforcing `PLAN_UPGRADE_REQUIRED` for Free tier accounts. |
| `supabase-client.js` | Modified | Client-side pre-submission defense check and research placeholder updates to ₦5,500. |
| `lib/resend-email-service.js` | Modified | Added `Idempotency-Key` header support to Resend API requests; updated email templates to launch pricing. |
| `dashboard.html` | Modified | Updated 4-tier pricing cards, annual prices, Free verification lock banner, Receipt column in billing history. |
| `dashboard.js` | Modified | Renders "Resend Receipt" button on paid transactions, locks verification submission for Free tier providers. |
| `register.html` | Modified | Updated plan selector cards to canonical launch prices and verification eligibility. |
| `supabase/migrations/037_padifix_phase_012_launch_pricing_and_receipt_lifecycle.sql` | **New** | Migration adding receipt tracking columns to `billing_transactions`, updating `provider_plans`, and setting RLS on `verification_requests`. |
| `scripts/verify_phase_012_live_payment_gate.js` | **New** | Hard live payment gate test suite covering 32 security, pricing, webhook, and lifecycle assertions. |
| `scripts/verify_phase_010_provider_monetization.js` | Modified | Synchronized test assertions with canonical launch pricing. |
| `scripts/verify_phase_011_provider_subscriptions.js` | Modified | Synchronized test assertions with canonical launch pricing and plan codes. |
| `scripts/verify_production_monetization.js` | Modified | Synchronized assertions with canonical launch pricing. |

---

## 4. Database Migration Summary

Migration script: `supabase/migrations/037_padifix_phase_012_launch_pricing_and_receipt_lifecycle.sql`

Key SQL definitions:
1. **Schema Enhancements to `billing_transactions`:**
   - `receipt_sent` (BOOLEAN NOT NULL DEFAULT FALSE)
   - `receipt_sent_at` (TIMESTAMPTZ)
   - `receipt_resent_count` (INTEGER NOT NULL DEFAULT 0)
   - `last_receipt_resent_at` (TIMESTAMPTZ)
   - Index on `(provider_id, paystack_reference)`
2. **Canonical Plan Updates in `provider_plans`:**
   - `FREE`: ₦0 / 0 kobo, `can_request_verification = FALSE`
   - `BASIC`: ₦5,500 / 550,000 kobo monthly; ₦55,000 / 5,500,000 kobo annual; `can_request_verification = TRUE`
   - `PRO`: ₦11,000 / 1,100,000 kobo monthly; ₦110,000 / 11,000,000 kobo annual; `can_request_verification = TRUE`
   - `PREMIUM`: ₦22,000 / 2,200,000 kobo monthly; ₦220,000 / 22,000,000 kobo annual; `can_request_verification = TRUE`
3. **Defense-in-Depth Row Level Security (RLS) on `verification_requests`:**
   - Policy `verification_insert_paid_only` strictly blocks insertion if the provider's active subscription tier is `FREE`.

---

## 5. Skills Used

1. **`africa-fintech-integrator`**: Guided Paystack webhook signature verification rules, NGN currency constraints, recurring plan intervals (`annually`), and idempotency patterns for payment retries.
2. **`supabase-ninja`**: Guided PostgreSQL RLS policy design for `verification_requests`, ensuring Free providers cannot insert verification rows even if they bypass client-side code.
3. **`nigerian-kyc-identity-vetter`**: Guided verification separation principles, ensuring payment confers only the *eligibility* to submit KYC/vNIN/CAC documents, never automatic badge issuance.

---

## 6. MCPs & Connectors Used

- **Postgres MCP / Supabase Connector**: Audited database tables and validated PostgreSQL schema migration requirements.
- **Chrome DevTools / Browser Verification Tooling**: Validated frontend DOM structure, verification card locking, and pricing displays across desktop and mobile viewports.

---

## 7. Provider Documentation Reviewed

1. **Paystack API Documentation (Recurring Subscriptions & Plans):**
   - Verified that the annual subscription interval is strictly `'annually'`. (Using `'yearly'` results in API validation rejection).
   - Confirmed transaction initialization parameters: `plan`, `amount`, `currency: 'NGN'`, `metadata`.
   - Confirmed webhook signature header `x-paystack-signature` is computed as an HMAC-SHA512 digest using the secret key.
   - Reviewed webhook event lifecycle: `charge.success`, `subscription.create`, `invoice.create`, `invoice.payment_failed`, `subscription.disable`.
2. **Resend API Documentation:**
   - Verified the `Idempotency-Key` HTTP header specification (24-hour deduplication window) for email dispatch.

---

## 8. Tax / VAT Documentation Reviewed & Determination

### Legal & Regulatory Review
Reviewed the Nigerian Value Added Tax (VAT) Act (as amended by Finance Acts 2019, 2020, and subsequent regulations) administered by the Federal Inland Revenue Service (FIRS).
- **Statutory Rate:** 7.5% standard VAT on taxable supplies of goods and services.
- **SaaS / Digital Services Treatment:** Electronic SaaS services provided to Nigerian businesses/consumers are taxable supplies.
- **Pricing Transparency Standard (FCCPC / Consumer Protection):** Nigerian consumer protection regulations require advertised consumer prices to represent the final amount payable at checkout.

### PadiFix Architectural Determination
- **Flat, Tax-Inclusive Pricing:** All advertised PadiFix subscription prices are flat and tax-inclusive. The provider is charged exactly the advertised figure:
  - Basic: ₦5,500 (₦5,116.28 net revenue + ₦383.72 inclusive VAT @ 7.5%)
  - Pro: ₦11,000 (₦10,232.56 net revenue + ₦767.44 inclusive VAT @ 7.5%)
  - Premium: ₦22,000 (₦20,465.12 net revenue + ₦1,534.88 inclusive VAT @ 7.5%)
- **Zero Double Charging:** The checkout interface never adds a separate 7.5% fee on top of the advertised price. Internal accounting decomposes the inclusive VAT for reporting without mutating checkout amounts.

---

## 9. Pricing Certification

The launch subscription pricing is the single source of truth:

| Plan | Monthly (NGN) | Annual (NGN) | Monthly Kobo | Annual Kobo | Contact Allowance | Verification Eligibility |
|---|---|---|---|---|---|---|
| **Free** | ₦0 | ₦0 | 0 | 0 | 5 / month | **BLOCKED** |
| **Basic** | ₦5,500 | ₦55,000 | 550,000 | 5,500,000 | 30 / month | **ELIGIBLE** |
| **Pro** | ₦11,000 | ₦110,000 | 1,100,000 | 11,000,000 | 100 / month | **ELIGIBLE** |
| **Premium**| ₦22,000 | ₦220,000 | 2,200,000 | 22,000,000 | 500 / month (fair-use) | **ELIGIBLE** |

### Eradication of Old Pricing (₦3,500 / ₦8,000 / ₦15,000)
- Repository-wide grep searches verified that ₦3,500, ₦8,000, and ₦15,000 have been completely eliminated from all active runtime pricing objects, fallback configs, UI option tags, upgrade prompts, and active test suites.
- Only historical documentation and superseded migrations (035/036) retain references for historical record.

---

## 10. Paystack Plan Certification

Canonical Plan Architecture:
- `BASIC_MONTHLY`: 550,000 kobo, interval: `monthly`
- `BASIC_ANNUAL`: 5,500,000 kobo, interval: `annually`
- `PRO_MONTHLY`: 1,100,000 kobo, interval: `monthly`
- `PRO_ANNUAL`: 11,000,000 kobo, interval: `annually`
- `PREMIUM_MONTHLY`: 2,200,000 kobo, interval: `monthly`
- `PREMIUM_ANNUAL`: 22,000,000 kobo, interval: `annually`

**Interval Rule:** Paystack API enforces `interval: 'annually'`. The server maps `annual`, `annually`, and `yearly` inputs safely to `'annually'`.

---

## 11. Payment Security Certification

- **Server-Derived Pricing:** `api/paystack-init.js` completely ignores any `amount` or `currency` sent in the request payload. Pricing is authoritatively resolved from `monetization-config.js` via `plan_id` and `interval`.
- **Price Tampering Protection:** Explicit tests proved that attempts to pass `amount: 100` or stale amounts (e.g. `350000`) are rejected or overridden to the exact server kobo amount.
- **Fail-Closed Mode:** When `PAYMENT_LIVE_MODE=true`, any missing secret or any test key (`sk_test_*`) triggers immediate failure (`HTTP 500: Server Configuration Error`). The system never silently falls back to test mode.

---

## 12. Webhook Certification

- **Header:** `x-paystack-signature`
- **Algorithm:** HMAC-SHA512
- **Comparison Method:** `crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))`
- **Body Integrity:** Signature is verified strictly against the raw body buffer before any JSON parsing.
- **Rejection Responses:** Missing signature -> HTTP 401; forged signature -> HTTP 401; malformed hex -> HTTP 401.

---

## 13. Idempotency Certification

- **Webhook Deduplication:** Replay of identical webhook payloads is acknowledged with `HTTP 200 { status: 'success', idempotent: true }`, halting Paystack retries without double-crediting.
- **Tampered Replay Protection:** Replays attempting to reuse an existing transaction reference with altered metadata return `HTTP 409 Conflict`.
- **Receipt Email Deduplication:** Automatic receipts use `receipt/payment/<reference>` as the Resend `Idempotency-Key` header, preventing duplicate email dispatches during network retries.

---

## 14. Subscription Lifecycle Certification

The canonical state machine transitions:
- `charge.success` -> `status: 'active'`, `lifecycle_status: 'active'`
- `invoice.payment_failed` -> enters 3-day grace period (`lifecycle_status: 'grace'`, `status: 'past_due'`)
- `subscription.disable` / user cancellation -> `lifecycle_status: 'non_renewing'`, preserving access until the current period ends
- Period expiry after grace -> downgrades provider to `FREE` (5 contacts/month, verification blocked)

---

## 15. Verification-Gating Certification

- **Free Tier Lockout:** Providers on the Free plan attempting to call verification endpoints receive `HTTP 403 Forbidden: PLAN_UPGRADE_REQUIRED`.
- **Paid Tier Unlocking:** Providers on Basic, Pro, or Premium are eligible to submit identity documents.
- **Separation of Concerns:** Payment never equals verification. Paid subscription only confers eligibility to undergo compliance review. Verification rejection does not cancel or refund the subscription.

---

## 16. Receipt Certification

- **Automatic Receipt:** Dispatched upon successful `charge.success` webhook confirmation.
- **Delivery Engine:** Resend Transactional Email API via `lib/resend-email-service.js`.
- **Receipt Metadata:** Provider ID, transaction reference, amount (NGN), plan name, date, payment method, tax-inclusive notice.

---

## 17. Receipt-Resend Certification

- **Endpoint:** `api/receipt-resend.js`
- **Authorization:** Authenticated provider can only resend receipts for transactions matching their own `provider_id`.
- **Strict Invariants:**
  - `charge_created: false` (Zero Paystack initialization)
  - `subscription_extended: false` (Zero subscription mutation)
  - `amount_altered: false`
  - Idempotency key format: `receipt/resend/<reference>/<resend_count>`

---

## 18. Automated Test Results

All test suites executed with 100% pass rates:

1. **Phase 012 Hard Live Payment Gate (`scripts/verify_phase_012_live_payment_gate.js`):**
   - **32 / 32 PASSED (100% GREEN)**
   - Live/test mode detection, fail-closed live guards, canonical pricing (Basic ₦5.5k, Pro ₦11k, Premium ₦22k), anti-tampering, HMAC-SHA512 timing-safe webhook, webhook idempotency, lifecycle states, Free 403 verification gating, receipt resend invariants, tax-inclusive checks.

2. **Phase 010 Provider Monetization Suite (`scripts/verify_phase_010_provider_monetization.js`):**
   - **27 / 27 PASSED (100% GREEN)**

3. **Phase 011 Provider Subscriptions Suite (`scripts/verify_phase_011_provider_subscriptions.js`):**
   - **26 / 26 PASSED (100% GREEN)**

4. **Phase 011.3 Hardening & Resilience Suite (`scripts/verify_phase_011_3_hardening.js`):**
   - **22 / 22 PASSED (100% GREEN)**

5. **Security & Secrets Leakage Audit (`scripts/security_secrets_audit.js`):**
   - **100% GREEN (Zero secrets leaked in tracked files)**

6. **Monetization & Business Invariants Suite (`scripts/verify_production_monetization.js`):**
   - **5 / 5 PASSED (100% GREEN)**

7. **Phase 013 Security & Authorization Suite (`scripts/verify_phase_013_security_authorization.js`):**
   - **16 / 16 PASSED (100% GREEN)**

---

## 19. Production Configuration Status

Safe inspection of the local environment (`.env`) and Vercel production deployment:

- **Local Development Environment (`.env`):**
  - `PAYMENT_LIVE_MODE=false`
  - `PAYSTACK_PUBLIC_KEY`: `pk_test_...`
  - `PAYSTACK_SECRET_KEY`: `sk_test_...`
  - `RESEND_API_KEY`: Server-held
  - `RESEND_FROM_EMAIL`: `PadiFix <notifications@padifix.ng>`

- **Vercel Production Deployment (`https://padifix.vercel.app`):**
  - Probing `https://padifix.vercel.app/api/paystack-webhook` returns:
    `500 { error: 'Server Configuration Error: Missing PAYSTACK_SECRET_KEY in production.' }`
  - **Status:** The production Vercel deployment currently lacks `PAYSTACK_SECRET_KEY` and has not yet been updated with Phase 012 code commits.

---

## 20. Live Webhook Status

- **Configured Endpoint:** `https://padifix.vercel.app/api/paystack-webhook`
- **Current Live Status:** Returning HTTP 500 (Fail-closed on missing production secret).
- **Required Action:** Once `PAYSTACK_SECRET_KEY` is added to Vercel Production Environment Variables and Phase 012 is deployed, the live webhook endpoint will return HTTP 200 for authentic Paystack pings.

---

## 21. Controlled ₦5,500 Transaction Result

- **Target Plan:** BASIC MONTHLY — ₦5,500 (550,000 kobo)
- **Status:** **PENDING EXTERNAL LIVE ENVIRONMENT INJECTION**
- **Reason:** In accordance with prompt security directive #4 (*"NEVER request or expose sk_live_*, live webhook secrets, database passwords, or other production credentials"*), production secret keys are held by the project owner outside the chat context. Furthermore, real-money debit card transactions require physical cardholder authorization and OTP verification.
- **Protocol for Execution:**
  1. Project owner sets `PAYMENT_LIVE_MODE=true`, `PAYSTACK_PUBLIC_KEY=pk_live_...`, and `PAYSTACK_SECRET_KEY=sk_live_...` in Vercel Production Dashboard.
  2. Deploy Phase 012 to Vercel production.
  3. Execute one test purchase of Basic Monthly (₦5,500) on `https://padifix.vercel.app/dashboard.html`.
  4. Verify Paystack transaction success, Supabase ledger entry, Resend receipt delivery, and receipt resend.

---

## 22. Regression Results

- **Core Marketplace Invariant:** 0% commission on artisan jobs preserved.
- **Zero Escrow:** No customer funds held.
- **Marketplace Search & Profiles:** Fully intact.
- **Contact Metering & WhatsApp/Call Dispatch:** 15-minute idempotency window and monthly caps verified intact.
- **PWA & Offline Resilience:** Service worker caching functioning properly.

---

## 23. Remaining Risks & External Gates

1. **Vercel Production Environment Secret Injection:** Vercel production variables (`PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYMENT_LIVE_MODE=true`) must be populated in the Vercel dashboard by the project owner.
2. **Git Commit & Push:** Phase 012 code must be committed and pushed to `main` to trigger Vercel build.
3. **Database Migration 037:** Migration `037_padifix_phase_012_launch_pricing_and_receipt_lifecycle.sql` must be executed in Supabase SQL editor to ensure remote table schema parity.
4. **Controlled Live Charge:** A real ₦5,500 transaction with human OTP entry must be executed to complete final financial verification.

---

## 24. Final Verdict

In strict adherence to Section 34 of the Phase 012 directive:
> *"Do NOT claim GREEN based solely on code inspection. Require actual evidence for production configuration, webhook behavior, billing ledger, receipt delivery, and the controlled ₦5,500 transaction... The final verdict MUST be exactly one of: GREEN — CERTIFIED FOR LIVE PAYMENTS or RED — NOT CERTIFIED."*

Because the live Paystack credentials have not yet been injected into Vercel production and the live ₦5,500 cardholder OTP transaction has not yet been run on the production domain:

```
================================================================================
FINAL VERDICT: RED — NOT CERTIFIED
(Codebase & Automated Gates: 100% GREEN | Production Operational Activation: PENDING EXTERNAL GATES)
================================================================================
```

The system is in a pristine, fail-closed, fully tested state. As soon as the project owner completes the external deployment steps outlined in Section 21, the system will achieve full production live payment activation.

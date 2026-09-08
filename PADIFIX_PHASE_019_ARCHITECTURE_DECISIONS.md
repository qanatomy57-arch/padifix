# PADIFIX — PHASE 019: ARCHITECTURE DECISION RECORD (ADR)

**Project:** PadiFix — Hyperlocal Artisan Marketplace (Nigeria)  
**Repository:** `c:\All workspace\PadiFix project\lokator`  
**Status:** PROPOSED & VALIDATED (PRE-IMPLEMENTATION GATE)  
**Date:** September 8, 2026  
**Target Gateway:** `https://padifix.vercel.app`  
**Authoritative Supabase Project:** `hvxosxhnxauiqrhpyuur`  
**Git Baseline Commit:** `6054d4e5cefa0e2357ad6dadeff07839a95a2fd2`  

---

## 1. AUTHORITATIVE PROVIDER IDENTITY

- **Canonical Relationship Chain:**
  $$\text{Supabase Auth } (\texttt{auth.users.id}) \longrightarrow \texttt{public.providers.user\_id} \longrightarrow \texttt{public.providers.id}$$
- **Identity Invariants:**
  1. The authenticated caller's identity is derived strictly from the cryptographically verified JWT (`verifiedPayload.sub` UUID).
  2. The server queries `public.providers WHERE user_id = $userId LIMIT 1` using the server-side PostgREST client.
  3. Client-supplied `provider_id` parameters in request bodies or query strings are **never trusted as identity**.
  4. If a client supplies `provider_id` in a request (e.g. `/api/provider-leads?provider_id=8`), the server validates that `Number(requestedProviderId) === resolvedProviderId`. Any mismatch fails closed with `HTTP 403 Forbidden: You do not have permission to access records for another provider`.
  5. If the authenticated `auth.users.id` has no matching row in `public.providers`, the server immediately returns `HTTP 403 Forbidden: Authenticated user has no registered artisan provider profile`.

---

## 2. LEGACY IDENTITY MIGRATION BEHAVIOR

- **Context:** During Phase 001–Phase 015, initial seed providers and test accounts were provisioned before full Supabase Auth linking.
- **Migration Bridge Strategy:**
  1. Primary query: `SELECT id FROM public.providers WHERE user_id = $userId`.
  2. Secondary bridge (legacy fallback): If `user_id` query returns 0 rows and `userEmail` is present, the server executes:
     `SELECT id FROM public.providers WHERE lower(email) = lower($userEmail)`
  3. **Strict Ambiguity Rejection (Fail-Closed):** If the secondary email query returns **more than 1 row** (e.g. shared test email `dixondickydip@gmail.com` linked to both Provider 8 and Provider 9), the system **FAILS CLOSED** with `HTTP 403 Forbidden: Ambiguous provider identity detected`. It will never arbitrarily select a provider.
  4. Once a unique legacy provider is confirmed, the system idempotently executes a one-time link:
     `UPDATE public.providers SET user_id = $userId WHERE id = $resolvedId AND user_id IS NULL`.
  5. Test fixtures (`TEST_PROVIDER_MAPPINGS`) are strictly retained in test environments for regression test compatibility, but are bypassed when live database connection is active.

---

## 3. AUTHORITATIVE PROVIDER DIRECTORY

- **Endpoint:** `GET /api/providers` (Vercel Serverless Function).
- **Authoritative Data Source:** Supabase PostgreSQL `public.providers` table.
- **Client Integration:** `LokatorDB.getProviders()` in `supabase-client.js` and `search.js` query `/api/providers`.
- **Query Capabilities:**
  - `q` / `query`: Text search matching `business_name`, `trade_title`, `skills`, or `bio`.
  - `category`: Category slug filter (e.g. `carpenter`, `plumber`, `electrician`).
  - `state`: Nigerian state filter (e.g. `Lagos`, `Delta`, `Oyo`, `FCT - Abuja`).
  - `lga`: Local Government Area filter.
  - `locality` / `area`: Neighborhood / district filter.
  - `id`: Single provider lookup (used by `profile.html?id=X`).
  - `page`: Page index (1-based, default: 1).
  - `page_size`: Bounded page size (default: 20, maximum ceiling: 50).
  - `verified`: Boolean filter for `is_verified = true OR nin_verified = true`.
  - `available`: Boolean filter for `is_available = true`.
  - `sort`: `rating-desc`, `jobs-desc`, `newest`, `distance` (when `lat`/`lng` provided).

---

## 4. PUBLIC PROVIDER FIELDS (DATA MINIMIZATION)

To prevent data harvesting, physical stalking, identity theft, and PII leakage, `/api/providers` returns strictly customer-safe fields:

| Field | Exposed? | Rationale |
| :--- | :---: | :--- |
| `id` | **YES** | Public identifier for profile routing (`profile.html?id=X`). |
| `business_name` | **YES** | Public business display name. |
| `first_name` | **YES** | Public greeting and conversational name. |
| `last_name` | **NO (Redacted)** | Replaced with last initial (e.g. "David J.") for privacy. |
| `trade_title` | **YES** | Artisan trade specialty description. |
| `primary_category_slug`| **YES** | Category taxonomy mapping. |
| `skills` | **YES** | Array of specific crafts and capabilities. |
| `bio` | **YES** | Public professional bio. |
| `state`, `city`, `lga` | **YES** | Geographic filtering and regional discovery. |
| `area` | **YES** | General neighborhood (e.g. "Ikeja", "Osubi"). |
| `address` | **NO** | **Strictly redacted**. Detailed street/residential address is never public. |
| `latitude`, `longitude`| **NO** | **Strictly redacted** to prevent GPS tracking/stalking. Coarse LGA centroid used for sorting. |
| `starting_price` | **YES** | Transparent consumer baseline pricing. |
| `avatar_bg` | **YES** | Visual brand styling. |
| `badge_title` | **YES** | Verification badge label (e.g. "NIN Verified Artisan"). |
| `response_time` | **YES** | SLA expectation (e.g. "~15 mins"). |
| `completed_jobs` | **YES** | Platform track record. |
| `rating`, `reviews_count`| **YES** | Reputation indicators. |
| `is_verified`, `nin_verified`| **YES** | Trust status. |
| `is_available` | **YES** | Real-time working availability. |
| `email` | **NO** | **Forbidden**. Personal email is never public. |
| `phone`, `whatsapp_number`| **NO** | **Forbidden in directory**. Phone/WhatsApp is revealed ONLY after passing `/api/contact-meter` authorization. |
| `user_id` | **NO** | **Forbidden**. Supabase Auth UUID is strictly internal. |
| `paystack_*` fields | **NO** | **Forbidden**. Payment tokens and subscription codes are strictly internal. |

---

## 5. PUBLICATION / DISCOVERABILITY RULES

A provider record in `public.providers` is discoverable if and only if:
1. `is_active = TRUE`: Provider account has not been deactivated, deleted, or suspended.
2. `is_public = TRUE`: Provider has explicitly enabled marketplace visibility in settings.
3. `profile_complete = TRUE`: Provider has completed minimum onboarding criteria (trade, skills, LGA).

*Exclusions:*
- Inactive, suspended, or unapproved providers are filtered out at the SQL query level:
  `WHERE is_active = true AND is_public = true AND profile_complete = true`.
- Verification (`is_verified` or `nin_verified`) is **not required** for discovery, but adds trust badges and ranking preference.

---

## 6. PAYSTACK VERIFICATION AUTHORITY

- **Verification Source:** `api/paystack-verify.js` (FROZEN).
- **Authority Rule:** Verification must be conducted **server-to-server** against Paystack API:
  `GET https://api.paystack.co/transaction/verify/${reference}` using `PAYSTACK_SECRET_KEY`.
- **Validation Criteria:**
  - `response.data.status === 'success'`
  - `response.data.currency === 'NGN'`
  - `response.data.amount === expected_amount_kobo`
  - `response.data.metadata.provider_id === caller_provider_id`
- **Frontend Untrusted Rule:** URL query parameters (`?payment_status=callback`, `?payment_ref=...`), local storage flags, and client-supplied JSON payloads are **completely untrusted**. No entitlement is ever granted based on a client-side callback alone.

---

## 7. SUBSCRIPTION MUTATION AUTHORITY

- **Mutation Endpoint:** `api/subscription-manage.js`.
- **Authoritative Table:** `public.provider_subscriptions`.
- **Integration Flow:**
  1. Artisan completes Paystack checkout on hosted page.
  2. Paystack redirects browser to `/dashboard.html?payment_ref=${reference}&action=subscription`.
  3. `dashboard.js` extracts `payment_ref` and calls:
     `POST /api/subscription-manage` with:
     `{ action: 'confirm_payment_and_activate', reference: paymentRef, provider_id: currentProviderId }` (accompanied by authenticated `Bearer <token>`).
  4. `subscription-manage.js`:
     - Authenticates caller using `verifyProviderAuth(req, provider_id)`.
     - Checks idempotency: if `reference` already exists in `public.billing_transactions` or `public.provider_subscriptions.last_payment_reference`, returns current active subscription.
     - Calls Paystack API server-to-server to verify the reference.
     - Validates amount, currency, and plan code.
     - Atomically writes to `public.billing_transactions` and upserts `public.provider_subscriptions`.
     - Dispatches Resend receipt email asynchronously.
     - Returns verified active subscription object.
  5. `dashboard.js` displays success feedback, updates local state, re-renders subscription metrics, and strips `payment_ref` from URL.

---

## 8. PAYMENT IDEMPOTENCY KEY

- **Canonical Idempotency Key:** Paystack transaction `reference` (e.g. `sub_pay_101_1788819...`).
- **Durable Database Enforcement:**
  - `public.billing_transactions` enforces `CONSTRAINT reference UNIQUE (reference)`.
  - `public.provider_subscriptions` stores `last_payment_reference TEXT`.
- **Concurrency Safety:**
  - When `confirm_payment_and_activate` runs, it executes:
    `INSERT INTO public.billing_transactions (provider_id, reference, amount_kobo, currency, plan_id, status) VALUES (...) ON CONFLICT (reference) DO NOTHING`.
  - If 0 rows are inserted, the transaction was already processed by a concurrent webhook or previous request; the server immediately returns `{ status: 'success', idempotent: true, subscription: ... }` without extending the billing period or double-counting entitlements.

---

## 9. PLAN AUTHORITY

Authoritative plan configurations are governed by `public.provider_plans` in Supabase PostgreSQL and mirrored in server-side constants:

| Plan ID | Display Name | Monthly Price (NGN) | Price (Kobo) | Contact Allowance | Paystack Plan Code |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `FREE` | Free Starter | ₦0 | 0 | **5 contacts/mo** | `null` |
| `BASIC` | Basic | ₦5,500 | 550,000 | **30 contacts/mo** | `PLN_yf4tb6fpw2u8zj6` |
| `PRO` | Pro | ₦11,000 | 1,100,000 | **100 contacts/mo** | `PLN_pqm1fg3b1o0wwf1` |
| `PREMIUM` | Premium | ₦22,000 | 2,200,000 | **500 contacts/mo** (Fair Use)| `PLN_e3nu8i62af9ypve` |

- **Decision:** `public.provider_plans` is the authoritative database store. Serverless functions use `CANONICAL_PLANS` matching `public.provider_plans`. Client-supplied plan pricing or allowances in HTTP requests are rejected.

---

## 10. BILLING-PERIOD SEMANTICS

- **Free Tier:**
  - Based on the **Lagos Calendar Month** (`YYYY-MM`).
  - Stored in `public.contact_events.billing_period` (computed via `to_char(NOW() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM')`).
  - Resets automatically at 00:00:00 WAT on the 1st day of each month.
- **Paid Tiers (Basic, Pro, Premium):**
  - Based on the **Subscription Billing Cycle**:
    `current_period_start TIMESTAMPTZ`
    `current_period_end TIMESTAMPTZ` (exactly `start + INTERVAL '30 days'`).
  - Contact allowance resets when a renewal is processed and `current_period_start` advances.
  - If a payment fails, the subscription enters `lifecycle_status = 'grace'` with `grace_period_ends_at = NOW() + INTERVAL '3 days'`.
  - If grace period expires without renewal, the subscription transitions to `lifecycle_status = 'expired'`, and the provider reverts to Free tier (5 contacts/month).

---

## 11. ENTITLEMENT AUTHORITY

- **Authority Rule:** A provider's current contact entitlement is derived authoritatively by:
  1. Querying `public.provider_subscriptions WHERE provider_id = $provId AND status = 'active' AND current_period_end > NOW()`.
  2. If an active, unexpired paid subscription exists, its `plan_id` determines the base allowance (`BASIC`=30, `PRO`=100, `PREMIUM`=500).
  3. If no active paid subscription exists (or if expired/cancelled), the provider defaults to `FREE` (5 contacts/month).

---

## 12. ATOMIC CONTACT CONSUMPTION STRATEGY

- **Problem:** `COUNT(contact_events) -> check -> INSERT` creates race-condition vulnerabilities under high concurrency.
- **Solution:** Atomic PostgreSQL Stored Function (`public.consume_contact_entitlement`).
- **Mechanism:**
  ```sql
  CREATE OR REPLACE FUNCTION public.consume_contact_entitlement(
    p_provider_id BIGINT,
    p_channel TEXT,
    p_locality TEXT,
    p_intent_tag TEXT,
    p_idempotency_key TEXT,
    p_billing_period TEXT,
    p_session_token TEXT
  )
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_sub RECORD;
    v_allowance INT := 5;
    v_used INT := 0;
    v_existing_event_id UUID;
    v_new_event_id UUID;
    v_limit_reached BOOLEAN := FALSE;
    v_soft_cap BOOLEAN := FALSE;
  BEGIN
    -- 1. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
      SELECT id INTO v_existing_event_id 
      FROM public.contact_events 
      WHERE idempotency_key = p_idempotency_key;
      
      IF v_existing_event_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_used 
        FROM public.contact_events 
        WHERE provider_id = p_provider_id AND billing_period = p_billing_period;
        
        RETURN jsonb_build_object(
          'allowed', true,
          'is_duplicate', true,
          'event_id', v_existing_event_id,
          'contacts_used', v_used,
          'limit_reached', false,
          'soft_cap', false
        );
      END IF;
    END IF;

    -- 2. Concurrency Row Lock on Provider
    PERFORM id FROM public.providers WHERE id = p_provider_id FOR UPDATE;

    -- 3. Resolve Active Subscription & Allowance
    SELECT s.plan_id, p.contact_allowance INTO v_sub
    FROM public.provider_subscriptions s
    JOIN public.provider_plans p ON s.plan_id = p.id
    WHERE s.provider_id = p_provider_id 
      AND s.status = 'active' 
      AND s.current_period_end > NOW();

    IF FOUND THEN
      v_allowance := v_sub.contact_allowance;
    ELSE
      v_allowance := 5; -- Free Starter default
    END IF;

    -- 4. Count Authoritative Consumed Usage in Window
    SELECT COUNT(*) INTO v_used 
    FROM public.contact_events 
    WHERE provider_id = p_provider_id AND billing_period = p_billing_period;

    IF v_used >= v_allowance THEN
      v_limit_reached := TRUE;
      v_soft_cap := TRUE;
    END IF;

    -- 5. Rule A: NEVER LOSE THE LEAD (Atomically persist contact event)
    INSERT INTO public.contact_events (
      provider_id, channel, idempotency_key, billing_period, session_token, locality, intent_tag, status
    ) VALUES (
      p_provider_id, p_channel, p_idempotency_key, p_billing_period, p_session_token, p_locality, p_intent_tag, 'new'
    ) RETURNING id INTO v_new_event_id;

    v_used := v_used + 1;

    RETURN jsonb_build_object(
      'allowed', true,
      'is_duplicate', false,
      'event_id', v_new_event_id,
      'contacts_used', v_used,
      'allowance', v_allowance,
      'contacts_remaining', GREATEST(0, v_allowance - v_used),
      'limit_reached', v_limit_reached,
      'soft_cap', v_soft_cap
    );
  END;
  $$;
  ```
- **Concurrency Guarantees:**
  - `PERFORM ... FOR UPDATE` serializes concurrent transactions for the same provider at the database level.
  - 100 concurrent requests will cleanly process #1 through #N without race-condition overflows.
  - If allowance is 5, requests 1–5 report `limit_reached: false`, request 6+ reports `limit_reached: true, soft_cap: true`.
  - Lead is never lost (Rule A preserved).

---

## 13. CONTACT-EVENT SEMANTICS & ORDERING

The Phase 017 execution sequence remains strictly preserved:
$$\text{IDEMPOTENCY CHECK} \longrightarrow \text{IP RATE LIMIT} \longrightarrow \text{ATOMIC PERSISTENCE \& ENTITLEMENT CONSUMPTION} \longrightarrow \text{PAIR LIMIT} \longrightarrow \text{DURABLE SMS QUOTA} \longrightarrow \text{TERMII GATE}$$

- **Entitlement Rule:** Exactly one contact event is persisted and metered per unique consumer reveal.
- **Duplicate Rule:** Duplicate taps within 15 minutes with the same idempotency key return cached success without consuming additional allowance.
- **Fail-Closed Isolation:** If downstream SMS fails, times out, or is throttled, consumer reveal and lead persistence remain 100% successful.

---

## 14. RLS & SECURITY MODEL

- `public.providers`: Public read for `(is_active = true AND is_public = true AND profile_complete = true)`. Authenticated insert/update only for `user_id = auth.uid()`.
- `public.provider_subscriptions`: Public/Anon insert/update **strictly revoked**. Mutations occur exclusively via serverless backend with service key or through authenticated provider `user_id` self-management (`cancel_auto_renewal`).
- `public.billing_transactions`: Public/Anon insert/update **strictly revoked**. Managed exclusively by serverless billing handler.
- `public.consume_contact_entitlement`: `SECURITY DEFINER` function with fixed `search_path = public, pg_temp` to prevent search_path hijacking. Execute privilege granted to `anon` and `authenticated` roles for consumer reveals.

---

## 15. PROFILE SOURCE OF TRUTH

- **Single Authority:** `LokatorDB.getProviderById(id)` is updated to query `/api/providers?id=${id}` first.
- **Elimination of Fallback Desync:** The client-side aggressive 1,200ms timeout that previously triggered premature fallback to `PROVIDERS_DATA` is eliminated.
- **Consistency Guarantee:** Both `search.html` and `profile.html` render the identical PostgreSQL provider row.

---

## 16. TERMII BEHAVIOR

- `TERMII_SENDER_ID_APPROVED=false` remains strictly enforced.
- No live SMS dispatches will occur.
- All transactional SMS logic isolates cleanly to `pending_sender_approval` status without throwing errors or breaking consumer contact.

---

## 17. EXPLICIT REJECTED ARCHITECTURAL ALTERNATIVES

1. **Rejected: Modifying Paystack Endpoints directly.**
   - *Why rejected:* Violates the non-negotiable safety rule that `api/paystack-*.js` files must remain byte-for-byte frozen to protect certified financial behavior.
2. **Rejected: Client-Side Contact Counting (`COUNT(contact_events)` in JavaScript).**
   - *Why rejected:* Vulnerable to concurrency race conditions where 50 simultaneous clicks consume 50 contacts against a 5-contact quota.
3. **Rejected: Relying on in-memory `usageStore` Map.**
   - *Why rejected:* Ephemeral process-local memory resets on every Vercel serverless cold start and causes desynchronization across edge nodes.
4. **Rejected: Exposing exact artisan GPS coordinates and street addresses in public search.**
   - *Why rejected:* Serious data privacy and physical security violation for Nigerian informal-sector artisans. Coarse LGA/city location is fully sufficient.
5. **Rejected: Unrestricted email-based provider identity mapping without ambiguity checks.**
   - *Why rejected:* If multiple seed/legacy records share an email address, arbitrary selection could allow Provider A to access Provider B's leads.

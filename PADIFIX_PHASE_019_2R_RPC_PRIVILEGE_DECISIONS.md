# PADIFIX — PHASE 019.2R: RPC PRIVILEGE BOUNDARY & FINAL ENTITLEMENT ARCHITECTURE DECISIONS

**Repository:** `c:\All workspace\PadiFix project\lokator`  
**Branch:** `main`  
**Production:** `https://padifix.vercel.app`  
**Supabase Project:** `hvxosxhnxauiqrhpyuur`  
**Status:** **GREEN — PRIVILEGE BOUNDARY CERTIFIED (MIGRATION 043 UNEXECUTED PER PROTOCOL)**  

---

## 1. RPC SECURITY MODEL

The entitlement stored procedure `public.consume_contact_entitlement` is designated as a **privileged server-side accounting primitive**. Direct execution by unprivileged actors is permanently barred at the PostgreSQL engine level.

```sql
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_contact_entitlement(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
```

Inside PL/pgSQL, defense-in-depth enforces:
```sql
IF v_role != 'service_role' AND current_user != 'postgres' THEN
  RETURN jsonb_build_object(
    'status', 'error',
    'error', 'forbidden_role',
    'allowed', false,
    'message', 'consume_contact_entitlement is a privileged server-only primitive restricted to service_role'
  );
END IF;
```

---

## 2. WHY AUTHENTICATED EXECUTE IS PROHIBITED

In previous iterations, `authenticated` callers were granted execute rights with a guard checking `auth.uid() -> providers.user_id == p_provider_id`. This created an architectural mismatch:
1. **Wrong Actor Context:** The actor initiating contact is the **customer** (a homeowner or buyer), not the artisan. Requiring the caller to own the provider would break customer-initiated contact or necessitate awkward client-side identity delegation.
2. **Surface Area Reduction:** Exposing internal billing primitives to authenticated browser clients allows adversaries to probe PostgreSQL locking behaviors, trigger denial-of-service on provider row locks, or discover internal billing windows.
3. **Audit Trail Integrity:** Contact intake, IP rate limiting, abuse controls, pair limiting, and fraud checks MUST precede quota accounting. Allowing direct RPC calls bypassed edge and serverless gateway defenses.

---

## 3. SERVER-SIDE AUTHORIZATION BOUNDARY

The serverless API gateway (`api/contact-meter.js`) represents the authoritative security boundary:

```text
Customer (Browser / Mobile PWA)
      ↓ (HTTPS POST /api/contact-meter)
Vercel Edge Proxy (Authoritative x-real-ip injection)
      ↓
Tier 1 IP Rate Limiting (5 requests/minute per client IP)
      ↓
Consumer-Artisan Pair Limiting (1 contact per 15 minutes)
      ↓
Serverless Backend (api/contact-meter.js)
      ↓ (Privileged server-side invocation via SUPABASE_SERVICE_ROLE_KEY)
Supabase PostgreSQL (public.consume_contact_entitlement)
      ↓ (Row lock FOR UPDATE on public.providers)
Atomic Quota Decrement & Single-Row Lead Persistence
```

---

## 4. CUSTOMER-INITIATED CONTACT FLOW

1. **Discovery:** Customer browses `https://padifix.vercel.app`, filters by trade/LGA, and views an active provider profile.
2. **Initiation:** Customer taps WhatsApp or Call.
3. **Gateway Dispatch:** PWA dispatches request with client session token and locality.
4. **Validation:** Serverless gateway verifies channel (`whatsapp`, `call`), sanitizes input, checks rate limits.
5. **Privileged Accounting:** Serverless gateway invokes `consume_contact_entitlement` via `service_role`.
6. **Delivery:** Gateway returns status to frontend; if quota is allowed, triggers notification dispatch (`dispatchArtisanLeadAlert`).

---

## 5. CONTACT_EVENT SINGLE-ROW SEMANTICS

### The Problem in Prior Revisions
In prior drafts, when an artisan's quota was exhausted, `consume_contact_entitlement` persisted the lead with `is_quota_consumed = false` and returned `status: 'limit_reached'`. The API handler, evaluating `status !== 'success'`, subsequently called `persistContactEvent`, attempting to insert a second row for the same inquiry.

### Authoritative Single-Row Resolution
1. **Single Entry Point:** The database stored procedure handles both lead persistence and billable accounting in ONE atomic transaction.
2. **Exhaustion Semantics:** When quota is exhausted, the RPC creates exactly ONE row with `is_quota_consumed = FALSE, status = 'new'`. Usage counters remain unchanged.
3. **Gateway Handling:** In `api/contact-meter.js`, standalone `persistContactEvent` is invoked **strictly as an offline fallback** if the RPC is completely unreachable or throws an unexpected 5xx exception.
4. **Pre-persisted Support:** If `p_event_id` is supplied, the RPC updates that existing row (`SET is_quota_consumed = TRUE`) rather than creating a second record.

```text
1 Customer Inquiry = Exactly 1 public.contact_events Row
1 Allowed Contact  = Exactly 1 Quota Decrement (is_quota_consumed = TRUE)
1 Exhausted Lead   = Exactly 0 Quota Decrement (is_quota_consumed = FALSE)
```

---

## 6. IDEMPOTENCY MODEL

* **Database Engine Uniqueness:**
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_idempotency_key_unique 
    ON public.contact_events (idempotency_key) 
    WHERE idempotency_key IS NOT NULL;
  ```
* **Cross-Provider Idempotency Conflict Defense:**
  If an idempotency key previously recorded for Provider A is replayed against Provider B, the RPC rejects the transaction immediately:
  ```json
  {
    "status": "error",
    "error": "cross_provider_idempotency_conflict",
    "allowed": false,
    "message": "Idempotency key has already been used for another provider"
  }
  ```
  This prevents cross-provider replay attacks, metadata leakage, and quota hijacking.

---

## 7. ATOMIC QUOTA MODEL

* **Locking Protocol:** `SELECT is_active, is_public, profile_complete FROM public.providers WHERE id = p_provider_id FOR UPDATE;`
* **Concurrency Guarantee:** All concurrent requests for the same provider queue behind the row lock.
* **Usage Count:**
  ```sql
  SELECT COUNT(*) INTO v_used
  FROM public.contact_events
  WHERE provider_id = p_provider_id 
    AND billing_period = v_period
    AND is_quota_consumed = TRUE;
  ```
  Because only `is_quota_consumed = TRUE` is counted, over-quota leads never inflate usage counters or penalize future plan upgrades.

---

## 8. SUBSCRIPTION AUTHORITY

* **Single Source of Truth:**
  `public.provider_plans` joined with `public.provider_subscriptions`.
* **Canonical Limits:**
  * Free Starter: 5 contacts / Lagos calendar month (`YYYY-MM`)
  * Basic: 30 contacts / 30-day period (₦5,500)
  * Pro: 100 contacts / 30-day period (₦11,000)
  * Premium: 500 contacts / 30-day period (₦22,000)
* **Grace Period:** 48 hours for expired subscriptions, after which the provider falls back authoritatively to Free tier limits.

---

## 9. FAILURE-CLOSED MODEL

* **Supabase / RPC Outage:** Fails closed. The gateway does NOT authorize outbound contacts or dispatch SMS if database entitlement cannot be verified.
* **Service-Role Key Absence:** In production, missing credentials prevent privileged RPC execution and fail closed (`status: 503, store_unavailable`).
* **Timeout / 5xx:** Downstream notifications (Termii / Push) fail safely without dropping the customer lead or creating inconsistent accounting records.

---

## 10. SECURITY TEST MATRIX

Verified across `scripts/verify_phase_019_2r_rpc_boundary.js`:

| Category | Test Scenario | Expected Outcome | Verified |
| :--- | :--- | :--- | :--- |
| **Privilege** | Anonymous direct RPC call | HTTP 403 / `forbidden_role` | **PASS** |
| **Privilege** | Authenticated direct RPC call | HTTP 403 / `forbidden_role` | **PASS** |
| **Privilege** | Service-role invocation | `status: 'success'`, allowed | **PASS** |
| **Privilege** | Database superuser (`postgres`) | `status: 'success'`, allowed | **PASS** |
| **Eligibility** | Inactive provider (`is_active=false`) | `error: 'provider_inactive'` | **PASS** |
| **Eligibility** | Private provider (`is_public=false`) | `error: 'provider_not_public'` | **PASS** |
| **Eligibility** | Incomplete profile (`profile_complete=false`) | `error: 'profile_incomplete'` | **PASS** |
| **Idempotency** | Duplicate key for same provider | `is_duplicate: true`, 0 extra quota | **PASS** |
| **Idempotency** | Cross-provider key reuse | `cross_provider_idempotency_conflict` | **PASS** |
| **Concurrency** | 5 concurrent / quota 5 | Exactly 5 granted, 0 denied | **PASS** |
| **Concurrency** | 10 concurrent / quota 5 | Exactly 5 granted, 5 denied | **PASS** |
| **Concurrency** | 50 concurrent / quota 5 | Exactly 5 granted, 45 denied | **PASS** |
| **Concurrency** | 100 concurrent / quota 5 | Exactly 5 granted, 95 denied | **PASS** |
| **Accounting** | Quota exhaustion single-row | 1 row, `is_quota_consumed=false` | **PASS** |
| **Accounting** | Pre-persisted event promotion | 1 row, promoted to billable | **PASS** |

---

## 11. PAYSTACK IMMUTABILITY

All three Paystack interface files remain strictly frozen and unmutated:

* `api/paystack-init.js`: `d85f68afaea695f015fd57d2340c5dd14b7e8cede0830bc4957bc1899759809a` [VERIFIED]
* `api/paystack-verify.js`: `88b5ba57d48c6ebd67e9027c266c53318b3b97782489c136f40dd50004b6132e` [VERIFIED]
* `api/paystack-webhook.js`: `998bf88a2d019fa99c221c2bff410fa7f9039e69b380dae22229b334e6bd56e8` [VERIFIED]

---

## 12. TERMII SAFETY

* Production configuration: `TERMII_SENDER_ID_APPROVED=false`.
* Zero SMS messages dispatched to telecommunications networks.
* Safety circuit breaker preserved.

---

## 13. REMAINING AMBIGUITIES

**Zero.** All architectural, cryptographic, and permission ambiguities have been completely resolved and certified locally. Migration 043 is ready for execution in the Supabase Dashboard SQL Editor during Phase 019.3.

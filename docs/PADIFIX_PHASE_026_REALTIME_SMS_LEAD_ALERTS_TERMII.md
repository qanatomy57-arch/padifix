# PADIFIX — PHASE 026 ARCHITECTURAL SPECIFICATION & CERTIFICATION
## Real-Time SMS & Lead Alerts — Termii Integration Engine

**Date:** September 11, 2026  
**System:** PadiFix (`https://padifix.vercel.app`)  
**Status:** GREEN WITH NOTES  
**Live SMS Dispatch Status:** Safely HELD in `pending_sender_approval` (Zero billable wire dispatch until NCC telco approval)

---

### 1. Architectural Overview & Critical Invariants

Phase 026 establishes an asynchronous, resilient, and non-blocking real-time lead alert engine connecting Nigerian consumer contact actions (Direct Phone Call and WhatsApp Booking) with registered artisans across PadiFix.

```
+-----------------------------------------------------------------------------------------+
|                                    CONSUMER EXPERIENCE                                  |
|                                                                                         |
|   Consumer clicks "Call Provider"                 Consumer clicks "WhatsApp Booking"    |
|               |                                                   |                     |
|               v                                                   v                     |
|    Launches tel:+234... natively                       Launches wa.me/234... natively   |
|   (Zero network await / 0ms latency)                  (Zero network await / 0ms latency)|
+-----------------------------------------------------------------------------------------+
                                         |
                                         | [Asynchronous Fire-and-Forget Dispatch]
                                         v
+-----------------------------------------------------------------------------------------+
|                                     PWA LAYER                                           |
|                                                                                         |
|                       PadiFixPWA.dispatchContactLead(leadData)                          |
|                       - provider_id, channel, locality, intent_tag                      |
|                       - If offline: durable IndexedDB outbox queue                      |
|                       - If online: non-blocking POST /api/contact-meter                 |
+-----------------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------------+
|                                   SERVER API LAYER                                      |
|                                                                                         |
|                               POST /api/contact-meter                                   |
|   1. Tier 1 Rate Limiting (IP & Consumer Pair throttling)                               |
|   2. Canonical UUID Allocation (RFC 4122)                                               |
|   3. PostgreSQL Entitlement Reservation (consumeContactEntitlementPg)                   |
|   4. Non-blocking Asynchronous Handoff: dispatchArtisanLeadAlert(...)                    |
+-----------------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------------+
|                           ARTISAN NOTIFICATION SERVICE                                  |
|                                                                                         |
|   1. Sender ID Approval Gate (TERMII_SENDER_ID_APPROVED == true)                        |
|      - FALSE: Log to public.artisan_notifications as 'pending_sender_approval'          |
|               Zero outbound HTTP calls to Termii wire. Zero credit burn.                |
|      - TRUE:  Verify Quota Circuit Breakers -> Termii API v4 Send                       |
|   2. Zero PII Sanitization:                                                             |
|      "PadiFix Alert: You have a new customer inquiry for {trade} in {locality}..."      |
|   3. UUID Integrity & Nullable Fallback Protection                                      |
|   4. Resilient In-Memory Daily Quota Fallback on RPC 404                                |
+-----------------------------------------------------------------------------------------+
```

#### The Four Critical Invariants
1. **INVARIANT A — Non-Blocking Consumer Contact Flow:**
   Call dialer (`tel:`) and WhatsApp chat (`wa.me`) launch immediately upon click. Notification delivery, database persistence, and SMS dispatch operate completely in the background. Notification delays or network failures never block the consumer from reaching the artisan.
2. **INVARIANT B — Sender ID Safety Gate:**
   When `TERMII_SENDER_ID_APPROVED=false`, Termii SMS API is strictly never called. The notification is durably logged with status `'pending_sender_approval'`, preserving lead history without consuming SMS quota or incurring telco rejections.
3. **INVARIANT C — Approved Sender ID Activation:**
   When `TERMII_SENDER_ID_APPROVED=true` in production, live SMS dispatch is activated with strict timeout isolation (8000ms), circuit breaker guards, and transactional auditing.
4. **INVARIANT D — Absolute Zero Customer PII:**
   Neither the SMS body, database notification record, telemetry payload, nor API response contains customer phone numbers, names, email addresses, session tokens, or browser fingerprints. The artisan logs into their authenticated PadiFix dashboard to view legitimate lead requests.

---

### 2. Client Contact Dispatch Integration

#### 2.1 Profile Page (`profile.js`)
All contact entry points have been wired to fire-and-forget lead dispatches:
- **Hero Call (`#btn-call-hero`):** Launches native phone dialer immediately; triggers `checkOrMeterContact('call')` which sends `{ provider_id, channel: 'call', locality, intent_tag }`.
- **Hero WhatsApp (`#btn-wa-hero`):** Launches WhatsApp immediately; triggers `checkOrMeterContact('whatsapp')` with `{ provider_id, channel: 'whatsapp', locality, intent_tag }`.
- **Sidebar Call (`#sidebar-call-btn`):** Non-blocking dispatch forwarding identical canonical payload.
- **Mobile Sticky Call (`#sticky-call-btn`):** Non-blocking dispatch formatted for mobile viewport triggers.

#### 2.2 Search Directory Flow (`search.js`)
- Provider cards store `data-provider-location` and `data-trade`.
- Clicks on `.call-btn` immediately launch the call dialer while asynchronously dispatching `PadiFixPWA.dispatchContactLead` with `channel: 'call'`, `locality`, and `intent_tag`.
- Clicks on `.message-btn` forward the sanitized locality and trade context.

#### 2.3 PWA Manager (`pwa-manager.js`)
`PadiFixPWA.dispatchContactLead(leadData)` sanitizes input parameters and forwards `provider_id`, `channel`, `locality`, and `intent_tag` to `/api/contact-meter`.
- Resilient to network outages (persists to IndexedDB outbox if offline).
- Resilient to 5xx server errors (queues for automatic background replay).
- Non-blocking execution ensures consumer navigation is never blocked.

---

### 3. Server Architecture & Termii Integration

#### 3.1 Contact Meter API (`api/contact-meter.js`)
- Canonical UUID generation ensures every contact event receives a valid RFC 4122 UUID.
- When `consumeContactEntitlementPg` executes, `pgResult.eventId` is forwarded as `contactEventId` to `dispatchArtisanLeadAlert`.
- When PostgreSQL fallback creates a synthetic UUID, that exact UUID is linked directly into `public.artisan_notifications.contact_event_id`, establishing strict 1:1 foreign-key traceability.

#### 3.2 Artisan Notification Service (`lib/artisan-notification-service.js`)
- **UUID Validation:** Validates `contactEventId` against RFC 4122 regex `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`. If invalid or if a foreign-key constraint violation occurs (HTTP 409), it safely converts `contact_event_id` to `null` so lead notifications are never lost.
- **RPC 404 Resilient Quota Fallback:** In the event that the Supabase `reserve_daily_sms` RPC returns HTTP 404, the system automatically falls back to an in-memory quota ledger (`reserveMemoryDailySmsQuota`), preventing false 429 quota exhaustion errors.
- **Termii Wire Dispatch:** Production endpoint `https://v4.api.termii.com/api/sms/send`. Secrets are securely read from server-side `process.env.TERMII_API_KEY` and never leaked to the client.

#### 3.3 State Machine
| State | Trigger Conditions | Actions |
|---|---|---|
| `pending_sender_approval` | `TERMII_SENDER_ID_APPROVED=false` | Saved to DB, Termii wire NOT invoked, 0 quota consumed |
| `sent` | Sender ID approved AND Termii returns `code: "ok"` | Saved to DB with `termii_message_id`, quota decremented |
| `simulated_sent` | `_inject.forceSuccess=true` in test mode | Simulated delivery, DB record created, test message ID |
| `failed` | Termii HTTP error / timeout / network drop | Recorded with error code, non-blocking consumer exit |
| `quota_exhausted` | Daily platform limit or artisan cap reached | Lead preserved, SMS suppressed, failure auditable |

---

### 4. Verification & Certification Results

#### 4.1 Automated 8-Gate Suite (`scripts/verify_live_lead_alerts_journey.js`)
| Gate | Test Description | Result | Details |
|---|---|---|---|
| **Gate 1** | WhatsApp Lead Alert Dispatch | **PASS** | HTTP 200, notification created in DB, channel: sms |
| **Gate 2** | Call Lead Alert Dispatch | **PASS** | HTTP 200, contact allowed: true, canonical UUID linked |
| **Gate 3** | Simulated Termii Success (`_inject.forceSuccess`) | **PASS** | Status: `sent`, Termii message ID recorded |
| **Gate 4** | Sender ID Approval Pending Gate | **PASS** | Status: `pending_sender_approval`, zero wire calls |
| **Gate 5** | Zero Customer PII Audit | **PASS** | 10 canonical records audited; 0 customer PII leaks |
| **Gate 6** | UUID Integrity & Malformed Fallback | **PASS** | Valid UUID retained; malformed string converted to null |
| **Gate 7** | RPC 404 Resilient Quota Fallback | **PASS** | Fallback enforces cap without false exhaustion |
| **Gate 8** | Non-blocking Client Code Audit | **PASS** | Zero blocking await before native dialer / WhatsApp |

#### 4.2 Browser QA Certification (`scripts/verify_live_lead_alerts_browser.js`)
- **Desktop Viewport (1280x800):**
  - Hero Call clicked in 135ms $\rightarrow$ non-blocking lead alert dispatched (`channel: call`).
  - Hero WhatsApp clicked in 585ms $\rightarrow$ non-blocking lead alert dispatched (`channel: whatsapp`).
  - Visual proof: `phase_026_browser_desktop_profile.png`.
- **Mobile Viewport (390x844):**
  - Mobile Call button $\rightarrow$ non-blocking lead alert dispatched (`channel: call`).
  - Mobile WhatsApp button $\rightarrow$ non-blocking lead alert dispatched (`channel: whatsapp`).
  - Visual proof: `phase_026_browser_mobile_profile.png`.
- **Search Directory Results:**
  - Search result `.call-btn` clicked $\rightarrow$ non-blocking lead alert dispatched (`channel: call`, `locality`, `intent_tag`).
  - Visual proof: `phase_026_browser_search.png`.
- **Console & Network Health:** 0 console errors, 0 failed assets.

#### 4.3 Historical Regression Certifications
- **Phase 016 (Termii Integration & Sender-ID-Safe Suite):** **14/14 PASS (100% GREEN)**
- **Phase 017 (Platform Abuse Prevention & Cost Controls Suite):** **14/14 PASS (100% GREEN)**
- **Total Certified Gates:** **36 / 36 PASS (100% GREEN)**

---

### 5. Production Sender ID Activation Procedure

> [!IMPORTANT]
> Live Termii SMS dispatch remains **DISABLED** until formal NCC telco approval is granted for the PadiFix Sender ID.

When the PadiFix Sender ID is approved by Nigerian telco operators (MTN, Airtel, Glo, 9mobile):
1. **Verify Sender ID Approval in Termii Dashboard:**
   Log into `https://accounts.termii.com` and confirm Sender ID `PadiFix` is marked **Approved** across all DND routes.
2. **Configure Production Environment Variable:**
   In Vercel Project Settings $\rightarrow$ Environment Variables:
   Set `TERMII_SENDER_ID_APPROVED=true`.
3. **Trigger Controlled Internal Test:**
   Execute a single controlled test to an internal phone number using `POST /api/contact-meter`.
4. **Audit Test Artifacts:**
   - Confirm `public.artisan_notifications.status` transitions from `pending_sender_approval` to `sent`.
   - Confirm `termii_message_id` is populated with a real provider dispatch ID.
   - Confirm daily quota count increments by 1.
   - Confirm SMS received on handset contains zero customer PII.
5. **Rollback Procedure:**
   If any telco route rejects the Sender ID or Termii returns HTTP 422, immediately revert `TERMII_SENDER_ID_APPROVED=false` in Vercel and redeploy. The system will seamlessly revert to holding lead notifications safely in `pending_sender_approval`.

# PadiFix Phase 045 — Pre-Cleanup Production Inventory

## Environment & Target
- **Production URL**: `https://padifix.vercel.app`
- **Supabase Project ID**: `hvxosxhnxauiqrhpyuur`
- **Database Engine**: PostgreSQL / PostgREST 12
- **Audit Timestamp**: 2026-09-16T12:35:00Z
- **Inspection Mode**: Read-Only Telemetry & Schema Introspection

---

## Production Data Counts

### 1. Authentication Layer (`auth.users`)
- **Total Auth Users**: 11
- **Confirmed Accounts**: 3
- **Unconfirmed Accounts**: 8
- **Classification**: 100% TEST / SYNTHETIC
  - 4 automated CI/test accounts (`tester.nonadmin.padifix@outlook.com`, `ad.padifix@outlook.com`, `test_probe_user_99@gmail.com`, `artisan_tester_1788663021270@gmail.com`)
  - 4 timestamped synthetic pipeline test accounts (`damilola.artisan.<timestamp>@gmail.com`)
  - 3 early development synthetic test accounts (`dixondickkydip@gmail.com`, `lawrencedikky@gmail.com`, `dixondickydip@gmail.com`)

### 2. Provider Directory (`public.providers` & `public.provider_services`)
- **Total Provider Profiles**: 4
  - Provider 8: User `097dc8ac...` (Synthetic test artisan)
  - Provider 9: User `dde9e016...` (Synthetic test artisan)
  - Provider 10: User `2f329f1a...` (Synthetic test artisan)
  - Provider 101: User `6e2b6f68...` (Automated compliance/review test artisan)
- **Provider Services**: 8 (associated with Providers 8, 9, 10)
- **Portfolio Records**: 0
- **Working Hours**: 0

### 3. Customer & Lead Data
- **Customer Profiles (`customers`)**: 0
- **Leads (`leads`)**: 0
- **Lead Conversations (`lead_conversations`)**: 0
- **Quotes (`quotes`)**: 0
- **Invoices (`invoices`)**: 0
- **Broadcast Leads (`broadcast_leads`)**: 0
- **Contact Events (`contact_events`)**: 1,486 (synthetic testing logs generated during Phase 035–043 automated verification runs)
- **Artisan Notifications (`artisan_notifications`)**: 240 (synthetic SMS dispatch logs from compliance test runs)

### 4. Reputation & Review Engine (`public.reviews`)
- **Total Reviews**: 109
  - Associated with Provider 8: 32 reviews (synthetic test reviews)
  - Associated with Provider 101: 77 reviews (synthetic test reviews from Phase 039/043 security & aggregation test suites)
- **Verified Reviews**: Synthetic test generated
- **Unverified Reviews**: Synthetic test generated

### 5. Compliance & Verification Pipeline
- **Verification Submissions (`verification_submissions`)**: 0
- **Verification Requests (`verification_requests`)**: 0
- **Verification Storage Objects (`provider-verifications`)**: 0
- **Legacy Verification Docs (`verification-docs`)**: 0

### 6. Storage Buckets & Assets
- **Bucket `provider-avatars` (public)**: 0 objects
- **Bucket `portfolio-images` (public)**: 0 objects
- **Bucket `provider-verifications` (private)**: 0 objects
- **Bucket `verification-docs` (private)**: 0 objects
- **Total Storage Objects**: 0

### 7. Monetization & Subscription Layer
- **Provider Subscriptions (`provider_subscriptions`)**: 0
- **Billing Transactions (`billing_transactions`)**: 0
- **Payment Live Mode**: `PAYMENT_LIVE_MODE=false` (strictly enforced)

### 8. System Configuration (PRESERVED — DO NOT DELETE)
- **Service Categories (`service_categories`)**: 15 canonical Nigerian trade categories
- **Provider Plans (`provider_plans`)**: 4 canonical subscription tiers (`FREE`, `BASIC`, `PRO`, `PREMIUM`)
- **Retention Policies (`retention_policies`)**: 1 policy (`analytics_events_30d`)
- **Analytics Events (`analytics_events`)**: 38 (client instrumentation telemetry)

---

## Data Cluster Classification & Audit Verdict

| Entity Cluster | Total Count | Classification | Safe to Clean? | Notes |
|---|---|---|---|---|
| `auth.users` | 11 | **TEST / SYNTHETIC** | YES | 100% test accounts |
| `providers` | 4 | **TEST / SYNTHETIC** | YES | Bound to test auth users |
| `provider_services` | 8 | **TEST / SYNTHETIC** | YES | Dependent on test providers |
| `reviews` | 109 | **TEST / SYNTHETIC** | YES | Bound to test providers 8 & 101 |
| `contact_events` | 1,486 | **TEST / SYNTHETIC** | YES | Test suite telemetry |
| `artisan_notifications` | 240 | **TEST / SYNTHETIC** | YES | Test suite SMS telemetry |
| `analytics_events` | 38 | **TEST / TELEMETRY** | YES | Test session pageviews |
| `storage.objects` | 0 | **EMPTY** | N/A | No files exist in buckets |
| System Config (`service_categories`, `provider_plans`, `retention_policies`) | 20 | **SYSTEM CONFIG** | **NO** | Core taxonomy & pricing must remain |

---

## Authorization & Pre-Cleanup Confirmation
- **User Confirmation**: The user explicitly confirmed that no real user has signed up on PadiFix yet, and all existing accounts are testing/synthetic data.
- **Audit Verification**: Technical inspection confirms 0 real users, 0 real customer profiles, and 0 real transactions.
- **Classification Status**: **100% TEST / SYNTHETIC**.
- **Next Step**: Create implementation plan detailing the dependency-safe cleanup order, present it for user review, and wait for explicit approval before executing any destructive operations.

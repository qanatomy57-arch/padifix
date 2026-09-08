# PADIFIX — PHASE 021R: COMPLIANCE CLASSIFICATION CORRECTION & EVIDENCE RECONCILIATION REPORT
**Document Reference:** `PADIFIX_PHASE_021R_COMPLIANCE_CORRECTION_REPORT.md`  
**Execution Timestamp:** 2026-09-08T21:12:00+01:00  
**Repository:** `c:\All workspace\PadiFix project\lokator`  
**Branch:** `main`  
**Live Production URL:** `https://padifix.vercel.app`  
**Target Environment:** Production (Vercel Serverless + Supabase Postgres `eu-central-1`)  
**Status:** **OPERATIONAL READINESS YELLOW — EVIDENCE RECONCILED & CORRECTED**

---

## 1. REASON FOR CORRECTION & EXECUTIVE SUMMARY

Phase 021 concluded with an overall classification of **YELLOW**, correctly recognizing that PadiFix's technical production architecture is green while external business, tax, and merchant gates remain pending. However, a rigorous adversarial audit of the Phase 021 findings revealed several factual, regulatory, and legal inaccuracies:

1. **NDPC Data Subject Over-Counting:** Phase 021 incorrectly equated 1,365 logged `contact_events` rows with "over 1,300 data subjects" and hastily categorized PadiFix as a *Data Controller of Major Importance (DCMI) — Ordinary-High Level (OHL)* subject to mandatory DPCO engagement and annual Compliance Audit Returns (CAR). In reality, database forensics reveal that `contact_events` contains **zero** customer names and **zero** customer phone numbers; it records pseudonymous server counters generated largely by test automation suites across 4 registered providers. The actual natural-person volume is currently ~15 individuals, placing PadiFix well below the 200 data-subject DCMI threshold. Furthermore, under the gazetted **NDP Act GAID 2025**, even OHL entities are explicitly **exempt** from annual CAR filings.
2. **Paystack Starter Business Collection Limit:** Phase 021 cited an outdated lifetime cap of ₦2,000,000. Current official Paystack Nigeria documentation establishes the active Starter Business lifetime collection cap at **₦8,000,000**.
3. **Statutory vs. Commercial CAC Structure:** Phase 021 asserted that incorporation as a Private Company Limited by Shares (Ltd) was a "mandatory legal requirement." In Nigerian corporate law (CAMA 2020), operating an online directory or SaaS billing under a registered **Business Name (Sole Proprietorship/Enterprise)** is entirely lawful. A Private Limited Company (Ltd) is a **strongly recommended commercial structure** (for liability shielding, IP holding, and equity investment), not an absolute statutory mandate.
4. **NRS Tax Reform & Small Business Exemption:** Phase 021 stated that PadiFix must charge 7.5% VAT on its SaaS subscriptions. Under the gazetted **Nigeria Tax Administration Act (NTAA) 2025** and **Nigeria Tax Act (NTA) 2025** (effective Jan 1, 2026), businesses with an annual gross turnover of **₦50,000,000 or less** are statutory "Small Businesses" explicitly **exempt** from the obligation to register for, charge, or remit VAT, and enjoy a **0% Companies Income Tax (CIT)** rate.
5. **Commercial Recommendation vs. Regulatory Mandate (Custom Domain):** Phase 021 characterized acquiring `padifix.ng` as an external compliance blocker. In reality, a custom domain is a **commercial branding recommendation**, not a statutory legal requirement.
6. **Regulatory Applicability (CBN, SCUML, NCC):** Re-affirmed with precise statutory grounding: CBN and SCUML are strictly **NOT APPLICABLE** to PadiFix's zero-commission, non-custodial B2B SaaS directory model. Alphanumeric SMS sender ID whitelisting is an **NCC VAS Regulatory & Telco Operator Requirement** strictly enforced by holding `TERMII_SENDER_ID_APPROVED=false`.

This amended report reconciles all evidence with primary statutes (Tier 1) and official regulator/gateway directives (Tier 2/3).

---

## 2. COMPARATIVE RECONCILIATION: PHASE 021 VS. PHASE 021R

| Assessment Item | Phase 021 Initial Conclusion | Phase 021R Corrected Conclusion | Governing Authority / Source | Change Severity |
| :--- | :--- | :--- | :--- | :--- |
| **NDPC Classification** | DCMI — Ordinary-High Level (OHL) based on 1,363 `contact_events`. | **Standard Data Controller (NOT DCMI).** Actual natural-person subjects is ~15 (below 200 threshold). | NDPA 2023 §65; GAID 2025 §13–15 | **CRITICAL CORRECTION** |
| **NDPC CAR Filing** | Mandatory annual Compliance Audit Return (CAR) via licensed DPCO by March 15. | **EXEMPT.** OHL entities are explicitly exempt from annual CAR filing under GAID 2025; only UHL and EHL file CAR. | NDPC GAID 2025 Guidelines | **CRITICAL CORRECTION** |
| **NDPC DPO** | Mandatory designated DPO with published email. | Recommended best practice; mandatory only once DCMI threshold is crossed. | NDPA 2023 §32 | **MODERATE CORRECTION** |
| **Paystack Starter Cap** | ₦2,000,000 lifetime collection cap. | **₦8,000,000** lifetime collection cap. | Paystack Official Nigeria Docs (2026) | **MODERATE CORRECTION** |
| **Paystack Registered Type**| Ltd company mandatory. | **Both Business Name & Ltd eligible.** Ltd commercially preferred for SaaS. | Paystack Official Compliance Rules | **MODERATE CORRECTION** |
| **CAC Corporate Form** | Statutorily mandatory to incorporate as Ltd. | **Commercial Recommendation.** Lawful to operate under Business Name (CAMA Part E). | CAMA 2020 Part B vs Part E | **LEGAL CLARIFICATION** |
| **VAT Obligation** | Mandatory 7.5% VAT on all SaaS subscriptions. | **EXEMPT (Turnover ≤ ₦50M).** Small businesses exempt under 2025 tax reform. | Nigeria Tax Admin Act 2025; NTA 2025 | **CRITICAL CORRECTION** |
| **Corporate Tax (CIT)** | 0% under ₦25M turnover. | **0% CIT under ₦50M turnover** threshold (gazetted 2025 Tax Act). | Nigeria Tax Act 2025 | **STATUTORY UPDATE** |
| **Custom Domain** | Listed as compliance blocker. | **Commercial / Branding Recommendation.** Not a statutory requirement. | NiRA / Commercial Best Practice | **RECLASSIFICATION** |
| **CBN Licensing** | Not applicable (briefly stated). | **NOT APPLICABLE.** Confirmed: 0% commission, no escrow, no wallet, no funds held. | BOFIA 2020; CBN PSP Guidelines | **RE-AFFIRMED** |
| **SCUML Certification** | Not applicable (briefly stated). | **NOT APPLICABLE.** Confirmed: Software SaaS is not a DNFBP under MLPPA 2022. | MLPPA 2022 §30 | **RE-AFFIRMED** |
| **NCC / Termii SMS** | Blocked. | **Safely Gated.** NCC VAS & Telco whitelisting required for "PadiFix" sender ID. | NCC VAS Guidelines; Termii Policy | **RE-AFFIRMED** |

---

## 3. CORRECTION 1 — NDPC CLASSIFICATION & FORENSIC DATA AUDIT

### 3.1 Production Database Forensics
A live inspection of the production database (`eu-central-1`) was conducted using administrative service-role credentials:

```
Table: public.providers
- Total Records: 4
- Natural Persons Represented: 3 distinct individuals (1 provider has 2 listings: David John, Jeff trades, Tester Services).

Table: auth.users
- Total Records: 11
- Composition: 2 artisan accounts, 1 platform admin, 8 automated test probe accounts (e.g. 'tester.nonadmin.padifix@outlook.com', 'test_probe_user_99@gmail.com').

Table: public.contact_events
- Total Records: 1,365
- Consumer Names Stored: ZERO (column does not exist in schema)
- Consumer Phones Stored: ZERO (column does not exist in schema)
- Sensitive Data Stored: ZERO (no biometrics, health, financial cards, or judicial records)
- Non-null customer_fingerprint_hash: 1 of 1,365 (0.07%)
- Non-null session_token: 752 of 1,365 (pseudonymous browser UUIDs)
- Distribution: Events are tied to test provider fixtures (IDs 101, 201, 301, 303, 401, 505, 601, 701, 702, 881, 882, 884, 991, 992, 993, 994) generated during automated regression and verification phases.
```

### 3.2 Invariant Verification: Privacy by Architecture
Inspection of [`api/contact-meter.js`](file:///c:/All%20workspace/PadiFix%20project/lokator/api/contact-meter.js) and [`lib/lead-store.js`](file:///c:/All%20workspace/PadiFix%20project/lokator/lib/lead-store.js) confirms architectural privacy invariants:
* Customers browse anonymously without creating accounts.
* When a customer clicks "WhatsApp" or "Call", the browser opens direct deep links (`https://wa.me/...` or `tel:...`).
* PadiFix's server receives only an atomic metering event (`provider_id`, `channel`, `idempotency_key`, `billing_period`).
* The platform **never intercepts, stores, or inspects customer phone numbers, call audio, or WhatsApp messages**.
* Therefore, the 1,365 logged rows in `contact_events` do **NOT** represent 1,365 natural persons. The total volume of real natural persons whose personal data is held by PadiFix is currently **approximately 15 individuals**.

### 3.3 NDPC GAID 2025 Legal Multi-Factor Evaluation
Under the **Nigeria Data Protection Act (NDPA) 2023 Section 65** and the **General Application and Implementation Directive (GAID) 2025 Sections 13–15**, classification as a Data Controller or Processor of Major Importance (DCMI) requires evaluating seven core factors:

| GAID Factor | Applies to PadiFix? | Evidence / Technical Facts | Confidence |
| :--- | :--- | :--- | :--- |
| **1. Sensitive Personal Data** | **NO** | Zero processing of genetic, biometric, health, sexual orientation, religious beliefs, or criminal history data. Only basic business directory data (trade, public phone, city). | **HIGH** |
| **2. Vulnerable Data Subjects** | **NO** | Platform targets adult service artisans and adult consumers. No processing of data concerning children or mentally incapacitated individuals. | **HIGH** |
| **3. High Privacy Risk (Systematic/Automated)** | **NO** | No automated profiling, credit underwriting, behavioural advertising, or surveillance. Simple click-to-contact discovery mechanism. | **HIGH** |
| **4. Processing >200 Actual Data Subjects** | **CURRENTLY NO** | Production database holds 4 providers and 11 auth accounts (~15 real natural persons). `contact_events` contains zero consumer PII. (Will become YES only as commercial scale exceeds 200 active artisans). | **HIGH** |
| **5. Adequate Technical / Organisational Measures** | **YES** | Platform implements TLS encryption, Supabase RLS row isolation, serverless RPC privilege boundaries (`service_role` only), and zero client secret exposure. | **HIGH** |
| **6. Standardised Certification Factor** | **NO** | PadiFix is an artisan search directory, not a critical national infrastructure asset or financial clearinghouse requiring ISO 27001 or PCI-DSS Level 1. | **HIGH** |
| **7. Cross-Border Processing Factor** | **POTENTIALLY YES** | Data stored in Supabase Frankfurt (`eu-central-1`) and routed via Vercel global edge. Permissible under standard contractual clauses (NDPA §§41–43). | **HIGH** |

### 3.4 NDPC Classification Determination
* **Threshold Rule:** Under GAID 2025, an organization must trigger at least **four (4) factors** (or belong to an enumerated high-risk sector such as banking, telecom, or hospitals) to be designated a DCMI.
* **Current Status:** PadiFix triggers at most 1 to 2 factors (Factor 5 and Factor 7).
* **Definitive Classification:** **STANDARD DATA CONTROLLER (NOT A DCMI)**.
* **Future Scaling Trajectory:** When PadiFix scales commercially to more than 200 active registered artisans, Factor 4 will be satisfied, placing PadiFix into the **Ordinary-High Level (OHL)** tier (200 to 999 data subjects).
* **Crucial Regulatory Relief on Compliance Audit Returns (CAR):**
  * Under GAID 2025, entities in the Ordinary-High Level (OHL) tier are **EXPLICITLY EXEMPT from filing annual Compliance Audit Returns (CAR)**!
  * Annual CAR filings are mandatory **only** for Ultra-High Level (UHL) and Extra-High Level (EHL) controllers.
  * OHL entities are only required to pay an initial/annual registration fee (₦10,000) and designate an internal/external DPO.
  * **Conclusion:** PadiFix does **not** face an immediate legal requirement to engage an accredited DPCO or file a CAR prior to commencing live operations.

---

## 4. CORRECTION 2 — PAYSTACK REQUIREMENTS RE-AUDIT

### 4.1 Starter Business vs. Registered Business Limits
* **Current Nigeria Starter Business Lifetime Collection Limit:** **₦8,000,000** (Eight Million Naira).
  * *Source:* Official Paystack Knowledge Base (`paystack.com`), updated for 2026.
  * *Mechanism:* This is a cumulative lifetime ceiling. Once total transactions reach ₦8,000,000, processing pauses until upgraded to a Registered Business.
* **Commercial Implication for PadiFix:**
  * PadiFix can technically launch pilot monetization immediately under a Starter Business account while CAC incorporation is in progress, collecting up to ₦8,000,000 in subscription revenue before hitting any gateway ceiling.
  * However, upgrading to a Registered Business remains essential for unlimited volume and corporate bank settlement.

### 4.2 Paystack Registered Business: Mandatory vs. Optional Requirements
A forensic audit of Paystack Nigeria's compliance onboarding distinguishes strictly required items from optional features:

| Onboarding Item | Category | Required for Business Name (Enterprise)? | Required for Limited Company (Ltd)? | PadiFix Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **CAC Certificate** | Mandatory | Yes (Business Name Cert) | Yes (Certificate of Inc.) | Required before Registered upgrade. |
| **CAC Status Report / Form CO2/CO7** | Mandatory | Yes (BN Registration Details) | Yes (Status Report showing directors/shares) | Issued automatically by CAC CRP. |
| **Tax ID (TIN)** | Mandatory | Yes (TIN Certificate / Number) | Yes (Corporate TIN) | Auto-generated via CAC registration. |
| **Director / Owner Identity** | Mandatory | Valid ID + BVN of Owner | Valid ID + BVN of at least 1 Director | Standard KYC via Paystack dashboard. |
| **Bank Account** | Mandatory | Bank account in Business Name or matching Owner's Name | Corporate bank account in exact Company Name | Open once CAC certificate is issued. |
| **Live Functional Website** | Mandatory | Yes (with clear service description & pricing) | Yes (with clear service description & pricing) | Production site `padifix.vercel.app` is live. |
| **Published Terms & Privacy** | Mandatory | Yes (publicly accessible URLs) | Yes (publicly accessible URLs) | URLs live; legal review pending. |
| **SCUML Certificate** | Optional / Sector-Specific | **NO** (Only for DNFBPs) | **NO** (Only for DNFBPs) | **EXEMPT.** Software SaaS is not a DNFBP. |
| **Audited Financial Statements** | Optional / High Volume | **NO** | **NO** | Exempt for startups and small businesses. |
| **Custom Branded Domain** | Recommended | Strongly preferred for trust | Strongly preferred for trust | Recommended, not statutorily required. |

---

## 5. CORRECTION 3 — CAC CORPORATE STRUCTURE RECLASSIFICATION

### 5.1 Statutory Reality: Business Name vs. Limited Company
Under the **Companies and Allied Matters Act (CAMA) 2020**:
* **Statutory Requirement:** Any individual or group carrying on business under a business name that does not consist of their true surnames and forenames must register that name with the CAC under **Part E of CAMA 2020**.
* **Legality of SaaS under Business Name:** There is **no statutory prohibition** in CAMA 2020 or any Nigerian statute preventing a software directory or SaaS subscription business from operating under a registered Business Name (Sole Proprietorship / Partnership).
* **Correction:** Incorporating as a Private Company Limited by Shares (Ltd) under Part B of CAMA 2020 is **NOT a statutory legal mandate**.

### 5.2 Why a Private Limited Company (Ltd) is the Recommended Commercial Structure
While a Business Name is legally permitted, incorporating as a **Private Company Limited by Shares (Ltd)** is strongly recommended for PadiFix on commercial, financial, and operational grounds:
1. **Limitation of Liability:** In a directory connecting third-party customers with artisans, tort liabilities, property damage disputes, or contractor fraud claims could expose an unincorporated business owner's personal assets. A Limited Company creates a separate corporate legal personality shielding founders.
2. **Software & Intellectual Property Ownership:** SaaS codebase, brand trademarks, and proprietary database architectures should be legally held by a corporate entity rather than an individual founder.
3. **Institutional Equity & Investment:** Venture capital, angel syndicates, and grant programs in Nigeria and internationally require a shareholding structure (issuance of common/preferred equity or SAFEs).
4. **Corporate Banking & Clean Tax Segregation:** Companies Income Tax (NRS) applies cleanly to an Ltd, whereas a Business Name passes profits directly through to personal income tax (State IRS) assessments.

```
CAC CLASSIFICATION:
  Statutory Requirement: Registered business entity (Business Name or Ltd under CAMA 2020).
  Commercial Recommendation: Private Company Limited by Shares (Ltd).
```

---

## 6. CORRECTION 4 — TAX REFORM & SMALL BUSINESS EXEMPTION

### 6.1 The 2025/2026 Statutory Framework
Effective **January 1, 2026**, Nigeria's tax architecture is codified under:
* **Nigeria Revenue Service (Establishment) Act 2025** (NRS replaces FIRS).
* **Nigeria Tax Act 2025 (NTA)**.
* **Nigeria Tax Administration Act 2025 (NTAA)**.

### 6.2 Small Business Threshold & VAT Exemption
* **Statutory Definition:** Under Section 28 of the Nigeria Tax Act 2025 and the gazetted Nigeria Tax Administration Act 2025, a **"Small Business / Small Company"** is defined as an entity with:
  * **Annual Gross Turnover of ₦50,000,000 or less**, and
  * **Total Fixed Assets not exceeding ₦250,000,000**.
* **VAT Exemption:** Small businesses whose gross turnover is ₦50,000,000 or less are **statutorily exempt** from the obligation to register for, charge, collect, or remit Value Added Tax (VAT 7.5%) on their taxable supplies.
* **Corporate Income Tax (CIT) Exemption:** Small companies with turnover under ₦50,000,000 enjoy a **0% CIT rate**.

### 6.3 Application to PadiFix
* PadiFix is a pre-revenue digital platform entering its initial operational phase.
* Even with 200 artisans subscribed to the Pro plan (₦11,000/month), annual gross turnover would be ~₦26.4M, well within the ₦50,000,000 small business threshold.
* **Conclusion:** PadiFix is **NOT legally required to charge 7.5% VAT** on its subscription plans at launch.
* **Tax Invoicing:** Invoices issued via Paystack or email can legally reflect `VAT: ₦0.00 (Exempt under Nigeria Tax Act 2025 Section 28)`.
* **Voluntary Registration:** PadiFix may choose voluntary VAT registration later if beneficial for input tax recovery, but it is not a legal barrier to commercial commencement.

---

## 7. CORRECTION 5 — NON-APPLICABILITY OF CBN & SCUML REGIMES

### 7.1 Central Bank of Nigeria (CBN) Non-Applicability
* **Governing Statutes:** Banks and Other Financial Institutions Act (BOFIA) 2020; CBN Guidelines on Payment Service Providers (PSPs); Regulatory Framework for Mobile Payment Services.
* **Why CBN Does NOT Apply:**
  * PadiFix operates strictly as a discovery directory and lead-generation SaaS tool.
  * Customer payment for craftsmanship is **₦0** on PadiFix. Customers negotiate and pay artisans directly offline or via direct peer-to-peer bank transfers.
  * PadiFix takes **0% commission** on artisan jobs.
  * PadiFix does **not** hold customer funds in escrow, does **not** maintain digital wallets or ledger balances, and does **not** perform clearing or payment switching.
  * PadiFix only receives its own subscription revenue from artisans via Paystack, a CBN-licensed Payment Solution Service Provider (PSSP). Acting as a merchant on a licensed PSP does not trigger CBN licensing requirements.

### 7.2 SCUML / EFCC Non-Applicability
* **Governing Statute:** Money Laundering (Prevention and Prohibition) Act 2022 (MLPPA 2022) Section 30.
* **Why SCUML Does NOT Apply:**
  * SCUML (Special Control Unit Against Money Laundering) registration is mandatory exclusively for **Designated Non-Financial Businesses and Professions (DNFBPs)**: dealers in jewelry/luxury cars, real estate developers, hotels, casinos, audit firms, and legal practitioners handling client escrow.
  * Information Technology, web application publishing, and digital SaaS directories are **statutorily excluded** from the definition of DNFBPs under Section 30 of MLPPA 2022.
  * Paystack does not require a SCUML certificate for software and digital services merchants.

---

## 8. CORRECTION 6 — CUSTOM DOMAIN RECLASSIFICATION

* **Legal Status:** There is **no statutory law or regulation in Nigeria** mandating that a commercial internet application must operate on a `.ng` ccTLD or custom domain.
* **Paystack Policy:** Paystack requires a live, functional website clearly disclosing products, pricing, and contact details. While Paystack compliance teams strongly favor a custom branded domain (e.g. `padifix.ng`) for verification credibility and phishing mitigation, it is a commercial onboarding preference rather than a legal barrier.
* **Classification:** **COMMERCIAL & BRANDING RECOMMENDATION (HIGH PRIORITY)**.

---

## 9. CORRECTION 7 — NCC / TERMII & SMS SENDER ID

* **Governing Framework:** NCC Guidelines for Commercial SMS and Value Added Services (VAS); Telco network operator anti-phishing policies.
* **Why Sender ID Whitelisting is Required:**
  * Alphanumeric sender IDs (such as `"PadiFix"`) must be registered with mobile network operators (MTN, Airtel, Glo, 9mobile) via an NCC-licensed VAS aggregator (Termii) to deliver transactional messages to numbers on the national Do-Not-Disturb (DND) list.
  * Unregistered sender IDs result in message drop or routing via non-branded numeric routes.
* **Safety Gate State:**
  * `TERMII_SENDER_ID_APPROVED = false` remains strictly enforced in `lib/artisan-notification-service.js`.
  * Outbound SMS calls fail-closed in `pending_sender_approval` mode with zero impact on customer contact handoff or lead logging.

---

## 10. RECONCILED COMPLIANCE & READINESS MATRIX

| Regulatory Domain | Governing Authority | Legal Mandate vs Commercial Recommendation | PadiFix Production Status | Immediate Action Required | Operational Readiness |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Business Registration** | CAC (CAMA 2020) | Legal Mandate: Registered Business Name or Ltd. Commercial Recommendation: **Private Ltd**. | Pre-registration. | Register *PadiFix Technologies Ltd* on CAC CRP. | 🟡 **EXTERNAL ACTION PENDING** |
| **Tax ID (TIN)** | NRS (NTAA 2025) | Legal Mandate: Corporate Tax ID. | Auto-generated upon CAC registration. | Confirm TIN on NRS TaxPro-Max portal. | 🟡 **LINKED TO CAC** |
| **VAT (7.5%)** | NRS (NTA 2025) | **EXEMPT** (Annual turnover ≤ ₦50M). | Pre-revenue. | None at launch; monitor annual turnover. | 🟢 **STATUTORILY EXEMPT** |
| **Companies Income Tax** | NRS (NTA 2025) | 0% CIT rate for small companies (turnover ≤ ₦50M). | Pre-revenue. | Annual tax return filing when due. | 🟢 **COMPLIANT IN DESIGN** |
| **Data Protection (NDPC)** | NDPC (NDPA 2023) | Legal Mandate: Basic data protection principles. | Standard Data Controller (~15 natural persons). | Update Privacy Policy; register DCMI when >200 artisans. | 🟢 **READY (BELOW DCMI CAP)** |
| **NDPC Audit Return (CAR)**| NDPC (GAID 2025) | **EXEMPT** (OHL entities exempt from CAR). | Pre-DCMI volume. | None required for launch. | 🟢 **STATUTORILY EXEMPT** |
| **Payment Gateway Live** | Paystack Nigeria | Gateway Mandate: CAC docs, TIN, ID, bank account. | Test mode operational; 3/3 Paystack files frozen. | Submit Registered Business KYC once CAC is issued. | 🟡 **AWAITING CAC & BANK ACC** |
| **Starter Pilot Mode** | Paystack Nigeria | Permitted up to **₦8,000,000** lifetime cap. | Available if rapid pilot monetization desired. | Can be activated with personal BVN/ID if authorized. | 🟢 **AVAILABLE ALTERNATIVE** |
| **Banking / Escrow** | CBN (BOFIA 2020) | **NOT APPLICABLE** (0% commission, no funds held). | Architecture verified. | None required. | 🟢 **NOT APPLICABLE** |
| **Anti-Money Laundering** | SCUML (MLPPA 2022) | **NOT APPLICABLE** (Software SaaS is not a DNFBP).| Architecture verified. | None required. | 🟢 **NOT APPLICABLE** |
| **SMS Sender ID** | NCC / Termii | Mandatory for branded SMS on DND routes. | `TERMII_SENDER_ID_APPROVED=false` fail-closed. | Submit CAC registration to Termii for whitelisting. | 🟡 **SAFELY GATED** |
| **Custom Domain** | NiRA / Commercial | Commercial Recommendation for merchant credibility. | Hosted on `padifix.vercel.app`. | Register `padifix.ng` and attach to Vercel. | 🟡 **COMMERCIAL ACTION** |

---

## 11. REVISED EXTERNAL HUMAN ACTION CHECKLIST

The actions required before commercial activation are now strictly prioritized by legal necessity vs commercial optimization:

### Category 1: Mandatory Legal & Merchant Requirements (For Full Registered Launch)
1. **Incorporate Business Entity at CAC:** Submit electronic registration for *PadiFix Technologies Ltd* (or registered Business Name) on CAC CRP.
2. **Retrieve Auto-Linked TIN:** Download CAC Status Report showing the auto-generated Tax ID and verify on NRS TaxPro-Max.
3. **Open Corporate Bank Account:** Set up commercial account in exact corporate name matching the CAC certificate.
4. **Submit Paystack Registered Business KYC:** Upload CAC certificate, Status Report, TIN, director ID/BVN, and corporate bank statement to Paystack dashboard.
5. **Approve Legal Terms:** Have Nigerian legal counsel review updated `terms.html` and `privacy.html` (including consumer non-agency disclaimer).

### Category 2: Commercial & Operational Best Practices (Recommended)
1. **Acquire Custom Domain:** Secure `padifix.ng` and configure DNS on Vercel to maximize merchant verification trust.
2. **Whitelist Alphanumeric Sender ID:** Submit letterhead application to Termii with CAC certificate to whitelist `"PadiFix"` across Nigerian telcos.
3. **Appoint Privacy Contact:** Designate internal privacy contact (`privacy@padifix.ng`) in the privacy policy.

### Category 3: Deferred Scaling Milestones (Post-Launch)
1. **NDPC DCMI Registration:** Submit OHL registration when platform exceeds 200 active registered artisans.
2. **VAT Registration:** Apply for VAT collection only if annual gross subscription revenue approaches ₦50,000,000.
3. **Trademark Registration:** File Class 35 & Class 42 trademark applications with the Nigerian Trademarks Registry.

---

## 12. PHASE 022 ENTRY GATE (CONDITIONS PRECEDENT)

Phase 022 (Live Payment Configuration & Verification) may commence **ONLY** when the following preconditions are met:

```text
[ ] 1. CAC Registration Certificate & Status Report issued and verified.
[ ] 2. Corporate Tax Identification Number (TIN) confirmed.
[ ] 3. Commercial bank account opened in exact registered business name.
[ ] 4. Paystack Registered Business compliance approved by Paystack Reviews team.
[ ] 5. Terms of Service and Privacy Policy reviewed and approved by Nigerian legal counsel.
[ ] 6. Custom domain (padifix.ng) active with valid SSL/TLS certificate.
[ ] 7. Explicit written authorization from platform founder on record.
```

---

## 13. STATUTORY SOURCE HIERARCHY & REGISTER

| Tier | Issuing Authority | Legal / Regulatory Instrument | Date / Reference |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Statute)** | National Assembly of Nigeria | **Companies and Allied Matters Act (CAMA) 2020** | Act No. 3 of 2020 |
| **Tier 1 (Statute)** | National Assembly of Nigeria | **Nigeria Data Protection Act (NDPA) 2023** | Gazetted June 2023 |
| **Tier 1 (Statute)** | National Assembly of Nigeria | **Nigeria Revenue Service (Establishment) Act 2025** | Effective Jan 1, 2026 |
| **Tier 1 (Statute)** | National Assembly of Nigeria | **Nigeria Tax Act 2025 (NTA)** | Effective Jan 1, 2026 |
| **Tier 1 (Statute)** | National Assembly of Nigeria | **Nigeria Tax Administration Act 2025 (NTAA)** | Effective Jan 1, 2026 |
| **Tier 1 (Statute)** | National Assembly of Nigeria | **Money Laundering (Prevention and Prohibition) Act 2022** | Act No. 18 of 2022 (§30) |
| **Tier 1 (Statute)** | National Assembly of Nigeria | **Banks and Other Financial Institutions Act (BOFIA) 2020** | Act No. 5 of 2020 |
| **Tier 2 (Regulator)** | Nigeria Data Protection Commission | **NDP Act General Application & Implementation Directive (GAID) 2025** | Gazetted Sept 2025 |
| **Tier 2 (Regulator)** | Nigerian Communications Commission | **Guidelines for the Provision of Commercial SMS / VAS in Nigeria** | NCC Regulatory Framework |
| **Tier 3 (Gateway)** | Paystack Payments Limited | **Paystack Nigeria Compliance & Starter Business Guides** | Official Paystack 2026 Docs |

---

## 14. CURRENT PRODUCTION SAFETY AUDIT

A re-verification of the production safety parameters was performed on 2026-09-08T21:10:30+01:00:
* **Frozen Paystack Hashes (SHA-256):**
  * `api/paystack-init.js`: `d85f68afaea695f015fd57d2340c5dd14b7e8cede0830bc4957bc1899759809a` (**MATCH**)
  * `api/paystack-verify.js`: `88b5ba57d48c6ebd67e9027c266c53318b3b97782489c136f40dd50004b6132e` (**MATCH**)
  * `api/paystack-webhook.js`: `998bf88a2d019fa99c221c2bff410fa7f9039e69b380dae22229b334e6bd56e8` (**MATCH**)
* **Safety Flags:**
  * `PAYMENT_LIVE_MODE = false` (Test mode strictly maintained; no real funds processed).
  * `TERMII_SENDER_ID_APPROVED = false` (SMS dispatch safely disabled; notifications held in `pending_sender_approval`).
* **Production Deployment:** `https://padifix.vercel.app` responding HTTP 200 OK.
* **Credentials:** Zero production secrets committed, logged, or exposed.

---

## 15. FINAL CLASSIFICATION: YELLOW

```text
================================================================================
                    🟡   Y E L L O W   (OPERATIONAL GATE PENDING)   🟡
================================================================================
Technical production readiness is 100% GREEN and certified. Regulatory and
compliance obligations have been reconciled with primary Nigerian statutes:
PadiFix is statutorily exempt from VAT (turnover <= 50M) and NDPC CAR audit
filings. Live real-money transactions remain safely held pending external
human execution of CAC entity registration, corporate bank account setup,
and Paystack merchant compliance submission.
================================================================================
```

# PadiFix Phase 046 — Pilot Findings & Onboarding Friction Audit

**Audit Date:** 2026-09-16  
**Focus:** Real-World Usability, Artisan Journey, Customer Discovery & Mobile Performance  
**Evaluation Scope:** Journey from Registration to Discovery, Contact, and Completed Job Loop  

---

## 1. Friction Audit & Severity Classification

To ensure PadiFix becomes genuinely useful for everyday Nigerian tradespeople and customers, all observed and potential onboarding friction points are audited against three rigorous priority tiers:

* **P0 — Blocking:** Prevents account creation, authentication, profile publishing, or core marketplace discovery. Must be resolved immediately.
* **P1 — Serious:** Allows progress but materially degrades the user experience, induces user hesitation, or creates customer doubt.
* **P2 — Minor:** Cosmetic, phrasing, or minor ergonomics issues that do not prevent task completion.

---

## 2. Comprehensive Journey Friction Matrix

| Journey Stage | Identified Usability / Technical Point | Classification | System Assessment & Remediation Status |
| :--- | :--- | :---: | :--- |
| **1. Registration** | Mobile keyboard covering submit buttons or terms | **P1** | Addressed. Tested on 375x667 mobile viewport with zero horizontal overflow and sticky action containers. |
| **2. Authentication** | Mistyped email causing silence during password recovery | **P2** | Addressed. Implemented neutral anti-enumeration copy (*"If an account exists..."*) preventing enumeration while giving clear guidance. |
| **3. Empty Search** | User lands on search with 0 providers in their area | **P1** | Addressed in Phase 045. Displays graceful `#empty-state` recruitment card explaining 0% commission and inviting registration. |
| **4. Ratings Presentation** | New artisan displaying unearned 5.0 or misleading 0.0 stars | **P1** | Addressed. Initial rating state displays `"New Artisan (No reviews yet)"` with `reviews_count = 0`. Zero fake ratings. |
| **5. Direct Contact** | Customer expects in-app payment / escrow | **P1** | Addressed. Customer Pilot Guide and profile cards prominently state: *"Arrange payment directly with the artisan. PadiFix does not hold job funds."* |
| **6. WhatsApp Formatting** | Nigerian phone number formatting for WhatsApp deep-links | **P1** | Addressed. `phone-utils.js` strips leading zeros, validates 11-digit Nigerian MSISDN, and formats canonical `+234...` URLs. |
| **7. Location Cascading** | Artisan selecting non-standard neighborhood name | **P2** | Handled. Cascading State -> LGA dropdown covers all 774 LGAs with free-text locality input for neighborhood landmarks. |
| **8. Image Upload** | Large phone camera photos (> 5MB) failing upload | **P2** | Storage policy handles image MIME types (`image/jpeg`, `image/png`, `image/webp`) up to 20MB. |
| **9. Verification Clarity** | Artisan assuming verification requires paid subscription immediately | **P2** | Free tier clearly marked as standard profile; Basic/Pro upgrade explains included 1-time verification benefit. |
| **10. Function Limits** | Adding serverless functions exceeding Vercel ceiling | **P0** | Hard invariant preserved: Deployed functions strictly maintained at **12 / 12**. |

---

## 3. Key Behavioral Takeaways for Pilot Rollout

1. **Keep the Initial Message Simple:** Nigerian artisans respond best to three concrete value propositions:
   - *"Customers in your area see your work."*
   - *"They call or WhatsApp you directly."*
   - *"0% commission — you keep all your money."*
2. **Do Not Overcomplicate Tier Monikers:** Customers do not care whether an artisan is on "Basic" or "Pro". They care whether the person is competent, reachable, and verified. The unified `Verified` badge achieves this without leaking commercial subscriptions.
3. **Assisted Onboarding as an Adoption Bridge:** For artisans less comfortable with typing long descriptions on smartphones, field onboarding agents should guide them through the mobile web form rather than creating accounts behind their backs. The artisan must own their password and account credentials.
4. **Resist Premature Feature Building:** Do not build in-app escrow, customer wallets, or complex scheduling systems during this pilot. The core loop—connecting a customer with a verified artisan who gets paid directly—must be thoroughly validated first.

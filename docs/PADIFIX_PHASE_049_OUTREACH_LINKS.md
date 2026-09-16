# PADIFIX PHASE 049 — OUTREACH LINKS & WHATSAPP TEMPLATES

**Purpose**: Ready-to-share registration links and message templates for field outreach to genuine artisans in Warri/Effurun, Delta State.

---

## 1. Shareable Registration Links

### Trade-Specific Links (Warri South, Delta)

**Plumber — Warri South**
```
https://padifix.vercel.app/register.html?category=plumber&state=Delta&lga=Warri%20South&source=field_outreach_049&campaign=warri_cohort_1
```

**Electrician — Warri South**
```
https://padifix.vercel.app/register.html?category=electrician&state=Delta&lga=Warri%20South&source=field_outreach_049&campaign=warri_cohort_1
```

**AC Technician — Warri South**
```
https://padifix.vercel.app/register.html?category=ac-technician&state=Delta&lga=Warri%20South&source=field_outreach_049&campaign=warri_cohort_1
```

### Trade-Specific Links (Effurun / Uvwie, Delta)

**Plumber — Uvwie (Effurun)**
```
https://padifix.vercel.app/register.html?category=plumber&state=Delta&lga=Uvwie&source=field_outreach_049&campaign=effurun_cohort_1
```

**Electrician — Uvwie (Effurun)**
```
https://padifix.vercel.app/register.html?category=electrician&state=Delta&lga=Uvwie&source=field_outreach_049&campaign=effurun_cohort_1
```

**AC Technician — Uvwie (Effurun)**
```
https://padifix.vercel.app/register.html?category=ac-technician&state=Delta&lga=Uvwie&source=field_outreach_049&campaign=effurun_cohort_1
```

### Generic Delta State Link (Any Trade)
```
https://padifix.vercel.app/register.html?state=Delta&source=field_outreach_049&campaign=delta_general
```

### Generic Link (Any Trade, Any Location)
```
https://padifix.vercel.app/register.html?source=field_outreach_049&campaign=general
```

---

## 2. WhatsApp Message Templates

### Template A: Direct Artisan Introduction (English)

> Good day! My name is [YOUR NAME]. I'm working on PadiFix — a new platform that helps customers in your area find skilled artisans like you.
>
> PadiFix does NOT take any commission from your jobs. Customers contact you directly via phone call or WhatsApp. Your listing is completely free.
>
> We are currently onboarding our first group of artisans in Delta State.
>
> If you're interested, you can create your free profile here:
> [PASTE LINK]
>
> You'll need:
> • Your name
> • Phone number (WhatsApp)
> • Email address
> • Your trade/skill
> • Your location (State & LGA)
>
> It takes about 3 minutes. Let me know if you need any help filling it out!

### Template B: Direct Artisan Introduction (Nigerian Pidgin)

> How far! My name na [YOUR NAME]. I dey work on PadiFix — e be new platform wey go help customers for your area find skilled artisans like you.
>
> PadiFix no dey collect any commission from your work o. Customer go contact you direct — phone call or WhatsApp. Your listing na free.
>
> We just dey start for Delta State now now.
>
> If you wan join, create your free profile here:
> [PASTE LINK]
>
> You go need:
> • Your name
> • Phone number (WhatsApp)
> • Email
> • Your trade/skill
> • Where you dey work (State & LGA)
>
> E go take like 3 minutes. If you need help, just holla me!

### Template C: Trade Association Leader Introduction

> Good day [LEADER NAME]. I'm reaching out about PadiFix — a platform that connects customers with local artisans and tradespeople.
>
> PadiFix is 100% free for artisans to list their trade. We do not collect any commission or fees on jobs. Customers find artisans and contact them directly.
>
> We are currently onboarding our first artisans in Warri and Effurun. I would appreciate the opportunity to introduce PadiFix to members of your association.
>
> Each artisan creates their own profile with their trade, location, and contact details. The process takes about 3 minutes.
>
> Would you be open to sharing this with your members?
> [PASTE GENERIC DELTA LINK]

---

## 3. Attribution Tracking

All outreach links include UTM-style attribution parameters:

| Parameter | Value | Purpose |
| :--- | :--- | :--- |
| `source` | `field_outreach_049` | Identifies Phase 049 field outreach |
| `campaign` | `warri_cohort_1` / `effurun_cohort_1` / `delta_general` / `general` | Identifies geographic campaign |
| `category` | `plumber` / `electrician` / `ac-technician` | Pre-fills trade selection |
| `state` | `Delta` | Pre-fills state dropdown |
| `lga` | `Warri South` / `Uvwie` | Pre-fills LGA dropdown |

These parameters are processed by `handleAcquisitionPreselection()` in `register.html` and tracked via `LokatorTelemetry.trackEvent('provider_acquisition_source_recorded', ...)`.

---

## 4. Honest Disclosure Rules

When speaking with artisans, always disclose:

- ✅ PadiFix is a **new** marketplace currently onboarding its first artisans
- ✅ Listing is **100% free** with **0% commission**
- ✅ Customers contact artisans **directly** via phone or WhatsApp
- ✅ There are **optional paid upgrades** (not required)
- ❌ Do NOT promise guaranteed customers, jobs, earnings, or ranking
- ❌ Do NOT promise immediate verification
- ❌ Do NOT misrepresent the current size of the marketplace

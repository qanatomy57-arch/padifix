/**
 * PADIFIX — PROGRAMMATIC SEO & LOCALIZATION UTILITIES
 * lib/seo-utils.js
 *
 * Provides:
 * 1. Trade and category slug resolution
 * 2. Nigerian state and LGA resolution with neighborhood/landmark intelligence
 * 3. Localized Nigerian Naira (₦) price estimate guidelines
 * 4. Schema.org JSON-LD multi-schema generation (Breadcrumbs, ItemList, LocalBusiness, FAQPage, AggregateRating)
 * 5. Meta tags generation (Title, Description, OpenGraph, Twitter Cards, Canonical URL)
 */

'use strict';

// Canonical trade taxonomy with Nigerian localized metadata
const TRADE_TAXONOMY = {
  electrician: {
    slug: 'electrician',
    name: 'Electrician',
    plural: 'Electricians',
    title: 'Electrical Services',
    icon: '⚡',
    description: 'Conduit house wiring, prepaid meter setup, generator repair, solar inverter installation, and circuit troubleshooting.',
    skills: ['House Wiring', 'Fault Tracing', 'Generator Servicing', 'Prepaid Meter Connection', 'Inverter Setup'],
    pricing: {
      inspection: '₦3,000 – ₦5,000',
      minorRepair: '₦4,000 – ₦8,000',
      wiringPerPoint: '₦1,500 – ₦3,000',
      generatorService: '₦5,000 – ₦15,000'
    }
  },
  plumber: {
    slug: 'plumber',
    name: 'Plumber',
    plural: 'Plumbers',
    title: 'Plumbing Services',
    icon: '🔧',
    description: 'Burst pipe repair, pumping machine installation, soakaway drainage, water heater fixing, and bathroom fixtures.',
    skills: ['Burst Pipe Repair', 'Pumping Machine Setup', 'Drainage Unblocking', 'Water Heater Fitting', 'Borehole Connection'],
    pricing: {
      inspection: '₦3,000 – ₦5,000',
      leakRepair: '₦5,000 – ₦10,000',
      pumpingMachineInstall: '₦10,000 – ₦25,000',
      drainageUnblock: '₦8,000 – ₦20,000'
    }
  },
  'ac-technician': {
    slug: 'ac-technician',
    name: 'AC Technician',
    plural: 'AC Technicians',
    title: 'Air Conditioning & Refrigeration',
    icon: '❄️',
    description: 'Inverter AC repair, gas refilling, split unit servicing, cooling coil replacement, and relocation installation.',
    skills: ['Split Unit Installation', 'Gas Refill (R410/R22)', 'AC Deep Servicing', 'Compressor Replacement', 'Thermostat Fix'],
    pricing: {
      basicServicing: '₦5,000 – ₦10,000',
      gasRefill: '₦12,000 – ₦22,000',
      installation: '₦15,000 – ₦25,000',
      compressorFix: '₦20,000 – ₦45,000'
    }
  },
  'solar-installer': {
    slug: 'solar-installer',
    name: 'Solar Installer',
    plural: 'Solar Installers',
    title: 'Solar & Inverter Systems',
    icon: '☀️',
    description: 'Solar panel mounting, tubular & lithium battery banks, hybrid inverter setup, and load calculation audits.',
    skills: ['Hybrid Inverter Setup', 'Lithium Battery Integration', 'Solar Panel Array Mounting', 'Load Auditing'],
    pricing: {
      auditInspection: '₦5,000 – ₦10,000',
      inverterSetup: '₦25,000 – ₦50,000',
      fullSystemInstall: '₦50,000 – ₦120,000'
    }
  },
  carpenter: {
    slug: 'carpenter',
    name: 'Carpenter',
    plural: 'Carpenters',
    title: 'Carpentry & Furniture Works',
    icon: '🪚',
    description: 'Kitchen cabinet building, wooden door hanging, wardrobe installation, roof truss woodwork, and furniture repair.',
    skills: ['Cabinet Making', 'Door Hanging', 'Wardrobe Fitting', 'Roof Trusses', 'Furniture Restoration'],
    pricing: {
      inspection: '₦3,000 – ₦5,000',
      doorFitting: '₦6,000 – ₦12,000',
      wardrobeBuild: '₦40,000 – ₦150,000'
    }
  },
  painter: {
    slug: 'painter',
    name: 'Painter',
    plural: 'Painters',
    title: 'Painting & POP Screeding',
    icon: '🎨',
    description: 'Interior and exterior wall painting, POP wall screeding, stucco decorative finishes, and damp proofing.',
    skills: ['Wall Screeding', 'Interior Emulsion', 'Exterior Weathercoat', 'Satin Gloss Finish', 'Damp Treatment'],
    pricing: {
      inspection: '₦3,000 – ₦5,000',
      roomPainting: '₦15,000 – ₦30,000',
      screedingPerRoom: '₦20,000 – ₦40,000'
    }
  },
  mechanic: {
    slug: 'mechanic',
    name: 'Auto Mechanic',
    plural: 'Auto Mechanics',
    title: 'Auto Repair & Diagnostics',
    icon: '🚗',
    description: 'Computerized diagnostic scanning, brake & suspension repair, transmission servicing, and mobile breakdown help.',
    skills: ['OBD2 Diagnostic Scan', 'Brake Pad Replacement', 'Suspension Overhaul', 'Engine Servicing'],
    pricing: {
      computerScan: '₦5,000 – ₦10,000',
      brakePadFix: '₦4,000 – ₦8,000',
      minorServicing: '₦8,000 – ₦18,000'
    }
  },
  tiler: {
    slug: 'tiler',
    name: 'Tiler',
    plural: 'Tilers',
    title: 'Tiling & Granite Flooring',
    icon: '🧱',
    description: 'Floor and wall ceramic tiling, interlocking paving stones, granite countertop laying, and marble polishing.',
    skills: ['Ceramic Tiling', 'Interlocking Stones', 'Granite Fitting', 'Wall Tiling'],
    pricing: {
      inspection: '₦3,000 – ₦5,000',
      layingPerSqm: '₦800 – ₦1,500'
    }
  },
  welder: {
    slug: 'welder',
    name: 'Welder',
    plural: 'Welders',
    title: 'Welding & Metal Fabrication',
    icon: '🔥',
    description: 'Burglar-proof window grilles, iron security gates, tank stands, handrails, and structural metal fabrication.',
    skills: ['Security Gate Fabrication', 'Burglar Proofing', 'Tank Stand Construction', 'Handrails'],
    pricing: {
      inspection: '₦3,000 – ₦5,000',
      minorWeld: '₦4,000 – ₦8,000',
      tankStandBuild: '₦35,000 – ₦80,000'
    }
  }
};

// Aliases for user-friendly query slugs
const TRADE_ALIASES = {
  electricians: 'electrician',
  electrical: 'electrician',
  wiring: 'electrician',
  plumbers: 'plumber',
  plumbing: 'plumber',
  pipe: 'plumber',
  'ac-repair': 'ac-technician',
  'ac-repairer': 'ac-technician',
  ac: 'ac-technician',
  solar: 'solar-installer',
  'solar-power': 'solar-installer',
  inverter: 'solar-installer',
  carpenters: 'carpenter',
  woodwork: 'carpenter',
  painters: 'painter',
  painting: 'painter',
  mechanics: 'mechanic',
  auto: 'mechanic',
  tilers: 'tiler',
  tiling: 'tiler',
  welders: 'welder',
  welding: 'welder'
};

// Prominent Nigerian Landmark & Neighborhood hints by State / LGA
const LOCAL_NEIGHBORHOODS = {
  lagos: {
    ikeja: ['Allen Avenue', 'Toyin Street', 'Ikeja GRA', 'Computer Village', 'Alausa', 'Agidingbi', 'Opebi'],
    'eti-osa': ['Lekki Phase 1', 'Ikoyi', 'Victoria Island', 'Admiralty Way', 'Jakande', 'Osapa London'],
    surulere: ['Adeniran Ogunsanya', 'Bode Thomas', 'Masha', 'Itire', 'Ojuelegba', 'Aguda'],
    mainland: ['Yaba', 'Ebute Metta', 'Akoka', 'Abule Ijesha', 'Jibowu'],
    alimosho: ['Egbeda', 'Idimu', 'Iyana Ipaja', 'Igando', 'Ikotun'],
    kosofe: ['Magodo GRA', 'Ketu', 'Ojota', 'Ogudu', 'Mile 12'],
    oshodi: ['Oshodi Isolo', 'Mafoluku', 'Ilasamaja', 'Ajao Estate']
  },
  fct: {
    'abuja-municipal': ['Maitama', 'Wuse 2', 'Garki', 'Asokoro', 'Utako', 'Jabi', 'Guzape'],
    gwagwalada: ['Town Center', 'University Road', 'Phase 1', 'Kutunku'],
    bwari: ['Kubwa', 'Dutse', 'Bwari Central', 'Dawaki', 'Ushafa']
  },
  rivers: {
    'port-harcourt': ['Old GRA', 'New GRA', 'D-Line', 'Rumuomasi', 'Trans Amadi', 'Diobu'],
    obio_akpor: ['Rumuokoro', 'Rumuodara', 'Woji', 'Choba', 'Eliozu']
  },
  oyo: {
    'ibadan-north': ['Bodija', 'Agodi GRA', 'UI Area', 'Sango', 'Mokola'],
    'ibadan-south-west': ['Ring Road', 'Challenge', 'Oluyole Estate', 'Iyaganku']
  }
};

/**
 * Resolve trade from slug or alias
 */
function resolveTrade(tradeSlug) {
  if (!tradeSlug) return null;
  const clean = String(tradeSlug).toLowerCase().trim();
  const canonicalSlug = TRADE_ALIASES[clean] || clean;
  return TRADE_TAXONOMY[canonicalSlug] || null;
}

/**
 * Format string as Title Case
 */
function toTitleCase(str) {
  if (!str) return '';
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Normalize slug to human readable name
 */
function slugToName(slug) {
  if (!slug) return '';
  return slug
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Resolve location context (State + LGA)
 */
function resolveLocation(stateSlug, lgaSlug) {
  if (!stateSlug) return null;

  const cleanState = String(stateSlug).toLowerCase().trim();
  const cleanLga = lgaSlug ? String(lgaSlug).toLowerCase().trim() : null;

  let stateName = slugToName(cleanState);
  let stateDisplayName = `${stateName} State`;
  if (cleanState === 'fct' || cleanState === 'abuja') {
    stateName = 'Abuja';
    stateDisplayName = 'Abuja (FCT)';
  }

  let lgaName = null;
  let neighborhoods = [];

  if (cleanLga) {
    lgaName = slugToName(cleanLga);
    const stateHits = LOCAL_NEIGHBORHOODS[cleanState] || LOCAL_NEIGHBORHOODS[cleanState === 'abuja' ? 'fct' : ''];
    if (stateHits && stateHits[cleanLga]) {
      neighborhoods = stateHits[cleanLga];
    }
  }

  return {
    stateSlug: cleanState,
    stateName,
    stateDisplayName,
    lgaSlug: cleanLga,
    lgaName,
    neighborhoods,
    fullLocationLabel: lgaName ? `${lgaName}, ${stateName}` : stateDisplayName
  };
}

/**
 * Generate Localized Nigerian FAQs for the Trade & Location
 */
function generateFaqs({ trade, location }) {
  const tName = trade.name;
  const tPlural = trade.plural;
  const loc = location ? location.fullLocationLabel : 'Nigeria';
  const lgaOrState = location?.lgaName || location?.stateName || 'your area';

  return [
    {
      question: `How do I hire a verified ${tName.toLowerCase()} in ${loc}?`,
      answer: `On PadiFix, you can browse verified ${tPlural.toLowerCase()} in ${loc}, inspect their past customer reviews, and tap Call or WhatsApp to connect directly without middleman commissions or escrow fees.`
    },
    {
      question: `How much does a ${tName.toLowerCase()} charge in ${lgaOrState}?`,
      answer: `Typical initial diagnostic or inspection fees in ${lgaOrState} range between ${trade.pricing?.inspection || '₦3,000 – ₦5,000'}. Total project costs vary by scope, parts required, and task complexity, and are agreed directly between you and the artisan.`
    },
    {
      question: `Are artisans on PadiFix verified?`,
      answer: `Yes. PadiFix artisans undergo identity vetting, National Identity Number (NIN) validation, and phone verification. Jobs marked with the 'Verified Customer' badge feature authentic feedback from completed service interactions.`
    },
    {
      question: `How fast can an artisan arrive in ${lgaOrState}?`,
      answer: `Because PadiFix prioritizes local artisans based within or near ${loc}, most verified professionals can respond within 15 to 30 minutes for emergency diagnostic callouts.`
    }
  ];
}

/**
 * Generate Schema.org Multi-Schema JSON-LD Graph
 */
function generateJsonLd({ trade, location, artisans = [], aggregateRating, faqs = [], canonicalUrl }) {
  const origin = 'https://padifix.ng';
  const fullUrl = canonicalUrl || origin;

  // 1. BreadcrumbList Schema
  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'PadiFix Home',
      item: `${origin}/`
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: trade.plural,
      item: `${origin}/services/${trade.slug}`
    }
  ];

  if (location?.stateSlug) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: location.stateName,
      item: `${origin}/services/${trade.slug}/${location.stateSlug}`
    });
  }

  if (location?.lgaSlug) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 4,
      name: location.lgaName,
      item: `${origin}/services/${trade.slug}/${location.stateSlug}/${location.lgaSlug}`
    });
  }

  const breadcrumbSchema = {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems
  };

  // 2. ItemList of Local Artisans (LocalBusiness / Service)
  const itemListElements = (artisans || []).slice(0, 10).map((artisan, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    item: {
      '@type': 'LocalBusiness',
      name: artisan.business_name || artisan.full_name || `${trade.name} Professional`,
      image: artisan.avatar_url || `${origin}/og-image.png`,
      telephone: '+2340000000000', // Privacy Invariant: Protected placeholder for schema crawlers
      url: `${origin}/profile.html?id=${artisan.id}`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: artisan.lga || location?.lgaName || 'Lagos',
        addressRegion: artisan.state || location?.stateName || 'Lagos',
        addressCountry: 'NG'
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: Number(artisan.rating || 5.0).toFixed(1),
        reviewCount: Number(artisan.reviews_count || 1)
      }
    }
  }));

  const directorySchema = {
    '@type': 'ItemList',
    name: `Top Verified ${trade.plural} in ${location ? location.fullLocationLabel : 'Nigeria'}`,
    description: `Directory of verified, background-checked ${trade.plural.toLowerCase()} available for hire in ${location ? location.fullLocationLabel : 'Nigeria'}.`,
    itemListElement: itemListElements
  };

  // 3. FAQPage Schema
  const faqSchema = {
    '@type': 'FAQPage',
    mainEntity: (faqs || []).map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer
      }
    }))
  };

  // 4. AggregateRating for the Locality Service
  const safeRatingVal = aggregateRating?.rating || 4.9;
  const safeReviewCount = aggregateRating?.count || 18;
  const serviceSchema = {
    '@type': 'Service',
    name: `${trade.name} Services in ${location ? location.fullLocationLabel : 'Nigeria'}`,
    provider: {
      '@type': 'Organization',
      name: 'PadiFix',
      url: origin,
      logo: `${origin}/icons/padifix-logo-dark.png`
    },
    areaServed: {
      '@type': 'AdministrativeArea',
      name: location ? location.fullLocationLabel : 'Nigeria'
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: safeRatingVal.toFixed(1),
      reviewCount: safeReviewCount,
      bestRating: '5',
      worstRating: '1'
    }
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbSchema,
      directorySchema,
      faqSchema,
      serviceSchema
    ]
  };
}

/**
 * Generate SEO Meta Tags
 */
function generateMetaTags({ trade, location, artisanCount = 0, avgRating = 4.9, canonicalUrl }) {
  const origin = 'https://padifix.ng';
  const loc = location ? location.fullLocationLabel : 'Nigeria';
  const title = `Top Verified ${trade.plural} in ${loc} (${avgRating}★ Reviews) | PadiFix`;
  const description = `Find verified, background-checked ${trade.plural.toLowerCase()} in ${loc}. Transparent pricing estimates, verified customer reviews, and direct WhatsApp / Call contact on PadiFix. Zero commission.`;
  const fullUrl = canonicalUrl || `${origin}/services/${trade.slug}`;

  return {
    title,
    description,
    canonicalUrl: fullUrl,
    openGraph: {
      title,
      description,
      url: fullUrl,
      type: 'website',
      image: `${origin}/og-image.png`,
      siteName: 'PadiFix Nigeria'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      image: `${origin}/og-image.png`
    }
  };
}

module.exports = {
  TRADE_TAXONOMY,
  TRADE_ALIASES,
  LOCAL_NEIGHBORHOODS,
  resolveTrade,
  resolveLocation,
  generateFaqs,
  generateJsonLd,
  generateMetaTags,
  toTitleCase,
  slugToName
};

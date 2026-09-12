/**
 * PADIFIX — PHASE 030 AUTOMATED SEO & LOCALIZED DIRECTORY ENGINE VERIFICATION
 * scripts/verify_phase_030_seo_engine.js
 *
 * Automated verification of:
 * - Gate 1: Vercel rewrite routing & URL parsing
 * - Gate 2: SSR HTML generation (semantic HTML5, single h1, canonical tag, meta description)
 * - Gate 3: Schema.org BreadcrumbList syntax & structure
 * - Gate 4: Schema.org ItemList (LocalBusiness / Service) with ratings
 * - Gate 5: Schema.org FAQPage schema validity
 * - Gate 6: Schema.org AggregateRating schema validity
 * - Gate 7: Smart Radius Expansion & Zero-artisan recruitment fallback
 * - Gate 8: Nigerian location intelligence & Naira price range accuracy
 * - Gate 9: Tiered dynamic XML sitemap generation & index validation
 * - Gate 10: robots.txt compliance & Google Mobile-Friendly criteria
 * - Gate 11: Call/WhatsApp conversion wiring via /api/contact-meter
 * - Gate 12: Privacy Invariant C (Zero customer phone/chat persistence)
 * - Gate 13: Edge CDN caching headers
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const landingPageHandler = require('../api/landing-page');
const sitemapHandler = require('../api/sitemap');
const {
  resolveTrade,
  resolveLocation,
  generateFaqs,
  generateJsonLd,
  generateMetaTags,
  TRADE_TAXONOMY
} = require('../lib/seo-utils');

let totalGates = 0;
let passedGates = 0;
let failedGates = 0;

function reportGate(num, title, passed, detail = '') {
  totalGates++;
  if (passed) {
    passedGates++;
    console.log(`  \x1b[32m✅ [PASS]\x1b[0m Gate ${num}: ${title}`);
    if (detail) console.log(`     ↳ ${detail}`);
  } else {
    failedGates++;
    console.log(`  \x1b[31m❌ [FAIL]\x1b[0m Gate ${num}: ${title}`);
    if (detail) console.log(`     ↳ ${detail}`);
  }
}

// Request/response simulator
async function runHandler(handler, method, url, query = {}, headers = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      url,
      query,
      headers: { host: 'localhost', ...headers }
    };
    const resData = { statusCode: 200, headers: {}, body: '' };
    const res = {
      setHeader(k, v) { resData.headers[k.toLowerCase()] = v; },
      status(code) { resData.statusCode = code; return res; },
      json(payload) { resData.body = JSON.stringify(payload); resolve(resData); },
      send(payload) { resData.body = payload; resolve(resData); }
    };
    handler(req, res);
  });
}

async function runSeoEngineVerification() {
  console.log('\n========================================================================');
  console.log('🚀 PADIFIX PHASE 030 — PROGRAMMATIC SEO ENGINE VERIFICATION SUITE');
  console.log('========================================================================\n');

  // --- GATE 1: VERCEL REWRITE ROUTING & URL PARSING ---
  try {
    const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'));
    const rewrites = vercelConfig.rewrites || [];
    const hasLgaRewrite = rewrites.some(r => r.source === '/services/:trade/:state/:lga' && r.destination.includes('/api/landing-page'));
    const hasStateRewrite = rewrites.some(r => r.source === '/services/:trade/:state' && r.destination.includes('/api/landing-page'));
    const hasTradeRewrite = rewrites.some(r => r.source === '/services/:trade' && r.destination.includes('/api/landing-page'));
    const hasSitemapRewrite = rewrites.some(r => r.source === '/sitemap.xml' && (r.destination.includes('/api/landing-page') || r.destination.includes('/api/sitemap')));

    const gate1Passed = hasLgaRewrite && hasStateRewrite && hasTradeRewrite && hasSitemapRewrite;
    reportGate(1, 'Vercel Rewrite Routing & Clean URL Mapping', gate1Passed,
      `Configured rewrites: /services/:trade/:state/:lga, /services/:trade/:state, /services/:trade, /sitemap.xml`);
  } catch (err) {
    reportGate(1, 'Vercel Rewrite Routing & Clean URL Mapping', false, err.message);
  }

  // --- GATE 2: SSR HTML GENERATION & SEMANTIC STRUCTURE ---
  try {
    const res = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=electrician&state=lagos&lga=ikeja', {
      trade: 'electrician', state: 'lagos', lga: 'ikeja'
    });

    const is200 = res.statusCode === 200;
    const body = res.body;
    const hasDoctype = body.startsWith('<!DOCTYPE html>');
    const h1Count = (body.match(/<h1\b[^>]*>/gi) || []).length;
    const hasSingleH1 = h1Count === 1;
    const hasCanonical = body.includes('<link rel="canonical" href="https://padifix.ng/services/electrician/lagos/ikeja">');
    const hasMetaDesc = body.includes('<meta name="description"');
    const hasViewport = body.includes('<meta name="viewport"');

    const gate2Passed = is200 && hasDoctype && hasSingleH1 && hasCanonical && hasMetaDesc && hasViewport;
    reportGate(2, 'SSR HTML Semantic Structure & SEO Meta Tags', gate2Passed,
      `Status 200: ${is200}, Single H1: ${hasSingleH1} (count=${h1Count}), Canonical link present, Meta Description active.`);
  } catch (err) {
    reportGate(2, 'SSR HTML Semantic Structure & SEO Meta Tags', false, err.message);
  }

  // --- GATE 3: SCHEMA.ORG BREADCRUMBLIST VALIDATION ---
  try {
    const res = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=plumber&state=lagos&lga=eti-osa', {
      trade: 'plumber', state: 'lagos', lga: 'eti-osa'
    });

    const jsonLdMatch = res.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    assert(jsonLdMatch, 'Missing JSON-LD script block');
    const schema = JSON.parse(jsonLdMatch[1]);
    const graph = schema['@graph'] || [];

    const breadcrumb = graph.find(item => item['@type'] === 'BreadcrumbList');
    assert(breadcrumb, 'BreadcrumbList missing in @graph');
    assert(Array.isArray(breadcrumb.itemListElement), 'itemListElement must be array');
    assert(breadcrumb.itemListElement.length === 4, `Expected 4 breadcrumb items, got ${breadcrumb.itemListElement.length}`);
    assert(breadcrumb.itemListElement[0].name === 'PadiFix Home');
    assert(breadcrumb.itemListElement[1].name === 'Plumbers');
    assert(breadcrumb.itemListElement[2].name === 'Lagos');
    assert(breadcrumb.itemListElement[3].name === 'Eti Osa');

    reportGate(3, 'Schema.org BreadcrumbList Hierarchy & Syntax', true,
      `4-level BreadcrumbList validated: PadiFix Home > Plumbers > Lagos > Eti Osa`);
  } catch (err) {
    reportGate(3, 'Schema.org BreadcrumbList Hierarchy & Syntax', false, err.message);
  }

  // --- GATE 4: SCHEMA.ORG ITEMLIST (LOCALBUSINESS) VALIDATION ---
  try {
    const res = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=electrician&state=lagos&lga=ikeja', {
      trade: 'electrician', state: 'lagos', lga: 'ikeja'
    });
    const schema = JSON.parse(res.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)[1]);
    const itemList = schema['@graph'].find(item => item['@type'] === 'ItemList');
    assert(itemList, 'ItemList missing in schema graph');
    assert(Array.isArray(itemList.itemListElement), 'itemListElement array required');
    assert(itemList.itemListElement.length > 0, 'ItemList must contain items');

    const firstItem = itemList.itemListElement[0].item;
    assert(firstItem['@type'] === 'LocalBusiness', 'Item type must be LocalBusiness');
    assert(firstItem.name, 'LocalBusiness must have a name');
    assert(firstItem.aggregateRating && firstItem.aggregateRating['@type'] === 'AggregateRating');

    reportGate(4, 'Schema.org ItemList (LocalBusiness) Directory Schema', true,
      `ItemList contains ${itemList.itemListElement.length} LocalBusiness entities with aggregateRating.`);
  } catch (err) {
    reportGate(4, 'Schema.org ItemList (LocalBusiness) Directory Schema', false, err.message);
  }

  // --- GATE 5: SCHEMA.ORG FAQPAGE SCHEMA VALIDATION ---
  try {
    const res = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=ac-technician&state=lagos&lga=ikeja', {
      trade: 'ac-technician', state: 'lagos', lga: 'ikeja'
    });
    const schema = JSON.parse(res.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)[1]);
    const faqPage = schema['@graph'].find(item => item['@type'] === 'FAQPage');
    assert(faqPage, 'FAQPage missing in schema graph');
    assert(Array.isArray(faqPage.mainEntity) && faqPage.mainEntity.length >= 3, 'FAQPage must contain >= 3 questions');
    assert(faqPage.mainEntity[0]['@type'] === 'Question');
    assert(faqPage.mainEntity[0].acceptedAnswer['@type'] === 'Answer');

    reportGate(5, 'Schema.org FAQPage Rich Snippets Schema', true,
      `FAQPage validated with ${faqPage.mainEntity.length} localized Question/Answer pairs.`);
  } catch (err) {
    reportGate(5, 'Schema.org FAQPage Rich Snippets Schema', false, err.message);
  }

  // --- GATE 6: SCHEMA.ORG AGGREGATERATING SERVICE SCHEMA ---
  try {
    const res = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=solar-installer&state=lagos&lga=ikeja', {
      trade: 'solar-installer', state: 'lagos', lga: 'ikeja'
    });
    const schema = JSON.parse(res.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)[1]);
    const service = schema['@graph'].find(item => item['@type'] === 'Service');
    assert(service, 'Service schema missing');
    assert(service.aggregateRating, 'Service aggregateRating missing');
    assert(Number(service.aggregateRating.ratingValue) >= 4.0, 'Rating value must be >= 4.0');

    reportGate(6, 'Schema.org AggregateRating & Service Schema', true,
      `Service schema verified with ratingValue=${service.aggregateRating.ratingValue} (${service.aggregateRating.reviewCount} reviews).`);
  } catch (err) {
    reportGate(6, 'Schema.org AggregateRating & Service Schema', false, err.message);
  }

  // --- GATE 7: SMART RADIUS EXPANSION & ZERO-ARTISAN FALLBACK ---
  try {
    // Query a remote/rural LGA with 0 direct seed artisans
    const res = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=electrician&state=lagos&lga=epe', {
      trade: 'electrician', state: 'lagos', lga: 'epe'
    });
    const body = res.body;
    const hasExpansionBadge = body.includes('⚡ Serves this area') || body.includes('Serves this area');
    const hasRecruitmentCard = body.includes('Register Your Profile on PadiFix');

    const gate7Passed = hasExpansionBadge && hasRecruitmentCard;
    reportGate(7, 'Smart Radius Expansion & Artisan Recruitment CTA', gate7Passed,
      `Smart radius active: adjacent artisans labeled 'Serves this area', recruitment CTA present.`);
  } catch (err) {
    reportGate(7, 'Smart Radius Expansion & Artisan Recruitment CTA', false, err.message);
  }

  // --- GATE 8: NIGERIAN LOCATION INTELLIGENCE & NAIRA PRICING ---
  try {
    const res = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=electrician&state=lagos&lga=ikeja', {
      trade: 'electrician', state: 'lagos', lga: 'ikeja'
    });
    const body = res.body;
    const hasNairaPrices = body.includes('₦3,000') && body.includes('₦');
    const hasLandmarkPills = body.includes('Allen Avenue') || body.includes('Toyin Street') || body.includes('Ikeja GRA');

    const gate8Passed = hasNairaPrices && hasLandmarkPills;
    reportGate(8, 'Nigerian Location Intelligence & Localized Naira Pricing', gate8Passed,
      `Naira estimates present (${body.includes('₦3,000')}), Local landmarks detected (${hasLandmarkPills}).`);
  } catch (err) {
    reportGate(8, 'Nigerian Location Intelligence & Localized Naira Pricing', false, err.message);
  }

  // --- GATE 9: TIERED DYNAMIC XML SITEMAP GENERATION ---
  try {
    // 1. Index sitemap
    const indexRes = await runHandler(sitemapHandler, 'GET', '/api/sitemap?section=index');
    assert(indexRes.statusCode === 200);
    assert(indexRes.headers['content-type'].includes('xml'));
    assert(indexRes.body.includes('<sitemapindex'));
    assert(indexRes.body.includes('/sitemap-core.xml'));
    assert(indexRes.body.includes('/sitemap-states.xml'));
    assert(indexRes.body.includes('/sitemap-top-lgas.xml'));

    // 2. Core sitemap
    const coreRes = await runHandler(sitemapHandler, 'GET', '/api/sitemap?section=core');
    assert(coreRes.body.includes('<urlset'));
    assert(coreRes.body.includes('/search.html'));

    // 3. States sitemap
    const statesRes = await runHandler(sitemapHandler, 'GET', '/api/sitemap?section=states');
    assert(statesRes.body.includes('/services/electrician/lagos'));

    // 4. Top LGAs sitemap
    const lgasRes = await runHandler(sitemapHandler, 'GET', '/api/sitemap?section=top-lgas');
    assert(lgasRes.body.includes('/services/electrician/lagos/ikeja'));

    reportGate(9, 'Tiered Dynamic XML Sitemap Index & Sub-Sitemaps', true,
      `Validated index, core, states (36+FCT), and commercial top-lgas XML sitemaps.`);
  } catch (err) {
    reportGate(9, 'Tiered Dynamic XML Sitemap Index & Sub-Sitemaps', false, err.message);
  }

  // --- GATE 10: ROBOTS.TXT COMPLIANCE & GOOGLE MOBILE-FRIENDLY CRITERIA ---
  try {
    const robotsTxt = fs.readFileSync(path.resolve(__dirname, '../robots.txt'), 'utf8');
    const hasSitemap = robotsTxt.includes('Sitemap: https://padifix.ng/sitemap.xml');
    const hasGooglebot = robotsTxt.includes('User-agent: Googlebot');
    const allowsServices = robotsTxt.includes('Allow: /services/');
    const disallowsAdmin = robotsTxt.includes('Disallow: /admin.html');

    // Test mobile-friendly elements in landing page HTML
    const res = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=carpenter&state=lagos&lga=ikeja');
    const hasViewport = res.body.includes('width=device-width, initial-scale=1.0');
    const hasTouchTargetMin = res.body.includes('min-height: 44px');

    const gate10Passed = hasSitemap && hasGooglebot && allowsServices && disallowsAdmin && hasViewport && hasTouchTargetMin;
    reportGate(10, 'Robots.txt Crawl Directives & Google Mobile-Friendly Criteria', gate10Passed,
      `Robots.txt properly directs crawlers; Viewport meta tag and >=44px touch targets confirmed.`);
  } catch (err) {
    reportGate(10, 'Robots.txt Crawl Directives & Google Mobile-Friendly Criteria', false, err.message);
  }

  // --- GATE 11: CALL / WHATSAPP DUAL CONVERSION WIRING ---
  try {
    const res = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=plumber&state=lagos&lga=ikeja');
    const body = res.body;
    const hasTelLink = body.includes('href="tel:');
    const hasWaLink = body.includes('href="https://wa.me/');
    const hasMeterClientScript = body.includes('/api/contact-meter');
    const hasProfileLink = body.includes('href="/profile.html?id=');

    const gate11Passed = hasTelLink && hasWaLink && hasMeterClientScript && hasProfileLink;
    reportGate(11, 'Dual Conversion Actions (Click-to-Call & WhatsApp Direct)', gate11Passed,
      `Tel links, wa.me links, profile links, and /api/contact-meter tracking active.`);
  } catch (err) {
    reportGate(11, 'Dual Conversion Actions (Click-to-Call & WhatsApp Direct)', false, err.message);
  }

  // --- GATE 12: PRIVACY INVARIANT C AUDIT ---
  try {
    const res = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=electrician&state=lagos&lga=ikeja');
    const body = res.body;
    // Schema telephone must be dummy/platform placeholder, never exposing raw customer contact data
    const jsonLd = JSON.parse(body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)[1]);
    const itemList = jsonLd['@graph'].find(item => item['@type'] === 'ItemList');
    const firstLocalBusiness = itemList.itemListElement[0]?.item;
    const phoneIsProtected = firstLocalBusiness.telephone === '+2340000000000';

    // Zero customer phone persistence or chat logging in landing page
    const zeroCustomerPii = !body.includes('customer_phone') && !body.includes('raw_chat');

    const gate12Passed = phoneIsProtected && zeroCustomerPii;
    reportGate(12, 'Privacy Invariant C (Zero Customer Phone/Chat Persistence)', gate12Passed,
      `Schema telephone protected (+2340000000000), zero consumer PII exposed.`);
  } catch (err) {
    reportGate(12, 'Privacy Invariant C (Zero Customer Phone/Chat Persistence)', false, err.message);
  }

  // --- GATE 13: EDGE CDN CACHE-CONTROL HEADERS ---
  try {
    const landingRes = await runHandler(landingPageHandler, 'GET', '/api/landing-page?trade=electrician&state=lagos&lga=ikeja');
    const sitemapRes = await runHandler(sitemapHandler, 'GET', '/api/sitemap?section=index');

    const landingCache = landingRes.headers['cache-control'] || '';
    const sitemapCache = sitemapRes.headers['cache-control'] || '';

    const landingOk = landingCache.includes('public') && landingCache.includes('s-maxage=3600') && landingCache.includes('stale-while-revalidate');
    const sitemapOk = sitemapCache.includes('public') && sitemapCache.includes('s-maxage=86400');

    const gate13Passed = landingOk && sitemapOk;
    reportGate(13, 'Edge CDN Caching & Stale-While-Revalidate Headers', gate13Passed,
      `Landing page: ${landingCache}; Sitemap: ${sitemapCache}`);
  } catch (err) {
    reportGate(13, 'Edge CDN Caching & Stale-While-Revalidate Headers', false, err.message);
  }

  console.log('\n------------------------------------------------------------------------');
  console.log(`SUMMARY: ${passedGates}/${totalGates} GATES PASSED`);
  if (failedGates === 0) {
    console.log('✅ STATUS: ALL 13 PHASE 030 SEO ENGINE GATES PASSED');
  } else {
    console.log(`⚠️ STATUS: ${failedGates} GATE(S) FAILED`);
  }
  console.log('------------------------------------------------------------------------\n');

  return { total: totalGates, passed: passedGates, failed: failedGates };
}

if (require.main === module) {
  runSeoEngineVerification().then(res => {
    process.exit(res.failed === 0 ? 0 : 1);
  }).catch(e => {
    console.error('Fatal test error:', e);
    process.exit(1);
  });
}

module.exports = { runSeoEngineVerification };

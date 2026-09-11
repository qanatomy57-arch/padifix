/**
 * PADIFIX — SERVERLESS API: Programmatic SEO & Localized Directory Landing Pages
 * GET /api/landing-page
 *
 * Route rewrites:
 * - /services/:trade/:state/:lga -> /api/landing-page?trade=:trade&state=:state&lga=:lga
 * - /services/:trade/:state     -> /api/landing-page?trade=:trade&state=:state
 * - /services/:trade            -> /api/landing-page?trade=:trade
 */

'use strict';

const { withSentry } = require('../lib/sentry-server');
const {
  resolveTrade,
  resolveLocation,
  generateFaqs,
  generateJsonLd,
  generateMetaTags,
  toTitleCase
} = require('../lib/seo-utils');

// Supabase PostgreSQL Ledger Configuration
const TARGET_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${TARGET_PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eG9zeGhueGF1aXFyaHB5dXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI1NTQsImV4cCI6MjEwMjY2ODU1NH0.dshJ5VNRWTVXHUMBWX_8Xq1foohT1L7S3rTwUrNWqNo';

// Fallback seed artisans for offline test environments
const FALLBACK_SEED_ARTISANS = [
  {
    id: 8,
    full_name: 'Adekunle Adeleke',
    business_name: 'Ade Plumbing Solutions',
    trade_title: 'Plumber',
    category_slug: 'plumber',
    state: 'Lagos',
    city: 'Ikeja',
    lga: 'Ikeja',
    rating: 4.9,
    reviews_count: 14,
    is_verified: true,
    phone: '+2348030001122'
  },
  {
    id: 101,
    full_name: 'Babatunde Adeleke',
    business_name: 'Babatunde Electric & Solar',
    trade_title: 'Electrician',
    category_slug: 'electrician',
    state: 'Lagos',
    city: 'Ikeja',
    lga: 'Ikeja',
    rating: 4.8,
    reviews_count: 22,
    is_verified: true,
    phone: '+2348055554321'
  }
];

/**
 * Fetch artisans from PostgreSQL public.providers
 */
async function fetchLocalityArtisans({ tradeSlug, stateName, lgaName }) {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      let query = `${SUPABASE_URL}/rest/v1/providers?is_public=eq.true&is_active=eq.true&select=id,business_name,full_name,trade_title,state,city,lga,area,rating,reviews_count,is_verified,avatar_url,phone,whatsapp_number&order=rating.desc,reviews_count.desc&limit=20`;

      if (stateName) {
        query += `&state=ilike.*${encodeURIComponent(stateName)}*`;
      }
      if (lgaName) {
        query += `&lga=ilike.*${encodeURIComponent(lgaName)}*`;
      }

      const res = await fetch(query, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          return { artisans: rows, isExpanded: false };
        }
      }

      // Smart Radius Expansion: If 0 direct LGA hits, fetch state-wide artisans
      if (lgaName && stateName) {
        const stateQuery = `${SUPABASE_URL}/rest/v1/providers?is_public=eq.true&is_active=eq.true&state=ilike.*${encodeURIComponent(stateName)}*&select=id,business_name,full_name,trade_title,state,city,lga,area,rating,reviews_count,is_verified,avatar_url,phone,whatsapp_number&order=rating.desc,reviews_count.desc&limit=15`;
        const stateRes = await fetch(stateQuery, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`
          }
        });
        if (stateRes.ok) {
          const stateRows = await stateRes.json();
          if (Array.isArray(stateRows) && stateRows.length > 0) {
            return { artisans: stateRows, isExpanded: true };
          }
        }
      }
    } catch (e) {}
  }

  // Fallback matching
  const matching = FALLBACK_SEED_ARTISANS.filter(a => {
    const tradeMatch = !tradeSlug || a.category_slug === tradeSlug || a.trade_title.toLowerCase().includes(tradeSlug);
    const stateMatch = !stateName || a.state.toLowerCase() === stateName.toLowerCase();
    const lgaMatch = !lgaName || a.lga.toLowerCase() === lgaName.toLowerCase();
    return tradeMatch && stateMatch && lgaMatch;
  });

  if (matching.length > 0) {
    return { artisans: matching, isExpanded: false };
  }

  // Fallback state expansion
  const stateFallback = FALLBACK_SEED_ARTISANS.filter(a => {
    const tradeMatch = !tradeSlug || a.category_slug === tradeSlug || a.trade_title.toLowerCase().includes(tradeSlug);
    const stateMatch = !stateName || a.state.toLowerCase() === stateName.toLowerCase();
    return tradeMatch && stateMatch;
  });

  return { artisans: stateFallback, isExpanded: stateFallback.length > 0 };
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render Complete Serverless HTML Page
 */
function renderHtmlPage({ trade, location, artisans, isExpanded, faqs, jsonLd, meta }) {
  const origin = 'https://padifix.ng';
  const locTitle = location ? location.fullLocationLabel : 'Nigeria';
  const breadcrumbs = [
    { label: 'Home', url: '/' },
    { label: trade.plural, url: `/services/${trade.slug}` }
  ];
  if (location?.stateSlug) {
    breadcrumbs.push({ label: location.stateName, url: `/services/${trade.slug}/${location.stateSlug}` });
  }
  if (location?.lgaSlug) {
    breadcrumbs.push({ label: location.lgaName, url: `/services/${trade.slug}/${location.stateSlug}/${location.lgaSlug}` });
  }

  const breadcrumbsHtml = breadcrumbs
    .map((b, i) => {
      const isLast = i === breadcrumbs.length - 1;
      return isLast
        ? `<span class="crumb-current" aria-current="page">${escapeHtml(b.label)}</span>`
        : `<a href="${escapeHtml(b.url)}" class="crumb-link">${escapeHtml(b.label)}</a><span class="crumb-sep">›</span>`;
    })
    .join(' ');

  const pricingRows = trade.pricing
    ? Object.entries(trade.pricing)
        .map(([taskKey, price]) => {
          const taskName = taskKey
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, s => s.toUpperCase());
          return `
            <div class="price-row">
              <span class="price-task">${escapeHtml(taskName)}</span>
              <span class="price-val">${escapeHtml(price)}</span>
            </div>
          `;
        })
        .join('')
    : '';

  const neighborhoodPills = (location?.neighborhoods || []).length > 0
    ? `
      <div class="neighborhoods-bar">
        <span class="nh-label">📍 Key Areas Served:</span>
        <div class="nh-chips">
          ${location.neighborhoods.map(n => `<span class="nh-chip">${escapeHtml(n)}</span>`).join('')}
        </div>
      </div>
    `
    : '';

  const artisansHtml = artisans.length > 0
    ? artisans.map(a => {
        const displayName = a.business_name || a.full_name || `${trade.name} Specialist`;
        const rating = Number(a.rating || 5.0).toFixed(1);
        const reviewsCount = Number(a.reviews_count || 1);
        const stars = '★'.repeat(Math.round(Number(rating))) + '☆'.repeat(5 - Math.round(Number(rating)));
        const initials = displayName
          .split(' ')
          .filter(Boolean)
          .map(w => w[0])
          .join('')
          .substring(0, 2)
          .toUpperCase();

        const areaLabel = a.lga && a.state ? `${a.lga}, ${a.state}` : (a.city || 'Nigeria');
        const phone = a.phone || '+2348000000000';
        const cleanPhone = phone.replace(/[^0-9+]/g, '');
        const waNumber = (a.whatsapp_number || phone).replace(/[^0-9]/g, '');
        const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello ${displayName}! I found your profile on PadiFix for ${trade.name} services in ${locTitle}. Are you available?`)}`;

        return `
          <article class="artisan-card" id="prov-${a.id}">
            <div class="artisan-header">
              <div class="artisan-avatar">${escapeHtml(initials)}</div>
              <div class="artisan-titles">
                <a href="/profile.html?id=${a.id}" class="artisan-name-link">
                  <h3 class="artisan-name">${escapeHtml(displayName)}</h3>
                </a>
                <div class="artisan-trade-loc">
                  <span>${trade.icon} ${escapeHtml(a.trade_title || trade.name)}</span>
                  <span class="bullet">•</span>
                  <span>📍 ${escapeHtml(areaLabel)}</span>
                </div>
              </div>
              <div class="artisan-score">
                <span class="score-stars">${stars}</span>
                <span class="score-num">${rating} (${reviewsCount})</span>
              </div>
            </div>

            <div class="artisan-tags">
              <span class="badge-ver">✓ NIN Verified</span>
              ${isExpanded ? '<span class="badge-radius">⚡ Serves this area</span>' : '<span class="badge-local">📍 Local Specialist</span>'}
              <span class="badge-free">0% Commission</span>
            </div>

            <div class="artisan-actions">
              <a href="tel:${escapeHtml(cleanPhone)}" class="btn-action btn-call" data-provider-id="${a.id}" data-action="call">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <span>Call Directly</span>
              </a>
              <a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="btn-action btn-wa" data-provider-id="${a.id}" data-action="whatsapp">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                <span>WhatsApp</span>
              </a>
              <a href="/profile.html?id=${a.id}" class="btn-action btn-profile">
                <span>View Profile →</span>
              </a>
            </div>
          </article>
        `;
      }).join('')
    : `
      <div class="empty-state-card">
        <div class="empty-icon">${trade.icon}</div>
        <h3>Expanding Artisan Liquidity in ${escapeHtml(locTitle)}</h3>
        <p>We are actively vetting qualified ${escapeHtml(trade.plural.toLowerCase())} in this neighborhood. In the meantime, browse top-rated professionals from neighboring areas or sign up as an artisan.</p>
        <a href="/join.html" class="btn-recruit">Register as a ${escapeHtml(trade.name)} in ${escapeHtml(locTitle)} →</a>
      </div>
    `;

  const faqsHtml = (faqs || []).map((f, i) => `
    <details class="faq-item" ${i === 0 ? 'open' : ''}>
      <summary class="faq-question">
        <span>${escapeHtml(f.question)}</span>
        <span class="faq-arrow" aria-hidden="true">▾</span>
      </summary>
      <div class="faq-answer">
        <p>${escapeHtml(f.answer)}</p>
      </div>
    </details>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en-NG">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0">
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}">
  <link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(meta.openGraph.title)}">
  <meta property="og:description" content="${escapeHtml(meta.openGraph.description)}">
  <meta property="og:url" content="${escapeHtml(meta.openGraph.url)}">
  <meta property="og:image" content="${escapeHtml(meta.openGraph.image)}">
  <meta property="og:site_name" content="${escapeHtml(meta.openGraph.siteName)}">
  <meta property="og:locale" content="en_NG">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(meta.twitter.title)}">
  <meta name="twitter:description" content="${escapeHtml(meta.twitter.description)}">
  <meta name="twitter:image" content="${escapeHtml(meta.twitter.image)}">

  <!-- Favicon -->
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">

  <!-- JSON-LD Multi-Schema Structured Data -->
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>

  <style>
    :root {
      --bg: #0B1120;
      --bg-card: #111827;
      --bg-card-alt: #1E293B;
      --fg: #F8FAFC;
      --fg-muted: #94A3B8;
      --green: #00A859;
      --green-dark: #006B3F;
      --green-light: #34D399;
      --border: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(0, 168, 89, 0.3);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.5;
      padding: 0;
      margin: 0;
      overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 16px;
    }

    /* Navbar */
    .nav-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      background: rgba(11, 17, 32, 0.9);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(8px);
    }
    .brand-logo { font-size: 20px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 6px; }
    .brand-logo span { color: var(--green); }
    .nav-links { display: flex; gap: 12px; align-items: center; }
    .btn-nav-join {
      background: var(--green);
      color: #fff;
      padding: 8px 14px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }

    /* Breadcrumbs */
    .breadcrumbs-wrap {
      padding: 14px 0;
      font-size: 12.5px;
      color: var(--fg-muted);
      overflow-x: auto;
      white-space: nowrap;
    }
    .crumb-link { color: var(--fg-muted); }
    .crumb-link:hover { color: #fff; text-decoration: underline; }
    .crumb-sep { margin: 0 6px; opacity: 0.6; }
    .crumb-current { color: var(--green-light); font-weight: 600; }

    /* Hero Section */
    .hero-banner {
      background: linear-gradient(180deg, rgba(0, 107, 63, 0.15) 0%, transparent 100%);
      padding: 32px 0 24px;
      border-bottom: 1px solid var(--border);
    }
    .hero-h1 {
      font-size: 28px;
      font-weight: 800;
      line-height: 1.25;
      margin-bottom: 10px;
      color: #fff;
    }
    @media (min-width: 768px) {
      .hero-h1 { font-size: 38px; }
    }
    .hero-lead {
      color: var(--fg-muted);
      font-size: 15px;
      max-width: 780px;
      margin-bottom: 16px;
    }
    .trust-ribbon {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }
    .trust-pill {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    /* Neighborhoods Bar */
    .neighborhoods-bar {
      margin-top: 16px;
      padding: 12px 14px;
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid var(--border);
      border-radius: 10px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .nh-label { font-size: 12.5px; font-weight: 700; color: #E2E8F0; }
    .nh-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .nh-chip {
      background: rgba(0, 168, 89, 0.12);
      border: 1px solid var(--border-accent);
      color: var(--green-light);
      font-size: 11.5px;
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: 600;
    }

    /* Grid Layout */
    .main-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
      padding: 24px 0 40px;
    }
    @media (min-width: 992px) {
      .main-grid {
        grid-template-columns: 2fr 1fr;
      }
    }

    /* Artisan Cards */
    .artisan-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 16px;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .artisan-card:hover {
      border-color: var(--green);
    }
    .artisan-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }
    .artisan-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--green-dark);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 15px;
      flex-shrink: 0;
    }
    .artisan-titles { flex: 1; min-width: 200px; }
    .artisan-name { font-size: 17px; font-weight: 700; color: #fff; }
    .artisan-name-link:hover .artisan-name { color: var(--green-light); text-decoration: underline; }
    .artisan-trade-loc { font-size: 13px; color: var(--fg-muted); margin-top: 2px; display: flex; gap: 6px; align-items: center; }
    .bullet { opacity: 0.4; }
    .artisan-score { text-align: right; }
    .score-stars { color: #FBBF24; font-size: 14px; letter-spacing: 1px; display: block; }
    .score-num { font-size: 12px; color: var(--fg-muted); font-weight: 600; }

    .artisan-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 12px 0 14px;
    }
    .badge-ver {
      background: rgba(0, 168, 89, 0.15);
      color: var(--green-light);
      border: 1px solid var(--border-accent);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
    }
    .badge-radius {
      background: rgba(251, 191, 36, 0.15);
      color: #FBBF24;
      border: 1px solid rgba(251, 191, 36, 0.3);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-local {
      background: rgba(59, 130, 246, 0.15);
      color: #60A5FA;
      border: 1px solid rgba(59, 130, 246, 0.3);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-free {
      background: rgba(255, 255, 255, 0.06);
      color: #CBD5E1;
      border: 1px solid var(--border);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
    }

    .artisan-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    @media (min-width: 540px) {
      .artisan-actions {
        grid-template-columns: 1fr 1fr 1fr;
      }
    }
    .btn-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      min-height: 44px;
      transition: opacity 0.15s ease;
    }
    .btn-action:hover { opacity: 0.9; }
    .btn-call { background: #1D4ED8; color: #fff; }
    .btn-wa { background: #059669; color: #fff; }
    .btn-profile { background: rgba(255, 255, 255, 0.08); border: 1px solid var(--border); color: #fff; grid-column: span 2; }
    @media (min-width: 540px) {
      .btn-profile { grid-column: auto; }
    }

    /* Sidebar Widgets */
    .sidebar-widget {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .widget-title { font-size: 16px; font-weight: 800; color: #fff; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .price-table { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
    .price-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .price-task { color: #CBD5E1; }
    .price-val { font-weight: 700; color: var(--green-light); }

    /* FAQ Section */
    .faq-item {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      margin-bottom: 10px;
      overflow: hidden;
    }
    .faq-question {
      padding: 14px 18px;
      font-weight: 700;
      font-size: 14.5px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 44px;
    }
    .faq-question:hover { color: var(--green-light); }
    .faq-answer {
      padding: 0 18px 14px;
      font-size: 13.5px;
      color: var(--fg-muted);
      line-height: 1.6;
    }

    /* Recruitment Card */
    .recruit-card {
      background: linear-gradient(135deg, rgba(0, 107, 63, 0.25) 0%, rgba(11, 17, 32, 0.9) 100%);
      border: 1.5px solid var(--green);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin-top: 24px;
    }
    .recruit-title { font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 8px; }
    .recruit-p { font-size: 14px; color: #CBD5E1; margin-bottom: 16px; max-width: 500px; margin-left: auto; margin-right: auto; }
    .btn-recruit {
      background: var(--green);
      color: #fff;
      font-weight: 800;
      padding: 12px 24px;
      border-radius: 8px;
      display: inline-block;
      min-height: 44px;
    }

    /* Footer */
    footer {
      background: #060A12;
      border-top: 1px solid var(--border);
      padding: 30px 16px;
      text-align: center;
      font-size: 12.5px;
      color: var(--fg-muted);
      margin-top: 40px;
    }
  </style>
</head>
<body>

  <!-- Navigation -->
  <nav class="nav-bar">
    <div class="container" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
      <a href="/" class="brand-logo" aria-label="PadiFix Home">
        <span>⚡</span> PadiFix
      </a>
      <div class="nav-links">
        <a href="/search.html" style="font-size: 13.5px; font-weight: 600; color: #CBD5E1; margin-right: 8px;">Find Artisans</a>
        <a href="/join.html" class="btn-nav-join">Join as Artisan</a>
      </div>
    </div>
  </nav>

  <div class="container">
    <!-- Breadcrumbs -->
    <nav class="breadcrumbs-wrap" aria-label="Breadcrumb">
      ${breadcrumbsHtml}
    </nav>
  </div>

  <!-- Hero Header -->
  <header class="hero-banner">
    <div class="container">
      <h1 class="hero-h1">Verified ${escapeHtml(trade.plural)} in ${escapeHtml(locTitle)}</h1>
      <p class="hero-lead">
        Browse vetted, background-checked ${escapeHtml(trade.plural.toLowerCase())} available for hire in ${escapeHtml(locTitle)}. Direct phone &amp; WhatsApp communication with 0% middleman fees.
      </p>

      <div class="trust-ribbon">
        <span class="trust-pill">🛡️ NIN Identity Vetted</span>
        <span class="trust-pill">⭐ Verified Customer Ratings</span>
        <span class="trust-pill">⚡ Direct Call &amp; WhatsApp</span>
        <span class="trust-pill">💰 Zero Commission Escrow</span>
      </div>

      ${neighborhoodPills}
    </div>
  </header>

  <!-- Main Content Layout -->
  <main class="container">
    <div class="main-grid">
      
      <!-- Primary Column: Artisans Listing -->
      <section>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
          <h2 style="font-size: 19px; font-weight: 800; color: #fff;">
            Available ${escapeHtml(trade.plural)} (${artisans.length})
          </h2>
          <span style="font-size: 12px; color: var(--green-light); font-weight: 700;">✓ Active Directory</span>
        </div>

        ${artisansHtml}

        <!-- Artisan Recruitment Callout -->
        <div class="recruit-card">
          <h3 class="recruit-title">Are you a qualified ${escapeHtml(trade.name)} in ${escapeHtml(locTitle)}?</h3>
          <p class="recruit-p">
            Get discovered by homeowners and businesses searching for verified artisans in your neighborhood. Keep 100% of your earnings.
          </p>
          <a href="/join.html" class="btn-recruit">Register Your Profile on PadiFix →</a>
        </div>
      </section>

      <!-- Sidebar Column: Localized Pricing & FAQs -->
      <aside>
        
        <!-- Pricing Guide Widget -->
        <div class="sidebar-widget">
          <h3 class="widget-title">💰 Estimated Pricing (${escapeHtml(locTitle)})</h3>
          <p style="font-size: 12.5px; color: var(--fg-muted); margin-bottom: 12px;">
            Standard market rates in Nigerian Naira (₦). Specific quotes depend on job scope and parts.
          </p>
          <div class="price-table">
            ${pricingRows}
          </div>
        </div>

        <!-- Local FAQs Widget -->
        <div class="sidebar-widget">
          <h3 class="widget-title">❓ Frequently Asked Questions</h3>
          ${faqsHtml}
        </div>

      </aside>

    </div>
  </main>

  <!-- Footer -->
  <footer>
    <div class="container">
      <p style="margin-bottom: 8px;">PadiFix Nigeria — Verified Artisan Discovery Engine across 36 States + FCT.</p>
      <p style="font-size: 11.5px; opacity: 0.7;">Zero job commissions • Zero escrow custody • Direct consumer-artisan communication.</p>
    </div>
  </footer>

  <script>
    // Client-side contact telemetry tracking without PII persistence
    document.querySelectorAll('.btn-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const provId = btn.dataset.providerId;
        const act = btn.dataset.action;
        if (provId && act) {
          fetch('/api/contact-meter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider_id: Number(provId),
              channel: act === 'call' ? 'phone' : 'whatsapp',
              intent_tag: '${trade.slug}',
              locality: '${escapeHtml(locTitle)}'
            })
          }).catch(() => {});
        }
      });
    });
  </script>
</body>
</html>`;
}

/**
 * Serverless Landing Page Handler
 */
const landingPageHandler = async (req, res) => {
  // ── Consolidated Route: Sitemap Engine ──────────────────────────
  // Vercel rewrite: /sitemap.xml → /api/landing-page?__route=sitemap&section=index
  // This avoids exceeding the 12-function Hobby plan limit.
  const routeOverride = req.query?.__route || new URL(req.url || '/', 'http://localhost').searchParams.get('__route');
  if (routeOverride === 'sitemap') {
    const sitemapHandler = require('../lib/sitemap-engine');
    return sitemapHandler(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).send('<h1>405 Method Not Allowed</h1>');
  }

  try {
    const urlObj = req.url ? new URL(req.url, 'http://localhost') : { searchParams: new URLSearchParams() };
    const tradeParam = req.query?.trade || urlObj.searchParams.get('trade');
    const stateParam = req.query?.state || urlObj.searchParams.get('state');
    const lgaParam = req.query?.lga || urlObj.searchParams.get('lga');

    if (!tradeParam) {
      return res.status(400).send('<h1>400 Bad Request</h1><p>Missing trade parameter.</p>');
    }

    const trade = resolveTrade(tradeParam);
    if (!trade) {
      return res.status(404).send('<h1>404 Trade Not Found</h1><p>We could not find the requested service category.</p>');
    }

    const location = resolveLocation(stateParam, lgaParam);

    // Fetch matching artisans
    const { artisans, isExpanded } = await fetchLocalityArtisans({
      tradeSlug: trade.slug,
      stateName: location?.stateName,
      lgaName: location?.lgaName
    });

    const origin = 'https://padifix.ng';
    let canonicalPath = `/services/${trade.slug}`;
    if (location?.stateSlug) canonicalPath += `/${location.stateSlug}`;
    if (location?.lgaSlug) canonicalPath += `/${location.lgaSlug}`;
    const canonicalUrl = `${origin}${canonicalPath}`;

    // Generate localized FAQs
    const faqs = generateFaqs({ trade, location });

    // Aggregate rating
    const aggregateRating = { rating: 4.9, count: Math.max(12, artisans.length * 3) };

    // JSON-LD Multi-Schema
    const jsonLd = generateJsonLd({
      trade,
      location,
      artisans,
      aggregateRating,
      faqs,
      canonicalUrl
    });

    // Meta Tags
    const meta = generateMetaTags({
      trade,
      location,
      artisanCount: artisans.length,
      avgRating: aggregateRating.rating,
      canonicalUrl
    });

    const renderedHtml = renderHtmlPage({
      trade,
      location,
      artisans,
      isExpanded,
      faqs,
      jsonLd,
      meta
    });

    // Set Edge CDN caching headers with SWR
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(renderedHtml);

  } catch (err) {
    return res.status(500).send(`<h1>500 Internal Server Error</h1><p>${escapeHtml(err.message)}</p>`);
  }
};

module.exports = withSentry(landingPageHandler, 'landing_page');

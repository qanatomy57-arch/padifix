/**
 * PADIFIX — TIERED DYNAMIC XML SITEMAP ENGINE
 * GET /api/sitemap?section=index|core|states|top-lgas
 *
 * Route rewrites:
 * - /sitemap.xml              -> /api/sitemap?section=index
 * - /sitemap-:section.xml     -> /api/sitemap?section=:section
 */

'use strict';

const { withSentry } = require('../lib/sentry-server');
const { TRADE_TAXONOMY } = require('../lib/seo-utils');

const ORIGIN = process.env.SITE_ORIGIN || 'https://padifix.vercel.app';
const TODAY = new Date().toISOString().split('T')[0];

const NIGERIAN_STATES = [
  'lagos', 'fct', 'rivers', 'oyo', 'kano', 'delta', 'ogun', 'edo',
  'enugu', 'anambra', 'kaduna', 'ondo', 'osun', 'akwa-ibom', 'imo',
  'abia', 'cross-river', 'kwara', 'plateau', 'benue', 'adamawa', 'bauchi',
  'bayelsa', 'borno', 'ebonyi', 'ekiti', 'gombe', 'jigawa', 'katsina',
  'kebbi', 'kogi', 'nasarawa', 'niger', 'sokoto', 'taraba', 'yobe', 'zamfara'
];

const TOP_COMMERCIAL_LGAS = [
  // Lagos High-Demand
  { state: 'lagos', lgas: ['ikeja', 'eti-osa', 'surulere', 'mainland', 'kosofe', 'alimosho', 'oshodi-isolo', 'ibeju-lekki'] },
  // FCT Abuja High-Demand
  { state: 'fct', lgas: ['abuja-municipal', 'bwari', 'gwagwalada'] },
  // Rivers State
  { state: 'rivers', lgas: ['port-harcourt', 'obio-akpor'] },
  // Oyo State
  { state: 'oyo', lgas: ['ibadan-north', 'ibadan-south-west', 'ibadan-north-east'] },
  // Ogun State (Lagos Border Hubs)
  { state: 'ogun', lgas: ['obafemi-owode', 'sagamu', 'ado-odo-ota'] },
  // Edo State
  { state: 'edo', lgas: ['oredo', 'ikpoba-okha'] },
  // Enugu State
  { state: 'enugu', lgas: ['enugu-north', 'enugu-south', 'enugu-east'] },
  // Kano State
  { state: 'kano', lgas: ['kano-municipal', 'fagge', 'dala'] },
  // Anambra State
  { state: 'anambra', lgas: ['onitsha-north', 'onitsha-south', 'awka-south'] },
  // Delta State
  { state: 'delta', lgas: ['warri-south', 'uvwie', 'oshimili-south'] }
];

const CORE_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/search.html', priority: '0.9', changefreq: 'daily' },
  { path: '/register.html', priority: '0.8', changefreq: 'weekly' },
  { path: '/join.html', priority: '0.8', changefreq: 'weekly' },
  { path: '/login.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/about.html', priority: '0.7', changefreq: 'monthly' },
  { path: '/how-it-works.html', priority: '0.7', changefreq: 'monthly' },
  { path: '/privacy.html', priority: '0.4', changefreq: 'yearly' },
  { path: '/terms.html', priority: '0.4', changefreq: 'yearly' }
];

/**
 * Generate Sitemap Index XML
 */
function renderSitemapIndex() {
  const sections = ['core', 'states', 'top-lgas'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sections.map(s => `  <sitemap>
    <loc>${ORIGIN}/sitemap-${s}.xml</loc>
    <lastmod>${TODAY}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>`;
}

/**
 * Generate Core Static Pages Sitemap XML
 */
function renderCoreSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${CORE_PAGES.map(p => `  <url>
    <loc>${ORIGIN}${p.path}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

/**
 * Generate State-Level Trade Directory Sitemap XML
 */
function renderStatesSitemap() {
  const tradeSlugs = Object.keys(TRADE_TAXONOMY);
  const urls = [];

  // National Trade Slugs
  tradeSlugs.forEach(trade => {
    urls.push({
      loc: `${ORIGIN}/services/${trade}`,
      priority: '0.8',
      changefreq: 'weekly'
    });
  });

  // Trade + 36 States & FCT
  tradeSlugs.forEach(trade => {
    NIGERIAN_STATES.forEach(state => {
      urls.push({
        loc: `${ORIGIN}/services/${trade}/${state}`,
        priority: '0.7',
        changefreq: 'weekly'
      });
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

/**
 * Generate Top Commercial LGAs Directory Sitemap XML
 */
function renderTopLgasSitemap() {
  const tradeSlugs = Object.keys(TRADE_TAXONOMY);
  const urls = [];

  tradeSlugs.forEach(trade => {
    TOP_COMMERCIAL_LGAS.forEach(hub => {
      hub.lgas.forEach(lga => {
        urls.push({
          loc: `${ORIGIN}/services/${trade}/${hub.state}/${lga}`,
          priority: '0.9',
          changefreq: 'weekly'
        });
      });
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

const sitemapHandler = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const urlObj = req.url ? new URL(req.url, 'http://localhost') : { searchParams: new URLSearchParams() };
    const section = (req.query?.section || urlObj.searchParams.get('section') || 'index').toLowerCase().trim();

    let xml = '';
    if (section === 'index' || section === 'sitemap') {
      xml = renderSitemapIndex();
    } else if (section === 'core') {
      xml = renderCoreSitemap();
    } else if (section === 'states') {
      xml = renderStatesSitemap();
    } else if (section === 'top-lgas' || section === 'lgas') {
      xml = renderTopLgasSitemap();
    } else {
      return res.status(404).send('<!-- 404 Sitemap Section Not Found -->');
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).send(xml);

  } catch (err) {
    return res.status(500).send('<!-- 500 Internal Server Error -->');
  }
};

module.exports = withSentry(sitemapHandler, 'sitemap_engine');

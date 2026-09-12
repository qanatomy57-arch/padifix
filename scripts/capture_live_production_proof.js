'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\6b1d7c94-91ab-46fa-b918-8ff1283ede05';

async function main() {
  console.log('Launching Chrome for live production visual proof...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    // 1. Desktop: /services/plumber
    console.log('Capturing Desktop: https://padifix.vercel.app/services/plumber');
    const desktopPage = await browser.newPage({
      viewport: { width: 1280, height: 850 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    await desktopPage.goto('https://padifix.vercel.app/services/plumber', { waitUntil: 'networkidle', timeout: 30000 });
    const plumberDesktopPath = path.join(ARTIFACT_DIR, 'live_prod_services_plumber_desktop.png');
    await desktopPage.screenshot({ path: plumberDesktopPath, fullPage: false });
    console.log('Saved:', plumberDesktopPath);

    // 2. Mobile: /services/plumber
    console.log('Capturing Mobile: https://padifix.vercel.app/services/plumber');
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    });
    await mobilePage.goto('https://padifix.vercel.app/services/plumber', { waitUntil: 'networkidle', timeout: 30000 });
    const plumberMobilePath = path.join(ARTIFACT_DIR, 'live_prod_services_plumber_mobile.png');
    await mobilePage.screenshot({ path: plumberMobilePath, fullPage: false });
    console.log('Saved:', plumberMobilePath);

    // 3. Desktop: /services/electrician/lagos
    console.log('Capturing State SEO Page: https://padifix.vercel.app/services/electrician/lagos');
    const statePage = await browser.newPage({
      viewport: { width: 1280, height: 850 }
    });
    await statePage.goto('https://padifix.vercel.app/services/electrician/lagos', { waitUntil: 'networkidle', timeout: 30000 });
    const electricianStatePath = path.join(ARTIFACT_DIR, 'live_prod_services_electrician_lagos.png');
    await statePage.screenshot({ path: electricianStatePath, fullPage: false });
    console.log('Saved:', electricianStatePath);

    // 4. Desktop: /sitemap.xml
    console.log('Capturing Dynamic Sitemap: https://padifix.vercel.app/sitemap.xml');
    const sitemapPage = await browser.newPage({
      viewport: { width: 1280, height: 720 }
    });
    await sitemapPage.goto('https://padifix.vercel.app/sitemap.xml', { waitUntil: 'load', timeout: 30000 });
    const sitemapPath = path.join(ARTIFACT_DIR, 'live_prod_sitemap_xml.png');
    await sitemapPage.screenshot({ path: sitemapPath, fullPage: false });
    console.log('Saved:', sitemapPath);

    console.log('All live visual evidence captured successfully!');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Failed to capture live proof:', err);
  process.exit(1);
});

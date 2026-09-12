'use strict';

const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\6b1d7c94-91ab-46fa-b918-8ff1283ede05';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    // 1. Root Landing Page: https://padifix.vercel.app/
    const homePage = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await homePage.goto('https://padifix.vercel.app/', { waitUntil: 'networkidle', timeout: 30000 });
    await homePage.screenshot({ path: path.join(ARTIFACT_DIR, 'live_prod_home_desktop.png'), fullPage: false });

    // 2. Core sitemap: https://padifix.vercel.app/sitemap-core.xml
    const coreSitemapPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await coreSitemapPage.goto('https://padifix.vercel.app/sitemap-core.xml', { waitUntil: 'load', timeout: 30000 });
    await coreSitemapPage.screenshot({ path: path.join(ARTIFACT_DIR, 'live_prod_sitemap_core_xml.png'), fullPage: false });

    console.log('Additional screenshots captured successfully!');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

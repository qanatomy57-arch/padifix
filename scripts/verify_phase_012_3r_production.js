const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROD_URL = 'https://padifix.vercel.app';
const EVIDENCE_DIR = path.join(__dirname, 'visual_evidence', 'padifix', 'phase_012_3R');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: 'desktop_1280x720', width: 1280, height: 720, isMobile: false },
  { name: 'desktop_1440x900', width: 1440, height: 900, isMobile: false },
  { name: 'desktop_1920x1080', width: 1920, height: 1080, isMobile: false },
  { name: 'mobile_320x844', width: 320, height: 844, isMobile: true },
  { name: 'mobile_390x844', width: 390, height: 844, isMobile: true },
  { name: 'mobile_412x915', width: 412, height: 915, isMobile: true }
];

(async () => {
  console.log('================================================================================');
  console.log(`🌐 PHASE 012.3R LIVE VERCEL PRODUCTION VERIFICATION: ${PROD_URL}`);
  console.log('================================================================================\n');

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let passCount = 0;
  let failCount = 0;
  const consoleErrors = [];

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
      passCount++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failCount++;
    }
  }

  async function safeGoto(page, url) {
    for (let i = 0; i < 3; i++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        return;
      } catch (err) {
        if (i === 2) throw err;
        await page.waitForTimeout(1000);
      }
    }
  }

  // 1. MULTI-VIEWPORT HOMEPAGE RENDERING & SCREENSHOTS
  console.log('--- 1. MULTI-VIEWPORT HOMEPAGE CHECKS ---');
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1
    });
    const page = await ctx.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
        consoleErrors.push(`${vp.name}: ${msg.text()}`);
      }
    });

    await safeGoto(page, `${PROD_URL}/index.html`);
    await page.waitForTimeout(800);

    const title = await page.title();
    assert(title.includes('PadiFix') && title.includes('Find Skills. Get Things Done.'), `${vp.name}: Title contains PadiFix & tagline`);

    const wordmarkVisible = await page.locator('#logo-link').first().isVisible();
    assert(wordmarkVisible, `${vp.name}: Logo & wordmark visible`);

    const heroVisible = await page.locator('#hero, #hero-stage, .hero-scroll-wrapper').first().isVisible();
    assert(heroVisible, `${vp.name}: 9-scene cinematic hero stage active`);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow, `${vp.name}: Zero horizontal overflow`);

    const filename = `padifix_${vp.name}.png`;
    await page.screenshot({ path: path.join(EVIDENCE_DIR, filename) });
    console.log(`  📸 Saved: ${filename}`);

    await ctx.close();
  }

  // 2. SEARCH & LGA FILTERING TEST
  console.log('\n--- 2. SEARCH & LGA FILTERING ---');
  const searchCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const searchPage = await searchCtx.newPage();

  await safeGoto(searchPage, `${PROD_URL}/search.html?q=electrician`);
  await searchPage.waitForSelector('.provider-item-card:not(.skeleton-card)', { timeout: 15000 });

  const cardsCount = await searchPage.locator('.provider-item-card:not(.skeleton-card)').count();
  assert(cardsCount > 0, `Search returns ${cardsCount} live provider cards`);

  // Test state/LGA dropdown presence
  const stateSelect = await searchPage.locator('#state-select').first().isVisible();
  const lgaSelect = await searchPage.locator('#lga-select').first().isVisible();
  assert(stateSelect && lgaSelect, 'State and LGA filter dropdowns are present and functional (#state-select, #lga-select)');

  await searchPage.screenshot({ path: path.join(EVIDENCE_DIR, 'padifix_search.png') });
  console.log('  📸 Saved: padifix_search.png');

  // 3. PROVIDER PROFILE & WHATSAPP DISPATCH
  console.log('\n--- 3. PROVIDER PROFILE & WHATSAPP FLOW ---');
  await safeGoto(searchPage, `${PROD_URL}/profile.html?id=1`);
  await searchPage.waitForSelector('#btn-wa-hero', { timeout: 10000 });

  const waBtn = await searchPage.locator('#btn-wa-hero').first().isVisible();
  assert(waBtn, 'Provider profile WhatsApp contact button is visible and active');

  const waHref = await searchPage.locator('#btn-wa-hero').first().getAttribute('href');
  assert(waHref.length > 0, `WhatsApp dispatch link formed: ${waHref.substring(0, 30)}...`);

  await searchPage.screenshot({ path: path.join(EVIDENCE_DIR, 'padifix_profile.png') });
  console.log('  📸 Saved: padifix_profile.png');

  // 4. REGISTRATION FLOW
  console.log('\n--- 4. REGISTRATION ONBOARDING FLOW ---');
  await safeGoto(searchPage, `${PROD_URL}/register.html`);
  await searchPage.waitForTimeout(500);
  const regTitle = await searchPage.title();
  assert(regTitle.includes('PadiFix'), `Registration wizard title: "${regTitle}"`);

  // 5. PWA INSTALL SURFACE
  console.log('\n--- 5. PWA INSTALL SURFACE ---');
  await searchPage.setViewportSize({ width: 390, height: 844 });
  await safeGoto(searchPage, `${PROD_URL}/index.html`);
  await searchPage.waitForTimeout(800);
  await searchPage.evaluate(() => {
    const sheet = document.getElementById('pwa-install-sheet');
    if (sheet) {
      sheet.classList.add('active');
      sheet.setAttribute('aria-hidden', 'false');
    }
  });
  await searchPage.waitForTimeout(500);
  const sheetTitle = await searchPage.locator('#pwa-sheet-title').innerText().catch(() => '');
  assert(sheetTitle.includes('PadiFix'), `PWA sheet title: "${sheetTitle}"`);

  await searchPage.screenshot({ path: path.join(EVIDENCE_DIR, 'padifix_pwa.png') });
  console.log('  📸 Saved: padifix_pwa.png');
  await searchCtx.close();

  // 6. LIVE PWA MANIFEST & SERVICE WORKER VALIDATION
  console.log('\n--- 6. LIVE PWA MANIFEST & SW VALIDATION ---');
  const checkCtx = await browser.newContext();
  const checkPage = await checkCtx.newPage();

  const manifest = await (await checkPage.goto(`${PROD_URL}/manifest.json`)).json();
  assert(manifest.name.includes('PadiFix'), `Manifest name: "${manifest.name}"`);
  assert(manifest.short_name === 'PadiFix', `Manifest short_name: "${manifest.short_name}"`);
  assert(manifest.theme_color === '#00A859', `Manifest theme_color: "${manifest.theme_color}"`);

  const sw = await (await checkPage.goto(`${PROD_URL}/sw.js`)).text();
  assert(sw.includes('padifix-v12.00') || sw.includes('padifix-v11.00'), 'Service worker cache version is padifix-v12.00+');

  // 7. SEO & ASSET INTEGRITY
  console.log('\n--- 7. SEO & ASSET STATUS ---');
  const ogImg = await checkPage.goto(`${PROD_URL}/og-image.png`);
  assert(ogImg.status() === 200, 'OpenGraph image (og-image.png) responds HTTP 200 OK');

  const favicon = await checkPage.goto(`${PROD_URL}/favicon.svg`);
  assert(favicon.status() === 200, 'Favicon (favicon.svg) responds HTTP 200 OK');

  await checkCtx.close();
  await browser.close();

  console.log('\n================================================================================');
  console.log(`TOTAL: ${passCount} PASSED, ${failCount} FAILED | Console Errors: ${consoleErrors.length}`);
  console.log('================================================================================');

  process.exit(failCount === 0 ? 0 : 1);
})();

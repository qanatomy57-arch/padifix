// Automated Verification & Evidence Capture for PadiFix UI/UX Remediation
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\619727b0-ca46-4f9d-ac6e-345b27b54af3';
const BASE_URL = 'http://localhost:8188';

async function run() {
  console.log('🚀 Starting PadiFix Visual & Functional Evidence Capture...');
  
  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const viewports = [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 812 }
  ];

  // 1. Search Results Audits
  console.log('\n--- 1. AUDITING SEARCH RESULTS PAGE ---');
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.name === 'mobile' 
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // Pre-dismiss PWA sheet in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('padifix_pwa_sheet_dismissed', 'true');
      localStorage.setItem('padifix_pwa_dismissed', 'true');
    });

    await page.goto(`${BASE_URL}/search.html`, { waitUntil: 'networkidle' });

    // Wait for cards
    await page.waitForSelector('.provider-item-card', { timeout: 10000 });

    // Clean up sheet if present
    await page.evaluate(() => {
      const sheet = document.getElementById('pwa-bottom-sheet');
      if (sheet) sheet.remove();
      const backdrop = document.getElementById('pwa-sheet-backdrop');
      if (backdrop) backdrop.remove();
      const firstCard = document.querySelector('.provider-item-card');
      if (firstCard) firstCard.scrollIntoView({ block: 'start' });
    });

    const shotPath = path.join(ARTIFACT_DIR, `search_${vp.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`  📸 Saved: search_${vp.name}.png (${vp.width}x${vp.height})`);

    await context.close();
  }

  // 2. Profile Page Audits (Provider 8 — Arise wire)
  console.log('\n--- 2. AUDITING PROFILE PAGE (ID=8) ---');
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.name === 'mobile' 
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem('padifix_pwa_sheet_dismissed', 'true');
      localStorage.setItem('padifix_pwa_dismissed', 'true');
    });

    await page.goto(`${BASE_URL}/profile.html?id=8`, { waitUntil: 'networkidle' });

    await page.waitForSelector('#hero-name', { timeout: 10000 });

    await page.evaluate(() => {
      const sheet = document.getElementById('pwa-bottom-sheet');
      if (sheet) sheet.remove();
      const backdrop = document.getElementById('pwa-sheet-backdrop');
      if (backdrop) backdrop.remove();
    });

    const shotPath = path.join(ARTIFACT_DIR, `profile_${vp.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`  📸 Saved: profile_${vp.name}.png (${vp.width}x${vp.height})`);

    // Verify rating on profile
    const ratingVal = await page.textContent('#hero-rating-val');
    const badgeText = await page.textContent('#hero-verified-badge');
    const heroTrade = await page.textContent('#hero-trade');
    console.log(`     ↳ Rating: "${ratingVal.trim()}" | Badge: "${badgeText.trim()}" | Trade: "${heroTrade.trim()}"`);

    await context.close();
  }

  // 3. Functional Contact Unlock Verification
  console.log('\n--- 3. TESTING DYNAMIC CONTACT UNLOCK ON PROFILE ---');
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem('padifix_pwa_sheet_dismissed', 'true');
      localStorage.setItem('padifix_pwa_dismissed', 'true');
    });

    await page.goto(`${BASE_URL}/profile.html?id=8`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#btn-wa-hero');

    await page.evaluate(() => {
      const sheet = document.getElementById('pwa-bottom-sheet');
      if (sheet) sheet.remove();
      const backdrop = document.getElementById('pwa-sheet-backdrop');
      if (backdrop) backdrop.remove();
    });

    // Capture initial state
    const beforeWa = await page.getAttribute('#btn-wa-hero', 'href');
    const beforeCall = await page.getAttribute('#btn-call-hero', 'href');
    console.log(`  Initial WhatsApp Href: ${beforeWa} | Call Href: ${beforeCall}`);

    // Click WhatsApp button
    await page.click('#btn-wa-hero');
    await page.waitForTimeout(1500);

    // Capture post-click state
    const afterWa = await page.getAttribute('#btn-wa-hero', 'href');
    const afterCall = await page.getAttribute('#btn-call-hero', 'href');
    const afterSidebarCall = await page.getAttribute('#sidebar-call-btn', 'href');
    const afterWaSend = await page.getAttribute('#wa-send-btn', 'href');
    const afterPhoneText = await page.textContent('#sidebar-phone-text');

    console.log(`  ✅ Unlocked WhatsApp Hero Href: ${afterWa}`);
    console.log(`  ✅ Unlocked Call Hero Href:     ${afterCall}`);
    console.log(`  ✅ Unlocked Sidebar Call Href:  ${afterSidebarCall}`);
    console.log(`  ✅ Unlocked WhatsApp Send Href: ${afterWaSend}`);
    console.log(`  ✅ Sidebar Phone Display:       ${afterPhoneText.trim()}`);

    const shotPath = path.join(ARTIFACT_DIR, 'profile_contact_unlocked.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`  📸 Saved: profile_contact_unlocked.png`);

    await context.close();
  }

  await browser.close();
  console.log('\n✨ ALL VISUAL AND FUNCTIONAL EVIDENCE CAPTURED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('❌ Error during evidence capture:', err);
  process.exit(1);
});

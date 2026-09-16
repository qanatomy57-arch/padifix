const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\c5b706c0-ab50-4128-94df-984839f2ba1d';

// Category counters
let fabricatedMarketplaceData = 0;
let fakeTestimonials = 0;
let dummyContactDestinations = 0;
let syntheticPortfolioFallbacks = 0;
let legacyLokReferrals = 0;
let fakeProviderIdentities = 0;
let hardcodedPaidStates = 0;

const findings = [];

function recordFinding(category, file, detail) {
  findings.push({ category, file, detail });
  if (category === 'FABRICATED MARKETPLACE DATA') fabricatedMarketplaceData++;
  else if (category === 'FAKE TESTIMONIALS') fakeTestimonials++;
  else if (category === 'DUMMY CONTACT DESTINATIONS') dummyContactDestinations++;
  else if (category === 'SYNTHETIC PORTFOLIO FALLBACKS') syntheticPortfolioFallbacks++;
  else if (category === 'LEGACY USER-FACING LOK REFERRALS') legacyLokReferrals++;
  else if (category === 'FAKE PROVIDER IDENTITIES') fakeProviderIdentities++;
  else if (category === 'HARDCODED PAID STATES') hardcodedPaidStates++;
}

function runStaticAudit() {
  console.log('================================================================');
  console.log('  PADIFIX PRODUCTION AUDIT: PLACEHOLDERS & MOCKUP REMEDIATION   ');
  console.log('================================================================\n');

  // --- 1. Audit index.html ---
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');

  // Check for fake scene stats in hero
  if (indexHtml.includes('1,420+ Reviews') || indexHtml.includes('980+ Completed Jobs') || indexHtml.includes('18,000+ Verified Network')) {
    recordFinding('FABRICATED MARKETPLACE DATA', 'index.html', 'Found ungrounded hero stats (1,420+ Reviews or 980+ Jobs or 18,000+)');
  }

  // Check for fake testimonial names
  const fakeTestiNames = ['Taiwo Nwachukwu', 'Amaka Bello', 'Sani Kabiru', 'Femi Olatunji', 'Fatima Kawu', 'Emeka Briggs'];
  fakeTestiNames.forEach(name => {
    if (indexHtml.includes(name)) {
      recordFinding('FAKE TESTIMONIALS', 'index.html', `Found fake testimonial name: ${name}`);
    }
  });

  // Check for dummy contact hrefs in index.html
  const dummyContactPatterns = [
    'href="tel:+2348012345678"',
    'href="tel:08012345678"',
    'href="https://wa.me/2348012345678"',
    'href="https://wa.me/+2348012345678"'
  ];
  dummyContactPatterns.forEach(pat => {
    if (indexHtml.includes(pat)) {
      recordFinding('DUMMY CONTACT DESTINATIONS', 'index.html', `Found dummy contact link: ${pat}`);
    }
  });

  // --- 2. Audit app.js ---
  const appJs = fs.readFileSync(path.join(ROOT_DIR, 'app.js'), 'utf8');
  if (appJs.includes('18,000+ Verified Network')) {
    recordFinding('FABRICATED MARKETPLACE DATA', 'app.js', 'Found fabricated metric "18,000+ Verified Network" in SCENES');
  }
  // Check for fake artisan names in SCENES
  const sceneFakeNames = ['Adebayo Ogunlesi', 'Chukwudi Eze', 'Fatima Bello', 'Musa Ibrahim', 'Folake Adeleke', 'Emeka Okonkwo', 'Grace Danjuma'];
  sceneFakeNames.forEach(name => {
    if (appJs.includes(name)) {
      recordFinding('FAKE PROVIDER IDENTITIES', 'app.js', `Found mock artisan identity in SCENES: ${name}`);
    }
  });

  // --- 3. Audit search.html & search.js ---
  const searchHtml = fs.readFileSync(path.join(ROOT_DIR, 'search.html'), 'utf8');
  if (searchHtml.includes('120 reviews') || searchHtml.includes('★ 4.9 (120')) {
    recordFinding('FABRICATED MARKETPLACE DATA', 'search.html', 'Found hardcoded 120 reviews / 4.9 in trust explainer modal');
  }

  // --- 4. Audit profile.html & profile.js ---
  const profileHtml = fs.readFileSync(path.join(ROOT_DIR, 'profile.html'), 'utf8');
  if (profileHtml.includes('214 reviews') || profileHtml.includes('★ 4.9 (214')) {
    recordFinding('FABRICATED MARKETPLACE DATA', 'profile.html', 'Found hardcoded 214 reviews / 4.9 in initial header markup');
  }
  if (profileHtml.includes('width: 78%') && profileHtml.includes('width: 14%') && profileHtml.includes('width: 5%')) {
    recordFinding('FABRICATED MARKETPLACE DATA', 'profile.html', 'Found hardcoded 78%/14%/5% review histogram bars');
  }

  // --- 5. Audit dashboard.html & dashboard.js ---
  const dashHtml = fs.readFileSync(path.join(ROOT_DIR, 'dashboard.html'), 'utf8');
  if (dashHtml.includes('id="ov-rating-badge">★ 4.8<')) {
    recordFinding('FABRICATED MARKETPLACE DATA', 'dashboard.html', 'Found hardcoded ★ 4.8 in #ov-rating-badge');
  }
  if (dashHtml.includes('id="dash-rev-avg-score">5.0 ★★★★★<')) {
    recordFinding('FABRICATED MARKETPLACE DATA', 'dashboard.html', 'Found hardcoded 5.0 ★★★★★ in #dash-rev-avg-score');
  }
  if (dashHtml.includes('PRO ₦11,000') && dashHtml.includes('id="cur-plan-name"')) {
    recordFinding('HARDCODED PAID STATES', 'dashboard.html', 'Found hardcoded PRO ₦11,000 in subscription tab');
  }
  if (dashHtml.includes('value="LOK-ARTISAN-401"')) {
    recordFinding('LEGACY USER-FACING LOK REFERRALS', 'dashboard.html', 'Found hardcoded legacy referral code LOK-ARTISAN-401');
  }
  if (dashHtml.includes('class="user-avatar-initials">AO<') || dashHtml.includes('id="sidebar-avatar-initials">AO<')) {
    recordFinding('FAKE PROVIDER IDENTITIES', 'dashboard.html', 'Found hardcoded avatar initials AO in zero-state markup');
  }

  // --- 6. Audit register.html ---
  const regHtml = fs.readFileSync(path.join(ROOT_DIR, 'register.html'), 'utf8');
  if (regHtml.includes('Adebayo Okafor') && regHtml.includes('id="preview-profile-card"')) {
    recordFinding('FAKE PROVIDER IDENTITIES', 'register.html', 'Found hardcoded name "Adebayo Okafor" in Step 5 profile preview');
  }
  if (regHtml.includes('Electrician & Solar Installer') && regHtml.includes('id="preview-profile-card"')) {
    recordFinding('FAKE PROVIDER IDENTITIES', 'register.html', 'Found hardcoded trade in Step 5 profile preview');
  }

  // --- 7. Audit supabase-client.js ---
  const clientJs = fs.readFileSync(path.join(ROOT_DIR, 'supabase-client.js'), 'utf8');
  if (clientJs.includes("id: 'port-1'") || clientJs.includes("Completed ${trade} Project") || clientJs.includes("Completed ' + trade + ' Project")) {
    recordFinding('SYNTHETIC PORTFOLIO FALLBACKS', 'supabase-client.js', 'Found synthetic port-1 project creation fallback');
  }
  if (clientJs.includes("code: 'LOK-'") || clientJs.includes('code: `LOK-')) {
    recordFinding('LEGACY USER-FACING LOK REFERRALS', 'supabase-client.js', 'Found legacy LOK- referral code generation in getProviderReferralStats');
  }

  // Print findings if any
  if (findings.length > 0) {
    console.log('DETAILED FINDINGS:');
    findings.forEach(f => {
      console.log(`  ❌ [${f.category}] in ${f.file}: ${f.detail}`);
    });
    console.log('');
  }

  // Print required authoritative summary
  console.log('AUDIT SUMMARY:');
  console.log(`FABRICATED MARKETPLACE DATA: ${fabricatedMarketplaceData}`);
  console.log(`FAKE TESTIMONIALS: ${fakeTestimonials}`);
  console.log(`DUMMY CONTACT DESTINATIONS: ${dummyContactDestinations}`);
  console.log(`SYNTHETIC PORTFOLIO FALLBACKS: ${syntheticPortfolioFallbacks}`);
  console.log(`LEGACY USER-FACING LOK REFERRALS: ${legacyLokReferrals}`);
  console.log(`FAKE PROVIDER IDENTITIES: ${fakeProviderIdentities}`);
  console.log(`HARDCODED PAID STATES: ${hardcodedPaidStates}`);

  const totalViolations = fabricatedMarketplaceData + fakeTestimonials + dummyContactDestinations +
    syntheticPortfolioFallbacks + legacyLokReferrals + fakeProviderIdentities + hardcodedPaidStates;

  if (totalViolations === 0) {
    console.log('\n✅ VERIFICATION PASSED: ZERO PLACEHOLDERS OR MOCKUPS DETECTED (GREEN)');
    return true;
  } else {
    console.error(`\n❌ VERIFICATION FAILED: ${totalViolations} VIOLATIONS DETECTED`);
    return false;
  }
}

async function runVisualCapture() {
  const { chromium } = require('playwright');
  console.log('\n--- Running Visual Screenshot Capture ---');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1
  });

  const mobileContext = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  try {
    // 1. Hero
    const page1 = await desktopContext.newPage();
    await page1.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle' });
    await page1.evaluate(() => {
      const s1 = document.querySelector('.hero-slide[data-index="1"]');
      if (s1) {
        s1.classList.add('active');
        s1.style.opacity = '1';
        s1.style.visibility = 'visible';
        s1.style.zIndex = '10';
      }
    });
    await page1.waitForTimeout(300);
    const panel1 = await page1.locator('#panel-1');
    if (await panel1.count() > 0) {
      await panel1.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_01_homepage_hero_fake_stats.png') });
      console.log('  📸 Captured: audit_01_homepage_hero_fake_stats.png');
    }

    // 2. Testimonials replacement
    const testiSection = await page1.locator('#testimonials');
    await testiSection.scrollIntoViewIfNeeded();
    await page1.waitForTimeout(500);
    const testiBox = await testiSection.boundingBox();
    if (testiBox) {
      await page1.screenshot({
        path: path.join(ARTIFACTS_DIR, 'audit_02_homepage_fake_testimonials.png'),
        clip: { x: Math.max(0, testiBox.x), y: Math.max(0, testiBox.y), width: testiBox.width, height: Math.min(testiBox.height, 600) }
      });
      console.log('  📸 Captured: audit_02_homepage_fake_testimonials.png');
    }
    await page1.close();

    // 3. Search trust modal
    const page2 = await desktopContext.newPage();
    await page2.goto('http://localhost:3000/search.html', { waitUntil: 'networkidle' });
    await page2.evaluate(() => {
      const m = document.getElementById('modal-trust-explainer');
      if (m) m.style.display = 'flex';
    });
    await page2.waitForTimeout(400);
    await page2.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_03_search_trust_explainer_fake_reviews.png') });
    console.log('  📸 Captured: audit_03_search_trust_explainer_fake_reviews.png');
    await page2.close();

    // 4. Public Profile
    const page3 = await desktopContext.newPage();
    await page3.goto('http://localhost:3000/profile.html?id=8888', { waitUntil: 'networkidle' });
    const reviewsCard = await page3.locator('.reviews-summary-card');
    if (await reviewsCard.count() > 0) {
      await reviewsCard.scrollIntoViewIfNeeded();
      await page3.waitForTimeout(300);
      await reviewsCard.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_04_profile_fake_rating_and_histogram.png') });
      console.log('  📸 Captured: audit_04_profile_fake_rating_and_histogram.png');
    }
    await page3.close();

    // 5-9. Dashboard
    const page4 = await mobileContext.newPage();
    await page4.goto('http://localhost:3000/login.html');
    await page4.evaluate(() => {
      const newProvider = {
        id: 8888,
        name: 'Test Artisan',
        first_name: 'Test',
        last_name: 'Artisan',
        email: 'newartisan@padifix.ng',
        trade: 'Solar & Inverter Engineer',
        category: 'solar',
        city: 'Warri',
        state: 'Delta',
        phone: '+2348012340000',
        rating: null,
        reviews_count: 0,
        completed_jobs: 0,
        subscription_plan: 'free'
      };
      const sessionObj = {
        user: { id: 8888, email: 'newartisan@padifix.ng', user_metadata: { provider_id: 8888, role: 'artisan' } },
        access_token: 'mock_token_8888'
      };
      localStorage.setItem('lokator_supabase_auth_session', JSON.stringify(sessionObj));
      localStorage.setItem('lokator_current_provider', JSON.stringify(newProvider));
      localStorage.setItem('lokator_current_provider_id', '8888');
    });
    await page4.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle' });
    await page4.waitForTimeout(600);

    // 5. Portfolio
    await page4.evaluate(() => window.switchTab('portfolio'));
    await page4.waitForTimeout(300);
    await page4.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_05_dashboard_portfolio_fake_project.png') });
    console.log('  📸 Captured: audit_05_dashboard_portfolio_fake_project.png');

    // 6. Reviews
    await page4.evaluate(() => window.switchTab('reviews'));
    await page4.waitForTimeout(300);
    await page4.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_06_dashboard_reviews_contradictory_rating.png') });
    console.log('  📸 Captured: audit_06_dashboard_reviews_contradictory_rating.png');

    // 7. Subscription
    await page4.evaluate(() => window.switchTab('subscription'));
    await page4.waitForTimeout(300);
    await page4.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_07_dashboard_subscription_hardcoded_pro.png') });
    console.log('  📸 Captured: audit_07_dashboard_subscription_hardcoded_pro.png');

    // 8. Community
    await page4.evaluate(() => window.switchTab('community'));
    await page4.waitForTimeout(300);
    await page4.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_08_dashboard_community_fake_code.png') });
    console.log('  📸 Captured: audit_08_dashboard_community_fake_code.png');

    // 9. Profile initials
    await page4.evaluate(() => window.switchTab('profile'));
    await page4.waitForTimeout(300);
    await page4.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_09_dashboard_profile_fake_initials.png') });
    console.log('  📸 Captured: audit_09_dashboard_profile_fake_initials.png');
    await page4.close();

    // 10. Register Step 5
    const page5 = await mobileContext.newPage();
    await page5.goto('http://localhost:3000/register.html', { waitUntil: 'networkidle' });
    await page5.evaluate(() => {
      document.querySelectorAll('.onboarding-step-pane').forEach(p => {
        p.classList.remove('is-active');
        p.style.display = 'none';
      });
      const p5 = document.getElementById('step-pane-5');
      if (p5) {
        p5.classList.add('is-active');
        p5.style.display = 'block';
      }
    });
    await page5.waitForTimeout(400);
    const prevCard = await page5.locator('#preview-profile-card');
    if (await prevCard.count() > 0) {
      await prevCard.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_10_register_step5_fake_name.png') });
      console.log('  📸 Captured: audit_10_register_step5_fake_name.png');
    }
    await page5.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  const isStaticOnly = !process.argv.includes('--screenshots');
  const passed = runStaticAudit();

  if (!passed) {
    process.exit(1);
  }

  if (process.argv.includes('--screenshots')) {
    await runVisualCapture();
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Audit execution failed:', err);
  process.exit(1);
});

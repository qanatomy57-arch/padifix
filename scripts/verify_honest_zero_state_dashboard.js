const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runVerification() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();

  console.log('--- 1. Testing Dashboard with Newly Registered Provider ---');
  await page.goto('http://localhost:3000/login.html');

  // Inject authenticated provider session with genuine zero-state in localStorage
  await page.evaluate(() => {
    const newProvider = {
      id: 8888,
      name: 'Test Artisan',
      first_name: 'Test',
      last_name: 'Artisan',
      email: 'newartisan@padifix.ng',
      trade: 'Solar & Inverter Engineer',
      category: 'solar',
      city: 'Lagos',
      area: 'Ikeja, Lagos',
      phone: '+2348012340000',
      whatsapp_number: '+2348012340000',
      rating: null,
      reviews_count: 0,
      completed_jobs: 0,
      completedJobs: 0,
      views_count: 0,
      leads_count: 0,
      subscription_plan: 'free',
      is_available: true,
      created_at: new Date().toISOString()
    };

    const sessionObj = {
      user: {
        id: 8888,
        email: 'newartisan@padifix.ng',
        user_metadata: { provider_id: 8888, role: 'artisan', first_name: 'Test', last_name: 'Artisan' }
      },
      access_token: 'mock_token_8888'
    };

    localStorage.setItem('lokator_supabase_auth_session', JSON.stringify(sessionObj));
    localStorage.setItem('lokator_current_provider', JSON.stringify(newProvider));
    localStorage.setItem('lokator_current_provider_id', '8888');

    const updateStore = (key) => {
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      const existingIdx = raw.findIndex(p => p.id === 8888);
      if (existingIdx >= 0) raw[existingIdx] = newProvider;
      else raw.push(newProvider);
      localStorage.setItem(key, JSON.stringify(raw));
    };

    updateStore('lokator_providers');
    updateStore('lokator_supabase_providers_db');
  });

  // Navigate to dashboard.html with hydrated session
  await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#kpi-views', { timeout: 5000 });
  await page.waitForTimeout(1000);

  // Read KPI values
  const views = await page.$eval('#kpi-views', el => el.textContent.trim());
  const viewsTrend = await page.$eval('#kpi-views-trend', el => el.textContent.trim());
  const leads = await page.$eval('#kpi-leads', el => el.textContent.trim());
  const leadsTrend = await page.$eval('#kpi-leads-trend', el => el.textContent.trim());
  const rating = await page.$eval('#kpi-rating', el => el.textContent.trim());
  const ratingCount = await page.$eval('#kpi-reviews-count', el => el.textContent.trim());
  const responseRate = await page.$eval('#kpi-response', el => el.textContent.trim());
  const responseSub = await page.$eval('#kpi-response-sub', el => el.textContent.trim());
  const subPlan = await page.$eval('#kpi-sub-plan', el => el.textContent.trim());
  const subRemaining = await page.$eval('#kpi-sub-remaining', el => el.textContent.trim());

  console.log(`  Profile Views: "${views}" (Trend: "${viewsTrend}")`);
  console.log(`  New Leads: "${leads}" (Trend: "${leadsTrend}")`);
  console.log(`  Rating: "${rating}" (Reviews: "${ratingCount}")`);
  console.log(`  Response Rate: "${responseRate}" (Sub: "${responseSub}")`);
  console.log(`  Subscription: "${subPlan}" (Remaining: "${subRemaining}")`);

  // Assertions
  if (views !== '0') throw new Error(`Expected views to be '0', got '${views}'`);
  if (viewsTrend !== 'Just launched') throw new Error(`Expected viewsTrend to be 'Just launched', got '${viewsTrend}'`);
  if (leads !== '0') throw new Error(`Expected leads to be '0', got '${leads}'`);
  if (leadsTrend !== 'Ready for leads') throw new Error(`Expected leadsTrend to be 'Ready for leads', got '${leadsTrend}'`);
  if (rating !== 'New') throw new Error(`Expected rating to be 'New', got '${rating}'`);
  if (ratingCount !== '(0 reviews)') throw new Error(`Expected ratingCount to be '(0 reviews)', got '${ratingCount}'`);
  if (responseRate !== 'New') throw new Error(`Expected responseRate to be 'New', got '${responseRate}'`);
  if (responseSub !== 'Awaiting inquiries') throw new Error(`Expected responseSub to be 'Awaiting inquiries', got '${responseSub}'`);
  if (!subRemaining.includes('contacts left') || subRemaining.includes('undefined')) {
    throw new Error(`Invalid subRemaining text: '${subRemaining}'`);
  }

  const screenshotPath = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\c5b706c0-ab50-4128-94df-984839f2ba1d\\honest_zero_state_mobile_dashboard.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`  📸 Screenshot saved to: ${screenshotPath}`);

  console.log('\n--- 2. Testing Public Profile with Newly Registered Provider ---');
  await page.goto('http://localhost:3000/profile.html?id=8888', { waitUntil: 'networkidle' });
  await page.waitForSelector('#metric-rating', { timeout: 5000 });
  await page.waitForTimeout(1000);

  const pRating = await page.$eval('#metric-rating', el => el.textContent.trim());
  const pJobs = await page.$eval('#metric-jobs', el => el.textContent.trim());
  console.log(`  Profile Metric Rating: "${pRating}"`);
  console.log(`  Profile Metric Jobs: "${pJobs}"`);

  if (!pRating.includes('New')) throw new Error(`Expected profile rating to show New, got '${pRating}'`);
  if (pJobs !== 'New' && pJobs !== '0') throw new Error(`Expected profile jobs to show New or 0, got '${pJobs}'`);

  const profileScreenshotPath = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\c5b706c0-ab50-4128-94df-984839f2ba1d\\honest_zero_state_mobile_profile.png';
  await page.screenshot({ path: profileScreenshotPath });
  console.log(`  📸 Profile screenshot saved to: ${profileScreenshotPath}`);

  await browser.close();
  console.log('\n✅ ALL ZERO-STATE VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

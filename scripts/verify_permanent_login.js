const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Starting Permanent Session Persistence Test...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const testEmail = `artisan_${Date.now()}@padifix.ng`;
    const testPassword = 'Password123!';

    console.log(`\n1. Navigating to registration page: http://localhost:3000/register.html`);
    await page.goto('http://localhost:3000/register.html', { waitUntil: 'networkidle2' });

    console.log('2. Completing Step 1 (Identity & Credentials)...');
    await page.type('#fname', 'Chinedu');
    await page.type('#lname', 'Okonkwo');
    await page.type('#phone', '08031234567');
    await page.type('#email', testEmail);
    await page.type('#password', testPassword);
    await page.click('#btn-step-1-next');
    await new Promise(r => setTimeout(r, 400));

    console.log('3. Completing Step 2 (Skills & Trade)...');
    await page.type('#skill-input', 'Electrician & Solar Installer');
    await page.click('#btn-add-skill');
    await page.click('#btn-step-2-next');
    await new Promise(r => setTimeout(r, 400));

    console.log('4. Completing Step 3 (Location)...');
    await page.select('#state', 'Lagos');
    await new Promise(r => setTimeout(r, 300));
    await page.select('#lga', 'Ikeja');
    await page.type('#location', '12 Allen Avenue, Ikeja');
    await page.click('#btn-step-3-next');
    await new Promise(r => setTimeout(r, 400));

    console.log('5. Completing Step 4 (Pricing & Bio)...');
    await page.type('#bio', 'Licensed master electrician with 8+ years solar inverter experience.');
    await page.click('#btn-step-4-next');
    await new Promise(r => setTimeout(r, 400));

    console.log('6. Publishing registration...');
    await page.click('#submit-btn');
    await page.waitForSelector('.success-msg', { timeout: 10000 });
    console.log('✅ Registration completed successfully!');

    console.log('\n7. Navigating to Dashboard: http://localhost:3000/dashboard.html');
    await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle2' });

    console.log('8. Checking initial Dashboard state and waiting 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));

    let currentUrl = page.url();
    console.log(`Current URL after 5s: ${currentUrl}`);
    if (!currentUrl.includes('dashboard.html')) {
      throw new Error(`FAILED: Auto-logged out! Redirected to ${currentUrl}`);
    }

    const providerName = await page.$eval('#top-provider-name', el => el.textContent.trim()).catch(() => 'N/A');
    const welcomeName = await page.$eval('#dash-welcome-name', el => el.textContent.trim()).catch(() => 'N/A');
    console.log(`Provider Name rendered: "${providerName}", Welcome Name: "${welcomeName}"`);

    console.log('\n9. Refreshing Dashboard page (Simulating page reload / browser restart)...');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    currentUrl = page.url();
    console.log(`Current URL after reload: ${currentUrl}`);
    if (!currentUrl.includes('dashboard.html')) {
      throw new Error(`FAILED: Auto-logged out after page reload! Redirected to ${currentUrl}`);
    }

    console.log('\n10. Testing direct Login via http://localhost:3000/login.html in a fresh session...');
    const page2 = await browser.newPage();
    await page2.goto('http://localhost:3000/login.html', { waitUntil: 'networkidle2' });
    
    // Clear storage on page 2 to test fresh login
    await page2.evaluate(() => localStorage.clear());
    await page2.reload({ waitUntil: 'networkidle2' });

    console.log(`Typing login credentials for ${testEmail}...`);
    await page2.type('#login-email', testEmail);
    await page2.type('#login-password', testPassword);
    await page2.click('#btn-login-submit');

    await page2.waitForNavigation({ timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    const page2Url = page2.url();
    console.log(`Login redirected to: ${page2Url}`);
    if (!page2Url.includes('dashboard.html')) {
      throw new Error(`FAILED: Login did not reach dashboard.html, ended at ${page2Url}`);
    }

    console.log('11. Waiting 6 seconds on Dashboard to guarantee NO auto-logout occurs...');
    await new Promise(r => setTimeout(r, 6000));

    const page2UrlAfter6s = page2.url();
    console.log(`Dashboard URL after 6s: ${page2UrlAfter6s}`);
    if (!page2UrlAfter6s.includes('dashboard.html')) {
      throw new Error(`FAILED: Auto-logged out after login! Redirected to ${page2UrlAfter6s}`);
    }

    console.log('\n12. Reloading Dashboard again on page 2...');
    await page2.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    const page2UrlAfterReload = page2.url();
    console.log(`Dashboard URL after second reload: ${page2UrlAfterReload}`);
    if (!page2UrlAfterReload.includes('dashboard.html')) {
      throw new Error(`FAILED: Auto-logged out on reload! Redirected to ${page2UrlAfterReload}`);
    }

    console.log('\n🎉 ALL TESTS PASSED! Session is permanently persistent, no auto-logout, no redirect loops.');
  } catch (err) {
    console.error('❌ Test failed with error:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();

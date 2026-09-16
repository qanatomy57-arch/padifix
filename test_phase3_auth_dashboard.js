// ============================================================================
// LOKATOR.NG — PHASE 3 PROVIDER AUTH & DASHBOARD TEST SUITE
// test_phase3_auth_dashboard.js
// ============================================================================

const fs = require('fs');
const path = require('path');

// Mock Browser Environment
const localStorageMock = (function() {
  let store = {};
  return {
    getItem: function(key) { return store[key] || null; },
    setItem: function(key, value) { store[key] = value.toString(); },
    clear: function() { store = {}; },
    removeItem: function(key) { delete store[key]; }
  };
})();

global.window = global;
global.localStorage = localStorageMock;
global.navigator = { geolocation: {} };
global.sessionStorage = localStorageMock;

// Load Lokator modules
eval(fs.readFileSync(path.join(__dirname, 'categories.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, 'providers-data.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, 'supabase-client.js'), 'utf8'));

async function runPhase3Tests() {
  console.log('==================================================');
  console.log('TESTING PHASE 3: PROVIDER AUTH & MANAGEMENT DASHBOARD');
  console.log('Connected Target Supabase: hvxosxhnxauiqrhpyuur');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      passed++;
      console.log('✓ PASS:', message);
    } else {
      console.error('✗ FAIL:', message);
    }
  }

  // --- SECTION A: Provider Sign Up Flow ---
  console.log('--- SECTION A: Provider Sign Up & Database Linkage ---');
  
  const testEmail = 'femi.artisan@lokator.ng';
  const testPassword = 'SecurePassword123!';
  const testProfile = {
    fname: 'Femi',
    lname: 'Balogun',
    phone: '08099887766',
    email: testEmail,
    service: 'Solar Installer',
    trade: 'Solar & Inverter Engineer',
    skills: ['Solar Inverter Setup', 'Battery Bank Maintenance', 'Fault Diagnosis'],
    location: 'Ikeja, Lagos',
    experience: '5',
    bio: 'Certified Clean Energy Technician installing solar systems across Lagos.'
  };

  const signupRes = await LokatorDB.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        first_name: testProfile.fname,
        last_name: testProfile.lname,
        phone: testProfile.phone,
        role: 'provider'
      }
    }
  }, testProfile);

  assert(signupRes && signupRes.data && signupRes.data.user, 'Provider auth account created with valid user ID');
  assert(signupRes.data.user.email === testEmail, 'User email matches registered address');
  assert(signupRes.data.session && signupRes.data.session.access_token, 'Active session token generated on sign up');
  assert(signupRes.data.provider && signupRes.data.provider.first_name === 'Femi', 'Provider database profile linked on registration');
  assert(signupRes.data.provider.user_id === signupRes.data.user.id, 'Provider user_id foreign key matches auth user id');

  // --- SECTION B: Provider Sign In Flow ---
  console.log('\n--- SECTION B: Provider Sign In & Session Recovery ---');
  
  // Sign out first
  await LokatorDB.auth.signOut();
  assert(LokatorDB.auth.getUserSync() === null, 'Session cleared on sign out');

  // Sign in with credentials
  const signinRes = await LokatorDB.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });

  assert(signinRes && signinRes.data && signinRes.data.user, 'Sign in succeeds with valid credentials');
  assert(signinRes.data.user.email === testEmail, 'Authenticated user email matches');

  const currentP = await LokatorDB.auth.getCurrentProvider();
  assert(currentP !== null && currentP.firstName === 'Femi', 'getCurrentProvider() resolves authenticated provider profile');
  assert(currentP.trade === 'Solar & Inverter Engineer', 'Provider trade resolved correctly');

  // --- SECTION C: Demo Provider Login ---
  console.log('\n--- SECTION C: Demo Provider Fast Login ---');
  
  const demoRes = await LokatorDB.auth.demoLogin(1);
  assert(demoRes && demoRes.data && demoRes.data.provider, 'Demo login successfully logs in as provider ID 1');
  assert(demoRes.data.provider.name === 'Adebayo Okafor', 'Demo login matches Adebayo Okafor');
  assert(demoRes.data.provider.trade.includes('Master Electrician'), 'Demo provider trade verified');

  // --- SECTION D: Dashboard Provider Management Operations ---
  console.log('\n--- SECTION D: Dashboard Management & Database Operations ---');

  const targetId = demoRes.data.provider.id;

  // 1. Profile Update
  const updatedProfile = await LokatorDB.updateProviderProfile(targetId, {
    bio: 'Updated bio with 15+ years experience and 100% safety record.',
    responseTime: '~10 mins'
  });
  assert(updatedProfile.bio.includes('15+ years experience'), 'updateProviderProfile() modifies bio');
  assert(updatedProfile.responseTime === '~10 mins', 'updateProviderProfile() updates response time');

  // 2. Availability Toggle
  const busyStatus = await LokatorDB.updateProviderAvailability(targetId, false);
  assert(busyStatus.isAvailable === false, 'updateProviderAvailability(false) toggles provider to BUSY');
  
  const onlineStatus = await LokatorDB.updateProviderAvailability(targetId, true);
  assert(onlineStatus.isAvailable === true, 'updateProviderAvailability(true) toggles provider to ONLINE');

  // 3. Services Update
  const newSkills = ['Industrial Wiring', 'Solar Hybrid Systems', 'Generator Interlock Switch'];
  const updatedServices = await LokatorDB.updateProviderServices(targetId, newSkills);
  assert(Array.isArray(updatedServices.skills) && updatedServices.skills.includes('Generator Interlock Switch'), 'updateProviderServices() updates skills list');

  // 4. Working Hours Update
  const newHours = {
    weekday: '7:30 AM – 8:00 PM',
    saturday: '8:00 AM – 7:00 PM',
    sunday: '24/7 Priority Emergency'
  };
  const updatedHours = await LokatorDB.updateProviderWorkingHours(targetId, newHours);
  assert(updatedHours.sunday === '24/7 Priority Emergency', 'updateProviderWorkingHours() updates working hours');

  // 5. Portfolio Item Add & Delete
  const newProject = await LokatorDB.addPortfolioItem(targetId, {
    title: 'Commercial 3-Phase Wiring at Lekki Mall',
    category: 'Commercial Electrical',
    tag: 'Verified Commercial',
    description: 'Complete conduit piping, circuit breaker panel installation, and load balancing.'
  });
  assert(newProject && newProject.id && newProject.title.includes('Lekki Mall'), 'addPortfolioItem() adds new project');

  const afterAddProvider = await LokatorDB.getProviderById(targetId);
  assert(afterAddProvider.portfolio.some(p => p.id === newProject.id), 'New project appears in provider portfolio');

  const deleted = await LokatorDB.deletePortfolioItem(targetId, newProject.id);
  assert(deleted === true, 'deletePortfolioItem() removes project');

  // 6. Dashboard Metrics Calculation
  const metrics = await LokatorDB.getProviderDashboardMetrics(targetId);
  assert(metrics !== null && typeof metrics === 'object', 'getProviderDashboardMetrics() computes metrics');
  assert(typeof metrics.profileViewsThisMonth === 'number' && metrics.profileViewsThisMonth >= 0, 'Metrics include profile views');
  assert(typeof metrics.leadsThisMonth === 'number' && metrics.leadsThisMonth >= 0, 'Metrics include direct customer leads');
  assert(typeof metrics.ratingDistribution === 'object', 'Metrics include 5-star rating breakdown');

  // 7. Subscription Tier Upgrade
  const upgradedPlan = await LokatorDB.upgradeSubscriptionPlan(targetId, 'premium');
  assert(upgradedPlan.subscriptionPlan === 'premium', 'upgradeSubscriptionPlan() upgrades to Premium tier');
  assert(upgradedPlan.isTop === true, 'Premium tier activates isTop spotlight status');

  // --- SECTION E: UI File & Template Integrity ---
  console.log('\n--- SECTION E: HTML Pages & Asset Integrity ---');
  
  const loginHtml = fs.readFileSync(path.join(__dirname, 'login.html'), 'utf8');
  assert(loginHtml.includes('login-form'), 'login.html contains login-form');
  assert(!loginHtml.includes('btn-demo-provider'), 'login.html has removed demo login buttons for live production standard');
  assert(loginHtml.includes('supabase-client.js'), 'login.html imports supabase-client.js');

  const dashHtml = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
  assert(dashHtml.includes('dash-avail-check'), 'dashboard.html contains live availability toggle');
  assert(dashHtml.includes('dash-sidebar'), 'dashboard.html contains tabbed sidebar');
  assert(dashHtml.includes('tab-overview'), 'dashboard.html contains overview tab');
  assert(dashHtml.includes('tab-profile'), 'dashboard.html contains profile editor');
  assert(dashHtml.includes('tab-portfolio'), 'dashboard.html contains portfolio manager');
  assert(dashHtml.includes('modal-portfolio'), 'dashboard.html contains add project modal');

  const regHtml = fs.readFileSync(path.join(__dirname, 'register.html'), 'utf8');
  assert(regHtml.includes('password'), 'register.html contains password field');
  assert(regHtml.includes('LokatorDB.auth.signUp'), 'register.html calls LokatorDB.auth.signUp');

  console.log('\n==================================================');
  console.log(`ALL PHASE 3 AUTH & DASHBOARD TESTS: ${passed} / ${total} PASSED`);
  console.log('==================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase3Tests();

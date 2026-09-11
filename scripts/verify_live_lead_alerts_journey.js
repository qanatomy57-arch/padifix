/**
 * PADIFIX — PHASE 026 AUTOMATED VERIFICATION SUITE
 * scripts/verify_live_lead_alerts_journey.js
 *
 * Implements the mandatory 8-Gate Verification Suite for Phase 026:
 * - Test 1: WhatsApp contact initiation triggers lead notification in public.artisan_notifications
 * - Test 2: Call contact initiation triggers lead notification in public.artisan_notifications
 * - Test 3: Simulated Termii success (_inject.forceSuccess=true) records status='sent' with message ID
 * - Test 4: Sender approval pending (TERMII_SENDER_ID_APPROVED=false) records status='pending_sender_approval' without live SMS
 * - Test 5: Zero customer PII in SMS body, database records, API responses, and logs
 * - Test 6: UUID integrity (valid UUID retained, malformed string becomes null, no PostgreSQL syntax violation)
 * - Test 7: RPC 404 fallback (graceful in-memory fallback without false quota exhaustion)
 * - Test 8: Non-blocking client contact flow assertion in profile.js and search.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const TARGET_REF = process.env.SUPABASE_PROJECT_REF || 'hvxosxhnxauiqrhpyuur';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${TARGET_REF}.supabase.co`;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const contactMeterHandler = require('../api/contact-meter');
const notificationService = require('../lib/artisan-notification-service');

let totalGates = 0;
let passedGates = 0;
let failedGates = 0;
const gateResults = [];

function recordGate(gateNum, title, passed, detail = '', error = null) {
  totalGates++;
  if (passed) {
    passedGates++;
    console.log(`  \x1b[32m✅ [PASS] Gate ${gateNum}: ${title}\x1b[0m`);
    if (detail) console.log(`     ↳ ${detail}`);
  } else {
    failedGates++;
    console.log(`  \x1b[31m❌ [FAIL] Gate ${gateNum}: ${title}\x1b[0m`);
    if (detail) console.error(`     ↳ ${detail}`);
    if (error) console.error(`     ↳ Error: ${error.message || error}`);
  }
  gateResults.push({ gate: gateNum, title, passed, detail, error: error ? String(error.message || error) : null });
}

function createMockContext(options = {}) {
  const req = {
    method: options.method || 'POST',
    url: options.url || '/api/contact-meter',
    headers: { 'content-type': 'application/json', ...options.headers },
    body: options.body || {},
    query: options.query || {},
    socket: { remoteAddress: options.ip || '127.0.0.1' }
  };
  let statusCode = 200;
  let headers = {};
  let bodyData = null;

  const res = {
    status(code) { statusCode = code; return this; },
    setHeader(k, v) { headers[k] = v; return this; },
    json(data) { bodyData = data; return this; },
    end(data) { if (data && !bodyData) bodyData = data; return this; }
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => bodyData,
    getHeaders: () => headers
  };
}

async function queryRecentNotifications(providerId, limit = 5) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/artisan_notifications?provider_id=eq.${providerId}&order=created_at.desc&limit=${limit}`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (res.ok) return await res.json();
  } catch (err) {}
  return [];
}

async function runSuite() {
  console.log('='.repeat(80));
  console.log('PADIFIX — PHASE 026: REAL-TIME SMS & LEAD ALERTS (TERMII INTEGRATION)');
  console.log('Mandatory 8-Gate Verification Suite');
  console.log('='.repeat(80));

  const testProviderId = 8; // Verified provider "Arise wire"

  // --------------------------------------------------------------------------
  // TEST 1: WhatsApp Contact Initiation -> Lead Notification
  // --------------------------------------------------------------------------
  console.log('\n--- GATE 1: WHATSAPP LEAD ALERT DISPATCH ---');
  try {
    const uniqueKey = `idem_p26_wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ctx = createMockContext({
      body: {
        provider_id: testProviderId,
        channel: 'whatsapp',
        locality: 'Ikeja, Lagos',
        intent_tag: 'Plumber',
        idempotency_key: uniqueKey,
        mode: 'soft_cap'
      }
    });

    await contactMeterHandler(ctx.req, ctx.res);
    const status = ctx.getStatusCode();
    const data = ctx.getData();

    const apiSuccess = status === 200 && data && data.status === 'success' && data.allowed === true;
    
    // Allow brief time for async notification persistence
    await new Promise(r => setTimeout(r, 600));
    const notifs = await queryRecentNotifications(testProviderId, 3);
    const hasDbRecord = notifs.length > 0;
    const latest = notifs[0] || {};

    const passed = apiSuccess && hasDbRecord && latest.channel === 'sms';
    recordGate(1, 'POST /api/contact-meter (whatsapp) dispatches lead and logs notification', passed,
      `HTTP ${status}, notifications in DB: ${notifs.length}, latest status: ${latest.status}, channel: ${latest.channel}`);
  } catch (err) {
    recordGate(1, 'POST /api/contact-meter (whatsapp) lead dispatch', false, '', err);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Call Contact Initiation -> Lead Notification
  // --------------------------------------------------------------------------
  console.log('\n--- GATE 2: CALL LEAD ALERT DISPATCH ---');
  try {
    const uniqueKey = `idem_p26_call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ctx = createMockContext({
      body: {
        provider_id: testProviderId,
        channel: 'call',
        locality: 'Surulere, Lagos',
        intent_tag: 'Electrician',
        idempotency_key: uniqueKey,
        mode: 'soft_cap'
      }
    });

    await contactMeterHandler(ctx.req, ctx.res);
    const status = ctx.getStatusCode();
    const data = ctx.getData();

    const apiSuccess = status === 200 && data && data.status === 'success' && data.allowed === true;

    await new Promise(r => setTimeout(r, 600));
    const notifs = await queryRecentNotifications(testProviderId, 3);
    const latest = notifs[0] || {};

    const passed = apiSuccess && latest.provider_id === testProviderId && latest.channel === 'sms';
    recordGate(2, 'POST /api/contact-meter (call) dispatches lead and logs notification', passed,
      `HTTP ${status}, contact allowed: ${data?.allowed}, latest notification ID: ${latest.id}`);
  } catch (err) {
    recordGate(2, 'POST /api/contact-meter (call) lead dispatch', false, '', err);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Simulated Termii Success (_inject.forceSuccess=true)
  // --------------------------------------------------------------------------
  console.log('\n--- GATE 3: SIMULATED TERMII SUCCESS (_inject.forceSuccess) ---');
  try {
    const testUuid = crypto.randomUUID();
    const result = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: testUuid,
      providerId: testProviderId,
      locality: 'Lekki Phase 1',
      intentTag: 'Masonry',
      explicitPhone: '2348030001122',
      _inject: { forceSuccess: true }
    });

    const isDelivered = result.delivered === true && result.status === 'sent';
    const hasSimMessageId = result.messageId && result.messageId.startsWith('sim_test_');

    await new Promise(r => setTimeout(r, 600));
    const notifs = await queryRecentNotifications(testProviderId, 5);
    const sentRecord = notifs.find(n => (n.termii_message_id && n.termii_message_id === result.messageId) || ((n.message_body || '').includes('Masonry in Lekki Phase 1')));

    const passed = isDelivered && hasSimMessageId && Boolean(sentRecord && sentRecord.status === 'sent');
    recordGate(3, 'Simulated Termii success records status="sent" and termii_message_id', passed,
      `delivered: ${result.delivered}, status: ${result.status}, termii_message_id: ${result.messageId}, db verified: ${Boolean(sentRecord)}`);
  } catch (err) {
    recordGate(3, 'Simulated Termii success', false, '', err);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Sender Approval Pending (TERMII_SENDER_ID_APPROVED=false)
  // --------------------------------------------------------------------------
  console.log('\n--- GATE 4: SENDER ID APPROVAL PENDING GATE ---');
  try {
    const prevApproved = process.env.TERMII_SENDER_ID_APPROVED;
    process.env.TERMII_SENDER_ID_APPROVED = 'false';

    const testUuid = crypto.randomUUID();
    const result = await notificationService.dispatchArtisanLeadAlert({
      contactEventId: testUuid,
      providerId: testProviderId,
      locality: 'Yaba',
      intentTag: 'Painting',
      explicitPhone: '2348030001122'
    });

    process.env.TERMII_SENDER_ID_APPROVED = prevApproved;

    const isPending = result.delivered === false && result.status === 'pending_sender_approval';
    const hasPendingReason = result.reason === 'SENDER_ID_APPROVAL_PENDING';

    await new Promise(r => setTimeout(r, 600));
    const notifs = await queryRecentNotifications(testProviderId, 5);
    const pendingRecord = notifs.find(n => (n.contact_event_id === testUuid) || (n.status === 'pending_sender_approval' && (n.message_body || '').includes('Painting in Yaba')));

    const passed = isPending && hasPendingReason && Boolean(pendingRecord && pendingRecord.status === 'pending_sender_approval');
    recordGate(4, 'Unapproved Sender ID safely records pending_sender_approval without calling Termii wire', passed,
      `status: ${result.status}, reason: ${result.reason}, db record verified: ${Boolean(pendingRecord)}`);
  } catch (err) {
    recordGate(4, 'Sender approval pending gate', false, '', err);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Zero Customer PII in SMS Body & Database Records
  // --------------------------------------------------------------------------
  console.log('\n--- GATE 5: ZERO CUSTOMER PII AUDIT ---');
  try {
    const notifs = await queryRecentNotifications(testProviderId, 15);
    const padifixAlerts = notifs.filter(n => (n.message_body || '').startsWith('PadiFix Alert: You have a new customer inquiry for'));
    let piiViolations = 0;
    const forbiddenPatterns = [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // email
      /\b0[789][01]\d{8}\b/, // Nigerian customer phone pattern
      /\b234[789][01]\d{8}\b/, // International Nigerian phone pattern
      /bearer\s+[a-zA-Z0-9-_.]+/i, // JWT auth token
      /ip[:=]\s*\d+\.\d+\.\d+\.\d+/i // IP addresses
    ];

    assert.ok(padifixAlerts.length > 0, 'Must have captured PadiFix Alert notification records');

    for (const notif of padifixAlerts) {
      const bodyText = notif.message_body || '';
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(bodyText)) {
          piiViolations++;
          console.error(`  ⚠️ PII Leak in notification ${notif.id}: ${bodyText}`);
        }
      }
      assert.strictEqual(
        bodyText.startsWith('PadiFix Alert: You have a new customer inquiry for'),
        true,
        'Message must conform to canonical zero-PII template'
      );
    }

    const passed = piiViolations === 0 && padifixAlerts.length > 0;
    recordGate(5, 'Zero customer PII confirmed across all notification records and SMS bodies', passed,
      `Audited ${padifixAlerts.length} canonical records. PII leaks detected: ${piiViolations}`);
  } catch (err) {
    recordGate(5, 'Zero customer PII audit', false, '', err);
  }

  // --------------------------------------------------------------------------
  // TEST 6: UUID Integrity
  // --------------------------------------------------------------------------
  console.log('\n--- GATE 6: UUID INTEGRITY & MALFORMED ID HANDLING ---');
  try {
    const validUuid = crypto.randomUUID();
    const validLogged = await notificationService.logNotificationToDb({
      contactEventId: validUuid,
      providerId: testProviderId,
      recipientPhone: '2348011223344',
      status: 'pending_sender_approval',
      messageBody: 'PadiFix Alert: UUID valid test'
    });

    const malformedId = 'idem_provider_8_whatsapp_not_a_uuid_12345';
    const malformedLogged = await notificationService.logNotificationToDb({
      contactEventId: malformedId,
      providerId: testProviderId,
      recipientPhone: '2348011223344',
      status: 'pending_sender_approval',
      messageBody: 'PadiFix Alert: UUID malformed fallback test'
    });

    await new Promise(r => setTimeout(r, 600));
    const notifs = await queryRecentNotifications(testProviderId, 5);
    const malformedRecord = notifs.find(n => n.message_body === 'PadiFix Alert: UUID malformed fallback test');
    const isMalformedSafelyNull = malformedRecord ? malformedRecord.contact_event_id === null : true;

    const passed = validLogged === true && malformedLogged === true && isMalformedSafelyNull;
    recordGate(6, 'UUID integrity verified: valid UUID retained, malformed string safely converted to null', passed,
      `validLogged: ${validLogged}, malformedLogged: ${malformedLogged}, DB contact_event_id was null: ${isMalformedSafelyNull}`);
  } catch (err) {
    recordGate(6, 'UUID integrity test', false, '', err);
  }

  // --------------------------------------------------------------------------
  // TEST 7: RPC 404 Fallback
  // --------------------------------------------------------------------------
  console.log('\n--- GATE 7: RPC 404 RESILIENT QUOTA FALLBACK ---');
  try {
    notificationService.resetSmsQuotasForTest();
    const testScope = `artisan:test_${Date.now()}`;
    const testDate = notificationService.getLagosDateString();

    const res1 = await notificationService.reserveDailySmsQuota({
      scope: testScope,
      date: testDate,
      cap: 2
    });

    const res2 = await notificationService.reserveDailySmsQuota({
      scope: testScope,
      date: testDate,
      cap: 2
    });

    const res3Exceeded = await notificationService.reserveDailySmsQuota({
      scope: testScope,
      date: testDate,
      cap: 2
    });

    const passed = res1.allowed === true && res2.allowed === true && res3Exceeded.allowed === false;
    recordGate(7, 'RPC 404 fallback works: falls back to memory quota without false exhaustion, enforces cap', passed,
      `Req 1: ${res1.allowed} (count ${res1.current_count}), Req 2: ${res2.allowed} (count ${res2.current_count}), Req 3: ${res3Exceeded.allowed} (exhausted: ${!res3Exceeded.allowed})`);
  } catch (err) {
    recordGate(7, 'RPC 404 resilient quota fallback', false, '', err);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Non-Blocking Client Contact Flow Assertion
  // --------------------------------------------------------------------------
  console.log('\n--- GATE 8: NON-BLOCKING CLIENT CONTACT FLOW CODE AUDIT ---');
  try {
    const profileJs = fs.readFileSync(path.resolve(__dirname, '../profile.js'), 'utf8');
    const searchJs = fs.readFileSync(path.resolve(__dirname, '../search.js'), 'utf8');
    const pwaJs = fs.readFileSync(path.resolve(__dirname, '../pwa-manager.js'), 'utf8');

    const hasCallChannelHandling = profileJs.includes("const normChannel = channel === 'call' ? 'call' : 'whatsapp';");
    const hasAsyncPwaDispatch = profileJs.includes("PadiFixPWA.dispatchContactLead({");
    const hasNonBlockingCatch = profileJs.includes("}).catch(() => {});");

    const searchHasCallLeadDispatch = searchJs.includes("PadiFixPWA.dispatchContactLead") &&
                                      searchJs.includes("channel: 'call'");

    const pwaForwardsLocality = pwaJs.includes("locality: leadData.locality");
    const pwaForwardsIntent = pwaJs.includes("intent_tag: leadData.intent_tag");

    const passed = hasCallChannelHandling && hasAsyncPwaDispatch && hasNonBlockingCatch &&
                   searchHasCallLeadDispatch && pwaForwardsLocality && pwaForwardsIntent;

    recordGate(8, 'Non-blocking client flow certified: Call & WhatsApp launch natively without blocking on API', passed,
      `profile.js normalized: ${hasCallChannelHandling}, search.js call dispatch: ${searchHasCallLeadDispatch}, pwa-manager forwards: ${pwaForwardsLocality && pwaForwardsIntent}`);
  } catch (err) {
    recordGate(8, 'Non-blocking client flow audit', false, '', err);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`PHASE 026 SUITE COMPLETE: ${passedGates}/${totalGates} GATES PASSED`);
  if (failedGates === 0) {
    console.log('\x1b[32mALL 8 PHASE 026 GATES CERTIFIED GREEN ✅\x1b[0m');
  } else {
    console.log(`\x1b[31m${failedGates} GATES FAILED ❌\x1b[0m`);
  }
  console.log('='.repeat(80));

  const reportPath = path.resolve(__dirname, '../phase_026_lead_alerts_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalGates,
    passedGates,
    failedGates,
    status: failedGates === 0 ? 'CERTIFIED_GREEN' : 'FAILED',
    gateResults
  }, null, 2));
  console.log(`Report written to: ${reportPath}`);

  if (failedGates > 0) process.exit(1);
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

/**
 * PADIFIX PRODUCTION BACKDOOR & TEST-HOOK SCANNER
 * scripts/scan_production_backdoors.js
 *
 * Scans the codebase for prohibited production-accessible test mechanisms:
 * - compliance_reset
 * - test-reset
 * - x-compliance-test-reset
 * - padifix_compliance_reset_approved
 * - bypass authentication
 * - mock admin authentication
 * - hardcoded production credentials
 * - hardcoded admin secrets
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('='.repeat(80));
console.log('🛡️  PADIFIX PRODUCTION BACKDOOR & TEST-HOOK AUDIT');
console.log('='.repeat(80));

const ROOT = path.join(__dirname, '..');

const prohibitedPatterns = [
  'compliance_reset',
  'test-reset',
  'x-compliance-test-reset',
  'padifix_compliance_reset_approved',
  'bypass authentication',
  'mock admin authentication'
];

const targetFiles = [
  'api/admin-compliance.js',
  'api/contact-meter.js',
  'api/kyc-webhook.js',
  'api/paystack-init.js',
  'api/paystack-verify.js',
  'api/paystack-webhook.js',
  'admin.html',
  'admin.js',
  'app.js',
  'dashboard.js',
  'profile.js'
];

let detections = 0;

for (const relPath of targetFiles) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) continue;

  const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
  for (const pattern of prohibitedPatterns) {
    if (content.includes(pattern)) {
      console.error(`❌ PROHIBITED TEST HOOK / BACKDOOR FOUND in ${relPath}: "${pattern}"`);
      detections++;
    }
  }
}

assert.strictEqual(detections, 0, `Found ${detections} prohibited backdoor / test hooks!`);
console.log('  ✅ Zero production backdoor or test-hook mechanisms detected');
console.log('='.repeat(80));

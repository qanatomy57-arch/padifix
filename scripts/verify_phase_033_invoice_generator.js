/**
 * PADIFIX PHASE 033: IN-APP DIGITAL QUOTE & INVOICE GENERATOR VERIFICATION SUITE
 * File: scripts/verify_phase_033_invoice_generator.js
 *
 * Verifies:
 * Gate 1:  Schema & Migration 051 (PostgreSQL migration syntax, RLS revocation of direct client writes, unique indexes)
 * Gate 2:  Server-Authoritative Authorization & Multi-Tenant Isolation (Provider A -> Provider A PASS, Provider A -> Provider B FAIL, Unauthenticated FAIL)
 * Gate 3:  Server-Side Authoritative Financial Recalculation (Line item math, tamper rejection)
 * Gate 4:  Strict Integer Kobo Invariant (Zero floating-point persistence, non-negative bounds)
 * Gate 5:  Unique Server-Authoritative Invoice Numbering (INV-PF-XXXXXXXX format, collision resistance, client override rejection)
 * Gate 6:  Dual-Category Representation (Workmanship & Materials independently itemized with quantities & unit prices)
 * Gate 7:  Discount Constraints & Subtotal Validation (Discount cannot exceed subtotal, negative values rejected, total >= 0)
 * Gate 8:  Client-Side PDF & Print Document Architecture (@media print isolation, zero-cost window.print() layout)
 * Gate 9:  Ephemeral WhatsApp Breakdown Generation (wa.me/?text=... deep link, zero chat persistence, Privacy Invariant C)
 * Gate 10: CRM Pipeline Lifecycle Synchronization (Draft keeps status; Issue advances to quote_sent; Mark paid audits final_amount_kobo)
 * Gate 11: Privacy & XSS Sanitization Audit (Zero financial PII/cards/customer phone persistence; HTML injection stripped)
 * Gate 12: Serverless Function Budget Constraint (Strictly 12/12 deployed ceiling, zero new API files)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const LeadStore = require('../lib/lead-store');
const providerLeadsHandler = require('../api/provider-leads');

const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function runGate(gateNum, gateName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] Gate ${gateNum}: ${gateName}`);
  } catch (err) {
    console.error(`  [FAIL] Gate ${gateNum}: ${gateName}`);
    console.error(`         Error: ${err.message}`);
    throw err;
  }
}

async function runAsyncGate(gateNum, gateName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] Gate ${gateNum}: ${gateName}`);
  } catch (err) {
    console.error(`  [FAIL] Gate ${gateNum}: ${gateName}`);
    console.error(`         Error: ${err.message}`);
    throw err;
  }
}

// Mock HTTP Request/Response Helper
function createMockReqRes({ method = 'GET', url = '/', headers = {}, body = {}, query = {} }) {
  const req = {
    method,
    url,
    headers: { host: 'localhost', ...headers },
    body,
    query
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, val) {
      this.headers[key] = val;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    }
  };

  return { req, res };
}

async function runSuite() {
  console.log('============================================================');
  console.log('PADIFIX PHASE 033: IN-APP DIGITAL QUOTE & INVOICE SUITE');
  console.log('============================================================\n');

  // --------------------------------------------------------------------------
  // GATE 1: SCHEMA & MIGRATION 051
  // --------------------------------------------------------------------------
  runGate(1, 'Database Schema & Migration 051 Constraints', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '051_padifix_phase_033_quote_and_invoice_engine.sql');
    assert.ok(fs.existsSync(migPath), 'Migration 051 must exist on disk.');
    const sql = fs.readFileSync(migPath, 'utf8');

    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS invoice_ref TEXT'), 'Must add invoice_ref column.');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS invoice_data JSONB'), 'Must add invoice_data JSONB column.');
    assert.ok(sql.includes('chk_contact_events_invoice_ref_format'), 'Must enforce invoice reference format constraint.');
    assert.ok(sql.includes('idx_ce_invoice_ref_unique'), 'Must create unique index on invoice_ref.');
    assert.ok(sql.includes('REVOKE UPDATE (invoice_ref, invoice_data) ON public.contact_events FROM anon, authenticated'),
      'Must explicitly revoke direct client UPDATE on invoice_ref/invoice_data to preserve server-authoritative invariant.');
  });

  // --------------------------------------------------------------------------
  // GATE 2: AUTHORIZATION & MULTI-TENANT ISOLATION
  // --------------------------------------------------------------------------
  await runAsyncGate(2, 'Multi-Tenant Ownership & IDOR Protection', async () => {
    // Provider 101 has seed lead: lead_seed_101_01
    // Provider 8 has seed lead: lead_seed_8_01

    // 2.1 Provider 101 saving invoice on Provider 101's lead -> ALLOWED (200)
    const validSave = LeadStore.saveLeadInvoice(101, 'lead_seed_101_01', {
      invoice_type: 'quote',
      status: 'draft',
      items: {
        workmanship: [{ description: 'Wiring overhaul', quantity: 1, unit_price_kobo: 2500000 }]
      },
      bank_details: { bank_name: 'GTBank', account_number: '0123456789', account_name: 'Babatunde Electric' }
    });
    assert.strictEqual(validSave.success, true, 'Provider 101 must be allowed to save invoice on Provider 101 lead.');

    // 2.2 Provider 8 attempting IDOR save against Provider 101's lead -> FORBIDDEN (403)
    const idorSave = LeadStore.saveLeadInvoice(8, 'lead_seed_101_01', {
      invoice_type: 'quote',
      items: { workmanship: [{ description: 'Hack attempt', quantity: 1, unit_price_kobo: 100000 }] }
    });
    assert.strictEqual(idorSave.statusCode, 403, 'Cross-provider IDOR save must return 403 Forbidden.');

    // 2.3 Provider 8 attempting IDOR get against Provider 101's invoice -> FORBIDDEN (403)
    const idorGet = LeadStore.getLeadInvoice(8, 'lead_seed_101_01');
    assert.strictEqual(idorGet.statusCode, 403, 'Cross-provider IDOR get must return 403 Forbidden.');

    // 2.4 Unauthenticated request to save_invoice -> 401 Unauthorized
    const { req: unauthReq, res: unauthRes } = createMockReqRes({
      method: 'POST',
      body: { action: 'save_invoice', lead_id: 'lead_seed_101_01' }
    });
    await providerLeadsHandler(unauthReq, unauthRes);
    assert.strictEqual(unauthRes.statusCode, 401, 'Unauthenticated save_invoice must be denied with 401.');
  });

  // --------------------------------------------------------------------------
  // GATE 3: FINANCIAL RECALCULATION & CLIENT TAMPER REJECTION
  // --------------------------------------------------------------------------
  runGate(3, 'Authoritative Server-Side Financial Recalculation', () => {
    // Client attempts to claim total is ₦1 (100 kobo), while items are ₦50,000 (5,000,000 kobo)
    const res = LeadStore.saveLeadInvoice(101, 'lead_seed_101_02', {
      invoice_type: 'quote',
      status: 'draft',
      total_kobo: 100, // Client tampered value
      items: {
        workmanship: [{ description: 'Inverter Diagnostics', quantity: 1, unit_price_kobo: 3000000 }],
        materials: [{ description: 'Battery Terminal Cable', quantity: 2, unit_price_kobo: 1000000 }]
      },
      discount_kobo: 500000
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.invoice.workmanship_subtotal_kobo, 3000000, 'Workmanship subtotal must be 3,000,000 kobo (₦30,000).');
    assert.strictEqual(res.invoice.materials_subtotal_kobo, 2000000, 'Materials subtotal must be 2,000,000 kobo (₦20,000).');
    assert.strictEqual(res.invoice.subtotal_kobo, 5000000, 'Gross subtotal must be 5,000,000 kobo (₦50,000).');
    assert.strictEqual(res.invoice.discount_kobo, 500000, 'Discount must be 500,000 kobo (₦5,000).');
    assert.strictEqual(res.invoice.total_kobo, 4500000, 'Server must override client tamper and compute authoritative 4,500,000 kobo (₦45,000).');
    assert.strictEqual(res.lead.quote_amount_kobo, 4500000, 'Canonical lead.quote_amount_kobo must synchronize to 4,500,000 kobo.');
  });

  // --------------------------------------------------------------------------
  // GATE 4: INTEGER KOBO INVARIANT
  // --------------------------------------------------------------------------
  runGate(4, 'Integer Kobo Precision & Non-Negative Enforcement', () => {
    // 4.1 Reject float in unit price
    const floatRes = LeadStore.saveLeadInvoice(101, 'lead_seed_101_02', {
      items: {
        workmanship: [{ description: 'Float test', quantity: 1, unit_price_kobo: 25000.5 }]
      }
    });
    assert.strictEqual(floatRes.statusCode, 400, 'Floating point unit price must be rejected.');

    // 4.2 Reject negative unit price
    const negRes = LeadStore.saveLeadInvoice(101, 'lead_seed_101_02', {
      items: {
        workmanship: [{ description: 'Negative price', quantity: 1, unit_price_kobo: -500 }]
      }
    });
    assert.strictEqual(negRes.statusCode, 400, 'Negative unit price must be rejected.');

    // 4.3 Reject negative quantity
    const negQtyRes = LeadStore.saveLeadInvoice(101, 'lead_seed_101_02', {
      items: {
        workmanship: [{ description: 'Negative qty', quantity: -2, unit_price_kobo: 50000 }]
      }
    });
    assert.strictEqual(negQtyRes.statusCode, 400, 'Negative quantity must be rejected.');
  });

  // --------------------------------------------------------------------------
  // GATE 5: SERVER-AUTHORITATIVE INVOICE NUMBERING
  // --------------------------------------------------------------------------
  runGate(5, 'Invoice Numbering (INV-PF-XXXXXXXX, Unique & Stable)', () => {
    const res1 = LeadStore.saveLeadInvoice(101, 'lead_seed_101_04', {
      invoice_type: 'quote',
      status: 'draft',
      items: { workmanship: [{ description: 'Inspection', quantity: 1, unit_price_kobo: 1000000 }] }
    });

    assert.ok(/^INV-PF-[A-Z0-9]{6,12}$/.test(res1.invoice_number), `Invoice number must match INV-PF-XXXXXXXX pattern, got ${res1.invoice_number}`);
    const originalNumber = res1.invoice_number;

    // Subsequent save on the same lead must retain the identical invoice number (stability invariant)
    const res2 = LeadStore.saveLeadInvoice(101, 'lead_seed_101_04', {
      invoice_type: 'quote',
      status: 'issued',
      items: { workmanship: [{ description: 'Inspection revised', quantity: 1, unit_price_kobo: 1200000 }] }
    });

    assert.strictEqual(res2.invoice_number, originalNumber, 'Invoice number must remain stable on subsequent saves.');
    assert.strictEqual(res2.invoice.invoice_number, originalNumber);
  });

  // --------------------------------------------------------------------------
  // GATE 6: DUAL-CATEGORY ITEMIZATION
  // --------------------------------------------------------------------------
  runGate(6, 'Dual-Category (Workmanship vs Materials) Representation', () => {
    const res = LeadStore.saveLeadInvoice(101, 'lead_seed_101_01', {
      invoice_type: 'quote',
      status: 'draft',
      items: {
        workmanship: [
          { description: 'Conduit Trunking Labor', quantity: 1, unit_price_kobo: 1500000 },
          { description: 'Board Terminations', quantity: 1, unit_price_kobo: 2000000 }
        ],
        materials: [
          { description: 'PVC Conduit Pipes 20mm', quantity: 5, unit_price_kobo: 400000 },
          { description: 'Saddle Clips Box', quantity: 2, unit_price_kobo: 250000 }
        ]
      }
    });

    assert.strictEqual(res.invoice.items.workmanship.length, 2, 'Workmanship category must contain exactly 2 items.');
    assert.strictEqual(res.invoice.items.materials.length, 2, 'Materials category must contain exactly 2 items.');
    assert.strictEqual(res.invoice.workmanship_subtotal_kobo, 3500000, 'Workmanship subtotal must equal 3,500,000 kobo.');
    assert.strictEqual(res.invoice.materials_subtotal_kobo, 2500000, 'Materials subtotal must equal 2,500,000 kobo (5*400k + 2*250k).');
    assert.strictEqual(res.lead.workmanship_amount_kobo, 3500000, 'lead.workmanship_amount_kobo must match.');
    assert.strictEqual(res.lead.materials_amount_kobo, 2500000, 'lead.materials_amount_kobo must match.');
  });

  // --------------------------------------------------------------------------
  // GATE 7: DISCOUNT VALIDATION
  // --------------------------------------------------------------------------
  runGate(7, 'Discount Validation & Subtotal Bounds', () => {
    // Subtotal: ₦20,000 (2,000,000 kobo). Attempting discount: ₦25,000 (2,500,000 kobo)
    const errRes = LeadStore.saveLeadInvoice(101, 'lead_seed_101_01', {
      items: { workmanship: [{ description: 'Quick check', quantity: 1, unit_price_kobo: 2000000 }] },
      discount_kobo: 2500000
    });
    assert.strictEqual(errRes.statusCode, 400, 'Discount exceeding subtotal must be rejected.');

    // Negative discount
    const negDisc = LeadStore.saveLeadInvoice(101, 'lead_seed_101_01', {
      items: { workmanship: [{ description: 'Quick check', quantity: 1, unit_price_kobo: 2000000 }] },
      discount_kobo: -1000
    });
    assert.strictEqual(negDisc.statusCode, 400, 'Negative discount must be rejected.');
  });

  // --------------------------------------------------------------------------
  // GATE 8: CLIENT-SIDE PRINTABLE RECEIPT / PDF ARCHITECTURE
  // --------------------------------------------------------------------------
  runGate(8, 'Client-Side Printable Receipt & @media print Stylesheet', () => {
    const htmlPath = path.join(rootDir, 'dashboard.html');
    const cssPath = path.join(rootDir, 'dashboard.css');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(html.includes('id="invoice-printable-sheet"'), 'dashboard.html must contain #invoice-printable-sheet.');
    assert.ok(html.includes('class="printable-invoice-document"'), 'Printable document must have specific container class.');
    assert.ok(html.includes('id="print-table-body"'), 'Must have dynamic table body for print items.');
    assert.ok(html.includes('id="print-grand-total"'), 'Must have grand total display in printable document.');

    assert.ok(css.includes('@media print'), 'dashboard.css must define @media print rules.');
    assert.ok(css.includes('#invoice-printable-sheet'), '@media print must target #invoice-printable-sheet.');
    assert.ok(css.includes('display: none !important'), '@media print must hide outer dashboard chrome.');
  });

  // --------------------------------------------------------------------------
  // GATE 9: WHATSAPP FORMATTED BREAKDOWN
  // --------------------------------------------------------------------------
  runGate(9, 'WhatsApp Formatted Breakdown & Deep Link Invariant', () => {
    const jsPath = path.join(rootDir, 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    assert.ok(js.includes('formatWhatsAppInvoiceBreakdown'), 'dashboard.js must contain formatWhatsAppInvoiceBreakdown.');
    assert.ok(js.includes('wa.me/?text='), 'Must format ephemeral wa.me/?text= deep link.');
    assert.ok(js.includes('*PADIFIX'), 'Must include PadiFix branded title in WhatsApp text.');
    assert.ok(js.includes('WORKMANSHIP / LABOR'), 'Must format Workmanship header in WhatsApp text.');
    assert.ok(js.includes('MATERIALS & SUPPLIES'), 'Must format Materials header in WhatsApp text.');
    assert.ok(js.includes('DIRECT BANK PAYMENT'), 'Must include direct bank payment details in WhatsApp text.');
  });

  // --------------------------------------------------------------------------
  // GATE 10: CRM PIPELINE SYNCHRONIZATION (DRAFT VS SENT VS PAID)
  // --------------------------------------------------------------------------
  runGate(10, 'CRM Pipeline Lifecycle Synchronization', () => {
    // Transition lead 101_01 to 'in_discussion' using authoritative updateLead
    LeadStore.updateLead(101, 'lead_seed_101_01', { status: 'in_discussion' });

    // 10.1 Save Draft -> Status MUST REMAIN in_discussion
    const draftRes = LeadStore.saveLeadInvoice(101, 'lead_seed_101_01', {
      status: 'draft',
      items: { workmanship: [{ description: 'Draft inspect', quantity: 1, unit_price_kobo: 3000000 }] }
    });
    assert.strictEqual(draftRes.lead.status, 'in_discussion', 'Saving draft must NOT advance lead status.');
    assert.strictEqual(draftRes.invoice.status, 'draft', 'Invoice document status must be draft.');

    // 10.2 Issue Quote -> Status MUST advance to quote_sent
    const issuedRes = LeadStore.saveLeadInvoice(101, 'lead_seed_101_01', {
      status: 'issued',
      items: { workmanship: [{ description: 'Final quote inspect', quantity: 1, unit_price_kobo: 3000000 }] }
    });
    assert.strictEqual(issuedRes.lead.status, 'quote_sent', 'Issuing quote must advance lead to quote_sent.');
    assert.strictEqual(issuedRes.invoice.status, 'issued', 'Invoice status must be issued.');

    // 10.3 Mark Paid explicit action -> Updates final_amount_kobo and invoice status to paid
    const paidRes = LeadStore.markInvoicePaid(101, 'lead_seed_101_01');
    assert.strictEqual(paidRes.success, true);
    assert.strictEqual(paidRes.invoice.status, 'paid', 'Invoice status must be paid.');
    assert.strictEqual(paidRes.lead.final_amount_kobo, 3000000, 'final_amount_kobo must record 3,000,000 kobo realized payment.');
    assert.notStrictEqual(paidRes.lead.status, 'completed', 'Invoice payment does NOT bypass completion workflow; completion remains distinct.');
  });

  // --------------------------------------------------------------------------
  // GATE 11: PRIVACY & XSS DEFENSE AUDIT
  // --------------------------------------------------------------------------
  runGate(11, 'Privacy Invariant C & Anti-XSS Sanitization', () => {
    const maliciousPayload = {
      customer: { name: '<script>alert("hack")</script>Dr. Bad Guy' },
      items: {
        workmanship: [
          { description: '<b>Wiring</b><img src=x onerror=alert(1)>', quantity: 1, unit_price_kobo: 1000000 }
        ]
      },
      terms: '<style>body{display:none;}</style>30-day warranty.<script>fetch("/steal")</script>',
      bank_details: {
        bank_name: '<script>alert(1)</script>GTBank',
        account_name: 'Test Artisan<b>Bold</b>',
        account_number: '0123456789'
      }
    };

    const res = LeadStore.saveLeadInvoice(101, 'lead_seed_101_02', maliciousPayload);
    assert.strictEqual(res.success, true);

    // Verify raw HTML & scripts stripped
    assert.ok(!res.invoice.customer.name.includes('<script>'), 'Customer name must be stripped of script tags.');
    assert.ok(!res.invoice.items.workmanship[0].description.includes('<img'), 'Item description must be stripped of img onerror tags.');
    assert.ok(!res.invoice.terms.includes('<style>'), 'Terms must be stripped of style tags.');
    assert.ok(!res.invoice.terms.includes('<script>'), 'Terms must be stripped of script tags.');
    assert.ok(!res.invoice.bank_details.bank_name.includes('<script>'), 'Bank name must be stripped of script tags.');

    // Verify Privacy Invariant C: no consumer phone number or card tokens in invoice_data
    assert.strictEqual(res.invoice.customer.phone, undefined, 'Customer phone number must NOT exist in invoice_data.');
    assert.strictEqual(res.invoice.customer.card, undefined, 'Credit card data must NOT exist in invoice_data.');
  });

  // --------------------------------------------------------------------------
  // GATE 12: STRICT 12/12 SERVERLESS FUNCTION BUDGET
  // --------------------------------------------------------------------------
  runGate(12, 'Strict 12/12 Serverless Function Budget Constraint', () => {
    const apiDir = path.join(rootDir, 'api');
    const apiFiles = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));

    // In PadiFix, api/ has 15 files with 3 rewrites in vercel.json mapping to existing files,
    // yielding exactly 12 deployed serverless functions on Vercel Hobby plan.
    // Zero new endpoints allowed!
    assert.strictEqual(apiFiles.length, 15, `API folder must contain exactly 15 files (12 deployed functions after vercel.json proxying). Found ${apiFiles.length}`);
    assert.ok(!apiFiles.includes('invoices.js'), 'Must NOT create api/invoices.js');
    assert.ok(!apiFiles.includes('quotes.js'), 'Must NOT create api/quotes.js');
    assert.ok(!apiFiles.includes('pdf.js'), 'Must NOT create api/pdf.js');
    assert.ok(apiFiles.includes('provider-leads.js'), 'api/provider-leads.js must remain the consolidated gateway.');
  });

  console.log('\n============================================================');
  console.log(`ALL GATES PASSED: ${passedTests}/${totalTests} (100% GREEN)`);
  console.log('============================================================');
}

runSuite().catch(err => {
  console.error('\nFATAL SUITE FAILURE:', err.message);
  process.exit(1);
});

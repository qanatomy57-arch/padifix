/**
 * PADIFIX PHASE 033: IN-APP DIGITAL QUOTE & INVOICE GENERATOR
 * Visual & Interactive Browser QA Suite (Desktop & Mobile)
 * Targets:
 * - Desktop Viewport (1280x800)
 * - Mobile Viewport (390x844)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.resolve('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\6b1d7c94-91ab-46fa-b918-8ff1283ede05');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function createLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/dashboard.html';

      // Mock provider-leads API endpoint
      if (req.url.startsWith('/api/provider-leads')) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              if (parsed.action === 'save_invoice') {
                const subtotal = (parsed.payload.workmanship || []).reduce((acc, r) => acc + (r.amount_kobo || (r.unit_price_kobo * r.quantity)), 0)
                  + (parsed.payload.materials || []).reduce((acc, r) => acc + (r.amount_kobo || (r.unit_price_kobo * r.quantity)), 0);
                const discount = parsed.payload.discount_kobo || 0;
                const total = Math.max(0, subtotal - discount);
                const invRef = parsed.payload.invoice_ref || 'INV-PF-QA77B901';
                return res.end(JSON.stringify({
                  success: true,
                  invoice_number: invRef,
                  invoice: {
                    ...parsed.payload,
                    invoice_ref: invRef,
                    status: parsed.payload.status,
                    totals: {
                      workmanship_kobo: (parsed.payload.workmanship || []).reduce((acc, r) => acc + (r.amount_kobo || 0), 0),
                      materials_kobo: (parsed.payload.materials || []).reduce((acc, r) => acc + (r.amount_kobo || 0), 0),
                      gross_subtotal_kobo: subtotal,
                      discount_kobo: discount,
                      grand_total_kobo: total
                    }
                  },
                  lead: {
                    id: parsed.lead_id,
                    invoice_ref: invRef,
                    status: parsed.payload.status === 'issued' ? 'quote_sent' : 'in_discussion'
                  }
                }));
              }
              if (parsed.action === 'mark_paid') {
                return res.end(JSON.stringify({
                  success: true,
                  lead: {
                    id: parsed.lead_id,
                    status: 'paid',
                    final_amount_kobo: 10100000
                  },
                  invoice: {
                    status: 'paid',
                    paid_at: new Date().toISOString()
                  }
                }));
              }
            } catch (e) {}
            return res.end(JSON.stringify({ success: true }));
          });
          return;
        }

        // GET request - return leads
        return res.end(JSON.stringify({
          success: true,
          leads: [
            {
              id: 'lead-cert-101',
              consumer_name: 'Engr. Babatunde Fash',
              service_category: 'Electrical Installations & Solar Setup',
              locality: 'Lagos Island, Lagos',
              intent_tag: 'Electrical Installations & Solar Setup',
              job_description: 'Full inverter system wiring and distribution box installation.',
              status: 'in_discussion',
              created_at: new Date(Date.now() - 3600000).toISOString(),
              invoice_ref: null,
              invoice_data: null
            },
            {
              id: 'lead-cert-102',
              consumer_name: 'Mrs. Chinyere Okeke',
              service_category: 'Plumbing & Water Heaters',
              locality: 'Ikeja, Lagos',
              intent_tag: 'Plumbing & Water Heaters',
              job_description: 'Commercial kitchen grease trap & pipe rerouting.',
              status: 'quote_sent',
              created_at: new Date(Date.now() - 7200000).toISOString(),
              invoice_ref: 'INV-PF-789012AB',
              invoice_data: {
                invoice_ref: 'INV-PF-789012AB',
                status: 'issued',
                totals: {
                  gross_subtotal_kobo: 7500000,
                  discount_kobo: 500000,
                  grand_total_kobo: 7000000
                }
              }
            }
          ],
          pipeline_metrics: {
            total_active: 2,
            in_discussion: 1,
            quote_sent: 1,
            completed: 0
          }
        }));
      }

      // Mock other API endpoints
      if (req.url.startsWith('/api/telemetry')) {
        res.writeHead(204);
        return res.end();
      }

      if (req.url.startsWith('/api/providers')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          provider: {
            id: 8,
            name: 'Adeyemi Daniels',
            category: 'Electrician',
            bank_name: 'GTBank',
            account_number: '0123456789',
            account_name: 'ADEYEMI DANIELS ENTERPRISES'
          }
        }));
      }

      const filePath = path.join(ROOT, reqPath.replace(/^\//, ''));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(fs.readFileSync(filePath));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function saveProof(page, filename) {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
  const dest = path.join(ARTIFACTS_DIR, filename);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(`  📸 Proof saved: ${filename}`);

  // Also save to root artifacts directory if present
  const rootArtifacts = path.join(ROOT, 'artifacts');
  if (fs.existsSync(rootArtifacts)) {
    try {
      fs.copyFileSync(dest, path.join(rootArtifacts, filename));
    } catch (e) {}
  }
}

async function dismissSplash(page) {
  try {
    await page.evaluate(() => {
      const splash = document.getElementById('pwa-app-splash');
      if (splash) {
        splash.style.display = 'none';
        splash.remove();
      }
    });
  } catch (e) {}
}

async function runVisualQA() {
  console.log('================================================================');
  console.log('PADIFIX PHASE 033 — BROWSER VISUAL & INTERACTIVE QA');
  console.log('================================================================\n');

  const { server, baseUrl } = await createLocalServer();
  console.log(`Local test server running on: ${baseUrl}`);

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (e) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  try {
    // -------------------------------------------------------------
    // 1. DESKTOP VIEWPORT QA (1280x800)
    // -------------------------------------------------------------
    console.log('\n--- 1. DESKTOP BROWSER QA (1280x800) ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const desktopPage = await desktopContext.newPage();

    desktopPage.on('console', msg => console.log(`  [BROWSER ${msg.type().toUpperCase()}]`, msg.text()));
    desktopPage.on('pageerror', err => console.log(`  [BROWSER ERROR]`, err.message));

    // Seed session in localStorage
    await desktopPage.addInitScript(() => {
      const testProvider = {
        id: 8,
        email: 'ad.padifix@outlook.com',
        first_name: 'Adeyemi',
        last_name: 'Daniels',
        name: 'Adeyemi Daniels',
        category: 'Electrician',
        bank_name: 'GTBank',
        account_number: '0123456789',
        account_name: 'ADEYEMI DANIELS ENTERPRISES'
      };
      localStorage.setItem('lokator_current_provider', JSON.stringify(testProvider));
      localStorage.setItem('lokator_current_provider_id', '8');
      localStorage.setItem('lokator_auth_session', JSON.stringify({ user: { id: 8, email: 'ad.padifix@outlook.com' } }));
      localStorage.setItem('lokator_supabase_auth_session', JSON.stringify({ user: { id: 8, email: 'ad.padifix@outlook.com' } }));
    });

    await desktopPage.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await dismissSplash(desktopPage);
    await desktopPage.waitForTimeout(1200);

    console.log(`  Current Desktop URL: ${desktopPage.url()}`);
    assert.ok(desktopPage.url().includes('dashboard.html'), 'Desktop should remain on dashboard.html');

    // Verify invoice elements exist in DOM
    const invoiceModal = await desktopPage.$('#invoice-generator-modal');
    assert.ok(invoiceModal, 'Invoice Generator Modal #invoice-generator-modal must exist in DOM');

    const printSheet = await desktopPage.$('#invoice-printable-sheet');
    assert.ok(printSheet, 'Invoice Printable Sheet #invoice-printable-sheet must exist in DOM');

    // Inspect rendered lead cards
    const leadIdsInPage = await desktopPage.evaluate(() => {
      return Array.from(document.querySelectorAll('.btn-chip-invoice')).map(b => b.dataset.leadId);
    });
    console.log(`  Lead IDs rendered on page (${leadIdsInPage.length}):`, leadIdsInPage);

    // Trigger invoice modal via Lead Card button or direct invocation
    console.log('  Opening Invoice Generator Modal on Lead...');
    await desktopPage.evaluate((targetId) => {
      const idToOpen = targetId || (document.querySelector('.btn-chip-invoice')?.dataset?.leadId);
      if (typeof window.openInvoiceGeneratorModal === 'function') {
        window.openInvoiceGeneratorModal(idToOpen);
      } else {
        const btn = document.querySelector('.btn-chip-invoice');
        if (btn) btn.click();
      }
    }, leadIdsInPage[0] || 'lead-cert-101');
    await desktopPage.waitForTimeout(600);

    const isModalVisible = await desktopPage.evaluate(() => {
      const modal = document.getElementById('invoice-generator-modal');
      return modal && modal.style.display !== 'none';
    });
    assert.ok(isModalVisible, 'Invoice Generator Modal should be actively visible');
    console.log('  ✅ Invoice Generator Modal opened successfully');

    // Populate Workmanship Line Item
    console.log('  Populating Workmanship/Labor line items...');
    await desktopPage.evaluate(() => {
      const rows = document.querySelectorAll('#inv-tbody-workmanship tr');
      if (rows.length > 0) {
        const r0 = rows[0];
        r0.querySelector('.inv-item-desc').value = 'Distribution Board Replacement & Testing';
        r0.querySelector('.inv-item-qty').value = '2';
        const price = r0.querySelector('.inv-item-price');
        price.value = '35000';
        price.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await desktopPage.waitForTimeout(300);

    // Add Materials Line Item
    console.log('  Adding Materials/Parts line item...');
    await desktopPage.evaluate(() => {
      const addMatBtn = document.getElementById('btn-add-materials-row');
      if (addMatBtn) addMatBtn.click();
      const rows = document.querySelectorAll('#inv-tbody-materials tr');
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        lastRow.querySelector('.inv-item-desc').value = '63A 3-Phase Schneider Breaker';
        lastRow.querySelector('.inv-item-qty').value = '2';
        const price = lastRow.querySelector('.inv-item-price');
        price.value = '18000';
        price.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await desktopPage.waitForTimeout(300);

    // Set Discount
    console.log('  Applying ₦5,000 negotiated discount...');
    await desktopPage.evaluate(() => {
      const discInput = document.getElementById('inv-discount-amount');
      if (discInput) {
        discInput.value = '5000';
        discInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await desktopPage.waitForTimeout(300);

    // Verify Real-time Calculation:
    // Workmanship: 35,000 * 2 = 70,000
    // Materials: 18,000 * 2 = 36,000
    // Subtotal: 106,000
    // Discount: 5,000
    // Total: 101,000
    const calculatedTotals = await desktopPage.evaluate(() => {
      return {
        workmanship: document.getElementById('inv-workmanship-subtotal-disp')?.textContent?.trim(),
        materials: document.getElementById('inv-materials-subtotal-disp')?.textContent?.trim(),
        subtotal: document.getElementById('inv-gross-subtotal-disp')?.textContent?.trim(),
        grandTotal: document.getElementById('inv-grand-total-disp')?.textContent?.trim()
      };
    });
    console.log(`  Real-time Recalculated Totals: Workmanship: ${calculatedTotals.workmanship} | Materials: ${calculatedTotals.materials} | Subtotal: ${calculatedTotals.subtotal} | Grand Total: ${calculatedTotals.grandTotal}`);
    assert.ok(calculatedTotals.workmanship.includes('70,000'), 'Workmanship Subtotal must be ₦70,000');
    assert.ok(calculatedTotals.materials.includes('36,000'), 'Materials Subtotal must be ₦36,000');
    assert.ok(calculatedTotals.subtotal.includes('106,000'), 'Gross Subtotal must be ₦106,000');
    assert.ok(calculatedTotals.grandTotal.includes('101,000'), 'Grand Total must be ₦101,000');
    console.log('  ✅ Real-time Dual-Category integer financial recalculation confirmed');

    // Capture Desktop Screenshots
    await saveProof(desktopPage, 'phase_033_dashboard_invoice_desktop.png');
    await saveProof(desktopPage, 'phase_033_invoice_workmanship_materials.png');

    // Test WhatsApp formatting generator
    console.log('  Testing WhatsApp 1-tap breakdown formatting...');
    const waBreakdown = await desktopPage.evaluate(() => {
      if (typeof window.formatWhatsAppInvoiceBreakdown === 'function') {
        const inv = {
          invoice_number: 'INV-PF-QA77B901',
          invoice_type: 'quote',
          job_ref: 'PF-QA7701',
          items: {
            workmanship: [
              { description: 'Distribution Board Replacement & Testing', quantity: 2, unit_price_kobo: 3500000, amount_kobo: 7000000 }
            ],
            materials: [
              { description: '63A 3-Phase Schneider Breaker', quantity: 2, unit_price_kobo: 1800000, amount_kobo: 3600000 }
            ]
          },
          subtotal_kobo: 10600000,
          discount_kobo: 500000,
          total_kobo: 10100000,
          bank_details: {
            bank_name: 'GTBank',
            account_number: '0123456789',
            account_name: 'ADEYEMI DANIELS ENTERPRISES'
          },
          terms: '50% deposit, balance on completion.'
        };
        return window.formatWhatsAppInvoiceBreakdown(inv);
      }
      return null;
    });
    assert.ok(waBreakdown, 'WhatsApp breakdown text must be generated');
    assert.ok(waBreakdown.includes('PADIFIX SERVICE QUOTATION'), 'WhatsApp text contains header');
    assert.ok(waBreakdown.includes('Distribution Board Replacement'), 'WhatsApp text itemizes workmanship');
    assert.ok(waBreakdown.includes('63A 3-Phase Schneider Breaker'), 'WhatsApp text itemizes materials');
    assert.ok(waBreakdown.includes('GTBank'), 'WhatsApp text includes settlement bank');
    assert.ok(waBreakdown.includes('101,000'), 'WhatsApp text includes net total');
    console.log('  ✅ WhatsApp formatted breakdown verified');

    // Test Print Sheet Population
    console.log('  Testing Printable PDF Receipt formatting...');
    await desktopPage.evaluate(() => {
      if (typeof window.populatePrintableInvoice === 'function') {
        const inv = {
          invoice_number: 'INV-PF-QA77B901',
          invoice_type: 'quote',
          job_ref: 'PF-QA7701',
          items: {
            workmanship: [
              { description: 'Distribution Board Replacement & Testing', quantity: 2, unit_price_kobo: 3500000, amount_kobo: 7000000 }
            ],
            materials: [
              { description: '63A 3-Phase Schneider Breaker', quantity: 2, unit_price_kobo: 1800000, amount_kobo: 3600000 }
            ]
          },
          workmanship_subtotal_kobo: 7000000,
          materials_subtotal_kobo: 3600000,
          subtotal_kobo: 10600000,
          discount_kobo: 500000,
          total_kobo: 10100000,
          bank_details: {
            bank_name: 'GTBank',
            account_number: '0123456789',
            account_name: 'ADEYEMI DANIELS ENTERPRISES'
          }
        };
        const lead = {
          id: 'lead-cert-101',
          client_display_name: 'Engr. Babatunde Fash',
          locality: 'Lagos Island, Lagos',
          job_description: 'Full inverter system wiring'
        };
        window.populatePrintableInvoice(inv, lead);
      }
    });
    await desktopPage.waitForTimeout(300);

    // Check print sheet contents
    const printValues = await desktopPage.evaluate(() => {
      const sheet = document.getElementById('invoice-printable-sheet');
      return {
        customer: document.getElementById('print-customer-name')?.textContent,
        subtotal: document.getElementById('print-gross-subtotal')?.textContent,
        total: document.getElementById('print-grand-total')?.textContent,
        ref: document.getElementById('print-invoice-ref')?.textContent
      };
    });
    console.log(`  Print Sheet: Customer: ${printValues.customer} | Ref: ${printValues.ref} | Total: ${printValues.total}`);
    assert.ok(printValues.total.includes('101,000'), 'Print sheet grand total must be ₦101,000');
    console.log('  ✅ Printable PDF Receipt formatting verified');

    // Render print sheet visible temporarily to capture proof
    await desktopPage.evaluate(() => {
      const sheet = document.getElementById('invoice-printable-sheet');
      sheet.style.display = 'block';
      sheet.style.position = 'fixed';
      sheet.style.top = '20px';
      sheet.style.left = '20px';
      sheet.style.zIndex = '99999';
      sheet.style.background = '#ffffff';
      sheet.style.maxWidth = '750px';
      sheet.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
    });
    await desktopPage.waitForTimeout(300);
    await saveProof(desktopPage, 'phase_033_invoice_pdf.png');

    // Restore print sheet
    await desktopPage.evaluate(() => {
      const sheet = document.getElementById('invoice-printable-sheet');
      sheet.style.display = 'none';
    });

    await desktopContext.close();

    // -------------------------------------------------------------
    // 2. MOBILE VIEWPORT QA (390x844)
    // -------------------------------------------------------------
    console.log('\n--- 2. MOBILE BROWSER QA (390x844) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();

    // Seed same provider session
    await mobilePage.addInitScript(() => {
      const testProvider = {
        id: 8,
        email: 'ad.padifix@outlook.com',
        first_name: 'Adeyemi',
        last_name: 'Daniels',
        name: 'Adeyemi Daniels',
        category: 'Electrician',
        bank_name: 'GTBank',
        account_number: '0123456789',
        account_name: 'ADEYEMI DANIELS ENTERPRISES'
      };
      localStorage.setItem('lokator_current_provider', JSON.stringify(testProvider));
      localStorage.setItem('lokator_current_provider_id', '8');
      localStorage.setItem('lokator_auth_session', JSON.stringify({ user: { id: 8, email: 'ad.padifix@outlook.com' } }));
      localStorage.setItem('lokator_supabase_auth_session', JSON.stringify({ user: { id: 8, email: 'ad.padifix@outlook.com' } }));
    });

    await mobilePage.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await dismissSplash(mobilePage);
    await mobilePage.waitForTimeout(1200);

    // Open invoice generator modal
    await mobilePage.evaluate(() => {
      if (typeof window.openInvoiceGeneratorModal === 'function') {
        window.openInvoiceGeneratorModal('lead-cert-101');
      }
    });
    await mobilePage.waitForTimeout(600);

    // Check horizontal overflow
    const overflowReport = await mobilePage.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      const modal = document.querySelector('#invoice-generator-modal .modal-content');
      const overflowing = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 || el.scrollWidth > window.innerWidth + 1) {
          overflowing.push({
            tag: el.tagName,
            id: el.id,
            cls: el.className,
            scrollW: el.scrollWidth,
            rectRight: Math.round(r.right),
            winW: window.innerWidth
          });
        }
      });

      return {
        bodyScrollWidth: body.scrollWidth,
        windowWidth: window.innerWidth,
        bodyOverflow: body.scrollWidth > window.innerWidth,
        htmlOverflow: html.scrollWidth > window.innerWidth,
        modalOverflow: modal ? modal.scrollWidth > window.innerWidth + 2 : false,
        overflowing: overflowing.slice(0, 8)
      };
    });
    console.log('  Mobile Overflow Details:', JSON.stringify(overflowReport, null, 2));
    assert.strictEqual(overflowReport.modalOverflow, false, 'Invoice modal must have zero horizontal overflow');
    assert.strictEqual(overflowReport.htmlOverflow, false, 'HTML viewport must have zero horizontal overflow');

    // Capture Mobile Screenshot
    await saveProof(mobilePage, 'phase_033_dashboard_invoice_mobile.png');
    console.log('  ✅ Mobile (390x844) Viewport verified with zero horizontal overflow');

    await mobileContext.close();

    console.log('\n================================================================');
    console.log('ALL BROWSER QA TESTS PASSED CLEANLY (100% GREEN)');
    console.log('================================================================');

  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

runVisualQA().catch(err => {
  console.error('Browser QA Failed:', err);
  process.exit(1);
});

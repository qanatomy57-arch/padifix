/**
 * PADIFIX — TRANSACTIONAL EMAIL SERVICE (RESEND INTEGRATION)
 * lib/resend-email-service.js
 *
 * Implements Resend transactional email delivery for PadiFix subscription lifecycle.
 * Invariants:
 * - Server-side only: never leaks RESEND_API_KEY to browser or client.
 * - Branded, mobile-friendly responsive HTML templates.
 * - Non-blocking execution: email failures never abort database transactions.
 * - Supports graceful sandbox simulation when API key is unconfigured.
 */

// Strict server-only guard
if (typeof window !== 'undefined') {
  throw new Error('SECURITY VIOLATION: Resend transactional email service is server-only.');
}

const https = require('https');

// Graceful import of server-side Sentry observability
let captureServerException = null;
try {
  const sentryServer = require('./sentry-server');
  captureServerException = sentryServer.captureServerException;
} catch (e) {}

// Default fallback configuration
const DEFAULT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'PadiFix <notifications@padifix.ng>';
const APP_URL = process.env.APP_URL || 'https://padifix.vercel.app';

/**
 * Low-level HTTP client for api.resend.com/emails
 */
function sendResendRequest(payload, apiKey, options = {}) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(payload);
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(dataStr)
    };

    if (options && options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const reqOptions = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: headers,
      timeout: 10000
    };

    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, id: parsed.id, statusCode: res.statusCode });
          } else {
            resolve({
              success: false,
              statusCode: res.statusCode,
              error: parsed.message || 'Resend delivery error',
              details: parsed
            });
          }
        } catch (e) {
          resolve({ success: false, statusCode: res.statusCode, raw: body, error: 'Malformed JSON from Resend' });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Resend API request timed out'));
    });

    req.write(dataStr);
    req.end();
  });
}

/**
 * Base email layout wrapper with PadiFix visual identity
 */
function renderEmailLayout(title, contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; color: #1E293B; line-height: 1.6; }
    .email-container { max-width: 580px; margin: 24px auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; }
    .email-header { background: #00A859; padding: 24px; text-align: center; }
    .email-logo { color: #FFFFFF; font-size: 22px; font-weight: 800; text-decoration: none; letter-spacing: -0.5px; }
    .email-body { padding: 32px 28px; }
    .email-title { font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 16px 0; }
    .info-card { background: #F1F5F9; border-left: 4px solid #00A859; padding: 16px; border-radius: 6px; margin: 20px 0; font-size: 14px; }
    .alert-card { background: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 6px; margin: 20px 0; font-size: 14px; color: #991B1B; }
    .warning-card { background: #FFFBEB; border-left: 4px solid #F59E0B; padding: 16px; border-radius: 6px; margin: 20px 0; font-size: 14px; color: #92400E; }
    .cta-btn { display: inline-block; background: #00A859; color: #FFFFFF !important; padding: 12px 24px; border-radius: 6px; font-weight: 700; text-decoration: none; margin: 20px 0; text-align: center; font-size: 14px; }
    .email-footer { background: #F8FAFC; padding: 20px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #E2E8F0; }
    .stat-row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #E2E8F0; padding-bottom: 6px; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <div class="email-logo">PadiFix</div>
      <div style="color: #E2E8F0; font-size: 12px; margin-top: 4px;">Find Skills. Get Things Done.</div>
    </div>
    <div class="email-body">
      ${contentHtml}
    </div>
    <div class="email-footer">
      <p style="margin: 0 0 6px 0;">PadiFix Nigeria — Local Services Connection Marketplace</p>
      <p style="margin: 0 0 6px 0;">Customers pay providers directly. 0% commission on artisan jobs.</p>
      <p style="margin: 0; font-size: 11px; color: #94A3B8;">Sent to your registered provider email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Dispatch transactional email
 */
async function sendEmail({ to, subject, html, emailType, providerId = null, forceLive = false, idempotencyKey = null }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;
  const isForceLive = forceLive || process.env.RESEND_FORCE_LIVE === 'true';

  if (!to) {
    console.error(`[ResendEmailService] Missing recipient email for ${emailType}`);
    return { success: false, error: 'Missing recipient email' };
  }

  // If RESEND_API_KEY is not configured or in test mode (unless forceLive is set), safely simulate delivery
  if (!apiKey || apiKey.startsWith('re_mock_') || (process.env.NODE_ENV === 'test' && !isForceLive)) {
    const simulatedId = `sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(`[ResendEmailService:SANDBOX] Simulated delivery of '${emailType}' to ${to} (Subject: ${subject})`);
    return {
      success: true,
      id: simulatedId,
      mode: 'sandbox_simulated',
      emailType,
      recipient: to,
      subject,
      idempotencyKey
    };
  }

  try {
    const requestFn = (ResendEmailService && typeof ResendEmailService.sendResendRequest === 'function')
      ? ResendEmailService.sendResendRequest
      : sendResendRequest;

    let res = await requestFn({
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    }, apiKey, { idempotencyKey });

    // If domain verification error occurred and fromEmail is not onboarding@resend.dev
    const isDomainUnverified = !res.success && (
      (res.error && res.error.toLowerCase().includes('not verified')) ||
      (res.details && res.details.message && res.details.message.toLowerCase().includes('not verified'))
    );

    const isProductionRuntime = process.env.NODE_ENV === 'production' ||
                                process.env.VERCEL_ENV === 'production';

    if (isDomainUnverified && !fromEmail.includes('onboarding@resend.dev')) {
      if (isProductionRuntime) {
        console.warn(`[ResendEmailService:EXTERNAL_GATE] padifix.ng custom domain is not yet DNS verified on resend.com. Delivery of '${emailType}' halted. (Zero silent fallback in production)`);
        if (captureServerException) {
          captureServerException(new Error(`Resend external gate: padifix.ng custom domain unverified for email '${emailType}'`), {
            context: 'resend_unverified_domain_gate',
            emailType,
            fromDomain: 'padifix.ng'
          }).catch(() => {});
        }
        return {
          success: false,
          externalGate: 'DOMAIN_UNVERIFIED',
          error: 'The padifix.ng domain is not verified on resend.com. External DNS verification required.',
          unverifiedDomain: true,
          emailType,
          recipient: to
        };
      }

      // In controlled staging/test environments, permit explicit fallback
      const fallbackFrom = 'PadiFix <onboarding@resend.dev>';
      console.warn(`[ResendEmailService:NOTICE:STAGING] Custom domain not yet verified. Controlled staging fallback to ${fallbackFrom} for ${emailType}`);
      const fallbackRes = await sendResendRequest({
        from: fallbackFrom,
        to: Array.isArray(to) ? to : [to],
        subject,
        html
      }, apiKey, { idempotencyKey });

      if (fallbackRes.success) {
        console.log(`[ResendEmailService:LIVE:FALLBACK] Sent '${emailType}' to ${to} (Resend ID: ${fallbackRes.id})`);
        return {
          success: true,
          id: fallbackRes.id,
          mode: 'live_fallback',
          emailType,
          recipient: to,
          customDomainPending: true,
          details: 'padifix.ng awaiting DNS verification; sent via onboarding@resend.dev'
        };
      }
    }

    if (res.success) {
      console.log(`[ResendEmailService:LIVE] Sent '${emailType}' to ${to} (Resend ID: ${res.id})`);
      return { success: true, id: res.id, mode: 'live', emailType, recipient: to };
    } else {
      console.error(`[ResendEmailService:ERROR] Failed to send '${emailType}' to ${to}:`, res.error);
      return { success: false, error: res.error, details: res.details };
    }
  } catch (err) {
    console.error(`[ResendEmailService:EXCEPTION] Error sending '${emailType}' to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// CANONICAL TRANSACTIONAL EMAIL METHODS (PHASE 011)
// ============================================================================

const ResendEmailService = {
  /**
   * 1. Subscription Activated Email
   */
  async sendSubscriptionActivatedEmail({ to, providerName = 'Artisan', plan = 'Pro', price = '₦11,000/month', nextRenewalDate = 'Next Month', contactAllowance = 100, forceLive = false, idempotencyKey = null }) {
    const title = `Welcome to PadiFix ${plan}!`;
    const subject = `Welcome to PadiFix ${plan} — Your subscription is active`;
    const html = renderEmailLayout(title, `
      <h2 class="email-title">Welcome to PadiFix ${plan}!</h2>
      <p>Hello ${providerName},</p>
      <p>Your subscription to <strong>PadiFix ${plan}</strong> has been successfully activated. You are now equipped with elevated visibility and customer inquiry allowances.</p>
      
      <div class="info-card">
        <div class="stat-row"><span>Plan Tier:</span> <strong>${plan}</strong></div>
        <div class="stat-row"><span>Subscription Rate:</span> <strong>${price}</strong></div>
        <div class="stat-row"><span>Monthly Contact Allowance:</span> <strong>${contactAllowance} customer contacts/mo</strong></div>
        <div class="stat-row" style="border-bottom: none;"><span>Next Renewal Date:</span> <strong>${nextRenewalDate}</strong></div>
      </div>

      <p>Remember: Customers contact you directly via WhatsApp or phone, you negotiate your rates, and receive 100% of your earnings directly. PadiFix takes 0% commission.</p>

      <a href="${APP_URL}/dashboard.html" class="cta-btn">Go to Provider Dashboard</a>
    `);

    return sendEmail({ to, subject, html, emailType: 'subscription_activated', forceLive, idempotencyKey });
  },

  /**
   * 2. Payment Successful Email (Renewal or Initial)
   */
  async sendPaymentSuccessfulEmail({ to, providerName = 'Artisan', amount = '₦11,000', plan = 'Pro', reference = '', nextRenewal = 'Next Month', isRenewal = false, forceLive = false, idempotencyKey = null }) {
    const title = isRenewal ? `Your PadiFix ${plan} plan has renewed` : `Payment Received for PadiFix ${plan}`;
    const subject = isRenewal ? `PadiFix Receipt: Monthly renewal successful for ${plan}` : `PadiFix Receipt: Payment confirmed for ${plan}`;
    const effectiveIdempotencyKey = idempotencyKey || (reference ? `receipt_${reference}` : null);
    const html = renderEmailLayout(title, `
      <h2 class="email-title">${title}</h2>
      <p>Hello ${providerName},</p>
      <p>We have successfully processed your monthly subscription payment for <strong>PadiFix ${plan}</strong>.</p>
      
      <div class="info-card">
        <div class="stat-row"><span>Amount Paid:</span> <strong>${amount}</strong></div>
        <div class="stat-row"><span>Plan:</span> <strong>${plan}</strong></div>
        <div class="stat-row"><span>Transaction Reference:</span> <code>${reference}</code></div>
        <div class="stat-row" style="border-bottom: none;"><span>Next Billing Date:</span> <strong>${nextRenewal}</strong></div>
      </div>

      <p>Your monthly contact allowance has been refreshed. Visit your dashboard to view your latest customer inquiries.</p>

      <a href="${APP_URL}/dashboard.html" class="cta-btn">View Billing & Inquiries</a>
    `);

    return sendEmail({ to, subject, html, emailType: 'payment_successful', forceLive, idempotencyKey: effectiveIdempotencyKey });
  },

  /**
   * 3. Payment Failed Email
   */
  async sendPaymentFailedEmail({ to, providerName = 'Artisan', plan = 'Pro', reason = 'Card charge declined', graceDaysRemaining = 3, billingUrl = `${APP_URL}/dashboard.html`, forceLive = false }) {
    const title = `Action Required: Payment failed for PadiFix ${plan}`;
    const subject = `Urgent: Payment failed for your PadiFix ${plan} subscription`;
    const html = renderEmailLayout(title, `
      <h2 class="email-title" style="color: #DC2626;">Payment Failed for PadiFix ${plan}</h2>
      <p>Hello ${providerName},</p>
      <p>We were unable to process your recurring monthly payment for your <strong>${plan}</strong> subscription. Reason: <em>${reason}</em>.</p>
      
      <div class="alert-card">
        <strong>Grace Period Active:</strong> You have <strong>${graceDaysRemaining} days</strong> to update your payment method before your plan reverts to the Free starter tier.
      </div>

      <p>During this grace period, your profile remains fully visible and searchable on PadiFix. Please visit your billing settings to resolve your payment method.</p>

      <a href="${billingUrl}" class="cta-btn" style="background: #DC2626;">Update Payment Method</a>
    `);

    return sendEmail({ to, subject, html, emailType: 'payment_failed', forceLive });
  },

  /**
   * 4. Grace Period Warning Email
   */
  async sendGracePeriodWarningEmail({ to, providerName = 'Artisan', plan = 'Pro', daysRemaining = 1, billingUrl = `${APP_URL}/dashboard.html`, forceLive = false }) {
    const title = `Final Notice: ${daysRemaining} day left in your grace period`;
    const subject = `Final Notice: Your PadiFix ${plan} subscription expires in ${daysRemaining} day`;
    const html = renderEmailLayout(title, `
      <h2 class="email-title" style="color: #D97706;">Grace Period Expiring Soon</h2>
      <p>Hello ${providerName},</p>
      <p>This is a reminder that you have <strong>${daysRemaining} day remaining</strong> in your subscription grace period for <strong>PadiFix ${plan}</strong>.</p>
      
      <div class="warning-card">
        If payment is not settled within ${daysRemaining} day, your account will automatically return to the Free Starter tier (5 contacts/month). Your profile will remain online.
      </div>

      <a href="${billingUrl}" class="cta-btn" style="background: #D97706;">Settle Payment Now</a>
    `);

    return sendEmail({ to, subject, html, emailType: 'grace_period_warning', forceLive });
  },

  /**
   * 5. Subscription Cancelled Email
   */
  async sendSubscriptionCancelledEmail({ to, providerName = 'Artisan', plan = 'Pro', effectiveUntil = 'End of billing period', forceLive = false }) {
    const title = `PadiFix ${plan} Auto-Renewal Cancelled`;
    const subject = `Your PadiFix ${plan} subscription has been cancelled`;
    const html = renderEmailLayout(title, `
      <h2 class="email-title">Auto-Renewal Cancelled</h2>
      <p>Hello ${providerName},</p>
      <p>You have cancelled the automatic renewal for your <strong>PadiFix ${plan}</strong> subscription.</p>
      
      <div class="info-card">
        <strong>Entitlement Active Until:</strong> ${effectiveUntil}<br>
        After this date, your profile will revert to the Free Starter tier (5 customer contacts/month). You will not be charged again.
      </div>

      <p>You can resume your subscription at any time directly from your dashboard.</p>

      <a href="${APP_URL}/dashboard.html" class="cta-btn">Manage Subscription</a>
    `);

    return sendEmail({ to, subject, html, emailType: 'subscription_cancelled', forceLive });
  },

  /**
   * 6. Subscription Expired Email
   */
  async sendSubscriptionExpiredEmail({ to, providerName = 'Artisan', plan = 'Pro', forceLive = false }) {
    const title = `Your PadiFix ${plan} Plan has Expired`;
    const subject = `Your PadiFix ${plan} plan has expired — You are on Free Starter`;
    const html = renderEmailLayout(title, `
      <h2 class="email-title">Subscription Expired</h2>
      <p>Hello ${providerName},</p>
      <p>Your subscription to <strong>PadiFix ${plan}</strong> has concluded. Your account is now on the <strong>Free Starter</strong> tier.</p>
      
      <div class="info-card">
        <strong>Free Tier Details:</strong>
        <ul style="margin: 8px 0 0 0; padding-left: 20px;">
          <li>5 customer contacts per month</li>
          <li>Standard search visibility</li>
          <li>Full public profile and customer reviews maintained</li>
        </ul>
      </div>

      <p>Ready to unlock 100 customer contacts with search prominence? You can re-activate Pro at any time.</p>

      <a href="${APP_URL}/dashboard.html" class="cta-btn">Upgrade Plan</a>
    `);

    return sendEmail({ to, subject, html, emailType: 'subscription_expired', forceLive });
  },

  /**
   * 7. Plan Changed Email (Upgrade or Downgrade)
   */
  async sendPlanChangedEmail({ to, providerName = 'Artisan', oldPlan = 'Basic', newPlan = 'Pro', effectiveDate = 'Immediately', newPrice = '₦11,000/month', newAllowance = 100, forceLive = false, idempotencyKey = null }) {
    const title = `Plan Changed: You are now on PadiFix ${newPlan}`;
    const subject = `Your PadiFix plan has changed to ${newPlan}`;
    const html = renderEmailLayout(title, `
      <h2 class="email-title">Plan Updated Successfully</h2>
      <p>Hello ${providerName},</p>
      <p>Your PadiFix subscription plan has been transitioned from <strong>${oldPlan}</strong> to <strong>${newPlan}</strong>.</p>
      
      <div class="info-card">
        <div class="stat-row"><span>New Plan:</span> <strong>${newPlan}</strong></div>
        <div class="stat-row"><span>New Monthly Price:</span> <strong>${newPrice}</strong></div>
        <div class="stat-row"><span>New Contact Allowance:</span> <strong>${newAllowance} contacts/mo</strong></div>
        <div class="stat-row" style="border-bottom: none;"><span>Effective Date:</span> <strong>${effectiveDate}</strong></div>
      </div>

      <a href="${APP_URL}/dashboard.html" class="cta-btn">View New Entitlements</a>
    `);

    return sendEmail({ to, subject, html, emailType: 'plan_changed', forceLive, idempotencyKey });
  },

  /**
   * 8. Verification Approved Email
   */
  async sendVerificationApprovedEmail({ to, providerName = 'Artisan', badgeType = 'Verified Pro', forceLive = false, idempotencyKey = null }) {
    const title = `Trust Credential Verified: Congratulations on earning your ${badgeType} Badge!`;
    const subject = `Congratulations! Your PadiFix ${badgeType} badge is now active`;
    const html = renderEmailLayout(title, `
      <h2 class="email-title" style="color: #00A859;">✓ Verification Approved!</h2>
      <p>Hello ${providerName},</p>
      <p>Great news! Your identity and credential verification request has been officially approved by the PadiFix Trust & Safety Compliance team.</p>
      
      <div class="info-card">
        <div class="stat-row"><span>Status:</span> <strong style="color: #00A859;">APPROVED ✓</strong></div>
        <div class="stat-row"><span>Badge Earned:</span> <strong>${badgeType}</strong></div>
        <div class="stat-row"><span>Trust Assurance:</span> <strong>Active & Search Promoted</strong></div>
        <div class="stat-row" style="border-bottom: none;"><span>Search Boost:</span> <strong>Elevated Priority</strong></div>
      </div>

      <p>Your official Verified Badge is now visible across all customer searches, significantly increasing booking inquiries and customer trust.</p>

      <a href="${APP_URL}/dashboard.html" class="cta-btn">View Verified Profile</a>
    `);

    return sendEmail({ to, subject, html, emailType: 'verification_approved', forceLive, idempotencyKey });
  },

  /**
   * 9. Verification Rejected Email
   */
  async sendVerificationRejectedEmail({ to, providerName = 'Artisan', reason = '', docType = 'Identity Document', forceLive = false, idempotencyKey = null }) {
    const title = `Update on your PadiFix Verification Request`;
    const subject = `Action Required: PadiFix Verification Document Review`;
    const feedbackReason = reason || 'The submitted document could not be matched against official identity registries or did not meet image clarity standards.';
    const html = renderEmailLayout(title, `
      <h2 class="email-title" style="color: #DC2626;">Verification Review Update</h2>
      <p>Hello ${providerName},</p>
      <p>Our Trust & Safety compliance team reviewed your submitted <strong>${docType}</strong>. At this time, we were unable to complete verification for the following reason:</p>
      
      <div class="warning-card">
        <strong style="display: block; margin-bottom: 6px;">Compliance Officer Feedback:</strong>
        <p style="margin: 0; font-size: 13.5px;">${feedbackReason}</p>
      </div>

      <div class="info-card" style="border-left-color: #0284C7;">
        <p style="margin: 0; font-size: 13px;"><strong>Your subscription is safe:</strong> Your active subscription plan, contact allowance, and profile visibility are unaffected. You may correct and resubmit your documentation anytime.</p>
      </div>

      <a href="${APP_URL}/dashboard.html" class="cta-btn" style="background: #0284C7;">Resubmit Verification Document</a>
    `);

    return sendEmail({ to, subject, html, emailType: 'verification_rejected', forceLive, idempotencyKey });
  },

  /**
   * Safe status check for diagnostic & audit purposes
   */
  getStatus() {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;
    return {
      configured: Boolean(apiKey && apiKey.length > 5),
      fromEmail,
      isProductionSender: fromEmail.includes('padifix.ng'),
      authType: 'BEARER_API_KEY'
    };
  },

  sendResendRequest,
  renderEmailLayout,
  sendEmail
};

module.exports = ResendEmailService;

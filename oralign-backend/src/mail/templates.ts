/**
 * Email templates — kept in one file so the visual language stays
 * consistent across every transactional message we send.
 *
 * Design goals:
 *   - White background everywhere (renders as expected in dark-mode clients).
 *   - Logo at top-left (matches the dashboard's logo treatment).
 *   - Single 600 px content column that collapses gracefully to phone width.
 *   - Inline styles only — Gmail / Outlook routinely strip <style> blocks.
 *   - Buttons rendered as <a> with table padding so they look right in
 *     Outlook desktop, which doesn't honour `display:inline-block` padding
 *     on links.
 */

const APP_NAME = 'Oralign';
const BRAND_COLOR = '#0f172a';
const ACCENT_COLOR = '#0ea5e9';
const TEXT_COLOR = '#0f172a';
const MUTED_COLOR = '#64748b';
const BORDER_COLOR = '#e2e8f0';
const SUBTLE_BG = '#f8fafc';

function logoUrl(): string {
  // Public URL the frontend serves. Set MAIL_LOGO_URL in env to override
  // (useful when the frontend lives on a different host than the API).
  // Falls back to the dashboard's PNG.
  const base = (
    process.env.MAIL_LOGO_URL ??
    process.env.FRONTEND_URL ??
    ''
  ).replace(/\/$/, '');
  return base
    ? `${base}/ORALIGN%20BLACK.png`
    : 'https://oralign.com.tn/ORALIGN%20BLACK.png';
}

function shell({
  title,
  preheader,
  body,
}: {
  title: string;
  /** Hidden 1-line summary that some mail clients show next to the subject. */
  preheader: string;
  body: string;
}): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:${TEXT_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <!-- Preheader (hidden) -->
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
      ${preheader}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER_COLOR};border-radius:16px;overflow:hidden;">
            <!-- Header: logo on the left -->
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid ${BORDER_COLOR};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="left">
                      <img src="${logoUrl()}" alt="${APP_NAME}" width="120" height="auto"
                           style="display:block;max-width:120px;height:auto;border:0;outline:none;text-decoration:none;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                ${body}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px;background:${SUBTLE_BG};border-top:1px solid ${BORDER_COLOR};">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED_COLOR};text-align:center;">
                  &copy; ${year} ${APP_NAME}. All rights reserved.
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:16px 0 0;font-size:11px;color:${MUTED_COLOR};text-align:center;">
            If you didn't request this email you can safely ignore it.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ─── Reusable atoms ─────────────────────────────────────────────────────────

function greeting(fullName: string): string {
  return `<p style="margin:0 0 12px;font-size:18px;font-weight:600;color:${TEXT_COLOR};">
    Hi ${fullName},
  </p>`;
}

function lead(text: string): string {
  return `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${MUTED_COLOR};">
    ${text}
  </p>`;
}

function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="border-top:1px solid ${BORDER_COLOR};line-height:1px;font-size:1px;">&nbsp;</td></tr>
  </table>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 auto 24px;">
    <tr>
      <td align="center" bgcolor="${BRAND_COLOR}"
          style="border-radius:10px;background:${BRAND_COLOR};">
        <a href="${href}"
           style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;
                  color:#ffffff;text-decoration:none;border-radius:10px;
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

function otpBlock(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 24px;">
    <tr>
      <td align="center"
          style="background:${SUBTLE_BG};border:1px solid ${BORDER_COLOR};border-radius:12px;padding:24px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.4px;
                  text-transform:uppercase;color:${ACCENT_COLOR};">
          Verification code
        </p>
        <p style="margin:0;font-size:36px;font-weight:800;letter-spacing:10px;
                  color:${TEXT_COLOR};font-variant-numeric:tabular-nums;">
          ${escape(code)}
        </p>
      </td>
    </tr>
  </table>`;
}

function urlFallback(url: string): string {
  return `<p style="margin:16px 0 0;font-size:12px;color:${MUTED_COLOR};text-align:center;">
    Button not working? Paste this link into your browser:<br/>
    <a href="${url}" style="color:${ACCENT_COLOR};word-break:break-all;">${url}</a>
  </p>`;
}

function escape(input: string): string {
  return String(input).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

// ─── Public renderers ───────────────────────────────────────────────────────

export function renderVerificationEmail(args: {
  fullName: string;
  code: string;
}): { html: string; subject: string } {
  return {
    subject: `${args.code} is your ${APP_NAME} verification code`,
    html: shell({
      title: `Verify your ${APP_NAME} account`,
      preheader: `Your verification code is ${args.code}. Expires in 15 minutes.`,
      body: `
        ${greeting(escape(args.fullName))}
        ${lead(
          `Use the code below to verify your email address. ` +
            `It expires in <strong>15 minutes</strong>.`,
        )}
        ${otpBlock(args.code)}
        <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED_COLOR};text-align:center;">
          Once verified you'll be guided through completing your profile and
          clinic details. Final activation requires admin review.
        </p>
      `,
    }),
  };
}

export function renderPasswordResetEmail(args: {
  fullName: string;
  resetUrl: string;
}): { html: string; subject: string } {
  return {
    subject: `Reset your ${APP_NAME} password`,
    html: shell({
      title: `Reset your ${APP_NAME} password`,
      preheader: `Reset your ${APP_NAME} password. Link expires in 1 hour.`,
      body: `
        ${greeting(escape(args.fullName))}
        ${lead(
          `We received a request to reset your ${APP_NAME} password. ` +
            `Click the button below to choose a new password. This link ` +
            `expires in <strong>1 hour</strong>.`,
        )}
        ${button(args.resetUrl, 'Reset password')}
        ${divider()}
        ${urlFallback(args.resetUrl)}
        <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:${MUTED_COLOR};">
          Didn't request a reset? You can safely ignore this email — your
          password won't change unless you click the link above.
        </p>
      `,
    }),
  };
}

export function renderApprovalGrantedEmail(args: {
  fullName: string;
  dashboardUrl: string;
}): { html: string; subject: string } {
  return {
    subject: `Your ${APP_NAME} account has been approved`,
    html: shell({
      title: `${APP_NAME} account approved`,
      preheader: `Welcome to ${APP_NAME}. Your account is now active.`,
      body: `
        ${greeting(escape(args.fullName))}
        ${lead(
          `Your ${APP_NAME} account has been approved. ` +
            `You can now sign in and start managing your clinic.`,
        )}
        ${button(args.dashboardUrl, 'Open dashboard')}
      `,
    }),
  };
}

// ─── Order-lifecycle helpers ────────────────────────────────────────────────

/**
 * Small two-column metadata table used in the order-lifecycle emails to
 * display the order code, patient, doctor, status, etc. Inline styles so
 * Gmail / Outlook render it consistently.
 */
function metaTable(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};
                   font-size:12px;font-weight:600;letter-spacing:0.4px;
                   text-transform:uppercase;color:${MUTED_COLOR};width:40%;">
          ${escape(r.label)}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};
                   font-size:14px;color:${TEXT_COLOR};">
          ${escape(r.value)}
        </td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 24px;background:${SUBTLE_BG};border:1px solid ${BORDER_COLOR};border-radius:12px;overflow:hidden;">
    ${body}
  </table>`;
}

function decisionBadge(decision: 'approved' | 'rejected'): string {
  const isApproved = decision === 'approved';
  const bg = isApproved ? '#dcfce7' : '#fee2e2';
  const fg = isApproved ? '#166534' : '#991b1b';
  const label = isApproved ? 'Approved' : 'Rejected';
  return `<span style="display:inline-block;padding:4px 12px;font-size:12px;
                       font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
                       border-radius:999px;background:${bg};color:${fg};">
    ${label}
  </span>`;
}

// ─── Order-lifecycle renderers ──────────────────────────────────────────────

/**
 * Sent to the doctor when they submit a new order. Confirms the order
 * was received and points them at the dashboard so they can track it.
 */
export function renderNewOrderForDoctorEmail(args: {
  doctorName: string;
  orderCode: string;
  patientName: string;
  dashboardUrl: string;
}): { html: string; subject: string } {
  return {
    subject: `Order ${args.orderCode} submitted — ${APP_NAME}`,
    html: shell({
      title: `Order ${args.orderCode} received`,
      preheader: `We've received your order for ${args.patientName}. Our team is on it.`,
      body: `
        ${greeting(escape(args.doctorName))}
        ${lead(
          `Thanks — your order has been submitted to our team. ` +
            `You'll get an email as soon as the treatment plan is ready ` +
            `for your review.`,
        )}
        ${metaTable([
          { label: 'Order', value: args.orderCode },
          { label: 'Patient', value: args.patientName },
          { label: 'Status', value: 'Submitted — under review' },
        ])}
        ${button(args.dashboardUrl, 'Open order')}
      `,
    }),
  };
}

/**
 * Sent to each admin / super_admin when a doctor submits a new order so
 * they know there's something fresh to plan.
 */
export function renderNewOrderForAdminEmail(args: {
  adminName: string;
  orderCode: string;
  doctorName: string;
  patientName: string;
  dashboardUrl: string;
}): { html: string; subject: string } {
  return {
    subject: `New order ${args.orderCode} from ${args.doctorName}`,
    html: shell({
      title: `New order ${args.orderCode}`,
      preheader: `${args.doctorName} submitted a new order for ${args.patientName}.`,
      body: `
        ${greeting(escape(args.adminName))}
        ${lead(
          `A new order has just been submitted and is waiting for ` +
            `treatment planning.`,
        )}
        ${metaTable([
          { label: 'Order', value: args.orderCode },
          { label: 'Doctor', value: args.doctorName },
          { label: 'Patient', value: args.patientName },
          { label: 'Status', value: 'Submitted — needs planner assignment' },
        ])}
        ${button(args.dashboardUrl, 'Review order')}
      `,
    }),
  };
}

/**
 * Sent to the doctor when admin / designer marks the treatment plan as
 * READY for the doctor's review.
 */
export function renderTreatmentReadyForDoctorEmail(args: {
  doctorName: string;
  orderCode: string;
  planName: string;
  dashboardUrl: string;
}): { html: string; subject: string } {
  return {
    subject: `${args.planName} is ready for review — ${args.orderCode}`,
    html: shell({
      title: `Treatment plan ready`,
      preheader: `${args.planName} is ready for your review.`,
      body: `
        ${greeting(escape(args.doctorName))}
        ${lead(
          `The treatment plan for order <strong>${escape(
            args.orderCode,
          )}</strong> has been prepared and is ready for your review. ` +
            `You can approve it to move on to quotation, or request a ` +
            `revision if anything needs to change.`,
        )}
        ${metaTable([
          { label: 'Order', value: args.orderCode },
          { label: 'Plan', value: args.planName },
          { label: 'Status', value: 'Ready for your review' },
        ])}
        ${button(args.dashboardUrl, 'Review treatment plan')}
      `,
    }),
  };
}

/**
 * Sent to each admin when the doctor approves or rejects a treatment
 * plan. One template covers both outcomes via the `decision` flag.
 */
export function renderTreatmentDecisionForAdminEmail(args: {
  adminName: string;
  orderCode: string;
  doctorName: string;
  planName: string;
  decision: 'approved' | 'rejected';
  reason?: string;
  dashboardUrl: string;
}): { html: string; subject: string } {
  const isApproved = args.decision === 'approved';
  const subject = isApproved
    ? `${args.doctorName} approved ${args.planName} (${args.orderCode})`
    : `${args.doctorName} requested a revision on ${args.planName} (${args.orderCode})`;
  const leadText = isApproved
    ? `<strong>${escape(args.doctorName)}</strong> approved the treatment plan. The order has moved to fabrication.`
    : `<strong>${escape(args.doctorName)}</strong> requested a revision on the treatment plan. The order is back in planning.`;
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Order', value: args.orderCode },
    { label: 'Plan', value: args.planName },
    { label: 'Doctor', value: args.doctorName },
  ];
  if (args.reason && args.reason.trim()) {
    rows.push({ label: 'Reason', value: args.reason.trim() });
  }
  return {
    subject,
    html: shell({
      title: subject,
      preheader: isApproved
        ? `${args.doctorName} approved ${args.planName}.`
        : `${args.doctorName} rejected ${args.planName}.`,
      body: `
        ${greeting(escape(args.adminName))}
        <p style="margin:0 0 16px;">${decisionBadge(args.decision)}</p>
        ${lead(leadText)}
        ${metaTable(rows)}
        ${button(args.dashboardUrl, 'Open order')}
      `,
    }),
  };
}

/**
 * Sent to the doctor when admin sends a quotation. Includes the total
 * for at-a-glance approval/refusal.
 */
export function renderQuoteSentForDoctorEmail(args: {
  doctorName: string;
  orderCode: string;
  quotationNumber: string;
  totalTtc: number;
  currency: string;
  dashboardUrl: string;
}): { html: string; subject: string } {
  const formattedTotal = formatMoney(args.totalTtc, args.currency);
  return {
    subject: `Quotation ${args.quotationNumber} is ready — ${args.orderCode}`,
    html: shell({
      title: `Quotation ready`,
      preheader: `Your quotation for order ${args.orderCode} is ready: ${formattedTotal}.`,
      body: `
        ${greeting(escape(args.doctorName))}
        ${lead(
          `A quotation for your order <strong>${escape(
            args.orderCode,
          )}</strong> is ready for your review. Approve it to start ` +
            `fabrication or reject it to stop the order.`,
        )}
        ${metaTable([
          { label: 'Order', value: args.orderCode },
          { label: 'Quotation', value: args.quotationNumber },
          { label: 'Total (TTC)', value: formattedTotal },
        ])}
        ${button(args.dashboardUrl, 'Review quotation')}
      `,
    }),
  };
}

/**
 * Sent to each admin when the doctor approves or rejects a quotation.
 * One template covers both outcomes.
 */
export function renderQuoteDecisionForAdminEmail(args: {
  adminName: string;
  orderCode: string;
  doctorName: string;
  quotationNumber: string;
  decision: 'approved' | 'rejected';
  reason?: string;
  dashboardUrl: string;
}): { html: string; subject: string } {
  const isApproved = args.decision === 'approved';
  const subject = isApproved
    ? `${args.doctorName} approved quotation ${args.quotationNumber} (${args.orderCode})`
    : `${args.doctorName} rejected quotation ${args.quotationNumber} (${args.orderCode})`;
  const leadText = isApproved
    ? `<strong>${escape(args.doctorName)}</strong> approved the quotation. The order has moved to fabrication.`
    : `<strong>${escape(args.doctorName)}</strong> rejected the quotation. The order has been canceled.`;
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Order', value: args.orderCode },
    { label: 'Quotation', value: args.quotationNumber },
    { label: 'Doctor', value: args.doctorName },
  ];
  if (args.reason && args.reason.trim()) {
    rows.push({ label: 'Reason', value: args.reason.trim() });
  }
  return {
    subject,
    html: shell({
      title: subject,
      preheader: isApproved
        ? `${args.doctorName} approved quotation ${args.quotationNumber}.`
        : `${args.doctorName} rejected quotation ${args.quotationNumber}.`,
      body: `
        ${greeting(escape(args.adminName))}
        <p style="margin:0 0 16px;">${decisionBadge(args.decision)}</p>
        ${lead(leadText)}
        ${metaTable(rows)}
        ${button(args.dashboardUrl, 'Open order')}
      `,
    }),
  };
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatMoney(amount: number, currency: string): string {
  // Intl works server-side in Node — we let it pick the locale, then
  // append the ISO code (e.g. "120,00 TND") for clarity in mail clients
  // that don't render the currency symbol consistently.
  try {
    const formatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    }).format(Number.isFinite(amount) ? amount : 0);
    return `${formatted} ${currency}`;
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

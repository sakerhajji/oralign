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
 *
 * i18n:
 *   - Every renderer takes a `lang` ('en' | 'fr') as its last parameter and
 *     resolves the human-visible copy from a small per-template TEXTS
 *     object. The HTML skeleton is built once per template — only the text
 *     nodes, subjects, button labels and footers differ between languages.
 */

import { Lang } from '../common/i18n/lang';

const APP_NAME = 'Oralign';
// Strict black-and-white palette. Everything renders the same on a
// laser printer, on a dark-mode client, and inside Outlook's quirky
// inline CSS engine. Past revisions used slate / sky-blue / red / green
// accents — they shipped well on screen but read as gimmicky on the
// brand and inconsistent with the PDF quotation aesthetic. One source
// of truth here keeps the visual language uniform across every channel.
const TEXT_COLOR = '#000000';
const BRAND_COLOR = '#000000';      // button background + buttons
const ACCENT_COLOR = '#000000';     // eyebrows, link colour
const MUTED_COLOR = '#555555';      // secondary text
const BORDER_COLOR = '#000000';     // outer card + dividers
const SOFT_BORDER = '#cccccc';      // table inner rows
const SUBTLE_BG = '#f5f5f5';        // footer + metadata block fill

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

const SHELL_TEXTS: Record<Lang, { rights: string; ignore: string }> = {
  en: {
    rights: `All rights reserved.`,
    ignore: `If you didn't request this email you can safely ignore it.`,
  },
  fr: {
    rights: `Tous droits réservés.`,
    ignore: `Si vous n'êtes pas à l'origine de cet e-mail, vous pouvez l'ignorer en toute sécurité.`,
  },
};

function shell({
  title,
  preheader,
  body,
  lang,
}: {
  title: string;
  /** Hidden 1-line summary that some mail clients show next to the subject. */
  preheader: string;
  body: string;
  lang: Lang;
}): string {
  const year = new Date().getFullYear();
  const t = SHELL_TEXTS[lang];
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
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
                 style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER_COLOR};overflow:hidden;">
            <!-- Header: logo centered. Reads as a letterhead instead of
                 a dashboard chrome strip — pairs with the formal B&W
                 invoice aesthetic the PDF quotation also uses. -->
            <tr>
              <td style="padding:32px 32px 28px;border-bottom:1px solid ${BORDER_COLOR};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center">
                      <img src="${logoUrl()}" alt="${APP_NAME}" width="140" height="auto"
                           style="display:block;margin:0 auto;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;" />
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
                  &copy; ${year} ${APP_NAME}. ${t.rights}
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:16px 0 0;font-size:11px;color:${MUTED_COLOR};text-align:center;">
            ${t.ignore}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ─── Reusable atoms ─────────────────────────────────────────────────────────

function greeting(fullName: string, lang: Lang): string {
  const hi = lang === 'fr' ? 'Bonjour' : 'Hi';
  return `<p style="margin:0 0 12px;font-size:18px;font-weight:600;color:${TEXT_COLOR};">
    ${hi} ${fullName},
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
  // Square, full-black CTA — matches the new B&W brand. Removed the
  // rounded radius so the button reads like the table-driven shapes
  // we use everywhere else (PDF totals strip, dashboard buttons).
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 auto 24px;">
    <tr>
      <td align="center" bgcolor="${BRAND_COLOR}"
          style="background:${BRAND_COLOR};">
        <a href="${href}"
           style="display:inline-block;padding:14px 32px;font-size:13px;font-weight:700;
                  letter-spacing:1.5px;text-transform:uppercase;
                  color:#ffffff;text-decoration:none;
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

function otpBlock(code: string, lang: Lang): string {
  const label = lang === 'fr' ? 'Code de vérification' : 'Verification code';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 24px;">
    <tr>
      <td align="center"
          style="background:${SUBTLE_BG};border:1px solid ${BORDER_COLOR};padding:28px 24px;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:2px;
                  text-transform:uppercase;color:${MUTED_COLOR};">
          ${label}
        </p>
        <p style="margin:0;font-size:38px;font-weight:800;letter-spacing:12px;
                  color:${TEXT_COLOR};font-variant-numeric:tabular-nums;">
          ${escape(code)}
        </p>
      </td>
    </tr>
  </table>`;
}

function urlFallback(url: string, lang: Lang): string {
  const hint =
    lang === 'fr'
      ? `Le bouton ne fonctionne pas&nbsp;? Copiez ce lien dans votre navigateur&nbsp;:`
      : `Button not working? Paste this link into your browser:`;
  return `<p style="margin:16px 0 0;font-size:12px;color:${MUTED_COLOR};text-align:center;">
    ${hint}<br/>
    <a href="${url}" style="color:${TEXT_COLOR};text-decoration:underline;word-break:break-all;">${url}</a>
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

export function renderVerificationEmail(
  args: {
    fullName: string;
    code: string;
  },
  lang: Lang,
): { html: string; subject: string } {
  const TEXTS = {
    en: {
      subject: `${args.code} is your ${APP_NAME} verification code`,
      title: `Verify your ${APP_NAME} account`,
      preheader: `Your verification code is ${args.code}. Expires in 15 minutes.`,
      lead:
        `Use the code below to verify your email address. ` +
        `It expires in <strong>15 minutes</strong>.`,
      note:
        `Once verified you'll be guided through completing your profile and ` +
        `clinic details. Final activation requires admin review.`,
    },
    fr: {
      subject: `${args.code} est votre code de vérification ${APP_NAME}`,
      title: `Vérifiez votre compte ${APP_NAME}`,
      preheader: `Votre code de vérification est ${args.code}. Il expire dans 15 minutes.`,
      lead:
        `Utilisez le code ci-dessous pour vérifier votre adresse e-mail. ` +
        `Il expire dans <strong>15 minutes</strong>.`,
      note:
        `Une fois votre adresse vérifiée, vous serez guidé(e) pour compléter ` +
        `votre profil et les informations de votre cabinet. L'activation ` +
        `finale nécessite la validation d'un administrateur.`,
    },
  };
  const t = TEXTS[lang];
  return {
    subject: t.subject,
    html: shell({
      lang,
      title: t.title,
      preheader: t.preheader,
      body: `
        ${greeting(escape(args.fullName), lang)}
        ${lead(t.lead)}
        ${otpBlock(args.code, lang)}
        <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED_COLOR};text-align:center;">
          ${t.note}
        </p>
      `,
    }),
  };
}

export function renderPasswordResetEmail(
  args: {
    fullName: string;
    resetUrl: string;
  },
  lang: Lang,
): { html: string; subject: string } {
  const TEXTS = {
    en: {
      subject: `Reset your ${APP_NAME} password`,
      title: `Reset your ${APP_NAME} password`,
      preheader: `Reset your ${APP_NAME} password. Link expires in 1 hour.`,
      lead:
        `We received a request to reset your ${APP_NAME} password. ` +
        `Click the button below to choose a new password. This link ` +
        `expires in <strong>1 hour</strong>.`,
      button: `Reset password`,
      note:
        `Didn't request a reset? You can safely ignore this email — your ` +
        `password won't change unless you click the link above.`,
    },
    fr: {
      subject: `Réinitialisez votre mot de passe ${APP_NAME}`,
      title: `Réinitialisez votre mot de passe ${APP_NAME}`,
      preheader: `Réinitialisez votre mot de passe ${APP_NAME}. Le lien expire dans 1 heure.`,
      lead:
        `Nous avons reçu une demande de réinitialisation de votre mot de ` +
        `passe ${APP_NAME}. Cliquez sur le bouton ci-dessous pour choisir un ` +
        `nouveau mot de passe. Ce lien expire dans <strong>1 heure</strong>.`,
      button: `Réinitialiser le mot de passe`,
      note:
        `Vous n'avez pas demandé de réinitialisation&nbsp;? Vous pouvez ignorer ` +
        `cet e-mail en toute sécurité — votre mot de passe ne sera pas modifié ` +
        `tant que vous ne cliquerez pas sur le lien ci-dessus.`,
    },
  };
  const t = TEXTS[lang];
  return {
    subject: t.subject,
    html: shell({
      lang,
      title: t.title,
      preheader: t.preheader,
      body: `
        ${greeting(escape(args.fullName), lang)}
        ${lead(t.lead)}
        ${button(args.resetUrl, t.button)}
        ${divider()}
        ${urlFallback(args.resetUrl, lang)}
        <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:${MUTED_COLOR};">
          ${t.note}
        </p>
      `,
    }),
  };
}

export function renderApprovalGrantedEmail(
  args: {
    fullName: string;
    dashboardUrl: string;
  },
  lang: Lang,
): { html: string; subject: string } {
  const TEXTS = {
    en: {
      subject: `Your ${APP_NAME} account has been approved`,
      title: `${APP_NAME} account approved`,
      preheader: `Welcome to ${APP_NAME}. Your account is now active.`,
      lead:
        `Your ${APP_NAME} account has been approved. ` +
        `You can now sign in and start managing your clinic.`,
      button: `Open dashboard`,
    },
    fr: {
      subject: `Votre compte ${APP_NAME} a été approuvé`,
      title: `Compte ${APP_NAME} approuvé`,
      preheader: `Bienvenue sur ${APP_NAME}. Votre compte est désormais actif.`,
      lead:
        `Votre compte ${APP_NAME} a été approuvé. ` +
        `Vous pouvez désormais vous connecter et commencer à gérer votre cabinet.`,
      button: `Accéder au tableau de bord`,
    },
  };
  const t = TEXTS[lang];
  return {
    subject: t.subject,
    html: shell({
      lang,
      title: t.title,
      preheader: t.preheader,
      body: `
        ${greeting(escape(args.fullName), lang)}
        ${lead(t.lead)}
        ${button(args.dashboardUrl, t.button)}
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
  // Inner row dividers use a softer grey so the table reads as a list,
  // not a heavy grid. The outer card border stays pure black to match
  // the new B&W envelope.
  const body = rows
    .map(
      (r, idx) => {
        const borderRule =
          idx === rows.length - 1 ? '' : `border-bottom:1px solid ${SOFT_BORDER};`;
        return `
      <tr>
        <td style="padding:10px 14px;${borderRule}
                   font-size:11px;font-weight:700;letter-spacing:1.2px;
                   text-transform:uppercase;color:${MUTED_COLOR};width:40%;">
          ${escape(r.label)}
        </td>
        <td style="padding:10px 14px;${borderRule}
                   font-size:14px;color:${TEXT_COLOR};">
          ${escape(r.value)}
        </td>
      </tr>`;
      },
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 24px;background:${SUBTLE_BG};border:1px solid ${BORDER_COLOR};overflow:hidden;">
    ${body}
  </table>`;
}

function decisionBadge(
  decision: 'approved' | 'rejected',
  lang: Lang,
): string {
  // B&W badge — solid black for approved, inverted (white-fill /
  // black-border / black-text) for rejected. Same legible contrast
  // as the old green/red palette, no chroma.
  const isApproved = decision === 'approved';
  const label =
    lang === 'fr'
      ? isApproved
        ? 'Approuvé'
        : 'Rejeté'
      : isApproved
        ? 'Approved'
        : 'Rejected';
  const bg = isApproved ? '#000000' : '#ffffff';
  const fg = isApproved ? '#ffffff' : '#000000';
  return `<span style="display:inline-block;padding:5px 14px;font-size:11px;
                       font-weight:800;text-transform:uppercase;letter-spacing:1.5px;
                       background:${bg};color:${fg};border:1px solid #000000;">
    ${label}
  </span>`;
}

// ─── Order-lifecycle renderers ──────────────────────────────────────────────

/**
 * Sent to the doctor when they submit a new order. Confirms the order
 * was received and points them at the dashboard so they can track it.
 */
export function renderNewOrderForDoctorEmail(
  args: {
    doctorName: string;
    orderCode: string;
    patientName: string;
    dashboardUrl: string;
  },
  lang: Lang,
): { html: string; subject: string } {
  const TEXTS = {
    en: {
      subject: `Order ${args.orderCode} submitted — ${APP_NAME}`,
      title: `Order ${args.orderCode} received`,
      preheader: `We've received your order for ${args.patientName}. Our team is on it.`,
      lead:
        `Thanks — your order has been submitted to our team. ` +
        `You'll get an email as soon as the treatment plan is ready ` +
        `for your review.`,
      labels: { order: `Order`, patient: `Patient`, status: `Status` },
      statusValue: `Submitted — under review`,
      button: `Open order`,
    },
    fr: {
      subject: `Commande ${args.orderCode} soumise — ${APP_NAME}`,
      title: `Commande ${args.orderCode} reçue`,
      preheader: `Nous avons bien reçu votre commande pour ${args.patientName}. Notre équipe s'en occupe.`,
      lead:
        `Merci — votre commande a bien été transmise à notre équipe. ` +
        `Vous recevrez un e-mail dès que le plan de traitement sera prêt ` +
        `pour votre validation.`,
      labels: { order: `Commande`, patient: `Patient`, status: `Statut` },
      statusValue: `Soumise — en cours d'examen`,
      button: `Voir la commande`,
    },
  };
  const t = TEXTS[lang];
  return {
    subject: t.subject,
    html: shell({
      lang,
      title: t.title,
      preheader: t.preheader,
      body: `
        ${greeting(escape(args.doctorName), lang)}
        ${lead(t.lead)}
        ${metaTable([
          { label: t.labels.order, value: args.orderCode },
          { label: t.labels.patient, value: args.patientName },
          { label: t.labels.status, value: t.statusValue },
        ])}
        ${button(args.dashboardUrl, t.button)}
      `,
    }),
  };
}

/**
 * Sent to each admin / super_admin when a doctor submits a new order so
 * they know there's something fresh to plan.
 */
export function renderNewOrderForAdminEmail(
  args: {
    adminName: string;
    orderCode: string;
    doctorName: string;
    patientName: string;
    dashboardUrl: string;
  },
  lang: Lang,
): { html: string; subject: string } {
  const TEXTS = {
    en: {
      subject: `New order ${args.orderCode} from ${args.doctorName}`,
      title: `New order ${args.orderCode}`,
      preheader: `${args.doctorName} submitted a new order for ${args.patientName}.`,
      lead:
        `A new order has just been submitted and is waiting for ` +
        `treatment planning.`,
      labels: {
        order: `Order`,
        doctor: `Doctor`,
        patient: `Patient`,
        status: `Status`,
      },
      statusValue: `Submitted — needs planner assignment`,
      button: `Review order`,
    },
    fr: {
      subject: `Nouvelle commande ${args.orderCode} de ${args.doctorName}`,
      title: `Nouvelle commande ${args.orderCode}`,
      preheader: `${args.doctorName} a soumis une nouvelle commande pour ${args.patientName}.`,
      lead:
        `Une nouvelle commande vient d'être soumise et attend la ` +
        `planification du traitement.`,
      labels: {
        order: `Commande`,
        doctor: `Praticien`,
        patient: `Patient`,
        status: `Statut`,
      },
      statusValue: `Soumise — en attente d'affectation à un planificateur`,
      button: `Examiner la commande`,
    },
  };
  const t = TEXTS[lang];
  return {
    subject: t.subject,
    html: shell({
      lang,
      title: t.title,
      preheader: t.preheader,
      body: `
        ${greeting(escape(args.adminName), lang)}
        ${lead(t.lead)}
        ${metaTable([
          { label: t.labels.order, value: args.orderCode },
          { label: t.labels.doctor, value: args.doctorName },
          { label: t.labels.patient, value: args.patientName },
          { label: t.labels.status, value: t.statusValue },
        ])}
        ${button(args.dashboardUrl, t.button)}
      `,
    }),
  };
}

/**
 * Sent to every admin / super-admin when a new account signs up and is
 * waiting for human approval. Mirrors the new-order admin email so the
 * team has one consistent "something needs your review" visual language.
 */
export function renderNewUserPendingForAdminEmail(
  args: {
    adminName: string;
    newUserName: string;
    newUserEmail: string;
    role: string;
    dashboardUrl: string;
  },
  lang: Lang,
): { html: string; subject: string } {
  // Friendly, localised role label. Sign-ups are dentists today, but we
  // map defensively so a future role still renders cleanly.
  const roleLabels: Record<string, { en: string; fr: string }> = {
    dentist: { en: 'Dentist', fr: 'Praticien' },
    admin: { en: 'Admin', fr: 'Administrateur' },
    super_admin: { en: 'Super admin', fr: 'Super administrateur' },
  };
  const roleLabel = roleLabels[args.role]?.[lang] ?? args.role;

  const TEXTS = {
    en: {
      subject: `New sign-up: ${args.newUserName} is awaiting approval`,
      title: `New account awaiting approval`,
      preheader: `${args.newUserName} (${args.newUserEmail}) just signed up and needs your review.`,
      lead:
        `A new account has just been created and is waiting for ` +
        `approval. Review the details below, then approve or reject ` +
        `the account from the dashboard.`,
      labels: {
        name: `Name`,
        email: `Email`,
        role: `Role`,
        status: `Status`,
      },
      statusValue: `Pending — needs review & approval`,
      button: `Review & approve`,
    },
    fr: {
      subject: `Nouvelle inscription : ${args.newUserName} en attente d'approbation`,
      title: `Nouveau compte en attente d'approbation`,
      preheader: `${args.newUserName} (${args.newUserEmail}) vient de s'inscrire et attend votre validation.`,
      lead:
        `Un nouveau compte vient d'être créé et attend une ` +
        `approbation. Vérifiez les informations ci-dessous, puis ` +
        `approuvez ou rejetez le compte depuis le tableau de bord.`,
      labels: {
        name: `Nom`,
        email: `Email`,
        role: `Rôle`,
        status: `Statut`,
      },
      statusValue: `En attente — vérification et approbation requises`,
      button: `Vérifier et approuver`,
    },
  };
  const t = TEXTS[lang];
  return {
    subject: t.subject,
    html: shell({
      lang,
      title: t.title,
      preheader: t.preheader,
      body: `
        ${greeting(escape(args.adminName), lang)}
        ${lead(t.lead)}
        ${metaTable([
          { label: t.labels.name, value: escape(args.newUserName) },
          { label: t.labels.email, value: escape(args.newUserEmail) },
          { label: t.labels.role, value: roleLabel },
          { label: t.labels.status, value: t.statusValue },
        ])}
        ${button(args.dashboardUrl, t.button)}
      `,
    }),
  };
}

/**
 * Sent to the doctor when admin / designer marks the treatment plan as
 * READY for the doctor's review.
 */
export function renderTreatmentReadyForDoctorEmail(
  args: {
    doctorName: string;
    orderCode: string;
    planName: string;
    dashboardUrl: string;
  },
  lang: Lang,
): { html: string; subject: string } {
  const TEXTS = {
    en: {
      subject: `${args.planName} is ready for review — ${args.orderCode}`,
      title: `Treatment plan ready`,
      preheader: `${args.planName} is ready for your review.`,
      lead:
        `The treatment plan for order <strong>${escape(
          args.orderCode,
        )}</strong> has been prepared and is ready for your review. ` +
        `You can approve it to move on to quotation, or request a ` +
        `revision if anything needs to change.`,
      labels: { order: `Order`, plan: `Plan`, status: `Status` },
      statusValue: `Ready for your review`,
      button: `Review treatment plan`,
    },
    fr: {
      subject: `${args.planName} est prêt pour validation — ${args.orderCode}`,
      title: `Plan de traitement prêt`,
      preheader: `${args.planName} est prêt pour votre validation.`,
      lead:
        `Le plan de traitement de la commande <strong>${escape(
          args.orderCode,
        )}</strong> a été préparé et est prêt pour votre validation. ` +
        `Vous pouvez l'approuver pour passer à l'étape du devis, ou ` +
        `demander une révision si une modification est nécessaire.`,
      labels: { order: `Commande`, plan: `Plan`, status: `Statut` },
      statusValue: `Prêt pour votre validation`,
      button: `Examiner le plan de traitement`,
    },
  };
  const t = TEXTS[lang];
  return {
    subject: t.subject,
    html: shell({
      lang,
      title: t.title,
      preheader: t.preheader,
      body: `
        ${greeting(escape(args.doctorName), lang)}
        ${lead(t.lead)}
        ${metaTable([
          { label: t.labels.order, value: args.orderCode },
          { label: t.labels.plan, value: args.planName },
          { label: t.labels.status, value: t.statusValue },
        ])}
        ${button(args.dashboardUrl, t.button)}
      `,
    }),
  };
}

/**
 * Sent to each admin when the doctor approves or rejects a treatment
 * plan. One template covers both outcomes via the `decision` flag.
 */
export function renderTreatmentDecisionForAdminEmail(
  args: {
    adminName: string;
    orderCode: string;
    doctorName: string;
    planName: string;
    decision: 'approved' | 'rejected';
    reason?: string;
    dashboardUrl: string;
  },
  lang: Lang,
): { html: string; subject: string } {
  const isApproved = args.decision === 'approved';
  const TEXTS = {
    en: {
      subjectApproved: `${args.doctorName} approved ${args.planName} (${args.orderCode})`,
      subjectRejected: `${args.doctorName} requested a revision on ${args.planName} (${args.orderCode})`,
      preheaderApproved: `${args.doctorName} approved ${args.planName}.`,
      preheaderRejected: `${args.doctorName} rejected ${args.planName}.`,
      leadApproved: `<strong>${escape(args.doctorName)}</strong> approved the treatment plan. The order has moved to fabrication.`,
      leadRejected: `<strong>${escape(args.doctorName)}</strong> requested a revision on the treatment plan. The order is back in planning.`,
      labels: {
        order: `Order`,
        plan: `Plan`,
        doctor: `Doctor`,
        reason: `Reason`,
      },
      button: `Open order`,
    },
    fr: {
      subjectApproved: `${args.doctorName} a approuvé ${args.planName} (${args.orderCode})`,
      subjectRejected: `${args.doctorName} a demandé une révision de ${args.planName} (${args.orderCode})`,
      preheaderApproved: `${args.doctorName} a approuvé ${args.planName}.`,
      preheaderRejected: `${args.doctorName} a rejeté ${args.planName}.`,
      leadApproved: `<strong>${escape(args.doctorName)}</strong> a approuvé le plan de traitement. La commande est passée en fabrication.`,
      leadRejected: `<strong>${escape(args.doctorName)}</strong> a demandé une révision du plan de traitement. La commande est de retour en phase de planification.`,
      labels: {
        order: `Commande`,
        plan: `Plan`,
        doctor: `Praticien`,
        reason: `Motif`,
      },
      button: `Voir la commande`,
    },
  };
  const t = TEXTS[lang];
  const subject = isApproved ? t.subjectApproved : t.subjectRejected;
  const leadText = isApproved ? t.leadApproved : t.leadRejected;
  const rows: Array<{ label: string; value: string }> = [
    { label: t.labels.order, value: args.orderCode },
    { label: t.labels.plan, value: args.planName },
    { label: t.labels.doctor, value: args.doctorName },
  ];
  if (args.reason && args.reason.trim()) {
    rows.push({ label: t.labels.reason, value: args.reason.trim() });
  }
  return {
    subject,
    html: shell({
      lang,
      title: subject,
      preheader: isApproved ? t.preheaderApproved : t.preheaderRejected,
      body: `
        ${greeting(escape(args.adminName), lang)}
        <p style="margin:0 0 16px;">${decisionBadge(args.decision, lang)}</p>
        ${lead(leadText)}
        ${metaTable(rows)}
        ${button(args.dashboardUrl, t.button)}
      `,
    }),
  };
}

/**
 * Sent to the doctor when admin sends a quotation. Includes the total
 * for at-a-glance approval/refusal.
 */
export function renderQuoteSentForDoctorEmail(
  args: {
    doctorName: string;
    orderCode: string;
    quotationNumber: string;
    totalTtc: number;
    currency: string;
    dashboardUrl: string;
  },
  lang: Lang,
): { html: string; subject: string } {
  const formattedTotal = formatMoney(args.totalTtc, args.currency);
  const TEXTS = {
    en: {
      subject: `Quotation ${args.quotationNumber} is ready — ${args.orderCode}`,
      title: `Quotation ready`,
      preheader: `Your quotation for order ${args.orderCode} is ready: ${formattedTotal}.`,
      lead:
        `A quotation for your order <strong>${escape(
          args.orderCode,
        )}</strong> is ready for your review. Approve it to start ` +
        `fabrication or reject it to stop the order.`,
      labels: { order: `Order`, quotation: `Quotation`, total: `Total (TTC)` },
      button: `Review quotation`,
    },
    fr: {
      subject: `Votre devis ${args.quotationNumber} est prêt — ${args.orderCode}`,
      title: `Devis prêt`,
      preheader: `Votre devis pour la commande ${args.orderCode} est prêt&nbsp;: ${formattedTotal}.`,
      lead:
        `Un devis pour votre commande <strong>${escape(
          args.orderCode,
        )}</strong> est prêt pour votre validation. Approuvez-le pour ` +
        `lancer la fabrication ou refusez-le pour arrêter la commande.`,
      labels: { order: `Commande`, quotation: `Devis`, total: `Total (TTC)` },
      button: `Examiner le devis`,
    },
  };
  const t = TEXTS[lang];
  return {
    subject: t.subject,
    html: shell({
      lang,
      title: t.title,
      preheader: t.preheader,
      body: `
        ${greeting(escape(args.doctorName), lang)}
        ${lead(t.lead)}
        ${metaTable([
          { label: t.labels.order, value: args.orderCode },
          { label: t.labels.quotation, value: args.quotationNumber },
          { label: t.labels.total, value: formattedTotal },
        ])}
        ${button(args.dashboardUrl, t.button)}
      `,
    }),
  };
}

/**
 * Sent to each admin when the doctor approves or rejects a quotation.
 * One template covers both outcomes.
 */
export function renderQuoteDecisionForAdminEmail(
  args: {
    adminName: string;
    orderCode: string;
    doctorName: string;
    quotationNumber: string;
    decision: 'approved' | 'rejected';
    reason?: string;
    dashboardUrl: string;
  },
  lang: Lang,
): { html: string; subject: string } {
  const isApproved = args.decision === 'approved';
  const TEXTS = {
    en: {
      subjectApproved: `${args.doctorName} approved quotation ${args.quotationNumber} (${args.orderCode})`,
      subjectRejected: `${args.doctorName} rejected quotation ${args.quotationNumber} (${args.orderCode})`,
      preheaderApproved: `${args.doctorName} approved quotation ${args.quotationNumber}.`,
      preheaderRejected: `${args.doctorName} rejected quotation ${args.quotationNumber}.`,
      leadApproved: `<strong>${escape(args.doctorName)}</strong> approved the quotation. The order has moved to fabrication.`,
      leadRejected: `<strong>${escape(args.doctorName)}</strong> rejected the quotation. The order has been canceled.`,
      labels: {
        order: `Order`,
        quotation: `Quotation`,
        doctor: `Doctor`,
        reason: `Reason`,
      },
      button: `Open order`,
    },
    fr: {
      subjectApproved: `${args.doctorName} a approuvé le devis ${args.quotationNumber} (${args.orderCode})`,
      subjectRejected: `${args.doctorName} a refusé le devis ${args.quotationNumber} (${args.orderCode})`,
      preheaderApproved: `${args.doctorName} a approuvé le devis ${args.quotationNumber}.`,
      preheaderRejected: `${args.doctorName} a refusé le devis ${args.quotationNumber}.`,
      leadApproved: `<strong>${escape(args.doctorName)}</strong> a approuvé le devis. La commande est passée en fabrication.`,
      leadRejected: `<strong>${escape(args.doctorName)}</strong> a refusé le devis. La commande a été annulée.`,
      labels: {
        order: `Commande`,
        quotation: `Devis`,
        doctor: `Praticien`,
        reason: `Motif`,
      },
      button: `Voir la commande`,
    },
  };
  const t = TEXTS[lang];
  const subject = isApproved ? t.subjectApproved : t.subjectRejected;
  const leadText = isApproved ? t.leadApproved : t.leadRejected;
  const rows: Array<{ label: string; value: string }> = [
    { label: t.labels.order, value: args.orderCode },
    { label: t.labels.quotation, value: args.quotationNumber },
    { label: t.labels.doctor, value: args.doctorName },
  ];
  if (args.reason && args.reason.trim()) {
    rows.push({ label: t.labels.reason, value: args.reason.trim() });
  }
  return {
    subject,
    html: shell({
      lang,
      title: subject,
      preheader: isApproved ? t.preheaderApproved : t.preheaderRejected,
      body: `
        ${greeting(escape(args.adminName), lang)}
        <p style="margin:0 0 16px;">${decisionBadge(args.decision, lang)}</p>
        ${lead(leadText)}
        ${metaTable(rows)}
        ${button(args.dashboardUrl, t.button)}
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

/**
 * E-mails of the doctor inactivity programme (spec §5): the 30-day and
 * 7-day warnings, the deactivation and the reactivation, FR / EN.
 *
 * Same visual language as templates.ts (white card, letterhead logo,
 * square black button, inline styles only), kept in its own file so the
 * programme never edits the shared template module. The shell below is a
 * compact copy of templates.ts's one; the integration step may export the
 * shared atoms from templates.ts and drop this copy.
 *
 * Every user-supplied value (name) is HTML-escaped; dates are Tunis
 * calendar days. Wording rules: "aligneurs transparents", never "invisible
 * braces"; no medical content.
 */

import type { Lang } from '../common/i18n/lang';
import { env } from '../common/config/env';
import { BUSINESS_TIME_ZONE } from '../common/time/business-day';

const APP_NAME = 'Oralign';
const TEXT_COLOR = '#000000';
const MUTED_COLOR = '#555555';
const BORDER_COLOR = '#000000';
const SUBTLE_BG = '#f5f5f5';
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** "12 décembre 2026" / "12 December 2026", the Africa/Tunis calendar day. */
export function formatActivityDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export interface AccountActivityEmail {
  subject: string;
  html: string;
}

interface WarningArgs {
  fullName: string;
  /** The deactivation date announced (ISO). */
  deadlineAt: string;
  /** The start of the cycle: no submitted order since then (ISO). */
  anchorAt: string;
  daysLeft: number;
  newOrderUrl: string;
}

interface DeactivatedArgs {
  fullName: string;
  dashboardUrl: string;
  supportUrl: string;
}

interface ReactivatedArgs {
  fullName: string;
  newOrderUrl: string;
}

const KEEPS: Record<Lang, string[]> = {
  fr: [
    'vous connecter et suivre vos traitements en cours ;',
    'régler vos paiements et valider vos plans de traitement ;',
    'échanger avec l’équipe Oralign et gérer vos patients.',
  ],
  en: [
    'sign in and follow your ongoing treatments;',
    'settle your payments and approve your treatment plans;',
    'talk to the Oralign team and manage your patients.',
  ],
};

export function renderInactivityWarningEmail(
  args: WarningArgs,
  lang: Lang,
): AccountActivityEmail {
  const deadline = formatActivityDate(args.deadlineAt, lang);
  const since = formatActivityDate(args.anchorAt, lang);
  const days = Math.max(0, Math.round(args.daysLeft));
  const t =
    lang === 'fr'
      ? {
          subject: `Votre compte Oralign deviendra inactif le ${deadline}`,
          preheader: `Soumettez une commande avant le ${deadline} pour garder votre compte actif.`,
          lead: `Aucune commande n’a été soumise sur votre compte depuis le ${since}. Sans nouvelle commande soumise d’ici le <strong>${deadline}</strong> (${dayCount(days, lang)}), votre compte passera en inactif.`,
          keepsTitle: 'Un compte inactif peut toujours :',
          closes:
            'Il ne peut plus créer ni soumettre de commande, et votre cabinet n’apparaît plus dans l’annuaire public « Trouver un praticien », jusqu’à sa réactivation par l’équipe Oralign.',
          cta: 'Créer une commande',
          keep: 'Pour garder votre compte actif, il suffit de soumettre une commande avant cette date.',
        }
      : {
          subject: `Your Oralign account will become inactive on ${deadline}`,
          preheader: `Submit an order before ${deadline} to keep your account active.`,
          lead: `No order has been submitted on your account since ${since}. Without a new submitted order by <strong>${deadline}</strong> (${dayCount(days, lang)}), your account will become inactive.`,
          keepsTitle: 'An inactive account can still:',
          closes:
            'It can no longer create or submit orders, and your practice no longer appears in the public "Find a practitioner" directory, until the Oralign team reactivates it.',
          cta: 'Create an order',
          keep: 'To keep your account active, simply submit an order before that date.',
        };
  const body = `
    ${greeting(args.fullName, lang)}
    ${paragraph(t.lead)}
    ${paragraph(t.keep)}
    ${button(args.newOrderUrl, t.cta)}
    ${keepsBlock(t.keepsTitle, KEEPS[lang], t.closes)}
  `;
  return {
    subject: t.subject,
    html: shell({ title: t.subject, preheader: t.preheader, body, lang }),
  };
}

export function renderAccountDeactivatedEmail(
  args: DeactivatedArgs,
  lang: Lang,
): AccountActivityEmail {
  const t =
    lang === 'fr'
      ? {
          subject: 'Votre compte Oralign est désormais inactif',
          preheader:
            'Aucune commande soumise récemment : la création de commandes est suspendue.',
          lead: 'Faute de commande soumise depuis plusieurs mois, votre compte Oralign est passé en inactif. La création et la soumission de commandes sont suspendues, et votre cabinet n’apparaît plus dans l’annuaire public « Trouver un praticien ».',
          keepsTitle: 'Vous pouvez toujours :',
          reactivate: `Pour le réactiver, contactez l’équipe Oralign : répondez à cet e-mail ou écrivez-nous depuis le <a href="${escapeAttr(args.supportUrl)}" style="color:${TEXT_COLOR};text-decoration:underline;">support de votre espace</a>.`,
          cta: 'Ouvrir mon espace',
        }
      : {
          subject: 'Your Oralign account is now inactive',
          preheader:
            'No order submitted recently: creating orders is suspended.',
          lead: 'As no order has been submitted for several months, your Oralign account is now inactive. Creating and submitting orders is suspended, and your practice no longer appears in the public "Find a practitioner" directory.',
          keepsTitle: 'You can still:',
          reactivate: `To reactivate it, contact the Oralign team: reply to this e-mail or write to us from the <a href="${escapeAttr(args.supportUrl)}" style="color:${TEXT_COLOR};text-decoration:underline;">support in your account</a>.`,
          cta: 'Open my account',
        };
  const body = `
    ${greeting(args.fullName, lang)}
    ${paragraph(t.lead)}
    ${keepsBlock(t.keepsTitle, KEEPS[lang])}
    ${paragraph(t.reactivate)}
    ${button(args.dashboardUrl, t.cta)}
  `;
  return {
    subject: t.subject,
    html: shell({ title: t.subject, preheader: t.preheader, body, lang }),
  };
}

export function renderAccountReactivatedEmail(
  args: ReactivatedArgs,
  lang: Lang,
): AccountActivityEmail {
  const t =
    lang === 'fr'
      ? {
          subject: 'Votre compte Oralign est réactivé',
          preheader: 'Vous pouvez de nouveau créer et soumettre des commandes.',
          lead: 'L’équipe Oralign a réactivé votre compte : vous pouvez de nouveau créer et soumettre des commandes d’aligneurs transparents. Si votre cabinet est inscrit à l’annuaire public « Trouver un praticien », il y apparaît de nouveau.',
          cta: 'Créer une commande',
        }
      : {
          subject: 'Your Oralign account is reactivated',
          preheader: 'You can create and submit orders again.',
          lead: 'The Oralign team reactivated your account: you can create and submit transparent aligner orders again. If your practice is listed in the public "Find a practitioner" directory, it appears there again.',
          cta: 'Create an order',
        };
  const body = `
    ${greeting(args.fullName, lang)}
    ${paragraph(t.lead)}
    ${button(args.newOrderUrl, t.cta)}
  `;
  return {
    subject: t.subject,
    html: shell({ title: t.subject, preheader: t.preheader, body, lang }),
  };
}

// ─── Atoms ──────────────────────────────────────────────────────────────────

function dayCount(days: number, lang: Lang): string {
  if (lang === 'fr') return days <= 1 ? `${days} jour` : `${days} jours`;
  return days === 1 ? '1 day' : `${days} days`;
}

function greeting(fullName: string, lang: Lang): string {
  const hi = lang === 'fr' ? 'Bonjour' : 'Hi';
  return `<p style="margin:0 0 12px;font-size:18px;font-weight:600;color:${TEXT_COLOR};">${hi} ${escapeHtml(fullName)},</p>`;
}

/** A paragraph of TRUSTED template copy (it may hold <strong> / <a>). */
function paragraph(html: string): string {
  return `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED_COLOR};">${html}</p>`;
}

function keepsBlock(title: string, items: string[], footer?: string): string {
  const list = items
    .map(
      (item) =>
        `<li style="margin:0 0 4px;font-size:14px;line-height:1.5;color:${TEXT_COLOR};">${item}</li>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
    <tr>
      <td style="background:${SUBTLE_BG};border:1px solid ${BORDER_COLOR};padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:${TEXT_COLOR};">${title}</p>
        <ul style="margin:0;padding:0 0 0 18px;">${list}</ul>
        ${footer ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:${MUTED_COLOR};">${footer}</p>` : ''}
      </td>
    </tr>
  </table>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
    <tr>
      <td align="center" bgcolor="${TEXT_COLOR}" style="background:${TEXT_COLOR};">
        <a href="${escapeAttr(href)}" style="display:inline-block;padding:14px 32px;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;text-decoration:none;font-family:${FONT};">${label}</a>
      </td>
    </tr>
  </table>`;
}

function logoUrl(): string {
  const base = (env.mail.logoUrl ?? env.frontendUrl).replace(/\/$/, '');
  return base
    ? `${base}/ORALIGN%20BLACK.png`
    : 'https://oralign.com.tn/ORALIGN%20BLACK.png';
}

function shell(input: {
  title: string;
  preheader: string;
  body: string;
  lang: Lang;
}): string {
  const year = new Date().getFullYear();
  const rights =
    input.lang === 'fr' ? 'Tous droits réservés.' : 'All rights reserved.';
  return `<!DOCTYPE html>
<html lang="${input.lang}" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:${TEXT_COLOR};font-family:${FONT};-webkit-font-smoothing:antialiased;">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER_COLOR};">
            <tr>
              <td align="center" style="padding:32px 32px 28px;border-bottom:1px solid ${BORDER_COLOR};">
                <img src="${logoUrl()}" alt="${APP_NAME}" width="140" style="display:block;margin:0 auto;max-width:140px;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">${input.body}</td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:${SUBTLE_BG};border-top:1px solid ${BORDER_COLOR};">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED_COLOR};text-align:center;">&copy; ${year} ${APP_NAME}. ${rights}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function escapeHtml(input: string): string {
  return String(input).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}

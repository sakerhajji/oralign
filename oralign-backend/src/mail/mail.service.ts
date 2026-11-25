import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Lang, pickLang } from '../common/i18n/lang';
import { PrismaService } from '../prisma/prisma.service';
import {
  renderApprovalGrantedEmail,
  renderAppointmentDecisionForPatient,
  renderAppointmentRequestedForPatient,
  renderAppointmentRequestForPractitioner,
  renderInvoiceForDoctorEmail,
  renderNewOrderForAdminEmail,
  renderNewUserPendingForAdminEmail,
  renderNewOrderForDoctorEmail,
  renderPasswordResetEmail,
  renderProductionDeliveredForDoctorEmail,
  renderProductionDeliveryCancelledForDoctorEmail,
  renderQuoteDecisionForAdminEmail,
  renderQuoteSentForDoctorEmail,
  renderTreatmentDecisionForAdminEmail,
  renderTreatmentReadyForDoctorEmail,
  renderVerificationEmail,
  type ProductionDeliveryEmailArgs,
} from './templates';
import { env } from '../common/config/env';
import { aligned, checkDomainAuth, domainOf, resolveDkim } from './mail-auth';

type Transporter = ReturnType<typeof nodemailer.createTransport>;

/** A file sent with a mail (nodemailer attachment, in-memory content). */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const { host, user, password: pass } = env.mail;

    if (!host || !user || !pass) {
      this.logger.warn(
        'Mail configuration is incomplete. Email sending is disabled. ' +
          'Set MAIL_HOST, MAIL_USER, MAIL_PASSWORD environment variables.',
      );
      return;
    }

    const fromDomain = domainOf(this.fromAddress);
    const dkim = resolveDkim(env.mail.dkim, fromDomain, this.logger);

    this.transporter = nodemailer.createTransport({
      host,
      port: env.mail.port,
      secure: env.mail.port === 465,
      auth: { user, pass },
      // EHLO with a real domain. Left unset, nodemailer falls back to
      // "[127.0.0.1]" (a container hostname has no dot), which relays
      // copy into the Received header filters read.
      name: env.mail.ehloName || fromDomain || undefined,
      ...(dkim ? { dkim } : {}),
    });
    if (dkim) {
      this.logger.log(
        `DKIM signing on: d=${dkim.domainName}, s=${dkim.keySelector}.`,
      );
    }
    if (env.nodeEnv !== 'test') {
      void checkDomainAuth(fromDomain, dkim, this.logger);
    }

    // ── Deliverability guard ─────────────────────────────────────────
    // Sending "From: someone@other-domain" through an SMTP account of a
    // different domain fails DMARC alignment (the From-domain has no
    // SPF/DKIM covering this sender), which is THE classic reason mail
    // lands in spam. Gmail in particular only signs for the
    // authenticated account (or its verified aliases). Warn loudly so a
    // misconfigured MAIL_FROM never ships silently — unless the app
    // signs for the From domain itself, which is exactly the fix.
    const userDomain = domainOf(user);
    const selfSigned = !!dkim && aligned(dkim.domainName, fromDomain);
    if (fromDomain && userDomain && fromDomain !== userDomain && !selfSigned) {
      this.logger.warn(
        `MAIL_FROM domain "${fromDomain}" differs from the authenticated ` +
          `account domain "${userDomain}". Unless "${fromDomain}" publishes ` +
          `SPF/DKIM for this SMTP provider (and the account is a verified ` +
          `alias), DMARC alignment FAILS and mail goes to spam. Either set ` +
          `MAIL_FROM to the authenticated address or move to a provider ` +
          `with the domain properly authenticated.`,
      );
    }
  }

  /**
   * Extract a bare email address from a raw env value. Tolerates the
   * formats people naturally put in MAIL_FROM — `addr@dom.tn`,
   * `Name <addr@dom.tn>`, `"Name" <addr@dom.tn>` — and returns '' when
   * no address can be found. Anything except a BARE address in the SMTP
   * envelope makes strict providers reject with "553 sender address
   * rejected: not owned by user" (seen in production when MAIL_FROM
   * carried a display name).
   */
  private static extractBareAddress(raw: string | undefined): string {
    if (!raw) return '';
    // Prefer an explicit <addr> group, then any address-shaped token —
    // covers `addr`, `Name <addr>` and `Name addr` alike.
    const angled = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
    if (angled) return angled[1];
    const token = raw.match(/[^\s"'<>,;]+@[^\s"'<>,;]+/);
    return token ? token[0] : '';
  }

  /** Bare From address — defaults to the AUTHENTICATED mailbox (never a
   *  foreign domain: an unaligned From is what triggers spam filters).
   *  MAIL_FROM is sanitised to a bare address; if it is set but yields
   *  no parseable address, the authenticated MAIL_USER is used instead
   *  so mail keeps flowing while the misconfiguration is logged. */
  private get fromAddress(): string {
    const configured = MailService.extractBareAddress(env.mail.from);
    if (configured) return configured;
    if (env.mail.from) {
      this.logger.error(
        `MAIL_FROM ("${env.mail.from}") does not contain a valid ` +
          'email address — falling back to MAIL_USER. Set MAIL_FROM to a ' +
          'BARE address (use MAIL_FROM_NAME for the display name).',
      );
    }
    return MailService.extractBareAddress(env.mail.user);
  }

  /** Full From header with a human display name — "Oralign <addr>". A
   *  recognisable sender name improves open rates and filter reputation. */
  private get from(): { name: string; address: string } {
    return {
      name: env.mail.fromName,
      address: this.fromAddress,
    };
  }

  /**
   * Language the recipient should receive their email in, looked up from
   * the user's stored `preferredLanguage`. Any failure (unknown address,
   * DB hiccup) falls back to English — an email must never fail to send
   * because of a language lookup.
   */
  private async resolveLang(to: string): Promise<Lang> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: to },
        select: { preferredLanguage: true },
      });
      return pickLang(user?.preferredLanguage);
    } catch {
      return 'en';
    }
  }

  async sendVerificationEmail(
    to: string,
    fullName: string,
    code: string,
    lang?: Lang,
  ): Promise<void> {
    const { html, subject } = renderVerificationEmail(
      { fullName, code },
      lang ?? (await this.resolveLang(to)),
    );
    await this.send({
      to,
      subject,
      html,
      devHint: `OTP code: ${code}`,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    fullName: string,
    resetUrl: string,
    lang?: Lang,
  ): Promise<void> {
    const { html, subject } = renderPasswordResetEmail(
      { fullName, resetUrl },
      lang ?? (await this.resolveLang(to)),
    );
    await this.send({
      to,
      subject,
      html,
    });
  }

  async sendApprovalGrantedEmail(
    to: string,
    fullName: string,
    dashboardUrl: string,
    lang?: Lang,
  ): Promise<void> {
    const { html, subject } = renderApprovalGrantedEmail(
      {
        fullName,
        dashboardUrl,
      },
      lang ?? (await this.resolveLang(to)),
    );
    await this.send({ to, subject, html });
  }

  // ─── Order-lifecycle emails ─────────────────────────────────────────────

  async sendNewOrderForDoctorEmail(args: {
    to: string;
    doctorName: string;
    orderCode: string;
    patientName: string;
    dashboardUrl: string;
    lang?: Lang;
  }): Promise<void> {
    const { html, subject } = renderNewOrderForDoctorEmail(
      args,
      args.lang ?? (await this.resolveLang(args.to)),
    );
    await this.send({ to: args.to, subject, html });
  }

  async sendNewOrderForAdminEmail(args: {
    to: string;
    adminName: string;
    orderCode: string;
    doctorName: string;
    patientName: string;
    dashboardUrl: string;
    lang?: Lang;
  }): Promise<void> {
    const { html, subject } = renderNewOrderForAdminEmail(
      args,
      args.lang ?? (await this.resolveLang(args.to)),
    );
    await this.send({ to: args.to, subject, html });
  }

  async sendNewUserPendingForAdminEmail(args: {
    to: string;
    adminName: string;
    newUserName: string;
    newUserEmail: string;
    role: string;
    dashboardUrl: string;
    lang?: Lang;
  }): Promise<void> {
    const { html, subject } = renderNewUserPendingForAdminEmail(
      args,
      args.lang ?? (await this.resolveLang(args.to)),
    );
    await this.send({ to: args.to, subject, html });
  }

  async sendTreatmentReadyForDoctorEmail(args: {
    to: string;
    doctorName: string;
    orderCode: string;
    planName: string;
    dashboardUrl: string;
    lang?: Lang;
  }): Promise<void> {
    const { html, subject } = renderTreatmentReadyForDoctorEmail(
      args,
      args.lang ?? (await this.resolveLang(args.to)),
    );
    await this.send({ to: args.to, subject, html });
  }

  async sendTreatmentDecisionForAdminEmail(args: {
    to: string;
    adminName: string;
    orderCode: string;
    doctorName: string;
    planName: string;
    decision: 'approved' | 'rejected';
    reason?: string;
    dashboardUrl: string;
    lang?: Lang;
  }): Promise<void> {
    const { html, subject } = renderTreatmentDecisionForAdminEmail(
      args,
      args.lang ?? (await this.resolveLang(args.to)),
    );
    await this.send({ to: args.to, subject, html });
  }

  async sendQuoteSentForDoctorEmail(args: {
    to: string;
    doctorName: string;
    orderCode: string;
    quotationNumber: string;
    totalTtc: number;
    currency: string;
    dashboardUrl: string;
    lang?: Lang;
  }): Promise<void> {
    const { html, subject } = renderQuoteSentForDoctorEmail(
      args,
      args.lang ?? (await this.resolveLang(args.to)),
    );
    await this.send({ to: args.to, subject, html });
  }

  async sendQuoteDecisionForAdminEmail(args: {
    to: string;
    adminName: string;
    orderCode: string;
    doctorName: string;
    quotationNumber: string;
    decision: 'approved' | 'rejected';
    reason?: string;
    dashboardUrl: string;
    lang?: Lang;
  }): Promise<void> {
    const { html, subject } = renderQuoteDecisionForAdminEmail(
      args,
      args.lang ?? (await this.resolveLang(args.to)),
    );
    await this.send({ to: args.to, subject, html });
  }

  // ─── Billing emails ─────────────────────────────────────────────────────

  /**
   * The invoice of a payment, PDF attached, to the practitioner who paid.
   * Returns whether it actually went out (false when SMTP is not
   * configured), so the caller only stamps `emailedAt` on a real send.
   * SMTP errors are rethrown, like every other send.
   */
  async sendInvoiceToDoctor(args: {
    to: string;
    lang: Lang;
    doctorName: string;
    invoiceNumber: string;
    orderCode: string | null;
    /** Total TTC of the facture, droit de timbre included. */
    totalTtc: number;
    /** The droit de timbre added on top (printed on its own row). */
    stampDuty?: number;
    withholdingRate: number | null;
    withholdingAmount: number;
    netPayable: number;
    currency: string;
    paid: boolean;
    dashboardUrl: string | null;
    pdf: { filename: string; content: Buffer };
  }): Promise<boolean> {
    const { html, subject } = renderInvoiceForDoctorEmail(args, args.lang);
    return this.send({
      to: args.to,
      subject,
      html,
      attachments: [
        {
          filename: args.pdf.filename,
          content: args.pdf.content,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  // ─── Lab production emails ──────────────────────────────────────────────
  //
  // Sent by the production notice dispatcher (src/production/notifications),
  // which keeps the outbox row honest: like sendInvoiceToDoctor they return
  // whether SMTP accepted the message (false = mail disabled, nothing sent)
  // and rethrow real SMTP failures so the row is retried.

  /** Aligners delivered by the lab, after the grace delay. */
  async sendProductionDeliveredToDoctor(
    args: ProductionDeliveryEmailArgs & { to: string; lang: Lang },
  ): Promise<boolean> {
    const { html, subject } = renderProductionDeliveredForDoctorEmail(
      args,
      args.lang,
    );
    return this.send({ to: args.to, subject, html });
  }

  /** A delivery the practitioner was told about was cancelled (correction). */
  async sendProductionDeliveryCancelledToDoctor(
    args: ProductionDeliveryEmailArgs & { to: string; lang: Lang },
  ): Promise<boolean> {
    const { html, subject } = renderProductionDeliveryCancelledForDoctorEmail(
      args,
      args.lang,
    );
    return this.send({ to: args.to, subject, html });
  }

  // ─── Appointment emails ─────────────────────────────────────────────────
  //
  // Patients are NOT app Users, so their language can't be looked up from
  // preferredLanguage — every appointment wrapper takes an explicit `lang`.
  // For the practitioner copy the caller passes their stored preference.

  async sendAppointmentRequestedToPatient(args: {
    to: string;
    lang: Lang;
    patientName: string;
    practitionerName: string;
    clinicName: string;
    clinicAddress?: string | null;
    requestedAtLabel: string;
  }): Promise<void> {
    const { html, subject } = renderAppointmentRequestedForPatient(
      args,
      args.lang,
    );
    await this.send({ to: args.to, subject, html });
  }

  async sendAppointmentRequestToPractitioner(args: {
    to: string;
    lang: Lang;
    practitionerName: string;
    patientName: string;
    patientEmail: string;
    patientPhone?: string | null;
    patientMessage?: string | null;
    clinicName: string;
    requestedAtLabel: string;
    acceptUrl: string;
    declineUrl: string;
  }): Promise<void> {
    const { html, subject } = renderAppointmentRequestForPractitioner(
      args,
      args.lang,
    );
    await this.send({ to: args.to, subject, html });
  }

  async sendAppointmentDecisionToPatient(args: {
    to: string;
    lang: Lang;
    patientName: string;
    practitionerName: string;
    clinicName: string;
    clinicAddress?: string | null;
    requestedAtLabel: string;
    decision: 'accepted' | 'declined';
  }): Promise<void> {
    const { html, subject } = renderAppointmentDecisionForPatient(
      args,
      args.lang,
    );
    await this.send({ to: args.to, subject, html });
  }

  /**
   * Returns true once the SMTP relay accepted the message, false when mail
   * is disabled (nothing was sent). Real SMTP failures are rethrown.
   */
  private async send(options: {
    to: string;
    subject: string;
    html: string;
    /** Optional plain-text summary logged when mail is disabled */
    devHint?: string;
    attachments?: MailAttachment[];
  }): Promise<boolean> {
    if (!this.transporter) {
      // SMTP not configured. Hint is suppressed in production so we don't
      // leak OTPs or reset URLs into stdout (operators may ship logs to a
      // less-trusted system).
      const isProd = env.isProd;
      const hint = !isProd && options.devHint ? ` | ${options.devHint}` : '';
      this.logger.warn(
        `[MAIL DISABLED] To: ${options.to} | Subject: ${options.subject}${hint}`,
      );
      if (isProd) {
        this.logger.error(
          'SMTP transporter is not configured but app is running in production',
        );
      }
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        // Multipart/alternative: HTML-only mail is a classic spam-score
        // penalty (SpamAssassin MIME_HTML_ONLY) and breaks text-only
        // clients. Derive the text part from the HTML so templates don't
        // need to maintain two bodies.
        text: htmlToPlainText(options.html),
        // Give recipients a real mailbox to answer to (a From that can't
        // be replied to is another spam signal). Optional override.
        replyTo: env.mail.replyTo || this.fromAddress,
        ...(options.attachments?.length
          ? {
              attachments: options.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                ...(a.contentType ? { contentType: a.contentType } : {}),
              })),
            }
          : {}),
      });
      this.logger.log(`Email sent to ${options.to}: "${options.subject}"`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}

/**
 * Down-convert an HTML email body to a readable plain-text alternative.
 * Not a full renderer — good enough for the transactional templates this
 * app sends (paragraph-ish blocks, links, a button or two).
 */
function htmlToPlainText(html: string): string {
  return (
    html
      // Drop non-content blocks entirely.
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      // Keep link targets: "label (url)" — but skip anchors whose label IS
      // the url to avoid "url (url)".
      .replace(
        /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
        (_m, href: string, label: string) => {
          const cleanLabel = label.replace(/<[^>]+>/g, '').trim();
          if (!cleanLabel || cleanLabel === href) return href;
          return `${cleanLabel} (${href})`;
        },
      )
      // Block-level tags become line breaks.
      .replace(/<(?:br|\/p|\/div|\/tr|\/h[1-6]|\/li)[^>]*>/gi, '\n')
      // Strip every remaining tag.
      .replace(/<[^>]+>/g, '')
      // Decode the entities our templates actually use.
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&copy;/g, '©')
      // Collapse the whitespace soup HTML leaves behind.
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

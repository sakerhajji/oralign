import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Lang, pickLang } from '../common/i18n/lang';
import { PrismaService } from '../prisma/prisma.service';
import {
  renderApprovalGrantedEmail,
  renderNewOrderForAdminEmail,
  renderNewUserPendingForAdminEmail,
  renderNewOrderForDoctorEmail,
  renderPasswordResetEmail,
  renderQuoteDecisionForAdminEmail,
  renderQuoteSentForDoctorEmail,
  renderTreatmentDecisionForAdminEmail,
  renderTreatmentReadyForDoctorEmail,
  renderVerificationEmail,
} from './templates';

type Transporter = ReturnType<typeof nodemailer.createTransport>;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.MAIL_HOST;
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASSWORD;

    if (!host || !user || !pass) {
      this.logger.warn(
        'Mail configuration is incomplete. Email sending is disabled. ' +
          'Set MAIL_HOST, MAIL_USER, MAIL_PASSWORD environment variables.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.MAIL_PORT || '587', 10),
      secure: process.env.MAIL_PORT === '465',
      auth: { user, pass },
    });
  }

  private get from(): string {
    return process.env.MAIL_FROM || 'noreply@oralign.com';
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

  private async send(options: {
    to: string;
    subject: string;
    html: string;
    /** Optional plain-text summary logged when mail is disabled */
    devHint?: string;
  }): Promise<void> {
    if (!this.transporter) {
      // SMTP not configured. Hint is suppressed in production so we don't
      // leak OTPs or reset URLs into stdout (operators may ship logs to a
      // less-trusted system).
      const isProd = process.env.NODE_ENV === 'production';
      const hint = !isProd && options.devHint ? ` | ${options.devHint}` : '';
      this.logger.warn(
        `[MAIL DISABLED] To: ${options.to} | Subject: ${options.subject}${hint}`,
      );
      if (isProd) {
        this.logger.error(
          'SMTP transporter is not configured but app is running in production',
        );
      }
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`Email sent to ${options.to}: "${options.subject}"`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}

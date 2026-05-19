import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  renderApprovalGrantedEmail,
  renderPasswordResetEmail,
  renderVerificationEmail,
} from './templates';

type Transporter = ReturnType<typeof nodemailer.createTransport>;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor() {
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

  async sendVerificationEmail(
    to: string,
    fullName: string,
    code: string,
  ): Promise<void> {
    const { html, subject } = renderVerificationEmail({ fullName, code });
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
  ): Promise<void> {
    const { html, subject } = renderPasswordResetEmail({ fullName, resetUrl });
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
  ): Promise<void> {
    const { html, subject } = renderApprovalGrantedEmail({
      fullName,
      dashboardUrl,
    });
    await this.send({ to, subject, html });
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
      const hint =
        !isProd && options.devHint ? ` | ${options.devHint}` : '';
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

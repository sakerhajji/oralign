import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

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
    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                style="background:#ffffff;border-radius:12px;overflow:hidden;
                       box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                  <td style="background:#0f172a;padding:32px 40px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;
                                letter-spacing:-0.5px;">Oralign</h1>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:40px;">
                    <p style="margin:0 0 8px;font-size:16px;color:#374151;">
                      Hi <strong>${fullName}</strong>,
                    </p>
                    <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                      Use the code below to verify your email address.
                      It expires in <strong>15&nbsp;minutes</strong>.
                    </p>
                    <!-- OTP block -->
                    <div style="background:#f0f9ff;border:2px solid #bae6fd;
                                border-radius:10px;padding:28px;text-align:center;
                                margin-bottom:28px;">
                      <p style="margin:0 0 8px;font-size:12px;color:#0369a1;
                                 font-weight:600;text-transform:uppercase;
                                 letter-spacing:1px;">Your Verification Code</p>
                      <p style="margin:0;font-size:46px;font-weight:800;
                                 letter-spacing:14px;color:#0c4a6e;
                                 font-variant-numeric:tabular-nums;">${code}</p>
                    </div>
                    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
                      Didn't request this? You can safely ignore this email.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background:#f9fafb;padding:20px 40px;
                              border-top:1px solid #e5e7eb;text-align:center;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;">
                      &copy; ${new Date().getFullYear()} Oralign. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
      </html>`;

    await this.send({
      to,
      subject: `${code} is your Oralign verification code`,
      html,
      devHint: `OTP code: ${code}`,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    fullName: string,
    resetUrl: string,
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                style="background:#ffffff;border-radius:12px;overflow:hidden;
                       box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                  <td style="background:#0f172a;padding:32px 40px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;
                                letter-spacing:-0.5px;">Oralign</h1>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:40px;">
                    <p style="margin:0 0 8px;font-size:16px;color:#374151;">
                      Hi <strong>${fullName}</strong>,
                    </p>
                    <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                      We received a request to reset your Oralign password.
                      Click the button below to choose a new password.
                      This link expires in <strong>1&nbsp;hour</strong>.
                    </p>
                    <!-- CTA button -->
                    <div style="text-align:center;margin-bottom:28px;">
                      <a href="${resetUrl}"
                         style="display:inline-block;padding:14px 32px;
                                background:#0f172a;color:#ffffff;
                                text-decoration:none;border-radius:8px;
                                font-size:15px;font-weight:600;">
                        Reset Password
                      </a>
                    </div>
                    <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;text-align:center;">
                      If the button doesn't work, copy this link into your browser:
                    </p>
                    <p style="margin:0;font-size:12px;color:#6b7280;
                               text-align:center;word-break:break-all;">
                      ${resetUrl}
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background:#f9fafb;padding:20px 40px;
                              border-top:1px solid #e5e7eb;text-align:center;">
                    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">
                      Didn't request this? You can safely ignore this email.
                    </p>
                    <p style="margin:0;font-size:12px;color:#9ca3af;">
                      &copy; ${new Date().getFullYear()} Oralign. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
      </html>`;

    await this.send({
      to,
      subject: 'Reset your Oralign password',
      html,
    });
  }

  private async send(options: {
    to: string;
    subject: string;
    html: string;
    /** Optional plain-text summary logged when mail is disabled */
    devHint?: string;
  }): Promise<void> {
    if (!this.transporter) {
      // SMTP not configured — log so the developer can continue without email.
      // Set MAIL_HOST, MAIL_USER, MAIL_PASSWORD to enable real sending.
      this.logger.warn(
        `[MAIL DISABLED] To: ${options.to} | Subject: ${options.subject}` +
          (options.devHint ? ` | ${options.devHint}` : ''),
      );
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

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { requiredSecret } from '../../common/config/required-secret';
import { NotificationEvents } from '../../notifications/events/notification-events';

/** OWASP-recommended bcrypt cost as of 2024+. */
const BCRYPT_COST = 12;
import {
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '../../common/exceptions/app.exception';
import {
  SignUpDto,
  SignInDto,
  VerifyEmailDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
  ResendVerificationDto,
  ChangePasswordDto,
} from '../dto/auth.dto';
import {
  AuthTokenDto,
  AuthResponseDto,
  VerifyEmailResponseDto,
} from '../dto/auth-response.dto';
import { UserRole } from '@prisma/client';
import { env } from '../../common/config/env';

/** 15 minutes in milliseconds */
const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1_000;

/** 1 hour in seconds */
const RESET_TOKEN_TTL_S = 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly events: EventEmitter2,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Sign-up (dentist only — role is always set to dentist)
  // ─────────────────────────────────────────────────────────────────────────────

  async signUp(signUpDto: SignUpDto): Promise<AuthResponseDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: signUpDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered', 'EMAIL_EXISTS');
    }

    // Phone is unique when present — blank/whitespace is normalised to
    // null so the constraint never trips on an empty string.
    const phone = signUpDto.phone?.trim() || null;
    if (phone) {
      const phoneTaken = await this.prisma.user.findUnique({
        where: { phone },
      });
      if (phoneTaken) {
        throw new ConflictException(
          'Phone number already registered',
          'PHONE_EXISTS',
        );
      }
    }

    const hashedPassword = await bcrypt.hash(signUpDto.password, BCRYPT_COST);
    const code = this.generateOtp();
    const codeExpiry = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

    const user = await this.prisma.user.create({
      data: {
        email: signUpDto.email,
        fullName: signUpDto.fullName,
        passwordHash: hashedPassword,
        phone,
        country: signUpDto.country,
        role: UserRole.dentist,
        emailVerificationCode: code,
        emailVerificationExpiry: codeExpiry,
      },
    });

    // Send verification email (non-blocking — account created regardless)
    void this.mailService
      .sendVerificationEmail(user.email, user.fullName, code)
      .catch(() => {
        /* already logged inside MailService */
      });

    // Fan a notification out to every admin so they know a new doctor is
    // awaiting approval. Emission is synchronous but the listener runs
    // async with its own try/catch — a notification failure can never
    // unwind this sign-up.
    this.events.emit(NotificationEvents.UserRegistered, {
      userId: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    });

    // NOTE: the "review & approve" EMAIL to admins is intentionally sent
    // LATER — when the dentist finishes onboarding (saves their clinic) and
    // is genuinely ready for review — not here at sign-up where the profile
    // is still empty. See DentistProfileService.setupClinic →
    // NotificationEvents.DentistOnboardingCompleted. The bell above is the
    // lightweight in-app "a new account registered" awareness ping.

    const authToken = this.generateTokens(user.id, user.email, user.role, user.tokenVersion);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      verificationStatus: user.verificationStatus,
      avatarUrl: user.avatarUrl ?? undefined,
      // Seeds the frontend i18n store immediately after sign-in /
      // sign-up — before the first /users/me round-trip.
      preferredLanguage: user.preferredLanguage ?? undefined,
      authToken,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sign-in
  // ─────────────────────────────────────────────────────────────────────────────

  async signIn(signInDto: SignInDto): Promise<AuthResponseDto> {
    const MAX_ATTEMPTS = 5;
    const LOCK_DURATION_MS = 15 * 60 * 1_000;

    const user = await this.prisma.user.findUnique({
      where: { email: signInDto.email },
    });

    if (!user || user.deletedAt) {
      // SECURITY (audit L-1): identical response to a wrong password so an
      // attacker cannot tell whether the email exists (no enumeration).
      throw new UnauthorizedException(
        'Invalid email or password.',
        'INVALID_CREDENTIALS',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Account is deactivated. Please contact support.',
        'ACCOUNT_INACTIVE',
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60_000,
      );
      throw new UnauthorizedException(
        `Account locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
        'ACCOUNT_LOCKED',
      );
    }

    const passwordMatch = await bcrypt.compare(
      signInDto.password,
      user.passwordHash,
    );

    if (!passwordMatch) {
      const newFailedAttempts = user.failedLoginAttempts + 1;
      const shouldLock = newFailedAttempts >= MAX_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + LOCK_DURATION_MS)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newFailedAttempts,
          ...(lockedUntil !== null && { lockedUntil }),
        },
      });

      // SECURITY (audit L-1): the non-locked case returns the SAME generic
      // message + code as an unknown email — no "N attempts remaining"
      // disclosure, which would otherwise confirm the account exists.
      throw new UnauthorizedException(
        shouldLock
          ? 'Account locked due to too many failed attempts. Try again in 15 minutes.'
          : 'Invalid email or password.',
        shouldLock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const authToken = this.generateTokens(user.id, user.email, user.role, user.tokenVersion);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      verificationStatus: user.verificationStatus,
      avatarUrl: user.avatarUrl ?? undefined,
      // Seeds the frontend i18n store immediately after sign-in /
      // sign-up — before the first /users/me round-trip.
      preferredLanguage: user.preferredLanguage ?? undefined,
      authToken,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Email verification
  // ─────────────────────────────────────────────────────────────────────────────

  async verifyEmail(
    verifyEmailDto: VerifyEmailDto,
  ): Promise<VerifyEmailResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: verifyEmailDto.email },
    });

    // A soft-deleted account must not be able to mint tokens through the
    // OTP path (sign-in / refresh / reset already refuse it).
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (user.isEmailVerified) {
      // Already verified — still return tokens so the client can complete the flow
      const authToken = this.generateTokens(user.id, user.email, user.role, user.tokenVersion);
      return {
        message: 'Email already verified',
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          isEmailVerified: true,
          verificationStatus: user.verificationStatus,
        },
        authToken,
      };
    }

    if (!user.emailVerificationCode || !user.emailVerificationExpiry) {
      throw new BadRequestException(
        'No verification code found. Please request a new one.',
        'NO_VERIFICATION_CODE',
      );
    }

    if (new Date() > user.emailVerificationExpiry) {
      throw new BadRequestException(
        'Verification code has expired. Please request a new one.',
        'CODE_EXPIRED',
      );
    }

    if (verifyEmailDto.verificationCode !== user.emailVerificationCode) {
      // SECURITY (audit M-7): per-account brute-force lockout. After
      // MAX_VERIFY_ATTEMPTS wrong codes we INVALIDATE the code entirely,
      // forcing the user to request a fresh one — so an attacker can never
      // grind the 6-digit space against a single stored code.
      const MAX_VERIFY_ATTEMPTS = 5;
      const attempts = user.failedVerificationAttempts + 1;
      const exhausted = attempts >= MAX_VERIFY_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: exhausted
          ? {
              failedVerificationAttempts: 0,
              emailVerificationCode: null,
              emailVerificationExpiry: null,
            }
          : { failedVerificationAttempts: attempts },
      });
      throw new BadRequestException(
        exhausted
          ? 'Too many incorrect attempts. Please request a new verification code.'
          : 'Invalid verification code.',
        exhausted ? 'CODE_INVALIDATED' : 'INVALID_CODE',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
        failedVerificationAttempts: 0,
      },
    });

    const authToken = this.generateTokens(
      updated.id,
      updated.email,
      updated.role,
      updated.tokenVersion,
    );

    return {
      message: 'Email verified successfully',
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        isEmailVerified: updated.isEmailVerified,
        verificationStatus: updated.verificationStatus,
      },
      authToken,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Resend verification code
  // ─────────────────────────────────────────────────────────────────────────────

  async resendVerification(
    dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.deletedAt) {
      // Return same message to avoid user enumeration
      return { message: 'If that email exists, a new code has been sent.' };
    }

    if (user.isEmailVerified) {
      throw new BadRequestException(
        'Email is already verified.',
        'ALREADY_VERIFIED',
      );
    }

    const code = this.generateOtp();
    const codeExpiry = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCode: code,
        emailVerificationExpiry: codeExpiry,
      },
    });

    // A mail-provider outage must not 500 this endpoint, and it must not
    // change the response either — a 503 only when the account exists
    // would let an attacker enumerate accounts during outages. The code
    // is already stored, so a later resend delivers it once mail is back.
    // MailService logs the SMTP failure server-side.
    await this.mailService
      .sendVerificationEmail(user.email, user.fullName, code)
      .catch(() => undefined);

    return { message: 'If that email exists, a new code has been sent.' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Forgot password — send reset link via email
  // ─────────────────────────────────────────────────────────────────────────────

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: forgotPasswordDto.email },
    });

    // Always return the same message to avoid user enumeration
    if (!user || user.deletedAt) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const resetToken = this.jwtService.sign(
      // `tv` (audit L-2) binds the token to the current password state.
      // resetPassword bumps tokenVersion, so a reset link is single-use —
      // replaying it after a successful reset fails the tv check below.
      { sub: user.id, purpose: 'password-reset', tv: user.tokenVersion },
      {
        secret: requiredSecret('JWT_RESET_SECRET'),
        expiresIn: RESET_TOKEN_TTL_S,
      },
    );

    const frontendUrl = env.frontendUrl;
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Same contract as resendVerification: swallow mail-provider
    // failures (logged inside MailService) so the response stays
    // identical whether or not the account exists.
    await this.mailService
      .sendPasswordResetEmail(user.email, user.fullName, resetUrl)
      .catch(() => undefined);

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Reset password
  // ─────────────────────────────────────────────────────────────────────────────

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    let decoded: { sub: string; purpose?: string; tv?: number };

    try {
      decoded = this.jwtService.verify(resetPasswordDto.token, {
        secret: requiredSecret('JWT_RESET_SECRET'),
      });
    } catch {
      throw new BadRequestException(
        'Invalid or expired reset token.',
        'INVALID_RESET_TOKEN',
      );
    }

    if (decoded.purpose !== 'password-reset') {
      throw new BadRequestException(
        'Invalid reset token.',
        'INVALID_RESET_TOKEN',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.sub },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    // SECURITY (audit L-2): single-use. Once this account has been reset (or
    // the password changed), tokenVersion moved on and an old/replayed link
    // no longer matches.
    if ((decoded.tv ?? 0) !== user.tokenVersion) {
      throw new BadRequestException(
        'This reset link has already been used or is no longer valid.',
        'INVALID_RESET_TOKEN',
      );
    }

    const hashedPassword = await bcrypt.hash(
      resetPasswordDto.newPassword,
      BCRYPT_COST,
    );

    // Bump tokenVersion (audit M-6 + L-2): invalidates every existing
    // session AND this very reset link.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        tokenVersion: { increment: 1 },
      },
    });

    return { message: 'Password reset successfully' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Refresh token
  // ─────────────────────────────────────────────────────────────────────────────

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthTokenDto> {
    try {
      const decoded = this.jwtService.verify<{ sub: string; tv?: number }>(
        refreshTokenDto.refreshToken,
        { secret: requiredSecret('JWT_REFRESH_SECRET') },
      );

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      // SECURITY (audit M-5): a deactivated / deleted account must not be
      // able to keep minting fresh access tokens by refreshing.
      if (!user || user.deletedAt || !user.isActive) {
        throw new UnauthorizedException('User not found');
      }

      // SECURITY (audit M-6): reject a refresh token issued before the
      // last password reset / change (its `tv` is now stale).
      if ((decoded.tv ?? 0) !== user.tokenVersion) {
        throw new UnauthorizedException('Session has been revoked');
      }

      return this.generateTokens(
        user.id,
        user.email,
        user.role,
        user.tokenVersion,
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Change password (authenticated — requires current password)
  // ─────────────────────────────────────────────────────────────────────────────

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const passwordMatch = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException(
        'Current password is incorrect.',
        'INVALID_CURRENT_PASSWORD',
      );
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password.',
        'SAME_PASSWORD',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_COST);
    // Bump tokenVersion (audit M-6): changing your password logs out every
    // other existing session.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        tokenVersion: { increment: 1 },
      },
    });

    return { message: 'Password changed successfully' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private generateOtp(): string {
    // SECURITY (audit M-7): cryptographically-secure RNG, not Math.random.
    return randomInt(100_000, 1_000_000).toString();
  }

  private generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    tokenVersion: number,
  ): AuthTokenDto {
    // `tv` (audit M-6) rides in both tokens so a password reset/change can
    // bump User.tokenVersion and instantly invalidate every prior session.
    const accessToken = this.jwtService.sign(
      { sub: userId, email, role, tv: tokenVersion },
      {
        secret: requiredSecret('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, tv: tokenVersion },
      {
        secret: requiredSecret('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    };
  }
}

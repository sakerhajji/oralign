import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { requiredSecret } from '../../common/config/required-secret';

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

    const hashedPassword = await bcrypt.hash(signUpDto.password, BCRYPT_COST);
    const code = this.generateOtp();
    const codeExpiry = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

    const user = await this.prisma.user.create({
      data: {
        email: signUpDto.email,
        fullName: signUpDto.fullName,
        passwordHash: hashedPassword,
        phone: signUpDto.phone,
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

    const authToken = this.generateTokens(user.id, user.email, user.role);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      verificationStatus: user.verificationStatus,
      avatarUrl: user.avatarUrl ?? undefined,
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
      throw new UnauthorizedException('Email not found', 'EMAIL_NOT_FOUND');
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

      throw new UnauthorizedException(
        shouldLock
          ? 'Account locked due to too many failed attempts. Try again in 15 minutes.'
          : `Incorrect password. ${MAX_ATTEMPTS - newFailedAttempts} attempt${MAX_ATTEMPTS - newFailedAttempts !== 1 ? 's' : ''} remaining.`,
        shouldLock ? 'ACCOUNT_LOCKED' : 'INVALID_PASSWORD',
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

    const authToken = this.generateTokens(user.id, user.email, user.role);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      verificationStatus: user.verificationStatus,
      avatarUrl: user.avatarUrl ?? undefined,
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

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isEmailVerified) {
      // Already verified — still return tokens so the client can complete the flow
      const authToken = this.generateTokens(user.id, user.email, user.role);
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
      throw new BadRequestException(
        'Invalid verification code.',
        'INVALID_CODE',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
      },
    });

    const authToken = this.generateTokens(
      updated.id,
      updated.email,
      updated.role,
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

    if (!user) {
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

    await this.mailService.sendVerificationEmail(
      user.email,
      user.fullName,
      code,
    );

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
      { sub: user.id, purpose: 'password-reset' },
      {
        secret: requiredSecret('JWT_RESET_SECRET'),
        expiresIn: RESET_TOKEN_TTL_S,
      },
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    await this.mailService.sendPasswordResetEmail(
      user.email,
      user.fullName,
      resetUrl,
    );

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Reset password
  // ─────────────────────────────────────────────────────────────────────────────

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    let decoded: { sub: string; purpose?: string };

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

    const hashedPassword = await bcrypt.hash(
      resetPasswordDto.newPassword,
      BCRYPT_COST,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword },
    });

    return { message: 'Password reset successfully' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Refresh token
  // ─────────────────────────────────────────────────────────────────────────────

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthTokenDto> {
    try {
      const decoded = this.jwtService.verify<{ sub: string }>(
        refreshTokenDto.refreshToken,
        { secret: requiredSecret('JWT_REFRESH_SECRET') },
      );

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user || user.deletedAt) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(user.id, user.email, user.role);
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
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private generateOtp(): string {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
  }

  private generateTokens(
    userId: string,
    email: string,
    role: UserRole,
  ): AuthTokenDto {
    const accessToken = this.jwtService.sign(
      { sub: userId, email, role },
      {
        secret: requiredSecret('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId },
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

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { requiredSecret } from '../../common/config/required-secret';
import { isUserRole } from '../../common/access/caller';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requiredSecret('JWT_SECRET'),
    });
  }

  /**
   * The signature/expiry are already verified by passport-jwt. This is the
   * ONE place the raw claims become a typed principal.
   *
   * The role is resolved from the DATABASE, not from the token. A token is
   * a 15-minute snapshot, so trusting its `role` claim meant an account
   * whose role changed mid-session was authorized against a stale role:
   *   • promote a dentist to admin → /auth/me (read from the DB) renders
   *     the whole admin dashboard, while every admin API call still carried
   *     `role: dentist` and RolesGuard answered 403. The UI said admin, the
   *     API said forbidden, and nothing looked misconfigured.
   *   • the mirror case is worse: an account demoted, blocked or archived
   *     kept full access until its token expired.
   *
   * So this does what `SocketAuthenticator` (common/ws/socket-auth.ts) has
   * always done for WebSockets — same three checks, same order — and the
   * two transports can no longer disagree about who the caller is:
   *   1. the account still exists, is not archived and is not blocked;
   *   2. `tokenVersion` still matches, so the revocation that
   *      password change / reset already performs finally applies to REST
   *      as well (it previously only bit on the WS handshake);
   *   3. role + e-mail come from the row, so a role change takes effect on
   *      the very next request without forcing a re-login.
   *
   * Cost is one primary-key lookup per request on an already-hot row —
   * the same lookup the socket handshake does.
   */
  async validate(
    payload: Omit<JwtPayload, 'role'> & { role: unknown },
  ): Promise<JwtPayload> {
    // Reject a malformed role claim before touching the DB.
    if (!isUserRole(payload.role)) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        email: true,
        role: true,
        isActive: true,
        deletedAt: true,
        tokenVersion: true,
      },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('Account is no longer active');
    }
    if ((payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session revoked. Please sign in again.');
    }

    return { ...payload, email: user.email, role: user.role };
  }
}

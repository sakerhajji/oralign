import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { requiredSecret } from '../config/required-secret';

/** The principal attached to an authenticated socket (`client.data.user`). */
export interface SocketUser {
  userId: string;
  role: string;
}

interface AccessTokenPayload {
  sub: string;
  role: string;
  /** tokenVersion at issue time — bumped on password change / reset. */
  tv?: number;
  /** JWT expiry, seconds since epoch. */
  exp?: number;
}

/**
 * ONE handshake authenticator for every Socket.IO gateway.
 *
 * Previously each of the three gateways (support chat, treatment chat,
 * dashboard) carried its own copy of: token extraction, JwtService
 * construction, verify, `client.data.user` shaping and error/disconnect
 * handling — and none of them checked anything after the initial verify.
 * That meant a revoked / deactivated user's already-open socket kept
 * receiving live chat events for as long as it stayed connected, which
 * silently undermined the REST-side revocation (tokenVersion) that the
 * security audit added.
 *
 * This helper:
 *   1. extracts the bearer token from `auth.token` or the Authorization
 *      header (same precedence the gateways used);
 *   2. verifies the JWT signature/expiry;
 *   3. re-checks the user row: still active, `tokenVersion` unchanged;
 *   4. schedules a hard disconnect at the token's `exp` so the client must
 *      reconnect with a fresh token (the frontend already re-runs
 *      `ensureValidAccessToken()` on every reconnect), which caps the
 *      window for a revoked session at the access-token lifetime;
 *   5. attaches the typed principal to `client.data.user`.
 *
 * On any failure it emits `error` and disconnects — identical wire
 * behaviour to the copies it replaces.
 */
@Injectable()
export class SocketAuth {
  private readonly logger = new Logger(SocketAuth.name);
  private readonly jwt = new JwtService({ secret: requiredSecret('JWT_SECRET') });

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Authenticate the connecting socket. Resolves to the principal, or
   * `null` after having disconnected the client (caller just returns).
   */
  async authenticate(client: Socket, scope: string): Promise<SocketUser | null> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        this.tokenFromHeader(client.handshake.headers.authorization);
      if (!token) return this.reject(client, 'No auth token');

      const payload = this.jwt.verify<AccessTokenPayload>(token);

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isActive: true, tokenVersion: true, deletedAt: true },
      });
      if (!user || user.deletedAt || !user.isActive) {
        return this.reject(client, 'Account is not active');
      }
      if ((payload.tv ?? 0) !== user.tokenVersion) {
        return this.reject(client, 'Session revoked');
      }

      // Cap the socket's life at the token's life. Cleared on disconnect so
      // a short-lived socket doesn't keep a timer (and the Socket object)
      // alive until the token would have expired.
      if (payload.exp) {
        const msLeft = payload.exp * 1000 - Date.now();
        if (msLeft <= 0) return this.reject(client, 'Token expired');
        const timer = setTimeout(
          () => client.disconnect(true),
          Math.min(msLeft, 2_147_483_647),
        );
        client.once('disconnect', () => clearTimeout(timer));
      }

      const principal: SocketUser = { userId: payload.sub, role: payload.role };
      (client.data as { user?: SocketUser }).user = principal;
      return principal;
    } catch (err) {
      this.logger.warn(`${scope} socket auth failed: ${(err as Error).message}`);
      return this.reject(client, 'Invalid auth');
    }
  }

  /** The principal set by `authenticate()`, or undefined on an unauthenticated socket. */
  static user(client: Socket): SocketUser | undefined {
    return (client.data as { user?: SocketUser } | undefined)?.user;
  }

  private reject(client: Socket, message: string): null {
    client.emit('error', { message });
    client.disconnect(true);
    return null;
  }

  private tokenFromHeader(auth?: string): string | undefined {
    if (!auth) return undefined;
    const [scheme, value] = auth.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
  }
}

import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { UserRole } from '@prisma/client';
import { requiredSecret } from '../../common/config/required-secret';

interface SocketUser {
  userId: string;
  role: UserRole;
}

/**
 * Lightweight broadcast gateway for the admin + doctor dashboards.
 *
 * We do NOT push full payloads over the wire — the cached aggregate
 * blobs are heavy and easy to compute on demand. Instead we emit a
 * tiny "stats:invalidate" envelope with a scope hint and let the
 * frontend invalidate its React-Query cache, which re-fetches once
 * (deduplicated across components).
 *
 * Rooms:
 *   • admins:all           — every admin / super_admin
 *   • doctor:<doctorId>    — the single doctor's own dashboard
 *
 * Clients auto-join the appropriate room on connect, scoped to their
 * role + sub. No client-side join messages needed.
 */
@WebSocketGateway({
  namespace: '/dashboard',
  cors: { origin: true, credentials: true },
})
export class DashboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  private readonly jwt = new JwtService({
    secret: requiredSecret('JWT_SECRET'),
  });

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        this.tokenFromHeader(client.handshake.headers.authorization);
      if (!token) {
        client.emit('error', { message: 'No auth token' });
        client.disconnect(true);
        return;
      }
      const payload = this.jwt.verify<{
        sub: string;
        role: UserRole;
      }>(token);
      const user: SocketUser = { userId: payload.sub, role: payload.role };
      client.data.user = user;

      if (
        user.role === UserRole.admin ||
        user.role === UserRole.super_admin
      ) {
        await client.join('admins:all');
      }
      if (user.role === UserRole.dentist) {
        await client.join(this.doctorRoom(user.userId));
      }
    } catch (err) {
      this.logger.warn(`Dashboard socket auth failed: ${(err as Error).message}`);
      client.emit('error', { message: 'Invalid auth' });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    /* socket.io leaves rooms automatically */
  }

  // ─── Broadcast API ────────────────────────────────────────────────

  /**
   * Tell every admin browser to refetch its dashboard caches. Called
   * from the events listener after any platform-wide write.
   */
  broadcastAdminInvalidate(scope: 'kpis' | 'analytics' | 'all' = 'all'): void {
    this.server.to('admins:all').emit('stats:invalidate', { scope });
  }

  /**
   * Tell ONE doctor's browser(s) to refetch. Used for per-doctor
   * writes (their own order, their own payment) — admins see the
   * platform-wide event instead.
   */
  broadcastDoctorInvalidate(
    doctorId: string,
    scope: 'kpis' | 'packs' | 'all' = 'all',
  ): void {
    this.server.to(this.doctorRoom(doctorId)).emit('stats:invalidate', {
      scope,
    });
  }

  /**
   * Tell everyone the slider was edited. Doctors will refetch the
   * /slider-media/active list and the carousel updates without a
   * page reload.
   */
  broadcastSliderChanged(): void {
    this.server.emit('slider:changed');
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private doctorRoom(id: string): string {
    return `doctor:${id}`;
  }

  private tokenFromHeader(auth?: string): string | undefined {
    if (!auth) return undefined;
    const [scheme, value] = auth.split(' ');
    return scheme?.toLowerCase() === 'bearer' ? value : auth;
  }
}

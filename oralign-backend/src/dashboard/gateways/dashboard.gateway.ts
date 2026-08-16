import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRole } from '@prisma/client';
import { SocketAuth } from '../../common/ws/socket-auth';
import { socketCors } from '../../common/config/cors';

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
  cors: socketCors,
})
export class DashboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  constructor(private readonly socketAuth: SocketAuth) {}

  async handleConnection(client: Socket) {
    // Handshake auth (token, revocation, expiry cap) is shared across every
    // gateway — see common/ws/socket-auth.ts. Null means already rejected.
    const user = await this.socketAuth.authenticate(client, 'dashboard');
    if (!user) return;

    if (user.role === UserRole.admin || user.role === UserRole.super_admin) {
      await client.join('admins:all');
    }
    if (user.role === UserRole.dentist) {
      await client.join(this.doctorRoom(user.userId));
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

}

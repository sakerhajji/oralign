import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { requiredSecret } from '../../common/config/required-secret';

interface SocketUser {
  userId: string;
  role: UserRole;
}

/**
 * Real-time treatment-plan chat + plan-lifecycle gateway.
 *
 * Clients connect to namespace `/treatment-chat` with a JWT in the
 * handshake (`auth.token`), call `join` with the ORDER they're viewing,
 * and listen for these events:
 *
 *   • message:new      — a new chat message was posted (any plan version
 *                        in this order).
 *   • message:deleted  — a message / attachment was soft-deleted.
 *   • plan:changed     — a treatment plan under this order was created,
 *                        updated, marked ready, approved, or rejected.
 *                        The frontend invalidates its plan list cache.
 *
 * The conversation is ORDER-scoped (one thread per order, shared across
 * every plan version) — so rooms are keyed by `order:<orderId>`, not
 * `tp:<planId>` as before.
 */
@WebSocketGateway({
  namespace: '/treatment-chat',
  cors: { origin: true, credentials: true },
})
export class TreatmentChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TreatmentChatGateway.name);
  private readonly jwt = new JwtService({
    secret: requiredSecret('JWT_SECRET'),
  });

  constructor(private readonly prisma: PrismaService) {}

  // ─── Connection lifecycle ─────────────────────────────────────────────────

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
      // Attach to socket for later checks. typed via `data`.
      client.data.user = user;
    } catch (err) {
      client.emit('error', { message: 'Invalid auth' });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    /* nothing to clean up — rooms auto-leave */
  }

  // ─── Client events ────────────────────────────────────────────────────────

  /**
   * Client asks to subscribe to an order's chat + plan-events room. We
   * re-verify the caller can read the order before letting them join.
   *
   * Backward-compat: clients that still send `treatmentPlanId` get
   * silently rewritten to the order that owns that plan, so older
   * frontend builds don't break.
   */
  @SubscribeMessage('join')
  async onJoin(
    @MessageBody() data: { orderId?: string; treatmentPlanId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user) return { ok: false, reason: 'invalid-request' };

    const orderId = await this.resolveOrderId(data);
    if (!orderId) return { ok: false, reason: 'invalid-request' };

    const allowed = await this.canReadOrder(orderId, user);
    if (!allowed) return { ok: false, reason: 'forbidden' };
    await client.join(this.room(orderId));
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async onLeave(
    @MessageBody() data: { orderId?: string; treatmentPlanId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const orderId = await this.resolveOrderId(data);
    if (orderId) await client.leave(this.room(orderId));
    return { ok: true };
  }

  // ─── Server-side broadcast API ────────────────────────────────────────────

  broadcastNewMessage(orderId: string, message: unknown) {
    this.server.to(this.room(orderId)).emit('message:new', message);
  }

  broadcastMessageDeleted(orderId: string, messageId: string) {
    this.server
      .to(this.room(orderId))
      .emit('message:deleted', { id: messageId });
  }

  /**
   * Notify everyone in the order room that a treatment plan was created
   * / updated / marked ready / approved / rejected. The frontend listens
   * for this and invalidates its plan list query so the doctor sees the
   * new plan immediately (no hard-refresh required).
   */
  broadcastPlanChanged(
    orderId: string,
    payload: {
      type: 'created' | 'updated' | 'ready' | 'approved' | 'rejected';
      planId: string;
    },
  ) {
    this.server
      .to(this.room(orderId))
      .emit('plan:changed', { orderId, ...payload });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private room(orderId: string) {
    return `order:${orderId}`;
  }

  private tokenFromHeader(auth?: string): string | undefined {
    if (!auth) return undefined;
    const [scheme, value] = auth.split(' ');
    return scheme?.toLowerCase() === 'bearer' ? value : auth;
  }

  /** Accept either `orderId` directly or a `treatmentPlanId` for back-compat. */
  private async resolveOrderId(data: {
    orderId?: string;
    treatmentPlanId?: string;
  }): Promise<string | null> {
    if (data?.orderId) return data.orderId;
    if (data?.treatmentPlanId) {
      const plan = await this.prisma.treatmentPlan.findUnique({
        where: { id: data.treatmentPlanId },
        select: { orderId: true },
      });
      return plan?.orderId ?? null;
    }
    return null;
  }

  /** Order-level read gate — mirrors the REST `assertOrderReadable()`. */
  private async canReadOrder(
    orderId: string,
    user: SocketUser,
  ): Promise<boolean> {
    try {
      const order = await this.prisma.dentalOrder.findUnique({
        where: { id: orderId },
        select: {
          deletedAt: true,
          doctorId: true,
          assignedDesignerId: true,
        },
      });
      if (!order || order.deletedAt) return false;
      if (user.role === UserRole.admin || user.role === UserRole.super_admin)
        return true;
      if (user.role === UserRole.dentist && order.doctorId === user.userId)
        return true;
      if (
        user.role === UserRole.designer &&
        order.assignedDesignerId === user.userId
      )
        return true;
      return false;
    } catch (err) {
      this.logger.warn(`canReadOrder error: ${(err as Error).message}`);
      return false;
    }
  }
}

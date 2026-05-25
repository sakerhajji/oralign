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
import { SupportConversation, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { requiredSecret } from '../../common/config/required-secret';

interface SocketUser {
  userId: string;
  role: UserRole;
}

/**
 * Real-time support chat gateway.
 *
 * Clients connect to namespace `/support-chat` with a JWT in the
 * handshake (`auth.token`). Rooms:
 *
 *   • conv:<conversationId>  — the participants of one thread
 *   • admins:all             — every admin/super_admin user; receives
 *                              every new-conversation + updated event
 *                              so the admin queue is real-time without
 *                              joining each individual conv room.
 *
 * Doctors auto-join their own conv rooms on `join`. Admins can join
 * any conv room — we re-check `canRead` on every join request to
 * keep the gate honest.
 */
@WebSocketGateway({
  namespace: '/support-chat',
  cors: { origin: true, credentials: true },
})
export class SupportChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SupportChatGateway.name);
  private readonly jwt = new JwtService({
    secret: requiredSecret('JWT_SECRET'),
  });

  constructor(private readonly prisma: PrismaService) {}

  // ─── Connection lifecycle ───────────────────────────────────────

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

      // Admins auto-join the global admin room so they get the
      // conversation:new + conversation:updated broadcasts.
      if (user.role === UserRole.admin || user.role === UserRole.super_admin) {
        await client.join('admins:all');
      }
    } catch (err) {
      this.logger.warn(`Support socket auth failed: ${(err as Error).message}`);
      client.emit('error', { message: 'Invalid auth' });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    /* socket.io leaves rooms automatically */
  }

  // ─── Client events ──────────────────────────────────────────────

  /**
   * Subscribe to a single conversation's room. Re-checks RBAC every
   * time — doctors must own the conversation, admins always pass.
   */
  @SubscribeMessage('join')
  async onJoin(
    @MessageBody() data: { conversationId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !data?.conversationId) {
      return { ok: false, reason: 'invalid-request' };
    }
    const allowed = await this.canReadConversation(
      data.conversationId,
      user,
    );
    if (!allowed) return { ok: false, reason: 'forbidden' };
    await client.join(this.convRoom(data.conversationId));
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async onLeave(
    @MessageBody() data: { conversationId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.conversationId) {
      await client.leave(this.convRoom(data.conversationId));
    }
    return { ok: true };
  }

  // ─── Server-side broadcast API ──────────────────────────────────

  broadcastNewMessage(conversationId: string, message: unknown): void {
    this.server.to(this.convRoom(conversationId)).emit('message:new', message);
    // Also notify the admin queue so unread badge + last-message
    // preview refresh without reloading the page.
    this.server.to('admins:all').emit('conversation:touched', {
      conversationId,
    });
  }

  broadcastConversationCreated(conv: SupportConversation): void {
    // Doctor's own bubble + every admin's queue see the new thread.
    this.server.to('admins:all').emit('conversation:created', conv);
    // The doctor will receive `message:new` separately when they join
    // the conv room on bubble-open. No additional ping here.
  }

  broadcastConversationUpdated(conversationId: string): void {
    this.server
      .to(this.convRoom(conversationId))
      .emit('conversation:updated', { conversationId });
    this.server.to('admins:all').emit('conversation:updated', {
      conversationId,
    });
  }

  broadcastConversationDeleted(conversationId: string): void {
    // Doctor side gets a hard "this thread is gone" signal so the
    // open chat panel can close itself gracefully.
    this.server
      .to(this.convRoom(conversationId))
      .emit('conversation:deleted', { conversationId });
    this.server.to('admins:all').emit('conversation:deleted', {
      conversationId,
    });
  }

  broadcastReadBy(
    conversationId: string,
    payload: { readerId: string; readerRole: UserRole; readAt: string },
  ): void {
    this.server
      .to(this.convRoom(conversationId))
      .emit('read:by', { conversationId, ...payload });
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private convRoom(id: string): string {
    return `conv:${id}`;
  }

  private tokenFromHeader(auth?: string): string | undefined {
    if (!auth) return undefined;
    const [scheme, value] = auth.split(' ');
    return scheme?.toLowerCase() === 'bearer' ? value : auth;
  }

  private async canReadConversation(
    conversationId: string,
    user: SocketUser,
  ): Promise<boolean> {
    try {
      const conv = await this.prisma.supportConversation.findUnique({
        where: { id: conversationId },
        select: { doctorId: true, deletedAt: true },
      });
      if (!conv || conv.deletedAt) return false;
      if (user.role === UserRole.admin || user.role === UserRole.super_admin) {
        return true;
      }
      if (user.role === UserRole.dentist && conv.doctorId === user.userId) {
        return true;
      }
      return false;
    } catch (err) {
      this.logger.warn(
        `canReadConversation error: ${(err as Error).message}`,
      );
      return false;
    }
  }
}

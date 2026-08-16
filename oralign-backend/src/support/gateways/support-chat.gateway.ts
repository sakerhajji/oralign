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
import { Server, Socket } from 'socket.io';
import { SupportConversation, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SocketAuth, SocketUser } from '../../common/ws/socket-auth';
import { socketCors } from '../../common/config/cors';

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
  cors: socketCors,
})
export class SupportChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SupportChatGateway.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketAuth: SocketAuth,
  ) {}

  // ─── Connection lifecycle ───────────────────────────────────────

  async handleConnection(client: Socket) {
    // Handshake auth (token, revocation, expiry cap) is shared across every
    // gateway — see common/ws/socket-auth.ts. Null means already rejected.
    const user = await this.socketAuth.authenticate(client, 'support');
    if (!user) return;

    // Every user joins their own room so a doctor receives queue-level
    // pings (unread badge + conversation list) in real time even when
    // they aren't viewing a specific thread.
    await client.join(this.userRoom(user.userId));

    // Admins additionally join the global admin room so they get the
    // conversation:new + conversation:updated broadcasts for the queue.
    if (user.role === UserRole.admin || user.role === UserRole.super_admin) {
      await client.join('admins:all');
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
    const user = SocketAuth.user(client);
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

  broadcastNewMessage(
    conversationId: string,
    message: unknown,
    doctorId?: string,
  ): void {
    this.server.to(this.convRoom(conversationId)).emit('message:new', message);
    // Also notify the admin queue + the owning doctor so the unread badge
    // and last-message preview refresh without reloading the page — even
    // when that side isn't currently viewing the thread.
    this.server.to('admins:all').emit('conversation:touched', {
      conversationId,
    });
    if (doctorId) {
      this.server
        .to(this.userRoom(doctorId))
        .emit('conversation:touched', { conversationId });
    }
  }

  broadcastConversationCreated(conv: SupportConversation): void {
    // Doctor's own bubble + every admin's queue see the new thread.
    this.server.to('admins:all').emit('conversation:created', conv);
    // The doctor will receive `message:new` separately when they join
    // the conv room on bubble-open. No additional ping here.
  }

  broadcastConversationUpdated(conversationId: string, doctorId?: string): void {
    this.server
      .to(this.convRoom(conversationId))
      .emit('conversation:updated', { conversationId });
    this.server.to('admins:all').emit('conversation:updated', {
      conversationId,
    });
    if (doctorId) {
      this.server
        .to(this.userRoom(doctorId))
        .emit('conversation:updated', { conversationId });
    }
  }

  broadcastConversationDeleted(conversationId: string, doctorId?: string): void {
    // Doctor side gets a hard "this thread is gone" signal so the
    // open chat panel can close itself gracefully.
    this.server
      .to(this.convRoom(conversationId))
      .emit('conversation:deleted', { conversationId });
    this.server.to('admins:all').emit('conversation:deleted', {
      conversationId,
    });
    if (doctorId) {
      this.server
        .to(this.userRoom(doctorId))
        .emit('conversation:deleted', { conversationId });
    }
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

  private userRoom(id: string): string {
    return `user:${id}`;
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

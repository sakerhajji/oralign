import { Injectable } from '@nestjs/common';
import {
  PaymentRecordStatus,
  Prisma,
  TreatmentMessageType,
  TreatmentPlanStatus,
  UserRole,
} from '@prisma/client';
import { type Caller } from '../../common/access/caller';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import { PrismaService } from '../../prisma/prisma.service';

export interface OrderHistoryEntry {
  id: string;
  source: 'order' | 'treatment_plan' | 'quotation' | 'payment' | 'delivery';
  action: string;
  actor: {
    id: string | null;
    name: string;
    role: UserRole | null;
  } | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

type AuditPayload = {
  actorId: string;
  actorName: string | null;
  actorRole: UserRole;
  action: string;
  changes?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class OrderAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderAccess: OrderAccessPolicy,
  ) {}

  async entry(
    caller: Caller,
    action: string,
    changes?: Record<string, { from: unknown; to: unknown }> | null,
    metadata?: Record<string, unknown> | null,
  ): Promise<AuditPayload> {
    const actor = await this.prisma.user.findUnique({
      where: { id: caller.userId },
      select: { fullName: true },
    });

    return {
      actorId: caller.userId,
      actorName: actor?.fullName ?? null,
      actorRole: caller.role,
      action,
      ...(changes && Object.keys(changes).length > 0
        ? { changes: changes as Prisma.InputJsonValue }
        : {}),
      ...(metadata && Object.keys(metadata).length > 0
        ? { metadata: metadata as Prisma.InputJsonValue }
        : {}),
    };
  }

  async record(
    orderId: string,
    caller: Caller,
    action: string,
    changes?: Record<string, { from: unknown; to: unknown }> | null,
    metadata?: Record<string, unknown> | null,
  ): Promise<void> {
    const data = await this.entry(caller, action, changes, metadata);
    await this.prisma.orderAuditLog.create({ data: { orderId, ...data } });
  }

  diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [field, value] of Object.entries(after)) {
      if (value === undefined || field === 'auditLogs') continue;
      const from = this.plain(before[field]);
      const to = this.plain(value);
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes[field] = { from, to };
      }
    }
    return changes;
  }

  async list(orderId: string, caller: Caller): Promise<OrderHistoryEntry[]> {
    await this.orderAccess.requireReadable(orderId, caller);

    const [logs, plans, quotation, payments] = await Promise.all([
      this.prisma.orderAuditLog.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.treatmentPlan.findMany({
        where: { orderId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          version: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          approvedAt: true,
          rejectedAt: true,
          createdById: true,
          createdByName: true,
          createdBy: { select: { fullName: true, role: true } },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              type: true,
              message: true,
              createdAt: true,
              senderId: true,
              senderName: true,
              senderRole: true,
              sender: { select: { fullName: true, role: true } },
            },
          },
        },
      }),
      this.prisma.quotation.findFirst({
        where: { orderId },
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          totalTtc: true,
          currency: true,
          createdAt: true,
          sentAt: true,
          approvedAt: true,
          rejectedAt: true,
          rejectionReason: true,
          createdById: true,
          createdByName: true,
          createdBy: { select: { fullName: true, role: true } },
          approvedById: true,
          approvedBy: { select: { fullName: true, role: true } },
          rejectedById: true,
          rejectedBy: { select: { fullName: true, role: true } },
          stepBatches: {
            where: { deliveredAt: { not: null } },
            select: {
              id: true,
              batchNumber: true,
              fromStep: true,
              toStep: true,
              unlockedAt: true,
              deliveredAt: true,
              deliveredById: true,
              deliveredBy: { select: { fullName: true, role: true } },
            },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          purpose: true,
          amount: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          paidAt: true,
          rejectedAt: true,
          rejectionReason: true,
          installment: { select: { installmentNumber: true } },
          initiatedById: true,
          initiatedBy: { select: { fullName: true, role: true } },
          confirmedById: true,
          confirmedBy: { select: { fullName: true, role: true } },
          rejectedById: true,
          rejectedBy: { select: { fullName: true, role: true } },
        },
      }),
    ]);

    const entries: OrderHistoryEntry[] = logs.map((log) => ({
      id: log.id,
      source: 'order',
      action: log.action,
      actor: this.actor(log.actorId, log.actorName, log.actorRole),
      changes: this.object(log.changes) as OrderHistoryEntry['changes'],
      metadata: this.object(log.metadata),
      createdAt: log.createdAt,
    }));

    for (const plan of plans) {
      const creator = this.actor(
        plan.createdById,
        plan.createdBy?.fullName ?? plan.createdByName,
        plan.createdBy?.role ?? null,
      );
      entries.push({
        id: `plan-created-${plan.id}`,
        source: 'treatment_plan',
        action: 'treatment_plan_created',
        actor: creator,
        changes: null,
        metadata: { planId: plan.id, version: plan.version, name: plan.name },
        createdAt: plan.createdAt,
      });

      for (const message of plan.messages) {
        entries.push({
          id: `plan-message-${message.id}`,
          source: 'treatment_plan',
          action: this.messageAction(message.type),
          actor: this.actor(
            message.senderId,
            message.sender?.fullName ?? message.senderName,
            message.sender?.role ?? message.senderRole,
          ),
          changes: null,
          metadata: {
            planId: plan.id,
            version: plan.version,
            messageType: message.type,
            ...(message.message
              ? { message: message.message.slice(0, 500) }
              : {}),
          },
          createdAt: message.createdAt,
        });
      }

      const hasApprovalMessage = plan.messages.some(
        (message) => message.type === TreatmentMessageType.approval,
      );
      const hasRejectionMessage = plan.messages.some(
        (message) => message.type === TreatmentMessageType.rejection,
      );
      if (plan.approvedAt && !hasApprovalMessage) {
        entries.push({
          id: `plan-approved-${plan.id}`,
          source: 'treatment_plan',
          action: 'treatment_plan_approved',
          actor: null,
          changes: null,
          metadata: { planId: plan.id, version: plan.version },
          createdAt: plan.approvedAt,
        });
      } else if (
        plan.rejectedAt &&
        !hasRejectionMessage &&
        plan.status === TreatmentPlanStatus.rejected
      ) {
        entries.push({
          id: `plan-rejected-${plan.id}`,
          source: 'treatment_plan',
          action: 'treatment_plan_rejected',
          actor: null,
          changes: null,
          metadata: { planId: plan.id, version: plan.version },
          createdAt: plan.rejectedAt,
        });
      }
    }

    if (quotation) {
      const quoteMeta = {
        quotationId: quotation.id,
        number: quotation.quotationNumber,
        amount: quotation.totalTtc,
        currency: quotation.currency,
      };
      const quoteCreator = this.actor(
        quotation.createdById,
        quotation.createdBy?.fullName ?? quotation.createdByName,
        quotation.createdBy?.role ?? null,
      );
      entries.push({
        id: `quote-created-${quotation.id}`,
        source: 'quotation',
        action: 'quotation_created',
        actor: quoteCreator,
        changes: null,
        metadata: quoteMeta,
        createdAt: quotation.createdAt,
      });
      if (quotation.sentAt) {
        entries.push({
          id: `quote-sent-${quotation.id}`,
          source: 'quotation',
          action: 'quotation_sent',
          actor: quoteCreator,
          changes: null,
          metadata: quoteMeta,
          createdAt: quotation.sentAt,
        });
      }
      if (quotation.approvedAt) {
        entries.push({
          id: `quote-approved-${quotation.id}`,
          source: 'quotation',
          action: 'quotation_approved',
          actor: this.actor(
            quotation.approvedById,
            quotation.approvedBy?.fullName,
            quotation.approvedBy?.role ?? null,
          ),
          changes: null,
          metadata: quoteMeta,
          createdAt: quotation.approvedAt,
        });
      }
      if (quotation.rejectedAt) {
        entries.push({
          id: `quote-rejected-${quotation.id}`,
          source: 'quotation',
          action: 'quotation_rejected',
          actor: this.actor(
            quotation.rejectedById,
            quotation.rejectedBy?.fullName,
            quotation.rejectedBy?.role ?? null,
          ),
          changes: null,
          metadata: {
            ...quoteMeta,
            ...(quotation.rejectionReason
              ? { reason: quotation.rejectionReason }
              : {}),
          },
          createdAt: quotation.rejectedAt,
        });
      }

      for (const batch of quotation.stepBatches) {
        if (batch.unlockedAt) {
          entries.push({
            id: `batch-unlocked-${batch.id}`,
            source: 'delivery',
            action: 'batch_unlocked',
            actor: null,
            changes: null,
            metadata: {
              batchNumber: batch.batchNumber,
              fromStep: batch.fromStep,
              toStep: batch.toStep,
            },
            createdAt: batch.unlockedAt,
          });
        }
        if (batch.deliveredAt) {
          entries.push({
            id: `batch-delivered-${batch.id}`,
            source: 'delivery',
            action: 'batch_delivered',
            actor: this.actor(
              batch.deliveredById,
              batch.deliveredBy?.fullName,
              batch.deliveredBy?.role ?? null,
            ),
            changes: null,
            metadata: {
              batchNumber: batch.batchNumber,
              fromStep: batch.fromStep,
              toStep: batch.toStep,
            },
            createdAt: batch.deliveredAt,
          });
        }
      }
    }

    for (const payment of payments) {
      const paymentMeta = {
        paymentId: payment.id,
        amount: payment.amount.toString(),
        currency: payment.currency,
        method: payment.paymentMethod,
        purpose: payment.purpose,
        installmentNumber: payment.installment?.installmentNumber ?? null,
      };
      const initiator = this.actor(
        payment.initiatedById,
        payment.initiatedBy?.fullName,
        payment.initiatedBy?.role ?? null,
      );
      entries.push({
        id: `payment-started-${payment.id}`,
        source: 'payment',
        action: 'payment_started',
        actor: initiator,
        changes: null,
        metadata: paymentMeta,
        createdAt: payment.createdAt,
      });

      const terminalAction = this.paymentAction(payment.status);
      if (terminalAction) {
        const isRejected = payment.status === PaymentRecordStatus.rejected;
        entries.push({
          id: `payment-terminal-${payment.id}`,
          source: 'payment',
          action: terminalAction,
          actor: isRejected
            ? this.actor(
                payment.rejectedById,
                payment.rejectedBy?.fullName,
                payment.rejectedBy?.role ?? null,
              )
            : this.actor(
                payment.confirmedById ?? payment.initiatedById,
                payment.confirmedBy?.fullName ?? payment.initiatedBy?.fullName,
                payment.confirmedBy?.role ?? payment.initiatedBy?.role ?? null,
              ),
          changes: null,
          metadata: {
            ...paymentMeta,
            ...(payment.rejectionReason
              ? { reason: payment.rejectionReason }
              : {}),
          },
          createdAt: payment.paidAt ?? payment.rejectedAt ?? payment.updatedAt,
        });
      }
    }

    return entries
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 300);
  }

  private actor(
    id: string | null | undefined,
    name: string | null | undefined,
    role: UserRole | null | undefined,
  ): OrderHistoryEntry['actor'] {
    if (!id && !name) return null;
    return {
      id: id ?? null,
      name: name ?? 'Deleted account',
      role: role ?? null,
    };
  }

  private object(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private plain(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Prisma.Decimal) return value.toString();
    if (Array.isArray(value)) return value.map((item) => this.plain(item));
    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.plain(item)]),
      );
    }
    return value;
  }

  private messageAction(type: TreatmentMessageType): string {
    switch (type) {
      case TreatmentMessageType.approval:
        return 'treatment_plan_approved';
      case TreatmentMessageType.rejection:
        return 'treatment_plan_rejected';
      case TreatmentMessageType.file:
        return 'treatment_file_added';
      case TreatmentMessageType.treatment_result:
        return 'treatment_result_added';
      case TreatmentMessageType.system:
        return 'treatment_plan_updated';
      default:
        return 'treatment_message';
    }
  }

  private paymentAction(status: PaymentRecordStatus): string | null {
    switch (status) {
      case PaymentRecordStatus.success:
        return 'payment_succeeded';
      case PaymentRecordStatus.failed:
        return 'payment_failed';
      case PaymentRecordStatus.rejected:
        return 'payment_rejected';
      case PaymentRecordStatus.cancelled:
        return 'payment_cancelled';
      default:
        return null;
    }
  }
}

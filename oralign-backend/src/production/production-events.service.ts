import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryRecipient,
  Prisma,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { lookupActorName } from '../common/access/actor-snapshot';
import type { Caller } from '../common/access/caller';
import { OrderAccessPolicy } from '../common/access/order-access.policy';
import {
  ConflictException,
  NotFoundException,
} from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { batchCoverageNeeds, coverageDeclarations } from './batch-coverage';
import {
  CancelProductionEventDto,
  DeclareProductionEventDto,
  requireIdempotencyKey,
} from './dto';
import {
  countersFromProgress,
  PROGRESS_COUNTERS_SELECT,
  sheetVersionOf,
} from './kernel';
import {
  lockProductionOrder,
  projectBatches,
} from './production-batch-projection';
import {
  lockDeliveredNotices,
  reviseNoticesOnCancel,
  writeDeliveredNotices,
} from './production-outbox';
import {
  byArchThenId,
  orderFactsOf,
  projectionStateOf,
  writeProgress,
} from './production-state';
import {
  PRODUCTION_ERROR,
  type ProductionArchChoice,
  type ProductionCancelResult,
  type ProductionDeclareResult,
  type ProductionWarningCode,
} from './production.contract';
import { toEventView } from './production.mapper';
import {
  archesOf,
  assertCancelWindow,
  assertOwnEvent,
  assertPerformedAtInRange,
  assertStepRange,
  assertTechnicianGates,
  assertWarningsConfirmed,
  declarationFingerprint,
  isRestricted,
  LEGACY_DELIVERY_AUTO_CONFIRM,
  matchesFingerprint,
  requestedPerformedAt,
  resolvedQuantity,
  rowWarnings,
  sortWarnings,
  type DeclarationFingerprint,
} from './production.rules';
import {
  EVENT_VIEW_SELECT,
  STATE_EVENT_SELECT,
  STATE_ORDER_SELECT,
  type EventViewRow,
  type StateOrderRow,
} from './production.selects';

/** One declaration as the core reads it, whoever submits it (form or legacy button). */
export interface DeclareCommand {
  orderId: string;
  type: ProductionEventType;
  /** One row per arch, upper first. */
  arches: readonly ProductionArch[];
  stepFrom: number;
  stepTo: number;
  /** Per arch; omitted = one per step. */
  quantity?: number;
  /** Tunis wall clock of the act; both omitted = the server time. */
  performedDay?: string;
  performedTime?: string;
  note?: string | null;
  deliveredTo?: DeliveryRecipient | null;
  deliveredToName?: string | null;
  confirmWarnings?: readonly ProductionWarningCode[];
}

export interface DeclareOptions {
  /** The caller's Idempotency-Key; null for the legacy button (its batch status is the idempotency). */
  idempotencyKey: string | null;
  /** Warnings accepted on the caller's behalf (legacy button, §3.4). */
  autoConfirm?: readonly ProductionWarningCode[];
  /** createdByName snapshot (lookupActorName, read before the transaction). */
  actorName: string | null;
  now: Date;
  /**
   * The caller already holds the order lock in this transaction (the legacy
   * button): the core does not lock again. `order` is what the caller read
   * under that lock with nothing written since; the core reuses it instead
   * of reading the order a second time.
   */
  lockHeld?: { order?: StateOrderRow };
}

/** What a replay reads: the rows, then the case's counters, with ONE client. */
type ReplayReader = Pick<
  Prisma.TransactionClient,
  'productionEvent' | 'productionProgress'
>;

/** A step batch the legacy "Marquer livré" delivers (its range and number, never an amount). */
export interface LegacyBatchRef {
  id: string;
  batchNumber: number;
  fromStep: number;
  toStep: number;
}

/**
 * Lab production WRITES: declare an act (one row per arch) and cancel a
 * row (CONTRACT §3.2-§3.5). Each runs in ONE transaction that first takes
 * the order row lock, so two writers of one case serialise and every rule
 * reads committed state; the ProductionProgress projection, the step
 * batch projection (D2) and the notice outbox are written in the same
 * transaction. The rules themselves are pure (production.rules.ts).
 *
 * Query budget (asserted in the spec): a delivery declaration ≤ 12 calls
 * (2 before the transaction, run together: replay fast path, actor name),
 * a cancel ≤ 11. The replay lookups select flat columns: a nested
 * relation would still cost its statements on a miss, the usual case.
 */
@Injectable()
export class ProductionEventsService {
  private readonly logger = new Logger(ProductionEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrderAccessPolicy,
  ) {}

  /** POST production/events */
  async declare(
    dto: DeclareProductionEventDto,
    rawIdempotencyKey: string | undefined,
    caller: Caller,
    now: Date = new Date(),
  ): Promise<ProductionDeclareResult> {
    const key = requireIdempotencyKey(rawIdempotencyKey);
    const command = commandOf(dto);
    const fingerprint = fingerprintOf(command);

    // Fast path only: the authoritative replay lookup runs under the lock.
    // The actor name runs beside it, so a miss costs one round trip.
    const [prior, actorName] = await Promise.all([
      findByKey(this.prisma, caller.userId, key),
      lookupActorName(this.prisma, caller.userId),
    ]);
    if (prior.length > 0) {
      return replayOf(this.prisma, prior, fingerprint, caller, now);
    }

    let result: ProductionDeclareResult;
    try {
      result = await this.prisma.$transaction((tx) =>
        this.declareWithin(tx, command, caller, {
          idempotencyKey: key,
          actorName,
          now,
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The same key raced on ANOTHER order (another lock) and lost on
      // (createdById, idempotencyKey, arch): answer exactly as a replay
      // would, never with rows that do not match.
      const rows = await findByKey(this.prisma, caller.userId, key);
      if (rows.length === 0) throw error;
      return replayOf(this.prisma, rows, fingerprint, caller, now);
    }
    if (!result.replayed) {
      this.logger.log(
        `${command.type} steps ${command.stepFrom}-${command.stepTo} declared on order ${command.orderId} by ${caller.userId}`,
      );
    }
    return result;
  }

  /**
   * The declare core inside the caller's transaction (§3.2 steps 1-7).
   * It takes the order lock itself unless the caller says it holds it
   * (`lockHeld`), so the legacy "Marquer livré" endpoint runs it after its
   * own checks under the same lock: one delivery code path.
   */
  async declareWithin(
    tx: Prisma.TransactionClient,
    command: DeclareCommand,
    caller: Caller,
    options: DeclareOptions,
  ): Promise<ProductionDeclareResult> {
    const { now, lockHeld } = options;
    const { orderId, type } = command;
    if (!lockHeld) await lockProductionOrder(tx, orderId);

    // Replay BEFORE any rule: a double submit must never meet its own
    // rows as already_declared.
    if (options.idempotencyKey) {
      const prior = await findByKey(tx, caller.userId, options.idempotencyKey);
      if (prior.length > 0) {
        return replayOf(tx, prior, fingerprintOf(command), caller, now);
      }
    }

    const order =
      lockHeld?.order?.id === orderId
        ? lockHeld.order
        : await tx.dentalOrder.findUnique({
            where: { id: orderId },
            select: STATE_ORDER_SELECT,
          });
    if (!order || order.deletedAt)
      throw new NotFoundException('Order not found');
    const facts = orderFactsOf(order);
    this.access.assertCanProduce(
      {
        status: order.status,
        deletedAt: order.deletedAt,
        hasReleasedBatch: facts.hasReleasedBatch,
      },
      caller,
    );

    const range = { from: command.stepFrom, to: command.stepTo };
    assertStepRange(range);
    const restricted = isRestricted(caller);
    const performedAt =
      requestedPerformedAt(command.performedDay, command.performedTime) ?? now;
    assertPerformedAtInRange({
      performedAt,
      now,
      orderCreatedAt: order.createdAt,
      restricted,
    });

    const events = await tx.productionEvent.findMany({
      where: { orderId },
      select: STATE_EVENT_SELECT,
    });
    const rows = command.arches.map((arch) => {
      const input = {
        type,
        arch,
        range,
        quantitySent: command.quantity ?? null,
        restricted,
        treatedArches: facts.treated,
        planned: facts.planned,
        events,
        released: facts.released,
      };
      assertTechnicianGates(input);
      return { arch, warnings: rowWarnings(input) };
    });
    const note = command.note?.trim() || null;
    assertWarningsConfirmed({
      warnings: sortWarnings(rows.flatMap((row) => row.warnings)),
      confirmed: [
        ...(command.confirmWarnings ?? []),
        ...(options.autoConfirm ?? []),
      ],
      note,
    });

    const isDelivery = type === ProductionEventType.aligner_delivered;
    const declarationId = randomUUID();
    const created = await tx.productionEvent.createManyAndReturn({
      data: rows.map((row) => ({
        orderId,
        declarationId,
        type,
        arch: row.arch,
        stepFrom: range.from,
        stepTo: range.to,
        quantity: resolvedQuantity(range, command.quantity),
        performedAt,
        createdById: caller.userId,
        createdByName: options.actorName,
        createdByRole: caller.role,
        deliveredTo: isDelivery ? (command.deliveredTo ?? null) : null,
        deliveredToName: isDelivery
          ? command.deliveredToName?.trim() || null
          : null,
        note,
        warnings: row.warnings,
        origin: ProductionEventOrigin.declared,
        idempotencyKey: options.idempotencyKey,
      })),
      select: EVENT_VIEW_SELECT,
    });

    const after = [...events, ...created];
    const progress = await writeProgress(tx, orderId, after);
    if (isDelivery) {
      await projectBatches(tx, {
        orderId,
        actorId: caller.userId,
        state: projectionStateOf(order, facts, after),
      });
      await writeDeliveredNotices(tx, {
        orderId,
        declarationId,
        eventIds: created.map((row) => row.id),
        now,
      });
    }
    return {
      events: [...created]
        .sort(byArchThenId)
        .map((row) => toEventView(row, caller, now)),
      counters: countersFromProgress(progress),
      sheetVersion: sheetVersionOf(progress),
      replayed: false,
    };
  }

  /**
   * The legacy "Marquer livré" of a LIMITED pack's batch (§3.4), inside
   * the caller's transaction, under the order lock it already holds. One
   * aligner_delivered declaration per distinct range the batch NEEDS: per
   * treated arch, its range up to that arch's approved total
   * (batch-coverage.ts), so the button never records an aligner the plan
   * does not have (CONC-02). Each declaration is the declare core, so the
   * projection flips the batch and the outbox notifies as for the lab.
   *
   * A batch needing no step (wholly beyond the approved totals) gets no
   * declaration: the projection delivers it with the case's first live
   * delivery, and while there is none this is a 409.
   *
   * The order is read once, under the caller's lock, in the core's own
   * shape: the first declaration reuses it and nobody locks again.
   */
  async declareBatchDelivery(
    tx: Prisma.TransactionClient,
    input: { orderId: string; batch: LegacyBatchRef },
    caller: Caller,
    options: { actorName: string | null; now: Date },
  ): Promise<void> {
    const { orderId, batch } = input;
    const order = await tx.dentalOrder.findUnique({
      where: { id: orderId },
      select: STATE_ORDER_SELECT,
    });
    if (!order || order.deletedAt) {
      throw new NotFoundException('Order not found');
    }
    // The batch is unlocked: the case has a released batch.
    this.access.assertCanProduce(
      {
        status: order.status,
        deletedAt: order.deletedAt,
        hasReleasedBatch: true,
      },
      caller,
    );
    const facts = orderFactsOf(order);
    const declarations = coverageDeclarations(
      batchCoverageNeeds(batch, facts.treated, facts.planned),
    );

    if (declarations.length === 0) {
      // The projection from the state read under the lock: on its own it
      // would lock and read the order again.
      const events = await tx.productionEvent.findMany({
        where: { orderId },
        select: STATE_EVENT_SELECT,
      });
      const plan = await projectBatches(tx, {
        orderId,
        actorId: caller.userId,
        state: projectionStateOf(order, facts, events),
      });
      if (!plan.flips.some((flip) => flip.batchIds.includes(batch.id))) {
        throw new ConflictException(
          'This batch covers no aligner of the approved plan: it is delivered with the first delivery of the case.',
          PRODUCTION_ERROR.BATCH_NEEDS_NO_DELIVERY,
        );
      }
      return;
    }
    // Only the first declaration may reuse the order: each one writes the
    // progress, the batches and maybe the status before the next reads.
    let lockHeld: { order?: StateOrderRow } = { order };
    for (const declaration of declarations) {
      await this.declareWithin(
        tx,
        {
          orderId,
          type: ProductionEventType.aligner_delivered,
          arches: declaration.arches,
          stepFrom: declaration.fromStep,
          stepTo: declaration.toStep,
          deliveredTo: DeliveryRecipient.practitioner,
          note: `Lot ${batch.batchNumber} marqué livré (bouton « Marquer livré »)`,
        },
        caller,
        {
          // The caller's batch-status checks under the lock are the
          // idempotency: a fixed key per batch would replay cancelled rows
          // forever after a production cancel.
          idempotencyKey: null,
          autoConfirm: LEGACY_DELIVERY_AUTO_CONFIRM,
          actorName: options.actorName,
          now: options.now,
          lockHeld,
        },
      );
      lockHeld = {};
    }
  }

  /** PATCH production/events/:id/cancel (§3.3: checks in this ORDER). */
  async cancel(
    eventId: string,
    dto: CancelProductionEventDto,
    caller: Caller,
    now: Date = new Date(),
  ): Promise<ProductionCancelResult> {
    const actorName = await lookupActorName(this.prisma, caller.userId);
    const result = await this.prisma.$transaction(async (tx) => {
      // A relation filter, not a nested select: one statement. A missing
      // event and an archived case are the same 404.
      const target = await tx.productionEvent.findFirst({
        where: { id: eventId, order: { deletedAt: null } },
        select: { orderId: true },
      });
      if (!target) throw new NotFoundException('Production event not found');
      const { orderId } = target;
      await lockProductionOrder(tx, orderId);
      const order = await tx.dentalOrder.findUnique({
        where: { id: orderId },
        select: STATE_ORDER_SELECT,
      });
      const events = await tx.productionEvent.findMany({
        where: { orderId },
        select: EVENT_VIEW_SELECT,
      });
      const row = events.find((event) => event.id === eventId);
      if (!order || order.deletedAt || !row) {
        throw new NotFoundException('Production event not found');
      }
      const facts = orderFactsOf(order);

      // 2. Permissions first: the idempotent answer below carries notes,
      // reasons and names, which a technician must not read on any row.
      if (isRestricted(caller)) {
        this.access.assertCanReadForProduction(
          {
            status: order.status,
            deletedAt: order.deletedAt,
            hasReleasedBatch: facts.hasReleasedBatch,
            hasDeclaredEvent: events.some(
              (event) => event.origin === ProductionEventOrigin.declared,
            ),
          },
          caller,
        );
        assertOwnEvent(row, caller);
      }
      const declaration = events
        .filter((event) => event.declarationId === row.declarationId)
        .sort(byArchThenId);

      // 3. Idempotent: never rewrite a reason; cancel the other arch by its own id.
      if (row.cancelledAt) {
        return {
          events: declaration,
          counters: countersFromProgress(order.productionProgress),
          sheetVersion: sheetVersionOf(order.productionProgress),
        };
      }

      // 4. The technician's 24 h window, on every row this request cancels.
      assertCancelWindow(row, caller, now);
      const targets = [row];
      if (dto.alsoSibling) {
        const sibling = declaration.find(
          (event) => event.id !== row.id && event.cancelledAt === null,
        );
        if (sibling) {
          assertOwnEvent(sibling, caller);
          assertCancelWindow(sibling, caller, now);
          targets.push(sibling);
        }
      }
      const ids = new Set(targets.map((event) => event.id));
      const isDelivery = row.type === ProductionEventType.aligner_delivered;
      const notices = isDelivery
        ? await lockDeliveredNotices(tx, row.declarationId)
        : [];

      const cancelColumns = {
        cancelledAt: now,
        cancelledById: caller.userId,
        cancelledByName: actorName,
        cancelReason: dto.reason,
      };
      // The rows read live under the lock are exactly the ones this
      // request cancels; the guard keeps an earlier cancel untouched.
      await tx.productionEvent.updateMany({
        where: { id: { in: [...ids] }, cancelledAt: null },
        data: cancelColumns,
      });
      const after = events.map((event) =>
        ids.has(event.id) ? { ...event, ...cancelColumns } : event,
      );
      const progress = await writeProgress(tx, orderId, after);
      if (isDelivery) {
        await projectBatches(tx, {
          orderId,
          actorId: caller.userId,
          state: projectionStateOf(order, facts, after),
        });
        await reviseNoticesOnCancel(tx, {
          orderId,
          declarationId: row.declarationId,
          notices,
          cancelledEventIds: [...ids],
          declarationFullyCancelled: after
            .filter((event) => event.declarationId === row.declarationId)
            .every((event) => event.cancelledAt !== null),
          now,
        });
      }
      return {
        events: after.filter((event) => ids.has(event.id)).sort(byArchThenId),
        counters: countersFromProgress(progress),
        sheetVersion: sheetVersionOf(progress),
      };
    });
    return {
      events: result.events.map((event) => toEventView(event, caller, now)),
      counters: result.counters,
      sheetVersion: result.sheetVersion,
    };
  }
}

function commandOf(dto: DeclareProductionEventDto): DeclareCommand {
  const choice: ProductionArchChoice = dto.arch;
  return {
    orderId: dto.orderId,
    type: dto.type,
    arches: archesOf(choice),
    stepFrom: dto.stepFrom,
    stepTo: dto.stepTo,
    quantity: dto.quantity,
    performedDay: dto.performedDay,
    performedTime: dto.performedTime,
    note: dto.note ?? null,
    deliveredTo: dto.deliveredTo ?? null,
    deliveredToName: dto.deliveredToName ?? null,
    confirmWarnings: dto.confirmWarnings ?? [],
  };
}

function fingerprintOf(command: DeclareCommand): DeclarationFingerprint {
  return declarationFingerprint({
    orderId: command.orderId,
    type: command.type,
    arches: command.arches,
    range: { from: command.stepFrom, to: command.stepTo },
    quantity: command.quantity,
    deliveredTo: command.deliveredTo,
    deliveredToName: command.deliveredToName,
    performedAt: requestedPerformedAt(
      command.performedDay,
      command.performedTime,
    ),
  });
}

/** The caller's rows for a key (the unique index prefix): flat columns, one statement. */
function findByKey(
  client: ReplayReader,
  userId: string,
  key: string,
): Promise<EventViewRow[]> {
  return client.productionEvent.findMany({
    where: { createdById: userId, idempotencyKey: key },
    select: EVENT_VIEW_SELECT,
    orderBy: [{ arch: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Same declaration → the original rows, nothing written, with the case's
 * CURRENT counters (§3.2), read with the same client (under the lock in
 * the transaction); another one → 409.
 */
async function replayOf(
  client: ReplayReader,
  rows: readonly EventViewRow[],
  fingerprint: DeclarationFingerprint,
  caller: Caller,
  now: Date,
): Promise<ProductionDeclareResult> {
  if (!matchesFingerprint(fingerprint, rows)) {
    throw new ConflictException(
      'This Idempotency-Key was already used for another declaration.',
      PRODUCTION_ERROR.IDEMPOTENCY_KEY_REUSED,
    );
  }
  const progress = await client.productionProgress.findUnique({
    where: { orderId: rows[0].orderId },
    select: PROGRESS_COUNTERS_SELECT,
  });
  return {
    events: [...rows]
      .sort(byArchThenId)
      .map((row) => toEventView(row, caller, now)),
    counters: countersFromProgress(progress),
    sheetVersion: sheetVersionOf(progress),
    replayed: true,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

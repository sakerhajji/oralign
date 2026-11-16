import type { Caller } from '../../common/access/caller';
import { ConflictException } from '../../common/exceptions/app.exception';
import {
  SUPPLEMENTAL_AUDIT_ACTION,
  SUPPLEMENTAL_ERROR,
} from './supplemental.constants';
import {
  childAndParentRows,
  writeAudit,
  type AuditActor,
  type AuditMetadata,
} from './supplemental-audit';
import { creationDefaults, type ChildDefaults } from './supplemental-defaults';
import { buildEligibility } from './supplemental-eligibility';
import { blockedRequest } from './supplemental-guards';
import {
  findReplay,
  insertChild,
  nextOrderCode,
  releaseIdempotencyKey,
  type SupplementalTx,
} from './supplemental-order.repository';
import type {
  SupplementalCoverage,
  SupplementalOrderType,
  SupplementalParentSnapshot,
} from './supplemental.types';

/**
 * Creating a child, shared by "new request" and "rejected warranty → paid
 * replacement". Runs inside the caller's transaction, with the PARENT ROW
 * LOCKED: the lock serialises the open-request check, the code sequence
 * and the insert per case.
 */

/**
 * The replay of an idempotent creation: the live child this key already
 * created (returned as is), or null to go on creating. A key once used for
 * an archived draft is released first; a key reused for another case or
 * kind is a client bug (409).
 */
export async function claimIdempotencyKey(
  tx: SupplementalTx,
  creatorId: string,
  idempotencyKey: string,
  target: { parentId: string; type: SupplementalOrderType },
): Promise<string | null> {
  const replay = await findReplay(tx, creatorId, idempotencyKey);
  if (!replay) return null;
  if (
    replay.parentOrderId !== target.parentId ||
    replay.orderType !== target.type
  ) {
    throw new ConflictException(
      'This Idempotency-Key was already used for another request.',
      SUPPLEMENTAL_ERROR.IDEMPOTENCY_KEY_REUSED,
    );
  }
  if (!replay.archived) return replay.orderId;
  await releaseIdempotencyKey(tx, replay.requestId);
  return null;
}

export interface CreateChildInput {
  parent: SupplementalParentSnapshot;
  type: SupplementalOrderType;
  caller: Caller;
  actor: AuditActor;
  now: Date;
  idempotencyKey: string;
  /** Overrides of the kind's defaults / computed coverage (conversion). */
  defaults?: ChildDefaults;
  coverage?: SupplementalCoverage;
  /** Extra context for both audit rows. */
  auditMetadata?: AuditMetadata;
}

export interface CreatedChild {
  childId: string;
  orderCode: string;
  coverage: SupplementalCoverage;
}

/** 409 unless the case accepts a request of `type` now; then insert + audit. */
export async function createChildInTx(
  tx: SupplementalTx,
  input: CreateChildInput,
): Promise<CreatedChild> {
  const { parent, type, caller, actor, now } = input;
  const kind = buildEligibility(parent, { now, caller }).requests[type];
  if (kind.blockedReason) throw blockedRequest(kind.blockedReason);

  const coverage = input.coverage ?? {
    status: kind.coverageStatus,
    reason: kind.coverageReason,
  };
  const orderCode = await nextOrderCode(tx, parent.orderCode, type);
  const childId = await insertChild(tx, {
    parent,
    type,
    orderCode,
    defaults: input.defaults ?? creationDefaults(type, parent),
    coverage,
    creator: { id: actor.actorId, name: actor.actorName },
    idempotencyKey: input.idempotencyKey,
  });

  const context = { requestType: type, ...input.auditMetadata };
  await writeAudit(
    tx,
    actor,
    childAndParentRows({
      childId,
      parentId: parent.id,
      child: {
        action: SUPPLEMENTAL_AUDIT_ACTION.CREATED,
        metadata: {
          ...context,
          parentOrderId: parent.id,
          coverageStatus: coverage.status,
          coverageReason: coverage.reason,
        },
      },
      parent: {
        action: SUPPLEMENTAL_AUDIT_ACTION.CHILD_CREATED,
        metadata: { ...context, childOrderId: childId, orderCode },
      },
    }),
  );
  return { childId, orderCode, coverage };
}

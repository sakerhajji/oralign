import {
  ArchTreatment,
  OrderType,
  Prisma,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
  TreatmentPlanStatus,
  type SupplementalOrderRequest,
} from '@prisma/client';
import { orderInclude } from '../services/order.mapper';
import {
  ABANDONED_ORDER_STATUSES,
  ARCHIVED_KEY_PREFIX,
  SUPPLEMENTAL_CODE_SEQUENCE_DIGITS,
  SUPPLEMENTAL_CODE_SUFFIX,
  isSupplementalOrderType,
} from './supplemental.constants';
import type { ChildDefaults } from './supplemental-defaults';
import type { RequestDetails } from './supplemental-details';
import type {
  CoverageQuotation,
  SupplementalCoverage,
  SupplementalOrderType,
  SupplementalParentSnapshot,
  ToothContact,
  ToothSelection,
} from './supplemental.types';

/**
 * Every Prisma query of the supplemental flows. Functions take the client
 * explicitly (`this.prisma` or the transaction `tx`), so a service decides
 * what runs under which lock and a test hands in exactly the delegates a
 * query touches.
 */

export type SupplementalDb = Pick<
  Prisma.TransactionClient,
  'dentalOrder' | 'supplementalOrderRequest' | 'treatmentPlan'
>;
export type SupplementalTx = Prisma.TransactionClient;

// ── Read models ───────────────────────────────────────────────────────

export const supplementalChildInclude =
  Prisma.validator<Prisma.DentalOrderInclude>()({
    ...orderInclude,
    supplementalRequest: {
      omit: { idempotencyKey: true },
      include: {
        teeth: {
          select: { purpose: true, toothNumber: true },
          orderBy: [{ purpose: 'asc' }, { toothNumber: 'asc' }],
        },
        contacts: {
          select: {
            purpose: true,
            fromTooth: true,
            toTooth: true,
            amountMm: true,
          },
          orderBy: [{ purpose: 'asc' }, { fromTooth: 'asc' }],
        },
        convertedReplacementOrder: { select: { id: true, deletedAt: true } },
      },
    },
    parentOrder: {
      select: {
        id: true,
        orderCode: true,
        status: true,
        orderType: true,
        archTreatment: true,
        coverageStartedAt: true,
        coverageExpiresAt: true,
      },
    },
    // Set on a paid replacement accepted after a rejected warranty.
    warrantyConversion: { select: { id: true } },
  });

export type SupplementalChildRecord = Prisma.DentalOrderGetPayload<{
  include: typeof supplementalChildInclude;
}>;

/** A live child with its request and parent: what every rule and view reads. */
export type LoadedChild = Omit<
  SupplementalChildRecord,
  'orderType' | 'supplementalRequest' | 'parentOrder'
> & {
  orderType: SupplementalOrderType;
  supplementalRequest: NonNullable<
    SupplementalChildRecord['supplementalRequest']
  >;
  parentOrder: NonNullable<SupplementalChildRecord['parentOrder']>;
};

function isLoadedChild(
  order: SupplementalChildRecord | null,
): order is LoadedChild {
  return (
    order !== null &&
    isSupplementalOrderType(order.orderType) &&
    order.supplementalRequest !== null &&
    order.parentOrder !== null
  );
}

/** The pack snapshot of the case's quotation (CoverageQuotation). */
const packAllowanceSelect = Prisma.validator<Prisma.QuotationSelect>()({
  status: true,
  paymentStatus: true,
  treatmentValidityMonths: true,
  includedCorrections: true,
  isUnlimitedCorrections: true,
  maxStepsPerArch: true,
  isUnlimitedSteps: true,
});

const parentSnapshotInclude = Prisma.validator<Prisma.DentalOrderInclude>()({
  treatmentPlans: {
    where: { status: TreatmentPlanStatus.approved, deletedAt: null },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      approvedAt: true,
      totalUpperAligners: true,
      totalLowerAligners: true,
    },
  },
  quotation: { select: packAllowanceSelect },
  supplementalOrders: {
    where: { deletedAt: null },
    select: { id: true, orderType: true, status: true },
  },
  alignerDeliveries: {
    select: { toAligner: true },
    orderBy: { toAligner: 'desc' },
    take: 1,
  },
});

/**
 * The initial case as the pure rules read it, consumed corrections
 * included. Archived cases are left out unless `includeArchived` (a review
 * must still be possible on a request whose case was archived).
 */
export async function loadParentSnapshot(
  db: SupplementalDb,
  parentId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<SupplementalParentSnapshot | null> {
  const row = await db.dentalOrder.findFirst({
    where: { id: parentId, ...(includeArchived ? {} : { deletedAt: null }) },
    include: parentSnapshotInclude,
  });
  if (!row) return null;
  return {
    id: row.id,
    orderCode: row.orderCode,
    orderType: row.orderType,
    parentOrderId: row.parentOrderId,
    doctorId: row.doctorId,
    patientId: row.patientId,
    assignedDesignerId: row.assignedDesignerId,
    status: row.status,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    archTreatment: row.archTreatment,
    patientStage: row.patientStage,
    totalAligners: row.totalAligners,
    coverageStartedAt: row.coverageStartedAt,
    coverageExpiresAt: row.coverageExpiresAt,
    approvedPlans: row.treatmentPlans,
    quotation: row.quotation,
    children: row.supplementalOrders,
    deliveredUpTo: row.alignerDeliveries[0]?.toAligner ?? null,
    consumedCorrections: await countConsumedCorrections(db, row.id),
    correctionNumbers: await consumedCorrectionNumbers(db, row.id),
  };
}

export interface ConsumedCorrectionsOptions {
  /** Leave this child out (the one being decided or reopened). */
  excludeChildId?: string;
}

/**
 * The consumed included corrections of a case: its additional-aligner
 * children approved as included whose order was neither archived nor
 * abandoned (cancelled / rejected give the correction back; finished keeps
 * it). holdsCorrection (supplemental-coverage.policy.ts) is the same rule
 * on one loaded request.
 */
function consumedCorrectionsWhere(
  parentId: string,
  { excludeChildId }: ConsumedCorrectionsOptions,
): Prisma.SupplementalOrderRequestWhereInput {
  return {
    reviewStatus: SupplementalReviewStatus.approved,
    coverageStatus: SupplementalCoverageStatus.included,
    order: {
      parentOrderId: parentId,
      orderType: OrderType.additional_aligners,
      deletedAt: null,
      status: { notIn: [...ABANDONED_ORDER_STATUSES] },
      ...(excludeChildId ? { id: { not: excludeChildId } } : {}),
    },
  };
}

/**
 * THE count of included corrections a case has used. Eligibility,
 * submission, review and the admin override all check the allowance on
 * this one number.
 */
export function countConsumedCorrections(
  db: Pick<SupplementalDb, 'supplementalOrderRequest'>,
  parentId: string,
  options: ConsumedCorrectionsOptions = {},
): Promise<number> {
  return db.supplementalOrderRequest.count({
    where: consumedCorrectionsWhere(parentId, options),
  });
}

/**
 * The correction numbers those consumed corrections carry (a row approved
 * before numbering existed has none). The next number is derived from
 * them, never from the count: a correction given back in the middle would
 * otherwise hand a live number out twice.
 */
export async function consumedCorrectionNumbers(
  db: Pick<SupplementalDb, 'supplementalOrderRequest'>,
  parentId: string,
  options: ConsumedCorrectionsOptions = {},
): Promise<number[]> {
  const rows = await db.supplementalOrderRequest.findMany({
    where: {
      ...consumedCorrectionsWhere(parentId, options),
      correctionNumber: { not: null },
    },
    select: { correctionNumber: true },
  });
  return rows
    .map((row) => row.correctionNumber)
    .filter((number): number is number => number !== null);
}

/** The pack snapshot the allowance is read from (null: no quotation). */
export async function loadPackAllowance(
  db: Pick<SupplementalDb, 'dentalOrder'>,
  parentId: string,
): Promise<CoverageQuotation | null> {
  const row = await db.dentalOrder.findUnique({
    where: { id: parentId },
    select: { quotation: { select: packAllowanceSelect } },
  });
  return row?.quotation ?? null;
}

/** What an admin override reads about a child's request (null: none). */
export function loadCorrectionClaim(
  db: Pick<SupplementalDb, 'supplementalOrderRequest'>,
  childId: string,
): Promise<CorrectionClaim | null> {
  return db.supplementalOrderRequest.findUnique({
    where: { orderId: childId },
    select: {
      id: true,
      reviewStatus: true,
      coverageStatus: true,
      correctionNumber: true,
      submittedAt: true,
    },
  });
}

export type CorrectionClaim = Pick<
  SupplementalOrderRequest,
  'id' | 'reviewStatus' | 'coverageStatus' | 'correctionNumber' | 'submittedAt'
>;

export async function loadChild(
  db: SupplementalDb,
  childId: string,
): Promise<LoadedChild | null> {
  const order = await db.dentalOrder.findFirst({
    where: { id: childId, deletedAt: null },
    include: supplementalChildInclude,
  });
  return isLoadedChild(order) ? order : null;
}

/** The live children of a case visible to `scope` (OrderAccessPolicy.scope). */
export async function listChildren(
  db: SupplementalDb,
  parentId: string,
  scope: Prisma.DentalOrderWhereInput,
): Promise<LoadedChild[]> {
  const orders = await db.dentalOrder.findMany({
    where: { parentOrderId: parentId, deletedAt: null, ...scope },
    orderBy: { createdAt: 'desc' },
    include: supplementalChildInclude,
  });
  return orders.filter(isLoadedChild);
}

/** The parent id of a live child, read before the locks are taken. */
export async function findParentIdOf(
  db: SupplementalDb,
  childId: string,
): Promise<string | null> {
  const order = await db.dentalOrder.findFirst({
    where: { id: childId, deletedAt: null },
    select: { parentOrderId: true },
  });
  return order?.parentOrderId ?? null;
}

/** An approved, live plan of the case (the transfer-template source). */
export function findApprovedPlan(
  db: SupplementalDb,
  parentId: string,
  planId: string,
): Promise<{ id: string; version: number } | null> {
  return db.treatmentPlan.findFirst({
    where: {
      id: planId,
      orderId: parentId,
      status: TreatmentPlanStatus.approved,
      deletedAt: null,
    },
    select: { id: true, version: true },
  });
}

// ── Locks ─────────────────────────────────────────────────────────────

/**
 * Row lock on an order until the transaction ends. Convention, to stay
 * deadlock-free: when both are needed, the parent is locked before the
 * child.
 */
export async function lockOrder(
  tx: Pick<SupplementalTx, '$queryRaw'>,
  orderId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "DentalOrder" WHERE "id" = ${orderId} FOR UPDATE`;
}

// ── Idempotency ───────────────────────────────────────────────────────

export interface IdempotentReplay {
  requestId: string;
  orderId: string;
  parentOrderId: string | null;
  orderType: OrderType;
  archived: boolean;
}

/** The request `creatorId` already created with this key, if any. */
export async function findReplay(
  db: SupplementalDb,
  creatorId: string,
  idempotencyKey: string,
): Promise<IdempotentReplay | null> {
  const row = await db.supplementalOrderRequest.findUnique({
    where: {
      createdById_idempotencyKey: { createdById: creatorId, idempotencyKey },
    },
    select: {
      id: true,
      orderId: true,
      order: {
        select: { parentOrderId: true, orderType: true, deletedAt: true },
      },
    },
  });
  if (!row) return null;
  return {
    requestId: row.id,
    orderId: row.orderId,
    parentOrderId: row.order.parentOrderId,
    orderType: row.order.orderType,
    archived: row.order.deletedAt !== null,
  };
}

/**
 * Free a request's key (`archived_<requestId>_<key>`) when its draft is
 * archived, so the same browser may create a new request with it.
 */
export async function releaseIdempotencyKey(
  tx: SupplementalDb,
  requestId: string,
): Promise<void> {
  const { idempotencyKey } =
    await tx.supplementalOrderRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { idempotencyKey: true },
    });
  if (idempotencyKey.startsWith(ARCHIVED_KEY_PREFIX)) return;
  await tx.supplementalOrderRequest.update({
    where: { id: requestId },
    data: {
      idempotencyKey: `${ARCHIVED_KEY_PREFIX}${requestId}_${idempotencyKey}`,
    },
  });
}

// ── Order codes ───────────────────────────────────────────────────────

/**
 * `${stem}-NN` with NN one above the highest numeric suffix already used
 * (archived codes included, so a code is never handed out twice while its
 * row exists). Never a count: rows can be purged. Pure.
 */
export function nextSequentialCode(
  stem: string,
  existingCodes: readonly string[],
): string {
  const prefix = `${stem}-`;
  const highest = existingCodes
    .filter((code) => code.startsWith(prefix))
    .map((code) => code.slice(prefix.length))
    .filter((suffix) => /^\d+$/.test(suffix))
    .reduce((max, suffix) => Math.max(max, Number(suffix)), 0);
  return `${prefix}${String(highest + 1).padStart(SUPPLEMENTAL_CODE_SEQUENCE_DIGITS, '0')}`;
}

/** Call with the parent row locked: the lock serialises the sequence. */
export async function nextOrderCode(
  tx: SupplementalDb,
  parentCode: string,
  type: SupplementalOrderType,
): Promise<string> {
  const stem = `${parentCode}-${SUPPLEMENTAL_CODE_SUFFIX[type]}`;
  const rows = await tx.dentalOrder.findMany({
    where: { orderCode: { startsWith: `${stem}-` } },
    select: { orderCode: true },
  });
  return nextSequentialCode(
    stem,
    rows.map((row) => row.orderCode),
  );
}

// ── Writes ────────────────────────────────────────────────────────────

export interface NewChild {
  parent: Pick<
    SupplementalParentSnapshot,
    'id' | 'doctorId' | 'patientId' | 'assignedDesignerId'
  >;
  type: SupplementalOrderType;
  orderCode: string;
  defaults: ChildDefaults;
  coverage: SupplementalCoverage;
  creator: { id: string; name: string | null };
  idempotencyKey: string;
}

/**
 * The child order and its request. The child inherits the case's doctor,
 * patient and designer: it is one more step of the same case.
 */
export async function insertChild(
  tx: SupplementalDb,
  child: NewChild,
): Promise<string> {
  const { id } = await tx.dentalOrder.create({
    data: {
      orderCode: child.orderCode,
      doctorId: child.parent.doctorId,
      patientId: child.parent.patientId,
      assignedDesignerId: child.parent.assignedDesignerId,
      orderType: child.type,
      parentOrderId: child.parent.id,
      patientStage: child.defaults.patientStage,
      archTreatment: child.defaults.archTreatment,
      treatBothArch: child.defaults.archTreatment === ArchTreatment.both,
      supplementalRequest: {
        create: {
          ...child.defaults.answers,
          createdById: child.creator.id,
          createdByName: child.creator.name,
          idempotencyKey: child.idempotencyKey,
          coverageStatus: child.coverage.status,
          coverageReason: child.coverage.reason,
        },
      },
    },
    select: { id: true },
  });
  return id;
}

/** Replace the request's teeth and / or contacts (undefined: untouched). */
export async function replaceDetails(
  tx: SupplementalTx,
  requestId: string,
  { teeth, contacts }: Partial<RequestDetails>,
): Promise<void> {
  if (teeth) {
    await tx.supplementalToothSelection.deleteMany({ where: { requestId } });
    if (teeth.length > 0) {
      await tx.supplementalToothSelection.createMany({
        data: teeth.map((tooth: ToothSelection) => ({ requestId, ...tooth })),
      });
    }
  }
  if (contacts) {
    await tx.supplementalToothContact.deleteMany({ where: { requestId } });
    if (contacts.length > 0) {
      await tx.supplementalToothContact.createMany({
        data: contacts.map((contact: ToothContact) => ({
          requestId,
          ...contact,
        })),
      });
    }
  }
}

// Shared fixtures of the supplemental service specs. Named *.helper-spec.ts
// on purpose: the build excludes it like a spec (tsconfig.build "**/*spec.ts")
// and jest does not collect it as a suite (testRegex ".spec.ts").
import { HttpException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ArchTreatment,
  OrderStatus,
  OrderType,
  Prisma,
  QuotationPaymentStatus,
  QuotationStatus,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import { AppException } from '../../common/exceptions/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import { SupplementalAudit } from './supplemental-audit';
import type { SupplementalClock } from './supplemental-clock';
import { SupplementalOrderService } from './supplemental-order.service';
import { SupplementalReviewService } from './supplemental-review.service';

export const NOW = new Date('2026-06-15T10:00:00.000Z');
export const clock: SupplementalClock = { now: () => NOW };

export const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
export const otherDoctor: Caller = {
  userId: 'u-doc-2',
  role: UserRole.dentist,
};
export const designer: Caller = { userId: 'u-des', role: UserRole.designer };
export const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

export const PARENT_ID = 'parent-1';
export const PLAN_ID = '0b3c1d55-5d0f-4c1e-9a3e-2f7f2a6c9b10';
export const NEW_CHILD_ID = 'child-new';

type Row = Record<string, unknown>;

/** The initial case as loadParentSnapshot's query returns it. */
export function parentRow(over: Row = {}): Row {
  return {
    id: PARENT_ID,
    orderCode: 'CASE-001',
    orderType: OrderType.initial,
    parentOrderId: null,
    doctorId: doctor.userId,
    patientId: 'patient-1',
    assignedDesignerId: designer.userId,
    status: OrderStatus.shipped,
    deletedAt: null,
    createdAt: new Date('2026-01-10T09:00:00.000Z'),
    archTreatment: ArchTreatment.both,
    patientStage: 'initial',
    totalAligners: 30,
    coverageStartedAt: new Date('2026-02-01T00:00:00.000Z'),
    coverageExpiresAt: new Date('2027-02-01T00:00:00.000Z'),
    treatmentPlans: [
      {
        id: PLAN_ID,
        version: 2,
        approvedAt: new Date('2026-01-20T00:00:00.000Z'),
        totalUpperAligners: 24,
        totalLowerAligners: 22,
      },
    ],
    quotation: {
      status: QuotationStatus.approved,
      paymentStatus: QuotationPaymentStatus.paid,
      treatmentValidityMonths: 12,
      includedCorrections: 2,
      isUnlimitedCorrections: false,
      maxStepsPerArch: 20,
      isUnlimitedSteps: false,
    },
    supplementalOrders: [],
    alignerDeliveries: [{ toAligner: 12 }],
    ...over,
  };
}

/** A supplemental request row (the child include, idempotency key omitted). */
export function requestRow(over: Row = {}): Row {
  return {
    id: 'request-1',
    orderId: 'child-1',
    createdById: doctor.userId,
    createdByName: 'Dr Amine',
    reviewedById: null,
    reviewedByName: null,
    coverageStatus: SupplementalCoverageStatus.included,
    coverageReason: 'within_pack_allowance',
    reviewStatus: SupplementalReviewStatus.draft,
    reviewReason: null,
    reviewedAt: null,
    submittedAt: null,
    correctionNumber: null,
    reason: null,
    reasonDetails: null,
    currentUpperAligner: null,
    currentLowerAligner: null,
    passiveOppositeArch: null,
    newUpperScan: null,
    newLowerScan: null,
    clinicalObjective: null,
    movementRestriction: null,
    apRelationshipRight: null,
    apRelationshipLeft: null,
    apOptions: [],
    elasticCutouts: null,
    attachmentPolicy: null,
    existingAttachmentPolicy: null,
    iprPolicy: null,
    previousIpr: null,
    precisionCutPolicy: null,
    residualSpacePolicy: null,
    upperInstructions: null,
    lowerInstructions: null,
    impressionMethod: null,
    replacementFromAligner: null,
    replacementToAligner: null,
    defectiveAligners: [],
    quantity: null,
    replacementReason: null,
    urgency: null,
    sourceTreatmentPlanId: null,
    sourceTreatmentPlanVersion: null,
    transferPurpose: null,
    transferNotes: null,
    warrantyDefectCategory: null,
    warrantyDiscoveredAt: null,
    warrantyLotReference: null,
    warrantyComments: null,
    convertedReplacementOrderId: null,
    convertedReplacementOrder: null,
    teeth: [],
    contacts: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

/** A child order as loadChild's query returns it (orderInclude + request). */
export function childRow(over: Row = {}, request: Row = {}): Row {
  const id = (over.id as string | undefined) ?? 'child-1';
  return {
    id,
    orderCode: 'CASE-001-ADD-01',
    orderType: OrderType.additional_aligners,
    parentOrderId: PARENT_ID,
    doctorId: doctor.userId,
    patientId: 'patient-1',
    assignedDesignerId: designer.userId,
    status: OrderStatus.draft,
    archTreatment: ArchTreatment.both,
    treatBothArch: true,
    materials: [],
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    doctor: { id: doctor.userId, fullName: 'Dr Amine', email: 'a@x.test' },
    patient: { id: 'patient-1', fullName: 'Sarah Morgan' },
    toothInstructions: [],
    files: [],
    treatmentPlans: [],
    _count: { treatmentPlans: 0 },
    parentOrder: {
      id: PARENT_ID,
      orderCode: 'CASE-001',
      status: OrderStatus.shipped,
      orderType: OrderType.initial,
      archTreatment: ArchTreatment.both,
      coverageStartedAt: null,
      coverageExpiresAt: null,
    },
    warrantyConversion: null,
    ...over,
    supplementalRequest: requestRow({ orderId: id, ...request }),
  };
}

/** A file uploaded through an upload slot (`<slot>__<name>`). */
export const slotFile = (slot: string, category: string, index = 0): Row => ({
  id: `slot-file-${slot}-${index}`,
  category,
  originalName: `${slot}__IMG_${index}.jpg`,
  deletedAt: null,
});

export interface FakeState {
  parents: Row[];
  children: Row[];
  consumedCorrections: number;
  /** Numbers those corrections carry (default 1..consumedCorrections). */
  correctionNumbers?: number[];
  /** What findReplay's findUnique returns. */
  replay: Row | null;
  existingCodes: string[];
}

/**
 * An in-memory stand-in for the Prisma delegates the supplemental queries
 * touch. `$transaction` hands the callback the SAME delegates (the tx), so
 * a test asserts on one set of mocks; inserted children become loadable.
 */
export function fakeDb(initial: Partial<FakeState> = {}) {
  const state: FakeState = {
    parents: [parentRow()],
    children: [],
    consumedCorrections: 0,
    replay: null,
    existingCodes: [],
    ...initial,
  };
  const byId = (rows: Row[], id: unknown) => rows.find((row) => row.id === id);
  const live = (row: Row | undefined, where: Row) =>
    row && (where.deletedAt === null ? row.deletedAt === null : true)
      ? row
      : null;

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    dentalOrder: {
      findFirst: jest.fn(
        (args: { where: Row; include?: Row; select?: Row }) => {
          const { where } = args;
          if (args.select?.parentOrderId) {
            const child = live(byId(state.children, where.id), where);
            return Promise.resolve(
              child ? { parentOrderId: child.parentOrderId } : null,
            );
          }
          if (args.include?.supplementalRequest) {
            return Promise.resolve(live(byId(state.children, where.id), where));
          }
          return Promise.resolve(live(byId(state.parents, where.id), where));
        },
      ),
      findMany: jest.fn((args: { where: Row; select?: Row }) =>
        Promise.resolve(
          args.select?.orderCode
            ? state.existingCodes.map((orderCode) => ({ orderCode }))
            : state.children.filter(
                (child) => child.parentOrderId === args.where.parentOrderId,
              ),
        ),
      ),
      create: jest.fn(
        (args: { data: Row & { supplementalRequest: { create: Row } } }) => {
          const { supplementalRequest, ...order } = args.data;
          // The child include omits the key, as the real query does.
          const { idempotencyKey: _key, ...request } =
            supplementalRequest.create;
          state.children.push(
            childRow(
              { ...order, id: NEW_CHILD_ID },
              { ...request, id: 'request-new' },
            ),
          );
          return Promise.resolve({ id: NEW_CHILD_ID });
        },
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    supplementalOrderRequest: {
      count: jest.fn(() => Promise.resolve(state.consumedCorrections)),
      // consumedCorrectionNumbers: the live corrections' numbers.
      findMany: jest.fn(() =>
        Promise.resolve(
          (
            state.correctionNumbers ??
            Array.from(
              { length: state.consumedCorrections },
              (_, index) => index + 1,
            )
          ).map((correctionNumber) => ({ correctionNumber })),
        ),
      ),
      findUnique: jest.fn(() => Promise.resolve(state.replay)),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ idempotencyKey: 'key-0000-0001' }),
      update: jest.fn().mockResolvedValue({}),
    },
    treatmentPlan: {
      findFirst: jest.fn((args: { where: Row }) =>
        Promise.resolve(
          args.where.id === PLAN_ID && args.where.orderId === PARENT_ID
            ? { id: PLAN_ID, version: 2 }
            : null,
        ),
      ),
    },
    supplementalToothSelection: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    supplementalToothContact: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    orderAuditLog: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Actor' }) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(
      <T>(run: (client: typeof tx) => Promise<T>): Promise<T> => run(tx),
    ),
  };
  return { state, tx, prisma };
}

export type FakeDb = ReturnType<typeof fakeDb>;

/** Both services over one fake database, with the real access policy. */
export function makeServices(db: FakeDb) {
  // The fake implements only the delegates the supplemental queries use.
  const prisma = db.prisma as unknown as PrismaService;
  const access = new OrderAccessPolicy(prisma);
  const audit = new SupplementalAudit(prisma);
  const events = new EventEmitter2();
  const emit = jest.spyOn(events, 'emit');
  const requests = new SupplementalOrderService(
    prisma,
    access,
    audit,
    clock,
    events,
  );
  const reviews = new SupplementalReviewService(
    prisma,
    access,
    audit,
    clock,
    events,
    requests,
  );
  return { requests, reviews, emit };
}

/**
 * The first argument of a mock's nth call, for `toMatchObject` (a partial,
 * recursive match: no nested `expect.objectContaining` needed).
 */
export function argOf(mock: jest.Mock, call = 0): unknown {
  const calls = mock.mock.calls as unknown[][];
  return calls[call]?.[0];
}

/** The audit rows written, in order, across every createMany call. */
export function auditRows(db: FakeDb): Row[] {
  return db.tx.orderAuditLog.createMany.mock.calls.flatMap(
    ([args]: [{ data: Row[] }]) => args.data,
  );
}

export interface Failure {
  status: number;
  errorCode?: string;
  message: string;
}

/**
 * How a call failed, whichever exception family threw (the shared
 * OrderAccessPolicy throws Nest's own HttpException, the supplemental code
 * AppException with an error code).
 */
export async function failureOf(promise: Promise<unknown>): Promise<Failure> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) {
      return {
        status: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      };
    }
    if (error instanceof HttpException) {
      return { status: error.getStatus(), message: error.message };
    }
    throw error;
  }
  throw new Error('Expected the call to fail.');
}

/** A known-request error as Prisma throws it on a unique violation. */
export function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

/** A paid quotation with `included` corrections (null: not configured). */
export const quotation = (included: number | null, over: Row = {}): Row => ({
  paymentStatus: QuotationPaymentStatus.paid,
  treatmentValidityMonths: 12,
  includedCorrections: included,
  isUnlimitedCorrections: false,
  ...over,
});

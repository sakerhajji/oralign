import {
  BatchStatus,
  DeliveryRecipient,
  OrderStatus,
  OrderType,
  Prisma,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
  QuotationPaymentStatus,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../common/access/caller';
import { OrderAccessPolicy } from '../common/access/order-access.policy';
import { businessInstant } from '../common/time/business-day';
import type { PrismaService } from '../prisma/prisma.service';
import {
  ProductionArchChoiceParam,
  ProductionMyDayParam,
  ProductionQueueTabParam,
  type DeclareProductionEventDto,
} from './dto';
import { findForbiddenKeys } from './kernel';
import { ProductionDossierService } from './production-dossier.service';
import { ProductionEventsService } from './production-events.service';
import { ProductionMyDayService } from './production-my-day.service';
import { ProductionOrderGate } from './production-order-gate';
import { ProductionQueueService } from './production-queue.service';
import { ProductionSheetService } from './production-sheet.service';
import { PRODUCTION_FORBIDDEN_KEY } from './production.constants';

/**
 * THE data-leak guard of the lab production API (brief "Security",
 * CONTRACT §1): every technician-reachable response is built by the REAL
 * services from a fixture where every fee, payment, invoice, gift, proof,
 * path, token, installment and contact column is FILLED (the mocked
 * Prisma ignores the selects and returns whole rows, so only the mappers'
 * whitelists stand between them and the response), then serialised and
 * searched for a forbidden key. Expect none.
 */

const technician: Caller = { userId: 'u-tech', role: UserRole.technician };
const NOW = businessInstant('2026-11-25', '10:00');
const PAST = businessInstant('2026-10-01', '09:00');
const money = new Prisma.Decimal('1234.567');

const variants = {
  thumb: {
    path: 'orders/o1/photos/Dr-X_Patient-Y_front-photo_001__thumb.webp',
    width: 300,
    height: 200,
    sizeBytes: 1000,
    format: 'webp',
  },
  md: {
    path: 'orders/o1/photos/Dr-X_Patient-Y_front-photo_001__md.webp',
    width: 800,
    height: 600,
    sizeBytes: 9000,
    format: 'webp',
  },
};

const fullUser = {
  id: 'u-doc',
  fullName: 'Dr Salma',
  email: 'doc@example.com',
  phone: '+216 20 000 000',
  passwordHash: 'hash',
  role: UserRole.dentist,
  address: 'Rue X',
  clinicAddress: 'Clinic street',
  avatarUrl: '/uploads/avatars/a.png',
  dentistProfile: {
    clinicName: 'Clinique du Lac',
    clinicAddress: '1 rue du Lac',
    clinicPhone: '+216 71 000 000',
    clinicEmail: 'clinic@example.com',
    taxRegistrationNumber: 'MF123',
  },
};

const fullPatient = {
  id: 'p1',
  fullName: 'Ines Ben Ali',
  email: 'patient@example.com',
  phone: '+216 98 000 000',
  address: 'Avenue Habib Bourguiba',
  notes: 'private notes',
  gender: 'female',
  dateOfBirth: new Date('2010-03-14T00:00:00.000Z'),
  profilePhotoUrl: '/uploads/patients/p.png',
};

const fullBatch = (
  id: string,
  fromStep: number,
  toStep: number,
  status: BatchStatus,
) => ({
  id,
  fromStep,
  toStep,
  status,
  batchNumber: 1,
  deliveredByProduction: false,
  installmentId: 'i1',
  installment: { amount: money, paymentStatus: 'paid', invoiceNumber: 'FAC-1' },
  amount: money,
});

const fullQuotation = {
  id: 'q1',
  deletedAt: null,
  packName: 'Pack Premium',
  maxStepsPerArch: 20,
  isUnlimitedSteps: false,
  treatmentValidityMonths: 6,
  paymentStatus: QuotationPaymentStatus.partially_paid,
  totalPrice: money,
  paidAmount: money,
  remainingAmount: money,
  treatmentFees: 100,
  fabricationFees: 100,
  discountAmount: 10,
  totalTtc: 1000,
  pdfFilePath: 'orders/o1/quotes/dev.pdf',
  installments: [{ amount: money, invoiceNumber: 'FAC-1' }],
  stepBatches: [
    fullBatch('b1', 1, 5, BatchStatus.unlocked),
    fullBatch('b2', 6, 10, BatchStatus.locked),
  ],
};

const fullPlan = {
  id: 'tp1',
  version: 2,
  name: 'Plan v2',
  status: 'approved',
  approvedAt: PAST,
  totalUpperAligners: 20,
  totalLowerAligners: 20,
  resultViewUrl: 'https://viewer.example.com/x',
  publicToken: 'secret-token',
  filePath: 'orders/o1/treatment-plans/tp1/file.zip',
  movementTableImagePath: 'orders/o1/treatment-plans/tp1/movement-table/m.png',
  movementTableImageName: 'Dr-X_Patient-Y_movement.png',
  dentalTreatmentTableImagePath:
    'orders/o1/treatment-plans/tp1/dental-treatment/d.png',
  iprEntries: [
    {
      fromTooth: 11,
      toTooth: 21,
      value: '0.20',
      note: null,
      createdById: 'u-des',
    },
  ],
  messages: [
    {
      id: 'm1',
      body: 'chat text with amounts 1200 TND',
      attachments: [
        {
          id: 'att1',
          fileName: 'result.stl',
          filePath: 'orders/o1/treatment-plans/tp1/results/result.stl',
          mimeType: 'model/stl',
          sizeBytes: 1000,
          category: 'treatment_result',
          createdAt: PAST,
          width: null,
          height: null,
          processingStatus: null,
          variants,
          uploadedById: 'u-des',
        },
      ],
    },
  ],
};

const fullProgress = {
  orderId: 'o1',
  printedUpper: 5,
  printedLower: 5,
  thermoformedUpper: 5,
  thermoformedLower: 5,
  cutUpper: 5,
  cutLower: 5,
  deliveredUpper: 0,
  deliveredLower: 0,
  firstActionAt: PAST,
  lastActionAt: PAST,
  updatedAt: PAST,
};

/** A DentalOrder with EVERY column of the table and every relation filled. */
const fullOrder = {
  id: 'o1',
  orderCode: 'ORD-0001',
  doctorId: 'u-doc',
  patientId: 'p1',
  status: OrderStatus.payment_pending,
  orderType: OrderType.additional_aligners,
  parentOrderId: 'o0',
  patientStage: 'adult',
  chiefComplaint: 'crowding',
  archTreatment: 'both',
  treatBothArch: true,
  treatmentPlan: 'plan text',
  dontMoveOption: null,
  apRelationship: null,
  anteroposteriorRelationship: null,
  elastics: null,
  openBite: null,
  midline: null,
  ipr: 'as needed',
  biteRamps: null,
  expansion: null,
  crossbite: null,
  spaces: null,
  extractions: null,
  specialInstructions: null,
  additionalInstructions: null,
  useCbctWithScans: true,
  wantsManufacturing: true,
  materials: ['standard'],
  createdAt: PAST,
  updatedAt: PAST,
  submittedAt: PAST,
  termsAcceptedAt: PAST,
  adminSeenAt: PAST,
  deletedAt: null,
  treatmentFeePaidAt: PAST,
  treatmentFeeAmount: money,
  treatmentFeeWithholdingRate: new Prisma.Decimal('1'),
  treatmentFeeWithholdingAmount: money,
  treatmentFeeStampAmount: money,
  treatmentFeePaymentMethod: 'bank_transfer',
  treatmentFeePaymentStatus: 'success',
  treatmentFeeProofPath: '/uploads/treatment-fee-proofs/p.png',
  treatmentFeeInvoiceNumber: 'TF-000001',
  cbctFeeAmount: money,
  cbctFeeCurrency: 'TND',
  welcomeGiftAppliedAt: PAST,
  welcomeGiftTreatmentFee: money,
  welcomeGiftCbctFee: money,
  welcomeGiftCurrency: 'TND',
  welcomeGiftFirstCase: true,
  approvedTreatmentPlanId: 'tp1',
  totalAligners: 20,
  coverageStartedAt: PAST,
  coverageExpiresAt: NOW,
  doctor: fullUser,
  patient: fullPatient,
  parentOrder: { orderCode: 'ORD-0000', treatmentFeeAmount: money },
  toothInstructions: [
    {
      toothNumber: 11,
      type: 'ipr_value',
      value: '0.2',
      note: 'n',
      createdById: 'u-doc',
    },
  ],
  files: [
    {
      id: 'f1',
      orderId: 'o1',
      category: 'front_photo',
      originalName: 'IMG_001.jpg',
      fileName: 'Dr-X_Patient-Y_front-photo_001.jpg',
      generatedName: 'Dr-X_Patient-Y_front-photo_001.jpg',
      relativePath: 'orders/o1/front_photo/Dr-X_Patient-Y_front-photo_001.jpg',
      mimeType: 'image/jpeg',
      size: 1000,
      createdAt: PAST,
      deletedAt: null,
      orderIndex: 1,
      width: 1200,
      height: 800,
      processingStatus: 'completed',
      variants,
      mediaMetadata: {
        kind: 'zip',
        entryCount: 3,
        topLevelEntries: ['DICOM'],
        totalUncompressedBytes: 10,
        truncated: false,
        suspicious: false,
      },
      processedAt: PAST,
    },
  ],
  treatmentPlans: [fullPlan],
  quotation: fullQuotation,
  payments: [{ amount: money }],
  invoices: [{ invoiceNumber: 'FAC-2', amount: money }],
  productionProgress: fullProgress,
  supplementalRequest: {
    id: 'r1',
    coverageStatus: 'chargeable',
    coverageReason: 'coverage_expired',
    reviewStatus: 'approved',
    reviewReason: 'ok',
    reviewedByName: 'Admin',
    createdByName: 'Dr Salma',
    idempotencyKey: 'k',
    reason: 'refinement',
    reasonDetails: 'details',
    currentUpperAligner: 10,
    currentLowerAligner: 10,
    passiveOppositeArch: false,
    newUpperScan: true,
    newLowerScan: true,
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
    quantity: null,
    replacementReason: null,
    urgency: null,
    sourceTreatmentPlanVersion: 1,
    transferPurpose: null,
    transferNotes: null,
    defectiveAligners: [3],
    warrantyDefectCategory: null,
    warrantyDiscoveredAt: PAST,
    warrantyLotReference: 'LOT-1',
    warrantyComments: null,
    teeth: [{ purpose: 'ipr', toothNumber: 11, id: 't1' }],
    contacts: [
      {
        purpose: 'previous_ipr',
        fromTooth: 11,
        toTooth: 21,
        amountMm: new Prisma.Decimal('0.20'),
        id: 'c1',
      },
    ],
  },
};

/** A ProductionEvent with every column filled, plus its order (for the my-day join). */
function fullEvent(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    orderId: 'o1',
    declarationId: 'd1',
    type: ProductionEventType.model_printed,
    arch: ProductionArch.upper,
    stepFrom: 1,
    stepTo: 5,
    quantity: 5,
    performedAt: PAST,
    createdAt: new Date(NOW.getTime() - 60_000),
    createdById: technician.userId,
    createdByName: 'Tech',
    createdByRole: UserRole.technician,
    deliveredTo: null,
    deliveredToName: null,
    note: 'note',
    warnings: [],
    origin: ProductionEventOrigin.declared,
    idempotencyKey: 'key-0001-abcd',
    notifiedAt: null,
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelReason: null,
    order: { ...fullOrder, productionProgress: fullProgress },
    createdBy: fullUser,
    ...over,
  };
}

function prismaMock() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    dentalOrder: {
      findUnique: jest.fn().mockResolvedValue(fullOrder),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(fullOrder),
    },
    productionEvent: {
      // The cancel target (a relation filter on its order: orderId only).
      findFirst: jest.fn().mockResolvedValue({ orderId: 'o1' }),
      findMany: jest.fn(({ where }: { where: { idempotencyKey?: string } }) =>
        Promise.resolve(where.idempotencyKey ? [] : [fullEvent()]),
      ),
      createManyAndReturn: jest.fn(({ data }: { data: object[] }) =>
        Promise.resolve(
          data.map((row, index) =>
            fullEvent({ ...row, id: `n${index}`, createdAt: NOW }),
          ),
        ),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    productionProgress: { upsert: jest.fn().mockResolvedValue(fullProgress) },
    quoteStepBatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    productionNotice: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    dentalOrder: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([fullOrder]),
      findUnique: jest.fn().mockResolvedValue(fullOrder),
      findFirst: jest.fn().mockResolvedValue(fullOrder),
    },
    productionEvent: {
      findMany: jest.fn(({ where }: { where: { idempotencyKey?: string } }) =>
        Promise.resolve(where.idempotencyKey ? [] : [fullEvent()]),
      ),
    },
    user: { findUnique: jest.fn().mockResolvedValue(fullUser) },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const asPrisma = prisma as unknown as PrismaService;
  const policy = new OrderAccessPolicy(asPrisma);
  return { prisma: asPrisma, policy, tx };
}

describe('production responses never carry money, contact or path keys', () => {
  it('the guard pattern itself still catches what it must', () => {
    expect(
      findForbiddenKeys(fullOrder, PRODUCTION_FORBIDDEN_KEY).length,
    ).toBeGreaterThan(10);
  });

  it('queue (both tabs)', async () => {
    const { prisma, policy } = prismaMock();
    const queue = new ProductionQueueService(prisma, policy);
    for (const tab of Object.values(ProductionQueueTabParam)) {
      expect(findForbiddenKeys(await queue.list({ tab }, technician))).toEqual(
        [],
      );
    }
  });

  it('case sheet', async () => {
    const { prisma, policy } = prismaMock();
    const sheet = await new ProductionSheetService(prisma, policy).get(
      'o1',
      technician,
      NOW,
    );
    expect(sheet.releasedRanges).toEqual([
      { from: 1, to: 5, state: 'released' },
      { from: 6, to: 10, state: 'locked' },
    ]);
    expect(findForbiddenKeys(sheet)).toEqual([]);
  });

  it('dossier (D9: name, gender, age; no stored name, no path, no fee, no contact)', async () => {
    const { prisma, policy } = prismaMock();
    const dossier = await new ProductionDossierService(
      prisma,
      new ProductionOrderGate(prisma, policy),
    ).get('o1', technician, NOW);
    expect(dossier.patient).toEqual({
      fullName: 'Ines Ben Ali',
      gender: 'female',
      age: 16,
    });
    expect(dossier.supplementalRequest?.contacts[0]).toEqual({
      purpose: 'previous_ipr',
      fromTooth: 11,
      toTooth: 21,
      iprMm: 0.2,
    });
    const serialised = JSON.stringify(dossier);
    for (const secret of [
      'Dr-X_Patient-Y',
      'secret-token',
      'orders/o1',
      'doc@example.com',
      '+216',
      'Pack Premium',
      'chargeable',
      'private notes',
      '2010-03-14',
    ]) {
      expect(serialised).not.toContain(secret);
    }
    expect(findForbiddenKeys(dossier)).toEqual([]);
  });

  it('my day', async () => {
    const { prisma, policy } = prismaMock();
    const day = await new ProductionMyDayService(prisma, policy).get(
      { day: ProductionMyDayParam.today },
      technician,
      NOW,
    );
    expect(day.events).toHaveLength(1);
    expect(findForbiddenKeys(day)).toEqual([]);
  });

  it('declare and cancel', async () => {
    const { prisma, policy } = prismaMock();
    const events = new ProductionEventsService(prisma, policy);
    const declared = await events.declare(
      {
        orderId: 'o1',
        type: ProductionEventType.aligner_delivered,
        arch: ProductionArchChoiceParam.both,
        stepFrom: 1,
        stepTo: 5,
        deliveredTo: DeliveryRecipient.courier,
        deliveredToName: 'Aramex',
        confirmWarnings: ['previous_stage_missing'],
        note: 'pas de découpe saisie',
      } as DeclareProductionEventDto,
      'key-0002-abcd',
      technician,
      NOW,
    );
    expect(declared.events).toHaveLength(2);
    expect(findForbiddenKeys(declared)).toEqual([]);

    const cancelled = await events.cancel(
      'e1',
      { reason: 'Erreur de saisie' },
      technician,
      NOW,
    );
    expect(findForbiddenKeys(cancelled)).toEqual([]);
  });
});

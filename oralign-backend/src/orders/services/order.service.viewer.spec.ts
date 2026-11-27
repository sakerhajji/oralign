import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Caller } from '../../common/access/caller';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderFilterDto } from '../dto/order.dto';
import type { OrderAuditService } from './order-audit.service';
import type { WelcomeGiftService } from './welcome-gift.service';
import { OrderService } from './order.service';

jest.mock('./order-storage', () => ({
  purgeStoredMedia: jest.fn(),
  removeFileFromDisk: jest.fn(),
  purgeOrderDirectory: jest.fn(),
}));

/**
 * The order reads hand their caller to mapOrderToDto (the REAL mapper
 * here): the owning dentist and the admins keep the fee receipt path
 * (P-A semantics), every other reader gets treatmentFeeHasProof only.
 * Screens read hasProof and the authenticated stream either way.
 */

const PROOF = 'orders/o-1/payment-proofs/r.jpg';
const at = new Date('2026-11-27T09:30:00.000Z');

const stored = {
  id: 'o-1',
  orderCode: 'ORD-1',
  doctorId: 'u-doc',
  patientId: 'pt-1',
  assignedDesignerId: 'u-des',
  status: OrderStatus.payment_review,
  orderType: OrderType.initial,
  parentOrderId: null,
  treatBothArch: true,
  useCbctWithScans: false,
  wantsManufacturing: true,
  materials: [],
  toothInstructions: [],
  files: [],
  doctor: null,
  patient: { id: 'pt-1', fullName: 'Ines' },
  createdAt: at,
  updatedAt: at,
  treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
  treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
  treatmentFeeAmount: new Prisma.Decimal('351.000'),
  treatmentFeeProofPath: PROOF,
  treatmentFeeDeclaredAt: at,
  treatmentFeeReviewOpenedAt: null,
  treatmentFeeRejectedAt: null,
  treatmentFeeRejectionReason: null,
  treatmentFeeWithholdingThreshold: null,
  welcomeGiftAppliedAt: null,
  treatmentPlans: [],
};

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const owner: Caller = { userId: 'u-doc', role: UserRole.dentist };
const designer: Caller = { userId: 'u-des', role: UserRole.designer };

function makeService() {
  const prisma = {
    dentalOrder: {
      findFirst: jest.fn().mockResolvedValue(stored),
      findMany: jest.fn().mockResolvedValue([stored]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const access = { scope: jest.fn().mockReturnValue({}) };
  const service = new OrderService(
    prisma as unknown as PrismaService,
    access as unknown as OrderAccessPolicy,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {} as OrderAuditService,
    {} as WelcomeGiftService,
  );
  return { service };
}

describe('OrderService reads: the caller reaches the order mapper', () => {
  it.each([admin, owner])(
    'getOrderById: %p keeps the fee receipt path and hasProof',
    async (caller) => {
      const { service } = makeService();
      const dto = await service.getOrderById('o-1', caller);
      expect(dto).toMatchObject({
        treatmentFeeProofPath: PROOF,
        treatmentFeeHasProof: true,
      });
    },
  );

  it('getOrderById: an assigned designer reads hasProof only, never the path', async () => {
    const { service } = makeService();
    const dto = await service.getOrderById('o-1', designer);
    expect(dto).toMatchObject({ treatmentFeeHasProof: true });
    expect(dto).not.toHaveProperty('treatmentFeeProofPath', PROOF);
    expect(JSON.stringify(dto)).not.toContain('payment-proofs');
  });

  it('getOrders: each row is mapped for the caller', async () => {
    const { service } = makeService();
    const forAdmin = await service.getOrders(
      1,
      10,
      {} as OrderFilterDto,
      admin,
    );
    expect(forAdmin.data[0]).toMatchObject({ treatmentFeeProofPath: PROOF });
    const forDesigner = await service.getOrders(
      1,
      10,
      {} as OrderFilterDto,
      designer,
    );
    expect(JSON.stringify(forDesigner.data)).not.toContain('payment-proofs');
    expect(forDesigner.data[0]).toMatchObject({ treatmentFeeHasProof: true });
  });
});

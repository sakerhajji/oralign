import {
  OrderType,
  QuotationStatus,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { CompanyBillingSettingsService } from './company-billing-settings.service';
import type { QuotationPaymentPlanService } from './quotation-payment-plan.service';
import type { QuotationPdfService } from './quotation-pdf.service';
import {
  QUOTABLE_ORDER_SELECT,
  QUOTATION_ELIGIBILITY_ERROR,
  type QuotableOrder,
} from '../quotation-eligibility';

// The PDF renderer pulls in puppeteer (ESM-only); creation never renders.
jest.mock('./quotation-pdf.service', () => ({
  QuotationPdfService: class QuotationPdfService {},
}));

import { QuotationService } from './quotation.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

function makeService(order: QuotableOrder | null) {
  const prisma = {
    dentalOrder: { findUnique: jest.fn().mockResolvedValue(order) },
    quotation: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }: { data: object }) =>
        Promise.resolve({ id: 'q-1', ...data }),
      ),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin' }) },
  };
  const settings = {
    requireActive: jest.fn().mockResolvedValue({
      defaultCurrency: 'TND',
      defaultTvaRate: 19,
      defaultTreatmentFee: 0,
    }),
  };
  const service = new QuotationService(
    prisma as unknown as PrismaService,
    {
      requireReadable: jest.fn().mockResolvedValue({ id: 'o-1' }),
    } as unknown as OrderAccessPolicy,
    settings as unknown as CompanyBillingSettingsService,
    {} as QuotationPaymentPlanService,
    {} as QuotationPdfService,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );
  return { service, prisma };
}

const supplemental = (
  orderType: OrderType,
  coverageStatus: SupplementalCoverageStatus,
): QuotableOrder => ({
  orderType,
  supplementalRequest: {
    reviewStatus: SupplementalReviewStatus.approved,
    coverageStatus,
  },
});

describe('QuotationService.create — supplemental requests', () => {
  it('quotes an approved chargeable replacement, no treatment plan needed', async () => {
    const { service, prisma } = makeService(
      supplemental(
        OrderType.replacement,
        SupplementalCoverageStatus.chargeable,
      ),
    );

    await expect(service.create('o-1', {}, admin)).resolves.toMatchObject({
      id: 'q-1',
      orderId: 'o-1',
      status: QuotationStatus.draft,
    });
    expect(prisma.dentalOrder.findUnique).toHaveBeenCalledWith({
      where: { id: 'o-1' },
      select: QUOTABLE_ORDER_SELECT,
    });
  });

  it('refuses an included refinement: it is free (400, nothing created)', async () => {
    const { service, prisma } = makeService(
      supplemental(
        OrderType.additional_aligners,
        SupplementalCoverageStatus.included,
      ),
    );

    await expect(service.create('o-1', {}, admin)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: QUOTATION_ELIGIBILITY_ERROR.SUPPLEMENTAL_NOT_QUOTABLE,
    });
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  it('keeps quoting initial cases as before', async () => {
    const { service, prisma } = makeService({
      orderType: OrderType.initial,
      supplementalRequest: null,
    });

    await service.create('o-1', {}, admin);

    expect(prisma.quotation.create).toHaveBeenCalledTimes(1);
  });
});

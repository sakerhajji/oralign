import { UserRole } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PaymentGateway } from '../gateways/payment-gateway.interface';

// QuotationService's production module imports the Puppeteer PDF renderer,
// which is ESM-only. Reading a payment never touches it.
jest.mock('../../quotations/services/quotation.service', () => ({
  QuotationService: class QuotationService {},
}));

import type { QuotationService } from '../../quotations/services/quotation.service';
import { PaymentsService } from './payments.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };

/** The columns the list already hides from a dentist. */
const HIDDEN_FROM_DENTISTS = {
  notes: true,
  idempotencyKey: true,
  initiatedById: true,
  confirmedById: true,
  rejectedById: true,
};

function makeService(payment: Record<string, unknown> | null) {
  const findUnique = jest.fn().mockResolvedValue(payment);
  const service = new PaymentsService(
    { payment: { findUnique } } as unknown as PrismaService,
    {} as EventEmitter2,
    {} as PaymentGateway,
    {} as QuotationService,
  );
  return { service, findUnique };
}

const onOrderOf = (doctorId: string) => ({
  id: 'p1',
  order: { doctorId },
});

describe('PaymentsService.getPayment (one payment)', () => {
  it("a dentist reads their own payment without the admin's notes, ids and idempotency key", async () => {
    const { service, findUnique } = makeService(onOrderOf(doctor.userId));
    await expect(service.getPayment('p1', doctor)).resolves.toMatchObject({
      id: 'p1',
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      include: { order: { select: { doctorId: true } } },
      omit: HIDDEN_FROM_DENTISTS,
    });
  });

  it('an admin keeps every column', async () => {
    const { service, findUnique } = makeService(onOrderOf('u-doc'));
    await service.getPayment('p1', admin);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ omit: undefined }),
    );
  });

  it("another dentist's payment is a 403", async () => {
    const { service } = makeService(onOrderOf('u-other'));
    await expect(service.getPayment('p1', doctor)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('a designer never reads a payment, even one they could name', async () => {
    const { service } = makeService(onOrderOf('u-des'));
    await expect(
      service.getPayment('p1', { userId: 'u-des', role: UserRole.designer }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('an unknown payment is a 404', async () => {
    const { service } = makeService(null);
    await expect(service.getPayment('nope', admin)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

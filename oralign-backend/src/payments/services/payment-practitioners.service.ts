import { Injectable } from '@nestjs/common';
import { PaymentPurpose, Prisma } from '@prisma/client';
import { isAdmin, type Caller } from '../../common/access/caller';
import { ForbiddenException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { PaymentPractitionersDto } from '../dto/payment.dto';

/** Far more dentists than the platform has; a guard, not a page size. */
const MAX_PRACTITIONERS = 2000;

/**
 * The dentists a payments filter offers: those with at least one payment
 * of the kind the list shows, on a live order — not every dentist of the
 * platform. Admins only: a dentist's lists are always their own.
 */
@Injectable()
export class PaymentPractitionersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    purpose: PaymentPurpose,
    caller: Caller,
  ): Promise<PaymentPractitionersDto> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only an admin can filter by dentist.');
    }
    const data = await this.prisma.user.findMany({
      where: { doctorOrders: { some: ordersWithPayments(purpose) } },
      select: { id: true, fullName: true, email: true },
      // The e-mail orders two dentists of the same name, the id two rows
      // of the same e-mail (never: it is unique), so the order is stable.
      orderBy: [{ fullName: 'asc' }, { email: 'asc' }, { id: 'asc' }],
      take: MAX_PRACTITIONERS,
    });
    return { data };
  }
}

/** Live orders carrying a payment of `purpose`, as the lists read them. */
function ordersWithPayments(
  purpose: PaymentPurpose,
): Prisma.DentalOrderWhereInput {
  if (purpose === PaymentPurpose.treatment_fee) {
    // A fee is on the order itself: listed once a method is on record.
    return { deletedAt: null, treatmentFeePaymentMethod: { not: null } };
  }
  return {
    deletedAt: null,
    payments: { some: { purpose: PaymentPurpose.installment } },
  };
}

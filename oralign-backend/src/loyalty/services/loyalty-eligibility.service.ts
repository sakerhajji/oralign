import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { QuarterRef } from '../loyalty.types';
import { quarterPeriod } from '../loyalty.types';
import {
  type LoyaltyDoctorMetrics,
  summarizeOrdersForQuarter,
} from '../loyalty.rules';

/** Reads the order ledger and derives loyalty units without mutable counters. */
@Injectable()
export class LoyaltyEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async metricsByDoctor(
    ref: QuarterRef,
  ): Promise<Map<string, LoyaltyDoctorMetrics>> {
    const { start, end } = quarterPeriod(ref);
    const orders = await this.prisma.dentalOrder.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        status: OrderStatus.finished,
        deletedAt: null,
      },
      select: {
        id: true,
        doctorId: true,
        status: true,
        createdAt: true,
        deletedAt: true,
        quotation: {
          select: {
            loyaltyDiscountPercent: true,
            loyaltyDiscountAmount: true,
          },
        },
      },
    });

    return summarizeOrdersForQuarter(orders, ref);
  }
}

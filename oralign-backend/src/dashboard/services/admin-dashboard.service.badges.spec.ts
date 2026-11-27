import { PaymentRecordStatus, UserRole } from '@prisma/client';
import type { Cache } from 'cache-manager';
import type { PrismaService } from '../../prisma/prisma.service';
import { DORMANT_DOCTOR_WHERE } from '../../users/activity/doctor-activity.contract';
import { AdminDashboardService } from './admin-dashboard.service';

/** The first argument of a mock's call, as the queries read it. */
interface CallArg {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
  take?: number;
}
const argOf = (fn: jest.Mock, call = 0): CallArg =>
  (fn.mock.calls as unknown[][])[call][0] as CallArg;

/**
 * The sidebar badges: the transfer badge is the pending desk's Nouveau tab
 * for the CALLING admin (distinct subjects, still awaiting, archived
 * orders out), and dormant doctors are counted apart from inactiveDoctors.
 */
function makeService(unreadKeys: string[]) {
  const orderCount = jest.fn().mockResolvedValue(4);
  const userCount = jest.fn().mockResolvedValue(0);
  const paymentCount = jest.fn().mockResolvedValue(1);
  const notificationFindMany = jest
    .fn()
    .mockResolvedValue(unreadKeys.map((subjectKey) => ({ subjectKey })));
  const prisma = {
    dentalOrder: { count: orderCount },
    user: { count: userCount },
    payment: { count: paymentCount },
    notification: { findMany: notificationFindMany },
    // The array form only: hand back what each statement resolves to.
    $transaction: (statements: Promise<number>[]) => Promise.all(statements),
  } as unknown as PrismaService;
  const service = new AdminDashboardService(prisma, {} as Cache);
  return { service, orderCount, userCount, paymentCount, notificationFindMany };
}

describe('AdminDashboardService.getSidebarBadges', () => {
  it('adds my new transfers and the dormant doctors to the existing counts', async () => {
    const { service, userCount, paymentCount, notificationFindMany } =
      makeService(['installment:pay-1', 'installment:pay-1']);
    userCount
      .mockResolvedValueOnce(2) // pending approvals
      .mockResolvedValueOnce(5); // dormant

    await expect(
      service.getSidebarBadges({ userId: 'u-admin', role: UserRole.admin }),
    ).resolves.toEqual({
      newOrders: 4,
      pendingApprovals: 2,
      newTransfers: 1,
      dormantDoctors: 5,
    });
    expect(argOf(notificationFindMany).where.recipientId).toBe('u-admin');
    expect(argOf(paymentCount).where).toMatchObject({
      status: PaymentRecordStatus.awaiting_confirmation,
      id: { in: ['pay-1'] },
      order: { deletedAt: null },
    });
    expect(argOf(userCount, 1)).toEqual({ where: DORMANT_DOCTOR_WHERE });
  });

  it('shows no transfer badge when nothing is unread for me', async () => {
    const { service, paymentCount } = makeService([]);

    const badges = await service.getSidebarBadges({
      userId: 'u-admin',
      role: UserRole.super_admin,
    });

    expect(badges.newTransfers).toBe(0);
    expect(paymentCount).not.toHaveBeenCalled();
  });
});

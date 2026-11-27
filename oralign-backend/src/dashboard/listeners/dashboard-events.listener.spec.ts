import type { TransferReviewOpenedEvent } from '../../notifications/events/notification-events';
import type { DashboardGateway } from '../gateways/dashboard.gateway';
import type { AdminDashboardService } from '../services/admin-dashboard.service';
import type { DoctorDashboardService } from '../services/doctor-dashboard.service';
import { DashboardEventsListener } from './dashboard-events.listener';

function makeListener() {
  const invalidateAll = jest.fn().mockResolvedValue(undefined);
  const invalidateDoctor = jest.fn().mockResolvedValue(undefined);
  const broadcastAdminInvalidate = jest.fn();
  const broadcastDoctorInvalidate = jest.fn();
  const listener = new DashboardEventsListener(
    { invalidateAll } as unknown as AdminDashboardService,
    { invalidateDoctor } as unknown as DoctorDashboardService,
    {
      broadcastAdminInvalidate,
      broadcastDoctorInvalidate,
    } as unknown as DashboardGateway,
  );
  return {
    listener,
    invalidateAll,
    invalidateDoctor,
    broadcastAdminInvalidate,
    broadcastDoctorInvalidate,
  };
}

describe('DashboardEventsListener money events', () => {
  it.each(['onPaymentEvent', 'onTreatmentFeeEvent'] as const)(
    '%s refreshes the admins (badge, desk, KPIs) and the doctor',
    async (handler) => {
      const spies = makeListener();

      await spies.listener[handler]({ doctorId: 'u-doc' });

      expect(spies.invalidateAll).toHaveBeenCalledTimes(1);
      expect(spies.invalidateDoctor).toHaveBeenCalledWith('u-doc');
      expect(spies.broadcastAdminInvalidate).toHaveBeenCalledWith('all');
      expect(spies.broadcastDoctorInvalidate).toHaveBeenCalledWith('u-doc');
    },
  );

  const opened = (firstOpen: boolean): TransferReviewOpenedEvent => ({
    kind: 'installment',
    subjectKey: 'payment:pay-1',
    orderId: 'o-1',
    paymentId: 'pay-1',
    adminId: 'u-admin',
    firstOpen,
    reviewOpenedAt: '2026-11-27T09:00:00.000Z',
  });

  it('tells every admin desk a receipt was FIRST opened, without busting caches', () => {
    const spies = makeListener();

    spies.listener.onTransferReviewOpened(opened(true));

    expect(spies.broadcastAdminInvalidate).toHaveBeenCalledTimes(1);
    expect(spies.broadcastAdminInvalidate).toHaveBeenCalledWith('all');
    expect(spies.invalidateAll).not.toHaveBeenCalled();
    expect(spies.broadcastDoctorInvalidate).not.toHaveBeenCalled();
  });

  it('a re-opening changes nothing global: no admin is told to refetch', () => {
    const spies = makeListener();

    spies.listener.onTransferReviewOpened(opened(false));

    expect(spies.broadcastAdminInvalidate).not.toHaveBeenCalled();
    expect(spies.invalidateAll).not.toHaveBeenCalled();
  });
});

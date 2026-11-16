import { Logger } from '@nestjs/common';
import {
  OrderType,
  SupplementalCoverageStatus,
  UserRole,
} from '@prisma/client';
import type { OrderNotificationService } from '../../mail/order-notification.service';
import type { NotificationsService } from '../services/notifications.service';
import { NotificationsListener } from './notifications.listener';

function makeListener() {
  type BroadcastArgs = Parameters<NotificationsService['broadcastToAdmins']>[0];
  type CreateArgs = Parameters<NotificationsService['create']>[0];
  const broadcastToAdmins = jest
    .fn<Promise<number>, [BroadcastArgs]>()
    .mockResolvedValue(1);
  const create = jest
    .fn<Promise<unknown>, [CreateArgs]>()
    .mockResolvedValue({});
  const notifyDentistPendingApproval = jest.fn().mockResolvedValue(undefined);
  const notifications = {
    broadcastToAdmins,
    create,
  } as unknown as NotificationsService;
  const orderNotifications = {
    notifyDentistPendingApproval,
  } as unknown as OrderNotificationService;

  return {
    listener: new NotificationsListener(notifications, orderNotifications),
    broadcastToAdmins,
    create,
    notifyDentistPendingApproval,
  };
}

describe('NotificationsListener user registration', () => {
  const payload = {
    userId: 'user-1',
    fullName: 'Dr Test',
    email: 'doctor@example.com',
    role: UserRole.dentist,
  };

  it('notifies admins in-app and by email as soon as an account is created', async () => {
    const { listener, broadcastToAdmins, notifyDentistPendingApproval } =
      makeListener();

    await listener.onUserRegistered(payload);

    const [notification] = broadcastToAdmins.mock.calls[0];
    expect(notification.link).toBe('/dashboard/users');
    expect(notification.metadata).toMatchObject({ userId: payload.userId });
    expect(notifyDentistPendingApproval).toHaveBeenCalledWith({
      fullName: payload.fullName,
      email: payload.email,
      role: payload.role,
    });
  });

  it('keeps registration notifications resilient when email delivery fails', async () => {
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { listener, broadcastToAdmins, notifyDentistPendingApproval } =
      makeListener();
    notifyDentistPendingApproval.mockRejectedValueOnce(
      new Error('SMTP unavailable'),
    );

    await expect(listener.onUserRegistered(payload)).resolves.toBeUndefined();
    expect(broadcastToAdmins).toHaveBeenCalledTimes(1);
    logError.mockRestore();
  });
});

describe('NotificationsListener supplemental requests', () => {
  const request = {
    orderId: 'child-1',
    orderCode: 'CASE-001-WAR-01',
    parentOrderId: 'parent-1',
    requestType: OrderType.warranty,
    doctorId: 'u-doc',
    doctorName: 'Amine',
    patientName: 'Sarah Morgan',
  } as const;

  it('asks the admins to review a submitted request, named in both languages', async () => {
    const { listener, broadcastToAdmins } = makeListener();

    await listener.onSupplementalOrderSubmitted(request);

    const [notification] = broadcastToAdmins.mock.calls[0];
    expect(notification.link).toBe('/dashboard/orders/child-1');
    expect(notification.title).toEqual({
      en: 'Supplemental request to review: warranty claim',
      fr: 'Demande complémentaire à examiner : demande de garantie',
    });
    expect(notification.metadata).toEqual({
      orderId: 'child-1',
      parentOrderId: 'parent-1',
      requestType: OrderType.warranty,
    });
  });

  it('tells the owning doctor about a decision, with the reason', async () => {
    const { listener, create } = makeListener();

    await listener.onSupplementalOrderReviewed({
      ...request,
      decision: 'rejected',
      coverageStatus: SupplementalCoverageStatus.warranty_rejected,
      reason: 'Wear, not a defect',
    });

    const [notification] = create.mock.calls[0];
    expect(notification.recipientId).toBe('u-doc');
    expect(notification.title).toEqual({
      en: 'Supplemental request declined: warranty claim',
      fr: 'Demande complémentaire refusée : demande de garantie',
    });
    expect(notification.message).toEqual({
      en: 'patient Sarah Morgan · CASE-001-WAR-01 · Wear, not a defect',
      fr: 'patient Sarah Morgan · CASE-001-WAR-01 · Wear, not a defect',
    });
    expect(notification.metadata).toMatchObject({
      decision: 'rejected',
      coverageStatus: SupplementalCoverageStatus.warranty_rejected,
    });
  });
});

import { Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { OrderNotificationService } from '../../mail/order-notification.service';
import type { NotificationsService } from '../services/notifications.service';
import { NotificationsListener } from './notifications.listener';

function makeListener() {
  type BroadcastArgs = Parameters<NotificationsService['broadcastToAdmins']>[0];
  const broadcastToAdmins = jest
    .fn<Promise<number>, [BroadcastArgs]>()
    .mockResolvedValue(1);
  const notifyDentistPendingApproval = jest.fn().mockResolvedValue(undefined);
  const notifications = {
    broadcastToAdmins,
  } as unknown as NotificationsService;
  const orderNotifications = {
    notifyDentistPendingApproval,
  } as unknown as OrderNotificationService;

  return {
    listener: new NotificationsListener(notifications, orderNotifications),
    broadcastToAdmins,
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

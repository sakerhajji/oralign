import { NotificationType } from '@prisma/client';
import {
  TRANSFER_DECLARED_TYPES,
  UNREAD_TRANSFER_ROWS_CAP,
  unreadTransferSubjectKeys,
  type NotificationReader,
} from './transfer-subject-reads';

const A = 'installment:pay-1';
const B = 'treatment_fee:order-1:1795000000000';

function reader(rows: { subjectKey: string | null }[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  return {
    db: { notification: { findMany } } as unknown as NotificationReader,
    findMany,
  };
}

describe('unreadTransferSubjectKeys', () => {
  it('reads my unread receipt rows only, keys only, capped', async () => {
    const { db, findMany } = reader([]);

    await unreadTransferSubjectKeys(db, 'u-admin');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        recipientId: 'u-admin',
        readAt: null,
        subjectKey: { not: null },
        type: {
          in: [
            NotificationType.payment_declared,
            NotificationType.treatment_fee_declared,
          ],
        },
      },
      select: { subjectKey: true },
      take: UNREAD_TRANSFER_ROWS_CAP,
    });
    expect(TRANSFER_DECLARED_TYPES).toHaveLength(2);
  });

  it('counts a subject once however many rows carry it, and drops malformed keys', async () => {
    const { db } = reader([
      { subjectKey: A },
      { subjectKey: B },
      { subjectKey: B },
      { subjectKey: 'legacy-free-text' },
      { subjectKey: null },
    ]);

    await expect(unreadTransferSubjectKeys(db, 'u-admin')).resolves.toEqual(
      new Set([A, B]),
    );
  });
});

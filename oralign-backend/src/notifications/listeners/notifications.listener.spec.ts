import { Logger } from '@nestjs/common';
import {
  BatchStatus,
  BatchUnlockSource,
  NotificationType,
  OrderType,
  PaymentMethod,
  SupplementalCoverageStatus,
  UserRole,
} from '@prisma/client';
import type { OrderNotificationService } from '../../mail/order-notification.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../services/notifications.service';
import type {
  BatchUnlockedEvent,
  PaymentEvent,
  TransferClosedEvent,
  TreatmentFeeEvent,
  TreatmentFeeRejectedEvent,
} from '../events/notification-events';
import { NotificationsListener } from './notifications.listener';

function makeListener(
  batch: {
    fromStep: number;
    toStep: number;
    status: BatchStatus;
    unlockSource: BatchUnlockSource | null;
  } | null = null,
  unlimited = false,
) {
  type BroadcastArgs = Parameters<NotificationsService['broadcastToAdmins']>[0];
  type CreateArgs = Parameters<NotificationsService['create']>[0];
  const broadcastToAdmins = jest
    .fn<Promise<number>, [BroadcastArgs]>()
    .mockResolvedValue(1);
  const create = jest
    .fn<Promise<unknown>, [CreateArgs]>()
    .mockResolvedValue({});
  const resolveSubject = jest.fn().mockResolvedValue(2);
  const resolveTreatmentFeeSubjects = jest.fn().mockResolvedValue(1);
  const markSubjectRead = jest.fn().mockResolvedValue({ updated: 1 });
  const notifyDentistPendingApproval = jest.fn().mockResolvedValue(undefined);
  const notifications = {
    broadcastToAdmins,
    create,
    resolveSubject,
    resolveTreatmentFeeSubjects,
    markSubjectRead,
  } as unknown as NotificationsService;
  const orderNotifications = {
    notifyDentistPendingApproval,
  } as unknown as OrderNotificationService;
  const findUnique = jest.fn().mockResolvedValue({
    quotation: { isUnlimitedSteps: unlimited },
    // The planned totals the range is trimmed to (approved plan: 14 / 14).
    order: {
      archTreatment: null,
      treatBothArch: true,
      totalAligners: null,
      treatmentPlans: [{ totalUpperAligners: 14, totalLowerAligners: 14 }],
      quotation: {
        maxStepsPerArch: 20,
        isUnlimitedSteps: unlimited,
        deletedAt: null,
      },
    },
    installment: { stepBatch: batch },
  });
  const prisma = { payment: { findUnique } } as unknown as PrismaService;

  return {
    listener: new NotificationsListener(
      notifications,
      orderNotifications,
      prisma,
    ),
    broadcastToAdmins,
    create,
    resolveSubject,
    resolveTreatmentFeeSubjects,
    markSubjectRead,
    notifyDentistPendingApproval,
    findUnique,
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

// ─── Bank transfers (spec §2) ─────────────────────────────────────────

const PAYMENT_ID = 'pay-1';
const ORDER_ID = 'order-1';
const DECLARED_AT = '2026-11-27T09:30:00.000Z';
const FEE_KEY = `treatment_fee:${ORDER_ID}:${Date.parse(DECLARED_AT)}`;

const payment: PaymentEvent = {
  paymentId: PAYMENT_ID,
  quotationId: 'q-1',
  orderId: ORDER_ID,
  orderCode: 'ORD-1',
  doctorId: 'u-doc',
  doctorName: 'Amine',
  patientName: 'Sarah',
  amount: '793.000',
  withholdingAmount: '0',
  stampAmount: '1.000',
  currency: 'TND',
  method: PaymentMethod.bank_transfer,
  installmentNumber: 2,
};

const fee: TreatmentFeeEvent = {
  orderId: ORDER_ID,
  orderCode: 'ORD-1',
  doctorId: 'u-doc',
  doctorName: 'Amine',
  patientName: 'Sarah',
  amount: '301.000',
  currency: 'TND',
  method: PaymentMethod.bank_transfer,
  declaredAt: DECLARED_AT,
};

describe('NotificationsListener transfer receipts (admins)', () => {
  it('gives every admin an unread row per installment declaration (its subject)', async () => {
    const { listener, broadcastToAdmins } = makeListener();

    await listener.onPaymentDeclared(payment);

    const [row] = broadcastToAdmins.mock.calls[0];
    expect(row.type).toBe(NotificationType.payment_declared);
    expect(row.subjectKey).toBe(`installment:${PAYMENT_ID}`);
    expect(row.link).toBe(
      `/dashboard/payments/pending?review=installment%3A${PAYMENT_ID}`,
    );
  });

  it('names a fee declaration by its declaredAt (a re-upload is a new subject)', async () => {
    const { listener, broadcastToAdmins } = makeListener();

    await listener.onTreatmentFeeDeclared(fee);

    const [row] = broadcastToAdmins.mock.calls[0];
    expect(row.type).toBe(NotificationType.treatment_fee_declared);
    expect(row.subjectKey).toBe(FEE_KEY);
    expect(row.link).toBe(
      `/dashboard/payments/pending?review=${encodeURIComponent(FEE_KEY)}`,
    );
  });

  it('writes a fee row without subject when a legacy emitter sends no declaredAt', async () => {
    const { listener, broadcastToAdmins } = makeListener();

    await listener.onTreatmentFeeDeclared({ ...fee, declaredAt: null });

    expect(broadcastToAdmins.mock.calls[0][0].subjectKey).toBeNull();
  });

  it("marks only the opening admin's rows read when a receipt is opened", async () => {
    const { listener, markSubjectRead, resolveSubject } = makeListener();

    await listener.onTransferReviewOpened({
      kind: 'installment',
      subjectKey: `installment:${PAYMENT_ID}`,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      adminId: 'u-admin-2',
      firstOpen: false,
      reviewOpenedAt: DECLARED_AT,
    });

    expect(markSubjectRead).toHaveBeenCalledWith(
      { userId: 'u-admin-2', role: UserRole.admin },
      `installment:${PAYMENT_ID}`,
    );
    expect(resolveSubject).not.toHaveBeenCalled();
  });

  it.each([
    ['onPaymentWithdrawn', 'installment'],
    ['onPaymentSuperseded', 'installment'],
    ['onTreatmentFeeWithdrawn', 'treatment_fee'],
    ['onTreatmentFeeSuperseded', 'treatment_fee'],
  ] as const)(
    '%s resolves the CLOSED subject for every admin, with no new row',
    async (handler, kind) => {
      const { listener, resolveSubject, create, broadcastToAdmins } =
        makeListener();
      const closed: TransferClosedEvent = {
        kind,
        subjectKey: kind === 'installment' ? 'installment:old-1' : FEE_KEY,
        reason: handler.endsWith('Withdrawn') ? 'withdrawn' : 'superseded',
        orderId: ORDER_ID,
        doctorId: 'u-doc',
        actorId: 'u-doc',
      };

      await listener[handler](closed);

      expect(resolveSubject).toHaveBeenCalledWith(closed.subjectKey);
      expect(create).not.toHaveBeenCalled();
      expect(broadcastToAdmins).not.toHaveBeenCalled();
    },
  );
});

describe('NotificationsListener transfer decisions (doctor)', () => {
  it('resolves the subject and names the released steps on a validation', async () => {
    const { listener, create, resolveSubject, findUnique } = makeListener({
      fromStep: 5,
      toStep: 7,
      status: BatchStatus.unlocked,
      unlockSource: BatchUnlockSource.payment,
    });

    await listener.onPaymentConfirmed(payment);

    expect(resolveSubject).toHaveBeenCalledWith(`installment:${PAYMENT_ID}`);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PAYMENT_ID } }),
    );
    const [row] = create.mock.calls[0];
    expect(row.recipientId).toBe('u-doc');
    expect(row.type).toBe(NotificationType.payment_confirmed);
    expect(row.message).toEqual({
      en: '793.000 TND for patient Sarah (ORD-1) has been confirmed — installment #2 is now paid. Steps 5–7 unlocked.',
      fr: "793.000 TND pour le patient Sarah (ORD-1) ont été confirmés — l'échéance n°2 est désormais payée. Étapes 5–7 débloquées.",
    });
    expect(row.metadata).toMatchObject({ fromStep: 5, toStep: 7 });
  });

  it('names no range when an admin had released the batch by hand', async () => {
    const { listener, create } = makeListener({
      fromStep: 5,
      toStep: 7,
      status: BatchStatus.unlocked,
      unlockSource: BatchUnlockSource.manual,
    });

    await listener.onPaymentConfirmed(payment);

    const message = create.mock.calls[0][0].message as { fr: string };
    expect(message.fr).not.toContain('Étapes');
  });

  it('names no range on an unlimited-step pack (placeholder batches)', async () => {
    const { listener, create } = makeListener(
      {
        fromStep: 2,
        toStep: 2,
        status: BatchStatus.unlocked,
        unlockSource: BatchUnlockSource.payment,
      },
      true,
    );

    await listener.onPaymentConfirmed(payment);

    const message = create.mock.calls[0][0].message as { en: string };
    expect(message.en).not.toContain('Step');
  });

  it('falls back to the plain validation when the installment has no batch', async () => {
    const { listener, create } = makeListener(null);

    await listener.onPaymentConfirmed(payment);

    const [row] = create.mock.calls[0];
    expect(row.message).toEqual({
      en: '793.000 TND for patient Sarah (ORD-1) has been confirmed — installment #2 is now paid.',
      fr: "793.000 TND pour le patient Sarah (ORD-1) ont été confirmés — l'échéance n°2 est désormais payée.",
    });
    expect(row.metadata).toMatchObject({ fromStep: null, toStep: null });
  });

  it('still sends the plain validation when the released range cannot be read', async () => {
    const logWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { listener, create, findUnique } = makeListener({
      fromStep: 5,
      toStep: 7,
      status: BatchStatus.unlocked,
      unlockSource: BatchUnlockSource.payment,
    });
    findUnique.mockRejectedValueOnce(new Error('db down'));

    await listener.onPaymentConfirmed(payment);

    expect(create).toHaveBeenCalledTimes(1);
    const [row] = create.mock.calls[0];
    expect(row.type).toBe(NotificationType.payment_confirmed);
    expect((row.message as { fr: string }).fr).not.toContain('Étapes');
    expect(logWarn).toHaveBeenCalled();
    logWarn.mockRestore();
  });

  it('names the released steps on a cash / cheque confirmation too', async () => {
    const { listener, create, broadcastToAdmins } = makeListener({
      fromStep: 5,
      toStep: 7,
      status: BatchStatus.unlocked,
      unlockSource: BatchUnlockSource.payment,
    });

    await listener.onCashPaymentRecorded({
      ...payment,
      method: PaymentMethod.cash,
    });

    const [row] = create.mock.calls[0];
    expect(row.recipientId).toBe('u-doc');
    expect(row.type).toBe(NotificationType.payment_confirmed);
    expect(row.message).toEqual({
      en: '793.000 TND cash for patient Sarah (ORD-1) has been recorded by the team — installment #2. Steps 5–7 unlocked.',
      fr: "793.000 TND en espèces pour le patient Sarah (ORD-1) ont été enregistrés par l'équipe — échéance n°2. Étapes 5–7 débloquées.",
    });
    expect(row.metadata).toMatchObject({ fromStep: 5, toStep: 7 });
    // The admins' item stays a plain booking line.
    const admin = broadcastToAdmins.mock.calls[0][0].message as { fr: string };
    expect(admin.fr).not.toContain('Étapes');
  });

  it('names no range on a cheque settling a batch an admin released by hand', async () => {
    const { listener, create } = makeListener({
      fromStep: 5,
      toStep: 7,
      status: BatchStatus.unlocked,
      unlockSource: BatchUnlockSource.manual,
    });

    await listener.onCashPaymentRecorded({
      ...payment,
      method: PaymentMethod.cheque,
    });

    const [row] = create.mock.calls[0];
    expect((row.message as { fr: string }).fr).toBe(
      "793.000 TND par chèque pour le patient Sarah (ORD-1) ont été enregistrés par l'équipe — échéance n°2.",
    );
    expect(row.metadata).toMatchObject({ fromStep: null, toStep: null });
  });

  it("still tells the doctor when resolving the admins' rows fails", async () => {
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { listener, create, resolveSubject } = makeListener();
    resolveSubject.mockRejectedValueOnce(new Error('db down'));

    await listener.onPaymentConfirmed(payment);

    expect(create).toHaveBeenCalledTimes(1);
    logError.mockRestore();
  });

  it('appends « Motif : … » to an installment refusal', async () => {
    const { listener, create, resolveSubject } = makeListener();

    await listener.onPaymentRejected({
      ...payment,
      rejectionReason: 'Montant illisible',
    });

    expect(resolveSubject).toHaveBeenCalledWith(`installment:${PAYMENT_ID}`);
    const [row] = create.mock.calls[0];
    expect(row.type).toBe(NotificationType.payment_rejected);
    expect((row.message as { fr: string }).fr).toMatch(
      / Motif : Montant illisible$/,
    );
    expect((row.message as { en: string }).en).toMatch(
      / Reason: Montant illisible$/,
    );
    expect(row.metadata).toMatchObject({
      rejectionReason: 'Montant illisible',
    });
  });

  it('tells the doctor of a fee refusal with the reason, and closes the subject', async () => {
    const { listener, create, resolveSubject } = makeListener();
    const rejected: TreatmentFeeRejectedEvent = {
      ...fee,
      declaredAt: DECLARED_AT,
      rejectionReason: 'Mauvais RIB',
      rejectedById: 'u-admin',
    };

    await listener.onTreatmentFeeRejected(rejected);

    expect(resolveSubject).toHaveBeenCalledWith(FEE_KEY);
    const [row] = create.mock.calls[0];
    expect(row.recipientId).toBe('u-doc');
    expect(row.type).toBe(NotificationType.treatment_fee_rejected);
    expect(row.link).toBe(`/dashboard/orders/${ORDER_ID}`);
    expect((row.message as { fr: string }).fr).toMatch(/ Motif : Mauvais RIB$/);
  });

  it('closes the fee subject on a confirmation; every open one without declaredAt', async () => {
    const first = makeListener();
    await first.listener.onTreatmentFeeConfirmed(fee);
    expect(first.resolveSubject).toHaveBeenCalledWith(FEE_KEY);

    const legacy = makeListener();
    await legacy.listener.onTreatmentFeeConfirmed({
      ...fee,
      declaredAt: undefined,
    });
    expect(legacy.resolveSubject).not.toHaveBeenCalled();
    expect(legacy.resolveTreatmentFeeSubjects).toHaveBeenCalledWith(ORDER_ID);
  });
});

describe('NotificationsListener step batch unlocked (admins only)', () => {
  const unlocked = (
    source: BatchUnlockSource,
    extra: Partial<BatchUnlockedEvent> = {},
  ): BatchUnlockedEvent => ({
    batchId: 'b-2',
    quotationId: 'q-1',
    orderId: ORDER_ID,
    orderCode: 'ORD-1',
    doctorId: 'u-doc',
    doctorName: 'Amine',
    patientName: 'Sarah',
    fromStep: 5,
    toStep: 7,
    batchNumber: 2,
    source,
    installmentNumber: 2,
    ...extra,
  });

  it('a manual unlock: the admins’ item only, never the doctor nor a technician', async () => {
    const { listener, broadcastToAdmins, create } = makeListener();

    await listener.onBatchUnlocked(
      unlocked(BatchUnlockSource.manual, {
        paymentId: null,
        actorId: 'u-admin',
      }),
    );

    expect(broadcastToAdmins).toHaveBeenCalledTimes(1);
    // No per-user row at all: the doctor and the technicians get nothing.
    expect(create).not.toHaveBeenCalled();
    const [row] = broadcastToAdmins.mock.calls[0];
    expect(row.type).toBe(NotificationType.batch_unlocked);
    expect(row.title).toEqual({
      en: 'Step batch unlocked by hand',
      fr: "Lot d'étapes débloqué manuellement",
    });
    expect((row.message as { fr: string }).fr).toBe(
      "Dr Amine · patient Sarah · commande ORD-1 — les étapes 5–7 sont prêtes à livrer. Déblocage manuel : l'échéance reste due.",
    );
    expect(row.metadata).toMatchObject({
      batchId: 'b-2',
      source: BatchUnlockSource.manual,
    });
  });

  it.each([BatchUnlockSource.payment, BatchUnlockSource.installment_cancelled])(
    'an automatic unlock (%s): the admins’ item only, the plain wording',
    async (source) => {
      const { listener, broadcastToAdmins, create } = makeListener();

      await listener.onBatchUnlocked(
        unlocked(source, { paymentId: PAYMENT_ID }),
      );

      expect(broadcastToAdmins).toHaveBeenCalledTimes(1);
      expect(create).not.toHaveBeenCalled();
      const [row] = broadcastToAdmins.mock.calls[0];
      expect(row.title).toEqual({
        en: 'Step batch unlocked',
        fr: "Lot d'étapes débloqué",
      });
      expect((row.message as { en: string }).en).toMatch(
        /steps 5–7 are ready to deliver\.$/,
      );
      expect(row.metadata).toMatchObject({ source });
    },
  );
});

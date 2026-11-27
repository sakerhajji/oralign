import {
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { AppException } from '../../common/exceptions/app.exception';
import { TRANSFER_ERROR } from '../../common/exceptions/domain-error-codes';
import {
  assertConfirmReceipt,
  assertDeclarationReceipt,
  assertSameDeclaration,
  canReadReceipt,
  HIDDEN_FROM_DENTISTS,
  idempotencyKeyReused,
  parseTransferIdempotencyKey,
  paymentForViewer,
  paymentTransferAuditMetadata,
  proofNotFound,
  proofRequired,
  rejectionReasonOrThrow,
  sameDeclarationInstant,
  sameInstant,
  transferAlreadyProcessed,
  transferNotWithdrawable,
  withdrawalNoteOf,
} from './transfer-rules';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const superAdmin: Caller = { userId: 'u-root', role: UserRole.super_admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const otherDoctor: Caller = { userId: 'u-other', role: UserRole.dentist };
const designer: Caller = { userId: 'u-des', role: UserRole.designer };
const technician: Caller = { userId: 'u-tech', role: UserRole.technician };
const d = (value: string) => new Prisma.Decimal(value);

/** The AppException `run` throws (status and stable code), or a failure. */
function thrown(run: () => unknown): AppException {
  try {
    run();
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected an AppException');
}

describe('parseTransferIdempotencyKey (header of a declaration)', () => {
  it.each([undefined, null, '', '   '])('%p means no key', (raw) => {
    expect(parseTransferIdempotencyKey(raw)).toBeNull();
  });

  it.each([
    ['abcdefgh', 'abcdefgh'],
    [
      '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
      '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
    ],
    ['  key_with-dash_9  ', 'key_with-dash_9'],
    ['x'.repeat(128), 'x'.repeat(128)],
  ])('accepts %p', (raw, key) => {
    expect(parseTransferIdempotencyKey(raw)).toBe(key);
  });

  it.each([
    'short',
    'has a space',
    'x'.repeat(129),
    // A header sent twice arrives joined by ", ".
    'abcdefgh, abcdefgh',
    'clé-accentuée',
    'semi;colon1',
    ['abcdefgh'],
    42,
  ])('refuses %p with 400 TRANSFER_IDEMPOTENCY_KEY_INVALID', (raw) => {
    const error = thrown(() => parseTransferIdempotencyKey(raw));
    expect(error.statusCode).toBe(400);
    expect(error.errorCode).toBe(TRANSFER_ERROR.IDEMPOTENCY_KEY_INVALID);
  });

  it('a key reused for another target is a 409', () => {
    const error = idempotencyKeyReused();
    expect(error.statusCode).toBe(409);
    expect(error.errorCode).toBe(TRANSFER_ERROR.IDEMPOTENCY_KEY_REUSED);
  });
});

describe('assertDeclarationReceipt (DECISIONS §1 "Receipt")', () => {
  it('a declaration with its receipt needs no note, whoever declares', () => {
    expect(
      assertDeclarationReceipt({ caller: doctor, hasReceipt: true }),
    ).toBeNull();
    expect(
      assertDeclarationReceipt({
        caller: admin,
        hasReceipt: true,
        overrideNote: 'ignored here',
      }),
    ).toBeNull();
  });

  it('a dentist never declares without a receipt: 400 PROOF_REQUIRED, a note changes nothing', () => {
    for (const overrideNote of [undefined, 'Je vous envoie le reçu demain']) {
      const error = thrown(() =>
        assertDeclarationReceipt({
          caller: doctor,
          hasReceipt: false,
          overrideNote,
        }),
      );
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_REQUIRED);
    }
  });

  it.each([undefined, '', '  ab  ', 'x'.repeat(501), 12])(
    'an admin without a receipt needs a 3-500 note (%p: 400 PROOF_OVERRIDE_NOTE_REQUIRED)',
    (overrideNote) => {
      const error = thrown(() =>
        assertDeclarationReceipt({
          caller: admin,
          hasReceipt: false,
          overrideNote,
        }),
      );
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_OVERRIDE_NOTE_REQUIRED);
    },
  );

  it('an admin (or super admin) with a note declares; the note is trimmed', () => {
    expect(
      assertDeclarationReceipt({
        caller: admin,
        hasReceipt: false,
        overrideNote: '  Virement vu sur le relevé  ',
      }),
    ).toBe('Virement vu sur le relevé');
    expect(
      assertDeclarationReceipt({
        caller: superAdmin,
        hasReceipt: false,
        overrideNote: 'abc',
      }),
    ).toBe('abc');
  });

  it('proofRequired is the stable 400', () => {
    expect(proofRequired().errorCode).toBe(TRANSFER_ERROR.PROOF_REQUIRED);
  });
});

describe('assertConfirmReceipt', () => {
  it('a transfer with its receipt is confirmed without a note', () => {
    expect(assertConfirmReceipt(true)).toBeNull();
    expect(assertConfirmReceipt(true, 'not needed')).toBeNull();
  });

  it('without a receipt the admin gives a trimmed 3-500 note', () => {
    expect(assertConfirmReceipt(false, '  Relevé du 12/11  ')).toBe(
      'Relevé du 12/11',
    );
    for (const note of [undefined, '', 'no', 'x'.repeat(501)]) {
      const error = thrown(() => assertConfirmReceipt(false, note));
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_OVERRIDE_NOTE_REQUIRED);
    }
  });
});

describe('canReadReceipt (owning dentist and admins only)', () => {
  it.each([
    [admin, true],
    [superAdmin, true],
    [doctor, true],
    [otherDoctor, false],
    [designer, false],
    [technician, false],
    [null, false],
    [undefined, false],
  ])('%p → %p', (caller, expected) => {
    expect(canReadReceipt(caller, 'u-doc')).toBe(expected);
  });

  it('a designer assigned to the order still cannot (spec §1)', () => {
    // Even with the doctor's own id, only the dentist role reads.
    expect(
      canReadReceipt({ userId: 'u-doc', role: UserRole.designer }, 'u-doc'),
    ).toBe(false);
  });

  it('proofNotFound is the stable 404', () => {
    const error = proofNotFound();
    expect(error.statusCode).toBe(404);
    expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_NOT_FOUND);
  });
});

describe('rejectionReasonOrThrow (3-500, trimmed)', () => {
  it('trims the reason', () => {
    expect(rejectionReasonOrThrow('  Montant différent du relevé  ')).toBe(
      'Montant différent du relevé',
    );
    expect(rejectionReasonOrThrow('abc')).toBe('abc');
    expect(rejectionReasonOrThrow('x'.repeat(500))).toHaveLength(500);
  });

  it.each([undefined, null, '', '   ', 'ab', '  ab  ', 'x'.repeat(501), 42])(
    '%p is a 400 REJECTION_REASON_INVALID',
    (raw) => {
      const error = thrown(() => rejectionReasonOrThrow(raw));
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe(TRANSFER_ERROR.REJECTION_REASON_INVALID);
    },
  );
});

describe('withdrawalNoteOf', () => {
  it('trims, caps at 500, and reads blank or absent as no note', () => {
    expect(withdrawalNoteOf('  Mauvais fichier  ')).toBe('Mauvais fichier');
    expect(withdrawalNoteOf('x'.repeat(600))).toHaveLength(500);
    expect(withdrawalNoteOf('   ')).toBeNull();
    expect(withdrawalNoteOf(undefined)).toBeNull();
    expect(withdrawalNoteOf(7)).toBeNull();
  });
});

describe('the 409s of a transfer no longer awaiting', () => {
  it('TRANSFER_ALREADY_PROCESSED carries the status it found', () => {
    const error = transferAlreadyProcessed(PaymentRecordStatus.rejected);
    expect(error.statusCode).toBe(409);
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
    expect(error.details).toEqual({ status: 'rejected' });
    expect(transferAlreadyProcessed(undefined).details).toEqual({
      status: null,
    });
  });

  it('TRANSFER_NOT_WITHDRAWABLE carries the status it found', () => {
    const error = transferNotWithdrawable(PaymentRecordStatus.success);
    expect(error.statusCode).toBe(409);
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_NOT_WITHDRAWABLE);
    expect(error.details).toEqual({ status: 'success' });
  });
});

describe('declaration instants', () => {
  const at = new Date('2026-11-27T09:30:00.123Z');

  it('sameInstant compares to the millisecond, a Date or its ISO string', () => {
    expect(sameInstant(at, at.toISOString())).toBe(true);
    expect(sameInstant(at, new Date(at.getTime() + 1))).toBe(false);
    expect(sameInstant(at, null)).toBe(false);
    expect(sameInstant(null, null)).toBe(false);
    expect(sameInstant('not a date', 'not a date')).toBe(false);
  });

  it('sameDeclarationInstant also matches two legacy declarations without an instant', () => {
    expect(sameDeclarationInstant(null, undefined)).toBe(true);
    expect(sameDeclarationInstant(at, null)).toBe(false);
    expect(sameDeclarationInstant(at, at.toISOString())).toBe(true);
  });

  it('assertSameDeclaration: a receipt replaced since the admin opened it is a 409', () => {
    expect(() =>
      assertSameDeclaration(
        at,
        undefined,
        PaymentRecordStatus.awaiting_confirmation,
      ),
    ).not.toThrow();
    expect(() =>
      assertSameDeclaration(
        at,
        at.toISOString(),
        PaymentRecordStatus.awaiting_confirmation,
      ),
    ).not.toThrow();
    const error = thrown(() =>
      assertSameDeclaration(
        at,
        '2026-11-27T08:00:00.000Z',
        PaymentRecordStatus.awaiting_confirmation,
      ),
    );
    expect(error.statusCode).toBe(409);
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
  });
});

describe('paymentTransferAuditMetadata (CONTRACT §5, never a path)', () => {
  it('describes the installment settled, the cash, the stamp and the retenue', () => {
    // 1 000 + 1 stamp - 10 retenue (1 %) = 991 cash.
    const metadata = paymentTransferAuditMetadata(
      {
        paymentMethod: PaymentMethod.bank_transfer,
        amount: d('991.000'),
        withholdingRate: d('1.00'),
        withholdingAmount: d('10.000'),
        stampAmount: d('1.000'),
        proofUrl: '/uploads/orders/o-1/payment-proofs/r.pdf',
      },
      2,
      { replacedPaymentId: 'p-old' },
    );
    expect(metadata).toEqual({
      installmentNumber: 2,
      method: 'bank_transfer',
      amount: 1000,
      cashAmount: 991,
      stampAmount: 1,
      withholdingRate: 1,
      withholdingAmount: 10,
      hasProof: true,
      replacedPaymentId: 'p-old',
    });
    expect(JSON.stringify(metadata)).not.toMatch(/uploads|proofUrl|path/i);
  });

  it('leaves out what is not there: no stamp, no retenue, cash = amount, no receipt', () => {
    expect(
      paymentTransferAuditMetadata(
        {
          paymentMethod: PaymentMethod.bank_transfer,
          amount: d('500.000'),
          withholdingRate: null,
          withholdingAmount: d('0'),
          stampAmount: d('0'),
          proofUrl: null,
        },
        undefined,
        { overrideNote: 'Relevé vu', reason: null },
      ),
    ).toEqual({
      installmentNumber: null,
      method: 'bank_transfer',
      amount: 500,
      hasProof: false,
      overrideNote: 'Relevé vu',
    });
  });

  it('carries the refusal reason', () => {
    expect(
      paymentTransferAuditMetadata(
        { paymentMethod: PaymentMethod.bank_transfer, amount: '100' },
        1,
        { reason: 'Montant différent' },
      ),
    ).toMatchObject({
      amount: 100,
      reason: 'Montant différent',
      hasProof: false,
    });
  });
});

describe('paymentForViewer (what a caller reads of a Payment)', () => {
  const row = {
    id: 'p-1',
    amount: '991.000',
    proofUrl: '/uploads/orders/o-1/payment-proofs/r.pdf',
    notes: 'admin note',
    idempotencyKey: 'card-key',
    initiatedById: 'u-doc',
    confirmedById: 'u-admin',
    rejectedById: null,
    reviewOpenedById: 'u-admin',
    reviewOpenedByName: 'Admin One',
    cancelledById: null,
    cancelledByName: null,
    declarationKey: 'decl-key-1',
    reviewOpenedAt: '2026-11-27T09:00:00.000Z',
    cancelledAt: null,
  };

  it('an admin reads every column, hasProof added', () => {
    expect(paymentForViewer(row, admin)).toEqual({ ...row, hasProof: true });
  });

  it("the owning dentist keeps the receipt (to stream it) but none of the admin's columns", () => {
    const seen = paymentForViewer(row, doctor) as Record<string, unknown>;
    expect(seen.hasProof).toBe(true);
    expect(seen.proofUrl).toBe(row.proofUrl);
    expect(seen.reviewOpenedAt).toBe(row.reviewOpenedAt);
    for (const key of Object.keys(HIDDEN_FROM_DENTISTS)) {
      expect(seen).not.toHaveProperty(key);
    }
  });

  it.each([designer, technician])(
    '%p never reads the receipt path, only hasProof',
    (caller) => {
      const seen = paymentForViewer(row, caller) as Record<string, unknown>;
      expect(seen).not.toHaveProperty('proofUrl');
      expect(seen.hasProof).toBe(true);
      expect(seen).not.toHaveProperty('declarationKey');
    },
  );

  it('hasProof is false without a receipt, and the input is not mutated', () => {
    const input = { ...row, proofUrl: null };
    expect(paymentForViewer(input, admin).hasProof).toBe(false);
    expect(input).not.toHaveProperty('hasProof');
  });

  it('dentists never see who reviewed, cancelled or the declaration key', () => {
    expect(Object.keys(HIDDEN_FROM_DENTISTS)).toEqual(
      expect.arrayContaining([
        'reviewOpenedById',
        'reviewOpenedByName',
        'cancelledById',
        'cancelledByName',
        'declarationKey',
        'notes',
      ]),
    );
  });
});

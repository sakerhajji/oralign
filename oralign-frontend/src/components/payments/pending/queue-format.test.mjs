// Run: node --test src/components/payments/pending/queue-format.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The admin pending desk's pure rules: its address, how a row reads and
// what Confirm / Refuse may send. The bounds mirror the backend
// (validReason 3-500, TRANSFER_QUEUE_RECENT_DAYS, subject keys).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_QUEUE_TAB,
  QUEUE_TABS,
  adoptAddressReview,
  confirmProblem,
  isAlreadyProcessed,
  isAwaiting,
  isSubjectKeyLike,
  queueUrlSearch,
  readQueueUrl,
  reasonProblem,
  receiptDisplayKind,
  receiptFileName,
  resolveReviewTarget,
  reviewStartState,
  reviewStep,
  rowInstant,
  rowSplit,
  rowSubjectLabel,
  transferRefOf,
} from './queue-format.ts';

const PAYMENT_KEY = 'installment:2b9c1f9e-6a43-4c1e-8a57-0b1c1d2e3f40';
const FEE_KEY = 'treatment_fee:7d0e5a21-1f2b-4c3d-9e8f-001122334455:1795777200000';

const amounts = (over = {}) => ({
  due: 793,
  stamp: 0,
  withholdingRate: null,
  withholding: 0,
  cash: 793,
  currency: 'TND',
  ...over,
});

describe('readQueueUrl / queueUrlSearch', () => {
  it('opens À vérifier on page 1 by default, and falls back on anything unknown', () => {
    assert.deepEqual(readQueueUrl(''), { filter: DEFAULT_QUEUE_TAB, page: 1, review: null });
    assert.deepEqual(readQueueUrl('?filter=everything&page=-3&review=../../etc'), {
      filter: 'a_verifier',
      page: 1,
      review: null,
    });
    assert.deepEqual(readQueueUrl('?page=2.5'), { filter: 'a_verifier', page: 1, review: null });
  });

  it('reads every tab, a page and a notification subject to open', () => {
    for (const filter of QUEUE_TABS) assert.equal(readQueueUrl(`?filter=${filter}`).filter, filter);
    const state = readQueueUrl(
      new URLSearchParams({ filter: 'nouveau', page: '3', review: FEE_KEY }),
    );
    assert.deepEqual(state, { filter: 'nouveau', page: 3, review: FEE_KEY });
  });

  it('writes a clean address: defaults implicit, other params kept', () => {
    assert.equal(
      queueUrlSearch({ filter: 'a_verifier', page: 1, review: null }, '?filter=valide&page=4'),
      '',
    );
    assert.equal(
      queueUrlSearch({ filter: 'refuse', page: 2, review: null }, '?utm=x&review=old'),
      '?utm=x&filter=refuse&page=2',
    );
    const withReview = queueUrlSearch({ filter: 'a_verifier', page: 1, review: PAYMENT_KEY }, '');
    assert.equal(readQueueUrl(withReview).review, PAYMENT_KEY);
  });

  it('round-trips every state', () => {
    for (const filter of QUEUE_TABS) {
      for (const page of [1, 2, 9]) {
        const state = { filter, page, review: null };
        assert.deepEqual(readQueueUrl(queueUrlSearch(state, '')), state);
      }
    }
  });
});

describe('isSubjectKeyLike', () => {
  it('accepts the two subject shapes only', () => {
    assert.equal(isSubjectKeyLike(PAYMENT_KEY), true);
    assert.equal(isSubjectKeyLike(FEE_KEY), true);
    for (const bad of [
      null,
      42,
      '',
      'installment:',
      'installment:a:b',
      'treatment_fee:abc',
      'treatment_fee:abc:12.5',
      'payment:abc',
      'installment:<script>',
      `installment:${'a'.repeat(65)}`,
    ]) {
      assert.equal(isSubjectKeyLike(bad), false, String(bad));
    }
  });
});

describe('resolveReviewTarget', () => {
  const rows = [{ subjectKey: FEE_KEY }, { subjectKey: PAYMENT_KEY }];

  it('waits for the tab, then finds the row or says it left the queue', () => {
    assert.deepEqual(resolveReviewTarget(null, rows), { kind: 'none' });
    assert.deepEqual(resolveReviewTarget(PAYMENT_KEY, undefined), { kind: 'pending' });
    assert.deepEqual(resolveReviewTarget(PAYMENT_KEY, rows), { kind: 'found', index: 1 });
    assert.deepEqual(resolveReviewTarget('installment:gone', rows), { kind: 'gone' });
    assert.deepEqual(resolveReviewTarget(PAYMENT_KEY, []), { kind: 'gone' });
  });
});

describe('reviewStep', () => {
  const pageOf = (page, totalPages, keys) => ({
    page,
    totalPages,
    data: keys.map((subjectKey) => ({ subjectKey })),
  });

  it('opens the row on the loaded page', () => {
    assert.deepEqual(reviewStep(PAYMENT_KEY, 'a_verifier', pageOf(1, 3, [FEE_KEY, PAYMENT_KEY])), {
      kind: 'found',
      index: 1,
    });
    assert.deepEqual(reviewStep(null, 'a_verifier', pageOf(1, 1, [])), { kind: 'none' });
    assert.deepEqual(reviewStep(PAYMENT_KEY, 'a_verifier', undefined), { kind: 'pending' });
  });

  it('looks on the next page before saying an older transfer is gone', () => {
    // 25 rows a page, newest first: an older transfer still awaiting is on
    // page 2, and must not be reported « plus en attente » from page 1.
    assert.deepEqual(reviewStep(PAYMENT_KEY, 'a_verifier', pageOf(1, 3, [FEE_KEY])), {
      kind: 'next_page',
      page: 2,
    });
    assert.deepEqual(reviewStep(PAYMENT_KEY, 'a_verifier', pageOf(2, 3, [FEE_KEY])), {
      kind: 'next_page',
      page: 3,
    });
    assert.deepEqual(reviewStep(PAYMENT_KEY, 'a_verifier', pageOf(3, 3, [PAYMENT_KEY])), {
      kind: 'found',
      index: 0,
    });
  });

  it('is final only once the whole À vérifier tab was searched', () => {
    assert.deepEqual(reviewStep(PAYMENT_KEY, 'a_verifier', pageOf(3, 3, [FEE_KEY])), {
      kind: 'gone',
      final: true,
    });
    // An empty tab: nothing awaits at all.
    assert.deepEqual(reviewStep(PAYMENT_KEY, 'a_verifier', pageOf(1, 0, [])), {
      kind: 'gone',
      final: true,
    });
    // Another tab says nothing about the transfer still awaiting.
    for (const filter of ['nouveau', 'valide', 'refuse']) {
      assert.deepEqual(reviewStep(PAYMENT_KEY, filter, pageOf(1, 1, [FEE_KEY])), {
        kind: 'gone',
        final: false,
      });
    }
  });
});

describe('a ?review= link while the desk is open', () => {
  const desk = (over = {}) => ({ filter: 'a_verifier', page: 1, review: null, ...over });

  it('searches from page 1 whatever page the address names', () => {
    assert.deepEqual(reviewStartState(desk({ page: 4, review: PAYMENT_KEY })), desk({ review: PAYMENT_KEY }));
    const noReview = desk({ filter: 'valide', page: 4 });
    assert.equal(reviewStartState(noReview), noReview);
  });

  it('adopts a new subject with the link’s tab', () => {
    // The admin is on Validés page 2; the bell link is ?review=<key>.
    const state = desk({ filter: 'valide', page: 2 });
    const address = readQueueUrl(`?review=${encodeURIComponent(PAYMENT_KEY)}`);
    assert.deepEqual(adoptAddressReview(null, address, state), desk({ review: PAYMENT_KEY }));
    // The same link clicked again after the desk cleared it (null in between).
    assert.deepEqual(adoptAddressReview(null, address, desk()), desk({ review: PAYMENT_KEY }));
    // Another notification while one is being searched.
    assert.deepEqual(
      adoptAddressReview(PAYMENT_KEY, readQueueUrl(`?review=${FEE_KEY}`), desk({ review: PAYMENT_KEY })),
      desk({ review: FEE_KEY }),
    );
  });

  it('ignores the desk’s own writes coming back through the address', () => {
    // Tab and page writes carry no subject.
    assert.equal(adoptAddressReview(null, readQueueUrl('?filter=refuse&page=2'), desk()), null);
    // The subject cleared once handled.
    assert.equal(adoptAddressReview(PAYMENT_KEY, readQueueUrl(''), desk()), null);
    // The subject already seen, or already being opened.
    const address = readQueueUrl(`?review=${PAYMENT_KEY}`);
    assert.equal(adoptAddressReview(PAYMENT_KEY, address, desk()), null);
    assert.equal(adoptAddressReview(null, address, desk({ review: PAYMENT_KEY })), null);
  });
});

describe('row reading', () => {
  it('offers Confirm / Refuse only while awaiting', () => {
    assert.equal(isAwaiting({ status: 'awaiting_confirmation' }), true);
    for (const status of ['success', 'rejected', 'cancelled', 'pending']) {
      assert.equal(isAwaiting({ status }), false, status);
    }
  });

  it('addresses an installment by its payment and a fee by its order', () => {
    assert.deepEqual(
      transferRefOf({ kind: 'installment', orderId: 'o1', paymentId: 'p1', extra: 1 }),
      { kind: 'installment', orderId: 'o1', paymentId: 'p1' },
    );
    assert.deepEqual(transferRefOf({ kind: 'treatment_fee', orderId: 'o2', paymentId: null }), {
      kind: 'treatment_fee',
      orderId: 'o2',
      paymentId: null,
    });
  });

  it('dates a row by its declaration, else its processing', () => {
    assert.equal(rowInstant({ declaredAt: 'A', processedAt: 'B' }), 'A');
    assert.equal(rowInstant({ declaredAt: null, processedAt: 'B' }), 'B');
    assert.equal(rowInstant({ declaredAt: null, processedAt: null }), null);
  });

  it('names what the transfer is for', () => {
    assert.deepEqual(rowSubjectLabel({ kind: 'installment', installmentNumber: 2 }), {
      key: 'pendingDesk.kind.installment',
      vars: { n: 2 },
    });
    assert.deepEqual(rowSubjectLabel({ kind: 'installment', installmentNumber: null }), {
      key: 'pendingDesk.kind.installmentNoRank',
    });
    assert.deepEqual(rowSubjectLabel({ kind: 'treatment_fee', installmentNumber: null }), {
      key: 'pendingDesk.kind.treatment_fee',
    });
  });

  it('splits the money only when a stamp or a retenue applies', () => {
    assert.equal(rowSplit({ amounts: amounts() }), null);
    assert.deepEqual(
      rowSplit({
        amounts: amounts({ stamp: 1, withholding: 7.93, withholdingRate: 1, cash: 786.07 }),
      }),
      { due: 793, stamp: 1, withheld: 7.93, cash: 786.07, rate: 1 },
    );
    // A stamp alone: no rate shown.
    assert.deepEqual(rowSplit({ amounts: amounts({ stamp: 1, withholdingRate: 1, cash: 794 }) }), {
      due: 793,
      stamp: 1,
      withheld: 0,
      cash: 794,
      rate: null,
    });
  });
});

describe('reasonProblem / confirmProblem', () => {
  it('bounds a refusal reason at 3-500 trimmed characters', () => {
    assert.equal(reasonProblem(''), 'empty');
    assert.equal(reasonProblem('    '), 'empty');
    assert.equal(reasonProblem(' ab '), 'short');
    assert.equal(reasonProblem('abc'), null);
    assert.equal(reasonProblem(`  ${'x'.repeat(500)}  `), null);
    assert.equal(reasonProblem('x'.repeat(501)), 'long');
  });

  it('needs a justification note to confirm a transfer without a receipt', () => {
    assert.equal(confirmProblem({ hasProof: true, overrideNote: '', notes: '' }), null);
    assert.equal(confirmProblem({ hasProof: false, overrideNote: '', notes: '' }), 'override');
    assert.equal(confirmProblem({ hasProof: false, overrideNote: 'ok', notes: '' }), 'override');
    assert.equal(confirmProblem({ hasProof: false, overrideNote: 'vu sur relevé', notes: '' }), null);
    assert.equal(
      confirmProblem({ hasProof: true, overrideNote: '', notes: 'n'.repeat(501) }),
      'notes',
    );
  });
});

describe('isAlreadyProcessed', () => {
  it('reads the 409s of a transfer someone else closed as « déjà traité »', () => {
    for (const errorCode of [
      'TRANSFER_ALREADY_PROCESSED',
      'INSTALLMENT_ALREADY_PAID',
      'TRANSFER_NOT_WITHDRAWABLE',
    ]) {
      assert.equal(isAlreadyProcessed({ status: 409, errorCode }), true, errorCode);
    }
    assert.equal(isAlreadyProcessed({ status: 409, errorCode: 'PAYMENT_ATTEMPT_IN_PROGRESS' }), false);
    assert.equal(isAlreadyProcessed({ status: 409, errorCode: null }), false);
    assert.equal(
      isAlreadyProcessed({ status: 400, errorCode: 'TRANSFER_ALREADY_PROCESSED' }),
      false,
    );
  });
});

describe('receipt file', () => {
  it('names a download after the order and the installment, never a path', () => {
    assert.equal(receiptFileName('ORD-12', 2, 'application/pdf'), 'recu-ORD-12-echeance-2.pdf');
    assert.equal(receiptFileName('ORD-12', null, 'image/jpeg; charset=x'), 'recu-ORD-12-honoraires.jpg');
    assert.equal(receiptFileName('../../a b', 1, 'image/png'), 'recu-a-b-echeance-1.png');
    assert.equal(receiptFileName('///', null, 'text/html'), 'recu-transfer-honoraires.bin');
  });

  it('previews raster images and PDFs only', () => {
    assert.equal(receiptDisplayKind('application/pdf'), 'pdf');
    assert.equal(receiptDisplayKind('IMAGE/WEBP'), 'image');
    assert.equal(receiptDisplayKind('image/png'), 'image');
    assert.equal(receiptDisplayKind('image/svg+xml'), 'other');
    assert.equal(receiptDisplayKind('application/octet-stream'), 'other');
    assert.equal(receiptDisplayKind(null), 'other');
  });
});

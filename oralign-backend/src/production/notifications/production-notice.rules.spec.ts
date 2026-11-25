import { ProductionNoticeStatus } from '@prisma/client';
import {
  NOTICE_MAX_ATTEMPTS,
  NOTICE_RETRY_BACKOFF_MS,
} from '../production.constants';
import {
  LAST_ERROR_MAX_LENGTH,
  correctionDecision,
  errorText,
  isFinalAttempt,
  retryDelayMs,
} from './production-notice.rules';

describe('retryDelayMs', () => {
  it('follows NOTICE_RETRY_BACKOFF_MS[attempts - 1], its last value repeating', () => {
    expect(retryDelayMs(1)).toBe(NOTICE_RETRY_BACKOFF_MS[0]);
    expect(retryDelayMs(2)).toBe(NOTICE_RETRY_BACKOFF_MS[1]);
    const last = NOTICE_RETRY_BACKOFF_MS[NOTICE_RETRY_BACKOFF_MS.length - 1];
    expect(retryDelayMs(NOTICE_RETRY_BACKOFF_MS.length)).toBe(last);
    expect(retryDelayMs(NOTICE_RETRY_BACKOFF_MS.length + 3)).toBe(last);
  });

  it('never indexes below the first value', () => {
    expect(retryDelayMs(0)).toBe(NOTICE_RETRY_BACKOFF_MS[0]);
  });
});

describe('isFinalAttempt', () => {
  it('is final from NOTICE_MAX_ATTEMPTS on', () => {
    expect(isFinalAttempt(NOTICE_MAX_ATTEMPTS - 1)).toBe(false);
    expect(isFinalAttempt(NOTICE_MAX_ATTEMPTS)).toBe(true);
  });
});

describe('errorText', () => {
  it('keeps the message on one line', () => {
    expect(errorText(new Error('550 mailbox\n  unavailable'))).toBe(
      '550 mailbox unavailable',
    );
  });

  it(`is bounded to ${LAST_ERROR_MAX_LENGTH} characters`, () => {
    const text = errorText(new Error('x'.repeat(2000)));
    expect(text.length).toBe(LAST_ERROR_MAX_LENGTH);
    expect(text.endsWith('…')).toBe(true);
  });

  it('names something for non-Error throws', () => {
    expect(errorText('boom')).toBe('boom');
    expect(errorText(undefined)).toBe('Unknown error');
    expect(errorText(new Error(''))).toBe('Error');
  });
});

describe('correctionDecision — against the delivered notice of the same channel', () => {
  const original = (status: ProductionNoticeStatus, attempts = 0) => ({
    status,
    attempts,
  });

  it('sends once the original reached the practitioner', () => {
    expect(correctionDecision(original(ProductionNoticeStatus.sent))).toBe(
      'send',
    );
  });

  it('skips when the original never will (skipped, failed for good, never written)', () => {
    expect(correctionDecision(original(ProductionNoticeStatus.skipped))).toBe(
      'skip',
    );
    expect(
      correctionDecision(
        original(ProductionNoticeStatus.failed, NOTICE_MAX_ATTEMPTS),
      ),
    ).toBe('skip');
    expect(correctionDecision(null)).toBe('skip');
  });

  it('waits while the original is still in flight', () => {
    expect(correctionDecision(original(ProductionNoticeStatus.pending))).toBe(
      'wait',
    );
    expect(correctionDecision(original(ProductionNoticeStatus.sending))).toBe(
      'wait',
    );
    expect(correctionDecision(original(ProductionNoticeStatus.failed, 2))).toBe(
      'wait',
    );
  });
});

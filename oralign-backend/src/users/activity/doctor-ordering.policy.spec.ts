import { VerificationStatus } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import {
  assertDoctorCanOrder,
  assertDoctorCanOrderLocked,
  assertNotDormant,
  PUBLIC_PRACTITIONER_PROFILE_WHERE,
  PUBLIC_PRACTITIONER_USER_WHERE,
} from './doctor-ordering.policy';

async function refusal(run: () => unknown) {
  try {
    await run();
  } catch (error) {
    return error as AppException;
  }
  return null;
}

describe('doctor ordering policy', () => {
  it('refuses a dormant doctor with 403 ACCOUNT_DORMANT', async () => {
    const error = await refusal(() =>
      assertNotDormant({ inactiveSince: new Date() }),
    );
    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({
      statusCode: 403,
      errorCode: 'ACCOUNT_DORMANT',
    });
  });

  it('lets an active doctor, and an unknown row, through', () => {
    expect(() => assertNotDormant({ inactiveSince: null })).not.toThrow();
    expect(() => assertNotDormant(null)).not.toThrow();
  });

  it('reads only inactiveSince by primary key', async () => {
    const findUnique = jest.fn().mockResolvedValue({ inactiveSince: null });
    await assertDoctorCanOrder({ user: { findUnique } }, 'u-doc');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u-doc' },
      select: { inactiveSince: true },
    });

    findUnique.mockResolvedValue({ inactiveSince: new Date() });
    await expect(
      assertDoctorCanOrder({ user: { findUnique } }, 'u-doc'),
    ).rejects.toMatchObject({ errorCode: 'ACCOUNT_DORMANT' });
  });

  it('locks the doctor row FOR KEY SHARE on the submit paths', async () => {
    const $queryRaw = jest
      .fn()
      .mockResolvedValue([{ inactiveSince: new Date() }]);
    await expect(
      assertDoctorCanOrderLocked({ $queryRaw } as never, 'u-doc'),
    ).rejects.toMatchObject({ statusCode: 403 });
    const [strings, doctorId] = ($queryRaw.mock.calls as unknown[][])[0];
    const sql = (strings as string[]).join('?');
    expect(sql).toContain('FOR KEY SHARE');
    expect(sql).toContain('"User"');
    expect(doctorId).toBe('u-doc');

    $queryRaw.mockResolvedValue([{ inactiveSince: null }]);
    await expect(
      assertDoctorCanOrderLocked({ $queryRaw } as never, 'u-doc'),
    ).resolves.toBeUndefined();
  });

  it('hides dormant practitioners from the public directory and booking', () => {
    expect(PUBLIC_PRACTITIONER_USER_WHERE).toEqual({
      verificationStatus: VerificationStatus.approved,
      isActive: true,
      deletedAt: null,
      inactiveSince: null,
    });
    expect(PUBLIC_PRACTITIONER_PROFILE_WHERE).toEqual({
      deletedAt: null,
      isListedPublicly: true,
      user: PUBLIC_PRACTITIONER_USER_WHERE,
    });
  });
});

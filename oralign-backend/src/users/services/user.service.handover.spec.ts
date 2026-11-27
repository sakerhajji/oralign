import { Logger } from '@nestjs/common';
import { UserRole, VerificationStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { MailService } from '../../mail/mail.service';
import type { Caller } from '../../common/access/caller';
import type {
  UserRepository,
  UserWithProfile,
} from '../repositories/user.repository';
import { UserService } from './user.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DoctorActivityService } from '../activity/doctor-activity.service';

// Real bcryptjs at cost 12 (hash + compare per test) can pass 5 s when the
// Docker image build runs this suite next to `next build`.
jest.setTimeout(30_000);

/**
 * Password handovers (CONTRACT.md §2.4): generated passwords, the lab
 * technician account defaults, the technician-only temporary password,
 * the force reset, their trace columns and their audit line.
 */

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

const row = (over: Partial<UserWithProfile> = {}): UserWithProfile =>
  ({
    id: 'u-1',
    email: 'tech@lab.tn',
    fullName: 'Technicienne',
    phone: null,
    role: UserRole.technician,
    isActive: true,
    isEmailVerified: true,
    avatarUrl: null,
    country: null,
    preferredLanguage: 'fr',
    lastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    verificationStatus: VerificationStatus.approved,
    welcomeGiftUsedAt: null,
    mustChangePassword: false,
    dentistProfile: null,
    doctorOrders: [],
    ...over,
  }) as unknown as UserWithProfile;

function makeService(
  repo: Partial<Record<keyof UserRepository, jest.Mock>>,
  mail: Partial<Record<keyof MailService, jest.Mock>> = {},
) {
  // Not under test here: no activity block, no profile listener.
  const activity = { summaries: jest.fn().mockResolvedValue(new Map()) };
  return new UserService(
    repo as unknown as UserRepository,
    mail as unknown as MailService,
    activity as unknown as DoctorActivityService,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );
}

function creatingRepo() {
  return {
    findByEmail: jest.fn().mockResolvedValue(null),
    findByPhone: jest.fn().mockResolvedValue(null),
    create: jest.fn((data: Partial<UserWithProfile>) =>
      Promise.resolve(row({ ...data, id: 'u-new' })),
    ),
  };
}

type CreateData = {
  passwordHash: string;
  role?: UserRole;
  mustChangePassword?: boolean;
  isEmailVerified?: boolean;
  verificationStatus?: VerificationStatus;
  preferredLanguage?: string;
  temporaryPasswordIssuedAt?: Date;
  temporaryPasswordIssuedById?: string;
};

const created = (repo: ReturnType<typeof creatingRepo>) =>
  (repo.create.mock.calls as unknown[][])[0][0] as CreateData;

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
});

/** Every warn line, joined: what an operator's log shipper would receive. */
const logged = () =>
  (warn.mock.calls as unknown[][]).map((call) => String(call[0])).join('\n');

describe('UserService.createUser — technician accounts', () => {
  const base = { email: 'tech@lab.tn', fullName: 'Technicienne' };

  it('ready at once: verified, approved, French, and on a temporary password', async () => {
    const repo = creatingRepo();
    const mail = { sendApprovalGrantedEmail: jest.fn() };
    await makeService(repo, mail).createUser(
      { ...base, password: 'Typed-Passw0rd', role: UserRole.technician },
      admin,
    );
    expect(created(repo)).toMatchObject({
      role: UserRole.technician,
      isEmailVerified: true,
      verificationStatus: VerificationStatus.approved,
      preferredLanguage: 'fr',
      mustChangePassword: true,
    });
    // A typed password is not a handover: no trace, no audit line.
    expect(created(repo).temporaryPasswordIssuedAt).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    // No e-mail of any kind.
    expect(mail.sendApprovalGrantedEmail).not.toHaveBeenCalled();
  });

  it('a generated password: returned once, hashed, traced and logged without the password', async () => {
    const repo = creatingRepo();
    const result = await makeService(repo).createUser(
      { ...base, generateTemporaryPassword: true, role: UserRole.technician },
      admin,
    );

    expect(result.temporaryPassword).toMatch(/^[A-Za-z2-9]{14}$/);
    expect(result.mustChangePassword).toBe(true);
    const data = created(repo);
    expect(data.passwordHash).not.toBe(result.temporaryPassword);
    await expect(
      bcrypt.compare(result.temporaryPassword!, data.passwordHash),
    ).resolves.toBe(true);
    expect(data.temporaryPasswordIssuedAt).toBeInstanceOf(Date);
    expect(data.temporaryPasswordIssuedById).toBe('u-admin');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(logged()).toBe(
      'Password handed over for user u-new (technician) by u-admin via create',
    );
    expect(logged()).not.toContain(result.temporaryPassword);
  });

  it('a generated password is temporary whatever the role', async () => {
    const repo = creatingRepo();
    const result = await makeService(repo).createUser(
      { ...base, generateTemporaryPassword: true, role: UserRole.designer },
      admin,
    );
    expect(created(repo)).toMatchObject({
      role: UserRole.designer,
      mustChangePassword: true,
    });
    // The technician defaults stay technician-only.
    expect(created(repo).verificationStatus).toBeUndefined();
    expect(created(repo).isEmailVerified).toBeUndefined();
    expect(result.temporaryPassword).toBeDefined();
  });

  it.each([UserRole.dentist, UserRole.admin, UserRole.designer])(
    'a %s an admin creates is French, and still verifies its own e-mail',
    async (role) => {
      const repo = creatingRepo();
      await makeService(repo).createUser(
        { ...base, password: 'Typed-Passw0rd', role },
        admin,
      );
      // The DTO takes no language: French, not the schema's "en" default.
      expect(created(repo).preferredLanguage).toBe('fr');
      // Only the technician is vouched for: the others keep the schema's
      // unverified, pending defaults.
      expect(created(repo).isEmailVerified).toBeUndefined();
      expect(created(repo).verificationStatus).toBeUndefined();
    },
  );

  it('an account without a role (dentist by default) is French too', async () => {
    const repo = creatingRepo();
    await makeService(repo).createUser(
      { ...base, password: 'Typed-Passw0rd' },
      admin,
    );
    expect(created(repo)).toMatchObject({ preferredLanguage: 'fr' });
  });

  it('an ordinary account with a typed password keeps it (no flag, no password in the response)', async () => {
    const repo = creatingRepo();
    const result = await makeService(repo).createUser(
      { ...base, password: 'Typed-Passw0rd', role: UserRole.dentist },
      admin,
    );
    expect(created(repo).mustChangePassword).toBe(false);
    expect(result).not.toHaveProperty('temporaryPassword');
  });

  it('refuses both a password and a generated one, and neither (400, nothing written)', async () => {
    for (const dto of [
      { ...base, password: 'Typed-Passw0rd', generateTemporaryPassword: true },
      { ...base },
      { ...base, generateTemporaryPassword: false },
    ]) {
      const repo = creatingRepo();
      await expect(
        makeService(repo).createUser(dto, admin),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    }
  });
});

describe('UserService.issueTemporaryPassword (POST users/:id/temporary-password)', () => {
  it('one conditional write: new temporary password, sessions revoked, traced and logged', async () => {
    const repo = {
      issueTechnicianPassword: jest.fn().mockResolvedValue(true),
      findAccountState: jest.fn(),
    };
    const { temporaryPassword } = await makeService(
      repo,
    ).issueTemporaryPassword('u-1', admin);

    expect(temporaryPassword).toMatch(/^[A-Za-z2-9]{14}$/);
    expect(repo.issueTechnicianPassword).toHaveBeenCalledTimes(1);
    const [id, data] = repo.issueTechnicianPassword.mock.calls[0] as [
      string,
      { passwordHash: string; issuedAt: Date; issuedById: string },
    ];
    expect(id).toBe('u-1');
    expect(data.issuedById).toBe('u-admin');
    expect(data.issuedAt).toBeInstanceOf(Date);
    await expect(
      bcrypt.compare(temporaryPassword, data.passwordHash),
    ).resolves.toBe(true);
    expect(repo.findAccountState).not.toHaveBeenCalled();
    expect(logged()).toBe(
      'Password handed over for user u-1 (technician) by u-admin via temporary-password',
    );
    expect(logged()).not.toContain(temporaryPassword);
  });

  it.each([
    ['a practitioner', { role: UserRole.dentist, deletedAt: null }],
    ['an admin', { role: UserRole.admin, deletedAt: null }],
    [
      'an archived technician',
      { role: UserRole.technician, deletedAt: new Date() },
    ],
  ])('409 TEMPORARY_PASSWORD_TECHNICIAN_ONLY for %s', async (_label, state) => {
    const repo = {
      issueTechnicianPassword: jest.fn().mockResolvedValue(false),
      findAccountState: jest.fn().mockResolvedValue(state),
    };
    await expect(
      makeService(repo).issueTemporaryPassword('u-1', admin),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'TEMPORARY_PASSWORD_TECHNICIAN_ONLY',
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('404 for an unknown account', async () => {
    const repo = {
      issueTechnicianPassword: jest.fn().mockResolvedValue(false),
      findAccountState: jest.fn().mockResolvedValue(null),
    };
    await expect(
      makeService(repo).issueTemporaryPassword('u-missing', admin),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('UserService.updateUser — admin force reset of another account', () => {
  const editRepo = (target: Partial<UserWithProfile>) => ({
    findById: jest.fn().mockResolvedValue(row(target)),
    findByPhone: jest.fn().mockResolvedValue(null),
    update: jest
      .fn()
      .mockImplementation((_id: string, data: Partial<UserWithProfile>) =>
        Promise.resolve(row({ ...target, ...data })),
      ),
  });
  const updated = (repo: ReturnType<typeof editRepo>) =>
    (repo.update.mock.calls as unknown[][])[0][1] as {
      passwordHash?: string;
      tokenVersion?: unknown;
      mustChangePassword?: boolean;
      temporaryPasswordIssuedAt?: Date;
      temporaryPasswordIssuedById?: string;
    };

  it("a technician's new password is temporary, traced and logged", async () => {
    const repo = editRepo({ id: 'u-1', role: UserRole.technician });
    await makeService(repo).updateUser(
      'u-1',
      { password: 'N3wPassword!' },
      { id: admin.userId, role: UserRole.admin },
    );
    expect(updated(repo)).toMatchObject({
      tokenVersion: { increment: 1 },
      mustChangePassword: true,
      temporaryPasswordIssuedById: 'u-admin',
    });
    expect(updated(repo).temporaryPasswordIssuedAt).toBeInstanceOf(Date);
    expect(logged()).toBe(
      'Password handed over for user u-1 (technician) by u-admin via force-reset',
    );
    expect(logged()).not.toContain('N3wPassword!');
  });

  it('becoming a technician in the same PUT makes the password temporary too', async () => {
    const repo = editRepo({ id: 'u-1', role: UserRole.designer });
    await makeService(repo).updateUser(
      'u-1',
      { password: 'N3wPassword!', role: UserRole.technician },
      { id: admin.userId, role: UserRole.admin },
    );
    expect(updated(repo).mustChangePassword).toBe(true);
  });

  it('another role keeps the reset password (traced, not flagged)', async () => {
    const repo = editRepo({ id: 'u-1', role: UserRole.dentist });
    await makeService(repo).updateUser(
      'u-1',
      { password: 'N3wPassword!' },
      { id: admin.userId, role: UserRole.admin },
    );
    expect(updated(repo)).not.toHaveProperty('mustChangePassword');
    expect(updated(repo).temporaryPasswordIssuedById).toBe('u-admin');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a profile edit without a password is no handover', async () => {
    const repo = editRepo({ id: 'u-1', role: UserRole.technician });
    await makeService(repo).updateUser(
      'u-1',
      { fullName: 'Renamed' },
      { id: admin.userId, role: UserRole.admin },
    );
    expect(updated(repo)).not.toHaveProperty('temporaryPasswordIssuedAt');
    expect(updated(repo)).not.toHaveProperty('mustChangePassword');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('UserService — the response and the approval mail', () => {
  it('exposes mustChangePassword, never the handover trace', async () => {
    const service = makeService({
      findById: jest.fn().mockResolvedValue(
        row({
          mustChangePassword: true,
          temporaryPasswordIssuedAt: new Date(),
          temporaryPasswordIssuedById: 'u-admin',
        } as Partial<UserWithProfile>),
      ),
    });
    const dto = await service.getUserById('u-1');
    expect(dto.mustChangePassword).toBe(true);
    expect(dto).not.toHaveProperty('temporaryPasswordIssuedAt');
    expect(dto).not.toHaveProperty('temporaryPasswordIssuedById');
  });

  it('approving a technician sends no practitioner welcome mail', async () => {
    const mail = {
      sendApprovalGrantedEmail: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(
      {
        findById: jest
          .fn()
          .mockResolvedValue(
            row({ verificationStatus: VerificationStatus.pending }),
          ),
        update: jest
          .fn()
          .mockResolvedValue(
            row({ verificationStatus: VerificationStatus.approved }),
          ),
      },
      mail,
    );
    await service.updateApproval('u-1', VerificationStatus.approved, admin);
    expect(mail.sendApprovalGrantedEmail).not.toHaveBeenCalled();
  });

  it('a practitioner still gets it', async () => {
    const mail = {
      sendApprovalGrantedEmail: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(
      {
        findById: jest.fn().mockResolvedValue(
          row({
            role: UserRole.dentist,
            verificationStatus: VerificationStatus.pending,
          }),
        ),
        update: jest.fn().mockResolvedValue(
          row({
            role: UserRole.dentist,
            verificationStatus: VerificationStatus.approved,
          }),
        ),
      },
      mail,
    );
    await service.updateApproval('u-1', VerificationStatus.approved, admin);
    expect(mail.sendApprovalGrantedEmail).toHaveBeenCalledTimes(1);
  });
});

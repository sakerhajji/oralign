import type { EventEmitter2 } from '@nestjs/event-emitter';
import { UserRole, VerificationStatus } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import type { MailService } from '../../mail/mail.service';
import { NotificationEvents } from '../../notifications/events/notification-events';
import type { DoctorActivityService } from '../activity/doctor-activity.service';
import { UserListQueryDto } from '../dto/user.dto';
import type {
  UserRepository,
  UserWithProfile,
} from '../repositories/user.repository';
import { UserService } from './user.service';

/**
 * UserService's side of the doctor inactivity programme: the activity
 * block on reads, the filter, the reactivation route, the approval stamp,
 * the user.profileChanged announcement and the block / unblock journal.
 */

// The force-reset case below runs a real bcrypt hash (cost 12).
jest.setTimeout(30_000);

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

const row = (over: Partial<UserWithProfile> = {}): UserWithProfile =>
  ({
    id: 'u-1',
    email: 'dr@test.tn',
    fullName: 'Dr Test',
    phone: null,
    role: UserRole.dentist,
    isActive: true,
    isEmailVerified: true,
    avatarUrl: null,
    country: 'TN',
    preferredLanguage: 'fr',
    lastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    verificationStatus: VerificationStatus.approved,
    welcomeGiftUsedAt: null,
    mustChangePassword: false,
    inactiveSince: null,
    activityResetAt: null,
    approvedAt: null,
    dentistProfile: { id: 'dp-1' },
    doctorOrders: [],
    ...over,
  }) as unknown as UserWithProfile;

const summary = {
  status: 'warned' as const,
  lastSubmittedOrderAt: null,
  anchorAt: '2026-01-01T00:00:00.000Z',
  deadlineAt: '2026-07-01T00:00:00.000Z',
  inactiveSince: null,
  activityResetAt: null,
  ruleEnabled: true,
};

function make(repo: Partial<Record<keyof UserRepository, jest.Mock>>) {
  const activity = {
    summaries: jest.fn((users: UserWithProfile[]) =>
      Promise.resolve(
        new Map(
          users
            .filter((u) => u.role === UserRole.dentist)
            .map((u) => [u.id, summary]),
        ),
      ),
    ),
    listFilterWhere: jest
      .fn()
      .mockResolvedValue({ role: UserRole.dentist, id: { in: ['u-1'] } }),
    reactivate: jest.fn().mockResolvedValue({ changed: true }),
    listEvents: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    journalStatusChange: jest.fn().mockResolvedValue(1),
  };
  const emit = jest.fn();
  const service = new UserService(
    repo as unknown as UserRepository,
    {
      sendApprovalGrantedEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as MailService,
    activity as unknown as DoctorActivityService,
    { emit } as unknown as EventEmitter2,
  );
  return { service, activity, emit };
}

describe('UserService — doctor activity', () => {
  it('a dentist read carries the activity block and the dormancy columns', async () => {
    const dormantSince = new Date('2026-11-20T00:00:00Z');
    const { service } = make({
      findById: jest
        .fn()
        .mockResolvedValue(row({ inactiveSince: dormantSince })),
    });

    await expect(service.getUserById('u-1')).resolves.toMatchObject({
      inactiveSince: dormantSince,
      activityResetAt: null,
      approvedAt: null,
      activity: summary,
    });
  });

  it('a non-dentist read says activity: null', async () => {
    const { service } = make({
      findById: jest
        .fn()
        .mockResolvedValue(row({ role: UserRole.admin, id: 'u-a' })),
    });
    await expect(service.getUserById('u-a')).resolves.toMatchObject({
      activity: null,
    });
  });

  it('resolves the activity filter once and hands it to the repository', async () => {
    const findAll = jest.fn().mockResolvedValue({ users: [row()], total: 1 });
    const { service, activity } = make({ findAll });
    const query = Object.assign(new UserListQueryDto(), {
      page: 1,
      limit: 10,
      activity: 'warned' as const,
    });

    const page = await service.getAllUsers(query);

    expect(activity.listFilterWhere).toHaveBeenCalledWith('warned');
    expect(findAll).toHaveBeenCalledWith(0, 10, query, {
      role: UserRole.dentist,
      id: { in: ['u-1'] },
    });
    // One batched summary call for the whole page.
    expect(activity.summaries).toHaveBeenCalledTimes(1);
    expect(page.data[0]).toMatchObject({ activity: summary });
  });

  it('reactivate: 404 for an unknown or archived account, else delegates and answers the fresh read', async () => {
    const missing = make({ findById: jest.fn().mockResolvedValue(null) });
    await expect(
      missing.service.reactivateDoctor('u-x', 'Motif valable', admin),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(missing.activity.reactivate).not.toHaveBeenCalled();

    const { service, activity } = make({
      findById: jest.fn().mockResolvedValue(row()),
    });
    await expect(
      service.reactivateDoctor('u-1', 'Motif valable', admin),
    ).resolves.toMatchObject({ id: 'u-1', activity: summary });
    expect(activity.reactivate).toHaveBeenCalledWith(
      'u-1',
      admin,
      'Motif valable',
    );
  });

  it('stamps approvedAt on the approval transition only', async () => {
    const update = jest.fn().mockResolvedValue(row());
    const { service } = make({
      findById: jest
        .fn()
        .mockResolvedValue(
          row({ verificationStatus: VerificationStatus.pending }),
        ),
      update,
    });
    await service.updateApproval('u-1', VerificationStatus.approved, admin);
    expect(update).toHaveBeenCalledWith('u-1', {
      verificationStatus: VerificationStatus.approved,
      approvedAt: expect.any(Date) as unknown as Date,
    });

    const again = jest.fn().mockResolvedValue(row());
    await make({
      findById: jest.fn().mockResolvedValue(row()),
      update: again,
    }).service.updateApproval('u-1', VerificationStatus.approved, admin);
    expect(again).toHaveBeenCalledWith('u-1', {
      verificationStatus: VerificationStatus.approved,
    });
  });

  it('announces user.profileChanged with the field names only', async () => {
    const { service, emit } = make({
      findById: jest.fn().mockResolvedValue(row()),
      findByPhone: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(row()),
    });

    await service.updateUser(
      'u-1',
      { fullName: 'Dr New', phone: '+21612345678' },
      { id: 'u-1', role: UserRole.dentist },
    );

    expect(emit).toHaveBeenCalledWith(NotificationEvents.UserProfileChanged, {
      userId: 'u-1',
      dentistProfileId: 'dp-1',
      fields: ['fullName', 'phone'],
      actorId: 'u-1',
    });
  });

  it('a password-only reset announces nothing', async () => {
    const { service, emit } = make({
      findById: jest.fn().mockResolvedValue(row()),
      update: jest.fn().mockResolvedValue(row()),
    });
    await service.updateUser(
      'u-1',
      { password: 'N3wPassword!' },
      { id: 'u-admin', role: UserRole.admin },
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it('bulk block journals the flipped accounts through the activity service', async () => {
    const bulkUpdateStatus = jest.fn(
      async (
        _ids: string[],
        _isActive: boolean,
        _options: unknown,
        journal: (
          tx: unknown,
          flipped: unknown[],
          at: Date,
        ) => Promise<unknown>,
      ) => {
        await journal('tx', [{ id: 'a' }], new Date('2026-12-01'));
        return 1;
      },
    );
    const { service, activity } = make({
      countSuperAdmins: jest.fn().mockResolvedValue(0),
      bulkUpdateStatus,
    });

    await service.bulkUpdateStatus(['a'], false, admin);

    expect(activity.journalStatusChange).toHaveBeenCalledWith(
      'tx',
      [{ id: 'a' }],
      { isActive: false, caller: admin, at: new Date('2026-12-01') },
    );
  });
});

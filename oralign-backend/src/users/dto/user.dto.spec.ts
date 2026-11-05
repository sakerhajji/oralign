import { type ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { UserRole, VerificationStatus } from '@prisma/client';
import {
  UpdateUserDto,
  UserListQueryDto,
  USERS_LIST_MAX_LIMIT,
} from './user.dto';

/** The global pipe exactly as main.ts configures it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const query: ArgumentMetadata = { type: 'query', metatype: UserListQueryDto };
const body: ArgumentMetadata = { type: 'body', metatype: UpdateUserDto };

const parse = (raw: Record<string, unknown>) =>
  pipe.transform(raw, query) as Promise<UserListQueryDto>;

describe('UserListQueryDto (GET /users, GET /users/deleted/list)', () => {
  it('defaults to page 1, limit 10, no filter', async () => {
    const q = await parse({});
    expect(q).toBeInstanceOf(UserListQueryDto);
    expect(q).toMatchObject({ page: 1, limit: 10 });
    expect(q.search).toBeUndefined();
    expect(q.isActive).toBeUndefined();
  });

  it('turns the query strings into numbers', async () => {
    await expect(parse({ page: '3', limit: '25' })).resolves.toMatchObject({
      page: 3,
      limit: 25,
    });
    await expect(
      parse({ limit: String(USERS_LIST_MAX_LIMIT) }),
    ).resolves.toMatchObject({ limit: USERS_LIST_MAX_LIMIT });
  });

  it.each([
    ['page=0', { page: '0' }],
    ['page=-1', { page: '-1' }],
    ['page=abc', { page: 'abc' }],
    ['page=1.5', { page: '1.5' }],
    ['limit=0', { limit: '0' }],
    ['limit above the maximum', { limit: String(USERS_LIST_MAX_LIMIT + 1) }],
    ['limit=abc', { limit: 'abc' }],
  ])(
    'rejects %s with a 400 (no NaN / negative skip / Infinity pages)',
    async (_label, raw) => {
      await expect(parse(raw)).rejects.toMatchObject({ status: 400 });
    },
  );

  it('reads booleans from the raw string ("false" stays false)', async () => {
    await expect(
      parse({ isActive: 'false', isEmailVerified: 'true' }),
    ).resolves.toMatchObject({ isActive: false, isEmailVerified: true });
    await expect(parse({ isActive: 'true' })).resolves.toMatchObject({
      isActive: true,
    });
  });

  it('treats blank filters as "no filter"', async () => {
    const q = await parse({
      search: '   ',
      role: '',
      isActive: '',
      verificationStatus: '',
      welcomeGift: '',
    });
    expect(q.search).toBeUndefined();
    expect(q.role).toBeUndefined();
    expect(q.isActive).toBeUndefined();
    expect(q.verificationStatus).toBeUndefined();
    expect(q.welcomeGift).toBeUndefined();
  });

  it('trims the search term', async () => {
    await expect(parse({ search: '  Ben Ali ' })).resolves.toMatchObject({
      search: 'Ben Ali',
    });
  });

  it('accepts the real enum values', async () => {
    await expect(
      parse({
        role: 'dentist',
        verificationStatus: 'pending',
        welcomeGift: 'available',
      }),
    ).resolves.toMatchObject({
      role: UserRole.dentist,
      verificationStatus: VerificationStatus.pending,
      welcomeGift: 'available',
    });
    for (const status of Object.values(VerificationStatus)) {
      await expect(parse({ verificationStatus: status })).resolves.toBeTruthy();
    }
    await expect(parse({ welcomeGift: 'used' })).resolves.toMatchObject({
      welcomeGift: 'used',
    });
  });

  it.each([
    ['an unknown role', { role: 'root' }],
    ['an unknown approval status', { verificationStatus: 'waiting' }],
    ['an unknown gift filter', { welcomeGift: 'maybe' }],
    ['a non-boolean isActive', { isActive: 'yes' }],
    ['an unknown parameter', { sort: 'name' }],
  ])('rejects %s with a 400', async (_label, raw) => {
    await expect(parse(raw)).rejects.toMatchObject({ status: 400 });
  });
});

describe('UpdateUserDto — clearable phone / country', () => {
  const update = (raw: Record<string, unknown>) =>
    pipe.transform(raw, body) as Promise<UpdateUserDto>;

  it('"" clears (null), absent keeps (undefined)', async () => {
    const cleared = await update({ phone: '', country: '  ' });
    expect(cleared.phone).toBeNull();
    expect(cleared.country).toBeNull();
    const kept = await update({ fullName: 'Dr Test' });
    expect(kept.phone).toBeUndefined();
    expect(kept.country).toBeUndefined();
  });

  it('still validates a set value', async () => {
    await expect(
      update({ phone: ' +21612345678 ', country: 'tn' }),
    ).resolves.toMatchObject({ phone: '+21612345678', country: 'TN' });
    await expect(update({ phone: '12345' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

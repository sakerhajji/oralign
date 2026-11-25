import { type ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { UserRole, VerificationStatus } from '@prisma/client';
import { FULL_NAME_MAX_LENGTH } from '../../common/access/actor-snapshot';
import {
  CreateUserDto,
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

describe('CreateUserDto — typed or generated password', () => {
  const create = (raw: Record<string, unknown>) =>
    pipe.transform(raw, {
      type: 'body',
      metatype: CreateUserDto,
    }) as Promise<CreateUserDto>;
  const base = { email: 'tech@lab.tn', fullName: 'Technicienne' };

  it('a typed password, kept as typed (never trimmed)', async () => {
    await expect(
      create({ ...base, password: ' Typed-Passw0rd ' }),
    ).resolves.toMatchObject({ password: ' Typed-Passw0rd ' });
  });

  it('generateTemporaryPassword without a password; a blank password counts as absent', async () => {
    const dto = await create({
      ...base,
      password: '',
      generateTemporaryPassword: true,
    });
    expect(dto.password).toBeUndefined();
    expect(dto.generateTemporaryPassword).toBe(true);
  });

  it('reads the flag from the raw value ("false" stays false, and then a password is required)', async () => {
    await expect(
      create({ ...base, generateTemporaryPassword: 'false' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      create({
        ...base,
        password: 'Typed-Passw0rd',
        generateTemporaryPassword: 'false',
      }),
    ).resolves.toMatchObject({ generateTemporaryPassword: false });
  });

  it.each([
    ['no password at all', {}],
    ['a blank password', { password: '' }],
    ['a short password', { password: 'short' }],
    ['a non-boolean flag', { generateTemporaryPassword: 'yes' }],
  ])('rejects %s with a 400', async (_label, raw) => {
    await expect(create({ ...base, ...raw })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('fullName: trimmed, then bounded (it is snapshotted on every actor row)', () => {
  const create = (raw: Record<string, unknown>) =>
    pipe.transform(raw, {
      type: 'body',
      metatype: CreateUserDto,
    }) as Promise<CreateUserDto>;
  const update = (raw: Record<string, unknown>) =>
    pipe.transform(raw, body) as Promise<UpdateUserDto>;
  const base = { email: 'tech@lab.tn', password: 'Typed-Passw0rd' };

  it('trims before validating', async () => {
    await expect(
      create({ ...base, fullName: '  Ana  ' }),
    ).resolves.toMatchObject({ fullName: 'Ana' });
    await expect(update({ fullName: '\tAna Ben Ali ' })).resolves.toMatchObject(
      {
        fullName: 'Ana Ben Ali',
      },
    );
  });

  it(`accepts ${FULL_NAME_MAX_LENGTH} characters, refuses ${FULL_NAME_MAX_LENGTH + 1}`, async () => {
    const longest = 'a'.repeat(FULL_NAME_MAX_LENGTH);
    await expect(create({ ...base, fullName: longest })).resolves.toMatchObject(
      {
        fullName: longest,
      },
    );
    await expect(update({ fullName: longest })).resolves.toMatchObject({
      fullName: longest,
    });
    await expect(
      create({ ...base, fullName: `${longest}a` }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(update({ fullName: `${longest}a` })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('the surrounding spaces do not count toward the bound', async () => {
    const longest = 'a'.repeat(FULL_NAME_MAX_LENGTH);
    await expect(update({ fullName: `  ${longest}  ` })).resolves.toMatchObject(
      {
        fullName: longest,
      },
    );
  });

  it('a name that is only spaces, or one letter once trimmed, is refused', async () => {
    await expect(update({ fullName: '    ' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(create({ ...base, fullName: ' A ' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

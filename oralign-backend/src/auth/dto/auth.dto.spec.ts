import { ValidationPipe } from '@nestjs/common';
import { FULL_NAME_MAX_LENGTH } from '../../common/access/actor-snapshot';
import { SignUpDto } from './auth.dto';

/** The global pipe exactly as main.ts configures it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const signUp = (raw: Record<string, unknown>) =>
  pipe.transform(raw, {
    type: 'body',
    metatype: SignUpDto,
  }) as Promise<SignUpDto>;
const base = { email: 'Dr.Ana@Clinic.tn ', password: 'Str0ngP@ssw0rd!' };

describe('SignUpDto: fullName trimmed, then bounded', () => {
  it('trims the name (and still normalises the e-mail)', async () => {
    await expect(
      signUp({ ...base, fullName: '  Ana Ben Ali ' }),
    ).resolves.toMatchObject({
      fullName: 'Ana Ben Ali',
      email: 'dr.ana@clinic.tn',
    });
  });

  it(`accepts ${FULL_NAME_MAX_LENGTH} characters, refuses one more`, async () => {
    const longest = 'a'.repeat(FULL_NAME_MAX_LENGTH);
    await expect(signUp({ ...base, fullName: longest })).resolves.toMatchObject(
      {
        fullName: longest,
      },
    );
    await expect(
      signUp({ ...base, fullName: `${longest}a` }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it.each([
    ['only spaces', '    '],
    ['one letter once trimmed', ' A '],
  ])('refuses a name that is %s', async (_label, fullName) => {
    await expect(signUp({ ...base, fullName })).rejects.toMatchObject({
      status: 400,
    });
  });
});

import { type ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { PatientFilterDto, UpdatePatientDto } from './patient.dto';

/** The global pipe exactly as main.ts configures it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const body: ArgumentMetadata = { type: 'body', metatype: UpdatePatientDto };
const parse = (raw: Record<string, unknown>) =>
  pipe.transform(raw, body) as Promise<UpdatePatientDto>;

describe('UpdatePatientDto (PATCH /patients/:id)', () => {
  it('"" and null clear the optional text fields', async () => {
    const dto = await parse({
      email: '',
      phone: '  ',
      address: null,
      notes: '',
      clinicalConditionsOther: null,
    });
    expect(dto).toMatchObject({
      email: null,
      phone: null,
      address: null,
      notes: null,
      clinicalConditionsOther: null,
    });
  });

  it('an omitted field stays undefined (keeps the stored value)', async () => {
    const dto = await parse({ fullName: 'Sarah Morgan' });
    expect(dto.phone).toBeUndefined();
    expect(dto.email).toBeUndefined();
    expect(dto.notes).toBeUndefined();
  });

  it('still trims, lowercases the e-mail and checks the formats', async () => {
    await expect(
      parse({ email: ' Sarah@Example.COM ', phone: ' +21622123456 ' }),
    ).resolves.toMatchObject({
      email: 'sarah@example.com',
      phone: '+21622123456',
    });
    await expect(parse({ phone: '22 123 456' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(parse({ email: 'not-an-email' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

const query: ArgumentMetadata = { type: 'query', metatype: PatientFilterDto };
const parseQuery = (raw: Record<string, unknown>) =>
  pipe.transform(raw, query) as Promise<PatientFilterDto>;

describe('PatientFilterDto (GET /patients query)', () => {
  // The wire values the frontend sends, spelled out on purpose.
  it.each(['active', 'none'])('accepts orderState=%s', async (orderState) => {
    await expect(parseQuery({ orderState })).resolves.toMatchObject({
      orderState,
    });
  });

  it('rejects any other orderState', async () => {
    await expect(parseQuery({ orderState: 'bogus' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('trims the search, and drops one that is blank', async () => {
    await expect(
      parseQuery({ search: '  50 339 214  ', orderState: 'active' }),
    ).resolves.toMatchObject({ search: '50 339 214', orderState: 'active' });
    const blank = await parseQuery({ search: '   ' });
    expect(blank.search).toBeUndefined();
  });
});

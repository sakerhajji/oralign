import { type ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { UpdatePatientDto } from './patient.dto';

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

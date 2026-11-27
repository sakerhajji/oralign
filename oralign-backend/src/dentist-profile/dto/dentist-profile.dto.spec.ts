import { type ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import {
  CreateDentistProfileDto,
  REGISTRATION_NUMBER_MAX_LENGTH,
  SetupClinicDto,
  UpdateDentistProfileDto,
  trimToNull,
} from './dentist-profile.dto';

/** The global pipe exactly as main.ts configures it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const parse = <T>(
  metatype: new () => T,
  raw: Record<string, unknown>,
): Promise<T> =>
  pipe.transform(raw, {
    type: 'body',
    metatype,
  } as ArgumentMetadata) as Promise<T>;

describe('trimToNull', () => {
  it('trims, turns a blank into null and leaves non-strings to the validators', () => {
    expect(trimToNull('  CNOMDT-1 ')).toBe('CNOMDT-1');
    expect(trimToNull('   ')).toBeNull();
    expect(trimToNull('')).toBeNull();
    expect(trimToNull(null)).toBeNull();
    expect(trimToNull(undefined)).toBeUndefined();
    expect(trimToNull(42)).toBe(42);
  });
});

describe('registrationNumber on the clinic DTOs', () => {
  it('is accepted on create, update and the onboarding setup, trimmed', async () => {
    const created = await parse(CreateDentistProfileDto, {
      clinicName: 'Cabinet',
      registrationNumber: '  CNOMDT-12345 ',
    });
    expect(created.registrationNumber).toBe('CNOMDT-12345');

    const updated = await parse(UpdateDentistProfileDto, {
      clinicName: 'Cabinet',
      registrationNumber: 'CNOMDT-12345',
    });
    expect(updated.registrationNumber).toBe('CNOMDT-12345');

    const setup = await parse(SetupClinicDto, {
      clinicName: 'Cabinet',
      registrationNumber: 'CNOMDT-12345',
      workingHours: [],
    });
    expect(setup.registrationNumber).toBe('CNOMDT-12345');
  });

  it('"" and null clear it; omitted it stays undefined (left alone)', async () => {
    await expect(
      parse(UpdateDentistProfileDto, {
        clinicName: 'Cabinet',
        registrationNumber: '   ',
      }),
    ).resolves.toMatchObject({ registrationNumber: null });
    await expect(
      parse(UpdateDentistProfileDto, {
        clinicName: 'Cabinet',
        registrationNumber: null,
      }),
    ).resolves.toMatchObject({ registrationNumber: null });
    const omitted = await parse(UpdateDentistProfileDto, {
      clinicName: 'Cabinet',
    });
    expect(omitted.registrationNumber).toBeUndefined();
  });

  it(`refuses more than ${REGISTRATION_NUMBER_MAX_LENGTH} characters`, async () => {
    await expect(
      parse(UpdateDentistProfileDto, {
        clinicName: 'Cabinet',
        registrationNumber: 'X'.repeat(REGISTRATION_NUMBER_MAX_LENGTH + 1),
      }),
    ).rejects.toMatchObject({ status: 400 });
    // The bound applies after the trim.
    await expect(
      parse(UpdateDentistProfileDto, {
        clinicName: 'Cabinet',
        registrationNumber: ` ${'X'.repeat(REGISTRATION_NUMBER_MAX_LENGTH)} `,
      }),
    ).resolves.toMatchObject({
      registrationNumber: 'X'.repeat(REGISTRATION_NUMBER_MAX_LENGTH),
    });
  });
});

describe('clearing the optional clinic fields (P-F: an emptied field is cleared)', () => {
  const TEXT_FIELDS = [
    'clinicAddress',
    'city',
    'country',
    'clinicPhone',
    'clinicEmail',
    'taxId',
    'description',
    'logoUrl',
    'specialty',
  ] as const;

  it.each(TEXT_FIELDS)(
    '%s: "" and null clear it (null), omitted stays undefined',
    async (field) => {
      for (const sent of ['', '   ', null]) {
        const dto = await parse(UpdateDentistProfileDto, {
          clinicName: 'Cabinet',
          [field]: sent,
        });
        expect(dto[field]).toBeNull();
      }
      const omitted = await parse(UpdateDentistProfileDto, {
        clinicName: 'Cabinet',
      });
      expect(omitted[field]).toBeUndefined();
    },
  );

  it.each(TEXT_FIELDS)('%s: a real value is kept, trimmed', async (field) => {
    const dto = await parse(UpdateDentistProfileDto, {
      clinicName: 'Cabinet',
      [field]: '  Sfax  ',
    });
    expect(dto[field]).toBe('Sfax');
  });

  it('the same rule holds on create and on the onboarding setup', async () => {
    await expect(
      parse(CreateDentistProfileDto, { clinicName: 'Cabinet', city: '' }),
    ).resolves.toMatchObject({ city: null });
    await expect(
      parse(SetupClinicDto, {
        clinicName: 'Cabinet',
        clinicPhone: ' ',
        workingHours: [],
      }),
    ).resolves.toMatchObject({ clinicPhone: null });
  });

  it.each(['latitude', 'longitude'] as const)(
    '%s: "" and null clear it, 0 and a number are kept, omitted stays undefined',
    async (field) => {
      for (const sent of ['', ' ', null]) {
        const dto = await parse(UpdateDentistProfileDto, {
          clinicName: 'Cabinet',
          [field]: sent,
        });
        expect(dto[field]).toBeNull();
      }
      await expect(
        parse(UpdateDentistProfileDto, { clinicName: 'Cabinet', [field]: 0 }),
      ).resolves.toMatchObject({ [field]: 0 });
      await expect(
        parse(UpdateDentistProfileDto, {
          clinicName: 'Cabinet',
          [field]: 10.18,
        }),
      ).resolves.toMatchObject({ [field]: 10.18 });
      const omitted = await parse(UpdateDentistProfileDto, {
        clinicName: 'Cabinet',
      });
      expect(omitted[field]).toBeUndefined();
    },
  );

  it('still validates what is sent: an out-of-range latitude is a 400', async () => {
    await expect(
      parse(UpdateDentistProfileDto, { clinicName: 'Cabinet', latitude: 120 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      parse(UpdateDentistProfileDto, {
        clinicName: 'Cabinet',
        specialty: 'X'.repeat(121),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

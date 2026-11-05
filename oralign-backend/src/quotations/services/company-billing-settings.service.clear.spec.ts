import { type ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { UpsertCompanyBillingSettingsDto } from '../dto/company-billing-settings.dto';
import { CompanyBillingSettingsService } from './company-billing-settings.service';

/** The global pipe exactly as main.ts configures it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const body: ArgumentMetadata = {
  type: 'body',
  metatype: UpsertCompanyBillingSettingsDto,
};
const parse = (raw: Record<string, unknown>) =>
  pipe.transform(raw, body) as Promise<UpsertCompanyBillingSettingsDto>;

const stored = {
  id: 's-1',
  companyName: 'Aura Aligners',
  companyAddress: 'Bureau C34',
  companyCity: 'La Marsa',
  companyCountry: 'TN',
  companyPhone: '+216 99 506 061',
  companyEmail: 'contact@oralign.tn',
  taxRegistrationNumber: '1958766/W/A/M/000',
  tradeName: 'ORALIGN',
  legalForm: 'SARL',
  registreDeCommerce: 'B505022026',
  hostingProvider: 'OVH',
  hostingProviderUrl: 'https://ovh.com',
  websiteDomain: 'oralign.com.tn',
  defaultTvaRate: 19,
  defaultTreatmentFee: new Prisma.Decimal(300),
  stampDuty: new Prisma.Decimal(1),
  welcomeGiftEnabled: true,
  isActive: true,
};

function makeService() {
  const update = jest.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...stored, ...data }),
  );
  const prisma = {
    companyBillingSettings: {
      findFirst: jest.fn().mockResolvedValue(stored),
      update,
    },
  } as unknown as PrismaService;
  return { service: new CompanyBillingSettingsService(prisma), update };
}
const written = (update: jest.Mock) =>
  (
    (update.mock.calls as unknown[][])[0][0] as {
      data: Record<string, unknown>;
    }
  ).data;

describe('Company billing settings — clearing optional text fields', () => {
  it('the DTO turns "" into null (clear) and keeps absent fields undefined', async () => {
    const dto = await parse({
      companyPhone: '',
      companyEmail: '  ',
      websiteDomain: '',
    });
    expect(dto.companyPhone).toBeNull();
    // A cleared e-mail must not trip @IsEmail.
    expect(dto.companyEmail).toBeNull();
    expect(dto.websiteDomain).toBeNull();
    expect(dto.companyAddress).toBeUndefined();
  });

  it('still validates a set e-mail', async () => {
    await expect(parse({ companyEmail: 'not-an-email' })).rejects.toMatchObject(
      { status: 400 },
    );
  });

  it('null clears, undefined keeps the stored value', async () => {
    const { service, update } = makeService();

    await service.upsert(
      await parse({ companyPhone: '', companyEmail: '', tradeName: '' }),
    );

    const data = written(update);
    expect(data.companyPhone).toBeNull();
    expect(data.companyEmail).toBeNull();
    expect(data.tradeName).toBeNull();
    // Untouched fields keep their stored value.
    expect(data.companyAddress).toBe(stored.companyAddress);
    expect(data.hostingProviderUrl).toBe(stored.hostingProviderUrl);
    expect(data.companyName).toBe(stored.companyName);
  });

  it('a one-field save (the gift switch) changes nothing else', async () => {
    const { service, update } = makeService();

    await service.upsert(await parse({ welcomeGiftEnabled: false }));

    const data = written(update);
    expect(data.welcomeGiftEnabled).toBe(false);
    expect(data.companyPhone).toBe(stored.companyPhone);
    expect(data.websiteDomain).toBe(stored.websiteDomain);
    expect(data.defaultTreatmentFee).toBe(stored.defaultTreatmentFee);
  });

  it('refuses to blank the (required) company name', async () => {
    const { service, update } = makeService();

    await expect(
      service.upsert(await parse({ companyName: '  ' })),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(update).not.toHaveBeenCalled();
  });
});

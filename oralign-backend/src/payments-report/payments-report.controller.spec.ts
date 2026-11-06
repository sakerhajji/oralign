import {
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { AllExceptionsFilter } from '../common/exceptions/exception.filter';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

// puppeteer-core is ESM-only, and the route is tested without printing.
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: class PdfRendererService {},
}));

import { PaymentsReportController } from './payments-report.controller';
import { PaymentsReportService } from './payments-report.service';

const asUser = (sub: string, role: UserRole) =>
  ({ sub, role, email: `${sub}@example.com` }) as JwtPayload;

/**
 * The real controller, validation pipe, roles check and exception filter
 * (as main.ts wires them); only the JWT check and the report service are
 * replaced.
 */
describe('POST /api/payments/report', () => {
  let app: INestApplication<App>;
  let caller = asUser('u-doc', UserRole.dentist);
  const render = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'short', ttl: 10_000, limit: 1000 },
          { name: 'medium', ttl: 60_000, limit: 1000 },
        ]),
      ],
      controllers: [PaymentsReportController],
      providers: [{ provide: PaymentsReportService, useValue: { render } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: JwtPayload }>().user =
            caller;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    caller = asUser('u-doc', UserRole.dentist);
    render.mockReset().mockResolvedValue({
      buffer: Buffer.from('%PDF-1.7 report'),
      fileName:
        'Oralign_Rapport_Paiements_Honoraires_2026-11-01_2026-11-06.pdf',
    });
  });

  const post = (body: object) =>
    request(app.getHttpServer()).post('/api/payments/report').send(body);

  it('streams the PDF as a named, uncached attachment', async () => {
    const res = await post({
      kind: 'treatment_fee',
      from: '2026-11-01',
      to: '2026-11-06',
      lang: 'fr',
      treatmentFees: {
        search: '  Haddad  ',
        methods: ['cash'],
        statuses: ['success'],
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="Oralign_Rapport_Paiements_Honoraires_2026-11-01_2026-11-06.pdf"; filename*=UTF-8\'\'Oralign_Rapport_Paiements_Honoraires_2026-11-01_2026-11-06.pdf',
    );
    expect(res.headers['cache-control']).toBe('no-store');
    const [[body, reportCaller]] = render.mock.calls as [
      [Record<string, unknown>, unknown],
    ];
    expect(body).toMatchObject({
      kind: 'treatment_fee',
      // Trimmed by the DTO, as every search of the desk.
      treatmentFees: { search: 'Haddad', methods: ['cash'] },
    });
    expect(reportCaller).toEqual({ userId: 'u-doc', role: UserRole.dentist });
  });

  it('takes the installments tab filters, rank included', async () => {
    caller = asUser('u-admin', UserRole.admin);
    const res = await post({
      kind: 'consolidated',
      allDates: true,
      installments: { doctorId: 'd-1', installmentMin: 2, sort: 'amount-desc' },
    });
    expect(res.status).toBe(200);
    const [[body]] = render.mock.calls as [[Record<string, unknown>]];
    expect(body).toMatchObject({
      allDates: true,
      installments: { installmentMin: 2, sort: 'amount-desc' },
    });
  });

  it.each([
    ['no kind', {}],
    ['an unknown kind', { kind: 'refunds' }],
    ['an impossible date', { kind: 'installment', from: '2026-02-30' }],
    ['an unknown language', { kind: 'installment', lang: 'ar' }],
    ['an unknown field', { kind: 'installment', foo: 1 }],
    [
      'an unknown field inside a tab',
      { kind: 'installment', installments: { foo: 1 } },
    ],
    [
      'an unknown method',
      { kind: 'treatment_fee', treatmentFees: { methods: ['cheque'] } },
    ],
    [
      'a rank out of range',
      { kind: 'installment', installments: { installmentMin: 0 } },
    ],
    [
      'a search too long',
      { kind: 'installment', installments: { search: 'x'.repeat(121) } },
    ],
  ])('refuses %s with a 400', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(render).not.toHaveBeenCalled();
  });

  it('is closed to a designer', async () => {
    caller = asUser('u-des', UserRole.designer);
    const res = await post({ kind: 'installment' });
    expect(res.status).toBe(403);
    expect(render).not.toHaveBeenCalled();
  });
});

import {
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderType, UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { AllExceptionsFilter } from '../../common/exceptions/exception.filter';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// The services reach Prisma and the event bus; the routes only need DI
// tokens, replaced by mocks below.
jest.mock('../supplemental/supplemental-order.service', () => ({
  SupplementalOrderService: class SupplementalOrderService {},
}));
jest.mock('../supplemental/supplemental-review.service', () => ({
  SupplementalReviewService: class SupplementalReviewService {},
}));

import { SupplementalOrderService } from '../supplemental/supplemental-order.service';
import { SupplementalReviewService } from '../supplemental/supplemental-review.service';
import { SupplementalOrderController } from './supplemental-order.controller';

const asUser = (sub: string, role: UserRole) =>
  ({ sub, role, email: `${sub}@example.com` }) as JwtPayload;

const VIEW = { order: { id: 'child-1' } };

/**
 * The real controller, pipe, roles guard and exception filter, as main.ts
 * wires them; only the JWT check is replaced by a fixed caller and the
 * services by mocks. Proves what reaches the services, and what the pipe
 * stops before them.
 */
describe('SupplementalOrderController over HTTP', () => {
  let app: INestApplication<App>;
  const caller = asUser('u-doc', UserRole.dentist);
  const create = jest.fn();
  const update = jest.fn();
  const review = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SupplementalOrderController],
      providers: [
        { provide: SupplementalOrderService, useValue: { create, update } },
        { provide: SupplementalReviewService, useValue: { review } },
      ],
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
    create.mockReset().mockResolvedValue(VIEW);
    update.mockReset().mockResolvedValue(VIEW);
    review.mockReset().mockResolvedValue(VIEW);
  });

  const server = () => request(app.getHttpServer());

  describe('POST /api/orders/:id/supplemental-requests', () => {
    it('hands the Idempotency-Key header and the caller to the service', async () => {
      const res = await server()
        .post('/api/orders/parent-1/supplemental-requests')
        .set('Idempotency-Key', 'key-0000-0001')
        .send({ type: OrderType.warranty });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(VIEW);
      expect(create).toHaveBeenCalledWith(
        'parent-1',
        { type: OrderType.warranty },
        'key-0000-0001',
        { userId: 'u-doc', role: UserRole.dentist },
      );
    });

    it('passes a missing header as undefined (the service answers 400)', async () => {
      await server()
        .post('/api/orders/parent-1/supplemental-requests')
        .send({ type: OrderType.replacement });
      expect(create).toHaveBeenCalledWith(
        'parent-1',
        { type: OrderType.replacement },
        undefined,
        expect.anything(),
      );
    });

    it.each([{ type: OrderType.initial }, { type: 'retainer' }, {}])(
      '%j is a 400, before the service',
      async (body) => {
        const res = await server()
          .post('/api/orders/parent-1/supplemental-requests')
          .set('Idempotency-Key', 'key-0000-0001')
          .send(body);
        expect(res.status).toBe(400);
        expect(create).not.toHaveBeenCalled();
      },
    );
  });

  describe('PUT /api/orders/supplemental-requests/:requestId', () => {
    it('keeps null (clear) apart from omitted (unchanged) and trims text', async () => {
      const res = await server()
        .put('/api/orders/supplemental-requests/child-1')
        .send({
          currentUpperAligner: null,
          passiveOppositeArch: false,
          upperInstructions: '   ',
          lowerInstructions: '  Close 33-34  ',
          warrantyDiscoveredAt: null,
          teeth: [{ purpose: 'do_not_move', toothNumber: 13 }],
        });

      expect(res.status).toBe(200);
      const [id, dto] = update.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(id).toBe('child-1');
      expect(dto).toEqual({
        currentUpperAligner: null,
        passiveOppositeArch: false,
        upperInstructions: null,
        lowerInstructions: 'Close 33-34',
        warrantyDiscoveredAt: null,
        teeth: [{ purpose: 'do_not_move', toothNumber: 13 }],
      });
      // Omitted stays undefined (unchanged), never null (cleared).
      expect(dto.reason).toBeUndefined();
    });

    it.each([
      ['an unknown property', { sourceTreatmentPlanVersion: 3 }],
      [
        'a deciduous tooth',
        { teeth: [{ purpose: 'cutout', toothNumber: 55 }] },
      ],
      [
        'an unknown tooth purpose',
        { teeth: [{ purpose: 'attachment', toothNumber: 13 }] },
      ],
      [
        'an amount with three decimals',
        {
          contacts: [
            {
              purpose: 'performed_ipr',
              fromTooth: 11,
              toTooth: 21,
              amountMm: 0.125,
            },
          ],
        },
      ],
      ['a day that does not exist', { warrantyDiscoveredAt: '2026-02-30' }],
      [
        'a repeated option',
        { apOptions: ['elastics_simulation', 'elastics_simulation'] },
      ],
      ['an aligner number of 0', { currentUpperAligner: 0 }],
    ])('%s is a 400, before the service', async (_, body) => {
      const res = await server()
        .put('/api/orders/supplemental-requests/child-1')
        .send(body);
      expect(res.status).toBe(400);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/orders/supplemental-requests/:requestId/review', () => {
    it('hands the decision to the review service', async () => {
      const res = await server()
        .post('/api/orders/supplemental-requests/child-1/review')
        .send({ decision: 'approved', coverageStatus: 'chargeable' });
      expect(res.status).toBe(200);
      expect(review).toHaveBeenCalledWith(
        'child-1',
        { decision: 'approved', coverageStatus: 'chargeable' },
        { userId: 'u-doc', role: UserRole.dentist },
      );
    });

    it.each([{ decision: 'pending' }, { decision: 'draft' }, {}])(
      '%j is a 400, before the service',
      async (body) => {
        const res = await server()
          .post('/api/orders/supplemental-requests/child-1/review')
          .send(body);
        expect(res.status).toBe(400);
        expect(review).not.toHaveBeenCalled();
      },
    );
  });
});

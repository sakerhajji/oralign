import {
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { AllExceptionsFilter } from '../../common/exceptions/exception.filter';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// The service pulls in Prisma, the cache and the event bus: an empty DI
// token, mocked per test below.
jest.mock('../services/dentist-profile.service', () => ({
  DentistProfileService: class DentistProfileService {},
}));

import { DentistProfileService } from '../services/dentist-profile.service';
import { DentistProfileController } from './dentist-profile.controller';

const EMPTY_PAGE = { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };

/**
 * The two admin directory searches over HTTP, with the real pipe, roles
 * guard and exception filter as main.ts wires them. A missing or malformed
 * query is a 400 before the service: without a city the cache key was
 * built from undefined and the route answered 500.
 */
describe('DentistProfileController directory searches (admin)', () => {
  let app: INestApplication<App>;
  const searchByCity = jest.fn();
  const findNearby = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DentistProfileController],
      providers: [
        {
          provide: DentistProfileService,
          useValue: { searchByCity, findNearby },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: JwtPayload }>().user = {
            sub: 'u-admin',
            role: UserRole.admin,
            email: 'admin@example.com',
          } as JwtPayload;
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
    searchByCity.mockReset().mockResolvedValue(EMPTY_PAGE);
    findNearby.mockReset().mockResolvedValue(EMPTY_PAGE);
  });

  const get = (url: string) => request(app.getHttpServer()).get(url);

  describe('GET /api/dentist-profile/search/by-city', () => {
    it('hands the trimmed city and the parsed page to the service', async () => {
      const res = await get(
        '/api/dentist-profile/search/by-city?city=%20Sousse%20&page=2&limit=25',
      );
      expect(res.status).toBe(200);
      expect(searchByCity).toHaveBeenCalledWith('Sousse', 2, 25);
    });

    it('defaults to the first page of 10', async () => {
      await get('/api/dentist-profile/search/by-city?city=Tunis');
      expect(searchByCity).toHaveBeenCalledWith('Tunis', 1, 10);
    });

    it.each([
      ['no city', ''],
      ['a blank city', '?city=%20%20'],
      ['a city over 120 characters', `?city=${'a'.repeat(121)}`],
      ['a repeated city', '?city=Tunis&city=Sfax'],
      ['a limit of 0', '?city=Tunis&limit=0'],
      ['a limit over 100', '?city=Tunis&limit=101'],
      ['a non-numeric page', '?city=Tunis&page=abc'],
      ['an unknown parameter', '?city=Tunis&orderBy=phone'],
    ])('400 for %s, before the service', async (_label, query) => {
      const res = await get(`/api/dentist-profile/search/by-city${query}`);
      expect(res.status).toBe(400);
      expect(searchByCity).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/dentist-profile/search/nearby', () => {
    it('hands numbers to the service, the radius defaulting to 5 km', async () => {
      const res = await get(
        '/api/dentist-profile/search/nearby?latitude=36.8065&longitude=10.1815',
      );
      expect(res.status).toBe(200);
      expect(findNearby).toHaveBeenCalledWith(36.8065, 10.1815, 5, 1, 10);
    });

    it.each([
      ['no point', ''],
      ['no longitude', '?latitude=36.8'],
      ['a latitude beyond the pole', '?latitude=91&longitude=10'],
      ['a longitude beyond 180', '?latitude=36.8&longitude=-181'],
      ['a non-numeric latitude', '?latitude=north&longitude=10'],
      ['a radius of 0', '?latitude=36.8&longitude=10&radiusKm=0'],
      ['a radius over 500 km', '?latitude=36.8&longitude=10&radiusKm=501'],
      ['a fractional radius', '?latitude=36.8&longitude=10&radiusKm=2.5'],
    ])('400 for %s, before the service', async (_label, query) => {
      const res = await get(`/api/dentist-profile/search/nearby${query}`);
      expect(res.status).toBe(400);
      expect(findNearby).not.toHaveBeenCalled();
    });
  });
});

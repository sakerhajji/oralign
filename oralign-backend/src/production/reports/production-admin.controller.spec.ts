import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { ADMIN_ROLES } from '../../common/access/caller';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ProductionExportFormat } from '../dto';
import { ProductionAdminController } from './production-admin.controller';
import type { ProductionAnomaliesService } from './production-anomalies.service';
import type { ProductionExportService } from './production-export.service';
import type { ProductionNoticesService } from './production-notices.service';
import type { ProductionProgressReportService } from './production-progress.service';
import type { ProductionSummaryService } from './production-summary.service';

function makeController() {
  const build = jest.fn(() =>
    Promise.resolve({
      content: 'csv-content',
      fileName: 'production_2026-11-01_2026-11-30_daily.csv',
    }),
  );
  const retry = jest.fn(() => Promise.resolve({ id: 'n1' }));
  const controller = new ProductionAdminController(
    {} as ProductionSummaryService,
    {} as ProductionProgressReportService,
    {} as ProductionAnomaliesService,
    { build } as unknown as ProductionExportService,
    { retry } as unknown as ProductionNoticesService,
  );
  return { controller, build, retry };
}

describe('ProductionAdminController', () => {
  it('is admin-only at the class level, behind the JWT and roles guards', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProductionAdminController)).toEqual([
      ...ADMIN_ROLES,
    ]);
    expect(
      Reflect.getMetadata(ROLES_KEY, ProductionAdminController),
    ).not.toContain(UserRole.technician);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ProductionAdminController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, ProductionAdminController)).toBe(
      'production/admin',
    );
  });

  it('serves the routes of the contract', () => {
    const pathOf = (method: keyof ProductionAdminController): unknown =>
      Reflect.getMetadata(
        PATH_METADATA,
        ProductionAdminController.prototype[method],
      );
    expect(pathOf('getSummary')).toBe('summary');
    expect(pathOf('getProgress')).toBe('progress');
    expect(pathOf('getAnomalies')).toBe('anomalies');
    expect(pathOf('exportCsv')).toBe('export.csv');
    expect(pathOf('getNotices')).toBe('notices');
    expect(pathOf('retryNotice')).toBe('notices/:id/retry');
  });

  it('sends the CSV as a UTF-8 attachment under the service file name, never cached', async () => {
    const { controller, build } = makeController();
    const headers: Record<string, string> = {};
    const end = jest.fn();
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      status: jest.fn(() => ({ end })),
    } as unknown as Response;

    const query = {
      from: '2026-11-01',
      to: '2026-11-30',
      format: ProductionExportFormat.daily,
    };
    await controller.exportCsv(query, res);

    expect(build).toHaveBeenCalledWith(query);
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(headers['Content-Disposition']).toBe(
      `attachment; filename="production_2026-11-01_2026-11-30_daily.csv"; filename*=UTF-8''production_2026-11-01_2026-11-30_daily.csv`,
    );
    expect(headers['Cache-Control']).toBe('private, no-store');
    expect(end).toHaveBeenCalledWith('csv-content');
  });

  it('hands the retry the caller taken from the token', async () => {
    const { controller, retry } = makeController();
    const user = {
      sub: 'u-admin',
      email: 'a@example.test',
      role: UserRole.admin,
    } as JwtPayload;
    await controller.retryNotice('n1', user);
    expect(retry).toHaveBeenCalledWith('n1', {
      userId: 'u-admin',
      role: UserRole.admin,
    });
  });
});

import { StreamableFile } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Readable } from 'stream';
import { PRODUCTION_ROLES } from '../../common/access/caller';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { DeclareProductionEventDto } from '../dto';
import type { ProductionDossierService } from '../production-dossier.service';
import type { ProductionEventsService } from '../production-events.service';
import type { ProductionFilesService } from '../production-files.service';
import type { ProductionMyDayService } from '../production-my-day.service';
import type { ProductionQueueService } from '../production-queue.service';
import type { ProductionSheetService } from '../production-sheet.service';

// The file streams import the order and plan modules' stream functions;
// nothing here opens a file.
jest.mock('../production-files.service', () => ({
  ProductionFilesService: class ProductionFilesService {},
}));

import { ProductionController } from './production.controller';

const user = { sub: 'u-tech', role: UserRole.technician } as JwtPayload;

function makeController() {
  const declare = jest.fn(() => Promise.resolve({ replayed: false }));
  const orderFile = jest.fn(() =>
    Promise.resolve({
      file: new StreamableFile(Readable.from(['x'])),
      contentType: 'image/webp',
      disposition: 'inline; filename="front-photo-001-md.webp"',
      cacheControl: 'private, max-age=86400',
    }),
  );
  const controller = new ProductionController(
    {} as ProductionQueueService,
    {} as ProductionSheetService,
    {} as ProductionDossierService,
    { orderFile } as unknown as ProductionFilesService,
    { declare } as unknown as ProductionEventsService,
    {} as ProductionMyDayService,
  );
  return { controller, declare, orderFile };
}

describe('ProductionController', () => {
  it('admits the technician and the admins only, behind the JWT and roles guards', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProductionController)).toEqual([
      ...PRODUCTION_ROLES,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, ProductionController)).not.toContain(
      UserRole.dentist,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, ProductionController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, ProductionController)).toBe(
      'production',
    );
  });

  it('serves the routes of the contract', () => {
    const pathOf = (method: keyof ProductionController): unknown =>
      Reflect.getMetadata(
        PATH_METADATA,
        ProductionController.prototype[method],
      );
    expect(pathOf('getQueue')).toBe('queue');
    expect(pathOf('getSheet')).toBe('orders/:orderId');
    expect(pathOf('getDossier')).toBe('orders/:orderId/dossier');
    expect(pathOf('downloadOrderFile')).toBe(
      'orders/:orderId/files/:fileId/download',
    );
    expect(pathOf('downloadPlanAttachment')).toBe(
      'orders/:orderId/plan/attachments/:attachmentId/download',
    );
    expect(pathOf('getMovementTableImage')).toBe(
      'orders/:orderId/plan/movement-table-image',
    );
    expect(pathOf('getDentalTableImage')).toBe(
      'orders/:orderId/plan/dental-table-image',
    );
    expect(pathOf('declare')).toBe('events');
    expect(pathOf('cancel')).toBe('events/:id/cancel');
    expect(pathOf('getMyDay')).toBe('my-day');
  });

  it('hands the Idempotency-Key header and the caller to the service', async () => {
    const { controller, declare } = makeController();
    const dto = { orderId: 'o1' } as DeclareProductionEventDto;
    await controller.declare(dto, user, 'key-0001-abcd');
    expect(declare).toHaveBeenCalledWith(dto, 'key-0001-abcd', {
      userId: 'u-tech',
      role: UserRole.technician,
    });
  });

  it('sends a stream with the neutral name and the headers the service chose', async () => {
    const { controller, orderFile } = makeController();
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response;

    const body = await controller.downloadOrderFile(
      'o1',
      'f1',
      { variant: undefined },
      user,
      res,
    );

    expect(body).toBeInstanceOf(StreamableFile);
    expect(orderFile).toHaveBeenCalledWith(
      'o1',
      'f1',
      { userId: 'u-tech', role: UserRole.technician },
      undefined,
    );
    expect(headers).toEqual({
      'Content-Type': 'image/webp',
      'Content-Disposition': 'inline; filename="front-photo-001-md.webp"',
      'Cache-Control': 'private, max-age=86400',
      // Every stream: no sniffing, no script if opened as a document.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
  });
});

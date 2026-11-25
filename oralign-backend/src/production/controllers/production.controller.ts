import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { PRODUCTION_ROLES, type Caller } from '../../common/access/caller';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { STORED_FILE_SECURITY_HEADERS } from '../../media/media.constants';
import {
  CancelProductionEventDto,
  DeclareProductionEventDto,
  ProductionFileDownloadQueryDto,
  ProductionMyDayQueryDto,
  ProductionQueueQueryDto,
} from '../dto';
import { IDEMPOTENCY_KEY_HEADER } from '../production.constants';
import type {
  ProductionCancelResult,
  ProductionCaseSheet,
  ProductionDeclareResult,
  ProductionDossier,
  ProductionMyDay,
  ProductionQueuePage,
} from '../production.contract';
import { ProductionDossierService } from '../production-dossier.service';
import { ProductionEventsService } from '../production-events.service';
import {
  ProductionFilesService,
  type ProductionFileStream,
} from '../production-files.service';
import { ProductionMyDayService } from '../production-my-day.service';
import { ProductionQueueService } from '../production-queue.service';
import { ProductionSheetService } from '../production-sheet.service';

const toCaller = (user: JwtPayload): Caller => ({
  userId: user.sub,
  role: user.role,
});

/** Path ids are uuids: a malformed one is a 400, never a query. */
const uuid = new ParseUUIDPipe();

/**
 * The lab production screens (`/api/production/*`), for the technician
 * and the admins (super_admin passes every @Roles, so nothing below
 * assumes the caller is a technician). Thin: every rule, access check
 * included, lives in the services. Admin-only reports are
 * ProductionAdminController's (production/reports).
 */
@ApiTags('production')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PRODUCTION_ROLES)
@Controller('production')
export class ProductionController {
  constructor(
    private readonly queue: ProductionQueueService,
    private readonly sheets: ProductionSheetService,
    private readonly dossiers: ProductionDossierService,
    private readonly files: ProductionFilesService,
    private readonly events: ProductionEventsService,
    private readonly myDay: ProductionMyDayService,
  ) {}

  @Get('queue')
  @ApiOperation({ summary: 'Cases to make ("En cours") or done ("Terminés").' })
  getQueue(
    @Query() query: ProductionQueueQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProductionQueuePage> {
    return this.queue.list(query, toCaller(user));
  }

  @Get('my-day')
  @ApiOperation({ summary: "The caller's own entries of today or yesterday." })
  getMyDay(
    @Query() query: ProductionMyDayQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProductionMyDay> {
    return this.myDay.get(query, toCaller(user));
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Case sheet: counters, released steps, history.' })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  getSheet(
    @Param('orderId', uuid) orderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProductionCaseSheet> {
    return this.sheets.get(orderId, toCaller(user));
  }

  @Get('orders/:orderId/dossier')
  @ApiOperation({ summary: 'The finance-free case dossier (D9).' })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  getDossier(
    @Param('orderId', uuid) orderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProductionDossier> {
    return this.dossiers.get(orderId, toCaller(user));
  }

  @Get('orders/:orderId/files/:fileId/download')
  // A dossier fires a dozen previews at once; access is checked per file.
  @SkipThrottle()
  @ApiOperation({
    summary:
      'An order file (attachment) or one of its variants (inline, falls back to the original).',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiParam({ name: 'fileId', format: 'uuid' })
  async downloadOrderFile(
    @Param('orderId', uuid) orderId: string,
    @Param('fileId', uuid) fileId: string,
    @Query() query: ProductionFileDownloadQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(
      res,
      await this.files.orderFile(
        orderId,
        fileId,
        toCaller(user),
        query.variant,
      ),
    );
  }

  @Get('orders/:orderId/plan/attachments/:attachmentId/download')
  @SkipThrottle()
  @ApiOperation({ summary: "A deliverable of the case's approved plan." })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  async downloadPlanAttachment(
    @Param('orderId', uuid) orderId: string,
    @Param('attachmentId', uuid) attachmentId: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(
      res,
      await this.files.planAttachment(orderId, attachmentId, toCaller(user)),
    );
  }

  @Get('orders/:orderId/plan/movement-table-image')
  @SkipThrottle()
  @ApiOperation({ summary: "The approved plan's movement table (inline)." })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  async getMovementTableImage(
    @Param('orderId', uuid) orderId: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(
      res,
      await this.files.planImage(orderId, 'movement', toCaller(user)),
    );
  }

  @Get('orders/:orderId/plan/dental-table-image')
  @SkipThrottle()
  @ApiOperation({
    summary: "The approved plan's dental treatment table (inline).",
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  async getDentalTableImage(
    @Param('orderId', uuid) orderId: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(
      res,
      await this.files.planImage(orderId, 'dental', toCaller(user)),
    );
  }

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Declare an act on one arch or both. Replays with the same Idempotency-Key return the original rows.',
  })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description:
      '8-128 characters: letters, digits, _ or -. Reuse it for every retry of one submit.',
  })
  declare(
    @Body() dto: DeclareProductionEventDto,
    @CurrentUser() user: JwtPayload,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey?: string,
  ): Promise<ProductionDeclareResult> {
    return this.events.declare(dto, idempotencyKey, toCaller(user));
  }

  @Patch('events/:id/cancel')
  @ApiOperation({
    summary:
      'Cancel an entry (technician: her own, within 24 h). Idempotent on an already-cancelled row.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  cancel(
    @Param('id', uuid) id: string,
    @Body() dto: CancelProductionEventDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProductionCancelResult> {
    return this.events.cancel(id, dto, toCaller(user));
  }
}

/** Headers first, then the stream: Nest pipes a StreamableFile and handles its errors. */
function send(res: Response, stream: ProductionFileStream): StreamableFile {
  // The uploader declared the stored type: never sniff, never run as a page.
  for (const [name, value] of Object.entries(STORED_FILE_SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  res.setHeader('Content-Type', stream.contentType);
  res.setHeader('Content-Disposition', stream.disposition);
  if (stream.cacheControl) res.setHeader('Cache-Control', stream.cacheControl);
  return stream.file;
}

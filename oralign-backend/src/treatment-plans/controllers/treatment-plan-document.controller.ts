import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import * as fs from 'fs';
import { pipeline } from 'stream';
import { TreatmentPlanDocumentKind, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { attachmentDisposition } from '../../common/http/content-disposition';
import { STORED_FILE_SECURITY_HEADERS } from '../../media/media.constants';
import { TreatmentPlanDocumentService } from '../services/treatment-plan-document.service';
import { TreatmentPlanDocumentDto } from '../dto/treatment-plan-document.dto';
import {
  PLAN_DOCUMENT_MAX_BYTES,
  PLAN_DOCUMENT_MIME,
} from '../documents/plan-document.rules';

const READERS: UserRole[] = [
  UserRole.dentist,
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];
const PLANNERS: UserRole[] = [
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];

const kindPipe = new ParseEnumPipe(TreatmentPlanDocumentKind);

/**
 * Multer options of the PDF upload.
 * - The size limit stops an oversized body while it streams in (413)
 *   instead of buffering it whole. One byte of slack: multer refuses a
 *   file whose size REACHES the limit, and the service judges the exact
 *   25 MB rule (400 DOCUMENT_TOO_LARGE).
 * - `defParamCharset` (multer 2, not in Nest's typing yet): browsers send
 *   the file name as raw UTF-8; read as latin1, "céphalométrie.pdf"
 *   would be stored as mojibake.
 */
const PDF_UPLOAD_OPTIONS: MulterOptions & { defParamCharset: 'utf8' } = {
  limits: { fileSize: PLAN_DOCUMENT_MAX_BYTES + 1, files: 1, fields: 0 },
  defParamCharset: 'utf8',
};

/**
 * The analysis PDFs of a treatment plan version, one slot per kind:
 * `cbct_analysis`, `cephalometric_analysis`.
 */
@ApiTags('treatment-plans')
@ApiBearerAuth('access-token')
@Controller('treatment-plans/:id/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...READERS)
@ApiParam({ name: 'id', type: String, description: 'Treatment plan id' })
@ApiParam({ name: 'kind', enum: TreatmentPlanDocumentKind })
export class TreatmentPlanDocumentController {
  constructor(private readonly documents: TreatmentPlanDocumentService) {}

  @Put(':kind')
  @HttpCode(HttpStatus.OK)
  @Roles(...PLANNERS)
  @UseInterceptors(FileInterceptor('file', PDF_UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload or replace the analysis PDF of one slot (≤ 25 MB)',
  })
  @ApiOkResponse({ type: TreatmentPlanDocumentDto })
  upload(
    @Param('id') id: string,
    @Param('kind', kindPipe) kind: TreatmentPlanDocumentKind,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documents.upload(id, kind, file, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Delete(':kind')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...PLANNERS)
  @ApiOperation({ summary: 'Empty one analysis slot (idempotent)' })
  async remove(
    @Param('id') id: string,
    @Param('kind', kindPipe) kind: TreatmentPlanDocumentKind,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.documents.remove(id, kind, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Get(':kind')
  @SkipThrottle()
  @ApiProduces(PLAN_DOCUMENT_MIME)
  @ApiOperation({ summary: 'Read the analysis PDF of one slot' })
  async read(
    @Param('id') id: string,
    @Param('kind', kindPipe) kind: TreatmentPlanDocumentKind,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const opened = await this.documents.open(id, kind, {
      userId: user.sub,
      role: user.role,
    });
    for (const [name, value] of Object.entries(STORED_FILE_SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }
    res.setHeader('Content-Type', PLAN_DOCUMENT_MIME);
    res.setHeader('Content-Length', String(opened.size));
    res.setHeader(
      'Content-Disposition',
      attachmentDisposition(opened.fileName, 'analyse.pdf'),
    );
    // A patient's clinical document: never kept in a shared disk cache.
    res.setHeader('Cache-Control', 'private, no-store');
    // pipeline, not pipe: a client leaving mid-transfer destroys the file
    // stream instead of leaking its descriptor.
    pipeline(fs.createReadStream(opened.absPath), res, () => undefined);
  }
}

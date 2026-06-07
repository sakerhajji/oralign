import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Body,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BadRequestException } from '../../common/exceptions/app.exception';
import { LocalStorageService } from '../../storage/local-storage.service';
import {
  CompanyBillingSettingsResponseDto,
  UpsertCompanyBillingSettingsDto,
} from '../dto/company-billing-settings.dto';
import { CompanyBillingSettingsService } from '../services/company-billing-settings.service';

const ADMIN_ROLES: UserRole[] = [UserRole.admin, UserRole.super_admin];
const ALLOWED_LOGO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);
const MAX_LOGO_BYTES = 4 * 1024 * 1024; // 4 MB

/**
 * Admin-only endpoints for the singleton company-billing-settings row.
 *
 * Why `/admin/...`: matches the spec, and the route surface makes the
 * admin-only intent visible in Swagger + access logs.
 */
@ApiTags('admin-company-billing-settings')
@ApiBearerAuth('access-token')
@Controller('admin/company-billing-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
export class CompanyBillingSettingsController {
  constructor(
    private readonly service: CompanyBillingSettingsService,
    private readonly storage: LocalStorageService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Get the current active company billing settings (singleton). Returns null if not configured yet.',
  })
  @ApiResponse({ status: 200, type: CompanyBillingSettingsResponseDto })
  async getActive(): Promise<CompanyBillingSettingsResponseDto | null> {
    const settings = await this.service.getActive();
    return settings ? CompanyBillingSettingsService.toDto(settings) : null;
  }

  @Put()
  @ApiOperation({
    summary:
      'Upsert the company billing settings. First call requires companyName.',
  })
  @ApiResponse({ status: 200, type: CompanyBillingSettingsResponseDto })
  async upsert(
    @Body() dto: UpsertCompanyBillingSettingsDto,
  ): Promise<CompanyBillingSettingsResponseDto> {
    const settings = await this.service.upsert(dto);
    return CompanyBillingSettingsService.toDto(settings);
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_LOGO_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload (or replace) the company logo.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, type: CompanyBillingSettingsResponseDto })
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<CompanyBillingSettingsResponseDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!ALLOWED_LOGO_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        'Logo must be PNG, JPEG, or WebP. SVG is intentionally rejected to keep PDFs safe.',
      );
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new BadRequestException(
        `Logo must be ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB or smaller.`,
      );
    }
    // Store under uploads/company-logos/<uuid>.ext via the shared local
    // storage helper. Returns a path like "/uploads/company-logos/<uuid>.png".
    const url = await this.storage.uploadFile(file, 'company-logos');
    // The service expects the path WITHOUT the leading "/uploads/" since
    // every other relative path on the project follows that convention
    // (see OrderFile.relativePath, TreatmentMessageAttachment.filePath).
    const relativePath = url.startsWith('/uploads/')
      ? url.slice('/uploads/'.length)
      : url;
    const updated = await this.service.setLogoPath(relativePath);
    return CompanyBillingSettingsService.toDto(updated);
  }

  @Delete('logo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove the current company logo.' })
  @ApiResponse({ status: 200, type: CompanyBillingSettingsResponseDto })
  async clearLogo(): Promise<CompanyBillingSettingsResponseDto | null> {
    const updated = await this.service.clearLogo();
    return updated ? CompanyBillingSettingsService.toDto(updated) : null;
  }
}

/**
 * Doctor-safe "public defaults" surface.
 *
 * The treatment-fee payment dialog (and any future doctor-facing
 * pricing surface) needs to read `defaultTreatmentFee` + `defaultCurrency`.
 * The admin controller above is gated to admins only — exposing the
 * whole singleton (company name, logo path, bank IBAN, legal text)
 * to dentists would leak admin configuration into the doctor surface.
 *
 * This second controller mounts a separate route that returns ONLY
 * the two safe public defaults, and allows the dentist role to read
 * them. Same singleton row underneath, narrowed projection at the
 * DTO boundary.
 */
@ApiTags('company-billing-settings')
@ApiBearerAuth('access-token')
@Controller('company-billing-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
export class PublicBillingDefaultsController {
  constructor(
    private readonly service: CompanyBillingSettingsService,
  ) {}

  @Get('public-defaults')
  @ApiOperation({
    summary:
      'Read the doctor-safe defaults: treatment fee + currency. Used by the treatment-fee payment dialog.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        defaultTreatmentFee: { type: 'number', example: 100 },
        defaultCurrency: { type: 'string', example: 'TND' },
      },
    },
  })
  async getPublicDefaults(): Promise<{
    defaultTreatmentFee: number;
    defaultCurrency: string;
  }> {
    const settings = await this.service.getActive();
    return {
      defaultTreatmentFee: settings
        ? Number(settings.defaultTreatmentFee)
        : 0,
      defaultCurrency: settings?.defaultCurrency ?? 'TND',
    };
  }
}

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
import { Public } from '../../common/decorators/public.decorator';
import { BadRequestException } from '../../common/exceptions/app.exception';
import { LocalStorageService } from '../../storage/local-storage.service';
import {
  CompanyBillingSettingsResponseDto,
  LegalInfoDto,
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
 * pricing surface) needs to read:
 *   • `defaultTreatmentFee` + `defaultCurrency` — what to pay
 *   • `companyName` / `companyAddress` / `companyCity` — beneficiary
 *   • `bankDetails` — where to wire bank transfers (bank name,
 *     account holder, RIB, IBAN, SWIFT)
 *
 * The admin controller above returns the WHOLE singleton (logo paths,
 * legal text translations, devisNextNumber, tax registration number,
 * etc.) and is gated to admins-only.
 *
 * This second controller mounts a separate route that returns ONLY
 * the doctor-relevant subset above, narrowed at the DTO boundary, and
 * allows the dentist role to read it. Bank details are intentionally
 * shared with the payer (that's the whole point — you can't wire
 * without them) so exposing them to doctors is by design, not a leak.
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
      'Read the doctor-safe defaults: treatment fee, currency, and the company bank-transfer details. Used by the treatment-fee payment dialog so the doctor sees where to wire the money — same source of truth the admin manages at /account/billing-settings.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        defaultTreatmentFee: { type: 'number', example: 100 },
        defaultCurrency: { type: 'string', example: 'TND' },
        companyName: { type: 'string', nullable: true },
        companyAddress: { type: 'string', nullable: true },
        companyCity: { type: 'string', nullable: true },
        bankDetails: {
          type: 'object',
          nullable: true,
          properties: {
            bankName: { type: 'string' },
            accountName: { type: 'string' },
            rib: { type: 'string' },
            iban: { type: 'string' },
            swift: { type: 'string' },
          },
        },
      },
    },
  })
  async getPublicDefaults(): Promise<{
    defaultTreatmentFee: number;
    defaultCurrency: string;
    companyName: string | null;
    companyAddress: string | null;
    companyCity: string | null;
    bankDetails: {
      bankName?: string;
      accountName?: string;
      rib?: string;
      iban?: string;
      swift?: string;
    } | null;
  }> {
    const settings = await this.service.getActive();
    // `bankDetails` is stored as Prisma.Json — Prisma types it as
    // JsonValue, but our DTO at write-time is BankDetailsDto, so the
    // runtime shape matches the structural subtype below. We cast
    // through `unknown` to make TypeScript accept the narrowing
    // without weakening callers' types.
    const rawBank = (settings?.bankDetails ?? null) as
      | {
          bankName?: string;
          accountName?: string;
          rib?: string;
          iban?: string;
          swift?: string;
        }
      | null;
    // Treat an empty `{}` (admin saved nothing) as null so the UI
    // shows the friendly "not configured yet" fallback instead of an
    // empty panel.
    const bankDetails =
      rawBank &&
      (rawBank.bankName ||
        rawBank.accountName ||
        rawBank.rib ||
        rawBank.iban ||
        rawBank.swift)
        ? rawBank
        : null;
    return {
      defaultTreatmentFee: settings
        ? Number(settings.defaultTreatmentFee)
        : 0,
      defaultCurrency: settings?.defaultCurrency ?? 'TND',
      companyName: settings?.companyName ?? null,
      companyAddress: settings?.companyAddress ?? null,
      companyCity: settings?.companyCity ?? null,
      bankDetails,
    };
  }
}

/**
 * PUBLIC (no-auth) legal-identity surface.
 *
 * Backs the unauthenticated showcase compliance pages — "Qui sommes-nous",
 * "Mentions légales", "Conditions de vente", "Réclamations et
 * remboursements" — and the dashboard help page. It returns ONLY the
 * legal fields a Tunisian merchant must publish (raison sociale, forme
 * juridique, matricule fiscal, RC, adresse, contact, hébergeur, domaine)
 * plus the merchant currency. NO bank details, counters, fees, or logo.
 *
 * Kept in its own controller (mirroring PublicPackController) so the
 * `@Public()` route never sits under a class-level RolesGuard — the
 * showcase is browsed by anonymous visitors, so a role check here would
 * produce a confusing 403.
 */
@ApiTags('company-billing-settings')
@Controller('company-billing-settings')
export class PublicLegalInfoController {
  constructor(private readonly service: CompanyBillingSettingsService) {}

  @Public()
  @Get('legal-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Public legal identity (mentions légales) for the compliance pages: ' +
      'company name, legal form, tax id, RC, address, contact, hosting, ' +
      'domain and merchant currency. No auth required. Same source of ' +
      'truth the admin manages at /account/billing-settings.',
  })
  @ApiResponse({ status: 200, type: LegalInfoDto })
  async getLegalInfo(): Promise<LegalInfoDto> {
    return this.service.getLegalInfo();
  }
}

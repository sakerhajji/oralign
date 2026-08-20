import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ADMIN_ROLES, type Caller } from '../../common/access/caller';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateInvoiceDto,
  InvoiceFilterDto,
  InvoiceIdsDto,
  UpdateInvoiceDto,
} from '../dto/invoice.dto';
import { InvoiceExportService } from '../services/invoice-export.service';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { InvoiceService } from '../services/invoice.service';
import { InvoiceLanguage } from '../services/invoice-i18n';

/** RFC 5987 Content-Disposition, same helper the invoice download uses. */
function contentDisposition(fileName: string): string {
  const ascii =
    fileName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]+/g, '_')
      .replace(/["\\]/g, '_')
      .slice(0, 120) || 'export';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function parseLang(value?: string): InvoiceLanguage | undefined {
  return value === 'fr' || value === 'en' ? value : undefined;
}

/**
 * Admin invoicing desk.
 *
 * Every route here is admin-only, twice over: `@Roles(...ADMIN_ROLES)` on
 * the class (the RolesGuard refuses a dentist outright) and no route takes
 * an owner-scoped identity — there is nothing a caller could substitute to
 * reach another tenant's row, which is what closes the IDOR/BOLA question
 * for this surface. The two ORIGINAL invoice endpoints keep their own
 * doctor-or-admin rules and are untouched.
 */
@ApiTags('admin-invoices')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Controller('admin/invoices')
export class AdminInvoiceController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly exports: InvoiceExportService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly prisma: PrismaService,
  ) {}

  private caller(user: JwtPayload): Caller {
    return { userId: user.sub, role: user.role as UserRole };
  }

  // ─── Liste, recherche, filtres ──────────────────────────────────────

  @Get()
  @ApiOperation({
    summary:
      'Liste paginee des factures. Recherche (numero / client / commande), filtre par statut et par periode.',
  })
  async list(@Query() filters: InvoiceFilterDto) {
    return this.invoices.list(filters);
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'Totaux HT / TVA / TTC de TOUTES les factures du filtre courant (pas seulement la page).',
  })
  async summary(@Query() filters: InvoiceFilterDto) {
    return this.invoices.summarise(filters);
  }

  /**
   * Client lookup for the create form: find an existing patient and hand
   * back their orders so the admin can prefill the invoice from one.
   * Placed BEFORE `:id` so "clients" is never read as an invoice id.
   */
  @Get('clients')
  @ApiOperation({
    summary:
      "Recherche d'un patient existant (nom / email / telephone) avec ses commandes, pour preremplir une facture.",
  })
  async findClients(@Query('search') search?: string) {
    const term = (search ?? '').trim();
    if (term.length < 2) return { data: [] };

    const patients = await this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        address: true,
        doctor: {
          select: {
            id: true,
            fullName: true,
            email: true,
            dentistProfile: {
              select: {
                clinicName: true,
                clinicAddress: true,
                city: true,
                country: true,
                clinicPhone: true,
                clinicEmail: true,
                taxId: true,
              },
            },
          },
        },
        orders: {
          where: { deletedAt: null },
          select: {
            id: true,
            orderCode: true,
            status: true,
            createdAt: true,
            treatmentFeeAmount: true,
            quotation: {
              select: { id: true, totalTtc: true, packName: true, status: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
      orderBy: { fullName: 'asc' },
      take: 10,
    });

    return { data: patients };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d une facture, lignes + journal d audit.' })
  @ApiParam({ name: 'id', type: String })
  async getOne(@Param('id') id: string) {
    return this.invoices.getById(id, { allowDeleted: true });
  }

  // ─── Ecritures ──────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Creer une facture manuelle. Les totaux sont TOUJOURS recalcules par le serveur a partir des lignes.',
  })
  async create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: JwtPayload) {
    return this.invoices.create(dto, this.caller(user));
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Modifier une facture. `lines` fourni remplace TOUTES les lignes. Une facture emise ou payee laisse une trace dans le journal d audit.',
  })
  @ApiParam({ name: 'id', type: String })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invoices.update(id, dto, this.caller(user));
  }

  // ─── Cycle de suppression: archiver -> restaurer -> purger ──────────

  @Delete(':id')
  @ApiOperation({ summary: 'Archiver une facture (soft delete, reversible).' })
  @ApiParam({ name: 'id', type: String })
  async archive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.invoices.archive(id, this.caller(user));
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Restaurer une facture archivee.' })
  @ApiParam({ name: 'id', type: String })
  async restore(@Param('id') id: string) {
    return this.invoices.restore(id);
  }

  @Delete(':id/permanent')
  @ApiOperation({
    summary:
      'Supprimer definitivement. Refuse (409) des que la facture a ete emise — une sequence fiscale ne peut pas avoir de trous.',
  })
  @ApiParam({ name: 'id', type: String })
  async permanentDelete(@Param('id') id: string) {
    return this.invoices.permanentDelete(id);
  }

  // ─── PDF + exports groupes ──────────────────────────────────────────

  @Get(':id/pdf')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Telecharger le PDF. Meme gabarit, meme CSS et meme moteur que les recus de paiement.',
  })
  @ApiParam({ name: 'id', type: String })
  async pdf(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const { buffer, fileName, mimeType } =
      await this.invoicePdf.renderInvoiceRecordBuffer({
        invoiceId: id,
        language: parseLang(lang),
      });
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', contentDisposition(fileName));
    res.setHeader('Content-Length', buffer.length.toString());
    res.status(HttpStatus.OK).end(buffer);
  }

  @Get('export/csv')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Export CSV de TOUTES les factures du filtre courant (UTF-8 BOM + separateur ";" => ouvre directement dans Excel).',
  })
  async exportCsv(
    @Query() filters: InvoiceFilterDto,
    @Res() res: Response,
  ): Promise<void> {
    const { content, fileName, mimeType } = await this.exports.buildCsv(filters);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', contentDisposition(fileName));
    res.status(HttpStatus.OK).end(content);
  }

  @Post('export/zip')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Export ZIP des PDF des factures selectionnees — le paquet que le comptable recoit.',
  })
  async exportZip(@Body() dto: InvoiceIdsDto, @Res() res: Response): Promise<void> {
    const { archive, fileName } = await this.exports.buildPdfZip(dto.ids);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', contentDisposition(fileName));
    archive.pipe(res);
  }

  // ─── Actions groupees ───────────────────────────────────────────────

  @Post('bulk/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archiver plusieurs factures.' })
  async bulkArchive(
    @Body() dto: InvoiceIdsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ archived: number }> {
    const caller = this.caller(user);
    let archived = 0;
    for (const id of dto.ids) {
      try {
        await this.invoices.archive(id, caller);
        archived += 1;
      } catch {
        // Already archived or gone — skip it rather than fail the batch.
      }
    }
    return { archived };
  }
}

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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
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
import {
  CreateInvoiceDto,
  InvoiceFilterDto,
  InvoiceIdsDto,
  InvoiceZipExportDto,
  UpdateInvoiceDto,
} from '../dto/invoice.dto';
import {
  AccountingSummaryPdfQueryDto,
  AccountingSummaryQueryDto,
} from '../dto/invoice-accounting.dto';
import {
  InvoiceAccountingService,
  type AccountingSummary,
} from '../services/invoice-accounting.service';
import { InvoiceExportService } from '../services/invoice-export.service';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { InvoiceService } from '../services/invoice.service';
import { InvoiceAutoService } from '../services/invoice-auto.service';
import {
  InvoiceMailService,
  type InvoiceEmailed,
} from '../services/invoice-mail.service';
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
    private readonly autoInvoices: InvoiceAutoService,
    private readonly invoiceMail: InvoiceMailService,
    private readonly accounting: InvoiceAccountingService,
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
   * The accountant's view of a period (Tunis days, both bounds included):
   * factures comptabilisées (issued + paid, not archived) with HT / TVA /
   * timbre / TTC / retenues / net, TVA per rate, collections per method,
   * retenues per practitioner, months; drafts and cancelled apart.
   * Placed BEFORE `:id` so "accounting-summary" is never read as an id.
   */
  @Get('accounting-summary')
  @ApiOperation({
    summary:
      'Recapitulatif comptable d une periode (jours de Tunis) : CA HT, TVA par taux, droit de timbre, TTC, retenues a la source par praticien, encaissements par mode, ventilation mensuelle. Brouillons et annulees a part.',
  })
  async accountingSummary(
    @Query() query: AccountingSummaryQueryDto,
  ): Promise<AccountingSummary> {
    return this.accounting.summarise(query);
  }

  /** The same period as an A4 PDF, for the accountant's file. Before `:id/pdf`. */
  @Get('accounting-summary/pdf')
  @Throttle({
    short: { limit: 6, ttl: 10_000 },
    medium: { limit: 30, ttl: 60_000 },
  })
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary:
      'Le recapitulatif comptable en PDF (A4, francais par defaut, language=en) : recap-comptable-<from>_<to>.pdf.',
  })
  async accountingSummaryPdf(
    @Query() query: AccountingSummaryPdfQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName } = await this.accounting.renderPdf(query, {
      language: query.language,
      userId: user.sub,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(fileName));
    res.setHeader('Content-Length', buffer.length.toString());
    // A snapshot of private money data: never cached.
    res.setHeader('Cache-Control', 'no-store');
    res.status(HttpStatus.OK).end(buffer);
  }

  /**
   * Customer lookup for the create form. The customer of an invoice is
   * the practitioner ("Docteur"), so this searches practitioners and hands
   * back their clinic block and recent orders to prefill from.
   * Placed BEFORE `:id` so "clients" is never read as an invoice id.
   */
  @Get('clients')
  @ApiOperation({
    summary:
      'Recherche d un praticien (nom / email / telephone / cabinet) avec son cabinet et ses commandes, pour preremplir une facture.',
  })
  async findClients(@Query('search') search?: string) {
    return this.invoices.searchPractitioners(search);
  }

  @Post('backfill')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Genere les factures manquantes pour les paiements deja encaisses (avant la generation automatique, ou si un listener a echoue). Idempotent.',
  })
  async backfill(): Promise<{ scanned: number; created: number }> {
    return this.autoInvoices.backfill();
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

  @Post(':id/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Envoyer (ou renvoyer) le PDF de la facture par e-mail au praticien. Trace dans le journal d audit. Erreurs : 400 INVOICE_NO_RECIPIENT, 422 MAIL_NOT_CONFIGURED, 422 MAIL_SEND_FAILED.',
  })
  @ApiParam({ name: 'id', type: String })
  async email(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<InvoiceEmailed> {
    return this.invoiceMail.sendManual(id, this.caller(user));
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
      'Export ZIP des PDF — le paquet que le comptable recoit. `ids` : les factures choisies (200 au plus). Sans `ids` : toutes les factures emises, payees et annulees de la periode issuedFrom..issuedTo (jours de Tunis ; ni brouillons ni archivees ; 1000 au plus, sinon 400 TOO_MANY_INVOICES ; aucune : 400 NO_INVOICE_IN_PERIOD), precedees du recapitulatif comptable PDF et du journal des ventes CSV.',
  })
  async exportZip(
    @Body() dto: InvoiceZipExportDto,
    @Res() res: Response,
  ): Promise<void> {
    const { archive, fileName } =
      Array.isArray(dto.ids)
        ? await this.exports.buildPdfZip(dto.ids)
        : await this.exports.buildPeriodPdfZip({
            issuedFrom: dto.issuedFrom,
            issuedTo: dto.issuedTo,
          });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', contentDisposition(fileName));

    // Same teardown pattern as the order ZIP export (order.controller.ts):
    // an archiver stream with NO 'error' listener crashes the process on
    // the first emitted error, and a cancelled download only unpipes —
    // without abort() the detached render loop keeps feeding Puppeteer
    // output into an archive nobody drains.
    archive.on('error', (err) => {
      if (!res.headersSent) res.status(HttpStatus.INTERNAL_SERVER_ERROR);
      archive.abort();
      res.destroy(err);
    });
    res.on('close', () => {
      if (!res.writableFinished) archive.abort();
    });

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

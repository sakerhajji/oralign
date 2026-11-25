import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DevisLanguage, UserRole } from '@prisma/client';
import { Response } from 'express';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateQuotationDto,
  QuotationFilterDto,
  QuotationResponseDto,
  RejectQuotationDto,
  UpdateQuotationDto,
} from '../dto/quotation.dto';
import { QuotationService } from '../services/quotation.service';
import { QuotationPdfService } from '../services/quotation-pdf.service';
import { ADMIN_ROLES } from '../../common/access/caller';

const ALL_AUTHED: UserRole[] = [
  UserRole.dentist,
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];

function contentDispositionFileName(fileName: string): string {
  const asciiName =
    fileName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]+/g, '_')
      .replace(/["\\]/g, '_')
      .slice(0, 120) || 'quotation.pdf';

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

@ApiTags('quotations')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_AUTHED)
export class QuotationController {
  constructor(
    private readonly service: QuotationService,
    private readonly pdfService: QuotationPdfService,
  ) {}

  // ─── Nested under /orders/:orderId ──────────────────────────────────────

  @Post('orders/:orderId/quotations')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary:
      'Create a quotation for an order. Admin-only. Fails if a non-cancelled quote already exists.',
  })
  @ApiParam({ name: 'orderId', type: String })
  @ApiResponse({ status: 201, type: QuotationResponseDto })
  async create(
    @Param('orderId') orderId: string,
    @Body() dto: CreateQuotationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(orderId, dto, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Get('orders/:orderId/quotation')
  @ApiOperation({
    summary:
      "Get the order's quotation (admin, owning dentist, assigned designer).",
  })
  @ApiParam({ name: 'orderId', type: String })
  @ApiResponse({ status: 200, type: QuotationResponseDto })
  async getForOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getForOrder(orderId, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  // ─── Top-level /quotations/:id ─────────────────────────────────────────

  @Put('quotations/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary:
      'Update quotation fees / language / notes (admin; draft, sent or approved). Fees are TTC. ' +
      'A new total rebalances the unpaid installments in proportion; paid ones never move. ' +
      'Errors: 400 QUOTE_TOTAL_BELOW_PAID, 409 QUOTE_PAYMENT_IN_FLIGHT, 409 QUOTE_PLAN_REQUIRED.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: QuotationResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  /** Same edit under PATCH: the update is partial, both verbs are accepted. */
  @Patch('quotations/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Alias of PUT quotations/:id.' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: QuotationResponseDto })
  async patch(
    @Param('id') id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.update(id, dto, user);
  }

  @Post('quotations/:id/send')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary:
      'Send a draft quotation to the doctor. Locks in quotationNumber + company/clinic snapshots, renders the stored devis PDF, transitions order.status to quotation_sent.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: QuotationResponseDto })
  async send(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.send(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('quotations/:id/generate-pdf')
  @HttpCode(HttpStatus.OK)
  // Both admins AND the owning dentist can hit this — dentists need it
  // so they can request a translated version of the PDF in their own
  // language (FR/EN/AR). The service does the fine-grained RBAC via
  // `getForOrderByQuotationId` (admin / owning doctor / assigned
  // designer).
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @ApiOperation({
    summary:
      'Render (or re-render) the PDF for a quotation. Pass ?lang=fr|en|ar to request a translated version — the chosen language is persisted on the row so subsequent downloads stay consistent. Auto-allocates the quotation number and snapshots if missing.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: DevisLanguage,
    description:
      'Override the document language without unsending the quote. Defaults to the language already on the row.',
  })
  @ApiResponse({ status: 200, type: QuotationResponseDto })
  async generatePdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('lang') lang?: DevisLanguage,
  ) {
    // Re-render path is identical for admin and dentist — service
    // handles language switching (which is a pure translation, NOT a
    // business edit, so it works even on already-sent quotes).
    const quote = await this.service.regeneratePdfInLanguage(id, lang, {
      userId: user.sub,
      role: user.role as UserRole,
    });
    return this.service.present(await this.pdfService.generateAndPersist(quote));
  }

  @Get('quotations/:id/pdf')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Stream the generated PDF (admin, owning dentist). RBAC-gated, not served via the public /uploads static route. A sent or approved quote whose file is missing is rendered on the spot, in its own language.',
  })
  @ApiParam({ name: 'id', type: String })
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const quote = await this.service.getForOrderByQuotationId(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
    // A numbered quote whose devis file is gone (dropped as stale by a
    // migration, or missing on disk) is rendered again instead of a 404.
    const stored = await this.pdfService.ensureStoredPdf(quote);
    const { stream, fileName, mimeType } =
      await this.pdfService.openPdfStream(stored);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', contentDispositionFileName(fileName));
    stream.pipe(res);
  }

  @Post('quotations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary:
      'Delete a quotation at any status while no money was received and no payment is in progress (failed / expired / rejected / cancelled attempts do not block it). Frees the order slot so admin can re-issue a fresh quote. Errors: 409 QUOTE_PAYMENT_RECEIVED, 409 QUOTE_PAYMENT_IN_FLIGHT.',
  })
  @ApiParam({ name: 'id', type: String })
  async cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.cancel(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('quotations/:id/revert-to-draft')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary:
      'Recall a sent or approved quotation back to draft so admin can correct it (wrong pack, wrong fees, wrong language, typo), while no money was received and none is in progress. The order goes back to treatment_approved and the doctor receives a "revision incoming" bell ping. Errors: 409 QUOTE_PAYMENT_RECEIVED, 409 QUOTE_PAYMENT_IN_FLIGHT.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: QuotationResponseDto })
  async revertToDraft(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.revertToDraft(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  // ─── Doctor actions ─────────────────────────────────────────────────────

  @Post('quotations/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Doctor (or admin) approves the quotation. Transitions order.status to fabrication.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: QuotationResponseDto })
  async approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.approve(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('quotations/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Doctor (or admin) rejects the quotation. Transitions order.status to canceled.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: QuotationResponseDto })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectQuotationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reject(id, dto.rejectionReason, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  // ─── Admin listing ──────────────────────────────────────────────────────

  @Get('admin/quotations')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary:
      'Browse all quotations (admin). Filterable by status, language, doctor, order code, and date range.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'language', required: false })
  @ApiQuery({ name: 'doctorId', required: false, type: String })
  @ApiQuery({ name: 'orderCode', required: false, type: String })
  @ApiQuery({ name: 'createdFrom', required: false, type: String })
  @ApiQuery({ name: 'createdTo', required: false, type: String })
  async listAdmin(
    @Query() filter: QuotationFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listAdmin(filter, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }
}

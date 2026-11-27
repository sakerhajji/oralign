import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { pipeline } from 'stream';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { OrderFileCategory, OrderStatus, UserRole } from '@prisma/client';
import { Response } from 'express';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  BulkDeleteOrdersDto,
  BulkPermanentDeleteOrdersDto,
  BulkRestoreOrdersDto,
  BulkUpdateOrderStatusDto,
  CreateOrderDto,
  InitChunkedUploadDto,
  OrderFilterDto,
  OrderResponseDto,
  SubmitOrderDto,
  TreatmentFeeProofDto,
  UpdateOrderDto,
  UpdateOrderStatusDto,
  UpdateToothInstructionsDto,
} from '../dto/order.dto';
import {
  ConfirmTreatmentFeeDto,
  PayTreatmentFeeRequestDto,
  RejectTreatmentFeeDto,
  TreatmentFeeFilterDto,
  TreatmentFeePageDto,
  TreatmentFeeQueueQueryDto,
  TreatmentFeeReviewOpenedDto,
} from '../dto/treatment-fee.dto';
import {
  ReceiptFileInterceptor,
  type ReceiptUpload,
  sendReceipt,
} from '../../payments/receipt-file';
import { ChunkedUploadService } from '../services/chunked-upload.service';
import { OrderService } from '../services/order.service';
import { OrderFilesService } from '../services/order-files.service';
import { OrderExportService } from '../services/order-export.service';
import { TreatmentFeeService } from '../services/treatment-fee.service';
import { OrderAuditService } from '../services/order-audit.service';
import { STORED_FILE_SECURITY_HEADERS } from '../../media/media.constants';

@ApiTags('orders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.dentist,
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
)
@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orderFiles: OrderFilesService,
    private readonly orderExport: OrderExportService,
    private readonly treatmentFees: TreatmentFeeService,
    private readonly chunkedUploads: ChunkedUploadService,
    private readonly orderAudit: OrderAuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an order draft' })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: JwtPayload,
    // Optional. The wizard sends one key per draft it tries to create, so
    // a POST repeated after a lost response returns the order the first
    // attempt made instead of creating a twin. See OrderService.createOrder.
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<OrderResponseDto> {
    return this.orderService.createOrder(
      createOrderDto,
      { userId: user.sub, role: user.role },
      idempotencyKey,
    );
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get orders with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'doctorId', required: false, type: String })
  @ApiQuery({ name: 'patientId', required: false, type: String })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  @ApiQuery({ name: 'orderCode', required: false, type: String })
  async getOrders(
    @CurrentUser() user: JwtPayload,
    // Bind the FULL DTO instead of cherry-picking specific fields —
    // the previous signature silently dropped `sortBy`, `sortOrder`,
    // `createdFrom`, `createdTo`, and `includeDeleted`, which is why
    // the date range / sort / trash-bin filters weren't reaching the
    // service.
    @Query() filters: OrderFilterDto,
  ) {
    return this.orderService.getOrders(
      filters.page ?? 1,
      filters.limit ?? 10,
      filters,
      { userId: user.sub, role: user.role },
    );
  }

  @Get(':id/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get the unified order history: direct edits, plans, quotations, payments and deliveries.',
  })
  @ApiParam({ name: 'id', type: String })
  async getOrderHistory(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderAudit.list(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async getOrderById(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.orderService.getOrderById(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update order clinical details' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async updateOrder(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.orderService.updateOrder(id, updateOrderDto, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete an order' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Order deleted successfully' })
  async deleteOrder(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.orderService.deleteOrder(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Delete(':id/permanent')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete an order and its files' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Order permanently deleted successfully',
  })
  async permanentDeleteOrder(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.orderService.permanentDeleteOrder(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Post(':id/restore')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Restore a soft-deleted order (clears deletedAt). Idempotent — already-live orders return a no-op message. Admin-only.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Order restored successfully' })
  async restoreOrder(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.orderService.restoreOrder(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Post(':id/mark-seen')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark an order as seen by an admin (stamps adminSeenAt). Clears the sidebar "new orders" badge. Idempotent. Admin-only.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Order marked seen' })
  async markSeen(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ seen: boolean }> {
    return this.orderService.markSeenByAdmin(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a draft order' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async submitOrder(
    @Param('id') id: string,
    @Body() submitOrderDto: SubmitOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.orderService.submitOrder(id, submitOrderDto, {
      userId: user.sub,
      role: user.role,
    });
  }

  /**
   * Pay the order's treatment fee. Routes by `body.method`:
   *
   *   • `card`          → refused: the ClicToPay hosted checkout only
   *   • `cash` / `cheque` → admin-only; stamps paidAt
   *   • `bank_transfer` → an ADMIN declaring for the doctor without a
   *     receipt, with `overrideNote`. A dentist declares through
   *     POST /treatment-fee/proof (400 PROOF_REQUIRED here).
   */
  @Post(':id/treatment-fee/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Pay the treatment fee. Cash/cheque (admin) → instant. Bank transfer: admin without a receipt, with overrideNote; a dentist uploads the receipt instead (400 PROOF_REQUIRED).',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async payTreatmentFee(
    @Param('id') id: string,
    @Body() body: PayTreatmentFeeRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    // Amount is computed server-side (audit M-4) — the client only
    // chooses the payment method and whether the retenue applies.
    return this.treatmentFees.payTreatmentFee(
      id,
      body.method,
      { userId: user.sub, role: user.role },
      body.applyWithholding,
      body.overrideNote,
    );
  }

  /**
   * Upload the bank-transfer receipt of the treatment fee: the doctor's
   * declaration (JPEG / PNG / WebP / PDF, 10 MB). memoryStorage: nothing
   * reaches the disk before the service has authorised the caller and
   * checked the fee and the bytes. Idempotency-Key: a repeat on this
   * order answers the order as it stands.
   */
  @Post(':id/treatment-fee/proof')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Upload the bank-transfer receipt of the treatment fee (declares the transfer; a declaration still awaiting is replaced). 400 PROOF_REQUIRED / RECEIPT_TYPE / RECEIPT_TOO_LARGE; 409 TRANSFER_ALREADY_PROCESSED once the fee is paid (e.g. an admin confirmed the transfer being replaced).',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        proof: { type: 'string', format: 'binary' },
        applyWithholding: { type: 'string', enum: ['true', 'false'] },
      },
    },
  })
  @UseInterceptors(ReceiptFileInterceptor('proof'))
  async uploadTreatmentFeeProof(
    @Param('id') id: string,
    @UploadedFile() proof: ReceiptUpload | undefined,
    @Body() body: TreatmentFeeProofDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    // The amount is derived server-side (audit M-4), not read from the
    // multipart body.
    return this.treatmentFees.uploadTreatmentFeeProof(
      id,
      proof ?? null,
      { userId: user.sub, role: user.role },
      body.applyWithholding,
      idempotencyKey,
    );
  }

  /**
   * The doctor (or an admin) withdraws the fee declaration still awaiting
   * confirmation: the fee is payable again, the receipt file is kept.
   */
  @Delete(':id/treatment-fee/proof')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Withdraw the treatment-fee transfer still awaiting confirmation (the receipt file is kept). 409 TRANSFER_NOT_WITHDRAWABLE once processed.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async withdrawTreatmentFeeProof(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.treatmentFees.withdrawTreatmentFeeProof(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  /**
   * The fee receipt itself, for the owning dentist and admins (an
   * authenticated blob on the screens). Designers and technicians are let
   * through the role check on purpose: they read the same 404
   * PROOF_NOT_FOUND as for a missing file.
   */
  @Get(':id/treatment-fee/proof')
  @Roles(
    UserRole.dentist,
    UserRole.admin,
    UserRole.super_admin,
    UserRole.designer,
    UserRole.technician,
  )
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Stream the treatment-fee receipt (owning dentist and admins). private, no-store; nosniff.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  @ApiNotFoundResponse({ description: 'PROOF_NOT_FOUND' })
  async readTreatmentFeeProof(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() response: Response,
  ): Promise<void> {
    const { receipt, downloadName } =
      await this.treatmentFees.readTreatmentFeeProof(id, {
        userId: user.sub,
        role: user.role,
      });
    sendReceipt(response, receipt, downloadName);
  }

  /**
   * An admin opened the fee receipt: the first opening stamps
   * treatmentFeeReviewOpenedAt ("À vérifier"), every opening marks this
   * admin's notifications of the declaration read.
   */
  @Post(':id/treatment-fee/review-opened')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record that an admin opened the treatment-fee receipt (the first opening stamps treatmentFeeReviewOpenedAt).',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: TreatmentFeeReviewOpenedDto })
  async treatmentFeeReviewOpened(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TreatmentFeeReviewOpenedDto> {
    return this.treatmentFees.markTreatmentFeeReviewOpened(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  /**
   * Admin confirms a pending bank-transfer fee. Flips the payment status
   * to `success` and stamps `treatmentFeePaidAt`, which unlocks
   * treatment-plan creation. A repeat on a paid fee answers 200. Cash and
   * card don't need this endpoint — they stamp `treatmentFeePaidAt`
   * directly.
   */
  @Post(':id/treatment-fee/confirm')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Admin confirms a pending bank-transfer treatment fee. 409 TRANSFER_ALREADY_PROCESSED; 400 PROOF_OVERRIDE_NOTE_REQUIRED without a receipt.',
  })
  @ApiParam({ name: 'id', type: String })
  async confirmTreatmentFeePayment(
    @Param('id') id: string,
    @Body() body: ConfirmTreatmentFeeDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.treatmentFees.confirmTreatmentFeePayment(
      id,
      { userId: user.sub, role: user.role },
      { overrideNote: body.overrideNote, declaredAt: body.declaredAt },
    );
  }

  /** Admin refuses the fee transfer with a reason (the doctor reads it). */
  @Post(':id/treatment-fee/reject')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Admin refuses the treatment-fee transfer with a reason (3-500 characters; a repeat: 200). 409 TRANSFER_ALREADY_PROCESSED.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async rejectTreatmentFeePayment(
    @Param('id') id: string,
    @Body() body: RejectTreatmentFeeDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.treatmentFees.rejectTreatmentFeePayment(
      id,
      { userId: user.sub, role: user.role },
      { rejectionReason: body.rejectionReason, declaredAt: body.declaredAt },
    );
  }

  // ── Admin treatment-fee list endpoints ────────────────────────────
  //
  // Hosted at `admin/treatment-fees/...` (NOT `:id/treatment-fee/...`)
  // because they're listing operations, not per-order actions. Same
  // paginated envelope as the installment-Payment queue so the
  // admin /payments/pending and /payments/history pages can render
  // both sources side-by-side with the same UI primitives.

  @Get('admin/treatment-fees/pending')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Admin: bank-transfer treatment-fee payments awaiting confirmation, most recent first.',
  })
  @ApiOkResponse({ type: TreatmentFeePageDto })
  async listPendingTreatmentFees(
    @Query() query: TreatmentFeeQueueQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TreatmentFeePageDto> {
    return this.treatmentFees.listPendingTreatmentFees({
      page: query.page,
      limit: query.limit,
      caller: { userId: user.sub, role: user.role },
    });
  }

  @Get('admin/treatment-fees')
  // Path is named `admin/...` for historical reasons but the resource is
  // role-scoped at the service layer: admins see every order's treatment
  // fees; dentists see only their own. Both roles need the same shape
  // (it's the canonical "my payments" surface for treatment fees) so
  // we share one endpoint rather than duplicate it.
  @Roles(UserRole.admin, UserRole.super_admin, UserRole.dentist)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Treatment-fee payments (history), filtered and paginated. Admins see every order, or one dentist; dentists see only their own. Newest payment first by default, the fees awaiting confirmation on top.',
  })
  @ApiOkResponse({ type: TreatmentFeePageDto })
  async listTreatmentFees(
    @Query() filters: TreatmentFeeFilterDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TreatmentFeePageDto> {
    return this.treatmentFees.listTreatmentFees(filters, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Put(':id/status')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Manually override an order's lifecycle status (admin-only). " +
      'Used to roll forward past a stuck step OR roll back a transition fired by mistake. ' +
      'Related side-tables (treatment plan, quotation) are NOT modified.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async overrideStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.orderService.overrideStatus(id, dto.status, dto.reason, {
      userId: user.sub,
      role: user.role,
    });
  }

  // ── Bulk admin actions ─────────────────────────────────────────────
  // Both routes are POST (not PATCH or DELETE-with-body) because the
  // payload contains the target ID list — a DELETE with a body has
  // hostile coverage across proxies, and a GET with a long query
  // string hits URL-length limits at the 200-id cap.

  @Post('bulk-status')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Bulk admin-only status update for N orders. ' +
      'Wrapped in a transaction so the whole batch succeeds or rolls back.',
  })
  async bulkUpdateStatus(
    @Body() dto: BulkUpdateOrderStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.bulkUpdateStatus(dto.ids, dto.status, dto.reason, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Post('bulk-delete')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Bulk soft-delete for N orders. Hard-delete now also has a bulk endpoint.',
  })
  async bulkDelete(
    @Body() dto: BulkDeleteOrdersDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.bulkDelete(dto.ids, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Post('bulk-restore')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Bulk restore N soft-deleted orders (clears deletedAt). Idempotent on already-live rows. Admin-only.',
  })
  async bulkRestore(
    @Body() dto: BulkRestoreOrdersDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.bulkRestoreOrders(dto.ids, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Post('bulk-permanent-delete')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Bulk PERMANENT delete for N orders — hard-delete + file-blob cleanup. Capped at 100/call. Admin-only; irreversible.',
  })
  async bulkPermanentDelete(
    @Body() dto: BulkPermanentDeleteOrdersDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.bulkPermanentDeleteOrders(dto.ids, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Put(':id/tooth-instructions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replace tooth-level odontogram instructions' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async updateToothInstructions(
    @Param('id') id: string,
    @Body() dto: UpdateToothInstructionsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.orderService.updateToothInstructions(
      id,
      dto.instructions,
      {
        userId: user.sub,
        role: user.role,
      },
      dto.replaceTypes,
    );
  }

  // ── Chunked / resumable uploads (large CBCT ZIP bundles) ─────────
  // One small request per 8 MiB chunk instead of a single 1 GB POST:
  // per-chunk retry, resume after interruption, and the payload never
  // sits in container RAM (parts stream to disk, assembly streams too).
  // Same guards + service-level access rules as the single-shot path.

  @Post(':id/files/chunked')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open (or resume) a chunked upload session' })
  @ApiParam({ name: 'id', type: String })
  async initChunkedUpload(
    @Param('id') id: string,
    @Body() dto: InitChunkedUploadDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chunkedUploads.initSession(id, dto, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Get(':id/files/chunked/:uploadId')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({ summary: 'Chunked upload session state (for resume)' })
  async getChunkedUpload(
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chunkedUploads.getSession(id, uploadId, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Put(':id/files/chunked/:uploadId/chunks/:index')
  @HttpCode(HttpStatus.OK)
  // A 1 GB upload is ~128 chunk requests in well under a minute on a fast
  // link — the default throttle buckets would reject it mid-flight.
  @SkipThrottle()
  @UseInterceptors(
    FileInterceptor('chunk', {
      // Chunk ceiling with a safety margin over the server-owned 8 MiB.
      limits: { fileSize: 9 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload one chunk (idempotent per index)' })
  async putChunk(
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
    @Param('index') index: string,
    @UploadedFile() chunk: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!chunk) {
      throw new BadRequestException('Missing chunk payload');
    }
    return this.chunkedUploads.putChunk(
      id,
      uploadId,
      Number(index),
      chunk.buffer,
      { userId: user.sub, role: user.role },
    );
  }

  @Post(':id/files/chunked/:uploadId/complete')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Assemble the received chunks, scan the file and register it as an order file',
  })
  async completeChunkedUpload(
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chunkedUploads.complete(id, uploadId, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Delete(':id/files/chunked/:uploadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abort a chunked upload and delete its parts' })
  async abortChunkedUpload(
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chunkedUploads.abort(id, uploadId, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Post(':id/files')
  @HttpCode(HttpStatus.CREATED)
  // Per-file ceiling = 1 GB to match the service's CBCT/DICOM ZIP cap
  // (MAX_FILE_SIZE_ZIP_BUNDLE_BYTES). Multer enforces this BEFORE the
  // file is fully buffered, so an oversized upload aborts cleanly with
  // a 413 instead of OOM'ing the container. The service still does a
  // finer per-category check (50 MB for non-ZIP slots) after multer
  // hands the file over.
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB per file
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload order files' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'category', enum: OrderFileCategory, required: false })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  async uploadFiles(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: OrderFileCategory,
  ) {
    return this.orderFiles.uploadFiles(
      id,
      files,
      category ?? OrderFileCategory.other,
      { userId: user.sub, role: user.role },
    );
  }

  @Get(':id/files')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order files' })
  @ApiParam({ name: 'id', type: String })
  async getFiles(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderFiles.getFiles(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  /**
   * Stream a single .zip of EVERY file on the order (clinical photos,
   * STL/scans, CBCT/ZIP bundles) organised into `<category>/` folders,
   * plus `order-data.json` carrying the full order DTO.
   *
   * Planner-only (admin / super_admin / designer); doctors are excluded.
   * @SkipThrottle for the same reason the per-file download skips it —
   * it's a deliberate RBAC'd action, not anonymous traffic, and the
   * archive can be large enough that the anti-abuse bucket would be a
   * false positive.
   */
  @Get(':id/sheet')
  @Roles(
    UserRole.dentist,
    UserRole.admin,
    UserRole.super_admin,
    UserRole.designer,
  )
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Telecharger la fiche de commande seule (PDF) — donnees de la commande + plan de traitement approuve. Le dentiste proprietaire y a acces; les commandes d'autrui restent en 403.",
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'lang', required: false, enum: ['fr', 'en'] })
  async downloadOrderSheet(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() response: Response,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const { buffer, fileName, mimeType } =
      await this.orderExport.renderOrderSheetPdf(
        id,
        { userId: user.sub, role: user.role },
        lang === 'en' ? 'en' : 'fr',
      );
    response.setHeader('Content-Type', mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/[^\x20-\x7E]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    response.setHeader('Content-Length', buffer.length.toString());
    response.status(HttpStatus.OK).end(buffer);
  }

  @Get(':id/download-all')
  @Roles(UserRole.admin, UserRole.super_admin, UserRole.designer)
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Download ALL of an order’s files + its data as a single ZIP (planner-only)',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['fr', 'en'],
    description:
      "Langue des noms de dossiers et de la fiche dans le ZIP. Suit la langue de l'interface du demandeur; francais par defaut.",
  })
  async downloadAll(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() response: Response,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const { archive, fileName, mimeType } =
      await this.orderExport.downloadAllAsZip(
        id,
        {
          userId: user.sub,
          role: user.role,
        },
        lang === 'en' ? 'en' : 'fr',
      );

    response.setHeader('Content-Type', mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );

    // If the archive errors mid-stream, destroy the socket so the client
    // sees a broken transfer rather than hanging on a truncated body
    // that never reaches the end-of-zip marker. `abort()` tears the
    // archive down too — otherwise it sits half-drained forever (see the
    // 'close' handler below for why that matters).
    archive.on('error', (err) => {
      if (!response.headersSent) {
        response.status(HttpStatus.INTERNAL_SERVER_ERROR);
      }
      archive.abort();
      response.destroy(err);
    });

    // A cancelled download (planner navigates away, proxy drops) only
    // unpipes the archive — Node never destroys the source. Without this
    // the archiver stalls at its high-water mark with an open file
    // descriptor, and the service's pending `finalize()` never settles,
    // stranding that task's buffers for the life of the process. One
    // leak per cancelled CBCT export is enough to matter. `abort()`
    // makes the pending finalize reject promptly, which the service
    // logs and moves on from.
    response.on('close', () => {
      if (!response.writableFinished) {
        archive.abort();
      }
    });

    // NOTE: the archive is NOT finalised yet — the service appends the
    // order sheet and finalises asynchronously once the PDF render
    // completes. The archive only ever drains because of this pipe, so
    // it must not be made conditional or deferred.
    archive.pipe(response);
  }

  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete an order file' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'fileId', type: String })
  async deleteFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.orderFiles.deleteFile(id, fileId, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Get(':id/files/:fileId/download')
  // File downloads are RBAC-gated (assertOrderReadable) — they don't need
  // the global anti-abuse throttle on top. Loading an order detail page
  // can fire ~15 of these in parallel (8 patient photos + 3 radiographs
  // + STL files + treatment-plan attachments), which used to trip the
  // 10-req/10s "short" bucket and produce HTTP 429.
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Download an order file (or an optimized variant)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'fileId', type: String })
  @ApiQuery({
    name: 'variant',
    required: false,
    description:
      'Derived artefact to serve inline: thumb | md | lg | avif | model. ' +
      'Falls back to the original (inline) while processing is pending.',
  })
  async downloadFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: JwtPayload,
    @Res() response: Response,
    @Query('variant') variant?: string,
  ): Promise<void> {
    const dl = await this.orderFiles.getDownloadFile(
      id,
      fileId,
      { userId: user.sub, role: user.role },
      variant,
    );

    // Defence in depth for a direct navigation to this URL: the stored
    // type is the uploader's claim (see openOrderFileStream).
    for (const [name, value] of Object.entries(STORED_FILE_SECURITY_HEADERS)) {
      response.setHeader(name, value);
    }

    if (dl.inline) {
      // Variants are immutable per file id (re-processing overwrites in
      // place, new uploads get new ids) — let the browser keep them for
      // a day instead of re-fetching on every order-detail visit.
      response.setHeader('Content-Type', dl.contentType);
      response.setHeader('Cache-Control', 'private, max-age=86400');
      response.setHeader(
        'Content-Disposition',
        `inline; filename="${dl.downloadName.replace(/"/g, '')}"`,
      );
      // pipeline, not pipe: a client that leaves mid-transfer (or a read
      // error) destroys the file stream instead of leaving its descriptor
      // open. The error itself is the client's leaving: nothing to report.
      pipeline(dl.openStream().getStream(), response, () => undefined);
      return;
    }

    // Sent by path: express opens the file itself and keeps its Range,
    // ETag and Content-Length handling, so no stream is opened here.
    response.setHeader('Content-Type', 'application/octet-stream');
    response.download(dl.absolutePath, dl.downloadName);
  }
}

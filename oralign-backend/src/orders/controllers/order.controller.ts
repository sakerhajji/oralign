import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { diskStorage } from 'multer';
import { join } from 'path';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  OrderFileCategory,
  OrderStatus,
  PaymentMethod,
  UserRole,
} from '@prisma/client';
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
  OrderFilterDto,
  OrderResponseDto,
  UpdateOrderDto,
  UpdateOrderStatusDto,
  UpdateToothInstructionsDto,
} from '../dto/order.dto';
import { OrderService } from '../services/order.service';

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
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an order draft' })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.orderService.createOrder(createOrderDto, {
      userId: user.sub,
      role: user.role,
    });
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

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a draft order' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async submitOrder(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.orderService.submitOrder(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  /**
   * Pay the order's treatment fee. Routes by `body.method`:
   *
   *   • `card`          → instant (mock collector); stamps paidAt
   *   • `cash`          → admin-only; stamps paidAt
   *   • `bank_transfer` → marks status=awaiting_confirmation; the
   *     doctor still owes a proof upload via /treatment-fee/proof,
   *     and the admin must confirm via /treatment-fee/confirm.
   */
  @Post(':id/treatment-fee/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Pay the treatment fee. Card/Cash → instant. Bank transfer → records intent; needs proof + admin confirm.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async payTreatmentFee(
    @Param('id') id: string,
    @Body() body: { method: PaymentMethod; amount?: number },
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.orderService.payTreatmentFee(
      id,
      body.method,
      body.amount ?? 0,
      { userId: user.sub, role: user.role },
    );
  }

  /**
   * Upload the bank-transfer receipt for the treatment fee. Sets the
   * payment lifecycle to `awaiting_confirmation`. Multer handles the
   * file; we store the relative path under uploads/.
   */
  @Post(':id/treatment-fee/proof')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upload a bank-transfer receipt for the treatment fee.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        proof: { type: 'string', format: 'binary' },
        amount: { type: 'number' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap on receipts
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'treatment-fee-proofs'),
        filename: (_req, file, cb) =>
          cb(
            null,
            `${Date.now()}-${file.originalname.replace(/[^\w.-]+/g, '_')}`,
          ),
      }),
    }),
  )
  async uploadTreatmentFeeProof(
    @Param('id') id: string,
    @UploadedFile() proof: Express.Multer.File,
    @Body() body: { amount?: number },
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    if (!proof) {
      throw new BadRequestException(
        'A bank-transfer receipt file is required.',
      );
    }
    // Store relative to uploads/ so the resolver in the frontend
    // matches every other media path.
    const relativePath = `/uploads/treatment-fee-proofs/${proof.filename}`;
    return this.orderService.uploadTreatmentFeeProof(
      id,
      relativePath,
      body.amount ?? 0,
      { userId: user.sub, role: user.role },
    );
  }

  /**
   * Admin confirms a bank-transfer payment. Flips the payment status
   * to `success` and stamps `treatmentFeePaidAt`, which unlocks
   * treatment-plan creation. Cash + card don't need this endpoint —
   * they stamp `treatmentFeePaidAt` directly.
   */
  @Post(':id/treatment-fee/confirm')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Admin confirms a pending bank-transfer treatment-fee payment.',
  })
  @ApiParam({ name: 'id', type: String })
  async confirmTreatmentFeePayment(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.orderService.confirmTreatmentFeePayment(id, {
      userId: user.sub,
      role: user.role,
    });
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
      'Admin: bank-transfer treatment-fee payments awaiting confirmation.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listPendingTreatmentFees(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.orderService.listPendingTreatmentFees({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      caller: { userId: user!.sub, role: user!.role },
    });
  }

  @Get('admin/treatment-fees')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Admin: every treatment-fee payment (history). Sorted by paid date desc.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listTreatmentFees(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.orderService.listTreatmentFees({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      caller: { userId: user!.sub, role: user!.role },
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
    return this.orderService.bulkUpdateStatus(
      dto.ids,
      dto.status,
      dto.reason,
      { userId: user.sub, role: user.role },
    );
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
    return this.orderService.uploadFiles(
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
    return this.orderService.getFiles(id, {
      userId: user.sub,
      role: user.role,
    });
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
    return this.orderService.deleteFile(id, fileId, {
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
  @Header('Content-Type', 'application/octet-stream')
  @ApiOperation({ summary: 'Download an order file' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'fileId', type: String })
  async downloadFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: JwtPayload,
    @Res() response: Response,
  ): Promise<void> {
    const { absolutePath, file } = await this.orderService.getDownloadFile(
      id,
      fileId,
      { userId: user.sub, role: user.role },
    );
    response.download(absolutePath, file.originalName);
  }
}

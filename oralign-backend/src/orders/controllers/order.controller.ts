import {
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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('doctorId') doctorId?: string,
    @Query('patientId') patientId?: string,
    @Query('status') status?: OrderStatus,
    @Query('orderCode') orderCode?: string,
  ) {
    const filters: OrderFilterDto = {};
    if (search) filters.search = search;
    if (doctorId) filters.doctorId = doctorId;
    if (patientId) filters.patientId = patientId;
    if (status) filters.status = status;
    if (orderCode) filters.orderCode = orderCode;

    return this.orderService.getOrders(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
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
  @UseInterceptors(FilesInterceptor('files', 20))
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

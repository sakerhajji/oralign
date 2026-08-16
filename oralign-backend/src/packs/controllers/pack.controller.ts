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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreatePackDto,
  CreatePackPriceDto,
  PackFilterDto,
  UpdatePackDto,
  UpdatePackPriceDto,
} from '../dto/pack.dto';
import { PackService } from '../services/pack.service';

/**
 * Admin-only pack catalogue management.
 *
 * Authentication: `JwtAuthGuard` + `RolesGuard` are global on the
 * controller; every method requires admin or super_admin. Doctors
 * read packs implicitly through the Quotation attach-pack endpoint
 * (which calls `PackService.getActivePriceForQuote` on their behalf).
 */
@ApiTags('packs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.super_admin)
@Controller('admin/packs')
export class PackController {
  constructor(private readonly packService: PackService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List packs with prices (admin)' })
  async list(@Query() filters: PackFilterDto) {
    return this.packService.list(filters);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a pack' })
  async create(@Body() dto: CreatePackDto) {
    return this.packService.create(dto);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  async get(@Param('id') id: string) {
    return this.packService.get(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  async update(@Param('id') id: string, @Body() dto: UpdatePackDto) {
    return this.packService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete a pack (sets deletedAt + isActive=false).',
  })
  @ApiParam({ name: 'id', type: String })
  async softDelete(@Param('id') id: string) {
    return this.packService.softDelete(id);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Permanently delete an ARCHIVED pack (hard delete). Admin-only. ' +
      'Cascades its prices and nulls the reference on historical quotations ' +
      '(which keep their pack snapshot).',
  })
  @ApiParam({ name: 'id', type: String })
  async permanentDelete(@Param('id') id: string) {
    return this.packService.permanentDelete(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore an archived pack (stays inactive until activated).' })
  @ApiParam({ name: 'id', type: String })
  async restore(@Param('id') id: string) {
    return this.packService.restore(id);
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  async activate(@Param('id') id: string) {
    return this.packService.setActive(id, true);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  async deactivate(@Param('id') id: string) {
    return this.packService.setActive(id, false);
  }

  @Post(':id/prices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Add a new active price for an (archType). Any pre-existing active ' +
      'price for that arch is archived inside the same transaction.',
  })
  @ApiParam({ name: 'id', type: String })
  async addPrice(
    @Param('id') id: string,
    @Body() dto: CreatePackPriceDto,
  ) {
    return this.packService.addPrice(id, dto);
  }

  @Patch(':id/prices/:priceId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'priceId', type: String })
  async updatePrice(
    @Param('id') id: string,
    @Param('priceId') priceId: string,
    @Body() dto: UpdatePackPriceDto,
  ) {
    return this.packService.updatePrice(id, priceId, dto);
  }

  @Delete(':id/prices/:priceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Archive a price (sets isActive=false). Snapshots on existing quotes " +
      'remain intact.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'priceId', type: String })
  async archivePrice(
    @Param('id') id: string,
    @Param('priceId') priceId: string,
  ) {
    return this.packService.archivePrice(id, priceId);
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WorkingHoursService } from '../services/working-hours.service';
import {
  CreateWorkingHoursDto,
  UpdateWorkingHoursDto,
  WorkingHoursResponseDto,
} from '../dto/working-hours.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

/**
 * A clinic's weekly schedule. Its callers are the dentist's own account
 * (schedule form, account data) and the admin user sheet, so every route
 * is open to those roles only: the lab roles (designer, technician) have
 * no use for another clinic's hours. Writes keep the service's ownership
 * check on top.
 */
@ApiTags('working-hours')
@Controller('working-hours')
export class WorkingHoursController {
  constructor(private readonly workingHoursService: WorkingHoursService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.dentist, UserRole.admin, 'super_admin' as UserRole)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create working hours for a dentist profile' })
  @ApiResponse({
    status: 201,
    description: 'Working hours created successfully',
    type: WorkingHoursResponseDto,
  })
  async createWorkingHours(
    @Body('dentistProfileId') dentistProfileId: string,
    @Body() createWorkingHoursDto: CreateWorkingHoursDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WorkingHoursResponseDto> {
    return this.workingHoursService.createWorkingHours(
      dentistProfileId,
      createWorkingHoursDto,
      { userId: user.sub, role: user.role },
    );
  }

  @Get(':id')
  // Deferred audit item L-8, now closed: the public directory embeds hours in
  // /dentist-profile/public/:id, so this route has no anonymous consumer.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.dentist, UserRole.admin, 'super_admin' as UserRole)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get working hours by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Working hours ID' })
  @ApiResponse({
    status: 200,
    description: 'Working hours fetched successfully',
    type: WorkingHoursResponseDto,
  })
  async getWorkingHoursById(
    @Param('id') id: string,
  ): Promise<WorkingHoursResponseDto> {
    return this.workingHoursService.getWorkingHoursById(id);
  }

  @Get('dentist-profile/:dentistProfileId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.dentist, UserRole.admin, 'super_admin' as UserRole)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all working hours for a dentist profile' })
  @ApiParam({
    name: 'dentistProfileId',
    type: String,
    description: 'Dentist profile ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Working hours fetched successfully',
    isArray: true,
    type: WorkingHoursResponseDto,
  })
  async getWorkingHoursByDentistProfile(
    @Param('dentistProfileId') dentistProfileId: string,
  ): Promise<WorkingHoursResponseDto[]> {
    return this.workingHoursService.getWorkingHoursByDentistProfile(
      dentistProfileId,
    );
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.dentist, UserRole.admin, 'super_admin' as UserRole)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update working hours by ID (owner or admin)' })
  @ApiParam({ name: 'id', type: String, description: 'Working hours ID' })
  @ApiResponse({
    status: 200,
    description: 'Working hours updated successfully',
    type: WorkingHoursResponseDto,
  })
  async updateWorkingHours(
    @Param('id') id: string,
    @Body() updateWorkingHoursDto: UpdateWorkingHoursDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WorkingHoursResponseDto> {
    return this.workingHoursService.updateWorkingHours(
      id,
      updateWorkingHoursDto,
      { userId: user.sub, role: user.role },
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.dentist, UserRole.admin, 'super_admin' as UserRole)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete working hours by ID (owner or admin)' })
  @ApiParam({ name: 'id', type: String, description: 'Working hours ID' })
  @ApiResponse({
    status: 200,
    description: 'Working hours deleted successfully',
  })
  async deleteWorkingHours(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.workingHoursService.deleteWorkingHours(id, {
      userId: user.sub,
      role: user.role,
    });
  }
}

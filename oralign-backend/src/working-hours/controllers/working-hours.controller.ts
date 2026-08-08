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
import { Public } from '../../common/decorators/public.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('working-hours')
@Controller('working-hours')
export class WorkingHoursController {
  constructor(private readonly workingHoursService: WorkingHoursService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
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
  @Public()
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
  @Public()
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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

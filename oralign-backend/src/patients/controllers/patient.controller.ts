import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
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
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  BulkDeletePatientsDto,
  CreatePatientDto,
  PatientFilterDto,
  PatientResponseDto,
  UpdatePatientDto,
} from '../dto/patient.dto';
import { PatientService } from '../services/patient.service';

@ApiTags('patients')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
@Controller('patients')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a patient' })
  @ApiResponse({
    status: 201,
    description: 'Patient created successfully',
    type: PatientResponseDto,
  })
  async createPatient(
    @Body() createPatientDto: CreatePatientDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PatientResponseDto> {
    return this.patientService.createPatient(createPatientDto, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get patients with pagination and search' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by patient name, email, or phone',
  })
  @ApiQuery({
    name: 'doctorId',
    required: false,
    type: String,
    description: 'Admin-only filter by dentist ID',
  })
  @ApiResponse({ status: 200, description: 'Patients fetched successfully' })
  async getPatients(
    @CurrentUser() user: JwtPayload,
    // Bind the FULL DTO so every documented filter (gender, sort,
    // date range, doctor, search) reaches the service. The previous
    // hand-rolled `@Query('search') ... @Query('doctorId') ...`
    // signature silently dropped every other field, which is why
    // gender / from / to / sortBy never had any effect.
    @Query() filters: PatientFilterDto,
  ) {
    return this.patientService.getPatients(
      filters.page ?? 1,
      filters.limit ?? 10,
      filters,
      {
        userId: user.sub,
        role: user.role,
      },
    );
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get patient by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Patient fetched successfully',
    type: PatientResponseDto,
  })
  async getPatientById(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PatientResponseDto> {
    return this.patientService.getPatientById(id, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update patient by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Patient updated successfully',
    type: PatientResponseDto,
  })
  async updatePatient(
    @Param('id') id: string,
    @Body() updatePatientDto: UpdatePatientDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PatientResponseDto> {
    return this.patientService.updatePatient(id, updatePatientDto, {
      userId: user.sub,
      role: user.role,
    });
  }

  // IMPORTANT: @Delete('bulk') MUST come before @Delete(':id') so NestJS
  // doesn't treat the literal string "bulk" as a UUID parameter.
  @Delete('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk soft-delete patients by IDs' })
  @ApiResponse({ status: 200, description: 'Patients deleted successfully' })
  async bulkDeletePatients(
    @Body() dto: BulkDeletePatientsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string; deleted: number }> {
    return this.patientService.bulkDeletePatients(dto.ids, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete patient by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Patient ID' })
  @ApiResponse({ status: 200, description: 'Patient deleted successfully' })
  async deletePatient(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.patientService.deletePatient(id, {
      userId: user.sub,
      role: user.role,
    });
  }
}

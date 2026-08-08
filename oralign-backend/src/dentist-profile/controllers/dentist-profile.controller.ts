import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { DentistProfileService } from '../services/dentist-profile.service';
import {
  CreateDentistProfileDto,
  UpdateDentistProfileDto,
  DentistProfileResponseDto,
  SetupClinicDto,
  PublicFinderQueryDto,
  PublicDentistProfileDto,
  PublicFinderResponseDto,
} from '../dto/dentist-profile.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('dentist-profile')
@Controller('dentist-profile')
export class DentistProfileController {
  constructor(private readonly profileService: DentistProfileService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.dentist, UserRole.admin, 'super_admin' as UserRole)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create dentist profile (dentist/admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Dentist profile created successfully',
    type: DentistProfileResponseDto,
  })
  async createProfile(
    @Body() createProfileDto: CreateDentistProfileDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DentistProfileResponseDto> {
    return this.profileService.createProfile(user.sub, createProfileDto);
  }

  @Post('setup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.dentist, UserRole.admin, 'super_admin' as UserRole)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Onboarding: create/update the dentist profile AND replace working ' +
      'hours atomically. Use this from the onboarding wizard instead of the ' +
      'separate /dentist-profile and /working-hours endpoints.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile + weekly schedule saved successfully',
    type: DentistProfileResponseDto,
  })
  async setupClinic(
    @Body() dto: SetupClinicDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DentistProfileResponseDto> {
    return this.profileService.setupClinic(user.sub, dto);
  }

  @Post('admin/user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, 'super_admin' as UserRole)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Admin: create dentist profile for a specific user',
  })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({
    status: 201,
    description: 'Dentist profile created successfully',
    type: DentistProfileResponseDto,
  })
  async createProfileForUser(
    @Param('userId') userId: string,
    @Body() createProfileDto: CreateDentistProfileDto,
    @CurrentUser() _caller: JwtPayload,
  ): Promise<DentistProfileResponseDto> {
    return this.profileService.createProfile(userId, createProfileDto);
  }

  // Full private directory dump (every clinic's taxId / clinicEmail).
  // SECURITY (audit M-2): admin-only — a dentist/designer must not be
  // able to enumerate every clinic's private business data. The public
  // directory is served by the separate @Public() `public` routes.
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, 'super_admin' as UserRole)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all dentist profiles with pagination (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Dentist profiles fetched successfully',
  })
  async getAllProfiles(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.profileService.getAllProfiles(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('search/by-city')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search dentist profiles by city' })
  @ApiQuery({ name: 'city', type: String, description: 'City name' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async searchByCity(
    @Query('city') city: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.profileService.searchByCity(
      city,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('search/nearby')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find dentist profiles nearby (geo search)' })
  @ApiQuery({ name: 'latitude', type: Number, description: 'Latitude' })
  @ApiQuery({ name: 'longitude', type: Number, description: 'Longitude' })
  @ApiQuery({
    name: 'radiusKm',
    required: false,
    type: Number,
    example: 5,
    description: 'Search radius in kilometers',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async findNearby(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.profileService.findNearby(
      parseFloat(latitude),
      parseFloat(longitude),
      radiusKm ? parseInt(radiusKm, 10) : 5,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  // NOTE: the literal `public` routes MUST be declared before the `:id`
  // param route below — otherwise Nest would match `/public` as `:id = public`.

  @Get('public')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Public practitioner directory ("Trouver un praticien"). Only clinics ' +
      'that opted in AND whose owner is an approved, active account are ' +
      'returned. Supply lat & lng to rank results by distance.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 24 })
  @ApiQuery({ name: 'city', required: false, type: String })
  @ApiQuery({ name: 'specialty', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'lat', required: false, type: Number })
  @ApiQuery({ name: 'lng', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Public practitioners fetched successfully',
    type: PublicFinderResponseDto,
  })
  async getPublicList(
    @Query() query: PublicFinderQueryDto,
  ): Promise<PublicFinderResponseDto> {
    return this.profileService.getPublicList(query);
  }

  @Get('public/:id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Public single practitioner profile + weekly schedule. 404 when the ' +
      'profile is not publicly listed / not approved.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Public practitioner fetched successfully',
    type: PublicDentistProfileDto,
  })
  async getPublicById(
    @Param('id') id: string,
  ): Promise<PublicDentistProfileDto> {
    return this.profileService.getPublicById(id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get dentist profile by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Dentist profile fetched successfully',
    type: DentistProfileResponseDto,
  })
  async getProfileById(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<DentistProfileResponseDto> {
    // Pass the caller so the service can redact private taxId/clinicEmail
    // for anyone who is not the owner or an admin (audit M-2).
    return this.profileService.getProfileById(id, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update dentist profile by ID (owner or admin)' })
  @ApiParam({ name: 'id', type: String, description: 'Profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Dentist profile updated successfully',
    type: DentistProfileResponseDto,
  })
  async updateProfile(
    @Param('id') id: string,
    @Body() updateProfileDto: UpdateDentistProfileDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DentistProfileResponseDto> {
    return this.profileService.updateProfile(id, updateProfileDto, {
      userId: user.sub,
      role: user.role,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete dentist profile by ID (owner or admin)' })
  @ApiParam({ name: 'id', type: String, description: 'Profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Dentist profile deleted successfully',
  })
  async deleteProfile(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.profileService.deleteProfile(id, {
      userId: user.sub,
      role: user.role,
    });
  }
}

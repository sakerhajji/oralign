import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsEnum,
  IsBoolean,
  Matches,
  ArrayMaxSize,
} from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class CreateDentistProfileDto {
  @ApiProperty({
    example: 'Bright Smiles Dental Clinic',
    description: 'Name of the dental clinic',
  })
  @IsString()
  clinicName!: string;

  @ApiProperty({
    example: '123 Dental St, Smileville',
    description: 'Full address of the clinic',
    required: false,
  })
  @IsOptional()
  @IsString()
  clinicAddress?: string;

  @ApiProperty({
    example: 'Smileville',
    description: 'City where the clinic is located',
    required: false,
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    example: 'USA',
    description: 'Country where the clinic is located',
    required: false,
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({
    example: 34.0522,
    description: 'Latitude for clinic location',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiProperty({
    example: -118.2437,
    description: 'Longitude for clinic location',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiProperty({
    example: '+1-555-123-4567',
    description: 'Clinic contact phone number',
    required: false,
  })
  @IsOptional()
  @IsString()
  clinicPhone?: string;

  @ApiProperty({
    example: 'contact@brightsmiles.com',
    description: 'Clinic contact email address',
    required: false,
  })
  @IsOptional()
  @IsString()
  clinicEmail?: string;

  @ApiProperty({
    description: 'A brief description of the clinic and its services',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'https://example.com/logo.png',
    description: 'URL of the clinic logo',
    required: false,
  })
  @IsOptional()
  @IsString()
  logoUrl?: string;
}

export class UpdateDentistProfileDto extends CreateDentistProfileDto {}

const HHMM = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

export class WeeklyHoursEntryDto {
  @ApiProperty({ enum: DayOfWeek, example: 'monday' })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: '09:00', description: 'HH:mm 24-hour format' })
  @IsString()
  @Matches(HHMM, { message: 'openTime must be HH:mm (24h)' })
  openTime!: string;

  @ApiProperty({ example: '17:00', description: 'HH:mm 24-hour format' })
  @IsString()
  @Matches(HHMM, { message: 'closeTime must be HH:mm (24h)' })
  closeTime!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isClosed!: boolean;
}

/**
 * Combined create-or-update payload for the onboarding flow. Saves the
 * clinic profile AND the seven-day weekly schedule in a single atomic
 * request — eliminates the two-step UI dance where the frontend has to
 * wait for the profile to exist before it can save working hours.
 */
export class SetupClinicDto extends CreateDentistProfileDto {
  @ApiProperty({
    type: [WeeklyHoursEntryDto],
    description:
      'Full weekly schedule (replaces any existing rows). Each entry must ' +
      'cover one weekday — typically 7 entries, max 7.',
  })
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeeklyHoursEntryDto)
  workingHours!: WeeklyHoursEntryDto[];
}

export class DentistProfileResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  userId!: string;
  @ApiProperty()
  clinicName!: string;
  @ApiProperty({ required: false })
  clinicAddress?: string;
  @ApiProperty({ required: false })
  city?: string;
  @ApiProperty({ required: false })
  country?: string;
  @ApiProperty({ required: false })
  latitude?: number;
  @ApiProperty({ required: false })
  longitude?: number;
  @ApiProperty({ required: false })
  clinicPhone?: string;
  @ApiProperty({ required: false })
  clinicEmail?: string;
  @ApiProperty({ required: false })
  description?: string;
  @ApiProperty({ required: false })
  logoUrl?: string;
  @ApiProperty({ required: false })
  userFullName?: string;
  @ApiProperty({ required: false })
  userAvatarUrl?: string;
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
}

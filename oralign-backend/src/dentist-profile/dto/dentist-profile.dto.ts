import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

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

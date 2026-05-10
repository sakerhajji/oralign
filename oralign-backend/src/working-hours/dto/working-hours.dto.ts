import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { DayOfWeek } from '@prisma/client';
// ...existing code...
export class CreateWorkingHoursDto {
  @ApiProperty({
    description: 'Dentist profile ID to associate these working hours with',
    example: 'clxyz...',
  })
  @IsString()
  @IsNotEmpty()
  dentistProfileId!: string;

  @ApiProperty({
    enum: DayOfWeek,
    example: 'monday',
    description: 'Day of the week',
  })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({
    example: '09:00',
    description: 'Opening time in HH:mm format',
  })
  @IsString()
  openTime!: string; // Format: "HH:mm"

  @ApiProperty({
    example: '17:00',
    description: 'Closing time in HH:mm format',
  })
  @IsString()
  closeTime!: string; // Format: "HH:mm"

  @ApiProperty({
    example: false,
    description: 'Set to true if the clinic is closed on this day',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

export class UpdateWorkingHoursDto {
  @ApiProperty({
    example: '08:30',
    description: 'Updated opening time',
    required: false,
  })
  @IsOptional()
  @IsString()
  openTime?: string;

  @ApiProperty({
    example: '18:00',
    description: 'Updated closing time',
    required: false,
  })
  @IsOptional()
  @IsString()
  closeTime?: string;

  @ApiProperty({
    example: true,
    description: 'Updated closed status',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

export class WorkingHoursResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  dentistProfileId!: string;
  @ApiProperty({ enum: DayOfWeek })
  dayOfWeek!: string;
  @ApiProperty()
  openTime!: string;
  @ApiProperty()
  closeTime!: string;
  @ApiProperty()
  isClosed!: boolean;
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
}

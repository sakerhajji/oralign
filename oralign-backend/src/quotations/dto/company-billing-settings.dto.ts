import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Translation map for legal / footer text.
 *
 * Each key is a language code accepted by `DevisLanguage` (fr|en|ar).
 * Stored verbatim in the database as JSONB.
 */
export class TranslatedTextsDto {
  @ApiPropertyOptional({ description: 'French text' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fr?: string;

  @ApiPropertyOptional({ description: 'English text' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  en?: string;

  @ApiPropertyOptional({ description: 'Arabic text' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ar?: string;
}

export class BankDetailsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  accountName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) rib?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) iban?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  swift?: string;
}

/**
 * UPSERT payload for the singleton CompanyBillingSettings row.
 *
 * Every field is optional so the form can save partial progress. The
 * service falls back to sensible defaults if `companyName` is missing
 * on the very first save (it's required for PDFs and is enforced by
 * a separate guard in the service).
 */
export class UpsertCompanyBillingSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyAddress?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyCity?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyCountry?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  companyPhone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  companyEmail?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxRegistrationNumber?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 19 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  defaultTvaRate?: number;

  @ApiPropertyOptional({
    default: 'TND',
    description: 'ISO 4217 currency code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  defaultCurrency?: string;

  @ApiPropertyOptional({
    default: 'DEV',
    description: 'Prefix used for quotationNumber e.g. DEV',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  devisPrefix?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Next quotationNumber suffix (1-based)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  devisNextNumber?: number;

  @ApiPropertyOptional({ type: TranslatedTextsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TranslatedTextsDto)
  legalTextTranslations?: TranslatedTextsDto;

  @ApiPropertyOptional({ type: TranslatedTextsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TranslatedTextsDto)
  footerTextTranslations?: TranslatedTextsDto;

  @ApiPropertyOptional({ type: BankDetailsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bankDetails?: BankDetailsDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Public response — what the admin UI receives.
 *
 * `companyLogoPath` is a RELATIVE path under `/uploads/...` (never an
 * absolute URL); the frontend prefixes it with its known origin.
 */
export class CompanyBillingSettingsResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyName!: string;
  @ApiPropertyOptional() companyLogoPath?: string | null;
  @ApiPropertyOptional() companyAddress?: string | null;
  @ApiPropertyOptional() companyCity?: string | null;
  @ApiPropertyOptional() companyCountry?: string | null;
  @ApiPropertyOptional() companyPhone?: string | null;
  @ApiPropertyOptional() companyEmail?: string | null;
  @ApiPropertyOptional() taxRegistrationNumber?: string | null;

  @ApiProperty() defaultTvaRate!: number;
  @ApiProperty() defaultCurrency!: string;
  @ApiProperty() devisPrefix!: string;
  @ApiProperty() devisNextNumber!: number;

  @ApiPropertyOptional({ type: Object }) legalTextTranslations?: Record<
    string,
    string
  > | null;
  @ApiPropertyOptional({ type: Object }) footerTextTranslations?: Record<
    string,
    string
  > | null;
  @ApiPropertyOptional({ type: Object }) bankDetails?: Record<
    string,
    string
  > | null;

  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

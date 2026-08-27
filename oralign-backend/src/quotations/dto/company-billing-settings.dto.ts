import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
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

  // ── Legal identity (mentions légales) ─────────────────────────────────
  @ApiPropertyOptional({ description: 'Nom commercial / trade name' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tradeName?: string;

  @ApiPropertyOptional({ description: 'Forme juridique (SUARL, SARL, …)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalForm?: string;

  @ApiPropertyOptional({ description: 'Registre de commerce (RC)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  registreDeCommerce?: string;

  @ApiPropertyOptional({ description: 'Hosting provider name (hébergeur)' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  hostingProvider?: string;

  @ApiPropertyOptional({ description: 'Hosting provider website URL' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  hostingProviderUrl?: string;

  @ApiPropertyOptional({ description: 'Public website domain, e.g. oralign.com.tn' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  websiteDomain?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 19 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  defaultTvaRate?: number;

  // Default professional/treatment fee in the org's currency.
  // QuotationService prefills `Quotation.treatmentFees` from this on
  // new quote creation. Decimal in the DB; carried as Number across
  // the API so the admin form can use a plain number input.
  @ApiPropertyOptional({
    minimum: 0,
    default: 0,
    description:
      'Default professional / treatment fee auto-applied to every new quotation.',
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  defaultTreatmentFee?: number;

  // "Droit de timbre" — the Tunisian fiscal stamp duty (typically
  // 1.000 TND) added to the invoice total. Decimal in the DB; carried
  // as Number across the API so the admin form can use a plain number
  // input (mirrors defaultTreatmentFee).
  @ApiPropertyOptional({
    minimum: 0,
    default: 1,
    description:
      'Fiscal stamp duty (Droit de timbre) added to every invoice total.',
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  stampDuty?: number;

  // CBCT paid supplement — when enabled with a fee > 0, requesting
  // CBCT on a new order adds this supplement to the professional fee.
  // The amount is snapshotted onto the order at request time, so
  // editing it here only affects NEW orders (mirrors defaultTreatmentFee).
  @ApiPropertyOptional({
    default: false,
    description:
      'Whether the paid CBCT supplement is offered when doctors request CBCT on a new order.',
  })
  @IsOptional()
  @IsBoolean()
  cbctSupplementEnabled?: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    default: 0,
    description:
      'CBCT supplement fee added to the professional fee when the doctor requests CBCT.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cbctSupplementFee?: number;

  // ── Beyond-the-pack price list (grille 2026) ────────────────────
  // Informational tariffs shown to doctors; 0 hides the line. Same
  // Number-in / Decimal-in-DB treatment as the CBCT supplement.
  @ApiPropertyOptional({ minimum: 0, maximum: 999999999.999, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999999999.999)
  refinementTwoArchesFee?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 999999999.999, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999999999.999)
  refinementSingleArchFee?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 999999999.999, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999999999.999)
  replacementAlignerFee?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 999999999.999, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999999999.999)
  retainersFee?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Master switch of the quarterly loyalty program.',
  })
  @IsOptional()
  // enableImplicitConversion coerces ANY string through Boolean() before
  // @IsBoolean runs, so "false" would silently become true. Read the raw
  // value; garbage falls through to @IsBoolean → 400.
  @Transform(({ obj }) => {
    const v = (obj as Record<string, unknown>).loyaltyEnabled;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  })
  @IsBoolean()
  loyaltyEnabled?: boolean;

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

  @ApiPropertyOptional() tradeName?: string | null;
  @ApiPropertyOptional() legalForm?: string | null;
  @ApiPropertyOptional() registreDeCommerce?: string | null;
  @ApiPropertyOptional() hostingProvider?: string | null;
  @ApiPropertyOptional() hostingProviderUrl?: string | null;
  @ApiPropertyOptional() websiteDomain?: string | null;

  @ApiProperty() defaultTvaRate!: number;
  @ApiProperty() defaultTreatmentFee!: number;
  @ApiProperty() stampDuty!: number;
  @ApiProperty() cbctSupplementEnabled!: boolean;
  @ApiProperty() cbctSupplementFee!: number;
  @ApiProperty() refinementTwoArchesFee!: number;
  @ApiProperty() refinementSingleArchFee!: number;
  @ApiProperty() replacementAlignerFee!: number;
  @ApiProperty() retainersFee!: number;
  @ApiProperty() loyaltyEnabled!: boolean;
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

/**
 * PUBLIC legal identity projection — served WITHOUT auth so the public
 * showcase compliance pages (mentions légales, qui sommes-nous,
 * conditions de vente, réclamations) can render the merchant's real
 * legal data instead of hardcoding it.
 *
 * Intentionally EXCLUDES bank details, invoice counters, TVA rate,
 * treatment fee, logo path — nothing here is sensitive: it is the same
 * information a Tunisian merchant is legally required to publish on its
 * website footer. `currency` is included so public price displays can
 * confirm they match the merchant-account currency.
 */
export class LegalInfoDto {
  @ApiPropertyOptional() companyName?: string | null;
  @ApiPropertyOptional() tradeName?: string | null;
  @ApiPropertyOptional() legalForm?: string | null;
  @ApiPropertyOptional() taxRegistrationNumber?: string | null;
  @ApiPropertyOptional() registreDeCommerce?: string | null;
  @ApiPropertyOptional() address?: string | null;
  @ApiPropertyOptional() city?: string | null;
  @ApiPropertyOptional() country?: string | null;
  @ApiPropertyOptional() phone?: string | null;
  @ApiPropertyOptional() email?: string | null;
  @ApiPropertyOptional() hostingProvider?: string | null;
  @ApiPropertyOptional() hostingProviderUrl?: string | null;
  @ApiPropertyOptional() websiteDomain?: string | null;
  @ApiPropertyOptional() currency?: string | null;
}

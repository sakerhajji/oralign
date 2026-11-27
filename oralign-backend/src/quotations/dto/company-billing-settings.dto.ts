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
import { rawBoolean } from '../../common/dto/query-transforms';

/** Bounds of the doctor inactivity period, in calendar months (spec §5). */
export const INACTIVITY_MONTHS_MIN = 1;
export const INACTIVITY_MONTHS_MAX = 24;
/** Upper bound of a Decimal(12,3) amount. */
const MAX_DECIMAL_12_3 = 999999999.999;

/**
 * Optional text fields of the settings form: "" (or blanks) means "clear
 * this field" and becomes null, which skips the validators (@IsOptional)
 * so a cleared e-mail never trips @IsEmail. Absent (undefined) still means
 * "unchanged" — the service keeps the stored value.
 */
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

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
  // Optional text fields below: "" / null = clear, absent = unchanged.
  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyAddress?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyCity?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyCountry?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  companyPhone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(blankToNull)
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  companyEmail?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxRegistrationNumber?: string | null;

  // ── Legal identity (mentions légales) ─────────────────────────────────
  @ApiPropertyOptional({
    description: 'Nom commercial / trade name',
    type: String,
    nullable: true,
  })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tradeName?: string | null;

  @ApiPropertyOptional({
    description: 'Forme juridique (SUARL, SARL, …)',
    type: String,
    nullable: true,
  })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalForm?: string | null;

  @ApiPropertyOptional({
    description: 'Registre de commerce (RC)',
    type: String,
    nullable: true,
  })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  registreDeCommerce?: string | null;

  @ApiPropertyOptional({
    description: 'Hosting provider name (hébergeur)',
    type: String,
    nullable: true,
  })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  hostingProvider?: string | null;

  @ApiPropertyOptional({
    description: 'Hosting provider website URL',
    type: String,
    nullable: true,
  })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  hostingProviderUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Public website domain, e.g. oralign.com.tn',
    type: String,
    nullable: true,
  })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  websiteDomain?: string | null;

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
  // 1.000 TND). Prices are TTC (TVA included); the stamp is ADDED on top
  // of every payment, since every payment gets its own facture (owner
  // decision 2026-11-20): an installment of 1 000 is paid 1 001, a plan of
  // 3 installments costs 3 stamps. Snapshotted onto each payment.
  // Decimal in the DB; carried as Number across the API so the admin
  // form can use a plain number input (mirrors defaultTreatmentFee).
  @ApiPropertyOptional({
    minimum: 0,
    default: 1,
    description:
      'Fiscal stamp duty (Droit de timbre), ADDED on top of every payment (one facture per payment): an installment of 1000 is paid 1001. Not part of the TTC price; snapshotted onto each payment.',
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  stampDuty?: number;

  // Retenue à la source: % of the amount due (TTC, stamp EXCLUDED) a
  // practitioner may keep back when paying. 0 turns the option off.
  // Installment 1000 at 1 %: retenue 10, paid 1000 + 1 - 10 = 991.
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 99.99,
    default: 1,
    description:
      'Retenue a la source (%) the practitioner may apply when paying, computed on the TTC due WITHOUT the stamp duty (1000 at 1 % = 10; paid 1000 + 1 stamp - 10 = 991). 0 = off.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99.99)
  withholdingRate?: number;

  // Master switch of the retenue (spec §4). Off until the accountant
  // validates the rule: off, the option is never offered and a payment
  // asking for it is a 400 WITHHOLDING_DISABLED. Audited.
  @ApiPropertyOptional({
    default: false,
    description:
      'Master switch of the retenue à la source. Off: never offered, 400 WITHHOLDING_DISABLED when asked for. Switching it on needs a rate above 0. Every change is written to the settings history.',
  })
  @IsOptional()
  // Read raw: implicit conversion would turn the string "false" into true.
  @Transform(rawBoolean)
  @IsBoolean()
  withholdingEnabled?: boolean;

  // Payment base (TTC, stamp excluded) from which the retenue may apply,
  // « initialement 1 000 DT ». Decimal(12,3) in the DB. Audited.
  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_DECIMAL_12_3,
    default: 1000,
    description:
      'Retenue threshold: a payment whose base (installment amount or treatment fee due, TTC, stamp excluded) is below it cannot carry the retenue (400 WITHHOLDING_BELOW_THRESHOLD); at or above it the practitioner may apply it. 0 = every payment. Up to 3 decimals.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_DECIMAL_12_3)
  withholdingThreshold?: number;

  // ── Doctor inactivity rule (spec §5) ────────────────────────────
  @ApiPropertyOptional({
    default: false,
    description:
      'Rollout switch of the daily inactivity sweep (warnings at 30 and 7 days, then deactivation of new orders). Audited.',
  })
  @IsOptional()
  @Transform(rawBoolean)
  @IsBoolean()
  inactivityRuleEnabled?: boolean;

  @ApiPropertyOptional({
    minimum: INACTIVITY_MONTHS_MIN,
    maximum: INACTIVITY_MONTHS_MAX,
    default: 6,
    description:
      'Calendar months without a submitted order before a practitioner is deactivated. Audited.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(INACTIVITY_MONTHS_MIN)
  @Max(INACTIVITY_MONTHS_MAX)
  inactivityMonths?: number;

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
    default: true,
    description:
      'Master switch of the welcome gift (treatment fee + CBCT supplement waived once per practitioner, on the next case they submit).',
  })
  @IsOptional()
  // Same raw-value read as loyaltyEnabled: implicit conversion would turn
  // the string "false" into true.
  @Transform(({ obj }) => {
    const v = (obj as Record<string, unknown>).welcomeGiftEnabled;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  })
  @IsBoolean()
  welcomeGiftEnabled?: boolean;

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
  @ApiProperty({
    description:
      'Droit de timbre added on top of every payment (one facture per payment).',
  })
  stampDuty!: number;
  @ApiProperty({
    description: 'Retenue a la source (%), on the TTC due without the stamp.',
  })
  withholdingRate!: number;
  @ApiProperty({ description: 'Master switch of the retenue (spec §4).' })
  withholdingEnabled!: boolean;
  @ApiProperty({
    description:
      'Retenue threshold (TTC, stamp excluded), 3 decimals: payments below it cannot carry the retenue.',
  })
  withholdingThreshold!: number;
  @ApiProperty({ description: 'Doctor inactivity rule switch (spec §5).' })
  inactivityRuleEnabled!: boolean;
  @ApiProperty({ description: 'Inactivity period in calendar months.' })
  inactivityMonths!: number;
  @ApiProperty() cbctSupplementEnabled!: boolean;
  @ApiProperty() cbctSupplementFee!: number;
  @ApiProperty() refinementTwoArchesFee!: number;
  @ApiProperty() refinementSingleArchFee!: number;
  @ApiProperty() replacementAlignerFee!: number;
  @ApiProperty() retainersFee!: number;
  @ApiProperty() loyaltyEnabled!: boolean;
  @ApiProperty() welcomeGiftEnabled!: boolean;
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

/** GET admin/company-billing-settings/history: page + limit. */
export class BillingSettingsHistoryQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * One change of a fiscal or rollout setting. `before` / `after` are JSON
 * scalars: booleans for switches, an integer for the inactivity period,
 * decimal strings for rates and amounts ("1000.000", "1.00"); `before` is
 * null for the initial value.
 */
export class BillingSettingsAuditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    enum: [
      'withholdingEnabled',
      'withholdingRate',
      'withholdingThreshold',
      'stampDuty',
      'defaultTvaRate',
      'inactivityRuleEnabled',
      'inactivityMonths',
    ],
  })
  field!: string;
  @ApiPropertyOptional({ nullable: true }) before!:
    | string
    | number
    | boolean
    | null;
  @ApiPropertyOptional({ nullable: true }) after!:
    | string
    | number
    | boolean
    | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  actorName!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class BillingSettingsHistoryPageDto {
  @ApiProperty({ type: [BillingSettingsAuditEntryDto] })
  data!: BillingSettingsAuditEntryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
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

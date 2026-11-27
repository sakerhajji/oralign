import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../../common/decorators/is-calendar-date.decorator';
import { toOptionalTrimmed } from '../../common/dto/query-transforms';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

/**
 * Boolean read from the RAW payload. The global pipe runs with
 * enableImplicitConversion, which turns the string "false" into `true`
 * before any @Transform sees `value`; `obj[key]` is still the original.
 */
const rawBool = ({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}): unknown => {
  const raw = obj?.[key];
  if (raw === true || raw === 'true' || raw === '1' || raw === 1) return true;
  if (raw === false || raw === 'false' || raw === '0' || raw === 0)
    return false;
  return raw;
};

/**
 * Nullable number read from the RAW payload: an explicit null (or an empty
 * string from a cleared input) means "none" and must survive as null
 * instead of being coerced to 0.
 */
const rawNullableNumber = ({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}): unknown => {
  const raw = obj?.[key];
  if (raw === null || raw === '') return null;
  if (raw === undefined) return undefined;
  return typeof raw === 'number' ? raw : Number(raw);
};

/** Nullable string: null and blank both clear the field. */
const trimOrNull = ({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}): unknown => {
  const raw = obj?.[key];
  if (raw === null) return null;
  if (typeof raw === 'string') return raw.trim() === '' ? null : raw.trim();
  return raw;
};

/**
 * Swagger wording of the client-block fallback (InvoiceService.create via
 * manualInvoiceClient, spec §6). On UPDATE a field left out keeps the
 * stored value and a sent one replaces it.
 */
const CLIENT_FIELD_FALLBACK =
  'Creation: a value typed here always wins and an empty string clears ' +
  'the field; left out (or null), it is filled from the linked ' +
  "practitioner's snapshot (practice contact first, account as fallback) " +
  'when the invoice is billed to him in his own name (clientName = his ' +
  'name), otherwise it stays empty. Update: left out = unchanged.';

/** `"a,b"` or repeated params -> string[]. Mirrors PaymentFilterDto. */
const toEnumArray = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return value;
};

/**
 * One billable line. Note what is ABSENT: no `lineHt`, no `amount`, no
 * total of any kind. The client states WHAT is billed (description,
 * quantity, unit price, optional VAT override) and the server derives
 * every currency figure from it — see InvoiceService.computeTotals.
 */
export class InvoiceLineInputDto {
  @ApiProperty({ example: 'Gouttieres ORALIGN — arcade superieure' })
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional({
    default: 1,
    description: 'Quantite (3 decimales max).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1_000_000)
  quantity?: number;

  @ApiPropertyOptional({
    default: 0,
    description:
      'Prix unitaire HT, ou TTC (TVA incluse, sans le timbre) quand la facture a pricesIncludeTax = true : le serveur en derive le HT.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100_000_000)
  unitPrice?: number;

  @ApiPropertyOptional({
    description:
      "Taux de TVA propre a la ligne, en %. Omis => le taux de la facture s'applique.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  tvaRate?: number;
}

export class CreateInvoiceDto {
  // ── Rattachement optionnel a l'existant ───────────────────────────
  @ApiPropertyOptional({
    description: 'Commande liee (facture rattachee a une commande).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Patient existant — prerempli le bloc client.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  patientId?: string;

  @ApiPropertyOptional({ description: 'Praticien (compte dentiste) facture.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  doctorId?: string;

  // ── Bloc client (obligatoire, saisi ou prerempli) ─────────────────
  @ApiProperty({
    description:
      "Billed name. Creation: blank = the linked practitioner's name; the " +
      'invoice is billed to the practitioner in his own name (practice ' +
      'name snapshotted, client fields filled) when it equals his name.',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  clientName!: string;

  @ApiPropertyOptional({ nullable: true, description: CLIENT_FIELD_FALLBACK })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(254)
  clientEmail?: string;

  @ApiPropertyOptional({ nullable: true, description: CLIENT_FIELD_FALLBACK })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  clientPhone?: string;

  @ApiPropertyOptional({ nullable: true, description: CLIENT_FIELD_FALLBACK })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  clientAddress?: string;

  @ApiPropertyOptional({ nullable: true, description: CLIENT_FIELD_FALLBACK })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  clientCity?: string;

  @ApiPropertyOptional({ nullable: true, description: CLIENT_FIELD_FALLBACK })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  clientCountry?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: `Matricule fiscal du client. ${CLIENT_FIELD_FALLBACK}`,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  clientTaxId?: string;

  // ── En-tete ───────────────────────────────────────────────────────
  @ApiPropertyOptional({
    description: "Date d'emission (ISO). Defaut: maintenant.",
  })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ description: "Date d'echeance (ISO)." })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: InvoiceStatus, default: InvoiceStatus.draft })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ enum: ['fr', 'en'], default: 'fr' })
  @IsOptional()
  @IsIn(['fr', 'en'])
  language?: 'fr' | 'en';

  @ApiPropertyOptional({
    description: 'Taux de TVA par defaut de la facture, en %.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  tvaRate?: number;

  @ApiPropertyOptional({
    description:
      'Remise globale, en montant HT (ou TTC quand pricesIncludeTax = true).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Remise en % du brut des lignes (TTC ou HT selon pricesIncludeTax). Envoye => discountAmount est calcule par le serveur. null => remise en montant.',
  })
  @IsOptional()
  @Transform(rawNullableNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  @ApiPropertyOptional({
    description:
      'Droit de timbre, ajoute au total de la facture (une facture par paiement, un timbre par facture). Omis => la valeur des parametres de facturation est figee sur la facture.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  stampDuty?: number;

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      'true = les prix des lignes (et la remise) sont saisis TTC, TVA incluse ; HT et TVA sont deduits a rebours et le droit de timbre est ajoute (HT + TVA + timbre = total). false = saisie HT historique (TVA et timbre ajoutes).',
  })
  @IsOptional()
  @Transform(rawBool)
  @IsBoolean()
  pricesIncludeTax?: boolean;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    nullable: true,
    description: 'Mode de paiement imprime sur la facture. null = non precise.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Reference du reglement (numero de cheque, de virement, de transaction).',
  })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(120)
  paymentReference?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Retenue a la source, en %, calculee par le serveur sur le TTC hors droit de timbre ; net a payer = total TTC (timbre compris) - retenue. null ou 0 = aucune.',
  })
  @IsOptional()
  @Transform(rawNullableNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99.99)
  withholdingRate?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Numero impose. Omis => alloue depuis le compteur FAC des parametres de facturation.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  @ApiProperty({ type: [InvoiceLineInputDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines!: InvoiceLineInputDto[];
}

/**
 * Every field is optional. `lines` omitted => the existing lines are kept;
 * `lines` provided => it REPLACES the whole set, which is how the editor
 * actually works (add / edit / remove in one round trip).
 */
export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}

export enum InvoiceSortBy {
  issueDate = 'issueDate',
  createdAt = 'createdAt',
  totalTtc = 'totalTtc',
  invoiceNumber = 'invoiceNumber',
  status = 'status',
}

export enum InvoiceSortOrder {
  asc = 'asc',
  desc = 'desc',
}

export class InvoiceFilterDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Numero, nom / email / telephone du client, ou code commande.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: InvoiceStatus, isArray: true })
  @IsOptional()
  @Transform(toEnumArray)
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(InvoiceStatus, { each: true })
  statuses?: InvoiceStatus[];

  @ApiPropertyOptional({ description: 'Periode — debut (ISO), sur issueDate.' })
  @IsOptional()
  @IsDateString()
  issuedFrom?: string;

  @ApiPropertyOptional({ description: 'Periode — fin (ISO), incluse.' })
  @IsOptional()
  @IsDateString()
  issuedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  doctorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Corbeille admin — ne retourne QUE les factures archivees.',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({
    enum: InvoiceSortBy,
    default: InvoiceSortBy.issueDate,
  })
  @IsOptional()
  @IsEnum(InvoiceSortBy)
  sortBy?: InvoiceSortBy;

  @ApiPropertyOptional({
    enum: InvoiceSortOrder,
    default: InvoiceSortOrder.desc,
  })
  @IsOptional()
  @IsEnum(InvoiceSortOrder)
  sortOrder?: InvoiceSortOrder;
}

/** Bulk actions: the body is just a list of ids. */
export class InvoiceIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];
}

/**
 * POST admin/invoices/export/zip. `ids` given: those invoices, as before.
 * `ids` absent: every issued, paid and cancelled invoice (not draft, not
 * archived) issued in the period, Tunis days, both bounds included.
 */
export class InvoiceZipExportDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Les factures choisies (200 au plus). Absent => toute la periode issuedFrom..issuedTo.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids?: string[];

  @ApiPropertyOptional({
    example: '2026-11-01',
    description:
      'Premier jour inclus (YYYY-MM-DD, jours de Tunis). Utilise quand ids est absent.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsCalendarDate()
  issuedFrom?: string;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description:
      'Dernier jour inclus (YYYY-MM-DD, jours de Tunis). Utilise quand ids est absent.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsCalendarDate()
  issuedTo?: string;
}

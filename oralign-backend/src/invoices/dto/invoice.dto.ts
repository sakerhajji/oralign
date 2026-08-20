import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
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

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

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

  @ApiPropertyOptional({ default: 1, description: 'Quantite (3 decimales max).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1_000_000)
  quantity?: number;

  @ApiPropertyOptional({ default: 0, description: 'Prix unitaire HT.' })
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
  @ApiPropertyOptional({ description: 'Commande liee (facture rattachee a une commande).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderId?: string;

  @ApiPropertyOptional({ description: 'Patient existant — prerempli le bloc client.' })
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
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  clientName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(254)
  clientEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  clientPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  clientAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  clientCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  clientCountry?: string;

  @ApiPropertyOptional({ description: 'Matricule fiscal du client.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  clientTaxId?: string;

  // ── En-tete ───────────────────────────────────────────────────────
  @ApiPropertyOptional({ description: "Date d'emission (ISO). Defaut: maintenant." })
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

  @ApiPropertyOptional({ description: 'Taux de TVA par defaut de la facture, en %.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  tvaRate?: number;

  @ApiPropertyOptional({ description: 'Remise globale, en montant HT.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({
    description:
      'Droit de timbre. Omis => la valeur des parametres de facturation est figee sur la facture.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  stampDuty?: number;

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

  @ApiPropertyOptional({ enum: InvoiceSortBy, default: InvoiceSortBy.issueDate })
  @IsOptional()
  @IsEnum(InvoiceSortBy)
  sortBy?: InvoiceSortBy;

  @ApiPropertyOptional({ enum: InvoiceSortOrder, default: InvoiceSortOrder.desc })
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

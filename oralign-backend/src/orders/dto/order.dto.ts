import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  ArchTreatment,
  MediaProcessingStatus,
  OrderFileCategory,
  OrderStatus,
  PatientStage,
  ToothInstructionType,
  TreatmentPlanStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class ToothInstructionDto {
  @ApiProperty({ example: 11, description: 'FDI tooth number' })
  @Type(() => Number)
  @IsInt()
  @Min(11)
  @Max(48)
  toothNumber!: number;

  @ApiProperty({ enum: ToothInstructionType })
  @IsEnum(ToothInstructionType)
  type!: ToothInstructionType;

  @ApiProperty({
    required: false,
    description:
      'Optional numeric/text value. Required by `ipr_value` (admin-added IPR in mm).',
    example: '0.2',
  })
  @IsOptional()
  @IsString()
  value?: string | null;

  @ApiProperty({
    required: false,
    description: 'Free-text note attached to this per-tooth instruction.',
  })
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateToothInstructionsDto {
  @ApiProperty({ type: [ToothInstructionDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ToothInstructionDto)
  instructions!: ToothInstructionDto[];

  /**
   * Optional list of `ToothInstructionType` values the caller "owns" on
   * this save. When provided, the endpoint's REPLACE-ALL semantics is
   * scoped to ONLY these types — rows of other types are preserved.
   *
   * Without this scope, the order edit page (doctor edits) and the
   * treatment-plan editor (planner edits) cannot coexist on the same
   * order: each save would wipe the other side's data.
   *
   * Concretely:
   *   • Order wizard sends `[NO_ATTACHMENTS, DO_NOT_MOVE, NO_IPR, EXTRACT]`
   *     → planner-set ATTACHMENT rows are kept untouched.
   *   • Treatment-plan editor sends `[ATTACHMENT]`
   *     → doctor-set prescription rows are kept untouched.
   *
   * When omitted, the endpoint falls back to the legacy delete-all
   * behaviour so older / unmigrated clients keep working. The
   * `instructions` payload itself must still respect the array max
   * size + per-row uniqueness rules either way.
   */
  @ApiProperty({
    enum: ToothInstructionType,
    isArray: true,
    required: false,
    description:
      'Limits the REPLACE-ALL scope to these instruction types. ' +
      'Rows of other types are preserved. Omit for legacy delete-all behaviour.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ToothInstructionType, { each: true })
  replaceTypes?: ToothInstructionType[];
}

export class CreateOrderDto {
  @ApiProperty({ required: false, description: 'Optional admin order code' })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @MinLength(3)
  orderCode?: string;

  @ApiProperty({ required: false, description: 'Admin-only dentist owner' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiProperty({ description: 'Patient ID' })
  @IsString()
  patientId!: string;

  @ApiProperty({ enum: PatientStage, required: false })
  @IsOptional()
  @IsEnum(PatientStage)
  patientStage?: PatientStage;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiProperty({ enum: ArchTreatment, required: false })
  @IsOptional()
  @IsEnum(ArchTreatment)
  archTreatment?: ArchTreatment;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  treatBothArch?: boolean;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  dontMoveOption?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  apRelationship?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  anteroposteriorRelationship?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  elastics?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  openBite?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  midline?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  ipr?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  biteRamps?: string;

  @ApiProperty({
    required: false,
    description:
      'Expansion plan. Encoded as a short structured string by the wizard ' +
      '(e.g. "Both — anterior priority") or "No expansion" when none is needed.',
  })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  expansion?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  crossbite?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  spaces?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  extractions?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  specialInstructions?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  additionalInstructions?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  useCbctWithScans?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  wantsManufacturing?: boolean;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  materials?: string[];

  @ApiProperty({ type: [ToothInstructionDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ToothInstructionDto)
  toothInstructions?: ToothInstructionDto[];
}

export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

/**
 * Body for POST /orders/:id/submit. The doctor must accept the General
 * Terms & Conditions before an order can leave the draft state — the
 * service rejects the submit when this is anything other than `true`.
 */
export class SubmitOrderDto {
  @ApiProperty({
    description:
      'The doctor accepted the General Terms & Conditions. Must be true.',
  })
  @IsBoolean()
  termsAccepted!: boolean;
}

/**
 * Body for POST /orders/:id/files/chunked — opens (or resumes) a
 * chunked/resumable upload session for one large file. The DECLARED
 * name + size are validated with the same rules as the single-shot
 * upload before any byte is transferred; the response carries the
 * server-owned chunk size plus the indexes already received, so an
 * interrupted upload continues instead of restarting.
 */
export class InitChunkedUploadDto {
  @ApiProperty({ description: 'Original client file name (no paths).' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ description: 'Total file size in bytes.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size!: number;

  @ApiProperty({ required: false, description: 'Client-reported MIME type.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  mimeType?: string;

  @ApiProperty({ enum: OrderFileCategory })
  @IsEnum(OrderFileCategory)
  category!: OrderFileCategory;
}

// ── Sort fields the list endpoint honours ────────────────────────
// Tied to columns the orders list page surfaces — keeping the enum
// narrow means a typo in the client falls through to the default
// `createdAt DESC` rather than silently producing nonsense ordering.
export enum OrderSortField {
  createdAt = 'createdAt',
  updatedAt = 'updatedAt',
  orderCode = 'orderCode',
  status = 'status',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

export class OrderFilterDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiProperty({ enum: OrderStatus, required: false })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  // Multi-status filter — the Orders page tab strip groups several
  // raw statuses under one tab (e.g. the "Treatment plan" tab covers
  // PLANNING + READY + REVISION_REQUESTED + APPROVED so a row
  // anywhere in that phase shows up).
  //
  // Frontend serialisation shapes we normalise here:
  //   1. ?statuses=finished                → string  → ['finished']
  //   2. ?statuses=a&statuses=b            → string[] → ['a','b']
  //   3. ?statuses[]=finished              → string[] (qs unwraps brackets)
  //   4. ?statuses[0]=a&statuses[1]=b      → { '0':'a','1':'b' } (qs's
  //                                          indexed-bracket shape — used
  //                                          when the axios serializer
  //                                          emits indices). We pull the
  //                                          values back out so the
  //                                          downstream filter sees an
  //                                          array no matter what hit
  //                                          the wire.
  //   5. ?statuses=                        → empty string → undefined
  @ApiProperty({ enum: OrderStatus, isArray: true, required: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) {
      const cleaned = value.filter((v) => v !== undefined && v !== null && v !== '');
      return cleaned.length > 0 ? cleaned : undefined;
    }
    if (typeof value === 'object') {
      // qs's indexed-bracket shape comes through as a plain object —
      // `Object.values()` gives back the array we expected to receive.
      const values = Object.values(value as Record<string, unknown>).filter(
        (v) => v !== undefined && v !== null && v !== '',
      );
      return values.length > 0 ? values : undefined;
    }
    return [value];
  })
  @IsEnum(OrderStatus, { each: true })
  statuses?: OrderStatus[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orderCode?: string;

  // ── Sort + pagination plumbing ─────────────────────────────────
  // Whitelist of sort fields keeps the SQL generator safe — Prisma
  // throws if `orderBy` contains an unknown field, but stronger to
  // reject at the DTO boundary with a clear validation error.
  @ApiProperty({ enum: OrderSortField, required: false, default: OrderSortField.createdAt })
  @IsOptional()
  @IsEnum(OrderSortField)
  sortBy?: OrderSortField;

  @ApiProperty({ enum: SortOrder, required: false, default: SortOrder.desc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  // ── Date range filter (createdAt) ───────────────────────────────
  // ISO 8601 string ("2024-05-22" or "2024-05-22T00:00:00Z"). The
  // service builds an inclusive `[from, to]` gte/lte pair so the
  // semantics match "orders created between these two days" (no
  // off-by-one timezone surprises — both bounds in UTC).
  @ApiProperty({ required: false, example: '2024-05-22' })
  @IsOptional()
  @IsString()
  createdFrom?: string;

  @ApiProperty({ required: false, example: '2024-06-22' })
  @IsOptional()
  @IsString()
  createdTo?: string;

  // ── Trash bin filter ────────────────────────────────────────────
  // Admin-only behaviour at the service layer — a dentist passing
  // this flag still sees only their own non-deleted rows. When set
  // to `true` the response surfaces ONLY soft-deleted orders so the
  // admin can review / restore / hard-delete from the same list.
  @ApiProperty({
    required: false,
    description:
      'Admin only — return only soft-deleted orders (deletedAt is set). Used to render the trash-bin view.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDeleted?: boolean;
}

export class UploadOrderFilesQueryDto {
  @ApiProperty({ enum: OrderFileCategory, required: false, default: 'other' })
  @IsOptional()
  @IsEnum(OrderFileCategory)
  category?: OrderFileCategory;
}

/**
 * Admin override of the order status. Used to roll an order forward
 * past a stuck step (e.g. fabrication never auto-promoted) or backward
 * to fix an operator mistake (e.g. canceled by accident).
 *
 * `reason` is logged for auditability; we don't have an order-history
 * table yet, so it's kept as a free-text field that's surfaced in the
 * backend logs.
 */
export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, description: 'Target lifecycle status' })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiProperty({
    required: false,
    description: 'Reason for the change (audit log only).',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}

/**
 * Bulk admin action — bump the lifecycle status of N orders at once.
 * Capped at 200 IDs per call to keep the SELECT FOR UPDATE inside the
 * transaction tractable; the orders page batches selections to that
 * limit too. Bigger jobs should go through a scheduled task.
 */
export class BulkUpdateOrderStatusDto {
  @ApiProperty({ type: [String], description: 'Order IDs to update' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiProperty({ required: false, description: 'Reason for audit log.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}

/**
 * Bulk soft-delete. Same cap as the status DTO; the service maps each
 * id to `deletedAt = NOW()` inside a single transaction so partial
 * results never leak (every row succeeds or none do).
 */
export class BulkDeleteOrdersDto {
  @ApiProperty({ type: [String], description: 'Order IDs to delete' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];
}

/**
 * Bulk restore — clears `deletedAt` on N soft-deleted orders so they
 * re-appear in the active list. Idempotent on already-live rows.
 */
export class BulkRestoreOrdersDto {
  @ApiProperty({ type: [String], description: 'Order IDs to restore' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];
}

/**
 * Bulk PERMANENT delete — irrecoverable hard-delete + file blob cleanup
 * for N orders. Capped lower than the soft-delete bucket because the
 * blast radius (FK cascades + filesystem writes) is bigger, and the UX
 * already forces a confirm dialog before this fires.
 */
export class BulkPermanentDeleteOrdersDto {
  @ApiProperty({ type: [String], description: 'Order IDs to permanently delete' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}

/** Per-variant facts exposed over the API — never the disk path. */
export class OrderFileVariantDto {
  @ApiProperty({ required: false })
  width?: number;
  @ApiProperty({ required: false })
  height?: number;
  @ApiProperty({ required: false })
  sizeBytes?: number;
  @ApiProperty({ required: false, example: 'webp' })
  format?: string;
}

export class OrderFileResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({ enum: OrderFileCategory })
  category!: OrderFileCategory;
  @ApiProperty()
  originalName!: string;
  @ApiProperty()
  fileName!: string;
  @ApiProperty()
  relativePath!: string;
  @ApiProperty()
  mimeType!: string;
  @ApiProperty()
  size!: number;
  @ApiProperty()
  createdAt!: Date;

  // ── Media-optimization pipeline ──────────────────────────────────
  @ApiProperty({
    required: false,
    description:
      'Clean ordered filename (Patient_Category_NNN.ext). Downloads are ' +
      'saved under this name; legacy rows fall back to originalName.',
  })
  generatedName?: string;
  @ApiProperty({
    description: 'Per order+category upload sequence (0 on legacy rows)',
  })
  orderIndex!: number;
  @ApiProperty({ required: false, description: 'Original image width (px)' })
  width?: number;
  @ApiProperty({ required: false, description: 'Original image height (px)' })
  height?: number;
  @ApiProperty({
    required: false,
    enum: MediaProcessingStatus,
    description:
      'pending | processing | completed | failed — absent when the ' +
      'pipeline does not apply to this file type.',
  })
  processingStatus?: MediaProcessingStatus;
  @ApiProperty({
    required: false,
    description:
      'Available derived artefacts keyed by name (thumb | md | lg | avif ' +
      '| model), each { width?, height?, sizeBytes?, format? }. Fetch via ' +
      'the download endpoint with ?variant=<name>.',
  })
  variants?: Record<string, OrderFileVariantDto>;
  @ApiProperty({
    required: false,
    description:
      'Safe type-specific metadata: zip → entryCount/topLevelEntries/' +
      'totalUncompressedBytes/suspicious; stl → triangleCount/vertexCount/bbox.',
  })
  mediaMetadata?: Record<string, unknown>;
}

export class OrderResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  orderCode!: string;
  @ApiProperty()
  doctorId!: string;
  @ApiProperty()
  patientId!: string;
  @ApiProperty({ required: false })
  assignedDesignerId?: string;
  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;
  @ApiProperty({ enum: PatientStage, required: false })
  patientStage?: PatientStage;
  @ApiProperty({ required: false })
  chiefComplaint?: string;
  @ApiProperty({ enum: ArchTreatment, required: false })
  archTreatment?: ArchTreatment;
  @ApiProperty()
  treatBothArch!: boolean;
  @ApiProperty({ required: false })
  treatmentPlan?: string;
  @ApiProperty({ required: false })
  dontMoveOption?: string;
  @ApiProperty({ required: false })
  apRelationship?: string;
  @ApiProperty({ required: false })
  anteroposteriorRelationship?: string;
  @ApiProperty({ required: false })
  elastics?: string;
  @ApiProperty({ required: false })
  openBite?: string;
  @ApiProperty({ required: false })
  midline?: string;
  @ApiProperty({ required: false })
  ipr?: string;
  @ApiProperty({ required: false })
  biteRamps?: string;
  @ApiProperty({ required: false })
  expansion?: string;
  @ApiProperty({ required: false })
  crossbite?: string;
  @ApiProperty({ required: false })
  spaces?: string;
  @ApiProperty({ required: false })
  extractions?: string;
  @ApiProperty({ required: false })
  specialInstructions?: string;
  @ApiProperty({ required: false })
  additionalInstructions?: string;
  @ApiProperty()
  useCbctWithScans!: boolean;
  @ApiProperty()
  wantsManufacturing!: boolean;
  @ApiProperty({ type: [String] })
  materials!: string[];
  @ApiProperty({ type: [ToothInstructionDto] })
  toothInstructions!: ToothInstructionDto[];
  @ApiProperty({ type: [OrderFileResponseDto] })
  files!: OrderFileResponseDto[];
  @ApiProperty({ required: false })
  doctor?: {
    id: string;
    fullName: string;
    email: string;
    clinicName?: string;
  };
  @ApiProperty({ required: false })
  patient?: {
    id: string;
    fullName: string;
    email?: string;
    phone?: string;
    gender?: string;
    dateOfBirth?: Date;
    profilePhotoUrl?: string;
  };
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
  @ApiProperty({ required: false })
  submittedAt?: Date;
  @ApiProperty({ required: false, description: 'When the treatment fee was marked paid; gates treatment-plan creation.' })
  treatmentFeePaidAt?: Date;
  @ApiProperty({ required: false, description: 'Snapshot of treatment fee amount at payment time.' })
  treatmentFeeAmount?: number;
  @ApiProperty({ required: false, description: 'CBCT supplement price snapshotted server-side when CBCT was requested on the draft order. Absent when CBCT is not requested or the paid supplement is disabled.' })
  cbctFeeAmount?: number;
  @ApiProperty({ required: false, description: 'Currency of the CBCT supplement snapshot.' })
  cbctFeeCurrency?: string;
  @ApiProperty({ required: false, description: 'Treatment fee payment method (reuses installment Payment enum).' })
  treatmentFeePaymentMethod?: string;
  @ApiProperty({ required: false, description: 'Treatment fee payment lifecycle status.' })
  treatmentFeePaymentStatus?: string;
  @ApiProperty({ required: false, description: 'Relative path to bank-transfer receipt for the treatment fee.' })
  treatmentFeeProofPath?: string;

  // ── Notification badges shown in the orders list ───────────────────────────
  // Computed server-side so the table doesn't have to issue per-row calls to
  // fetch each order's latest plan. `latestPlanStatus` drives the doctor's
  // "Action required" / "Approved" chip; `treatmentPlansCount` shows when
  // designers have started planning even if no plan is yet "ready".
  @ApiProperty({
    enum: TreatmentPlanStatus,
    required: false,
    description: 'Status of the most recent treatment plan, if any.',
  })
  latestPlanStatus?: TreatmentPlanStatus;

  @ApiProperty({
    required: false,
    description: 'Number of treatment-plan revisions started for this order.',
  })
  treatmentPlansCount?: number;
}

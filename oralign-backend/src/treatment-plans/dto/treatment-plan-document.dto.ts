import { ApiProperty } from '@nestjs/swagger';
import { Prisma, TreatmentPlanDocumentKind } from '@prisma/client';

/**
 * What the client may know about an analysis PDF. The storage path stays
 * on the server: the bytes are read through
 * GET /treatment-plans/:id/documents/:kind.
 */
export const PLAN_DOCUMENT_PUBLIC_SELECT = {
  kind: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedByName: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.TreatmentPlanDocumentSelect;

export type TreatmentPlanDocumentView = Prisma.TreatmentPlanDocumentGetPayload<{
  select: typeof PLAN_DOCUMENT_PUBLIC_SELECT;
}>;

export class TreatmentPlanDocumentDto {
  @ApiProperty({ enum: TreatmentPlanDocumentKind })
  kind!: TreatmentPlanDocumentKind;

  @ApiProperty({ example: 'analyse-cbct.pdf' })
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 1048576 })
  sizeBytes!: number;

  @ApiProperty({ type: String, nullable: true })
  uploadedByName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  /** Changes on every replace: the client keys its cached bytes on it. */
  @ApiProperty()
  updatedAt!: Date;
}

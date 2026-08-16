// Treatment plan (+ IPR, messages, public viewer)
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import type { OrderFile } from './entities';

// ─── Treatment plan ─────────────────────────────────────────────────────────

export enum TreatmentPlanStatus {
  PENDING = 'pending',
  READY = 'ready',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum TreatmentMessageType {
  MESSAGE = 'message',
  SYSTEM = 'system',
  APPROVAL = 'approval',
  REJECTION = 'rejection',
  FILE = 'file',
  TREATMENT_RESULT = 'treatment_result',
}

export enum TreatmentAttachmentCategory {
  IMAGE = 'image',
  XRAY = 'xray',
  STL = 'stl',
  PLY = 'ply',
  OBJ = 'obj',
  ZIP = 'zip',
  PDF = 'pdf',
  VIDEO = 'video',
  TREATMENT_FILE = 'treatment_file',
  TREATMENT_RESULT = 'treatment_result',
  CONTAINER = 'container',
  OTHER = 'other',
}

export interface TreatmentPlan {
  id: string;
  orderId: string;
  version: number;
  name: string;
  status: TreatmentPlanStatus;
  resultViewUrl?: string | null;
  filePath?: string | null;
  movementTableImagePath?: string | null;
  movementTableImageName?: string | null;
  movementTableImageMimeType?: string | null;
  movementTableImageSizeBytes?: number | null;
  // Dental treatment table ("traitement dentaire") — second image
  // artefact, distinct from the movement table above. Stored in
  // its own columns + on-disk folder so neither image can overwrite
  // the other.
  dentalTreatmentTableImagePath?: string | null;
  dentalTreatmentTableImageName?: string | null;
  dentalTreatmentTableImageMimeType?: string | null;
  dentalTreatmentTableImageSizeBytes?: number | null;
  totalUpperAligners?: number | null;
  totalLowerAligners?: number | null;
  issuedUpperAligners?: number | null;
  issuedLowerAligners?: number | null;
  createdById: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  publicToken?: string | null;
  publicExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentMessageAttachment {
  id: string;
  messageId: string;
  uploadedById: string;
  fileName: string;
  filePath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  category: TreatmentAttachmentCategory;
  createdAt: string;
}

export interface TreatmentMessage {
  id: string;
  treatmentPlanId: string;
  senderId: string;
  message?: string | null;
  type: TreatmentMessageType;
  attachments: TreatmentMessageAttachment[];
  sender?: {
    id: string;
    fullName: string;
    role: string;
    avatarUrl?: string | null;
  };
  createdAt: string;
}

export interface OdontogramEntry {
  type: string;
  value?: string | null;
  note?: string | null;
  createdById?: string | null;
  createdAt: string;
}

export interface TreatmentPlanIpr {
  id: string;
  treatmentPlanId: string;
  /** FDI tooth number of the "from" side of the contact. */
  fromTooth: number;
  /** FDI tooth number of the "to" side of the contact. */
  toTooth: number;
  /** IPR amount in mm, stored as a string to preserve trailing zeros. */
  value: string;
  /** Optional clinic-specific stripping auxiliary value. */
  note?: string | null;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTreatmentPlanIprDto {
  fromTooth: number;
  toTooth: number;
  value: string;
  note?: string | null;
}

export interface TreatmentPlanReview extends TreatmentPlan {
  odontogram: Array<{ toothNumber: number; entries: OdontogramEntry[] }>;
  messages: TreatmentMessage[];
  clinicalImages: OrderFile[];
  /** IPR / stripping entries owned by THIS treatment plan version. */
  iprEntries: TreatmentPlanIpr[];
}

export interface PublicTreatmentViewerPayload {
  treatmentPlan: {
    id: string;
    name: string;
    version: number;
    resultViewUrl?: string | null;
    publicExpiresAt?: string | null;
  };
  doctor?: { fullName?: string | null; clinicName?: string | null };
  patient?: {
    firstName?: string | null;
    /** Used to render a gendered salutation (Mr. / Ms.) on the patient
     *  public viewer page. */
    gender?: 'male' | 'female' | 'other' | null;
  };
}

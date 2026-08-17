// Community submissions
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

// ==========================================
// COMMUNITY SUBMISSIONS
// ==========================================

export enum CommunitySubmissionFormat {
  VIDEO = 'video',
  PHOTO = 'photo',
  TEXT = 'text',
}

export enum CommunitySubmissionRole {
  ADULT = 'adult',
  PARENT = 'parent',
  TEEN = 'teen',
}

export enum CommunitySubmissionTreatmentStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum CommunitySubmissionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export interface CommunitySubmissionMedia {
  id: string;
  relativePath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
}

export interface CommunitySubmission {
  id: string;
  format: CommunitySubmissionFormat;
  status?: CommunitySubmissionStatus;
  firstName: string;
  lastNameInitial: string;
  phone?: string;
  email?: string;
  city: string | null;
  role: CommunitySubmissionRole;
  childName?: string | null;
  childAge: number | null;
  treatmentStatus: CommunitySubmissionTreatmentStatus;
  why: string;
  journey: string;
  satisfied: string | null;
  message: string | null;
  consent?: boolean;
  contactConsent?: boolean;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  publishedAt: string | null;
  // Set when the story is archived (soft delete). Only ever non-null in
  // the admin trash view.
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  media: CommunitySubmissionMedia[];
  reviewedBy?: { id: string; fullName: string } | null;
}

export interface CreateCommunitySubmissionInput {
  format: CommunitySubmissionFormat;
  firstName: string;
  lastNameInitial: string;
  phone: string;
  email: string;
  city?: string;
  role: CommunitySubmissionRole;
  childName?: string;
  childAge?: number;
  treatmentStatus: CommunitySubmissionTreatmentStatus;
  why: string;
  journey: string;
  satisfied?: string;
  message?: string;
  consent: boolean;
  contactConsent?: boolean;
  media?: File[];
}

export interface CommunitySubmissionFilters {
  status?: CommunitySubmissionStatus;
  /** Admin trash view: return ONLY archived stories. */
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

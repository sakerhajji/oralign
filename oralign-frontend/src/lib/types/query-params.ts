// List / filter query params
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import { Gender, OrderStatus, UserRole } from './enums';

// ==========================================
// QUERY PARAMS
// ==========================================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface UserFilterParams extends PaginationParams {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  isEmailVerified?: boolean;
}

/**
 * Canonical sort fields for the patients list endpoint. Mirrors
 * `PatientSortField` on the backend. Keep narrow — the backend
 * rejects values outside the enum via class-validator.
 */
export type PatientSortField = 'createdAt' | 'updatedAt' | 'fullName';
/** Canonical sort fields for the orders list endpoint. */
export type OrderSortField = 'createdAt' | 'updatedAt' | 'orderCode' | 'status';
export type SortOrder = 'asc' | 'desc';

export interface PatientFilterParams extends PaginationParams {
  search?: string;
  doctorId?: string;
  /** Optional gender filter — admin-only on the patients page. */
  gender?: Gender;
  sortBy?: PatientSortField;
  sortOrder?: SortOrder;
  /** ISO 8601 dates (YYYY-MM-DD or full datetime). Inclusive bounds. */
  createdFrom?: string;
  createdTo?: string;
}

export interface OrderFilterParams extends PaginationParams {
  search?: string;
  doctorId?: string;
  patientId?: string;
  status?: OrderStatus;
  /**
   * Multi-status filter — the Orders page tab strip uses this so the
   * "Treatment plan" tab can cover the whole planning phase
   * (TREATMENT_PLANNING + TREATMENT_PLAN_READY + REVISION_REQUESTED
   * + TREATMENT_APPROVED) in a single request. The axios client
   * serialises `statuses: ['draft', 'submitted']` as repeated query
   * params `?statuses=draft&statuses=submitted` which the backend
   * DTO unwraps. When both `status` and `statuses` are sent,
   * `statuses` wins.
   */
  statuses?: OrderStatus[];
  orderCode?: string;
  sortBy?: OrderSortField;
  sortOrder?: SortOrder;
  createdFrom?: string;
  createdTo?: string;
  // Admin trash-bin view — backend returns ONLY soft-deleted rows
  // when this is true. Non-admin callers are silently ignored.
  includeDeleted?: boolean;
}

export interface BulkActionDto {
  ids: string[];
}

export interface BulkUpdateStatusDto {
  ids: string[];
  isActive: boolean;
}

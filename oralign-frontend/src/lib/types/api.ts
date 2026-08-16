// API response envelopes
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

// ==========================================
// API RESPONSE TYPES
// ==========================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

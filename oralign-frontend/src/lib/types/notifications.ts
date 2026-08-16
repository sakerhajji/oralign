// Notifications
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

// ─── Notifications ──────────────────────────────────────────────────────────
// Mirrors the backend `NotificationType` Prisma enum + Notification model.
// Stays role-agnostic: the bell dropdown renders any type that lands in the
// recipient's inbox.

export enum NotificationType {
  // Admin-facing
  USER_REGISTERED = 'user_registered',
  ORDER_CREATED = 'order_created',
  ORDER_SUBMITTED = 'order_submitted',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_DECLARED = 'payment_declared',
  CASH_PAYMENT_RECORDED = 'cash_payment_recorded',
  // Doctor-facing
  ORDER_STATUS_CHANGED = 'order_status_changed',
  TREATMENT_PLAN_READY = 'treatment_plan_ready',
  TREATMENT_PLAN_UPDATED = 'treatment_plan_updated',
  QUOTATION_SENT = 'quotation_sent',
  QUOTATION_CANCELED = 'quotation_canceled',
  PAYMENT_CONFIRMED = 'payment_confirmed',
  PAYMENT_REJECTED = 'payment_rejected',
  BATCH_UNLOCKED = 'batch_unlocked',
  BATCH_DELIVERED = 'batch_delivered',
  INSTALLMENT_OVERDUE = 'installment_overdue',
  // Generic
  SYSTEM_MESSAGE = 'system_message',
}

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Deep link the UI navigates to on click; path-only. */
  link?: string | null;
  /** Free-form structured payload — type-narrow at the call site. */
  metadata?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationFilters {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  errorCode?: string;
  timestamp: string;
}

export interface MessageResponse {
  message: string;
}

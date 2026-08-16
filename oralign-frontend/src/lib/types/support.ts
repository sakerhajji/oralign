// Support chat (doctor <-> admin)
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import { UserRole } from './enums';

// ==========================================
// SUPPORT CHAT (doctor ↔ admin)
// ==========================================

export enum SupportConversationStatus {
  OPEN = 'open',
  PENDING = 'pending',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum SupportPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: UserRole;
  body?: string | null;
  attachmentRelativePath?: string | null;
  attachmentMime?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  readAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  sender?: {
    id: string;
    fullName: string;
    role: UserRole;
    avatarUrl?: string | null;
  } | null;
}

export interface SupportConversation {
  id: string;
  doctorId: string;
  subject?: string | null;
  status: SupportConversationStatus;
  priority: SupportPriority;
  assignedAdminId?: string | null;
  unreadByAdmin: number;
  unreadByDoctor: number;
  lastMessageAt: string;
  lastMessagePreview?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  doctor?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string | null;
  } | null;
  assignedAdmin?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

export interface SupportConversationFilters {
  page?: number;
  limit?: number;
  search?: string;
  statuses?: SupportConversationStatus[];
  priorities?: SupportPriority[];
  unreadOnly?: boolean;
  includeDeleted?: boolean;
}

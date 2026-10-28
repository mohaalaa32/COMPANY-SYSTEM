/**
 * Client-safe types and Arabic UI labels for the Staff Knowledge Base & AI Feedback (0-D1c).
 *
 * Contains NO imports from @tel/adapters so client components never bundle server-only modules
 * or raw catalog cost prices.
 */

export type StaffRole = 'STAFF' | 'SUPERVISOR';

export interface StaffSessionView {
  id: string;
  nameAr: string;
  role: StaffRole;
  titleAr: string;
  authMode: 'isolated_dev' | 'production_secret';
}

export type KnowledgeCategory = 'FAQ' | 'OBJECTION_REPLY' | 'PRODUCT_NOTE';

export type KnowledgeStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface KnowledgePendingRevisionView {
  id: string;
  entryId: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'REJECTED';
  titleAr: string;
  contentAr: string;
  triggerKeywords: string[];
  productIds: string[];
  rejectionReason?: string;
  createdById: string;
  createdByNameAr: string;
  createdByRole: StaffRole;
  updatedById: string;
  updatedByNameAr: string;
  updatedByRole: StaffRole;
  submittedById?: string;
  submittedByNameAr?: string;
  submittedAt?: string;
  reviewedById?: string;
  reviewedByNameAr?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEntryView {
  id: string;
  category: KnowledgeCategory;
  status: KnowledgeStatus;
  titleAr: string;
  contentAr: string;
  triggerKeywords: string[];
  productIds: string[];
  branchId: string;
  publishedVersion: number;
  rejectionReason?: string;
  createdById: string;
  createdByNameAr: string;
  createdByRole: StaffRole;
  updatedById: string;
  updatedByNameAr: string;
  updatedByRole: StaffRole;
  submittedById?: string;
  submittedByNameAr?: string;
  submittedAt?: string;
  reviewedById?: string;
  reviewedByNameAr?: string;
  reviewedAt?: string;
  publishedAt?: string;
  withdrawnById?: string;
  withdrawnByNameAr?: string;
  withdrawnAt?: string;
  createdAt: string;
  updatedAt: string;
  pendingRevision?: KnowledgePendingRevisionView;
}

export interface KnowledgeAuditLogView {
  id: string;
  entryId: string;
  action: string;
  actorId: string;
  actorNameAr: string;
  actorRole: StaffRole;
  fromStatus?: string;
  toStatus?: string;
  summaryAr: string;
  reasonAr?: string;
  createdAt: string;
}

export interface AiReplyFeedbackView {
  id: string;
  conversationId: string;
  messageId: string;
  originalAiText: string;
  correctedReplyAr: string;
  notesAr?: string;
  category?: KnowledgeCategory;
  productIds: string[];
  linkedKnowledgeEntryId?: string;
  createdById: string;
  createdByNameAr: string;
  createdByRole: StaffRole;
  createdAt: string;
}

export interface CatalogProductOptionView {
  id: string;
  sku: string;
  nameAr: string;
  brand: string;
}

export const KNOWLEDGE_CATEGORY_LABELS_AR: Record<KnowledgeCategory, string> = {
  FAQ: 'الإجابات الشائعة',
  OBJECTION_REPLY: 'ردود الاعتراضات',
  PRODUCT_NOTE: 'ملاحظات المنتجات',
};

export const KNOWLEDGE_STATUS_LABELS_AR: Record<KnowledgeStatus, string> = {
  DRAFT: 'مسودة',
  PENDING_APPROVAL: 'بانتظار موافقة المشرف',
  PUBLISHED: 'منشور ومعتمد للمساعد',
  REJECTED: 'مرفوض (مع السبب)',
  WITHDRAWN: 'مسحوب من النشر',
};

export const STAFF_ROLE_LABELS_AR: Record<StaffRole, string> = {
  STAFF: 'موظف مبيعات',
  SUPERVISOR: 'مشرف معتمد',
};

/**
 * Server-side Knowledge Base & AI Feedback Controller (0-D1c)
 *
 * Bridges the Next.js server routes/pages with the durable `SqliteKnowledgeStore` in `@tel/adapters`.
 * Enforces server-side RBAC, validates conversation/AI message links for feedback, and strips any
 * cost/margin fields from catalog options passed to the dashboard UI.
 */

import {
  KARBALA_BRANCH_ID,
  KnowledgeAuthorizationError,
  KnowledgeNotFoundError,
  KnowledgeStorageError,
  KnowledgeTransitionError,
  KnowledgeValidationError,
  MOCK_PRODUCTS,
  SqliteKnowledgeStore,
  type KnowledgeCategory,
  type KnowledgeMutationInput,
  type KnowledgeStatus,
  type StaffActor,
} from '@tel/adapters';
import { DEMO_CONVERSATIONS } from './demo-data';
import type {
  AiReplyFeedbackView,
  CatalogProductOptionView,
  KnowledgeAuditLogView,
  KnowledgeEntryView,
} from './knowledge-model';

const globalForKbStore = globalThis as unknown as {
  telKnowledgeStore: SqliteKnowledgeStore | undefined;
};

export function getKnowledgeStore(): SqliteKnowledgeStore {
  if (!globalForKbStore.telKnowledgeStore) {
    globalForKbStore.telKnowledgeStore = new SqliteKnowledgeStore();
  }
  return globalForKbStore.telKnowledgeStore;
}

/**
 * Returns display-safe catalog product options for linking product notes (no `costIQD` or margin).
 */
export function getKarbalaCatalogProductOptions(): CatalogProductOptionView[] {
  return MOCK_PRODUCTS.filter((p) =>
    p.branches.some((b) => b.branchId === KARBALA_BRANCH_ID)
  ).map((p) => ({
    id: p.id,
    sku: p.sku,
    nameAr: p.nameAr,
    brand: p.brand,
  }));
}

export function getInitialKnowledgeDashboardState(store: SqliteKnowledgeStore = getKnowledgeStore()): {
  entries: KnowledgeEntryView[];
  auditLogs: KnowledgeAuditLogView[];
  feedbacks: AiReplyFeedbackView[];
  catalogOptions: CatalogProductOptionView[];
} {
  return {
    entries: store.listEntries(),
    auditLogs: store.listAuditLogs(),
    feedbacks: store.listFeedback(),
    catalogOptions: getKarbalaCatalogProductOptions(),
  };
}

/**
 * Validates that a feedback submission references an actual conversation and an actual AI message
 * on the server, reading `originalAiText` from the authoritative server conversation record.
 */
export function recordVerifiedConversationAiFeedback(
  actor: StaffActor,
  body: Record<string, unknown>,
  store: SqliteKnowledgeStore = getKnowledgeStore()
): {
  feedback: AiReplyFeedbackView;
  draftEntry?: KnowledgeEntryView;
} {
  const conversationId =
    typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
  const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';

  const conversation = DEMO_CONVERSATIONS.find((c) => c.id === conversationId);
  if (!conversation) {
    throw new KnowledgeValidationError(
      'unknown_conversation_id',
      `المحادثة "${conversationId}" غير موجودة في سجلات النظام.`
    );
  }

  const targetMessage = conversation.messages.find((m) => m.id === messageId);
  if (!targetMessage || targetMessage.sender !== 'AI') {
    throw new KnowledgeValidationError(
      'invalid_ai_message_id',
      `الرسالة "${messageId}" ليست رد مساعد ذكي قابل للتصحيح في هذه المحادثة.`
    );
  }

  const correctedReplyAr =
    typeof body.correctedReplyAr === 'string' ? body.correctedReplyAr : '';
  const notesAr = typeof body.notesAr === 'string' ? body.notesAr : undefined;
  const category =
    typeof body.category === 'string' ? (body.category as KnowledgeCategory) : undefined;
  const productIds = Array.isArray(body.productIds)
    ? body.productIds.filter((id): id is string => typeof id === 'string')
    : targetMessage.productIds ?? [];
  const createDraftEntry = Boolean(body.createDraftEntry);
  const draftTitleAr =
    typeof body.draftTitleAr === 'string' ? body.draftTitleAr : undefined;
  const draftTriggerKeywords = Array.isArray(body.draftTriggerKeywords)
    ? body.draftTriggerKeywords.filter((k): k is string => typeof k === 'string')
    : undefined;

  return store.recordAiReplyFeedback(actor, {
    conversationId,
    messageId,
    originalAiText: targetMessage.text,
    correctedReplyAr,
    notesAr,
    category,
    productIds,
    createDraftEntry,
    draftTitleAr,
    draftTriggerKeywords,
  });
}

export type KnowledgeActionRequest =
  | {
      action: 'create';
      category: KnowledgeCategory;
      titleAr: string;
      contentAr: string;
      triggerKeywords?: string[];
      productIds?: string[];
      submitForApproval?: boolean;
    }
  | {
      action: 'update';
      entryId: string;
      category: KnowledgeCategory;
      titleAr: string;
      contentAr: string;
      triggerKeywords?: string[];
      productIds?: string[];
      submitForApproval?: boolean;
    }
  | {
      action: 'submit_for_approval';
      entryId: string;
    }
  | {
      action: 'approve_and_publish';
      entryId: string;
    }
  | {
      action: 'reject';
      entryId: string;
      rejectionReason: string;
    }
  | {
      action: 'withdraw';
      entryId: string;
      reasonAr?: string;
    };

/**
 * Executes a Knowledge Base action on the server using ONLY the server-verified `actor`.
 * Any `role`, `actorRole`, or `actor` fields present in `rawBody` are ignored.
 */
export function executeServerKnowledgeAction(
  actor: StaffActor,
  rawBody: Record<string, unknown>,
  store: SqliteKnowledgeStore = getKnowledgeStore()
): {
  entry: KnowledgeEntryView;
  auditLogs: KnowledgeAuditLogView[];
} {
  const action = typeof rawBody.action === 'string' ? rawBody.action : '';

  const parseMutationInput = (): KnowledgeMutationInput => ({
    category: rawBody.category as KnowledgeCategory,
    titleAr: typeof rawBody.titleAr === 'string' ? rawBody.titleAr : '',
    contentAr: typeof rawBody.contentAr === 'string' ? rawBody.contentAr : '',
    triggerKeywords: Array.isArray(rawBody.triggerKeywords)
      ? rawBody.triggerKeywords.filter((k): k is string => typeof k === 'string')
      : typeof rawBody.triggerKeywordsText === 'string'
      ? rawBody.triggerKeywordsText
          .split(/[،,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    productIds: Array.isArray(rawBody.productIds)
      ? rawBody.productIds.filter((id): id is string => typeof id === 'string')
      : [],
    submitForApproval: Boolean(rawBody.submitForApproval),
  });

  const entryId = typeof rawBody.entryId === 'string' ? rawBody.entryId.trim() : '';

  let entry: KnowledgeEntryView;
  switch (action) {
    case 'create':
      entry = store.createEntry(actor, parseMutationInput());
      break;
    case 'update':
      if (!entryId) {
        throw new KnowledgeValidationError('missing_entry_id', 'معرف العنصر مطلوب للتعديل.');
      }
      entry = store.updateEntry(actor, entryId, parseMutationInput());
      break;
    case 'submit_for_approval':
      if (!entryId) {
        throw new KnowledgeValidationError('missing_entry_id', 'معرف العنصر مطلوب للمراجعة.');
      }
      entry = store.submitForApproval(actor, entryId);
      break;
    case 'approve_and_publish':
      if (!entryId) {
        throw new KnowledgeValidationError('missing_entry_id', 'معرف العنصر مطلوب للاعتماد.');
      }
      entry = store.approveAndPublish(actor, entryId);
      break;
    case 'reject':
      if (!entryId) {
        throw new KnowledgeValidationError('missing_entry_id', 'معرف العنصر مطلوب للرفض.');
      }
      entry = store.rejectReview(
        actor,
        entryId,
        typeof rawBody.rejectionReason === 'string' ? rawBody.rejectionReason : ''
      );
      break;
    case 'withdraw':
      if (!entryId) {
        throw new KnowledgeValidationError('missing_entry_id', 'معرف العنصر مطلوب للسحب.');
      }
      entry = store.withdrawPublished(
        actor,
        entryId,
        typeof rawBody.reasonAr === 'string' ? rawBody.reasonAr : undefined
      );
      break;
    default:
      throw new KnowledgeValidationError('unknown_action', `العملية "${action}" غير مدعومة.`);
  }

  return {
    entry,
    auditLogs: store.listAuditLogs(),
  };
}

export function mapKnowledgeErrorToHttpResponse(err: unknown): {
  status: number;
  body: { error: string; messageAr: string };
} {
  if (
    err instanceof KnowledgeValidationError ||
    err instanceof KnowledgeAuthorizationError ||
    err instanceof KnowledgeTransitionError ||
    err instanceof KnowledgeNotFoundError ||
    err instanceof KnowledgeStorageError
  ) {
    const status =
      err instanceof KnowledgeAuthorizationError &&
      (err.code === 'missing_staff_session' || err.code === 'invalid_staff_session')
        ? 401
        : err.statusCode;
    return {
      status,
      body: {
        error: err.code,
        messageAr: err.message,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: 'internal_error',
      messageAr: 'حدث خطأ غير متوقع أثناء معالجة طلب قاعدة المعرفة.',
    },
  };
}

export type { KnowledgeCategory, KnowledgeStatus };

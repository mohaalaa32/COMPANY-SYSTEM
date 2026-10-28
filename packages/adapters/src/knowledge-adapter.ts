/**
 * Staff Knowledge Base & AI-Reply Feedback Store (0-D1c)
 *
 * Provides durable relational persistence via Node's built-in SQLite engine (`node:sqlite`),
 * mirroring the PostgreSQL Prisma models in `packages/db/prisma/schema.prisma`.
 *
 * Enforces:
 * 1. Categories: FAQ, OBJECTION_REPLY, PRODUCT_NOTE (linked to verified Karbala catalog productIds).
 * 2. Strict workflow: DRAFT -> PENDING_APPROVAL -> PUBLISHED, with reasoned REJECTED and WITHDRAWN.
 * 3. Server-side RBAC: Only SUPERVISOR can approve/publish, reject, or withdraw.
 * 4. Non-destructive revisioning: Editing a PUBLISHED entry creates/updates a pending revision
 *    without replacing the currently approved PUBLISHED snapshot until a supervisor approves it.
 * 5. Full audit trail (actor, role, action, timestamps, status transition, reason).
 * 6. AI-reply corrections logged as feedback linked to actual conversation/message IDs (never
 *    auto-published and never described as model weight training).
 * 7. Assistant retrieval strictly returns PUBLISHED snapshots only and enforces policy guardrails.
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { KARBALA_BRANCH_ID, MOCK_PRODUCTS } from './data/index';
import { normalizeArabicSearchText } from './sales-adapter';

export type StaffRole = 'STAFF' | 'SUPERVISOR';

export interface StaffActor {
  id: string;
  nameAr: string;
  role: StaffRole;
}

export type KnowledgeCategory = 'FAQ' | 'OBJECTION_REPLY' | 'PRODUCT_NOTE';

export type KnowledgeStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type KnowledgeRevisionStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

export interface KnowledgePendingRevision {
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

export interface KnowledgeEntryRecord {
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
  pendingRevision?: KnowledgePendingRevision;
}

export interface KnowledgeAuditLogEntry {
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

export interface AiReplyFeedbackRecord {
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

export interface PublishedKnowledgeItem {
  id: string;
  category: KnowledgeCategory;
  titleAr: string;
  contentAr: string;
  triggerKeywords: string[];
  productIds: string[];
  publishedVersion: number;
  publishedAt: string;
}

export interface KnowledgeMutationInput {
  category: KnowledgeCategory;
  titleAr: string;
  contentAr: string;
  triggerKeywords?: string[];
  productIds?: string[];
  /** When true on create or update, immediately submits the draft/revision to PENDING_APPROVAL. */
  submitForApproval?: boolean;
}

export interface RecordAiFeedbackInput {
  conversationId: string;
  messageId: string;
  originalAiText: string;
  correctedReplyAr: string;
  notesAr?: string;
  category?: KnowledgeCategory;
  productIds?: string[];
  /**
   * Optional: creates a DRAFT knowledge entry from this correction for supervisor review.
   * Never publishes automatically.
   */
  createDraftEntry?: boolean;
  draftTitleAr?: string;
  draftTriggerKeywords?: string[];
}

export interface AssistantKnowledgeQuery {
  query?: string;
  productIds?: string[];
  category?: KnowledgeCategory;
  limit?: number;
}

export interface IKnowledgeBaseReader {
  getPublishedForAssistant(params?: AssistantKnowledgeQuery): PublishedKnowledgeItem[];
}

// ============================================================================
// Typed Errors for HTTP / Service Layer Mapping
// ============================================================================

export class KnowledgeValidationError extends Error {
  public readonly code: string;
  public readonly statusCode = 400;

  constructor(code: string, messageAr: string) {
    super(messageAr);
    this.name = 'KnowledgeValidationError';
    this.code = code;
  }
}

export class KnowledgeAuthorizationError extends Error {
  public readonly code: string;
  public readonly statusCode = 403;

  constructor(code: string, messageAr: string) {
    super(messageAr);
    this.name = 'KnowledgeAuthorizationError';
    this.code = code;
  }
}

export class KnowledgeTransitionError extends Error {
  public readonly code: string;
  public readonly statusCode = 409;

  constructor(code: string, messageAr: string) {
    super(messageAr);
    this.name = 'KnowledgeTransitionError';
    this.code = code;
  }
}

export class KnowledgeNotFoundError extends Error {
  public readonly code = 'not_found';
  public readonly statusCode = 404;

  constructor(messageAr = 'العنصر المطلوب غير موجود في قاعدة المعرفة.') {
    super(messageAr);
    this.name = 'KnowledgeNotFoundError';
  }
}

export class KnowledgeStorageError extends Error {
  public readonly code = 'storage_failure';
  public readonly statusCode = 500;

  constructor(messageAr = 'تعذر حفظ التغييرات في قاعدة البيانات الدائمة. لم يتم تطبيق التعديل.') {
    super(messageAr);
    this.name = 'KnowledgeStorageError';
  }
}

// ============================================================================
// Validation & Policy Safety Guards
// ============================================================================

const VALID_CATEGORIES = new Set<KnowledgeCategory>([
  'FAQ',
  'OBJECTION_REPLY',
  'PRODUCT_NOTE',
]);

const KARBALA_PRODUCT_IDS = new Set<string>(
  MOCK_PRODUCTS.filter((p) => p.branches.some((b) => b.branchId === KARBALA_BRANCH_ID)).map(
    (p) => p.id
  )
);

const FORBIDDEN_POLICY_PATTERNS: ReadonlyArray<{
  code: string;
  pattern: RegExp;
  reasonAr: string;
}> = [
  {
    code: 'prompt_injection_override',
    pattern: /(?:تجاهل\s+التعليمات|تجاوز\s+النظام|ignore\s+(?:all\s+|previous\s+)?instructions|system\s+prompt)/i,
    reasonAr: 'لا يمكن إضافة محتوى يحاول تجاوز تعليمات النظام الأساسية.',
  },
  {
    code: 'human_identity_claim',
    pattern: /(?:قل\s+إنك\s+إنسان|أنت\s+موظف\s+بشري|لست\s+(?:برنامج|ذكاء\s+اصطناعي))/i,
    reasonAr: 'يمنع توجيه المساعد لادعاء الهوية البشرية.',
  },
  {
    code: 'unapproved_delivery_policy',
    pattern: /(?:توصيل\s+مجاني|التوصيل\s+مجاناً|رسوم\s+التوصيل\s*\d+|كلفة\s+التوصيل\s*\d+)/i,
    reasonAr: 'سياسة التوصيل غير معتمدة حالياً؛ لا يجوز إدخال رسوم توصيل أو وعود توصيل مجاني في قاعدة المعرفة.',
  },
  {
    code: 'unapproved_branch_reference',
    pattern: /(?:فرع\s+(?:المنصور|الكرادة|أربيل|اربيل|البصرة|النجف))/i,
    reasonAr: 'النطاق المعتمد هو فرع كربلاء فقط؛ لا يجوز إضافة فروع غير معتمدة.',
  },
  {
    code: 'unauthorized_price_or_discount_override',
    pattern: /(?:اعط(?:ه|ي)?\s+خصم\s+من\s+عندك|تجاهل\s+سعر\s+(?:الأداة|النظام)|أكد\s+الطلب\s+بدون\s+موافقة)/i,
    reasonAr: 'لا يجوز لمحتوى قاعدة المعرفة استبدال أدوات الأسعار والمخزون أو منح خصومات غير معتمدة.',
  },
];

export function validateKnowledgeContentSafety(titleAr: string, contentAr: string): {
  isSafe: boolean;
  code?: string;
  reasonAr?: string;
} {
  const combined = `${titleAr}\n${contentAr}`;
  for (const rule of FORBIDDEN_POLICY_PATTERNS) {
    if (rule.pattern.test(combined)) {
      return {
        isSafe: false,
        code: rule.code,
        reasonAr: rule.reasonAr,
      };
    }
  }
  return { isSafe: true };
}

export function validateAndNormalizeKnowledgeInput(input: KnowledgeMutationInput): {
  category: KnowledgeCategory;
  titleAr: string;
  contentAr: string;
  triggerKeywords: string[];
  productIds: string[];
  submitForApproval: boolean;
} {
  if (!input || !VALID_CATEGORIES.has(input.category)) {
    throw new KnowledgeValidationError(
      'invalid_category',
      'تصنيف المحتوى غير صالح. اختر: الإجابات الشائعة أو ردود الاعتراضات أو ملاحظات المنتجات.'
    );
  }

  const titleAr = typeof input.titleAr === 'string' ? input.titleAr.trim() : '';
  if (titleAr.length < 3 || titleAr.length > 160) {
    throw new KnowledgeValidationError(
      'invalid_title',
      'عنوان المعرفة يجب أن يكون بين 3 و160 حرفاً.'
    );
  }

  const contentAr = typeof input.contentAr === 'string' ? input.contentAr.trim() : '';
  if (contentAr.length < 5 || contentAr.length > 1500) {
    throw new KnowledgeValidationError(
      'invalid_content',
      'نص المعرفة يجب أن يكون بين 5 و1500 حرف.'
    );
  }

  const safety = validateKnowledgeContentSafety(titleAr, contentAr);
  if (!safety.isSafe) {
    throw new KnowledgeValidationError(
      safety.code ?? 'unsafe_policy_content',
      safety.reasonAr ?? 'المحتوى يخالف سياسات النظام المعتمدة.'
    );
  }

  const rawKeywords = Array.isArray(input.triggerKeywords) ? input.triggerKeywords : [];
  const triggerKeywords = Array.from(
    new Set(
      rawKeywords
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length <= 60)
    )
  ).slice(0, 15);

  const rawProductIds = Array.isArray(input.productIds) ? input.productIds : [];
  const productIds = Array.from(
    new Set(
      rawProductIds
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )
  );

  for (const pid of productIds) {
    if (!KARBALA_PRODUCT_IDS.has(pid)) {
      throw new KnowledgeValidationError(
        'invalid_product_id',
        `معرف المنتج "${pid}" غير موجود في كتالوج فرع كربلاء المعتمد.`
      );
    }
  }

  if (input.category === 'PRODUCT_NOTE' && productIds.length === 0) {
    throw new KnowledgeValidationError(
      'missing_product_id_for_note',
      'ملاحظات المنتجات تتطلب ربطها بمعرف منتج واحد على الأقل من كتالوج فرع كربلاء.'
    );
  }

  return {
    category: input.category,
    titleAr,
    contentAr,
    triggerKeywords,
    productIds,
    submitForApproval: Boolean(input.submitForApproval),
  };
}

function validateActor(actor: StaffActor | undefined | null): StaffActor {
  if (
    !actor ||
    typeof actor.id !== 'string' ||
    actor.id.trim().length === 0 ||
    typeof actor.nameAr !== 'string' ||
    actor.nameAr.trim().length === 0 ||
    (actor.role !== 'STAFF' && actor.role !== 'SUPERVISOR')
  ) {
    throw new KnowledgeAuthorizationError(
      'unauthenticated_actor',
      'جلسة الموظف غير صالحة أو غير مصادق عليها على الخادم.'
    );
  }
  return actor;
}

function requireSupervisor(actor: StaffActor, actionLabelAr: string): void {
  validateActor(actor);
  if (actor.role !== 'SUPERVISOR') {
    throw new KnowledgeAuthorizationError(
      'supervisor_role_required',
      `غير مخول: عملية "${actionLabelAr}" تتطلب صلاحية مشرف (SUPERVISOR) معتمدة من الخادم.`
    );
  }
}

// ============================================================================
// Durable SQLite Store Implementation (`SqliteKnowledgeStore`)
// ============================================================================

export interface SqliteKnowledgeStoreOptions {
  /** Path to the SQLite database file on disk. */
  dbPath?: string;
  /** Seed initial illustrative entries when creating a brand-new database file. */
  seedInitialData?: boolean;
  /** Test hook to simulate a write failure inside transactions. */
  simulateWriteFailure?: boolean;
}

export class SqliteKnowledgeStore implements IKnowledgeBaseReader {
  private readonly dbPath: string;
  private readonly db: DatabaseSync;
  private simulateWriteFailure: boolean;

  constructor(options: SqliteKnowledgeStoreOptions = {}) {
    this.dbPath =
      options.dbPath ??
      process.env.KB_SQLITE_PATH ??
      path.resolve(process.cwd(), '.data', 'tel-baghdad-kb.sqlite');
    this.simulateWriteFailure = Boolean(options.simulateWriteFailure);

    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initializeSchema();

    if (options.seedInitialData ?? true) {
      this.seedDefaultEntriesIfEmpty();
    }
  }

  public setSimulateWriteFailure(fail: boolean): void {
    this.simulateWriteFailure = fail;
  }

  public close(): void {
    this.db.close();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        title_ar TEXT NOT NULL,
        content_ar TEXT NOT NULL,
        trigger_keywords_json TEXT NOT NULL,
        product_ids_json TEXT NOT NULL,
        branch_id TEXT NOT NULL DEFAULT 'branch-karbala',
        published_version INTEGER NOT NULL DEFAULT 0,
        rejection_reason TEXT,
        created_by_id TEXT NOT NULL,
        created_by_name_ar TEXT NOT NULL,
        created_by_role TEXT NOT NULL,
        updated_by_id TEXT NOT NULL,
        updated_by_name_ar TEXT NOT NULL,
        updated_by_role TEXT NOT NULL,
        submitted_by_id TEXT,
        submitted_by_name_ar TEXT,
        submitted_at TEXT,
        reviewed_by_id TEXT,
        reviewed_by_name_ar TEXT,
        reviewed_at TEXT,
        published_at TEXT,
        withdrawn_by_id TEXT,
        withdrawn_by_name_ar TEXT,
        withdrawn_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_revisions (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        title_ar TEXT NOT NULL,
        content_ar TEXT NOT NULL,
        trigger_keywords_json TEXT NOT NULL,
        product_ids_json TEXT NOT NULL,
        rejection_reason TEXT,
        created_by_id TEXT NOT NULL,
        created_by_name_ar TEXT NOT NULL,
        created_by_role TEXT NOT NULL,
        updated_by_id TEXT NOT NULL,
        updated_by_name_ar TEXT NOT NULL,
        updated_by_role TEXT NOT NULL,
        submitted_by_id TEXT,
        submitted_by_name_ar TEXT,
        submitted_at TEXT,
        reviewed_by_id TEXT,
        reviewed_by_name_ar TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS knowledge_audit_logs (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name_ar TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        summary_ar TEXT NOT NULL,
        reason_ar TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ai_reply_feedbacks (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        original_ai_text TEXT NOT NULL,
        corrected_reply_ar TEXT NOT NULL,
        notes_ar TEXT,
        category TEXT,
        product_ids_json TEXT NOT NULL,
        linked_knowledge_entry_id TEXT,
        created_by_id TEXT NOT NULL,
        created_by_name_ar TEXT NOT NULL,
        created_by_role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (linked_knowledge_entry_id) REFERENCES knowledge_entries(id) ON DELETE SET NULL
      );
    `);
  }

  private runInTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      if (this.simulateWriteFailure) {
        throw new KnowledgeStorageError();
      }
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback error if transaction was already closed
      }
      throw err;
    }
  }

  private seedDefaultEntriesIfEmpty(): void {
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM knowledge_entries')
      .get() as { cnt: number };
    if (countRow.cnt > 0) return;

    const now = '2026-10-28T09:00:00.000Z';
    const supervisor: StaffActor = {
      id: 'supervisor-karbala-1',
      nameAr: 'أحمد الكربلائي (مشرف الفرع)',
      role: 'SUPERVISOR',
    };
    const staff: StaffActor = {
      id: 'staff-karbala-1',
      nameAr: 'زهراء العلي (موظفة مبيعات)',
      role: 'STAFF',
    };

    this.runInTransaction(() => {
      // 1. Published FAQ
      const faqId = 'kb-faq-warranty-check';
      this.db
        .prepare(
          `INSERT INTO knowledge_entries (
            id, category, status, title_ar, content_ar, trigger_keywords_json, product_ids_json,
            branch_id, published_version, created_by_id, created_by_name_ar, created_by_role,
            updated_by_id, updated_by_name_ar, updated_by_role, submitted_by_id, submitted_by_name_ar,
            submitted_at, reviewed_by_id, reviewed_by_name_ar, reviewed_at, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          faqId,
          'FAQ',
          'PUBLISHED',
          'آلية التحقق من مدة الضمان بفرع كربلاء',
          'تُقرأ مدة الضمان بالأشهر من مواصفات المنتج في الكتالوج الرسمي لفرع كربلاء، ويتم تثبيتها في وصل الاستلام عند مراجعة موظف المبيعات.',
          JSON.stringify(['ضمان', 'كفالة', 'اشهر الضمان']),
          JSON.stringify([]),
          KARBALA_BRANCH_ID,
          1,
          staff.id,
          staff.nameAr,
          staff.role,
          supervisor.id,
          supervisor.nameAr,
          supervisor.role,
          staff.id,
          staff.nameAr,
          now,
          supervisor.id,
          supervisor.nameAr,
          now,
          now,
          now,
          now
        );
      this.insertAuditLog({
        entryId: faqId,
        action: 'APPROVED_AND_PUBLISHED',
        actor: supervisor,
        fromStatus: 'PENDING_APPROVAL',
        toStatus: 'PUBLISHED',
        summaryAr: 'اعتماد ونشر إرشاد التحقق من الضمان لفرع كربلاء (الإصدار 1).',
        createdAt: now,
      });

      // 2. Published Product Note for Galaxy A55
      const noteId = 'kb-note-a55-charger';
      this.db
        .prepare(
          `INSERT INTO knowledge_entries (
            id, category, status, title_ar, content_ar, trigger_keywords_json, product_ids_json,
            branch_id, published_version, created_by_id, created_by_name_ar, created_by_role,
            updated_by_id, updated_by_name_ar, updated_by_role, submitted_by_id, submitted_by_name_ar,
            submitted_at, reviewed_by_id, reviewed_by_name_ar, reviewed_at, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          noteId,
          'PRODUCT_NOTE',
          'PUBLISHED',
          'ملاحظة محتويات علبة Galaxy A55 5G والشاحن المتوافق',
          'علبة جهاز Samsung Galaxy A55 5G تحتوي على كيبل USB-C فقط بدون رأس شاحن؛ عند سؤال العميل يُقترح رأس شاحن سامسونج 25 واط من الكتالوج عبر أداة البحث.',
          JSON.stringify(['A55', 'شاحن', 'علبة', 'ملحقات']),
          JSON.stringify(['prod-a55-256', 'prod-acc-sam-25w']),
          KARBALA_BRANCH_ID,
          1,
          staff.id,
          staff.nameAr,
          staff.role,
          supervisor.id,
          supervisor.nameAr,
          supervisor.role,
          staff.id,
          staff.nameAr,
          now,
          supervisor.id,
          supervisor.nameAr,
          now,
          now,
          now,
          now
        );
      this.insertAuditLog({
        entryId: noteId,
        action: 'APPROVED_AND_PUBLISHED',
        actor: supervisor,
        fromStatus: 'PENDING_APPROVAL',
        toStatus: 'PUBLISHED',
        summaryAr: 'اعتماد ونشر ملاحظة محتويات علبة Galaxy A55 5G (الإصدار 1).',
        createdAt: now,
      });

      // 3. Pending Approval Objection Reply
      const objId = 'kb-obj-price-comparison';
      this.db
        .prepare(
          `INSERT INTO knowledge_entries (
            id, category, status, title_ar, content_ar, trigger_keywords_json, product_ids_json,
            branch_id, published_version, created_by_id, created_by_name_ar, created_by_role,
            updated_by_id, updated_by_name_ar, updated_by_role, submitted_by_id, submitted_by_name_ar,
            submitted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          objId,
          'OBJECTION_REPLY',
          'PENDING_APPROVAL',
          'الرد على اعتراض: السعر أعلى من الميزانية المتوقعة',
          'نوضح للعميل بهدوء الفروقات في المعالج والبطارية والضمان المثبت بالكتالوج، ونعرض بديلاً أرخص من نتائج أداة البحث ضمن ميزانيته دون وعد بأي خصم غير معتمد.',
          JSON.stringify(['غالي', 'فوق الميزانية', 'سعره عالي']),
          JSON.stringify(['prod-rn13pro-256', 'prod-inf-n40-256']),
          KARBALA_BRANCH_ID,
          0,
          staff.id,
          staff.nameAr,
          staff.role,
          staff.id,
          staff.nameAr,
          staff.role,
          staff.id,
          staff.nameAr,
          now,
          now,
          now
        );
      this.insertAuditLog({
        entryId: objId,
        action: 'SUBMITTED_FOR_APPROVAL',
        actor: staff,
        fromStatus: 'DRAFT',
        toStatus: 'PENDING_APPROVAL',
        summaryAr: 'إرسال مسودة رد اعتراض السعر لمراجعة المشرف.',
        createdAt: now,
      });
    });
  }

  private insertAuditLog(params: {
    entryId: string;
    action: string;
    actor: StaffActor;
    fromStatus?: string;
    toStatus?: string;
    summaryAr: string;
    reasonAr?: string;
    createdAt?: string;
  }): void {
    const createdAt = params.createdAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO knowledge_audit_logs (
          id, entry_id, action, actor_id, actor_name_ar, actor_role,
          from_status, to_status, summary_ar, reason_ar, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `audit-${randomUUID()}`,
        params.entryId,
        params.action,
        params.actor.id,
        params.actor.nameAr,
        params.actor.role,
        params.fromStatus ?? null,
        params.toStatus ?? null,
        params.summaryAr,
        params.reasonAr ?? null,
        createdAt
      );
  }

  private mapRevisionRow(row: Record<string, unknown>): KnowledgePendingRevision {
    return {
      id: String(row.id),
      entryId: String(row.entry_id),
      status: String(row.status) as 'DRAFT' | 'PENDING_APPROVAL' | 'REJECTED',
      titleAr: String(row.title_ar),
      contentAr: String(row.content_ar),
      triggerKeywords: JSON.parse(String(row.trigger_keywords_json)) as string[],
      productIds: JSON.parse(String(row.product_ids_json)) as string[],
      ...(row.rejection_reason ? { rejectionReason: String(row.rejection_reason) } : {}),
      createdById: String(row.created_by_id),
      createdByNameAr: String(row.created_by_name_ar),
      createdByRole: String(row.created_by_role) as StaffRole,
      updatedById: String(row.updated_by_id),
      updatedByNameAr: String(row.updated_by_name_ar),
      updatedByRole: String(row.updated_by_role) as StaffRole,
      ...(row.submitted_by_id ? { submittedById: String(row.submitted_by_id) } : {}),
      ...(row.submitted_by_name_ar ? { submittedByNameAr: String(row.submitted_by_name_ar) } : {}),
      ...(row.submitted_at ? { submittedAt: String(row.submitted_at) } : {}),
      ...(row.reviewed_by_id ? { reviewedById: String(row.reviewed_by_id) } : {}),
      ...(row.reviewed_by_name_ar ? { reviewedByNameAr: String(row.reviewed_by_name_ar) } : {}),
      ...(row.reviewed_at ? { reviewedAt: String(row.reviewed_at) } : {}),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapEntryRow(
    row: Record<string, unknown>,
    pendingRevision?: KnowledgePendingRevision
  ): KnowledgeEntryRecord {
    return {
      id: String(row.id),
      category: String(row.category) as KnowledgeCategory,
      status: String(row.status) as KnowledgeStatus,
      titleAr: String(row.title_ar),
      contentAr: String(row.content_ar),
      triggerKeywords: JSON.parse(String(row.trigger_keywords_json)) as string[],
      productIds: JSON.parse(String(row.product_ids_json)) as string[],
      branchId: String(row.branch_id),
      publishedVersion: Number(row.published_version),
      ...(row.rejection_reason ? { rejectionReason: String(row.rejection_reason) } : {}),
      createdById: String(row.created_by_id),
      createdByNameAr: String(row.created_by_name_ar),
      createdByRole: String(row.created_by_role) as StaffRole,
      updatedById: String(row.updated_by_id),
      updatedByNameAr: String(row.updated_by_name_ar),
      updatedByRole: String(row.updated_by_role) as StaffRole,
      ...(row.submitted_by_id ? { submittedById: String(row.submitted_by_id) } : {}),
      ...(row.submitted_by_name_ar ? { submittedByNameAr: String(row.submitted_by_name_ar) } : {}),
      ...(row.submitted_at ? { submittedAt: String(row.submitted_at) } : {}),
      ...(row.reviewed_by_id ? { reviewedById: String(row.reviewed_by_id) } : {}),
      ...(row.reviewed_by_name_ar ? { reviewedByNameAr: String(row.reviewed_by_name_ar) } : {}),
      ...(row.reviewed_at ? { reviewedAt: String(row.reviewed_at) } : {}),
      ...(row.published_at ? { publishedAt: String(row.published_at) } : {}),
      ...(row.withdrawn_by_id ? { withdrawnById: String(row.withdrawn_by_id) } : {}),
      ...(row.withdrawn_by_name_ar ? { withdrawnByNameAr: String(row.withdrawn_by_name_ar) } : {}),
      ...(row.withdrawn_at ? { withdrawnAt: String(row.withdrawn_at) } : {}),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      ...(pendingRevision ? { pendingRevision } : {}),
    };
  }

  public getEntryById(entryId: string): KnowledgeEntryRecord | null {
    const row = this.db
      .prepare('SELECT * FROM knowledge_entries WHERE id = ?')
      .get(entryId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const revRow = this.db
      .prepare(
        "SELECT * FROM knowledge_revisions WHERE entry_id = ? AND status IN ('DRAFT', 'PENDING_APPROVAL', 'REJECTED')"
      )
      .get(entryId) as Record<string, unknown> | undefined;

    return this.mapEntryRow(row, revRow ? this.mapRevisionRow(revRow) : undefined);
  }

  public listEntries(filters?: {
    category?: KnowledgeCategory;
    status?: KnowledgeStatus;
  }): KnowledgeEntryRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM knowledge_entries ORDER BY updated_at DESC, created_at DESC')
      .all() as Array<Record<string, unknown>>;

    const revRows = this.db
      .prepare(
        "SELECT * FROM knowledge_revisions WHERE status IN ('DRAFT', 'PENDING_APPROVAL', 'REJECTED')"
      )
      .all() as Array<Record<string, unknown>>;

    const revByEntryId = new Map<string, KnowledgePendingRevision>();
    for (const r of revRows) {
      const mapped = this.mapRevisionRow(r);
      revByEntryId.set(mapped.entryId, mapped);
    }

    let entries = rows.map((r) => this.mapEntryRow(r, revByEntryId.get(String(r.id))));
    if (filters?.category) {
      entries = entries.filter((e) => e.category === filters.category);
    }
    if (filters?.status) {
      entries = entries.filter(
        (e) =>
          e.status === filters.status ||
          (filters.status === 'PENDING_APPROVAL' &&
            e.pendingRevision?.status === 'PENDING_APPROVAL')
      );
    }
    return entries;
  }

  public listAuditLogs(entryId?: string): KnowledgeAuditLogEntry[] {
    const rows = (
      entryId
        ? this.db
            .prepare(
              'SELECT * FROM knowledge_audit_logs WHERE entry_id = ? ORDER BY created_at DESC, rowid DESC'
            )
            .all(entryId)
        : this.db
            .prepare('SELECT * FROM knowledge_audit_logs ORDER BY created_at DESC, rowid DESC LIMIT 100')
            .all()
    ) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      entryId: String(r.entry_id),
      action: String(r.action),
      actorId: String(r.actor_id),
      actorNameAr: String(r.actor_name_ar),
      actorRole: String(r.actor_role) as StaffRole,
      ...(r.from_status ? { fromStatus: String(r.from_status) } : {}),
      ...(r.to_status ? { toStatus: String(r.to_status) } : {}),
      summaryAr: String(r.summary_ar),
      ...(r.reason_ar ? { reasonAr: String(r.reason_ar) } : {}),
      createdAt: String(r.created_at),
    }));
  }

  public listFeedback(): AiReplyFeedbackRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM ai_reply_feedbacks ORDER BY created_at DESC, rowid DESC')
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      conversationId: String(r.conversation_id),
      messageId: String(r.message_id),
      originalAiText: String(r.original_ai_text),
      correctedReplyAr: String(r.corrected_reply_ar),
      ...(r.notes_ar ? { notesAr: String(r.notes_ar) } : {}),
      ...(r.category ? { category: String(r.category) as KnowledgeCategory } : {}),
      productIds: JSON.parse(String(r.product_ids_json)) as string[],
      ...(r.linked_knowledge_entry_id
        ? { linkedKnowledgeEntryId: String(r.linked_knowledge_entry_id) }
        : {}),
      createdById: String(r.created_by_id),
      createdByNameAr: String(r.created_by_name_ar),
      createdByRole: String(r.created_by_role) as StaffRole,
      createdAt: String(r.created_at),
    }));
  }

  /**
   * Creates a new Knowledge Base entry.
   * Starts in DRAFT (or PENDING_APPROVAL if `submitForApproval: true`).
   * Never creates a PUBLISHED entry directly without going through supervisor approval.
   */
  public createEntry(actor: StaffActor, rawInput: KnowledgeMutationInput): KnowledgeEntryRecord {
    const validActor = validateActor(actor);
    const input = validateAndNormalizeKnowledgeInput(rawInput);
    const now = new Date().toISOString();
    const id = `kb-${randomUUID()}`;
    const initialStatus: KnowledgeStatus = input.submitForApproval ? 'PENDING_APPROVAL' : 'DRAFT';

    return this.runInTransaction(() => {
      this.db
        .prepare(
          `INSERT INTO knowledge_entries (
            id, category, status, title_ar, content_ar, trigger_keywords_json, product_ids_json,
            branch_id, published_version, created_by_id, created_by_name_ar, created_by_role,
            updated_by_id, updated_by_name_ar, updated_by_role, submitted_by_id, submitted_by_name_ar,
            submitted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.category,
          initialStatus,
          input.titleAr,
          input.contentAr,
          JSON.stringify(input.triggerKeywords),
          JSON.stringify(input.productIds),
          KARBALA_BRANCH_ID,
          validActor.id,
          validActor.nameAr,
          validActor.role,
          validActor.id,
          validActor.nameAr,
          validActor.role,
          input.submitForApproval ? validActor.id : null,
          input.submitForApproval ? validActor.nameAr : null,
          input.submitForApproval ? now : null,
          now,
          now
        );

      this.insertAuditLog({
        entryId: id,
        action: 'CREATED_DRAFT',
        actor: validActor,
        toStatus: 'DRAFT',
        summaryAr: `إنشاء مسودة معرفة جديدة: «${input.titleAr}».`,
        createdAt: now,
      });

      if (input.submitForApproval) {
        this.insertAuditLog({
          entryId: id,
          action: 'SUBMITTED_FOR_APPROVAL',
          actor: validActor,
          fromStatus: 'DRAFT',
          toStatus: 'PENDING_APPROVAL',
          summaryAr: `إرسال المسودة «${input.titleAr}» لمراجعة المشرف.`,
          createdAt: now,
        });
      }

      const created = this.getEntryById(id);
      if (!created) throw new KnowledgeStorageError();
      return created;
    });
  }

  /**
   * Updates an existing Knowledge Base entry:
   * - If the entry is DRAFT, REJECTED, or WITHDRAWN: updates the entry draft in-place (and transitions
   *   to DRAFT or PENDING_APPROVAL if `submitForApproval` is true).
   * - If the entry is PUBLISHED: preserves the live PUBLISHED snapshot untouched and creates/updates
   *   a `pendingRevision` record in `knowledge_revisions` for supervisor review!
   */
  public updateEntry(
    actor: StaffActor,
    entryId: string,
    rawInput: KnowledgeMutationInput
  ): KnowledgeEntryRecord {
    const validActor = validateActor(actor);
    const existing = this.getEntryById(entryId);
    if (!existing) {
      throw new KnowledgeNotFoundError();
    }

    const input = validateAndNormalizeKnowledgeInput(rawInput);
    const now = new Date().toISOString();

    return this.runInTransaction(() => {
      if (existing.status === 'PUBLISHED') {
        const revStatus: 'DRAFT' | 'PENDING_APPROVAL' = input.submitForApproval
          ? 'PENDING_APPROVAL'
          : 'DRAFT';
        const revId = existing.pendingRevision?.id ?? `kbrev-${randomUUID()}`;

        this.db
          .prepare(
            `INSERT INTO knowledge_revisions (
              id, entry_id, status, title_ar, content_ar, trigger_keywords_json, product_ids_json,
              rejection_reason, created_by_id, created_by_name_ar, created_by_role,
              updated_by_id, updated_by_name_ar, updated_by_role,
              submitted_by_id, submitted_by_name_ar, submitted_at,
              reviewed_by_id, reviewed_by_name_ar, reviewed_at,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
            ON CONFLICT(entry_id) DO UPDATE SET
              status = excluded.status,
              title_ar = excluded.title_ar,
              content_ar = excluded.content_ar,
              trigger_keywords_json = excluded.trigger_keywords_json,
              product_ids_json = excluded.product_ids_json,
              rejection_reason = NULL,
              updated_by_id = excluded.updated_by_id,
              updated_by_name_ar = excluded.updated_by_name_ar,
              updated_by_role = excluded.updated_by_role,
              submitted_by_id = excluded.submitted_by_id,
              submitted_by_name_ar = excluded.submitted_by_name_ar,
              submitted_at = excluded.submitted_at,
              reviewed_by_id = NULL,
              reviewed_by_name_ar = NULL,
              reviewed_at = NULL,
              updated_at = excluded.updated_at`
          )
          .run(
            revId,
            entryId,
            revStatus,
            input.titleAr,
            input.contentAr,
            JSON.stringify(input.triggerKeywords),
            JSON.stringify(input.productIds),
            existing.pendingRevision?.createdById ?? validActor.id,
            existing.pendingRevision?.createdByNameAr ?? validActor.nameAr,
            existing.pendingRevision?.createdByRole ?? validActor.role,
            validActor.id,
            validActor.nameAr,
            validActor.role,
            input.submitForApproval ? validActor.id : null,
            input.submitForApproval ? validActor.nameAr : null,
            input.submitForApproval ? now : null,
            existing.pendingRevision?.createdAt ?? now,
            now
          );

        this.insertAuditLog({
          entryId,
          action: input.submitForApproval
            ? 'SUBMITTED_REVISION_FOR_APPROVAL'
            : 'CREATED_PENDING_REVISION',
          actor: validActor,
          fromStatus: 'PUBLISHED',
          toStatus: `PUBLISHED (${revStatus})`,
          summaryAr: input.submitForApproval
            ? `تعديل عنصر منشور وإرسال النسخة الجديدة للمراجعة مع بقاء النسخة المعتمدة (الإصدار ${existing.publishedVersion}) فعّالة.`
            : `حفظ مسودة تعديل لعنصر منشور مع بقاء النسخة المعتمدة (الإصدار ${existing.publishedVersion}) فعّالة.`,
          createdAt: now,
        });

        const updated = this.getEntryById(entryId);
        if (!updated) throw new KnowledgeStorageError();
        return updated;
      }

      if (existing.status === 'PENDING_APPROVAL') {
        throw new KnowledgeTransitionError(
          'cannot_edit_pending_approval',
          'العنصر قيد مراجعة المشرف حالياً. لا يمكن تعديله مباشرة قبل قرار المراجعة.'
        );
      }

      const nextStatus: KnowledgeStatus = input.submitForApproval ? 'PENDING_APPROVAL' : 'DRAFT';
      this.db
        .prepare(
          `UPDATE knowledge_entries SET
            category = ?,
            status = ?,
            title_ar = ?,
            content_ar = ?,
            trigger_keywords_json = ?,
            product_ids_json = ?,
            rejection_reason = NULL,
            updated_by_id = ?,
            updated_by_name_ar = ?,
            updated_by_role = ?,
            submitted_by_id = ?,
            submitted_by_name_ar = ?,
            submitted_at = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(
          input.category,
          nextStatus,
          input.titleAr,
          input.contentAr,
          JSON.stringify(input.triggerKeywords),
          JSON.stringify(input.productIds),
          validActor.id,
          validActor.nameAr,
          validActor.role,
          input.submitForApproval ? validActor.id : existing.submittedById ?? null,
          input.submitForApproval ? validActor.nameAr : existing.submittedByNameAr ?? null,
          input.submitForApproval ? now : existing.submittedAt ?? null,
          now,
          entryId
        );

      this.insertAuditLog({
        entryId,
        action: input.submitForApproval ? 'SUBMITTED_FOR_APPROVAL' : 'UPDATED_DRAFT',
        actor: validActor,
        fromStatus: existing.status,
        toStatus: nextStatus,
        summaryAr: input.submitForApproval
          ? `تحديث المحتوى وإرساله لمراجعة المشرف: «${input.titleAr}».`
          : `تحديث مسودة المعرفة: «${input.titleAr}».`,
        createdAt: now,
      });

      const updated = this.getEntryById(entryId);
      if (!updated) throw new KnowledgeStorageError();
      return updated;
    });
  }

  /**
   * Submits a DRAFT / REJECTED / WITHDRAWN entry (or a DRAFT / REJECTED revision on a PUBLISHED entry)
   * for supervisor approval.
   */
  public submitForApproval(actor: StaffActor, entryId: string): KnowledgeEntryRecord {
    const validActor = validateActor(actor);
    const existing = this.getEntryById(entryId);
    if (!existing) {
      throw new KnowledgeNotFoundError();
    }

    const now = new Date().toISOString();

    return this.runInTransaction(() => {
      if (existing.status === 'PUBLISHED') {
        if (
          !existing.pendingRevision ||
          (existing.pendingRevision.status !== 'DRAFT' &&
            existing.pendingRevision.status !== 'REJECTED')
        ) {
          throw new KnowledgeTransitionError(
            'no_draft_revision_to_submit',
            'لا توجد نسخة تعديل مسودة لهذا العنصر المنشور لإرسالها للمراجعة.'
          );
        }

        this.db
          .prepare(
            `UPDATE knowledge_revisions SET
              status = 'PENDING_APPROVAL',
              rejection_reason = NULL,
              submitted_by_id = ?,
              submitted_by_name_ar = ?,
              submitted_at = ?,
              updated_by_id = ?,
              updated_by_name_ar = ?,
              updated_by_role = ?,
              updated_at = ?
            WHERE entry_id = ?`
          )
          .run(
            validActor.id,
            validActor.nameAr,
            now,
            validActor.id,
            validActor.nameAr,
            validActor.role,
            now,
            entryId
          );

        this.insertAuditLog({
          entryId,
          action: 'SUBMITTED_REVISION_FOR_APPROVAL',
          actor: validActor,
          fromStatus: `PUBLISHED (${existing.pendingRevision.status})`,
          toStatus: 'PUBLISHED (PENDING_APPROVAL)',
          summaryAr: `إرسال نسخة التعديل المقترحة لمراجعة المشرف مع بقاء الإصدار المنشور (${existing.publishedVersion}) فعّالاً.`,
          createdAt: now,
        });

        const updated = this.getEntryById(entryId);
        if (!updated) throw new KnowledgeStorageError();
        return updated;
      }

      if (
        existing.status !== 'DRAFT' &&
        existing.status !== 'REJECTED' &&
        existing.status !== 'WITHDRAWN'
      ) {
        throw new KnowledgeTransitionError(
          'invalid_submit_transition',
          `لا يمكن إرسال العنصر للمراجعة من الحالة الحالية (${existing.status}).`
        );
      }

      this.db
        .prepare(
          `UPDATE knowledge_entries SET
            status = 'PENDING_APPROVAL',
            rejection_reason = NULL,
            submitted_by_id = ?,
            submitted_by_name_ar = ?,
            submitted_at = ?,
            updated_by_id = ?,
            updated_by_name_ar = ?,
            updated_by_role = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(
          validActor.id,
          validActor.nameAr,
          now,
          validActor.id,
          validActor.nameAr,
          validActor.role,
          now,
          entryId
        );

      this.insertAuditLog({
        entryId,
        action: 'SUBMITTED_FOR_APPROVAL',
        actor: validActor,
        fromStatus: existing.status,
        toStatus: 'PENDING_APPROVAL',
        summaryAr: `إرسال «${existing.titleAr}» لمراجعة المشرف.`,
        createdAt: now,
      });

      const updated = this.getEntryById(entryId);
      if (!updated) throw new KnowledgeStorageError();
      return updated;
    });
  }

  /**
   * Supervisor-only: Approves and publishes an entry in `PENDING_APPROVAL` or promotes a
   * `PENDING_APPROVAL` revision onto an already `PUBLISHED` entry.
   */
  public approveAndPublish(actor: StaffActor, entryId: string): KnowledgeEntryRecord {
    requireSupervisor(actor, 'اعتماد ونشر المعرفة');
    const existing = this.getEntryById(entryId);
    if (!existing) {
      throw new KnowledgeNotFoundError();
    }

    const now = new Date().toISOString();

    return this.runInTransaction(() => {
      // Case 1: Promoting a pending revision on an already PUBLISHED entry
      if (existing.status === 'PUBLISHED' && existing.pendingRevision) {
        if (existing.pendingRevision.status !== 'PENDING_APPROVAL') {
          throw new KnowledgeTransitionError(
            'revision_not_pending_approval',
            'يجب إرسال نسخة التعديل إلى حالة مراجعة المشرف (PENDING_APPROVAL) قبل اعتمادها.'
          );
        }

        const safety = validateKnowledgeContentSafety(
          existing.pendingRevision.titleAr,
          existing.pendingRevision.contentAr
        );
        if (!safety.isSafe) {
          throw new KnowledgeValidationError(
            safety.code ?? 'unsafe_policy_content',
            safety.reasonAr ?? 'المحتوى يخالف سياسات النظام.'
          );
        }

        const nextVersion = existing.publishedVersion + 1;
        this.db
          .prepare(
            `UPDATE knowledge_entries SET
              title_ar = ?,
              content_ar = ?,
              trigger_keywords_json = ?,
              product_ids_json = ?,
              published_version = ?,
              rejection_reason = NULL,
              reviewed_by_id = ?,
              reviewed_by_name_ar = ?,
              reviewed_at = ?,
              published_at = ?,
              updated_by_id = ?,
              updated_by_name_ar = ?,
              updated_by_role = ?,
              updated_at = ?
            WHERE id = ?`
          )
          .run(
            existing.pendingRevision.titleAr,
            existing.pendingRevision.contentAr,
            JSON.stringify(existing.pendingRevision.triggerKeywords),
            JSON.stringify(existing.pendingRevision.productIds),
            nextVersion,
            actor.id,
            actor.nameAr,
            now,
            now,
            actor.id,
            actor.nameAr,
            actor.role,
            now,
            entryId
          );

        this.db.prepare('DELETE FROM knowledge_revisions WHERE entry_id = ?').run(entryId);

        this.insertAuditLog({
          entryId,
          action: 'APPROVED_REVISION_AND_PUBLISHED',
          actor,
          fromStatus: 'PUBLISHED (PENDING_APPROVAL)',
          toStatus: 'PUBLISHED',
          summaryAr: `اعتماد المشرف للتعديل الجديد وترقية العنصر إلى الإصدار ${nextVersion}.`,
          createdAt: now,
        });

        const updated = this.getEntryById(entryId);
        if (!updated) throw new KnowledgeStorageError();
        return updated;
      }

      // Case 2: Standard PENDING_APPROVAL -> PUBLISHED
      if (existing.status !== 'PENDING_APPROVAL') {
        throw new KnowledgeTransitionError(
          'must_be_pending_approval_to_publish',
          `لا يمكن اعتماد ونشر العنصر مباشرة من الحالة (${existing.status})؛ يجب أن يمر بحالة مراجعة المشرف أولاً.`
        );
      }

      const safety = validateKnowledgeContentSafety(existing.titleAr, existing.contentAr);
      if (!safety.isSafe) {
        throw new KnowledgeValidationError(
          safety.code ?? 'unsafe_policy_content',
          safety.reasonAr ?? 'المحتوى يخالف سياسات النظام.'
        );
      }

      const nextVersion = existing.publishedVersion + 1;
      this.db
        .prepare(
          `UPDATE knowledge_entries SET
            status = 'PUBLISHED',
            published_version = ?,
            rejection_reason = NULL,
            reviewed_by_id = ?,
            reviewed_by_name_ar = ?,
            reviewed_at = ?,
            published_at = ?,
            updated_by_id = ?,
            updated_by_name_ar = ?,
            updated_by_role = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(
          nextVersion,
          actor.id,
          actor.nameAr,
          now,
          now,
          actor.id,
          actor.nameAr,
          actor.role,
          now,
          entryId
        );

      this.insertAuditLog({
        entryId,
        action: 'APPROVED_AND_PUBLISHED',
        actor,
        fromStatus: 'PENDING_APPROVAL',
        toStatus: 'PUBLISHED',
        summaryAr: `اعتماد المشرف ونشر «${existing.titleAr}» (الإصدار ${nextVersion}).`,
        createdAt: now,
      });

      const updated = this.getEntryById(entryId);
      if (!updated) throw new KnowledgeStorageError();
      return updated;
    });
  }

  /**
   * Supervisor-only: Rejects an entry or pending revision in `PENDING_APPROVAL` with a mandatory reason.
   */
  public rejectReview(
    actor: StaffActor,
    entryId: string,
    rawReasonAr: string
  ): KnowledgeEntryRecord {
    requireSupervisor(actor, 'رفض مراجعة المعرفة');
    const reasonAr = typeof rawReasonAr === 'string' ? rawReasonAr.trim() : '';
    if (reasonAr.length < 3 || reasonAr.length > 500) {
      throw new KnowledgeValidationError(
        'missing_rejection_reason',
        'يرجى كتابة سبب واضح للرفض (3 أحرف على الأقل).'
      );
    }

    const existing = this.getEntryById(entryId);
    if (!existing) {
      throw new KnowledgeNotFoundError();
    }

    const now = new Date().toISOString();

    return this.runInTransaction(() => {
      if (existing.status === 'PUBLISHED' && existing.pendingRevision) {
        if (existing.pendingRevision.status !== 'PENDING_APPROVAL') {
          throw new KnowledgeTransitionError(
            'revision_not_pending_approval',
            'نسخة التعديل ليست في حالة مراجعة المشرف حالياً.'
          );
        }

        this.db
          .prepare(
            `UPDATE knowledge_revisions SET
              status = 'REJECTED',
              rejection_reason = ?,
              reviewed_by_id = ?,
              reviewed_by_name_ar = ?,
              reviewed_at = ?,
              updated_at = ?
            WHERE entry_id = ?`
          )
          .run(reasonAr, actor.id, actor.nameAr, now, now, entryId);

        this.insertAuditLog({
          entryId,
          action: 'REJECTED_REVISION',
          actor,
          fromStatus: 'PUBLISHED (PENDING_APPROVAL)',
          toStatus: 'PUBLISHED (REJECTED)',
          summaryAr: `رفض المشرف لنسخة التعديل المقترحة مع بقاء الإصدار المنشور (${existing.publishedVersion}) فعّالاً.`,
          reasonAr,
          createdAt: now,
        });

        const updated = this.getEntryById(entryId);
        if (!updated) throw new KnowledgeStorageError();
        return updated;
      }

      if (existing.status !== 'PENDING_APPROVAL') {
        throw new KnowledgeTransitionError(
          'must_be_pending_approval_to_reject',
          `لا يمكن رفض العنصر لأنه ليس في حالة مراجعة المشرف (الحالة الحالية: ${existing.status}).`
        );
      }

      this.db
        .prepare(
          `UPDATE knowledge_entries SET
            status = 'REJECTED',
            rejection_reason = ?,
            reviewed_by_id = ?,
            reviewed_by_name_ar = ?,
            reviewed_at = ?,
            updated_by_id = ?,
            updated_by_name_ar = ?,
            updated_by_role = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(
          reasonAr,
          actor.id,
          actor.nameAr,
          now,
          actor.id,
          actor.nameAr,
          actor.role,
          now,
          entryId
        );

      this.insertAuditLog({
        entryId,
        action: 'REJECTED',
        actor,
        fromStatus: 'PENDING_APPROVAL',
        toStatus: 'REJECTED',
        summaryAr: `رفض المشرف لنشر «${existing.titleAr}».`,
        reasonAr,
        createdAt: now,
      });

      const updated = this.getEntryById(entryId);
      if (!updated) throw new KnowledgeStorageError();
      return updated;
    });
  }

  /**
   * Supervisor-only: Withdraws a PUBLISHED entry so the assistant immediately stops retrieving it.
   */
  public withdrawPublished(
    actor: StaffActor,
    entryId: string,
    rawReasonAr?: string
  ): KnowledgeEntryRecord {
    requireSupervisor(actor, 'سحب المحتوى المنشور');
    const existing = this.getEntryById(entryId);
    if (!existing) {
      throw new KnowledgeNotFoundError();
    }

    if (existing.status !== 'PUBLISHED') {
      throw new KnowledgeTransitionError(
        'must_be_published_to_withdraw',
        `لا يمكن سحب العنصر لأنه غير منشور حالياً (الحالة الحالية: ${existing.status}).`
      );
    }

    const reasonAr =
      typeof rawReasonAr === 'string' && rawReasonAr.trim().length > 0
        ? rawReasonAr.trim()
        : 'سحب من النشر بقرار المشرف';
    const now = new Date().toISOString();

    return this.runInTransaction(() => {
      this.db
        .prepare(
          `UPDATE knowledge_entries SET
            status = 'WITHDRAWN',
            withdrawn_by_id = ?,
            withdrawn_by_name_ar = ?,
            withdrawn_at = ?,
            updated_by_id = ?,
            updated_by_name_ar = ?,
            updated_by_role = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(actor.id, actor.nameAr, now, actor.id, actor.nameAr, actor.role, now, entryId);

      this.db.prepare('DELETE FROM knowledge_revisions WHERE entry_id = ?').run(entryId);

      this.insertAuditLog({
        entryId,
        action: 'WITHDRAWN',
        actor,
        fromStatus: 'PUBLISHED',
        toStatus: 'WITHDRAWN',
        summaryAr: `سحب «${existing.titleAr}» من النشر وإيقاف استرجاعه في المساعد الذكي.`,
        reasonAr,
        createdAt: now,
      });

      const updated = this.getEntryById(entryId);
      if (!updated) throw new KnowledgeStorageError();
      return updated;
    });
  }

  /**
   * Logs a staff/supervisor correction to an AI reply linked to an actual conversation and message.
   * Never auto-publishes; optionally creates a linked DRAFT knowledge entry for supervisor review.
   */
  public recordAiReplyFeedback(
    actor: StaffActor,
    input: RecordAiFeedbackInput
  ): {
    feedback: AiReplyFeedbackRecord;
    draftEntry?: KnowledgeEntryRecord;
  } {
    const validActor = validateActor(actor);

    const conversationId =
      typeof input.conversationId === 'string' ? input.conversationId.trim() : '';
    const messageId = typeof input.messageId === 'string' ? input.messageId.trim() : '';
    const originalAiText =
      typeof input.originalAiText === 'string' ? input.originalAiText.trim() : '';
    const correctedReplyAr =
      typeof input.correctedReplyAr === 'string' ? input.correctedReplyAr.trim() : '';
    const notesAr =
      typeof input.notesAr === 'string' && input.notesAr.trim().length > 0
        ? input.notesAr.trim()
        : undefined;

    if (!conversationId || !messageId) {
      throw new KnowledgeValidationError(
        'missing_conversation_or_message_id',
        'يجب ربط تصحيح الرد بمعرف المحادثة ومعرف رسالة المساعد الفعلية.'
      );
    }

    if (originalAiText.length < 2) {
      throw new KnowledgeValidationError(
        'missing_original_ai_text',
        'نص رد المساعد الأصلي مطلوب لتوثيق التغذية الراجعة.'
      );
    }

    if (correctedReplyAr.length < 5 || correctedReplyAr.length > 1500) {
      throw new KnowledgeValidationError(
        'invalid_corrected_reply',
        'الرد المصحح المقترح يجب أن يكون بين 5 و1500 حرف.'
      );
    }

    const safety = validateKnowledgeContentSafety(
      input.draftTitleAr ?? 'تصحيح رد المساعد',
      correctedReplyAr
    );
    if (!safety.isSafe) {
      throw new KnowledgeValidationError(
        safety.code ?? 'unsafe_policy_content',
        safety.reasonAr ?? 'التصحيح المقترح يخالف سياسات النظام المعتمدة.'
      );
    }

    const rawProductIds = Array.isArray(input.productIds) ? input.productIds : [];
    const productIds = Array.from(
      new Set(
        rawProductIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      )
    );
    for (const pid of productIds) {
      if (!KARBALA_PRODUCT_IDS.has(pid)) {
        throw new KnowledgeValidationError(
          'invalid_product_id',
          `معرف المنتج "${pid}" غير موجود في كتالوج فرع كربلاء المعتمد.`
        );
      }
    }

    const category: KnowledgeCategory =
      input.category && VALID_CATEGORIES.has(input.category)
        ? input.category
        : productIds.length > 0
        ? 'PRODUCT_NOTE'
        : 'FAQ';

    const now = new Date().toISOString();
    const feedbackId = `fb-${randomUUID()}`;

    return this.runInTransaction(() => {
      let linkedEntryId: string | undefined;

      if (input.createDraftEntry) {
        if (category === 'PRODUCT_NOTE' && productIds.length === 0) {
          throw new KnowledgeValidationError(
            'missing_product_id_for_note',
            'تحويل التصحيح إلى ملاحظة منتج يتطلب تحديد منتج واحد على الأقل من الكتالوج.'
          );
        }

        linkedEntryId = `kb-${randomUUID()}`;
        const draftTitle =
          typeof input.draftTitleAr === 'string' && input.draftTitleAr.trim().length >= 3
            ? input.draftTitleAr.trim()
            : `مسودة من تصحيح رد (${conversationId} / ${messageId})`;

        const keywords = Array.isArray(input.draftTriggerKeywords)
          ? input.draftTriggerKeywords
              .filter((k): k is string => typeof k === 'string')
              .map((k) => k.trim())
              .filter(Boolean)
          : [];

        this.db
          .prepare(
            `INSERT INTO knowledge_entries (
              id, category, status, title_ar, content_ar, trigger_keywords_json, product_ids_json,
              branch_id, published_version, created_by_id, created_by_name_ar, created_by_role,
              updated_by_id, updated_by_name_ar, updated_by_role, created_at, updated_at
            ) VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            linkedEntryId,
            category,
            draftTitle,
            correctedReplyAr,
            JSON.stringify(keywords),
            JSON.stringify(productIds),
            KARBALA_BRANCH_ID,
            validActor.id,
            validActor.nameAr,
            validActor.role,
            validActor.id,
            validActor.nameAr,
            validActor.role,
            now,
            now
          );

        this.insertAuditLog({
          entryId: linkedEntryId,
          action: 'LOGGED_AI_FEEDBACK',
          actor: validActor,
          toStatus: 'DRAFT',
          summaryAr: `إنشاء مسودة معرفة من تصحيح رد المساعد في المحادثة (${conversationId} - الرسالة ${messageId}).`,
          createdAt: now,
        });
      }

      this.db
        .prepare(
          `INSERT INTO ai_reply_feedbacks (
            id, conversation_id, message_id, original_ai_text, corrected_reply_ar,
            notes_ar, category, product_ids_json, linked_knowledge_entry_id,
            created_by_id, created_by_name_ar, created_by_role, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          feedbackId,
          conversationId,
          messageId,
          originalAiText,
          correctedReplyAr,
          notesAr ?? null,
          category,
          JSON.stringify(productIds),
          linkedEntryId ?? null,
          validActor.id,
          validActor.nameAr,
          validActor.role,
          now
        );

      const feedback: AiReplyFeedbackRecord = {
        id: feedbackId,
        conversationId,
        messageId,
        originalAiText,
        correctedReplyAr,
        ...(notesAr ? { notesAr } : {}),
        category,
        productIds,
        ...(linkedEntryId ? { linkedKnowledgeEntryId: linkedEntryId } : {}),
        createdById: validActor.id,
        createdByNameAr: validActor.nameAr,
        createdByRole: validActor.role,
        createdAt: now,
      };

      const draftEntry = linkedEntryId ? this.getEntryById(linkedEntryId) ?? undefined : undefined;
      return { feedback, ...(draftEntry ? { draftEntry } : {}) };
    });
  }

  /**
   * Assistant retrieval path:
   * - Strictly queries `status = 'PUBLISHED'` from `knowledge_entries` (never `knowledge_revisions`,
   *   and never `DRAFT`, `PENDING_APPROVAL`, `REJECTED`, or `WITHDRAWN`).
   * - Re-verifies content safety before returning.
   */
  public getPublishedForAssistant(
    params: AssistantKnowledgeQuery = {}
  ): PublishedKnowledgeItem[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM knowledge_entries WHERE status = 'PUBLISHED' AND branch_id = ? ORDER BY updated_at DESC"
      )
      .all(KARBALA_BRANCH_ID) as Array<Record<string, unknown>>;

    const publishedItems: PublishedKnowledgeItem[] = [];
    for (const r of rows) {
      const titleAr = String(r.title_ar);
      const contentAr = String(r.content_ar);
      // Double-check policy guard at retrieval time so unsafe content can never enter assistant context
      if (!validateKnowledgeContentSafety(titleAr, contentAr).isSafe) {
        continue;
      }

      publishedItems.push({
        id: String(r.id),
        category: String(r.category) as KnowledgeCategory,
        titleAr,
        contentAr,
        triggerKeywords: JSON.parse(String(r.trigger_keywords_json)) as string[],
        productIds: JSON.parse(String(r.product_ids_json)) as string[],
        publishedVersion: Number(r.published_version),
        publishedAt: String(r.published_at ?? r.updated_at),
      });
    }

    let filtered = publishedItems;

    if (params.category) {
      filtered = filtered.filter((item) => item.category === params.category);
    }

    if (params.productIds && params.productIds.length > 0) {
      const targetProducts = new Set(params.productIds);
      filtered = filtered.filter(
        (item) =>
          item.productIds.length === 0 || item.productIds.some((pid) => targetProducts.has(pid))
      );
    }

    if (params.query && params.query.trim().length > 0) {
      const normQuery = normalizeArabicSearchText(params.query);
      const queryTokens = normQuery.split(' ').filter((t) => t.length >= 2);

      if (queryTokens.length > 0) {
        const scored = filtered
          .map((item) => {
            const searchable = normalizeArabicSearchText(
              [item.titleAr, item.contentAr, ...item.triggerKeywords, ...item.productIds].join(' ')
            );
            let score = 0;
            for (const token of queryTokens) {
              if (searchable.includes(token)) {
                score += 1;
              }
            }
            return { item, score };
          })
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score);

        filtered = scored.map((s) => s.item);
      }
    }

    const limit = params.limit ?? 5;
    return filtered.slice(0, limit);
  }
}

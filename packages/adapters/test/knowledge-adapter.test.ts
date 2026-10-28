import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  KnowledgeAuthorizationError,
  KnowledgeStorageError,
  KnowledgeTransitionError,
  KnowledgeValidationError,
  SqliteKnowledgeStore,
  type StaffActor,
} from '../src/knowledge-adapter';

const STAFF_ACTOR: StaffActor = {
  id: 'staff-karbala-1',
  nameAr: 'زهراء العلي',
  role: 'STAFF',
};

const SUPERVISOR_ACTOR: StaffActor = {
  id: 'supervisor-karbala-1',
  nameAr: 'أحمد الكربلائي',
  role: 'SUPERVISOR',
};

const tempDirs: string[] = [];

function createTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tel-kb-test-'));
  tempDirs.push(dir);
  return path.join(dir, 'kb.sqlite');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore Windows file lock cleanup race in temp directory
    }
  }
});

describe('SqliteKnowledgeStore (0-D1c)', () => {
  it('enforces valid state transitions: DRAFT -> PENDING_APPROVAL -> PUBLISHED -> WITHDRAWN', () => {
    const store = new SqliteKnowledgeStore({ dbPath: ':memory:', seedInitialData: false });

    const draft = store.createEntry(STAFF_ACTOR, {
      category: 'FAQ',
      titleAr: 'سؤال عن توفر الإكسسوارات في فرع كربلاء',
      contentAr: 'يتم فحص توفر الإكسسوارات في فرع كربلاء عبر أداة المخزون قبل تأكيد الطلب.',
      triggerKeywords: ['اكسسوارات', 'كفر', 'شاحن'],
    });
    expect(draft.status).toBe('DRAFT');
    expect(draft.publishedVersion).toBe(0);

    // Cannot jump directly from DRAFT to PUBLISHED without submitting for approval first
    expect(() => store.approveAndPublish(SUPERVISOR_ACTOR, draft.id)).toThrow(
      KnowledgeTransitionError
    );

    const pending = store.submitForApproval(STAFF_ACTOR, draft.id);
    expect(pending.status).toBe('PENDING_APPROVAL');
    expect(pending.submittedById).toBe(STAFF_ACTOR.id);

    const published = store.approveAndPublish(SUPERVISOR_ACTOR, draft.id);
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedVersion).toBe(1);
    expect(published.reviewedById).toBe(SUPERVISOR_ACTOR.id);

    const withdrawn = store.withdrawPublished(
      SUPERVISOR_ACTOR,
      draft.id,
      'انتهاء العمل بهذه الملاحظة'
    );
    expect(withdrawn.status).toBe('WITHDRAWN');
    expect(withdrawn.withdrawnById).toBe(SUPERVISOR_ACTOR.id);

    store.close();
  });

  it('rejects approve, reject, and withdraw actions from non-supervisor STAFF', () => {
    const store = new SqliteKnowledgeStore({ dbPath: ':memory:', seedInitialData: false });

    const entry = store.createEntry(STAFF_ACTOR, {
      category: 'OBJECTION_REPLY',
      titleAr: 'اعتراض العميل على حجم الشاشة',
      contentAr: 'نقترح مقارنة مقاس الشاشة مع جهاز بديل من الكتالوج عبر أداة المقارنة.',
      submitForApproval: true,
    });
    expect(entry.status).toBe('PENDING_APPROVAL');

    expect(() => store.approveAndPublish(STAFF_ACTOR, entry.id)).toThrow(
      KnowledgeAuthorizationError
    );
    expect(() => store.rejectReview(STAFF_ACTOR, entry.id, 'سبب تجريبي')).toThrow(
      KnowledgeAuthorizationError
    );

    const published = store.approveAndPublish(SUPERVISOR_ACTOR, entry.id);
    expect(published.status).toBe('PUBLISHED');

    expect(() => store.withdrawPublished(STAFF_ACTOR, entry.id)).toThrow(
      KnowledgeAuthorizationError
    );

    store.close();
  });

  it('requires a non-empty reason when a supervisor rejects an entry', () => {
    const store = new SqliteKnowledgeStore({ dbPath: ':memory:', seedInitialData: false });

    const entry = store.createEntry(STAFF_ACTOR, {
      category: 'FAQ',
      titleAr: 'استفسار عن مقارنة الكاميرات',
      contentAr: 'نستخدم أداة مقارنة المنتجات لعرض دقة الكاميرا المثبتة بالكتالوج.',
      submitForApproval: true,
    });

    expect(() => store.rejectReview(SUPERVISOR_ACTOR, entry.id, '  ')).toThrow(
      KnowledgeValidationError
    );

    const rejected = store.rejectReview(
      SUPERVISOR_ACTOR,
      entry.id,
      'يرجى تحديد الموديلات المشمولة بالمقارنة بدقة أكبر'
    );
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe('يرجى تحديد الموديلات المشمولة بالمقارنة بدقة أكبر');

    store.close();
  });

  it('preserves the live PUBLISHED version while a new edit is in DRAFT, PENDING_APPROVAL, or REJECTED', () => {
    const store = new SqliteKnowledgeStore({ dbPath: ':memory:', seedInitialData: false });

    const created = store.createEntry(STAFF_ACTOR, {
      category: 'PRODUCT_NOTE',
      titleAr: 'ملاحظة شاحن Galaxy A55 الأصلي',
      contentAr: 'النسخة المعتمدة الأولى: الجهاز يأتي بدون رأس شاحن في العلبة.',
      triggerKeywords: ['A55', 'شاحن'],
      productIds: ['prod-a55-256'],
      submitForApproval: true,
    });
    const pubV1 = store.approveAndPublish(SUPERVISOR_ACTOR, created.id);
    expect(pubV1.status).toBe('PUBLISHED');
    expect(pubV1.publishedVersion).toBe(1);

    // Staff edits the PUBLISHED entry -> creates a pending revision without replacing live V1
    const withDraftRev = store.updateEntry(STAFF_ACTOR, created.id, {
      category: 'PRODUCT_NOTE',
      titleAr: 'ملاحظة شاحن Galaxy A55 المحدثة (قيد المراجعة)',
      contentAr: 'النسخة المقترحة الثانية: ننصح بشاحن سامسونج 25 واط المتوافق.',
      triggerKeywords: ['A55', 'شاحن'],
      productIds: ['prod-a55-256', 'prod-acc-sam-25w'],
      submitForApproval: true,
    });

    expect(withDraftRev.status).toBe('PUBLISHED');
    expect(withDraftRev.publishedVersion).toBe(1);
    expect(withDraftRev.contentAr).toBe('النسخة المعتمدة الأولى: الجهاز يأتي بدون رأس شاحن في العلبة.');
    expect(withDraftRev.pendingRevision).toBeDefined();
    expect(withDraftRev.pendingRevision?.status).toBe('PENDING_APPROVAL');
    expect(withDraftRev.pendingRevision?.contentAr).toBe(
      'النسخة المقترحة الثانية: ننصح بشاحن سامسونج 25 واط المتوافق.'
    );

    // Assistant retrieval MUST still receive V1 only!
    const retrievedDuringReview = store.getPublishedForAssistant({ query: 'شاحن A55' });
    expect(retrievedDuringReview).toHaveLength(1);
    expect(retrievedDuringReview[0]?.contentAr).toBe(
      'النسخة المعتمدة الأولى: الجهاز يأتي بدون رأس شاحن في العلبة.'
    );
    expect(retrievedDuringReview[0]?.publishedVersion).toBe(1);

    // Supervisor rejects the revision -> live V1 still remains active!
    const afterRejectRev = store.rejectReview(
      SUPERVISOR_ACTOR,
      created.id,
      'الصياغة تحتاج ذكر رمز الشاحن'
    );
    expect(afterRejectRev.status).toBe('PUBLISHED');
    expect(afterRejectRev.pendingRevision?.status).toBe('REJECTED');
    expect(store.getPublishedForAssistant({ query: 'شاحن A55' })[0]?.contentAr).toBe(
      'النسخة المعتمدة الأولى: الجهاز يأتي بدون رأس شاحن في العلبة.'
    );

    // Staff updates revision and re-submits, then supervisor approves -> promotes to V2!
    store.updateEntry(STAFF_ACTOR, created.id, {
      category: 'PRODUCT_NOTE',
      titleAr: 'ملاحظة شاحن Galaxy A55 المعتمدة (الإصدار الثاني)',
      contentAr: 'النسخة المعتمدة الثانية: الجهاز بدون رأس شاحن ويُقترح شاحن سامسونج 25 واط.',
      triggerKeywords: ['A55', 'شاحن'],
      productIds: ['prod-a55-256', 'prod-acc-sam-25w'],
      submitForApproval: true,
    });

    const pubV2 = store.approveAndPublish(SUPERVISOR_ACTOR, created.id);
    expect(pubV2.status).toBe('PUBLISHED');
    expect(pubV2.publishedVersion).toBe(2);
    expect(pubV2.pendingRevision).toBeUndefined();
    expect(pubV2.contentAr).toBe(
      'النسخة المعتمدة الثانية: الجهاز بدون رأس شاحن ويُقترح شاحن سامسونج 25 واط.'
    );

    const retrievedAfterApproval = store.getPublishedForAssistant({ query: 'شاحن A55' });
    expect(retrievedAfterApproval[0]?.publishedVersion).toBe(2);
    expect(retrievedAfterApproval[0]?.contentAr).toBe(
      'النسخة المعتمدة الثانية: الجهاز بدون رأس شاحن ويُقترح شاحن سامسونج 25 واط.'
    );

    store.close();
  });

  it('excludes DRAFT, PENDING_APPROVAL, REJECTED, and WITHDRAWN entries from assistant retrieval', () => {
    const store = new SqliteKnowledgeStore({ dbPath: ':memory:', seedInitialData: false });

    store.createEntry(STAFF_ACTOR, {
      category: 'FAQ',
      titleAr: 'مسودة غير منشورة عن البطارية',
      contentAr: 'هذه مسودة لا يجوز أن تظهر للمساعد.',
      triggerKeywords: ['بطارية'],
    });

    store.createEntry(STAFF_ACTOR, {
      category: 'FAQ',
      titleAr: 'عنصر قيد المراجعة عن البطارية',
      contentAr: 'هذا العنصر بانتظار موافقة المشرف.',
      triggerKeywords: ['بطارية'],
      submitForApproval: true,
    });

    const toReject = store.createEntry(STAFF_ACTOR, {
      category: 'FAQ',
      titleAr: 'عنصر مرفوض عن البطارية',
      contentAr: 'هذا العنصر مرفوض.',
      triggerKeywords: ['بطارية'],
      submitForApproval: true,
    });
    store.rejectReview(SUPERVISOR_ACTOR, toReject.id, 'معلومة غير دقيقة');

    const toWithdraw = store.createEntry(STAFF_ACTOR, {
      category: 'FAQ',
      titleAr: 'عنصر مسحوب عن البطارية',
      contentAr: 'هذا العنصر تم سحبه بعد النشر.',
      triggerKeywords: ['بطارية'],
      submitForApproval: true,
    });
    store.approveAndPublish(SUPERVISOR_ACTOR, toWithdraw.id);
    store.withdrawPublished(SUPERVISOR_ACTOR, toWithdraw.id, 'سحب للاختبار');

    expect(store.getPublishedForAssistant({ query: 'بطارية' })).toHaveLength(0);
    expect(store.getPublishedForAssistant()).toHaveLength(0);

    store.close();
  });

  it('persists entries, audit logs, and AI feedback across re-initializing the store instance on disk', () => {
    const dbPath = createTempDbPath();

    // First instance writes data
    const store1 = new SqliteKnowledgeStore({ dbPath, seedInitialData: false });
    const entry = store1.createEntry(STAFF_ACTOR, {
      category: 'PRODUCT_NOTE',
      titleAr: 'ملاحظة مقاومة الماء في Galaxy A55',
      contentAr: 'يدعم معيار مقاومة الماء والغبار حسب مواصفات الكتالوج.',
      productIds: ['prod-a55-256'],
      submitForApproval: true,
    });
    store1.approveAndPublish(SUPERVISOR_ACTOR, entry.id);

    const fbResult = store1.recordAiReplyFeedback(STAFF_ACTOR, {
      conversationId: 'demo-conv-1',
      messageId: 'm2',
      originalAiText: 'أهلاً بيج. هذا خيار من الكتالوج التجريبي يناسب طلبج:',
      correctedReplyAr: 'أهلاً بيج، جهاز Galaxy A55 خيار ممتاز للكاميرا والبطارية، وتتوفر إله حافظة متوافقة بالكتالوج.',
      notesAr: 'إضافة إشارة للحافظة المتوافقة',
      productIds: ['prod-a55-256', 'prod-acc-a55-case'],
      createDraftEntry: true,
    });
    expect(fbResult.draftEntry?.status).toBe('DRAFT');
    store1.close();

    // Re-initialize a brand-new store instance pointing to the same SQLite file
    const store2 = new SqliteKnowledgeStore({ dbPath, seedInitialData: false });
    const loadedEntry = store2.getEntryById(entry.id);
    expect(loadedEntry).not.toBeNull();
    expect(loadedEntry?.status).toBe('PUBLISHED');
    expect(loadedEntry?.publishedVersion).toBe(1);

    // Draft created from feedback must still be DRAFT (never auto-published)
    const loadedDraft = store2.getEntryById(fbResult.draftEntry!.id);
    expect(loadedDraft?.status).toBe('DRAFT');

    const feedbacks = store2.listFeedback();
    expect(feedbacks).toHaveLength(1);
    expect(feedbacks[0]?.conversationId).toBe('demo-conv-1');
    expect(feedbacks[0]?.messageId).toBe('m2');

    const logs = store2.listAuditLogs(entry.id);
    expect(logs.length).toBeGreaterThanOrEqual(2);
    store2.close();
  });

  it('validates inputs, blocks unapproved policies/branches, and rolls back cleanly on write failure', () => {
    const store = new SqliteKnowledgeStore({ dbPath: ':memory:', seedInitialData: false });

    // 1. PRODUCT_NOTE without productIds must fail
    expect(() =>
      store.createEntry(STAFF_ACTOR, {
        category: 'PRODUCT_NOTE',
        titleAr: 'ملاحظة بدون منتج',
        contentAr: 'نص ملاحظة منتج بدون تحديد أي معرف منتج.',
        productIds: [],
      })
    ).toThrow(KnowledgeValidationError);

    // 2. Unknown productId must fail
    expect(() =>
      store.createEntry(STAFF_ACTOR, {
        category: 'PRODUCT_NOTE',
        titleAr: 'ملاحظة بمنتج وهمي',
        contentAr: 'نص ملاحظة منتج بمعرف غير موجود.',
        productIds: ['prod-non-existent-999'],
      })
    ).toThrow(KnowledgeValidationError);

    // 3. Unapproved delivery policy ("توصيل مجاني") or non-Karbala branch must fail
    expect(() =>
      store.createEntry(STAFF_ACTOR, {
        category: 'FAQ',
        titleAr: 'سياسة التوصيل',
        contentAr: 'يوجد توصيل مجاني لكل الطلبات اليوم.',
      })
    ).toThrow(KnowledgeValidationError);

    expect(() =>
      store.createEntry(STAFF_ACTOR, {
        category: 'FAQ',
        titleAr: 'فروعنا الأخرى',
        contentAr: 'يمكنك الاستلام من فرع المنصور في بغداد.',
      })
    ).toThrow(KnowledgeValidationError);

    // 4. Simulated write failure rolls back transaction without partial state
    store.setSimulateWriteFailure(true);
    expect(() =>
      store.createEntry(STAFF_ACTOR, {
        category: 'FAQ',
        titleAr: 'عنصر يفشل حفظه',
        contentAr: 'يجب أن يتم التراجع عن هذا الإدخال عند فشل الكتابة.',
      })
    ).toThrow(KnowledgeStorageError);

    store.setSimulateWriteFailure(false);
    expect(store.listEntries()).toHaveLength(0);

    store.close();
  });
});


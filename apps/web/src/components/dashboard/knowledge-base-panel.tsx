'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  KNOWLEDGE_CATEGORY_LABELS_AR,
  KNOWLEDGE_STATUS_LABELS_AR,
  STAFF_ROLE_LABELS_AR,
  type AiReplyFeedbackView,
  type CatalogProductOptionView,
  type KnowledgeAuditLogView,
  type KnowledgeCategory,
  type KnowledgeEntryView,
  type KnowledgeStatus,
  type StaffSessionView,
} from '@/lib/knowledge-model';
import { DemoBadge } from '../brand';
import { IconCheckCircle, IconInfo } from '../icons';

export interface KnowledgeBasePanelProps {
  initialEntries: KnowledgeEntryView[];
  initialAuditLogs: KnowledgeAuditLogView[];
  initialFeedbacks: AiReplyFeedbackView[];
  catalogOptions: CatalogProductOptionView[];
  currentStaff: StaffSessionView;
  availableDevAccounts: StaffSessionView[];
  onStaffSessionChange: (nextSession: StaffSessionView) => void;
  externalEntries?: KnowledgeEntryView[];
  externalAuditLogs?: KnowledgeAuditLogView[];
  externalFeedbacks?: AiReplyFeedbackView[];
  onStateSync?: (next: {
    entries: KnowledgeEntryView[];
    auditLogs: KnowledgeAuditLogView[];
    feedbacks?: AiReplyFeedbackView[];
  }) => void;
}

const CATEGORY_OPTIONS: KnowledgeCategory[] = ['FAQ', 'OBJECTION_REPLY', 'PRODUCT_NOTE'];
const STATUS_FILTER_OPTIONS: Array<{ id: 'ALL' | KnowledgeStatus; labelAr: string }> = [
  { id: 'ALL', labelAr: 'كل الحالات' },
  { id: 'PENDING_APPROVAL', labelAr: 'مراجعة مشرف' },
  { id: 'PUBLISHED', labelAr: 'منشور للمساعد' },
  { id: 'DRAFT', labelAr: 'مسودة' },
  { id: 'REJECTED', labelAr: 'مرفوض' },
  { id: 'WITHDRAWN', labelAr: 'مسحوب' },
];

function statusBadgeClass(status: KnowledgeStatus | 'APPROVED'): string {
  switch (status) {
    case 'PUBLISHED':
    case 'APPROVED':
      return 'badge badge-success badge-dot';
    case 'PENDING_APPROVAL':
      return 'badge badge-warning badge-dot';
    case 'REJECTED':
      return 'badge badge-danger badge-dot';
    case 'WITHDRAWN':
      return 'badge badge-dot';
    default:
      return 'badge badge-primary badge-dot';
  }
}

function formatArabicTimestamp(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ar-IQ', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function KnowledgeBasePanel({
  initialEntries,
  initialAuditLogs,
  initialFeedbacks,
  catalogOptions,
  currentStaff,
  availableDevAccounts,
  onStaffSessionChange,
  externalEntries,
  externalAuditLogs,
  externalFeedbacks,
  onStateSync,
}: KnowledgeBasePanelProps) {
  const [entries, setEntries] = useState<KnowledgeEntryView[]>(initialEntries);
  const [auditLogs, setAuditLogs] = useState<KnowledgeAuditLogView[]>(initialAuditLogs);
  const [feedbacks, setFeedbacks] = useState<AiReplyFeedbackView[]>(initialFeedbacks);

  useEffect(() => {
    if (externalEntries) setEntries(externalEntries);
  }, [externalEntries]);

  useEffect(() => {
    if (externalAuditLogs) setAuditLogs(externalAuditLogs);
  }, [externalAuditLogs]);

  useEffect(() => {
    if (externalFeedbacks) setFeedbacks(externalFeedbacks);
  }, [externalFeedbacks]);

  const [categoryFilter, setCategoryFilter] = useState<'ALL' | KnowledgeCategory>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | KnowledgeStatus>('ALL');
  const [selectedId, setSelectedId] = useState<string | 'NEW'>(
    initialEntries[0]?.id ?? 'NEW'
  );
  const [sideTab, setSideTab] = useState<'audit' | 'feedback'>('audit');

  // Editor form state
  const [category, setCategory] = useState<KnowledgeCategory>('FAQ');
  const [titleAr, setTitleAr] = useState('');
  const [contentAr, setContentAr] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [withdrawReasonInput, setWithdrawReasonInput] = useState('');

  // Status / error banners
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const productMap = useMemo(
    () => new Map(catalogOptions.map((p) => [p.id, p] as const)),
    [catalogOptions]
  );

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (categoryFilter !== 'ALL' && entry.category !== categoryFilter) return false;
      if (statusFilter !== 'ALL') {
        const matchesMain = entry.status === statusFilter;
        const matchesPendingRev =
          statusFilter === 'PENDING_APPROVAL' &&
          entry.pendingRevision?.status === 'PENDING_APPROVAL';
        if (!matchesMain && !matchesPendingRev) return false;
      }
      return true;
    });
  }, [entries, categoryFilter, statusFilter]);

  const selectedEntry = useMemo(
    () => (selectedId === 'NEW' ? null : entries.find((e) => e.id === selectedId) ?? null),
    [entries, selectedId]
  );

  // Populate editor form whenever selectedEntry changes
  useEffect(() => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setRejectionReasonInput('');
    setWithdrawReasonInput('');

    if (!selectedEntry) {
      setCategory('FAQ');
      setTitleAr('');
      setContentAr('');
      setKeywordsText('');
      setSelectedProductIds([]);
      return;
    }

    // If a PUBLISHED entry has a pending revision, edit the revision fields in the form
    const source = selectedEntry.pendingRevision ?? selectedEntry;
    setCategory(selectedEntry.category);
    setTitleAr(source.titleAr);
    setContentAr(source.contentAr);
    setKeywordsText(source.triggerKeywords.join('، '));
    setSelectedProductIds(source.productIds);
  }, [selectedEntry]);

  // Ensure server-signed session cookie is initialized on mount
  useEffect(() => {
    void fetch('/api/staff/session', { method: 'GET' })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { current?: StaffSessionView };
        if (data.current) {
          onStaffSessionChange(data.current);
        }
      })
      .catch(() => {
        // Ignore network errors during initial check
      });
  }, [onStaffSessionChange]);

  const handleSwitchDevAccount = async (staffId: string) => {
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/staff/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId }),
      });
      const data = (await res.json()) as {
        current?: StaffSessionView;
        messageAr?: string;
      };
      if (!res.ok || !data.current) {
        setErrorMsg(data.messageAr ?? 'تعذر تبديل جلسة الموظف على الخادم.');
        return;
      }
      onStaffSessionChange(data.current);
      setSuccessMsg(
        `تم تبديل الجلسة الموقّعة على الخادم إلى: ${data.current.nameAr} (${
          STAFF_ROLE_LABELS_AR[data.current.role]
        }).`
      );
    } catch {
      setErrorMsg('تعذر الاتصال بالخادم لتبديل الجلسة.');
    } finally {
      setBusy(false);
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const executeKnowledgeAction = async (
    payload: Record<string, unknown>,
    successTextAr: string
  ) => {
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        entry?: KnowledgeEntryView;
        entries?: KnowledgeEntryView[];
        auditLogs?: KnowledgeAuditLogView[];
        messageAr?: string;
      };

      if (!res.ok || !data.entry || !data.entries || !data.auditLogs) {
        setErrorMsg(data.messageAr ?? 'رفض الخادم تنفيذ العملية.');
        return;
      }

      setEntries(data.entries);
      setAuditLogs(data.auditLogs);
      setSelectedId(data.entry.id);
      setSuccessMsg(successTextAr);
      onStateSync?.({
        entries: data.entries,
        auditLogs: data.auditLogs,
      });
    } catch {
      setErrorMsg('حدث خطأ في الاتصال بالخادم أثناء حفظ تغييرات قاعدة المعرفة.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOrSubmit = async (submitForApproval: boolean) => {
    const parsedKeywords = keywordsText
      .split(/[،,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (selectedId === 'NEW' || !selectedEntry) {
      await executeKnowledgeAction(
        {
          action: 'create',
          category,
          titleAr,
          contentAr,
          triggerKeywords: parsedKeywords,
          productIds: selectedProductIds,
          submitForApproval,
        },
        submitForApproval
          ? 'تم إنشاء العنصر وإرساله لمراجعة المشرف بنجاح.'
          : 'تم حفظ المسودة في قاعدة البيانات بنجاح.'
      );
      return;
    }

    await executeKnowledgeAction(
      {
        action: 'update',
        entryId: selectedEntry.id,
        category,
        titleAr,
        contentAr,
        triggerKeywords: parsedKeywords,
        productIds: selectedProductIds,
        submitForApproval,
      },
      selectedEntry.status === 'PUBLISHED'
        ? submitForApproval
          ? 'تم حفظ نسخة التعديل الجديدة وإرسالها لمراجعة المشرف (النسخة المنشورة الحالية تبقى فعّالة للمساعد حتى اعتماد المشرف).'
          : 'تم حفظ مسودة تعديل جديدة دون المساس بالنسخة المنشورة الحالية.'
        : submitForApproval
        ? 'تم تحديث العنصر وإرساله لمراجعة المشرف.'
        : 'تم تحديث المسودة بنجاح.'
    );
  };

  const isPendingReview =
    selectedEntry?.status === 'PENDING_APPROVAL' ||
    selectedEntry?.pendingRevision?.status === 'PENDING_APPROVAL';

  const canSubmitExistingDraft =
    selectedEntry &&
    (selectedEntry.status === 'DRAFT' ||
      selectedEntry.status === 'REJECTED' ||
      selectedEntry.status === 'WITHDRAWN' ||
      selectedEntry.pendingRevision?.status === 'DRAFT' ||
      selectedEntry.pendingRevision?.status === 'REJECTED');

  return (
    <div className="kb-workspace" id="knowledge-base-panel">
      {/* Isolated Dev Auth Mode Banner & Server Session Switcher */}
      <div className="kb-auth-banner" role="region" aria-label="حالة المصادقة والصلاحيات">
        <div className="kb-auth-info">
          <IconInfo />
          <div>
            <strong>وضع تطوير معزول للمصادقة (Isolated Dev Auth):</strong> الصلاحيات وانتقالات الحالة
            مفروضة على الخادم عبر جلسة موقعة (`HttpOnly HMAC`) وليست من مدخلات المتصفح. المحتوى
            المنشور فقط (`PUBLISHED`) يدخل في سياق المساعد الذكي لفرع كربلاء دون تجاوز تعليمات النظام
            أو أدوات الأسعار والمخزون.
          </div>
        </div>
        <div className="kb-auth-switcher">
          <span className="kb-auth-label">الجلسة الفعالة على الخادم:</span>
          {availableDevAccounts.map((acc) => {
            const isActive = acc.id === currentStaff.id;
            return (
              <button
                key={acc.id}
                type="button"
                disabled={busy || isActive}
                onClick={() => void handleSwitchDevAccount(acc.id)}
                className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'} kb-role-btn`}
              >
                <span>{acc.nameAr}</span>
                <span className="badge badge-accent">{STAFF_ROLE_LABELS_AR[acc.role]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="catalog-feedback catalog-feedback-error" role="alert">
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="kb-feedback-success" role="status">
          <IconCheckCircle />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="kb-grid">
        {/* Column 1: Knowledge Base Entries List */}
        <section className="kb-list-col card" aria-label="قائمة عناصر قاعدة المعرفة">
          <header className="kb-col-head">
            <div>
              <h2>قاعدة المعرفة</h2>
              <span className="kb-col-sub">فرع كربلاء · {entries.length} عنصر محفوظ</span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setSelectedId('NEW')}
              disabled={busy}
            >
              + معرفة جديدة
            </button>
          </header>

          <div className="kb-filters">
            <select
              aria-label="تصفية حسب التصنيف"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | KnowledgeCategory)}
            >
              <option value="ALL">كل التصنيفات</option>
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {KNOWLEDGE_CATEGORY_LABELS_AR[cat]}
                </option>
              ))}
            </select>

            <select
              aria-label="تصفية حسب الحالة"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | KnowledgeStatus)}
            >
              {STATUS_FILTER_OPTIONS.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.labelAr}
                </option>
              ))}
            </select>
          </div>

          <div className="kb-entries-list" role="list">
            {filteredEntries.map((entry) => {
              const isSelected = selectedId === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="listitem"
                  onClick={() => setSelectedId(entry.id)}
                  className={`kb-entry-card ${isSelected ? 'active' : ''}`}
                >
                  <div className="kb-entry-top">
                    <span className="badge badge-accent">
                      {KNOWLEDGE_CATEGORY_LABELS_AR[entry.category]}
                    </span>
                    <span className={statusBadgeClass(entry.status)}>
                      {KNOWLEDGE_STATUS_LABELS_AR[entry.status]}
                    </span>
                  </div>
                  <div className="kb-entry-title">{entry.titleAr}</div>
                  <div className="kb-entry-preview">{entry.contentAr}</div>
                  <div className="kb-entry-meta">
                    <span>
                      {entry.publishedVersion > 0
                        ? `الإصدار المنشور v${entry.publishedVersion}`
                        : 'لم يُنشر بعد'}
                    </span>
                    {entry.pendingRevision && (
                      <span className="badge badge-warning">
                        تعديل مقترح ({KNOWLEDGE_STATUS_LABELS_AR[entry.pendingRevision.status]})
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {filteredEntries.length === 0 && (
              <div className="kb-empty-note">لا توجد عناصر مطابقة للفلاتر المحددة.</div>
            )}
          </div>
        </section>

        {/* Column 2: Knowledge Editor & Supervisor Approval Controls */}
        <section className="kb-editor-col card" aria-label="محرر المعرفة والاعتماد">
          <header className="kb-col-head">
            <div>
              <h2>
                {selectedId === 'NEW' || !selectedEntry
                  ? 'إضافة عنصر معرفة جديد (يبدأ كمسودة)'
                  : `تعديل ومراجعة: ${selectedEntry.titleAr}`}
              </h2>
              <span className="kb-col-sub">
                دورة الاعتماد: مسودة ← مراجعة مشرف ← نشر (مع رفض مسبب أو سحب المنشور)
              </span>
            </div>
            {selectedEntry && (
              <span className={statusBadgeClass(selectedEntry.status)}>
                {KNOWLEDGE_STATUS_LABELS_AR[selectedEntry.status]}
              </span>
            )}
          </header>

          {/* When editing a PUBLISHED entry, highlight that the live version stays active */}
          {selectedEntry && selectedEntry.status === 'PUBLISHED' && (
            <div className="kb-published-snapshot-box" role="note">
              <div className="kb-snapshot-head">
                <strong>
                  النسخة المعتمدة والمنشورة حالياً في سياق المساعد (الإصدار v
                  {selectedEntry.publishedVersion}):
                </strong>
                <span>اعتمدها: {selectedEntry.reviewedByNameAr ?? 'المشرف'}</span>
              </div>
              <p className="kb-snapshot-title">{selectedEntry.titleAr}</p>
              <p className="kb-snapshot-body">{selectedEntry.contentAr}</p>
              <span className="kb-snapshot-hint">
                أي تعديل أدناه يُحفظ كنسخة للمراجعة ولا يستبدل هذه النسخة المعتمدة إلا بعد موافقة
                المشرف.
              </span>
            </div>
          )}

          {/* Rejection reason display if entry or revision was rejected */}
          {selectedEntry &&
            (selectedEntry.rejectionReason || selectedEntry.pendingRevision?.rejectionReason) && (
              <div className="catalog-feedback catalog-feedback-error" role="note">
                <span>
                  <strong>سبب رفض المشرف:</strong>{' '}
                  {selectedEntry.pendingRevision?.rejectionReason ?? selectedEntry.rejectionReason}
                </span>
              </div>
            )}

          <div className="kb-form">
            <div className="kb-form-row">
              <label htmlFor="kb-category">تصنيف المعرفة</label>
              <select
                id="kb-category"
                value={category}
                disabled={busy || Boolean(selectedEntry && selectedEntry.status === 'PUBLISHED')}
                onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {KNOWLEDGE_CATEGORY_LABELS_AR[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div className="kb-form-row">
              <label htmlFor="kb-title">العنوان المختصر</label>
              <input
                id="kb-title"
                type="text"
                value={titleAr}
                disabled={busy}
                onChange={(e) => setTitleAr(e.target.value)}
                placeholder="مثال: الرد على اعتراض السعر أو ملاحظة شاحن الجهاز..."
              />
            </div>

            <div className="kb-form-row">
              <label htmlFor="kb-content">
                المحتوى الإرشادي للمساعد (لا يتجاوز تعليمات النظام ولا ينشئ سياسة غير معتمدة)
              </label>
              <textarea
                id="kb-content"
                rows={4}
                value={contentAr}
                disabled={busy}
                onChange={(e) => setContentAr(e.target.value)}
                placeholder="اكتب الإجابة المعتمدة أو طريقة معالجة الاعتراض أو ملاحظة المنتج بوضوح..."
              />
            </div>

            <div className="kb-form-row">
              <label htmlFor="kb-keywords">كلمات مفتاحية للاسترجاع (مفصولة بفاصلة)</label>
              <input
                id="kb-keywords"
                type="text"
                value={keywordsText}
                disabled={busy}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="مثال: ضمان، شاحن، غالي، بطارية"
              />
            </div>

            <div className="kb-form-row">
              <label>
                المنتجات المرتبطة من كتالوج فرع كربلاء{' '}
                {category === 'PRODUCT_NOTE' ? '(إلزامي لملاحظات المنتجات)' : '(اختياري)'}
              </label>
              <div className="kb-products-picker" role="group" aria-label="اختيار المنتجات المرتبطة">
                {catalogOptions.map((prod) => {
                  const checked = selectedProductIds.includes(prod.id);
                  return (
                    <label
                      key={prod.id}
                      className={`kb-prod-chip ${checked ? 'checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggleProductSelection(prod.id)}
                      />
                      <span>{prod.nameAr}</span>
                      <code className="ltr">({prod.sku})</code>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Draft & Submission Actions (Available to Staff & Supervisor) */}
            <div className="kb-actions-bar">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void handleSaveOrSubmit(false)}
              >
                {selectedEntry?.status === 'PUBLISHED'
                  ? 'حفظ كنسخة تعديل (مسودة)'
                  : 'حفظ كمسودة'}
              </button>

              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void handleSaveOrSubmit(true)}
              >
                {selectedEntry?.status === 'PUBLISHED'
                  ? 'حفظ التعديل وإرساله لمراجعة المشرف'
                  : 'حفظ وإرسال لمراجعة المشرف'}
              </button>

              {canSubmitExistingDraft && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void executeKnowledgeAction(
                      { action: 'submit_for_approval', entryId: selectedEntry.id },
                      'تم إرسال المسودة إلى حالة مراجعة المشرف.'
                    )
                  }
                >
                  إرسال المسودة الحالية للمراجعة
                </button>
              )}
            </div>

            {/* Supervisor Review & Withdrawal Section */}
            {selectedEntry && (
              <div className="kb-supervisor-box">
                <div className="kb-supervisor-head">
                  <strong>قرار المشرف وإدارة النشر (مفروض على الخادم لدور SUPERVISOR فقط)</strong>
                  <span className="badge badge-accent">
                    دورك الحالي: {STAFF_ROLE_LABELS_AR[currentStaff.role]}
                  </span>
                </div>

                {isPendingReview && (
                  <div className="kb-supervisor-review-controls">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() =>
                        void executeKnowledgeAction(
                          { action: 'approve_and_publish', entryId: selectedEntry.id },
                          'تم اعتماد المشرف ونشر المحتوى في سياق المساعد الذكي بنجاح.'
                        )
                      }
                    >
                      موافقة المشرف ونشر للمساعد
                    </button>

                    <div className="kb-reject-group">
                      <input
                        type="text"
                        aria-label="سبب الرفض"
                        placeholder="اكتب سبب الرفض (إلزامي عند الرفض)..."
                        value={rejectionReasonInput}
                        disabled={busy}
                        onChange={(e) => setRejectionReasonInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() =>
                          void executeKnowledgeAction(
                            {
                              action: 'reject',
                              entryId: selectedEntry.id,
                              rejectionReason: rejectionReasonInput,
                            },
                            'تم تسجيل رفض المشرف مع السبب.'
                          )
                        }
                      >
                        رفض مع ذكر السبب
                      </button>
                    </div>
                  </div>
                )}

                {selectedEntry.status === 'PUBLISHED' && (
                  <div className="kb-withdraw-group">
                    <input
                      type="text"
                      aria-label="سبب سحب المنشور"
                      placeholder="سبب سحب المنشور (اختياري)..."
                      value={withdrawReasonInput}
                      disabled={busy}
                      onChange={(e) => setWithdrawReasonInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() =>
                        void executeKnowledgeAction(
                          {
                            action: 'withdraw',
                            entryId: selectedEntry.id,
                            reasonAr: withdrawReasonInput,
                          },
                          'تم سحب المحتوى من النشر وإيقاف استرجاعه في المساعد الذكي فوراً.'
                        )
                      }
                    >
                      سحب من النشر
                    </button>
                  </div>
                )}

                {!isPendingReview && selectedEntry.status !== 'PUBLISHED' && (
                  <p className="kb-col-sub">
                    العنصر حالياً في حالة «{KNOWLEDGE_STATUS_LABELS_AR[selectedEntry.status]}». أرسله
                    لمراجعة المشرف أولاً لتفعيل قرار الاعتماد أو الرفض.
                  </p>
                )}
              </div>
            )}

            {/* Metadata & Provenance */}
            {selectedEntry && (
              <dl className="kb-provenance-grid">
                <div>
                  <dt>أنشأه</dt>
                  <dd>
                    {selectedEntry.createdByNameAr} ({STAFF_ROLE_LABELS_AR[selectedEntry.createdByRole]}) ·{' '}
                    {formatArabicTimestamp(selectedEntry.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt>آخر تعديل</dt>
                  <dd>
                    {selectedEntry.updatedByNameAr} · {formatArabicTimestamp(selectedEntry.updatedAt)}
                  </dd>
                </div>
                <div>
                  <dt>المراجعة والنشر</dt>
                  <dd>
                    {selectedEntry.reviewedByNameAr
                      ? `${selectedEntry.reviewedByNameAr} · ${formatArabicTimestamp(
                          selectedEntry.reviewedAt
                        )}`
                      : 'لم يُراجع بعد'}
                  </dd>
                </div>
                <div>
                  <dt>المنتجات المرتبطة</dt>
                  <dd>
                    {selectedEntry.productIds.length > 0
                      ? selectedEntry.productIds
                          .map((pid) => productMap.get(pid)?.nameAr ?? pid)
                          .join('، ')
                      : 'عام (كل منتجات فرع كربلاء)'}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </section>

        {/* Column 3: Audit Trail & Logged AI-Reply Feedback */}
        <aside className="kb-side-col card" aria-label="سجل المراجعة والتغذية الراجعة">
          <div className="kb-side-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === 'audit'}
              className={`dash-filter-btn ${sideTab === 'audit' ? 'active' : ''}`}
              onClick={() => setSideTab('audit')}
            >
              سجل التدقيق ({auditLogs.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === 'feedback'}
              className={`dash-filter-btn ${sideTab === 'feedback' ? 'active' : ''}`}
              onClick={() => setSideTab('feedback')}
            >
              تصحيحات الردود ({feedbacks.length})
            </button>
          </div>

          {sideTab === 'audit' ? (
            <div className="kb-audit-list" role="tabpanel">
              {auditLogs.map((log) => (
                <article key={log.id} className="kb-audit-item">
                  <div className="kb-audit-top">
                    <strong>{log.actorNameAr}</strong>
                    <span className="badge badge-dot">
                      {STAFF_ROLE_LABELS_AR[log.actorRole]}
                    </span>
                  </div>
                  <p className="kb-audit-summary">{log.summaryAr}</p>
                  {log.reasonAr && (
                    <p className="kb-audit-reason">السبب: {log.reasonAr}</p>
                  )}
                  <div className="kb-audit-meta">
                    <span>{log.toStatus ?? log.action}</span>
                    <span>{formatArabicTimestamp(log.createdAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="kb-audit-list" role="tabpanel">
              <div className="kb-feedback-disclaimer">
                <DemoBadge label="تغذية راجعة" />
                <span>
                  تُسجَّل تصحيحات ردود المساعد لمراجعة المشرفين فقط؛ لا تُنشر تلقائياً ولا تغيّر أوزان
                  النموذج.
                </span>
              </div>
              {feedbacks.map((fb) => (
                <article key={fb.id} className="kb-audit-item">
                  <div className="kb-audit-top">
                    <strong>{fb.createdByNameAr}</strong>
                    <span className="badge badge-accent">
                      {fb.conversationId} / {fb.messageId}
                    </span>
                  </div>
                  <p className="kb-feedback-orig">رد المساعد الأصلي: «{fb.originalAiText}»</p>
                  <p className="kb-audit-summary">التصحيح المقترح: «{fb.correctedReplyAr}»</p>
                  {fb.notesAr && <p className="kb-audit-reason">ملاحظة: {fb.notesAr}</p>}
                  <div className="kb-audit-meta">
                    <span>
                      {fb.linkedKnowledgeEntryId
                        ? `ارتبط بمسودة (${fb.linkedKnowledgeEntryId.slice(0, 10)}…)`
                        : 'سُجّل كتغذية راجعة فقط'}
                    </span>
                    <span>{formatArabicTimestamp(fb.createdAt)}</span>
                  </div>
                </article>
              ))}
              {feedbacks.length === 0 && (
                <div className="kb-empty-note">
                  لا توجد تصحيحات مسجلة بعد. يمكنك تسجيل تصحيح مباشرة من أي رد للمساعد في تبويب
                  «المحادثات المباشرة».
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

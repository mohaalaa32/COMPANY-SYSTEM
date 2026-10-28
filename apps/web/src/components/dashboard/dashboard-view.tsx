'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { brand } from '@tel/config/brand';
import { BrandMark, DemoBadge, DemoBanner } from '@/components/brand';
import {
  IconBell,
  IconBox,
  IconChart,
  IconChat,
  IconDevice,
  IconGrid,
  IconHand,
  IconHelp,
  IconInfo,
  IconLock,
  IconLogout,
  IconPaperclip,
  IconSearch,
  IconSend,
  IconSettings,
} from '@/components/icons';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  CONVERSATION_FILTERS,
  filterConversations,
  SENDER_LABEL_AR,
  STATUS_LABEL_AR,
  type ConversationFilterId,
  type DemoConversation,
  type ProductView,
} from '@/lib/dashboard-model';
import { formatIQD, initialsAr } from '@/lib/format';

interface DashboardViewProps {
  initialConversations: DemoConversation[];
  products: Record<string, ProductView>;
  staffUser: { nameAr: string; roleAr: string };
  demoBranch: { nameAr: string; city: string };
}

export function DashboardView({
  initialConversations,
  products,
  staffUser,
  demoBranch,
}: DashboardViewProps) {
  const [conversations, setConversations] = useState<DemoConversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string>(initialConversations[0]?.id ?? '');
  const [activeFilter, setActiveFilter] = useState<ConversationFilterId>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filtered = useMemo(() => {
    let list = filterConversations(conversations, activeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.customerNameAr.toLowerCase().includes(q) ||
          c.preview.toLowerCase().includes(q) ||
          c.cityAr.toLowerCase().includes(q)
      );
    }
    return list;
  }, [conversations, activeFilter, searchQuery]);

  const activeConv = useMemo(() => {
    return conversations.find((c) => c.id === selectedId) ?? conversations[0];
  }, [conversations, selectedId]);

  const toggleTakeover = () => {
    if (!activeConv) return;
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConv.id) return c;
        const nextStatus = c.status === 'STAFF_TAKEOVER' ? 'AI_ACTIVE' : 'STAFF_TAKEOVER';
        const nextAssignee = nextStatus === 'STAFF_TAKEOVER' ? staffUser.nameAr : undefined;
        return {
          ...c,
          status: nextStatus,
          assigneeAr: nextAssignee,
        };
      })
    );
  };

  return (
    <div className="dashboard-root">
      <DemoBanner text="لوحة تحكم الموظفين التجريبية (معاينة هيكلية): المحادثات والبيانات والمخزون تجريبية لفرع كربلاء، والإرسال معطّل." />

      <div className="dashboard-layout">
        {/* ----------------- 1. Sidebar (Right in RTL) ----------------- */}
        <aside className="dash-sidebar" aria-label="شريط التنقل الرئيسي">
          <div className="dash-sidebar-brand">
            <BrandMark tagline={brand.staffTaglineAr} />
          </div>

          <div className="dash-store-selector">
            <div>
              <div className="dash-store-name">{brand.mainStoreAr}</div>
              <span>{demoBranch.nameAr} الحصري</span>
            </div>
            <span className="badge badge-success badge-dot">نشط</span>
          </div>

          <nav className="dash-nav" aria-label="قوائم النظام">
            <button type="button" className="dash-nav-item" disabled title="غير متاح بالمعاينة">
              <IconGrid />
              <span>لوحة التحكم</span>
            </button>
            <button type="button" className="dash-nav-item active" aria-current="page">
              <IconChat />
              <span>المحادثات المباشرة</span>
            </button>
            <button type="button" className="dash-nav-item" disabled title="غير متاح بالمعاينة">
              <IconBox />
              <span>المنتجات والمخزون</span>
            </button>
            <button type="button" className="dash-nav-item" disabled title="غير متاح بالمعاينة">
              <IconChart />
              <span>الإحصائيات والأداء</span>
            </button>
            <button type="button" className="dash-nav-item" disabled title="غير متاح بالمعاينة">
              <IconSettings />
              <span>الإعدادات والربط</span>
            </button>
          </nav>

          <div className="dash-summary-card">
            <div className="dash-summary-head">
              <span>ملخص اليوم</span>
              <span className="badge badge-success badge-dot">مباشر</span>
            </div>
            <div className="dash-summary-val">128</div>
            <div className="dash-summary-sub">محادثة · 84% حل تلقائي</div>
          </div>

          <div className="dash-user-profile">
            <div className="avatar avatar-accent">{initialsAr(staffUser.nameAr)}</div>
            <div className="dash-user-info">
              <span className="dash-user-name">{staffUser.nameAr}</span>
              <span className="dash-user-role">{staffUser.roleAr}</span>
            </div>
            <Link href="/" className="icon-btn" title="الرجوع لواجهة العميل" aria-label="الرجوع لواجهة العميل">
              <IconLogout />
            </Link>
          </div>
        </aside>

        {/* ----------------- 2. Conversation List Column ----------------- */}
        <section className="dash-convs-col" aria-label="قائمة المحادثات">
          <header className="dash-convs-head">
            <div className="dash-convs-title-group">
              <h2>المحادثات</h2>
              <span className="badge badge-primary">{conversations.length} نشطة</span>
            </div>
            <DemoBadge label="تجريبية" />
          </header>

          <div className="dash-convs-search">
            <IconSearch />
            <input
              type="search"
              placeholder="ابحث عن عميل أو رقم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="البحث في المحادثات"
            />
          </div>

          <div className="dash-filters-tabs" role="tablist" aria-label="تصفية المحادثات">
            {CONVERSATION_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === f.id}
                className={`dash-filter-btn ${activeFilter === f.id ? 'active' : ''}`}
                onClick={() => setActiveFilter(f.id)}
              >
                {f.labelAr}
              </button>
            ))}
          </div>

          <div className="dash-convs-list" role="tabpanel">
            {filtered.map((conv) => {
              const isSelected = activeConv?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedId(conv.id)}
                  className={`dash-conv-card ${isSelected ? 'active' : ''}`}
                  aria-pressed={isSelected}
                >
                  <div className="dash-conv-avatar">{initialsAr(conv.customerNameAr)}</div>
                  <div className="dash-conv-content">
                    <div className="dash-conv-top">
                      <span className="dash-conv-name">{conv.customerNameAr}</span>
                      <span className="dash-conv-time">{conv.timeLabel}</span>
                    </div>
                    <span className="dash-conv-preview">{conv.preview}</span>
                    <div className="dash-conv-meta">
                      <span className="badge badge-dot">{STATUS_LABEL_AR[conv.status]}</span>
                      {conv.unread > 0 && <span className="dash-unread-badge">{conv.unread}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                لا توجد محادثات مطابقة للتصفية.
              </div>
            )}
          </div>
        </section>

        {/* ----------------- 3. Chat / Monitoring Column ----------------- */}
        <main className="dash-chat-col" aria-label="نافذة المحادثة النشطة">
          {/* Top Bar with Metrics */}
          <header className="dash-chat-topbar">
            <div className="dash-topbar-start">
              <div className="dash-mobile-brand">
                <BrandMark tagline={brand.staffTaglineAr} />
              </div>
              <div className="dash-center-title">
                <h1>مركز خدمة العملاء</h1>
                <span className="dash-center-subtitle">مراقبة الذكاء الاصطناعي والمحادثات المباشرة</span>
              </div>
            </div>
            <div className="dash-metrics-bar">
              <dl className="dash-metric-pill">
                <dt>معدل الحل</dt>
                <dd style={{ color: 'var(--success)' }}>84%</dd>
              </dl>
              <dl className="dash-metric-pill">
                <dt>وقت الرد</dt>
                <dd>42ث</dd>
              </dl>
              <dl className="dash-metric-pill">
                <dt>بانتظار موظف</dt>
                <dd style={{ color: 'var(--warning)' }}>6</dd>
              </dl>
              <ThemeToggle />
              <button type="button" className="icon-btn" disabled aria-label="الإشعارات (غير متاحة)">
                <IconBell />
              </button>
              <button type="button" className="icon-btn" disabled aria-label="المساعدة (غير متاحة)">
                <IconHelp />
              </button>
            </div>
          </header>

          {/* Active Conversation Header */}
          {activeConv && (
            <div className="dash-chat-active-header">
              <div className="dash-customer-target">
                <div className="avatar">{initialsAr(activeConv.customerNameAr)}</div>
                <div>
                  <h2>{activeConv.customerNameAr}</h2>
                  <div className="dash-customer-status-line">
                    <span className="badge badge-success badge-dot">متصلة الآن</span>
                    <span>المحادثة #{activeConv.id} · {activeConv.channelAr}</span>
                  </div>
                </div>
              </div>

              <div className="dash-chat-actions">
                <button
                  type="button"
                  id="staff-takeover-btn"
                  className={`btn ${activeConv.status === 'STAFF_TAKEOVER' ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={toggleTakeover}
                  title="تبديل حالة الاستلام في الذاكرة التوضيحية"
                >
                  <IconHand />
                  <span>
                    {activeConv.status === 'STAFF_TAKEOVER' ? 'إرجاع للمساعد الذكي' : 'استلام المحادثة'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Messages View */}
          <div className="dash-messages-view">
            <div className="preview-notice" role="note">
              <IconInfo />
              <span>هذه بيانات تجريبية ثابتة لمراقبة سلوك المساعد والمحادثة. الإرسال الفعلي غير مفعّل.</span>
            </div>

            {activeConv?.messages.map((msg) => {
              if (msg.sender === 'INTERNAL_NOTE') {
                return (
                  <div key={msg.id} className="msg-row msg-row-note">
                    <div className="msg-note-box">
                      <IconLock />
                      <span>{msg.text}</span>
                    </div>
                  </div>
                );
              }

              const isCustomer = msg.sender === 'CUSTOMER';
              const isStaff = msg.sender === 'STAFF';
              const bubbleClass = isCustomer
                ? 'msg-bubble-customer'
                : isStaff
                ? 'msg-bubble-staff'
                : 'msg-bubble-ai';

              const rowClass = isCustomer
                ? 'msg-row-customer'
                : isStaff
                ? 'msg-row-staff'
                : 'msg-row-ai';

              return (
                <div key={msg.id} className={`msg-row ${rowClass} animate-in`}>
                  <div className="msg-meta-line">
                    <span>{msg.authorAr}</span>
                    <span>·</span>
                    <span>{SENDER_LABEL_AR[msg.sender]}</span>
                    <span>·</span>
                    <span>{msg.timeLabel}</span>
                  </div>
                  <div className={`msg-bubble ${bubbleClass}`}>
                    <p>{msg.text}</p>
                    {msg.productIds?.map((pid) => {
                      const prod = products[pid];
                      if (!prod) return null;
                      return (
                        <div key={pid} className="msg-product-attachment">
                          <div className="msg-prod-thumb">
                            <IconDevice />
                          </div>
                          <div className="msg-prod-info">
                            <span className="msg-prod-title">{prod.nameAr}</span>
                            <span className="msg-prod-price">{formatIQD(prod.priceIQD)}</span>
                            <span className="dash-stock-note">
                              {prod.karbalaQty > 0
                                ? `${prod.karbalaQty} قطع متوفرة بفرع كربلاء`
                                : 'غير متوفر'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composer Area */}
          <footer className="dash-composer-area">
            <div className="dash-quick-chips">
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>إجراءات:</span>
              <button type="button" className="chip" disabled>
                تفاصيل التوصيل
              </button>
              <button type="button" className="chip" disabled>
                إرسال رابط الدفع
              </button>
              <button type="button" className="chip" disabled>
                تأكيد التوفر بفرع كربلاء
              </button>
            </div>
            <div className="dash-composer-box">
              <input
                type="text"
                placeholder="اكتب رداً أو استخدم / للردود الجاهزة (غير مفعّل في هذه المعاينة)"
                disabled
              />
              <button type="button" className="icon-btn" disabled aria-label="إرفاق ملف">
                <IconPaperclip />
              </button>
              <button type="button" className="composer-send" disabled aria-label="إرسال">
                <IconSend />
              </button>
            </div>
          </footer>
        </main>

        {/* ----------------- 4. Customer Details Column ----------------- */}
        {activeConv && (
          <aside className="dash-details-col" aria-label="تفاصيل العميل والطلب">
            <div className="dash-details-head">
              <h2>تفاصيل العميل</h2>
              <DemoBadge />
            </div>

            <div className="dash-customer-card">
              <div className="dash-customer-avatar-lg">
                {initialsAr(activeConv.customerNameAr)}
              </div>
              <h3 className="dash-customer-name-lg">{activeConv.customerNameAr}</h3>
              <span className="dash-customer-sub">
                +964 770 123 4567 · {activeConv.cityAr}
              </span>
              <div className="dash-customer-tags">
                <span className="badge badge-accent">{activeConv.channelAr}</span>
                <span className="badge badge-success">عميلة متكررة</span>
              </div>
            </div>

            <div className="dash-section-box">
              <div className="dash-section-title">المحادثة والتعيين</div>
              <dl className="dash-prop-list">
                <div className="dash-prop-row">
                  <dt>الحالة</dt>
                  <dd>
                    <span className="badge badge-dot">{STATUS_LABEL_AR[activeConv.status]}</span>
                  </dd>
                </div>
                <div className="dash-prop-row">
                  <dt>الموظف المسؤول</dt>
                  <dd>{activeConv.assigneeAr ?? 'المساعد الذكي'}</dd>
                </div>
                <div className="dash-prop-row">
                  <dt>الأولوية</dt>
                  <dd>{activeConv.priorityAr}</dd>
                </div>
                <div className="dash-prop-row">
                  <dt>مدة المحادثة</dt>
                  <dd>08:14</dd>
                </div>
              </dl>
            </div>

            <div className="dash-section-box">
              <div className="dash-section-title">صحة الاتصال والربط</div>
              <dl className="dash-prop-list">
                <div className="dash-prop-row">
                  <dt>حالة الـ API</dt>
                  <dd>
                    <span className="badge badge-success badge-dot">سليم (تجريبي)</span>
                  </dd>
                </div>
                <div className="dash-prop-row">
                  <dt>WhatsApp Cloud</dt>
                  <dd>99.9%</dd>
                </div>
                <div className="dash-prop-row">
                  <dt>نظام المخزون</dt>
                  <dd>38ms</dd>
                </div>
                <div className="dash-prop-row">
                  <dt>الفرع المعتمد</dt>
                  <dd>{demoBranch.nameAr} فقط</dd>
                </div>
              </dl>
            </div>

            <div className="dash-section-box">
              <div className="dash-section-title">نتائج مرتبطة ومخزون حي</div>
              <div className="dash-products-list">
                {activeConv.linkedProductIds.map((pid) => {
                  const prod = products[pid];
                  if (!prod) return null;
                  return (
                    <article key={pid} className="dash-product-item">
                      <div className="dash-product-thumb">
                        <IconDevice />
                      </div>
                      <div className="dash-product-details">
                        <span className="dash-product-title">{prod.nameAr}</span>
                        <span className="dash-product-price">{formatIQD(prod.priceIQD)}</span>
                        <span className="dash-stock-note">
                          {prod.karbalaQty > 0
                            ? `${prod.karbalaQty} قطع بفرع كربلاء`
                            : 'غير متوفر'}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="dash-escalation-card">
              <div className="dash-escalation-head">
                <span>التصعيد والمتابعة</span>
                <span className="badge badge-warning">SLA 03:46</span>
              </div>
              <p className="dash-escalation-body">
                صعّد لفريق المبيعات إذا طلبت العميلة خصماً أو حجزاً أطول.
              </p>
              <div className="dash-escalation-actions">
                <button type="button" className="btn btn-danger btn-block" disabled>
                  تصعيد المحادثة
                </button>
                <button type="button" className="btn btn-secondary btn-block" disabled>
                  وضع تم الحل
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

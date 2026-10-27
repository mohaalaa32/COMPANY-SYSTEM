import { brand } from '@tel/config/brand';
import { BrandMark, DemoBanner, DemoBadge } from '@/components/brand';
import { CompareTable, ProductMiniCard, ProductRowCard } from '@/components/customer/product-cards';
import { CustomerProductSearch } from '@/components/customer/product-search';
import {
  IconBag,
  IconBot,
  IconCheckCircle,
  IconHeadset,
  IconInfo,
  IconMore,
  IconSend,
  IconShield,
} from '@/components/icons';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  CUSTOMER_PREVIEW,
  DEMO_BRANCH,
  getDemoProduct,
  searchCustomerCatalog,
} from '@/lib/demo-data';

export default async function CustomerPage() {
  const suggestions = CUSTOMER_PREVIEW.suggestionIds.map(getDemoProduct);
  const accessory = getDemoProduct(CUSTOMER_PREVIEW.accessoryId);
  const compared = CUSTOMER_PREVIEW.compareIds.map(getDemoProduct);
  const initialSearch = await searchCustomerCatalog({});

  return (
    <div className="customer-page">
      <DemoBanner text="معاينة هيكلية: المنتجات والأسعار والمخزون بيانات تجريبية، والمحادثة والإرسال غير مفعّلين بعد." />

      <header className="site-header">
        <div className="site-header-inner">
          <BrandMark />
          <nav className="site-header-actions" aria-label="إجراءات الموقع">
            <button type="button" className="btn btn-secondary header-track" disabled title="غير متاح بعد">
              تتبع الطلب
            </button>
            <ThemeToggle />
            <button type="button" className="icon-btn" disabled aria-label="السلة (غير متاحة بعد)" title="غير متاحة بعد">
              <IconBag />
            </button>
          </nav>
        </div>
      </header>

      <main className="customer-main">
        <h1 className="sr-only">{brand.fullTitleAr}</h1>

        <aside className="side-card side-card-support card animate-in" aria-labelledby="support-title">
          <span className="side-card-icon side-card-icon-primary">
            <IconHeadset />
          </span>
          <h2 id="support-title">{brand.supportAr.title}</h2>
          <p className="side-card-body">{brand.supportAr.body}</p>
          <dl className="side-card-facts">
            <div>
              <dt>المساعد الذكي</dt>
              <dd>
                <span className="badge badge-warning badge-dot">غير مفعّل بعد</span>
              </dd>
            </div>
            <div>
              <dt>وقت الرد</dt>
              <dd>يُحدَّد عند التشغيل</dd>
            </div>
          </dl>
        </aside>

        <section className="chat-card card" aria-labelledby="chat-title">
          <header className="chat-card-head">
            <span className="chat-bot-icon">
              <IconBot />
            </span>
            <div className="chat-card-title">
              <h2 id="chat-title">{brand.assistantDisplayAr}</h2>
              <span className="badge badge-dot">غير متصل · معاينة</span>
            </div>
            <button type="button" className="icon-btn" disabled aria-label="خيارات (غير متاحة بعد)">
              <IconMore />
            </button>
          </header>

          <div className="chat-body" id="chat-preview">
            <div className="preview-notice" role="note">
              <IconInfo />
              <span>مثال توضيحي ثابت لشكل المحادثة، وليس محادثة حقيقية. لا يُرسل أي شيء.</span>
            </div>

            <div className="chat-stamp">
              <span>{CUSTOMER_PREVIEW.timeLabel}</span>
            </div>

            <div className="bubble bubble-customer animate-in">{CUSTOMER_PREVIEW.customerBudgetText}</div>

            <div className="ai-block animate-in">
              <div className="ai-block-meta">
                <span className="ai-dot" aria-hidden="true" />
                <span>{brand.assistantDisplayAr}</span>
                <DemoBadge />
              </div>
              <p>{CUSTOMER_PREVIEW.aiIntroText}</p>
              <div className="product-carousel" role="list" aria-label="منتجات مقترحة (تجريبية)">
                {suggestions.map((p) => (
                  <div role="listitem" key={p.id}>
                    <ProductMiniCard product={p} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bubble bubble-customer animate-in">{CUSTOMER_PREVIEW.customerAccessoryText}</div>

            <div className="ai-block animate-in">
              <div className="ai-block-meta">
                <span className="ai-dot" aria-hidden="true" />
                <span>{brand.assistantDisplayAr}</span>
                <DemoBadge />
              </div>
              <ProductRowCard product={accessory} />
            </div>

            <div className="ai-block ai-block-accent animate-in">
              <CompareTable products={compared} />
            </div>
          </div>

          <footer className="chat-foot">
            <p className="chat-foot-label">اختصارات سريعة</p>
            <div className="quick-replies">
              {CUSTOMER_PREVIEW.quickReplies.map((q) => (
                <button type="button" key={q} className="chip" disabled>
                  {q}
                </button>
              ))}
            </div>
            <form className="composer" aria-label="كتابة رسالة (غير مفعّلة)">
              <label htmlFor="customer-message" className="sr-only">
                رسالتك
              </label>
              <input
                id="customer-message"
                type="text"
                placeholder="المحادثة غير مفعّلة في هذه المعاينة"
                disabled
                autoComplete="off"
              />
              <button type="submit" id="customer-send" className="composer-send" disabled aria-label="إرسال (غير مفعّل)">
                <IconSend />
              </button>
            </form>
            <button type="button" id="customer-handoff" className="link-btn" disabled title="غير مفعّل في هذه المعاينة">
              التحدث مع موظف
            </button>
          </footer>
        </section>

        <aside className="side-card side-card-trust card animate-in" aria-labelledby="trust-title">
          <span className="side-card-icon side-card-icon-accent">
            <IconShield />
          </span>
          <h2 id="trust-title">{brand.trustAr.title}</h2>
          <p className="side-card-body">
            {DEMO_BRANCH.nameAr} هو الفرع الوحيد حالياً. الأسعار والمخزون المعروضة هنا تجريبية إلى حين ربط نظام الشركة.
          </p>
          <ul className="trust-list">
            <li>
              <IconCheckCircle />
              <span>فرع واحد: {DEMO_BRANCH.city}</span>
            </li>
            <li>
              <IconCheckCircle />
              <span>الأسعار من الكتالوج التجريبي</span>
            </li>
            <li className="trust-pending">
              <IconInfo />
              <span>سياسة التوصيل ورسومه: غير محددة بعد</span>
            </li>
          </ul>
        </aside>
      </main>

      <div className="customer-catalog-container">
        <CustomerProductSearch
          initialItems={initialSearch.items}
          branchNameAr={DEMO_BRANCH.nameAr}
        />
      </div>
    </div>
  );
}

import { brand } from '@tel/config/brand';
import { BrandMark, DemoBanner } from '@/components/brand';
import { CustomerChat } from '@/components/customer/customer-chat';
import { CustomerProductSearch } from '@/components/customer/product-search';
import {
  IconBag,
  IconCheckCircle,
  IconHeadset,
  IconInfo,
  IconShield,
} from '@/components/icons';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  CUSTOMER_PREVIEW,
  DEMO_BRANCH,
  getDemoProduct,
  searchCustomerCatalog,
  toCustomerProductItem,
} from '@/lib/demo-data';

export default async function CustomerPage() {
  const suggestions = CUSTOMER_PREVIEW.suggestionIds.map((id) =>
    toCustomerProductItem(getDemoProduct(id))
  );
  const accessory = toCustomerProductItem(getDemoProduct(CUSTOMER_PREVIEW.accessoryId));
  const compared = CUSTOMER_PREVIEW.compareIds.map((id) =>
    toCustomerProductItem(getDemoProduct(id))
  );
  const initialSearch = await searchCustomerCatalog({});

  return (
    <div className="customer-page">
      <DemoBanner text="وضع تجريبي محلي مفعّل: المحادثة تعمل عبر المساعد التجريبي (MockLLMProvider) على كتالوج ومخزون فرع كربلاء التجريبيين — ليست بيانات نظام الشركة الحي بعد." />

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
                <span className="badge badge-accent badge-dot">متصل · وضع تجريبي (Mock)</span>
              </dd>
            </div>
            <div>
              <dt>البيانات والمخزون</dt>
              <dd>كتالوج كربلاء التجريبي</dd>
            </div>
          </dl>
        </aside>

        <CustomerChat
          preview={{
            timeLabel: CUSTOMER_PREVIEW.timeLabel,
            customerBudgetText: CUSTOMER_PREVIEW.customerBudgetText,
            aiIntroText: CUSTOMER_PREVIEW.aiIntroText,
            suggestions,
            customerAccessoryText: CUSTOMER_PREVIEW.customerAccessoryText,
            accessory,
            compared,
            quickReplies: CUSTOMER_PREVIEW.quickReplies,
          }}
        />

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

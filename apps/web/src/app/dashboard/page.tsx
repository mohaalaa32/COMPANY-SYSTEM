import type { Metadata } from 'next';
import { brand } from '@tel/config/brand';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import {
  dashboardProductViews,
  DEMO_BRANCH,
  DEMO_CONVERSATIONS,
  DEMO_STAFF_USER,
} from '@/lib/demo-data';

export const metadata: Metadata = {
  title: `لوحة تحكم الموظفين | ${brand.nameAr}`,
  description: `مراقبة محادثات المساعد الذكي وإدارة طلبات العملاء لـ ${brand.nameAr} - فرع كربلاء.`,
};

export default function DashboardPage() {
  const products = dashboardProductViews();

  return (
    <DashboardView
      initialConversations={DEMO_CONVERSATIONS}
      products={products}
      staffUser={DEMO_STAFF_USER}
      demoBranch={{ nameAr: DEMO_BRANCH.nameAr, city: DEMO_BRANCH.city }}
    />
  );
}

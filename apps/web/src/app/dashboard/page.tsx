import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { brand } from '@tel/config/brand';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import {
  dashboardProductViews,
  DEMO_BRANCH,
  DEMO_CONVERSATIONS,
  DEMO_STAFF_USER,
} from '@/lib/demo-data';
import { getInitialKnowledgeDashboardState } from '@/lib/knowledge-server';
import { resolveDashboardStaffSession, STAFF_SESSION_COOKIE_NAME } from '@/lib/staff-session';

export const metadata: Metadata = {
  title: `لوحة تحكم الموظفين | ${brand.nameAr}`,
  description: `مراقبة محادثات المساعد الذكي وإدارة قاعدة المعرفة لـ ${brand.nameAr} - فرع كربلاء.`,
};

export default async function DashboardPage() {
  const products = dashboardProductViews();
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(STAFF_SESSION_COOKIE_NAME)?.value ?? null;
  const sessionState = resolveDashboardStaffSession(cookieVal);
  const kbState = getInitialKnowledgeDashboardState();

  return (
    <DashboardView
      initialConversations={DEMO_CONVERSATIONS}
      products={products}
      staffUser={DEMO_STAFF_USER}
      demoBranch={{ nameAr: DEMO_BRANCH.nameAr, city: DEMO_BRANCH.city }}
      initialStaffSession={sessionState.current}
      availableDevAccounts={sessionState.availableDevAccounts}
      initialKnowledgeState={kbState}
    />
  );
}

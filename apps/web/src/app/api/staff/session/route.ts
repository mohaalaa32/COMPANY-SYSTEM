import { NextResponse } from 'next/server';
import {
  createSignedStaffSessionToken,
  DEFAULT_DEV_STAFF_ID,
  parseCookieHeader,
  resolveDashboardStaffSession,
  SERVER_STAFF_DIRECTORY,
  STAFF_SESSION_COOKIE_NAME,
} from '../../../../lib/staff-session';

export async function GET(request: Request) {
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const existingCookie = cookies[STAFF_SESSION_COOKIE_NAME];
  const sessionState = resolveDashboardStaffSession(existingCookie);

  const response = NextResponse.json(sessionState, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });

  // Ensure an HttpOnly signed session cookie is present in isolated dev mode (least privilege: STAFF)
  if (!existingCookie && process.env.NODE_ENV !== 'production') {
    const token = createSignedStaffSessionToken(DEFAULT_DEV_STAFF_ID);
    response.cookies.set({
      name: STAFF_SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }

  return response;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        error: 'dev_session_switch_disabled_in_production',
        messageAr: 'تبديل حساب التطوير المعزول غير متاح في بيئة الإنتاج.',
      },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const staffId = typeof body.staffId === 'string' ? body.staffId.trim() : '';

    if (!staffId || !SERVER_STAFF_DIRECTORY[staffId]) {
      return NextResponse.json(
        {
          error: 'unknown_staff_account',
          messageAr: 'حساب الموظف المطلوب غير مسجل في دليل الخادم لفرع كربلاء.',
        },
        { status: 400 }
      );
    }

    const token = createSignedStaffSessionToken(staffId);
    const sessionState = resolveDashboardStaffSession(token);

    const response = NextResponse.json(sessionState, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });

    response.cookies.set({
      name: STAFF_SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json(
      {
        error: 'invalid_json',
        messageAr: 'صيغة الطلب غير صالحة.',
      },
      { status: 400 }
    );
  }
}

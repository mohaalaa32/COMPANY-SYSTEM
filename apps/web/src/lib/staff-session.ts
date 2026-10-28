/**
 * Server-side Staff Session & RBAC Verification (0-D1c)
 *
 * SECURITY GUARANTEES:
 * 1. Never trusts `role`, `actorRole`, or `isSupervisor` from client request bodies, query strings,
 *    or unsigned headers.
 * 2. Resolves staff identity and role (`STAFF` vs `SUPERVISOR`) exclusively from the server-side
 *    staff directory after verifying an HMAC-SHA256 signed session token (`tel_staff_session`).
 * 3. In development/test (`NODE_ENV !== 'production'`), operates in an explicitly declared
 *    Isolated Development Auth Mode (`isolated_dev`) with two server-registered Karbala accounts
 *    so staff vs. supervisor workflows can be exercised and tested without faking client-side RBAC.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { StaffActor, StaffRole } from '@tel/adapters';
import { KnowledgeAuthorizationError } from '@tel/adapters';
import type { StaffSessionView } from './knowledge-model';

export const STAFF_SESSION_COOKIE_NAME = 'tel_staff_session';

export interface ServerStaffAccount extends StaffActor {
  titleAr: string;
}

export const SERVER_STAFF_DIRECTORY: Readonly<Record<string, ServerStaffAccount>> = {
  'staff-karbala-1': {
    id: 'staff-karbala-1',
    nameAr: 'زهراء العلي',
    role: 'STAFF',
    titleAr: 'موظفة مبيعات — فرع كربلاء',
  },
  'supervisor-karbala-1': {
    id: 'supervisor-karbala-1',
    nameAr: 'أحمد الكربلائي',
    role: 'SUPERVISOR',
    titleAr: 'مشرف المبيعات — فرع كربلاء',
  },
};

export const DEFAULT_DEV_STAFF_ID = 'staff-karbala-1';

const DEV_FALLBACK_SECRET = 'tel-baghdad-isolated-dev-hmac-secret-0d1c-do-not-use-in-prod';

function getSessionSecret(): { secret: string; authMode: 'isolated_dev' | 'production_secret' } {
  const configured = process.env.STAFF_SESSION_SECRET;
  if (configured && configured.trim().length >= 16) {
    return { secret: configured.trim(), authMode: 'production_secret' };
  }
  if (process.env.NODE_ENV === 'production') {
    throw new KnowledgeAuthorizationError(
      'missing_production_session_secret',
      'متغير البيئة STAFF_SESSION_SECRET غير مضبوط في بيئة الإنتاج.'
    );
  }
  return { secret: DEV_FALLBACK_SECRET, authMode: 'isolated_dev' };
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Creates an HMAC-SHA256 signed session token for a registered server staff ID.
 * Note: the role is NOT trusted from the token payload; the server always looks up the role
 * from `SERVER_STAFF_DIRECTORY[staffId]`.
 */
export function createSignedStaffSessionToken(staffId: string): string {
  const account = SERVER_STAFF_DIRECTORY[staffId];
  if (!account) {
    throw new KnowledgeAuthorizationError(
      'unknown_staff_account',
      'حساب الموظف غير مسجل في دليل الخادم لفرع كربلاء.'
    );
  }
  const { secret } = getSessionSecret();
  const issuedAt = Date.now().toString(36);
  const payload = `${account.id}.${issuedAt}`;
  const sig = signPayload(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * Verifies an HMAC-SHA256 signed session token and resolves the authoritative server account.
 */
export function verifySignedStaffSessionToken(token: string | undefined | null): StaffSessionView | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [staffId, issuedAt, providedSig] = parts;
  if (!staffId || !issuedAt || !providedSig) return null;

  const account = SERVER_STAFF_DIRECTORY[staffId];
  if (!account) return null;

  const { secret, authMode } = getSessionSecret();
  const payload = `${staffId}.${issuedAt}`;
  const expectedSig = signPayload(payload, secret);

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  return {
    id: account.id,
    nameAr: account.nameAr,
    role: account.role,
    titleAr: account.titleAr,
    authMode,
  };
}

export function parseCookieHeader(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      out[key] = decodeURIComponent(val);
    }
  }
  return out;
}

/**
 * Resolves the authenticated staff actor from an incoming HTTP Request's signed cookie.
 * Never reads role or identity from the request body or unsigned headers.
 */
export function requireServerStaffActorFromRequest(request: Request): StaffSessionView {
  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookieHeader(cookieHeader);
  const rawToken = cookies[STAFF_SESSION_COOKIE_NAME];

  if (!rawToken) {
    throw new KnowledgeAuthorizationError(
      'missing_staff_session',
      'غير مصرح: يجب توفر جلسة موظف موقعة من الخادم لإجراء هذه العملية.'
    );
  }

  const verified = verifySignedStaffSessionToken(rawToken);
  if (!verified) {
    throw new KnowledgeAuthorizationError(
      'invalid_staff_session',
      'غير مصرح: توقيع جلسة الموظف غير صالح أو منتهي الصلاحية.'
    );
  }

  return verified;
}

/**
 * Resolves the current session for rendering `/dashboard` (defaults to least-privilege `STAFF`
 * in non-production isolated dev mode when no cookie is set yet).
 */
export function resolveDashboardStaffSession(cookieValue?: string | null): {
  current: StaffSessionView;
  availableDevAccounts: StaffSessionView[];
} {
  const { authMode } = getSessionSecret();
  const verified = verifySignedStaffSessionToken(cookieValue);
  const fallbackAccount = SERVER_STAFF_DIRECTORY[DEFAULT_DEV_STAFF_ID]!;
  const current: StaffSessionView = verified ?? {
    id: fallbackAccount.id,
    nameAr: fallbackAccount.nameAr,
    role: fallbackAccount.role as StaffRole,
    titleAr: fallbackAccount.titleAr,
    authMode,
  };

  const availableDevAccounts: StaffSessionView[] = Object.values(SERVER_STAFF_DIRECTORY).map(
    (acc) => ({
      id: acc.id,
      nameAr: acc.nameAr,
      role: acc.role,
      titleAr: acc.titleAr,
      authMode,
    })
  );

  return { current, availableDevAccounts };
}

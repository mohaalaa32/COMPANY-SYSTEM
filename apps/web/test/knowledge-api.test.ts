import { describe, expect, it } from 'vitest';

process.env.KB_SQLITE_PATH = ':memory:';

import { POST as knowledgePost } from '../src/app/api/knowledge/route';
import { POST as feedbackPost } from '../src/app/api/knowledge/feedback/route';
import {
  createSignedStaffSessionToken,
  STAFF_SESSION_COOKIE_NAME,
} from '../src/lib/staff-session';

function buildAuthenticatedRequest(
  url: string,
  body: Record<string, unknown>,
  staffId?: 'staff-karbala-1' | 'supervisor-karbala-1' | 'tampered'
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (staffId === 'tampered') {
    headers.set('cookie', `${STAFF_SESSION_COOKIE_NAME}=supervisor-karbala-1.12345.forgedsig`);
  } else if (staffId) {
    const token = createSignedStaffSessionToken(staffId);
    headers.set('cookie', `${STAFF_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`);
  }

  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('Staff Knowledge Base & AI Feedback HTTP Server Routes (0-D1c)', () => {
  it('rejects unauthenticated or tampered session requests with 401', async () => {
    const unauthReq = buildAuthenticatedRequest('http://localhost:3000/api/knowledge', {
      action: 'create',
      category: 'FAQ',
      titleAr: 'سؤال تجريبي',
      contentAr: 'محتوى تجريبي للاختبار.',
    });
    const unauthRes = await knowledgePost(unauthReq);
    expect(unauthRes.status).toBe(401);

    const tamperedReq = buildAuthenticatedRequest(
      'http://localhost:3000/api/knowledge',
      {
        action: 'create',
        category: 'FAQ',
        titleAr: 'سؤال تجريبي',
        contentAr: 'محتوى تجريبي للاختبار.',
      },
      'tampered'
    );
    const tamperedRes = await knowledgePost(tamperedReq);
    expect(tamperedRes.status).toBe(401);
  });

  it('rejects direct server requests from STAFF attempting supervisor approval/rejection/withdrawal even if body claims SUPERVISOR role', async () => {
    // 1. Staff creates and submits an entry for approval
    const createReq = buildAuthenticatedRequest(
      'http://localhost:3000/api/knowledge',
      {
        action: 'create',
        category: 'FAQ',
        titleAr: 'سؤال حول توفر الأجهزة بفرع كربلاء',
        contentAr: 'يتم التأكد من التوفر عبر أداة فحص المخزون لفرع كربلاء.',
        submitForApproval: true,
      },
      'staff-karbala-1'
    );
    const createRes = await knowledgePost(createReq);
    expect(createRes.status).toBe(200);
    const createdData = (await createRes.json()) as { entry: { id: string; status: string } };
    expect(createdData.entry.status).toBe('PENDING_APPROVAL');
    const entryId = createdData.entry.id;

    // 2. Staff tries to approve & publish directly, injecting `role: 'SUPERVISOR'` in request body
    const unauthorizedApproveReq = buildAuthenticatedRequest(
      'http://localhost:3000/api/knowledge',
      {
        action: 'approve_and_publish',
        entryId,
        role: 'SUPERVISOR',
        actorRole: 'SUPERVISOR',
        actor: { id: 'supervisor-karbala-1', role: 'SUPERVISOR' },
      },
      'staff-karbala-1'
    );
    const unauthorizedApproveRes = await knowledgePost(unauthorizedApproveReq);
    expect(unauthorizedApproveRes.status).toBe(403);
    const errBody = (await unauthorizedApproveRes.json()) as { error: string };
    expect(errBody.error).toBe('supervisor_role_required');

    // 3. Supervisor approves & publishes -> succeeds (200)
    const supervisorApproveReq = buildAuthenticatedRequest(
      'http://localhost:3000/api/knowledge',
      {
        action: 'approve_and_publish',
        entryId,
      },
      'supervisor-karbala-1'
    );
    const supervisorApproveRes = await knowledgePost(supervisorApproveReq);
    expect(supervisorApproveRes.status).toBe(200);
    const approvedData = (await supervisorApproveRes.json()) as {
      entry: { status: string; publishedVersion: number };
    };
    expect(approvedData.entry.status).toBe('PUBLISHED');
    expect(approvedData.entry.publishedVersion).toBe(1);

    // 4. Staff tries to withdraw the published entry -> rejected with 403
    const unauthorizedWithdrawReq = buildAuthenticatedRequest(
      'http://localhost:3000/api/knowledge',
      {
        action: 'withdraw',
        entryId,
        role: 'SUPERVISOR',
      },
      'staff-karbala-1'
    );
    const unauthorizedWithdrawRes = await knowledgePost(unauthorizedWithdrawReq);
    expect(unauthorizedWithdrawRes.status).toBe(403);
  });

  it('validates conversationId and AI messageId when logging AI-reply corrections and never auto-publishes', async () => {
    // 1. Attempt to log feedback on a customer message (m1 is CUSTOMER, not AI) -> 400
    const invalidMsgReq = buildAuthenticatedRequest(
      'http://localhost:3000/api/knowledge/feedback',
      {
        conversationId: 'demo-conv-1',
        messageId: 'm1',
        correctedReplyAr: 'رد مصحح تجريبي.',
      },
      'staff-karbala-1'
    );
    const invalidMsgRes = await feedbackPost(invalidMsgReq);
    expect(invalidMsgRes.status).toBe(400);

    // 2. Log feedback on actual AI message (demo-conv-1 / m2) with createDraftEntry: true
    const validFeedbackReq = buildAuthenticatedRequest(
      'http://localhost:3000/api/knowledge/feedback',
      {
        conversationId: 'demo-conv-1',
        messageId: 'm2',
        correctedReplyAr:
          'أهلاً بيج، جهاز Galaxy A55 مناسب للكاميرا والبطارية، وتتوفر إله حافظة متوافقة في فرع كربلاء.',
        notesAr: 'توضيح وجود الحافظة المتوافقة',
        createDraftEntry: true,
      },
      'staff-karbala-1'
    );
    const validFeedbackRes = await feedbackPost(validFeedbackReq);
    expect(validFeedbackRes.status).toBe(200);

    const fbData = (await validFeedbackRes.json()) as {
      feedback: { conversationId: string; messageId: string; linkedKnowledgeEntryId?: string };
      draftEntry?: { id: string; status: string; publishedVersion: number };
    };
    expect(fbData.feedback.conversationId).toBe('demo-conv-1');
    expect(fbData.feedback.messageId).toBe('m2');
    expect(fbData.draftEntry).toBeDefined();
    // Crucial: created entry from feedback is DRAFT (version 0), NEVER auto-published
    expect(fbData.draftEntry?.status).toBe('DRAFT');
    expect(fbData.draftEntry?.publishedVersion).toBe(0);
  });
});

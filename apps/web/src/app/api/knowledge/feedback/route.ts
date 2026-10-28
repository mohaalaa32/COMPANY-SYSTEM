import { NextResponse } from 'next/server';
import {
  getInitialKnowledgeDashboardState,
  mapKnowledgeErrorToHttpResponse,
  recordVerifiedConversationAiFeedback,
} from '../../../../lib/knowledge-server';
import { requireServerStaffActorFromRequest } from '../../../../lib/staff-session';

export async function POST(request: Request) {
  try {
    // Strictly resolve actor & role from the HMAC-signed server session cookie.
    const actor = requireServerStaffActorFromRequest(request);
    const rawBody = (await request.json()) as Record<string, unknown>;

    const result = recordVerifiedConversationAiFeedback(actor, rawBody);
    const state = getInitialKnowledgeDashboardState();

    return NextResponse.json(
      {
        feedback: result.feedback,
        draftEntry: result.draftEntry,
        entries: state.entries,
        feedbacks: state.feedbacks,
        auditLogs: state.auditLogs,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (err) {
    const mapped = mapKnowledgeErrorToHttpResponse(err);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

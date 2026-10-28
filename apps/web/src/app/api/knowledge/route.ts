import { NextResponse } from 'next/server';
import {
  executeServerKnowledgeAction,
  getInitialKnowledgeDashboardState,
  mapKnowledgeErrorToHttpResponse,
} from '../../../lib/knowledge-server';
import { requireServerStaffActorFromRequest } from '../../../lib/staff-session';

export async function GET() {
  try {
    const state = getInitialKnowledgeDashboardState();
    return NextResponse.json(state, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const mapped = mapKnowledgeErrorToHttpResponse(err);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  try {
    // Strictly resolve actor & role from the HMAC-signed server session cookie.
    // Client-supplied role fields in the request body are never trusted.
    const actor = requireServerStaffActorFromRequest(request);
    const rawBody = (await request.json()) as Record<string, unknown>;

    const result = executeServerKnowledgeAction(actor, rawBody);
    const state = getInitialKnowledgeDashboardState();

    return NextResponse.json(
      {
        entry: result.entry,
        entries: state.entries,
        auditLogs: result.auditLogs,
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

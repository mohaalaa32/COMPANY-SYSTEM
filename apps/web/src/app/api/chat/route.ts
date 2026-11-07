import { NextResponse } from 'next/server';
import {
  ChatValidationError,
  processCustomerChatTurn,
} from '@/lib/chat-server';
import { assertSafeMutationOrigin } from '@/lib/staff-session';

export async function POST(request: Request) {
  try {
    assertSafeMutationOrigin(request);
  } catch {
    return NextResponse.json(
      {
        error: 'cross_site_request_forbidden',
        errorAr: 'الطلبات العابرة للمواقع محظورة.',
      },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        error: 'invalid_json',
        errorAr: 'تعذر قراءة الطلب المرسل. يرجى المحاولة مرة أخرى.',
      },
      { status: 400 }
    );
  }

  try {
    const turnResponse = await processCustomerChatTurn(body);
    return NextResponse.json(turnResponse, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    if (err instanceof ChatValidationError) {
      return NextResponse.json(
        {
          error: err.code,
          errorAr: err.messageAr,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'chat_processing_failed',
        errorAr: 'عذراً، حدث خطأ مؤقت أثناء معالجة الرسالة في المساعد التجريبي. يرجى إعادة المحاولة.',
      },
      { status: 500 }
    );
  }
}


'use client';

import { useState, type FormEvent } from 'react';
import { brand } from '@tel/config/brand';
import { DemoBadge } from '@/components/brand';
import {
  CompareTable,
  ProductMiniCard,
  ProductRowCard,
} from '@/components/customer/product-cards';
import {
  IconBot,
  IconInfo,
  IconSend,
} from '@/components/icons';
import {
  validateCustomerChatMessage,
  type CustomerChatTurnResponse,
} from '@/lib/chat-model';
import type { CustomerProductItem } from '@/lib/customer-search';

export interface CustomerChatInitialPreview {
  timeLabel: string;
  customerBudgetText: string;
  aiIntroText: string;
  suggestions: CustomerProductItem[];
  customerAccessoryText: string;
  accessory: CustomerProductItem;
  compared: CustomerProductItem[];
  quickReplies: readonly string[];
}

interface InteractiveChatTurn {
  id: string;
  userText: string;
  aiReply: string;
  products: CustomerProductItem[];
  comparedProducts: CustomerProductItem[];
  handoffInitiated: boolean;
  timestampLabel: string;
}

export function CustomerChat({
  preview,
}: {
  preview: CustomerChatInitialPreview;
}) {
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [turns, setTurns] = useState<InteractiveChatTurn[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [errorAr, setErrorAr] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [handoffActive, setHandoffActive] = useState(false);

  async function sendMessageToAssistant(rawMessage: string) {
    if (isLoading) return;

    const validation = validateCustomerChatMessage(rawMessage);
    if (!validation.valid || !validation.message) {
      setErrorAr(validation.errorAr ?? 'يرجى كتابة سؤالك قبل الإرسال.');
      return;
    }

    const messageToSend = validation.message;
    setErrorAr(null);
    setFailedText(null);
    setPendingUserText(messageToSend);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          message: messageToSend,
        }),
      });

      const payload = (await res.json()) as Partial<CustomerChatTurnResponse> & {
        errorAr?: string;
      };

      if (!res.ok || !payload.reply || !payload.conversationId) {
        throw new Error(
          payload.errorAr ?? 'تعذر الحصول على رد من المساعد التجريبي حالياً. يرجى المحاولة مرة أخرى.'
        );
      }

      setConversationId(payload.conversationId);
      if (payload.handoffInitiated) {
        setHandoffActive(true);
      }

      const nowLabel = new Date().toLocaleTimeString('ar-IQ', {
        hour: '2-digit',
        minute: '2-digit',
      });

      setTurns((prev) => [
        ...prev,
        {
          id: payload.messageId ?? `turn_${Date.now()}`,
          userText: messageToSend,
          aiReply: payload.reply!,
          products: Array.isArray(payload.products) ? payload.products : [],
          comparedProducts: Array.isArray(payload.comparedProducts) ? payload.comparedProducts : [],
          handoffInitiated: Boolean(payload.handoffInitiated),
          timestampLabel: nowLabel,
        },
      ]);
      setInputText('');
      setPendingUserText(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'حدث خطأ في الاتصال بالخادم المحلي. يرجى المحاولة مجدداً.';
      setErrorAr(msg);
      setFailedText(messageToSend);
      setPendingUserText(null);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void sendMessageToAssistant(inputText);
  }

  function handleQuickReplyClick(text: string) {
    void sendMessageToAssistant(text);
  }

  function handleHandoffClick() {
    void sendMessageToAssistant('أريد التحدث مع موظف مبيعات لو سمحت');
  }

  function handleRetry() {
    if (failedText) {
      void sendMessageToAssistant(failedText);
    }
  }

  function handleResetConversation() {
    if (isLoading) return;
    setConversationId(undefined);
    setTurns([]);
    setErrorAr(null);
    setFailedText(null);
    setPendingUserText(null);
    setHandoffActive(false);
  }

  return (
    <section className="chat-card card" aria-labelledby="chat-title">
      <header className="chat-card-head">
        <span className="chat-bot-icon">
          <IconBot />
        </span>
        <div className="chat-card-title">
          <h2 id="chat-title">{brand.assistantDisplayAr}</h2>
          <span className="badge badge-accent badge-dot">
            متصل محلياً · مساعد تجريبي (Mock)
          </span>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            id="customer-reset-chat"
            className="btn btn-secondary chat-reset-btn"
            onClick={handleResetConversation}
            disabled={isLoading}
          >
            محادثة جديدة
          </button>
        )}
      </header>

      <div className="chat-body" id="chat-preview" aria-live="polite">
        <div className="preview-notice" role="note">
          <IconInfo />
          <span>
            وضع تجريبي محلي مفعّل: الردود والأسعار والمخزون هنا ناتجة عن المحرك التجريبي (MockLLMProvider +
            كتالوج كربلاء التجريبي) وليست من نظام الشركة الحقيقي بعد.
          </span>
        </div>

        <div className="chat-stamp">
          <span>{preview.timeLabel} (نموذج توضيحي)</span>
        </div>

        <div className="bubble bubble-customer animate-in">{preview.customerBudgetText}</div>

        <div className="ai-block animate-in">
          <div className="ai-block-meta">
            <span className="ai-dot" aria-hidden="true" />
            <span>{brand.assistantDisplayAr}</span>
            <DemoBadge />
          </div>
          <p>{preview.aiIntroText}</p>
          <div className="product-carousel" role="list" aria-label="منتجات مقترحة (تجريبية)">
            {preview.suggestions.map((p) => (
              <div role="listitem" key={p.id}>
                <ProductMiniCard product={p} />
              </div>
            ))}
          </div>
        </div>

        <div className="bubble bubble-customer animate-in">{preview.customerAccessoryText}</div>

        <div className="ai-block animate-in">
          <div className="ai-block-meta">
            <span className="ai-dot" aria-hidden="true" />
            <span>{brand.assistantDisplayAr}</span>
            <DemoBadge />
          </div>
          <ProductRowCard product={preview.accessory} />
        </div>

        <div className="ai-block ai-block-accent animate-in">
          <CompareTable products={preview.compared} />
        </div>

        {turns.length > 0 && (
          <div className="chat-stamp">
            <span>محادثتك التجريبية الحالية — فرع كربلاء</span>
          </div>
        )}

        {turns.map((turn) => (
          <div key={turn.id} className="chat-turn-group">
            <div className="bubble bubble-customer animate-in">{turn.userText}</div>

            <div className="ai-block animate-in" data-testid="ai-chat-reply">
              <div className="ai-block-meta">
                <span className="ai-dot" aria-hidden="true" />
                <span>{brand.assistantDisplayAr}</span>
                <DemoBadge />
                <span className="chat-turn-time">{turn.timestampLabel}</span>
              </div>
              <p className="ai-reply-text">{turn.aiReply}</p>

              {turn.products.length > 0 && (
                <div className="product-carousel" role="list" aria-label="منتجات من الكتالوج التجريبي">
                  {turn.products.map((prod) => (
                    <div role="listitem" key={prod.id}>
                      <ProductMiniCard product={prod} />
                    </div>
                  ))}
                </div>
              )}

              {turn.comparedProducts.length >= 2 && (
                <CompareTable products={turn.comparedProducts} />
              )}

              {turn.handoffInitiated && (
                <div className="chat-handoff-banner" role="status">
                  تم تسجيل طلب التحويل لموظف فرع كربلاء في الوضع التجريبي المحلي (لا يتم إرسال واتساب حقيقي).
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && pendingUserText && (
          <div className="chat-turn-group" id="chat-loading-indicator" role="status" aria-live="polite">
            <div className="bubble bubble-customer animate-in">{pendingUserText}</div>
            <div className="ai-block chat-loading-block animate-in">
              <div className="ai-block-meta">
                <span className="ai-dot" aria-hidden="true" />
                <span>{brand.assistantDisplayAr}</span>
                <DemoBadge />
              </div>
              <p className="chat-loading-text">جارٍ تحضير الرد وفحص الكتالوج التجريبي لفرع كربلاء...</p>
            </div>
          </div>
        )}

        {errorAr && (
          <div className="chat-error-banner" id="chat-error-banner" role="alert">
            <span>{errorAr}</span>
            {failedText && (
              <button
                type="button"
                id="chat-retry-btn"
                className="btn btn-secondary chat-retry-btn"
                onClick={handleRetry}
                disabled={isLoading}
              >
                إعادة المحاولة
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="chat-foot">
        <p className="chat-foot-label">اختصارات سريعة (تجريبية)</p>
        <div className="quick-replies">
          {preview.quickReplies.map((q) => (
            <button
              type="button"
              key={q}
              className="chip"
              onClick={() => handleQuickReplyClick(q)}
              disabled={isLoading}
            >
              {q}
            </button>
          ))}
        </div>
        <form className="composer" aria-label="كتابة رسالة للمساعد التجريبي" onSubmit={handleFormSubmit}>
          <label htmlFor="customer-message" className="sr-only">
            رسالتك للمساعد التجريبي
          </label>
          <input
            id="customer-message"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="اكتب سؤالك أو ميزانيتك (مثال: ميزانيتي 500 ألف أو عندكم سامسونج؟)"
            disabled={isLoading}
            maxLength={1000}
            autoComplete="off"
          />
          <button
            type="submit"
            id="customer-send"
            className="composer-send"
            disabled={isLoading || inputText.trim().length === 0}
            aria-label="إرسال الرسالة"
          >
            <IconSend />
          </button>
        </form>
        <button
          type="button"
          id="customer-handoff"
          className="link-btn"
          onClick={handleHandoffClick}
          disabled={isLoading}
        >
          {handoffActive ? 'تم طلب التحدث مع موظف (تجريبي)' : 'التحدث مع موظف'}
        </button>
      </footer>
    </section>
  );
}

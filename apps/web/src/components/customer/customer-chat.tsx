'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
import { Button } from '@/components/ui/button';
import {
  validateCustomerChatMessage,
  type CustomerChatCardIntent,
  type CustomerChatTurnResponse,
} from '@/lib/chat-model';
import type { CustomerProductItem } from '@/lib/customer-search';

export const CUSTOMER_PRODUCT_ACTION_EVENT = 'tel:customer-product-action';

export interface CustomerProductActionDetail {
  type: 'ask' | 'compare';
  product: CustomerProductItem;
}

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

interface SendTurnOptions {
  productId?: string;
  compareWithProductId?: string;
  intent?: CustomerChatCardIntent;
  clearCompareCandidateOnSuccess?: boolean;
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
  const [failedRequest, setFailedRequest] = useState<{
    message: string;
    options?: SendTurnOptions;
  } | null>(null);
  const [handoffActive, setHandoffActive] = useState(false);
  const [compareCandidate, setCompareCandidate] = useState<CustomerProductItem | null>(null);

  const inFlightRef = useRef(false);
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);

  const focusComposerInput = useCallback(() => {
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 20);
  }, []);

  const scrollChatToBottom = useCallback(() => {
    setTimeout(() => {
      const container = chatBodyRef.current;
      if (container && typeof container.scrollTo === 'function') {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }, 30);
  }, []);

  const sendMessageToAssistant = useCallback(
    async (rawMessage: string, options: SendTurnOptions = {}) => {
      if (inFlightRef.current || isLoading) return;

      const validation = validateCustomerChatMessage(rawMessage);
      if (!validation.valid || !validation.message) {
        setErrorAr(validation.errorAr ?? 'يرجى كتابة سؤالك قبل الإرسال.');
        return;
      }

      const messageToSend = validation.message;
      inFlightRef.current = true;
      setErrorAr(null);
      setFailedRequest(null);
      setPendingUserText(messageToSend);
      setIsLoading(true);
      scrollChatToBottom();

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversationId,
            message: messageToSend,
            ...(options.productId ? { productId: options.productId } : {}),
            ...(options.compareWithProductId
              ? { compareWithProductId: options.compareWithProductId }
              : {}),
            ...(options.intent ? { intent: options.intent } : {}),
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
        if (options.clearCompareCandidateOnSuccess) {
          setCompareCandidate(null);
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
        scrollChatToBottom();
        focusComposerInput();
      } catch (err: unknown) {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'حدث خطأ في الاتصال بالخادم المحلي. يرجى المحاولة مجدداً.';
        setErrorAr(msg);
        setFailedRequest({ message: messageToSend, options });
        setPendingUserText(null);
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [conversationId, focusComposerInput, isLoading, scrollChatToBottom]
  );

  const handleAskProduct = useCallback(
    (product: CustomerProductItem) => {
      if (inFlightRef.current || isLoading) return;
      void sendMessageToAssistant(
        `أريد تفاصيل وسعر جهاز ${product.nameAr} (رمز الصنف: ${product.sku})`,
        {
          productId: product.id,
          intent: 'ask_product',
        }
      );
    },
    [isLoading, sendMessageToAssistant]
  );

  const handleCompareProduct = useCallback(
    (product: CustomerProductItem) => {
      if (inFlightRef.current || isLoading) return;

      if (compareCandidate && compareCandidate.id !== product.id) {
        void sendMessageToAssistant(
          `قارن لي بين جهاز ${compareCandidate.nameAr} وجهاز ${product.nameAr} وأنت قرر لي يا هو الأفضل`,
          {
            productId: compareCandidate.id,
            compareWithProductId: product.id,
            intent: 'compare_product',
            clearCompareCandidateOnSuccess: true,
          }
        );
        return;
      }

      setCompareCandidate(product);
      void sendMessageToAssistant(
        `أريد مقارنة جهاز ${product.nameAr} (رمز الصنف: ${product.sku}) مع جهاز آخر`,
        {
          productId: product.id,
          intent: 'compare_product',
        }
      );
    },
    [compareCandidate, isLoading, sendMessageToAssistant]
  );

  useEffect(() => {
    function handleCatalogProductAction(event: Event) {
      const customEvent = event as CustomEvent<CustomerProductActionDetail>;
      const detail = customEvent.detail;
      if (!detail || !detail.product) return;

      if (detail.type === 'ask') {
        handleAskProduct(detail.product);
      } else if (detail.type === 'compare') {
        handleCompareProduct(detail.product);
      }
    }

    window.addEventListener(CUSTOMER_PRODUCT_ACTION_EVENT, handleCatalogProductAction);
    return () => {
      window.removeEventListener(CUSTOMER_PRODUCT_ACTION_EVENT, handleCatalogProductAction);
    };
  }, [handleAskProduct, handleCompareProduct]);

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (compareCandidate) {
      void sendMessageToAssistant(inputText, {
        productId: compareCandidate.id,
        intent: 'compare_product',
        clearCompareCandidateOnSuccess: true,
      });
      return;
    }
    void sendMessageToAssistant(inputText);
  }

  function handleQuickReplyClick(text: string) {
    void sendMessageToAssistant(text);
  }

  function handleHandoffClick() {
    void sendMessageToAssistant('أريد التحدث مع موظف مبيعات لو سمحت');
  }

  function handleRetry() {
    if (failedRequest) {
      void sendMessageToAssistant(failedRequest.message, failedRequest.options);
    }
  }

  function handleResetConversation() {
    if (inFlightRef.current || isLoading) return;
    setConversationId(undefined);
    setTurns([]);
    setErrorAr(null);
    setFailedRequest(null);
    setPendingUserText(null);
    setHandoffActive(false);
    setCompareCandidate(null);
    focusComposerInput();
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
          <Button
            type="button"
            id="customer-reset-chat"
            variant="secondary"
            size="sm"
            className="chat-reset-btn"
            onClick={handleResetConversation}
            disabled={isLoading}
          >
            محادثة جديدة
          </Button>
        )}
      </header>

      <div
        ref={chatBodyRef}
        className="chat-body"
        id="chat-preview"
        aria-live="polite"
        aria-busy={isLoading}
      >
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
                <ProductMiniCard
                  product={p}
                  onAskProduct={handleAskProduct}
                  onCompareProduct={handleCompareProduct}
                  compareCandidate={compareCandidate}
                  disabled={isLoading}
                />
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
          <ProductRowCard
            product={preview.accessory}
            onAskProduct={handleAskProduct}
            onCompareProduct={handleCompareProduct}
            compareCandidate={compareCandidate}
            disabled={isLoading}
          />
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
                      <ProductMiniCard
                        product={prod}
                        onAskProduct={handleAskProduct}
                        onCompareProduct={handleCompareProduct}
                        compareCandidate={compareCandidate}
                        disabled={isLoading}
                      />
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
            {failedRequest && (
              <Button
                type="button"
                id="chat-retry-btn"
                variant="secondary"
                size="sm"
                className="chat-retry-btn"
                onClick={handleRetry}
                disabled={isLoading}
              >
                إعادة المحاولة
              </Button>
            )}
          </div>
        )}
      </div>

      <footer className="chat-foot">
        {compareCandidate && (
          <div
            className="compare-selection-banner"
            id="compare-selection-banner"
            data-testid="compare-selection-banner"
            role="status"
            aria-live="polite"
          >
            <div className="compare-selection-text">
              <strong>تم اختيار «{compareCandidate.nameAr}» للمقارنة:</strong>{' '}
              <span>
                يرجى تحديد الجهاز الثاني للمقارنة (اضغط «قارن مع المحدد» على بطاقة جهاز آخر أو اكتب اسم/سعر الجهاز الثاني أدناه).
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCompareCandidate(null);
                focusComposerInput();
              }}
              disabled={isLoading}
              data-testid="cancel-compare-selection"
            >
              إلغاء المقارنة
            </Button>
          </div>
        )}

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
            ref={messageInputRef}
            id="customer-message"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              compareCandidate
                ? `اكتب اسم أو سعر الجهاز الثاني لمقارنته مع ${compareCandidate.nameAr}...`
                : 'اكتب سؤالك أو ميزانيتك (مثال: ميزانيتي 500 ألف أو عندكم سامسونج؟)'
            }
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

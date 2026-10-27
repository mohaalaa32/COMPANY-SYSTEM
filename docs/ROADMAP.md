# خارطة طريق المشروع — ROADMAP
**Tel Baghdad AI Sales Assistant (مساعد المبيعات الذكي لـ تل بغداد)**

---

## 1. نظرة عامة على منهجية الدفعات (Batch Execution Strategy)

يعتمد تطوير المشروع على تقسيم المهام إلى دفعات عمل متسلسلة وصغيرة (Atomic Batches)، بحيث يتم التحقق من صحة الكود والأنواع والاختبارات بعد كل دفعة وإجراء حفظ مرحلي (Git Commit).

---

## 2. سجل دفعات المرحلة الصفرية (Phase 0: Foundation)

### STEP 0A: التأسيس، الهوية، التوثيق، وقاعدة البيانات (Scaffold + Brand + DB Schema + Docs)
- [x] **0-A1**: إعداد Monorepo وتثبيت ضبط الهوية الصارمة (`config/brand.ts`) وسكربت الفحص (`scripts/check-brand.mjs`) وتوثيق المعمارية والعقود والاتفاقيات في `docs/*`. *(Commit: `d54ed52`)*
- [x] **0-A2**: إنشاء مخطط قاعدة البيانات Prisma (`schema.prisma`) في `packages/db` وفقاً لمواصفات `docs/CONTRACTS.md §5`.

---

### STEP 0B: محرك الحسابات الرياضي القطعي (Calc Engine - Agent 5)
- [x] **0-B1**: استعادة وحفظ العمل وتصحيح حالة المشروع *(completed in a previous session, commits "recovery checkpoint (uncommitted work saved)" `1923067` and "docs: correct PROJECT_STATE to real state" `b4f273c`)*.
- [x] **0-B2**: مطابقة الأنواع وإصلاح المشاكل البرمجية في `packages/calc/src/`:
  - تعديل `types.ts` ليطابق عقود `docs/CONTRACTS.md` حرفياً (`Product`، أوزان `budgetFit..`، `totalPriceIQD`، كفر الحزمة اختياري).
  - إصلاح المعالج `parser.ts` لمعالجة حرف "و" كعطف فقط عند مجيئه قبل لفظ رقمي معروف، وضمان سلامة كلمات مثل "واحد" و"عشرون".
  - معالجة حالة `minMarginPct = 0` في `scoring.ts` لمنع تجاوز `marginScore` للقيمة 1.0.
  - فحص الأنواع والتنسيق (`pnpm typecheck` و `pnpm lint`).
- [x] **0-B3**: استكمال وحدات المحرك المتبقية في `packages/calc/src/`:
  - بناء خوارزمية مطابقة الميزانية واقتراح الحزم `budget.ts` (knapsack bundle: هاتف + كفر + شاحن) ومراجعتها وتأكيد مطابقتها لعقود `docs/CONTRACTS.md`.
  - إنشاء نقطة التصدير الموحدة `index.ts` لجميع دوال وواجهات `@tel/calc`.
- [x] **0-B4**: كتابة الاختبارات الشاملة لمحرك الحسابات في `packages/calc/test/`:
  - اختبارات الوحدة واختبارات الخواص المبنية على الفرضيات (`fast-check`) في `property.test.ts`.
  - تغطية 100+ حالة حدية (145 حالة في `edge-cases.test.ts`: الأرقام الكبيرة، الأصفار، اللهجة العراقية "مية الف"، "مليون ونص"، الأرقام العربية المشرقية "١٠٠ الف").
  - التحقق من النجاح التام لجميع الفحوصات (183 اختباراً ناجحاً بنسبة 100% في `pnpm test`، ونجاح `pnpm typecheck`، و`pnpm lint`).

---

### STEP 0C: المحولات والذكاء الاصطناعي والشخصية (Adapters + LLM + Persona)
- [x] **0-C1**: بناء محولات المبيعات والمخزون والواتساب التجريبية (`packages/adapters`) مع بيانات واقعية عراقية (المحولات التجريبية، الفروع الخمسة، الكتالوج العراقي، وضمان عدم تكرار الواتساب، 41 اختباراً ناجحاً).
- [x] **0-C2**: بناء محول الذكاء الاصطناعي (`packages/ai`) ودعم استدعاء الأدوات (Tool Calling) مع ربط محرك الحسابات (الأدوات الـ 10 المعيارية، فاحص الهلوسة الرقمية الصارم، المزود الوهمي، و30 اختباراً ناجحاً).
- [x] **0-C2b** (دفعة تصحيح): تثبيت نطاق فرع كربلاء الوحيد — `branch-karbala` فقط في البيانات والأدوات (فرض في الخادم يتجاهل أي فرع يختاره النموذج)، دون عنوان/هاتف/ساعات عمل مختلقة، مع اختبارات النطاق (259 اختباراً ناجحاً).
- [x] **0-C3**: إعداد شخصية المبيعات العراقية (System Prompt + Persona v1) ومراحل المحادثة وإدارة الاعتراضات، وحواجز التحقق من مطالبات التأكيد ورسوم التوصيل والتحويل لموظف (61 اختباراً في @tel/ai، و287 اختباراً ناجحاً بنسبة 100%).

---

### STEP 0D: الهياكل البصرية والأمان والتقييم (UI Skeleton + Chat + Security + Eval Harness)
- [x] **0-D1a** [FLASH]: الهيكل الأساسي للواجهات في `apps/web` (واجهة العميل `/` ولوحة تحكم الموظفين `/dashboard` — RTL، الوضع الفاتح والداكن، بيانات تجريبية معزولة لفرع كربلاء دون تسريب `costIQD`، و10 اختبارات وحدة جديدة ليصل الإجمالي إلى 297 اختباراً ناجحاً).
- [x] **0-D1b** [FLASH]: Customer product search bar (Arabic-aware: normalize alef/ya/ta marbuta, diacritics, Franco-Arabic brand names; filters: brand, price range, in-stock — مربوط بـ `ISalesAdapter.searchProducts` عبر `/api/products/search` لفرع كربلاء فقط، دون تسريب `costIQD`، مع دعم الأرقام العربية والإنجليزية في السعر، ومنع سباق الطلبات القديمة، و310 اختبارات ناجحة عبر 16 ملف اختبار).
- [ ] **0-D1c** [HIGH]: Staff "teach the AI": knowledge base (answers, objection replies, product notes) with draft -> supervisor approval -> live; AI-reply corrections logged as feedback. No direct model changes.
- [ ] **0-D2**: منصة التقييم الأولي في `packages/eval` مع 50+ سيناريو عراقي.
- [ ] **0-D3**: حواجز الأمان ومراجعة الجودة الشاملة واعتماد اكتمال المرحلة 0 بواسطة الوكيل 3.

---

## 3. نظرة عامة على المراحل القادمة (Upcoming Phases Overview)

| المرحلة | الوصف | النموذج المقترح |
| :--- | :--- | :--- |
| **Phase 1** | بناء كامل واجهات المستخدم (RTL، الوضع الليلي والنهاري، بطاقات المنتجات، رموز التصميم). | Gemini Flash |
| **Phase 2** | تفعيل عقل المبيعات الذكي وربط مسار الحوار مع محرك الحسابات ونظام إدارة الاعتراضات. | Gemini High |
| **Phase 3** | لوحة تحكم الموظفين الحية (WebSockets/SSE، استلام المحادثات وإرجاعها للذكاء الاصطناعي). | Gemini Flash |
| **Phase 4** | تدفق معالجة وتأكيد الطلبات وإرسالها لـ WhatsApp Cloud API مع منع التكرار. | Gemini High |
| **Phase 5** | طبقة تعلم الآلة لترتيب التوصيات وتحليل الأداء واختبارات A/B. | Gemini High |
| **Phase 6** | التجهيز للإنتاج، اختبارات المتصفح الشاملة (Playwright)، والأداء وحاويات Docker. | Gemini Flash ثم High |

## End-of-batch procedure (mandatory)
1. Run checks, show full output. 2. Tick the batch in this file. 3. Update PROJECT_STATE.md.
4. Commit. 5. Print: short Arabic summary, "الموديل المقترح للدفعة الجاية: <model>", and the
BOOTSTRAP PROMPT from docs/BOOTSTRAP_PROMPT.md verbatim. 6. STOP.

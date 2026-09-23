# Crypto-mon

أداة تحليل فني للعملات الرقمية باللغة العربية: شارت حي مع مناطق العرض والطلب، خطة صفقة لكل منطقة، مسح آلي للفرص، وسجل أداء مبني على Backtest حقيقي من شموع Binance.

## التقنيات

- Next.js 16 (App Router + Turbopack) · React 19 · TypeScript
- Tailwind CSS v4 (وضع داكن افتراضي، واجهة RTL، خط Tajawal)
- lightweight-charts v5 (TradingView)
- NextAuth v5 (JWT) + Neon Postgres (`@neondatabase/serverless`) + bcryptjs
- lucide-react

## الصفحات

| المسار | الوصف | الوصول |
| --- | --- | --- |
| `/` | الشارت التفاعلي (EMA، RSI، MACD، الفوليوم، صناديق المناطق، أدوات رسم) + الشريط الجانبي: خطة الصفقة، درجة القوة، التحليل الأساسي من CoinGecko (كاش 30 دقيقة) | مشترك |
| `/opportunities` | مسح 76 عملة × 4 فريمات، مقسّم إلى «عند نقطة الدخول» و«تقترب من منطقة الدخول» | مشترك |
| `/history` | سجل الصفقات (Backtest على شموع Binance) مع نسبة النجاح والعائد | مشترك |
| `/track-record` | سجل الأداء العلني | عام |
| `/login`, `/signup` | تسجيل الدخول وإنشاء حساب (تجربة مجانية يومان) | عام |
| `/pricing` | الخطط + زر تلغرام للدفع اليدوي | عام |
| `/admin` | إدارة المستخدمين وتمديد الاشتراكات والملاحظات الأساسية | المالك فقط |
| `/terms`, `/privacy` | الشروط وسياسة الخصوصية | عام |

الحماية في `src/proxy.ts` (في Next.js 16 تمت إعادة تسمية `middleware.ts` إلى `proxy.ts`): أي زائر غير مسجّل يُحوَّل إلى `/login`، وغير المالك يُمنع من `/admin`، والحساب الذي انتهى `access_until` الخاص به يُحوَّل إلى `/pricing`. دالة `jwt` في `src/lib/auth.ts` تقرأ `is_admin` و`access_until` من قاعدة البيانات في كل طلب، فتمديد الاشتراك من `/admin` يسري فورًا.

## التشغيل

```bash
cp .env.example .env.local   # ثم املأ القيم
npm install
npm run dev
```

المتغيرات:

- `DATABASE_URL`: رابط Neon Postgres. جدول `users` يُنشأ تلقائيًا عند أول استخدام (أو يدويًا من `schema.sql`).
- `AUTH_SECRET`: سر NextAuth (`npx auth secret`).
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: حساب المالك الأول، يُنشأ تلقائيًا كمدير.
- `TELEGRAM_CONTACT_URL`: رابط تلغرام لزر الدفع في `/pricing`.
- `COINGECKO_API_KEY` (اختياري): مفتاح Demo مجاني لرفع حد الطلبات.

## البنية

```
src/
  proxy.ts               حماية المسارات والصلاحيات
  auth.ts, lib/auth.ts   إعداد NextAuth v5 (Credentials + JWT)
  lib/db.ts, lib/users.ts  Neon Postgres وجدول المستخدمين
  lib/marketData.ts      شموع Binance (data-api.binance.vision)
  lib/zones.ts           محرك مناطق العرض والطلب
  lib/tradePlan.ts       خطة الصفقة (دخول، وقف، أهداف)
  lib/tradeBacktest.ts   محاكاة الصفقات على الشموع
  lib/indicators.ts      EMA / RSI / MACD
  lib/fundamentalData.ts CoinGecko (كاش 30 دقيقة)
  components/            الشارت، الشريط الجانبي، الفرص، السجل، لوحة الإدارة
  app/                   الصفحات ومسارات الـ API
```

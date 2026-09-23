import { Check, MessageCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";

// Billing is manual (no Stripe): the visitor messages this Telegram
// account, the owner confirms payment, then extends their access from
// /admin. Set TELEGRAM_CONTACT_URL (e.g. https://t.me/your_username).
const TELEGRAM_CONTACT_URL = process.env.TELEGRAM_CONTACT_URL || "https://t.me/REPLACE_WITH_YOUR_TELEGRAM_USERNAME";

const FEATURES = [
  "شارت حي مع تحليل مناطق العرض والطلب تلقائيًا",
  "مسح آلي لـ 76 عملة على 4 أطر زمنية لحظة وصول السعر لمنطقة دخول",
  "سجل صفقات حقيقي 100% (Backtest) — نسبة نجاح ومتوسط عائد فعليين",
  "مؤشرات فنية: المتوسطات المتحركة، RSI، MACD، الفوليوم",
  "تحليل أساسي حي لكل عملة (CoinGecko) يتحدث تلقائيًا",
  "تنبيهات فورية داخل المتصفح عند دخول صفقة جديدة",
];

function PlanCard({
  title,
  price,
  period,
  note,
  highlighted = false,
}: {
  title: string;
  price: string;
  period: string;
  note?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-1 flex-col gap-4 rounded-2xl border p-6 shadow-sm ${
        highlighted ? "border-success bg-success-soft/40 ring-1 ring-success/40" : "border-surface-border bg-surface"
      }`}
    >
      {highlighted && (
        <span className="absolute -top-3 right-6 rounded-full bg-success px-3 py-1 text-xs font-semibold text-white">
          الأوفر
        </span>
      )}
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-extrabold text-foreground">{price}</span>
        <span className="text-sm text-muted">/{period}</span>
      </div>
      {note && <p className="text-xs text-success">{note}</p>}
      <a
        href={TELEGRAM_CONTACT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-2 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ${
          highlighted
            ? "bg-success text-white hover:bg-success/90"
            : "bg-background text-foreground ring-1 ring-surface-border hover:bg-surface"
        }`}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
        تواصل عبر تلغرام للاشتراك
      </a>
    </div>
  );
}

export default async function PricingPage() {
  const session = await auth();
  const accessUntil = session?.user?.accessUntil ?? null;
  const isExpiredVisitor =
    Boolean(session?.user) && !session?.user?.isAdmin && accessUntil !== null && new Date(accessUntil) <= new Date();

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="flex w-full max-w-4xl flex-col items-center gap-4 text-center">
        {isExpiredVisitor && (
          <div className="w-full max-w-xl rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
            انتهت فترتك التجريبية أو اشتراكك — اشترك من هنا لاستعادة الوصول الكامل.
          </div>
        )}
        <span className="flex items-center gap-2 rounded-full border border-success/30 bg-success-soft px-3 py-1 text-xs font-semibold text-success">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
          تجربة مجانية لمدة يومين — بدون بطاقة دفع
        </span>
        <h1 className="text-3xl font-extrabold text-foreground">اشترك في Crypto-mon</h1>
        <p className="max-w-lg text-sm leading-relaxed text-muted">
          أداة تحليل فني آلي مباشر لـ 76 عملة رقمية — مناطق عرض وطلب، خطط صفقات، ومسح فرص لحظي. راجع{" "}
          <Link href="/track-record" className="font-medium text-success hover:underline">
            سجل الأداء الحقيقي
          </Link>{" "}
          قبل أن تقرر.
        </p>
      </div>

      <div className="mt-10 flex w-full max-w-2xl flex-col gap-5 sm:flex-row">
        <PlanCard title="اشتراك شهري" price="$29.99" period="شهر" />
        <PlanCard title="اشتراك سنوي" price="$299" period="سنة" note="وفّر حوالي 17% مقارنة بالاشتراك الشهري" highlighted />
      </div>

      <div className="mt-10 flex w-full max-w-2xl flex-col gap-2 rounded-xl border border-surface-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">ماذا يشمل الاشتراك؟</h2>
        <ul className="mt-1 flex flex-col gap-2">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-muted">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2.5} />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-8 max-w-lg text-center text-xs leading-relaxed text-muted">
        لم تجرّب الأداة بعد؟{" "}
        <Link href="/signup" className="font-medium text-success hover:underline">
          ابدأ تجربتك المجانية لمدة يومين
        </Link>{" "}
        أولًا بدون أي التزام.
      </p>

      <p className="mt-4 text-center text-xs text-muted">
        <Link href="/terms" className="hover:underline">
          شروط الاستخدام
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="hover:underline">
          سياسة الخصوصية
        </Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { Card, PageShell } from "./_components/ui";

const JOURNEY = [
  "تطلب الدراسة وتحدد نطاقها ومتطلباتها وتعتمدها.",
  "يضع مدير الدراسة خطة التنفيذ ومراحلها ويختار الباحثين ويوزع المهام.",
  "ينفذ الباحثون جمع البيانات ويرفعونها، ويراقب مدير الدراسة جودتها.",
  "يحلل المحلل البيانات المعتمدة ويعد التقرير بالصيغة المتفق عليها.",
  "يراجع مدير الدراسة التقرير ويعتمده ثم يُسلَّم لك لتؤكد استلامه.",
];

export default function StudiesHome() {
  return (
    <PageShell title="اطلب دراستك، تابع تنفيذها، واستلم تقريرًا موثوقًا" subtitle="جهة واحدة من الطلب حتى التسليم.">
      <Card title="كيف تعمل المنصة">
        <ol className="flex flex-col gap-3">
          {JOURNEY.map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-info-soft text-xs font-bold text-info">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted">
          لا حاجة لإنشاء حساب: بعد إرسال طلبك تحصل على رابط خاص بدراستك تتابع منه كل شيء. الدفع يتم خارج المنصة.
        </p>
        <Link href="/studies/request" className="mt-5 inline-block rounded-lg bg-info px-5 py-2.5 text-sm font-semibold text-white">
          اطلب دراسة جديدة
        </Link>
      </Card>
    </PageShell>
  );
}

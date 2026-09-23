import { AlertTriangle, ExternalLink, Settings } from "lucide-react";
import Link from "next/link";
import AdminFundamentalNotes from "@/components/AdminFundamentalNotes";
import AdminUsers from "@/components/AdminUsers";

const PUBLIC_PAGES = [
  { href: "/pricing", label: "صفحة الأسعار" },
  { href: "/signup", label: "صفحة التسجيل" },
  { href: "/track-record", label: "سجل الأداء العلني" },
  { href: "/terms", label: "شروط الاستخدام" },
  { href: "/privacy", label: "سياسة الخصوصية" },
];

export default function AdminPage() {
  return (
    <div className="flex flex-1 flex-col items-center">
      <main className="flex w-full max-w-6xl flex-1 flex-col items-center gap-8 px-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-info-soft text-info">
            <Settings className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <h1 className="text-2xl font-bold text-foreground">الإعدادات</h1>
        </div>

        <div className="w-full max-w-xl rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-foreground">الصفحات العامة</h2>
          <ul className="flex flex-col gap-2">
            {PUBLIC_PAGES.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  target="_blank"
                  className="flex items-center justify-between gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-foreground transition-colors duration-150 hover:bg-background"
                >
                  {label}
                  <ExternalLink className="h-3.5 w-3.5 text-muted" strokeWidth={2.25} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
            زر الاشتراك في صفحة الأسعار يفتح رابط تلغرام مؤقتًا (placeholder) — لم يُستبدل بعد بحسابك الحقيقي.
          </div>
        </div>

        <div className="w-full max-w-xl">
          <h2 className="mb-1 font-semibold text-foreground">إدارة التحليل الأساسي</h2>
          <p className="mb-3 text-sm text-muted">
            لوحة التحليل تعرض تلقائيًا ملفًا حيًا لكل عملة (المصدر: CoinGecko) — هنا يمكنك إضافة ملاحظة يدوية إضافية
            تظهر بجانبه، مثل سياق لا يغطيه المصدر الخارجي
          </p>
          <AdminFundamentalNotes />
        </div>

        <AdminUsers />
      </main>
    </div>
  );
}

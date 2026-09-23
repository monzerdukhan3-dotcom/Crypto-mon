import { Settings } from "lucide-react";
import AdminFundamentalNotes from "@/components/AdminFundamentalNotes";
import AdminUsers from "@/components/AdminUsers";

export default function AdminPage() {
  return (
    <div className="flex flex-1 flex-col items-center">
      <main className="flex w-full max-w-6xl flex-1 flex-col items-center gap-8 px-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-info-soft text-info">
            <Settings className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <h1 className="text-2xl font-bold text-foreground">إدارة التحليل الأساسي</h1>
          <p className="max-w-md text-center text-sm text-muted">
            لوحة التحليل تعرض تلقائيًا ملفًا حيًا لكل عملة (المصدر: CoinGecko) — هنا يمكنك إضافة ملاحظة يدوية إضافية
            تظهر بجانبه، مثل سياق لا يغطيه المصدر الخارجي
          </p>
        </div>

        <AdminFundamentalNotes />
        <AdminUsers />
      </main>
    </div>
  );
}

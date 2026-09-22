import { History } from "lucide-react";
import { Suspense } from "react";
import TradeHistoryView from "@/components/TradeHistoryView";

export default function HistoryPage() {
  return (
    <div className="flex flex-1 flex-col items-center">
      <main className="flex w-full max-w-6xl flex-1 flex-col items-center gap-8 px-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-info-soft text-info">
            <History className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <h1 className="text-2xl font-bold text-foreground">سجل الصفقات</h1>
          <p className="max-w-md text-center text-sm text-muted">
            تتبّع حقيقي لكل صفقة اقترحها الموقع — هل تحقّقت أهدافها فعليًا أم لا
          </p>
        </div>

        <Suspense fallback={null}>
          <TradeHistoryView />
        </Suspense>
      </main>
    </div>
  );
}

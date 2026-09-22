import { BellRing } from "lucide-react";
import OpportunitiesView from "@/components/OpportunitiesView";

export default function OpportunitiesPage() {
  return (
    <div className="flex flex-1 flex-col items-center">
      <main className="flex w-full max-w-6xl flex-1 flex-col items-center gap-8 px-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-info-soft text-info">
            <BellRing className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <h1 className="text-2xl font-bold text-foreground">الفرص الآن</h1>
          <p className="max-w-md text-center text-sm text-muted">
            تابع لحظة وصول أي عملة من أعلى 60 عملة لمنطقة دخول، بدل فتح كل عملة على حدة
          </p>
        </div>

        <OpportunitiesView />
      </main>
    </div>
  );
}

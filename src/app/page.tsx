import { Sparkles } from "lucide-react";
import AnalysisDashboard from "@/components/AnalysisDashboard";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center">
      <main className="flex w-full max-w-6xl flex-1 flex-col items-center gap-8 px-6 py-10">
        <div className="animate-fade-in-up flex flex-col items-center gap-3 text-center">
          <span className="flex items-center gap-2 rounded-full border border-success/30 bg-success-soft px-3 py-1 text-xs font-semibold text-success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-live-pulse rounded-full" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
            تحليل فني آلي مباشر
          </span>
          <p className="max-w-md text-base text-muted">
            أداة تحليل فني للعملات الرقمية — اختر العملة والفريم الزمني
          </p>
        </div>

        <AnalysisDashboard />
      </main>
    </div>
  );
}

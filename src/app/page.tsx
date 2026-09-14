import AnalysisDashboard from "@/components/AnalysisDashboard";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center">
      <main className="flex w-full max-w-6xl flex-1 flex-col items-center gap-8 px-6 py-10">
        <p className="max-w-md text-center text-base text-muted">
          أداة تحليل فني للعملات الرقمية — اختر العملة والفريم الزمني
        </p>

        <AnalysisDashboard />
      </main>
    </div>
  );
}

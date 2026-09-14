import AnalysisDashboard from "@/components/AnalysisDashboard";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-6 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Crypto-mon
          </h1>
          <p className="max-w-md text-base text-zinc-600 dark:text-zinc-400">
            أداة تحليل فني للعملات الرقمية — اختر العملة والفريم الزمني
          </p>
        </div>

        <AnalysisDashboard />
      </main>
    </div>
  );
}

import { ChartCandlestick } from "lucide-react";

export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-surface-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2.5 px-6 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-soft text-success">
          <ChartCandlestick className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <span className="text-lg font-bold tracking-tight">Crypto-mon</span>
      </div>
    </header>
  );
}

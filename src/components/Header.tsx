import { ChartCandlestick, History } from "lucide-react";
import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-surface-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2.5 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-soft text-success">
            <ChartCandlestick className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <span className="text-lg font-bold tracking-tight">Crypto-mon</span>
        </Link>

        <Link
          href="/history"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"
        >
          <History className="h-4 w-4" strokeWidth={2.25} />
          سجل الصفقات
        </Link>
      </div>
    </header>
  );
}

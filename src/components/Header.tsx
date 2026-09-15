import { ChartCandlestick, History, Settings } from "lucide-react";
import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-surface-border bg-background/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2.5 px-6 py-3.5">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-success to-success/70 text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
            <ChartCandlestick className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <span className="text-lg font-bold tracking-tight">Crypto-mon</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/history"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface hover:text-foreground"
          >
            <History className="h-4 w-4" strokeWidth={2.25} />
            سجل الصفقات
          </Link>
          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface hover:text-foreground"
          >
            <Settings className="h-4 w-4" strokeWidth={2.25} />
            الإعدادات
          </Link>
        </div>
      </div>
    </header>
  );
}

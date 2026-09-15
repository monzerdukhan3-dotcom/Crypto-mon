import { History, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-surface-border bg-background/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2.5 px-6 py-3.5">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full shadow-md ring-1 ring-success/30 transition-transform duration-200 group-hover:scale-105 group-hover:ring-success/60">
            <Image src="/logo-mark.png" alt="MDA Crypto" fill sizes="36px" className="object-cover" priority />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight">Crypto-mon</span>
            <span className="text-[10px] font-medium tracking-widest text-muted uppercase">MDA Crypto</span>
          </span>
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

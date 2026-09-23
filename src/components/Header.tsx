"use client";

import { BellRing, History, Home, LogOut, Settings } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MoreMenu from "./MoreMenu";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/opportunities", label: "الفرص الآن", icon: BellRing },
  { href: "/history", label: "سجل الصفقات", icon: History },
];

const ADMIN_NAV_ITEM = { href: "/admin", label: "الإعدادات", icon: Settings };

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const navItems = session?.user?.isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <header className="sticky top-0 z-10 border-b border-surface-border bg-background/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-2.5 sm:px-6 sm:py-3.5">
        <Link href="/" className="group flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-md ring-1 ring-success/30 transition-transform duration-200 group-hover:scale-105 group-hover:ring-success/60 sm:h-9 sm:w-9">
            <Image src="/logo-mark.png" alt="MDA Crypto" fill sizes="36px" className="object-cover" priority />
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="whitespace-nowrap text-base font-bold tracking-tight sm:text-lg">Crypto-mon</span>
            <span className="hidden whitespace-nowrap text-[10px] font-medium tracking-widest text-muted uppercase sm:block">
              MDA Crypto
            </span>
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors duration-150 sm:px-3 ${
                  active ? "bg-success-soft text-success" : "text-muted hover:bg-surface hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          <MoreMenu />
          <ThemeToggle />
          {session && (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="تسجيل الخروج"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger"
            >
              <LogOut className="h-4 w-4" strokeWidth={2.25} />
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

"use client";

import { ChevronDown, MoreHorizontal, ShieldCheck, Tag, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const MENU_ITEMS = [
  { href: "/pricing", label: "الأسعار", icon: Tag },
  { href: "/track-record", label: "سجل الأداء", icon: Trophy },
  { href: "/privacy", label: "سياسة الخصوصية", icon: ShieldCheck },
];

/** Groups the marketing/legal pages (pricing, public track record, privacy) behind one dropdown in the top nav, instead of three more flat icons crowding it. */
export default function MoreMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="المزيد"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors duration-150 sm:px-3 ${
          open ? "bg-success-soft text-success" : "text-muted hover:bg-surface hover:text-foreground"
        }`}
      >
        <MoreHorizontal className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        <span className="hidden sm:inline">المزيد</span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`} strokeWidth={2.25} />
      </button>

      {open && (
        <div className="absolute end-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-lg border border-surface-border bg-surface py-1 shadow-lg">
          {MENU_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors duration-150 hover:bg-background"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2.25} />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

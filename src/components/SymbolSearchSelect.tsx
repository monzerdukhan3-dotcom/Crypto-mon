"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SymbolInfo } from "@/lib/constants";

interface SymbolSearchSelectProps {
  symbols: SymbolInfo[];
  value: string;
  onChange: (symbol: string) => void;
}

/** A searchable dropdown for picking a coin out of 60+ options — typing filters by symbol or name instead of scrolling a plain <select>. */
export default function SymbolSearchSelect({ symbols, value, onChange }: SymbolSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = symbols.find((s) => s.symbol === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return symbols;
    return symbols.filter((s) => s.symbol.toLowerCase().includes(q) || s.label.toLowerCase().includes(q));
  }, [symbols, query]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function openList() {
    setOpen(true);
    setQuery("");
    // Wait for the input to mount before focusing it.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pick(symbol: string) {
    onChange(symbol);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-surface-border bg-background px-3 py-2 text-base text-foreground transition-colors duration-150 hover:border-success/40 focus:outline-none focus:ring-2 focus:ring-success/40"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" strokeWidth={2.25} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-surface-border bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-surface-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2.25} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered.length > 0) pick(filtered[0].symbol);
              }}
              placeholder="ابحث عن عملة..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
            />
          </div>
          <ul className="max-h-[60vh] overflow-y-auto py-1 sm:max-h-96">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">لا توجد نتائج</li>
            ) : (
              filtered.map((s) => (
                <li key={s.symbol}>
                  <button
                    type="button"
                    onClick={() => pick(s.symbol)}
                    className={`flex w-full items-center px-3 py-2 text-sm transition-colors duration-150 hover:bg-background ${
                      s.symbol === value ? "font-medium text-success" : "text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

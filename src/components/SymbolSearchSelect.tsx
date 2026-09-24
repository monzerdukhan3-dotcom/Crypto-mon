"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { flushSync } from "react-dom";
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
  // Set by the touchend handler below, read by its onClick counterpart —
  // see handleTouchEnd's own doc comment for why both exist.
  const suppressNextClickRef = useRef(false);

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
    // flushSync forces this dropdown's own close to commit and paint on
    // its own, right now — before onChange runs. Without it, React
    // batches setOpen(false) together with whatever onChange triggers in
    // the parent (a new symbol means a new candle fetch and re-running
    // zone detection's own fairly heavy computation over the still-old
    // candles), so the dropdown's visual close waits on that entire
    // render to finish.
    flushSync(() => {
      setOpen(false);
      setQuery("");
    });
    onChange(symbol);
  }

  // Confirmed on a real device (screen recording): tapping an option inside
  // this scrollable list on iOS Safari updates the selection (the trigger's
  // label and the green highlight both change) but the list itself never
  // closes — across several separate taps in the same recording, not a
  // one-off. That points at Safari's own tap-vs-scroll disambiguation
  // inside a scrolling `overflow-y` container occasionally never
  // synthesizing the `click` this all depended on, even though the touch
  // itself was clearly handled (hence the selection still landing).
  // touchend fires unconditionally on every tap, before that
  // disambiguation can swallow anything, so picking there — and
  // preventDefault to stop the browser from *also* firing a click
  // afterward — sidesteps it entirely. onClick stays as the mouse/keyboard
  // path; suppressNextClickRef just stops a click that still slips through
  // right after a touchend from picking a second time.
  function handleTouchEnd(symbol: string, event: TouchEvent) {
    event.preventDefault();
    suppressNextClickRef.current = true;
    setTimeout(() => {
      suppressNextClickRef.current = false;
    }, 500);
    pick(symbol);
  }

  function handleClick(symbol: string) {
    if (suppressNextClickRef.current) return;
    pick(symbol);
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
                    onTouchEnd={(e) => handleTouchEnd(s.symbol, e)}
                    onClick={() => handleClick(s.symbol)}
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

"use client";

import { useState } from "react";
import { SYMBOLS, TIMEFRAMES, type Symbol, type Timeframe } from "@/lib/constants";

export default function AnalysisDashboard() {
  const [symbol, setSymbol] = useState<Symbol>("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          العملة
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as Symbol)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {SYMBOLS.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          الفريم الزمني
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {TIMEFRAMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex h-80 w-full items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        سيتم عرض شارت الشموع هنا لـ {symbol} ({timeframe})
      </div>
    </div>
  );
}

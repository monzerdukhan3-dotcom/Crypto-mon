"use client";

import { useEffect, useMemo, useState } from "react";
import { SYMBOLS, TIMEFRAMES, type Symbol, type Timeframe } from "@/lib/constants";
import { buildTradePlan } from "@/lib/tradePlan";
import type { Candle } from "@/lib/types";
import { detectZones } from "@/lib/zones";
import CandlestickChart from "./CandlestickChart";
import ZonesSidebar from "./ZonesSidebar";

interface FetchResult {
  key: string;
  candles: Candle[];
  error: string | null;
}

export default function AnalysisDashboard() {
  const [symbol, setSymbol] = useState<Symbol>("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [result, setResult] = useState<FetchResult | null>(null);

  const requestKey = `${symbol}:${timeframe}`;

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? "فشل تحميل البيانات");
        }
        return json.candles as Candle[];
      })
      .then((candles) => {
        if (cancelled) return;
        setResult({ key: requestKey, candles, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          candles: [],
          error: error instanceof Error ? error.message : "فشل تحميل البيانات",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, requestKey]);

  const status: "loading" | "ready" | "error" =
    result?.key !== requestKey ? "loading" : result.error ? "error" : "ready";

  const candles = useMemo(
    () => (status === "ready" ? (result?.candles ?? []) : []),
    [status, result]
  );
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : null;

  const zones = useMemo(() => detectZones(candles), [candles]);
  const tradePlan = useMemo(
    () => (currentPrice !== null ? buildTradePlan(zones, currentPrice) : null),
    [zones, currentPrice]
  );

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
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

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="h-96 flex-1 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 lg:h-[560px]">
          {status === "loading" && (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
              جاري تحميل بيانات {symbol}...
            </div>
          )}
          {status === "error" && (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-red-500">
              {result?.error}
            </div>
          )}
          {status === "ready" && <CandlestickChart data={candles} zones={zones} />}
        </div>

        {status === "ready" && currentPrice !== null && (
          <ZonesSidebar zones={zones} tradePlan={tradePlan} currentPrice={currentPrice} />
        )}
      </div>
    </div>
  );
}

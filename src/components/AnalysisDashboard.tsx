"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SYMBOLS, TIMEFRAMES, type Symbol, type SymbolInfo, type Timeframe } from "@/lib/constants";
import { generateTechnicalSummary } from "@/lib/technicalSummary";
import { scoreTradeConfidence } from "@/lib/tradeConfidence";
import { buildTradePlan } from "@/lib/tradePlan";
import type { Candle } from "@/lib/types";
import { checkVolatility } from "@/lib/volatility";
import { detectZones } from "@/lib/zones";
import CandlestickChart from "./CandlestickChart";
import ZonesSidebar from "./ZonesSidebar";

interface FetchResult {
  key: string;
  candles: Candle[];
  dailyCandles: Candle[] | null;
  error: string | null;
}

async function fetchCandleSet(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const res = await fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? "فشل تحميل البيانات");
  }
  return json.candles as Candle[];
}

export default function AnalysisDashboard() {
  const [symbol, setSymbol] = useState<Symbol>("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [result, setResult] = useState<FetchResult | null>(null);
  const [availableSymbols, setAvailableSymbols] = useState<SymbolInfo[]>(DEFAULT_SYMBOLS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/symbols")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && Array.isArray(json.symbols) && json.symbols.length > 0) {
          setAvailableSymbols(json.symbols);
        }
      })
      .catch(() => {
        // Keep the pinned defaults — the dropdown still works either way.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestKey = `${symbol}:${timeframe}`;

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchCandleSet(symbol, timeframe),
      // Higher-timeframe trend confirmation: skip the extra fetch when
      // already viewing the daily chart, and don't let it fail the whole
      // request if it errors — it's a confirmation signal, not core data.
      timeframe === "1d" ? Promise.resolve(null) : fetchCandleSet(symbol, "1d").catch(() => null),
    ])
      .then(([candles, dailyCandles]) => {
        if (cancelled) return;
        setResult({ key: requestKey, candles, dailyCandles, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          candles: [],
          dailyCandles: null,
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
  const dailyCandles = useMemo(
    () => (status === "ready" ? (result?.dailyCandles ?? null) : null),
    [status, result]
  );
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : null;

  const zones = useMemo(() => detectZones(candles), [candles]);
  const tradePlan = useMemo(
    () => (currentPrice !== null ? buildTradePlan(zones, currentPrice) : null),
    [zones, currentPrice]
  );
  const confidence = useMemo(
    () => (tradePlan ? scoreTradeConfidence(tradePlan, zones, candles, dailyCandles) : null),
    [tradePlan, zones, candles, dailyCandles]
  );
  const technicalSummary = useMemo(
    () => (currentPrice !== null ? generateTechnicalSummary(candles, zones, currentPrice) : ""),
    [candles, zones, currentPrice]
  );
  const volatility = useMemo(() => (candles.length > 0 ? checkVolatility(candles) : null), [candles]);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-4 rounded-xl border border-surface-border bg-surface p-5 shadow-sm sm:flex-row">
        <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-muted">
          العملة
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as Symbol)}
            className="rounded-lg border border-surface-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-success/40"
          >
            {availableSymbols.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-muted">
          الفريم الزمني
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="rounded-lg border border-surface-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-success/40"
          >
            {TIMEFRAMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="h-96 shrink-0 overflow-hidden rounded-xl border border-surface-border bg-surface p-2 shadow-sm lg:h-[560px] lg:flex-1">
          {status === "loading" && (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              جاري تحميل بيانات {symbol}...
            </div>
          )}
          {status === "error" && (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-danger">
              {result?.error}
            </div>
          )}
          {status === "ready" && <CandlestickChart data={candles} zones={zones} />}
        </div>

        {status === "ready" && currentPrice !== null && (
          <ZonesSidebar
            zones={zones}
            tradePlan={tradePlan}
            confidence={confidence}
            technicalSummary={technicalSummary}
            currentPrice={currentPrice}
            volatility={volatility}
          />
        )}
      </div>
    </div>
  );
}

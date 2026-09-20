"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SYMBOLS, TIMEFRAMES, type Symbol, type SymbolInfo, type Timeframe } from "@/lib/constants";
import { generateTechnicalSummary } from "@/lib/technicalSummary";
import { scoreTradeConfidence } from "@/lib/tradeConfidence";
import { buildTradePlan, findApproachingDemandZone } from "@/lib/tradePlan";
import { computeTradeProgress } from "@/lib/tradeProgress";
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

  const zones = useMemo(
    () => detectZones(candles, { higherTimeframeCandles: dailyCandles }),
    [candles, dailyCandles]
  );
  const tradePlan = useMemo(
    () => (currentPrice !== null ? buildTradePlan(zones, currentPrice, candles) : null),
    [zones, currentPrice, candles]
  );
  // Only worth flagging once there's no live trade plan already — a real
  // plan already highlights its own entry zone.
  const approachingZone = useMemo(
    () => (!tradePlan && currentPrice !== null ? findApproachingDemandZone(zones, currentPrice, candles) : null),
    [tradePlan, zones, currentPrice, candles]
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
  const tradeProgress = useMemo(
    () => (tradePlan && currentPrice !== null ? computeTradeProgress(tradePlan, currentPrice) : null),
    [tradePlan, currentPrice]
  );

  return (
    <div className="flex w-full max-w-6xl flex-col gap-8">
      <div
        className="animate-fade-in-up relative flex flex-col gap-4 overflow-hidden rounded-xl border border-surface-border bg-surface p-5 shadow-sm transition-shadow duration-200 hover:shadow-md sm:flex-row"
        style={{ animationDelay: "60ms" }}
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-info via-success to-info" />
        <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-muted">
          العملة
          <span className="relative">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value as Symbol)}
              className="w-full appearance-none rounded-lg border border-surface-border bg-background px-3 py-2 pr-9 text-base text-foreground transition-colors duration-150 hover:border-success/40 focus:outline-none focus:ring-2 focus:ring-success/40"
            >
              {availableSymbols.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2.25} />
          </span>
        </label>

        <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-muted">
          الفريم الزمني
          <span className="relative">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              className="w-full appearance-none rounded-lg border border-surface-border bg-background px-3 py-2 pr-9 text-base text-foreground transition-colors duration-150 hover:border-success/40 focus:outline-none focus:ring-2 focus:ring-success/40"
            >
              {TIMEFRAMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2.25} />
          </span>
        </label>
      </div>

      <p
        className="animate-fade-in-up rounded-lg border border-surface-border bg-surface/60 px-4 py-2.5 text-xs leading-relaxed text-muted"
        style={{ animationDelay: "120ms" }}
      >
        القائمة تضم أعلى 60 عملة سيولة وحجم تداول على المنصة، مع استبعاد اجتهادي لعملات القمار والميمز الصرفة —
        هذا اجتهاد تقني وليس فتوى شرعية معتمدة؛ راجع مصدرًا موثوقًا قبل الاعتماد عليه في قرار الاستثمار.
      </p>

      <div className="flex flex-col gap-5 lg:flex-row">
        <div
          className="animate-fade-in-up relative h-96 shrink-0 overflow-hidden rounded-xl border border-surface-border bg-surface p-2 shadow-sm transition-shadow duration-200 hover:shadow-md lg:h-[560px] lg:flex-1"
          style={{ animationDelay: "180ms" }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 bg-gradient-to-r from-info via-success to-info" />
          {status === "loading" && (
            <div className="flex h-full flex-col gap-4 p-4">
              <div className="flex flex-1 items-end gap-1.5">
                {[38, 62, 45, 78, 55, 90, 48, 70, 58, 82, 40, 65].map((h, i) => (
                  <div
                    key={i}
                    className="animate-shimmer flex-1 rounded-sm"
                    style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-success" strokeWidth={2.25} />
                جاري تحميل بيانات {symbol}...
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-danger">
              {result?.error}
            </div>
          )}
          {status === "ready" && (
            <CandlestickChart
              data={candles}
              zones={zones}
              tradePlan={tradePlan}
              highlightZoneId={approachingZone?.id ?? null}
              timeframe={timeframe}
            />
          )}
        </div>

        {status === "ready" && currentPrice !== null && (
          <div className="animate-fade-in-up w-full lg:w-80" style={{ animationDelay: "240ms" }}>
            <ZonesSidebar
              symbol={symbol}
              zones={zones}
              tradePlan={tradePlan}
              approachingZone={approachingZone}
              tradeProgress={tradeProgress}
              confidence={confidence}
              technicalSummary={technicalSummary}
              currentPrice={currentPrice}
              volatility={volatility}
            />
          </div>
        )}
      </div>
    </div>
  );
}

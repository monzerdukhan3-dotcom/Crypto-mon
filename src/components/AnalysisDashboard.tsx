"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SUPPORTED_SYMBOLS, TIMEFRAMES, type Symbol, type SymbolInfo, type Timeframe } from "@/lib/constants";
import { generateTechnicalSummary } from "@/lib/technicalSummary";
import { scoreTradeConfidence } from "@/lib/tradeConfidence";
import { buildTradePlan, findApproachingDemandZone } from "@/lib/tradePlan";
import { computeTradeProgress } from "@/lib/tradeProgress";
import type { Candle, Zone } from "@/lib/types";
import { checkVolatility } from "@/lib/volatility";
import { detectSearchableZones, detectZones } from "@/lib/zones";
import CandlestickChart from "./CandlestickChart";
import SymbolSearchSelect from "./SymbolSearchSelect";
import ZonesSidebar from "./ZonesSidebar";

interface FetchResult {
  key: string;
  candles: Candle[];
  dailyCandles: Candle[] | null;
  error: string | null;
}

// Matches /api/candles' own 30s cache window — polling faster wouldn't get
// fresher data anyway. Without this, a chart loaded once never picks up a
// newly-closed candle (or the current one's live price) until the page is
// reloaded, since the fetch effect below only otherwise re-runs when the
// symbol or timeframe itself changes.
const REFRESH_MS = 30_000;

async function fetchCandleSet(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const res = await fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? "فشل تحميل البيانات");
  }
  return json.candles as Candle[];
}

export default function AnalysisDashboard() {
  // Lets a link from elsewhere (the opportunities page, say) open straight
  // into the matching chart — read once on mount, not kept in sync with the
  // URL afterward, so picking a different coin from the dropdown doesn't
  // fight with it.
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState<Symbol>(() => searchParams.get("symbol")?.toUpperCase() || "BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>(
    () => (TIMEFRAMES.some((t) => t.value === searchParams.get("timeframe")) ? searchParams.get("timeframe") : "1h") as Timeframe
  );
  const [result, setResult] = useState<FetchResult | null>(null);
  const [availableSymbols, setAvailableSymbols] = useState<SymbolInfo[]>(SUPPORTED_SYMBOLS);

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

    function load() {
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
    }

    load();
    // Same `requestKey` on every tick here, so `status` below stays "ready"
    // across a refresh instead of flashing back to the loading state —
    // this just quietly swaps in fresher candles (and the chart primitives
    // that depend on them) once they arrive.
    const interval = setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
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

  // Capped to the strongest few of each type — what the chart actually
  // draws, and what the sidebar's zone list shows by default.
  const zones = useMemo(
    () => detectZones(candles, { higherTimeframeCandles: dailyCandles }),
    [candles, dailyCandles]
  );
  // Uncapped and unfiltered by displayable-ness: searched for an open trade
  // plan / approaching zone so a genuinely open position can't silently
  // disappear from this dashboard (or the opportunities scan, which
  // applies the same fix) just because a newer, stronger zone has since
  // pushed it out of the chart's own cosmetic top-N, price sits right at
  // it, or the zone box itself has since broken while the trade's own
  // stop loss (a buffer further below) hasn't — matching /history, which
  // already searches this same unrestricted set.
  const searchableZones = useMemo(
    () => detectSearchableZones(candles, { higherTimeframeCandles: dailyCandles }),
    [candles, dailyCandles]
  );
  const tradePlan = useMemo(
    () => (currentPrice !== null ? buildTradePlan(searchableZones, currentPrice, candles) : null),
    [searchableZones, currentPrice, candles]
  );
  // Only worth flagging once there's no live trade plan already — a real
  // plan already highlights its own entry zone.
  const approachingZone = useMemo(
    () => (!tradePlan && currentPrice !== null ? findApproachingDemandZone(searchableZones, currentPrice, candles) : null),
    [tradePlan, searchableZones, currentPrice, candles]
  );
  const confidence = useMemo(
    () => (tradePlan ? scoreTradeConfidence(tradePlan, searchableZones, candles, dailyCandles) : null),
    [tradePlan, searchableZones, candles, dailyCandles]
  );
  const technicalSummary = useMemo(
    () => (currentPrice !== null ? generateTechnicalSummary(candles, zones, currentPrice) : ""),
    [candles, zones, currentPrice]
  );
  // Guarantees the trade plan card's own zone (and the approaching-zone
  // alert's zone) are always among what's drawn on the chart / listed in
  // the sidebar, even when either fell outside detectZones' cosmetic top-N
  // cap — otherwise the sidebar could show an active "خطة الصفقة" or
  // "تقترب من منطقة طلب" note for a zone the chart never actually outlines.
  const displayZones = useMemo(() => {
    const extra = [tradePlan?.zone, approachingZone].filter(
      (z): z is Zone => z !== null && z !== undefined && !zones.some((existing) => existing.id === z.id)
    );
    if (extra.length === 0) return zones;
    return [...zones, ...extra].sort((a, b) => a.startTime - b.startTime);
  }, [zones, tradePlan, approachingZone]);
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
          <SymbolSearchSelect symbols={availableSymbols} value={symbol} onChange={(s) => setSymbol(s as Symbol)} />
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
        القائمة تضم 76 عملة مختارة يغطيها الموقع. هذا تحليل فني آلي وليس نصيحة استثمارية أو فتوى شرعية معتمدة؛
        راجع مصدرًا موثوقًا قبل الاعتماد عليه في قرار الاستثمار.
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
              symbol={symbol}
              data={candles}
              zones={displayZones}
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
              zones={displayZones}
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

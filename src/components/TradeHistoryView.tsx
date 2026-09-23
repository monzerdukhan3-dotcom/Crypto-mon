"use client";

import { CircleCheckBig, ChevronDown, Layers, Loader2, RefreshCw, Search, TrendingUp, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TIMEFRAMES, type Timeframe } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import type { TradeRecord } from "@/lib/tradeHistory";
import type { Candle } from "@/lib/types";
import { detectZones } from "@/lib/zones";
import type { SymbolInfo } from "@/lib/constants";
import CandlestickChart from "./CandlestickChart";
import type { TradePlanBox } from "./TradePlanBoxPrimitive";

// Fetched in small batches rather than all 304 (76 coins × 4 timeframes) at
// once, so the browser isn't holding that many concurrent requests open —
// each request is still independently cached server-side, so a second
// visitor (or this same page, refreshed) gets most of them instantly.
const BATCH_SIZE = 8;

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

function timeframeLabel(timeframe: Timeframe): string {
  return TIMEFRAMES.find((t) => t.value === timeframe)?.label ?? timeframe;
}

// A trade counts as successful the moment it reaches even one target —
// hitting the stop loss on whatever's left of the position afterward
// doesn't undo that first win, so a hit target always takes priority over
// a later stop-out when labeling the record.
function statusInfo(record: TradeRecord): { label: string; tone: "success" | "danger" | "muted" } {
  if (record.highestTargetHit >= record.targets.length) return { label: "تحقّقت كل الأهداف", tone: "success" };
  if (record.highestTargetHit > 0) {
    return record.stoppedOut
      ? { label: `نجحت (الهدف ${record.highestTargetHit}) ثم أُغلقت`, tone: "success" }
      : { label: `تحقّق الهدف ${record.highestTargetHit}`, tone: "success" };
  }
  if (record.stoppedOut) return { label: "وقف خسارة", tone: "danger" };
  return { label: "قيد الانتظار", tone: "muted" };
}

const TONE_CLASSES: Record<"success" | "danger" | "muted", string> = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-border text-muted",
};

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const valueClass = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  const badgeClass = tone === "success" ? "bg-success-soft text-success" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-info-soft text-info";
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${badgeClass}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <p className="text-xs text-muted">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

interface DetailState {
  recordId: string;
  candles: Candle[];
  error: string | null;
}

function RecordChartPanel({ record, detail }: { record: TradeRecord; detail: DetailState | null }) {
  const loading = !detail || detail.recordId !== record.id;

  const zones = useMemo(
    () => (detail && !detail.error ? detectZones(detail.candles) : []),
    [detail]
  );
  const tradeBox: TradePlanBox | null = useMemo(() => {
    if (!detail || detail.error || detail.candles.length === 0) return null;
    return {
      entry: record.entry,
      stopLoss: record.stopLoss,
      targets: record.targets,
      startTime: record.loggedAt,
      endTime: record.resolvedAt ?? detail.candles[detail.candles.length - 1].time,
      targetsHit: record.highestTargetHit,
      stoppedOut: record.stoppedOut,
    };
  }, [detail, record]);

  return (
    <div className="mt-3 h-80 overflow-hidden rounded-xl border border-surface-border bg-background">
      {loading ? (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-success" strokeWidth={2.25} />
          جاري تحميل الشارت...
        </div>
      ) : detail.error ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-danger">{detail.error}</div>
      ) : (
        <CandlestickChart
          symbol={record.symbol}
          data={detail.candles}
          zones={zones}
          tradeBox={tradeBox}
          timeframe={record.timeframe}
          chartKey={record.id}
        />
      )}
    </div>
  );
}

function TradeRecordRow({
  record,
  expanded,
  onToggle,
  detail,
}: {
  record: TradeRecord;
  expanded: boolean;
  onToggle: () => void;
  detail: DetailState | null;
}) {
  const info = statusInfo(record);

  return (
    <li className="rounded-xl border border-surface-border bg-surface p-4 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center justify-between gap-2 text-start">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{record.symbol}</span>
          <span className="text-xs text-muted">{timeframeLabel(record.timeframe)}</span>
          <span className="text-xs text-muted">{formatDate(record.loggedAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[info.tone]}`}>{info.label}</span>
          <ChevronDown
            className={`h-4 w-4 text-muted transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.25}
          />
        </div>
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-3 md:grid-cols-6">
        <span>
          الدخول: <span className="font-medium text-foreground">{formatPrice(record.entry)}</span>
        </span>
        <span>
          الوقف: <span className="font-medium text-danger">{formatPrice(record.stopLoss)}</span>
        </span>
        {record.targets.map((t, i) => (
          <span key={i}>
            هدف {i + 1}:{" "}
            <span className={`font-medium ${record.highestTargetHit > i ? "text-success" : "text-foreground"}`}>
              {formatPrice(t)}
            </span>
          </span>
        ))}
        <span>
          القوة: <span className="font-medium text-foreground">{record.confidenceScore}/100</span>
        </span>
      </div>

      {expanded && <RecordChartPanel record={record} detail={detail} />}
    </li>
  );
}

async function fetchPairHistory(symbol: string, timeframe: Timeframe): Promise<TradeRecord[]> {
  try {
    const res = await fetch(`/api/trade-history?symbol=${symbol}&timeframe=${timeframe}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.records) ? (json.records as TradeRecord[]) : [];
  } catch {
    return [];
  }
}

async function fetchCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const res = await fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "فشل تحميل بيانات الشارت");
  return json.candles as Candle[];
}

export default function TradeHistoryView() {
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<TradeRecord[] | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [symbolFilter, setSymbolFilter] = useState(() => searchParams.get("symbol")?.toUpperCase() ?? "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [notFoundHint, setNotFoundHint] = useState(false);
  const autoOpenedRef = useRef(false);
  const candleCacheRef = useRef<Map<string, Candle[]>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const symbolsRes = await fetch("/api/symbols")
        .then((r) => r.json())
        .catch(() => null);
      const symbols: SymbolInfo[] = Array.isArray(symbolsRes?.symbols) ? symbolsRes.symbols : [];
      if (cancelled) return;
      if (symbols.length === 0) {
        setRecords([]);
        return;
      }

      const pairs = symbols.flatMap((s) => TIMEFRAMES.map((t) => ({ symbol: s.symbol, timeframe: t.value })));
      setProgress({ done: 0, total: pairs.length });

      const collected: TradeRecord[] = [];
      for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = pairs.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map((p) => fetchPairHistory(p.symbol, p.timeframe)));
        for (const r of results) collected.push(...r);
        setProgress({ done: Math.min(i + BATCH_SIZE, pairs.length), total: pairs.length });
      }

      if (!cancelled) setRecords(collected);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const sorted = useMemo(() => [...(records ?? [])].sort((a, b) => b.loggedAt - a.loggedAt), [records]);

  const filtered = useMemo(() => {
    const q = symbolFilter.trim().toUpperCase();
    if (!q) return sorted;
    return sorted.filter((r) => r.symbol.toUpperCase().includes(q));
  }, [sorted, symbolFilter]);

  // A deep link from the "opportunities now" page — once the full record
  // set has loaded, open the newest matching record automatically so the
  // trade that was "just activated" there shows up drawn on this page's
  // chart, instead of leaving the visitor to find it in the list by hand.
  useEffect(() => {
    if (records === null || autoOpenedRef.current) return;
    autoOpenedRef.current = true;

    const paramSymbol = searchParams.get("symbol")?.toUpperCase();
    const paramTimeframe = searchParams.get("timeframe");
    if (!paramSymbol || !paramTimeframe) return;

    const match = sorted.find((r) => r.symbol.toUpperCase() === paramSymbol && r.timeframe === paramTimeframe);
    queueMicrotask(() => {
      if (match) {
        setExpandedId(match.id);
      } else {
        setNotFoundHint(true);
      }
    });
  }, [records, sorted, searchParams]);

  function toggleRecord(record: TradeRecord) {
    setExpandedId((current) => (current === record.id ? null : record.id));
  }

  useEffect(() => {
    if (!expandedId) return;
    const record = sorted.find((r) => r.id === expandedId);
    if (!record) return;

    const cacheKey = `${record.symbol}:${record.timeframe}`;
    const cached = candleCacheRef.current.get(cacheKey);
    if (cached) {
      setDetail({ recordId: record.id, candles: cached, error: null });
      return;
    }

    let cancelled = false;
    setDetail(null);
    fetchCandles(record.symbol, record.timeframe)
      .then((candles) => {
        if (cancelled) return;
        candleCacheRef.current.set(cacheKey, candles);
        setDetail({ recordId: record.id, candles, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDetail({
          recordId: record.id,
          candles: [],
          error: error instanceof Error ? error.message : "فشل تحميل بيانات الشارت",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [expandedId, sorted]);

  const stats = useMemo(() => {
    // A trade is a win as soon as it hits its first target, even if it's
    // still open toward the rest or later stops out on what's left — that
    // first target is already banked. Only a stop-out with zero targets
    // hit ever counts as a loss. A record that hasn't hit anything yet and
    // hasn't stopped out is still pending, so it's left out of the rate.
    const wins = sorted.filter((r) => r.highestTargetHit > 0).length;
    const losses = sorted.filter((r) => r.stoppedOut && r.highestTargetHit === 0).length;
    const decided = wins + losses;
    const winRate = decided > 0 ? Math.round((wins / decided) * 100) : null;
    return { total: sorted.length, wins, losses, winRate };
  }, [sorted]);

  const loading = records === null;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-info via-success to-info" />
        <p className="text-sm leading-relaxed text-muted">
          بيانات حقيقية 100% من نفس السوق الحي — ليست تجربة أو محاكاة. يُحتسب تلقائيًا لـ 76 عملة على الأطر
          الزمنية الأربعة كلها بمجرد أن يعود السعر فعليًا لمنطقة طلب، ويُقيَّم مقابل آخر 250 شمعة حقيقية لكل عملة
          وفريم زمني. السجل يبدأ من الآن فصاعدًا فقط — لا صفقات قديمة قبل تفعيل هذا السجل — وليس محفوظًا في
          متصفحك، فهو مطابق لكل الزوار على أي جهاز، ويتجدد تلقائيًا كل بضع دقائق. اضغط على أي صفقة لرؤيتها مرسومة
          على شارتها.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Layers} label="الإجمالي" value={loading ? "—" : String(stats.total)} />
        <StatCard icon={CircleCheckBig} label="تحقّقت أهدافها" value={loading ? "—" : String(stats.wins)} tone="success" />
        <StatCard icon={XCircle} label="وقف خسارة" value={loading ? "—" : String(stats.losses)} tone="danger" />
        <StatCard
          icon={TrendingUp}
          label="نسبة النجاح"
          value={!loading && stats.winRate !== null ? `${stats.winRate}%` : "—"}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" strokeWidth={2.25} />
          <input
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            placeholder="ابحث عن عملة..."
            className="w-full rounded-lg border border-surface-border bg-background py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted transition-colors duration-150 hover:border-success/40 focus:outline-none focus:ring-2 focus:ring-success/40"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground">السجل {loading ? "" : `(${filtered.length})`}</h2>
          <button
            onClick={() => {
              setRecords(null);
              setExpandedId(null);
              setReloadKey((k) => k + 1);
            }}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-background hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={2.25} />
            تحديث
          </button>
        </div>
      </div>

      {notFoundHint && (
        <p className="rounded-lg border border-surface-border bg-surface/60 px-4 py-2.5 text-xs leading-relaxed text-muted">
          لم يتم العثور بعد على صفقة مسجّلة لهذه العملة والفريم الزمني — قد تحتاج بضع ثوانٍ لتُحتسب، جرّب التحديث.
        </p>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-success" strokeWidth={2.25} />
          جاري تحميل سجل الصفقات
          {progress.total > 0 && ` (${progress.done}/${progress.total})`}
          ...
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">
          {symbolFilter ? "لا توجد صفقات مطابقة لبحثك." : "لم يتحقق أي إعداد صفقة بعد ضمن آخر 250 شمعة المتاحة لأي عملة مدعومة."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((r) => (
            <TradeRecordRow
              key={r.id}
              record={r}
              expanded={expandedId === r.id}
              onToggle={() => toggleRecord(r)}
              detail={detail}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

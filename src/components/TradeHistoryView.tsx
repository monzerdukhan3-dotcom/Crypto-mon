"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TIMEFRAMES, type Timeframe } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import { evaluateTradeOutcome, loadTradeHistory, saveTradeHistory, type TradeRecord } from "@/lib/tradeHistory";
import type { Candle } from "@/lib/types";

async function fetchCandleSet(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const res = await fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "فشل تحميل البيانات");
  return json.candles as Candle[];
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

function timeframeLabel(timeframe: Timeframe): string {
  return TIMEFRAMES.find((t) => t.value === timeframe)?.label ?? timeframe;
}

function statusInfo(record: TradeRecord): { label: string; tone: "success" | "danger" | "muted" } {
  if (record.stoppedOut) return { label: "وقف خسارة", tone: "danger" };
  if (record.highestTargetHit >= record.targets.length) return { label: "تحقّقت كل الأهداف", tone: "success" };
  if (record.highestTargetHit > 0) return { label: `تحقّق الهدف ${record.highestTargetHit}`, tone: "success" };
  return { label: "قيد الانتظار", tone: "muted" };
}

const TONE_CLASSES: Record<"success" | "danger" | "muted", string> = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-border text-muted",
};

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const valueClass = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function TradeRecordRow({ record }: { record: TradeRecord }) {
  const info = statusInfo(record);

  return (
    <li className="rounded-xl border border-surface-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{record.symbol}</span>
          <span className="text-xs text-muted">{timeframeLabel(record.timeframe)}</span>
          <span className="text-xs text-muted">{formatDate(record.loggedAt)}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[info.tone]}`}>
          {info.label}
        </span>
      </div>
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
    </li>
  );
}

export default function TradeHistoryView() {
  const [records, setRecords] = useState<TradeRecord[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const history = loadTradeHistory();
      if (cancelled) return;
      setRecords(history);

      const pending = history.filter((r) => !r.resolved);
      if (pending.length === 0) return;

      setRefreshing(true);
      const uniquePairs = Array.from(new Set(pending.map((r) => `${r.symbol}:${r.timeframe}`)));
      const candleSets = new Map<string, Candle[]>();

      await Promise.all(
        uniquePairs.map(async (key) => {
          const [sym, tf] = key.split(":") as [string, Timeframe];
          try {
            candleSets.set(key, await fetchCandleSet(sym, tf));
          } catch {
            // Leave this pair's records at their last known state.
          }
        })
      );
      if (cancelled) return;

      const updated = history.map((r) => {
        if (r.resolved) return r;
        const candles = candleSets.get(`${r.symbol}:${r.timeframe}`);
        return candles ? evaluateTradeOutcome(r, candles) : r;
      });

      saveTradeHistory(updated);
      setRecords(updated);
      setRefreshing(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => [...(records ?? [])].sort((a, b) => b.loggedAt - a.loggedAt), [records]);

  const stats = useMemo(() => {
    const resolved = sorted.filter((r) => r.resolved);
    const wins = resolved.filter((r) => !r.stoppedOut).length;
    const losses = resolved.filter((r) => r.stoppedOut).length;
    const winRate = resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : null;
    return { total: sorted.length, wins, losses, winRate };
  }, [sorted]);

  function clearHistory() {
    saveTradeHistory([]);
    setRecords([]);
  }

  if (records === null) {
    return <p className="text-sm text-muted">جاري التحميل...</p>;
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
        <p className="text-sm leading-relaxed text-muted">
          هذا السجل محفوظ محليًا داخل متصفحك فقط (localStorage) — لا يُشارك مع زوار آخرين ويُفقد لو مسحت بيانات
          المتصفح أو بدّلت جهازًا. يُسجَّل كل إعداد صفقة جديد تلقائيًا عند ظهوره، ويُعاد تقييمه مقابل آخر 200 شمعة
          متاحة لكل عملة وفريم زمني.
          {refreshing && " جاري تحديث النتائج الآن..."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="الإجمالي" value={String(stats.total)} />
        <StatCard label="تحقّقت أهدافها" value={String(stats.wins)} tone="success" />
        <StatCard label="وقف خسارة" value={String(stats.losses)} tone="danger" />
        <StatCard label="نسبة النجاح" value={stats.winRate !== null ? `${stats.winRate}%` : "—"} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">السجل ({sorted.length})</h2>
        {sorted.length > 0 && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            حذف السجل
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted">
          لا توجد صفقات مسجّلة بعد — ستُضاف تلقائيًا كل ما اقترح الموقع صفقة جديدة أثناء تصفّحك.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((r) => (
            <TradeRecordRow key={r.id} record={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

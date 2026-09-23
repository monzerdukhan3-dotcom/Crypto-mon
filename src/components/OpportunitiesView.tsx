"use client";

import { Bell, BellOff, BellRing, Loader2, RefreshCw, Target } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TIMEFRAMES, type SymbolInfo, type Timeframe } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import type { OpportunityResult } from "@/app/api/opportunities/route";

// Fetched in small batches rather than all 304 (76 coins × 4 timeframes) at
// once — each request is still independently cached server-side for a
// minute, so this is cheap to repeat.
const BATCH_SIZE = 8;
// How often to re-scan while this page stays open.
const REFRESH_MS = 60_000;
// Cap on how many "approaching" rows to render — with 76 coins × 4
// timeframes, even a tight watch band can turn up more than anyone would
// actually scan through; the closest ones (already sorted first) are what
// matters.
const APPROACHING_DISPLAY_LIMIT = 20;

function timeframeLabel(timeframe: Timeframe): string {
  return TIMEFRAMES.find((t) => t.value === timeframe)?.label ?? timeframe;
}

async function fetchOpportunity(symbol: string, timeframe: Timeframe): Promise<OpportunityResult | null> {
  try {
    const res = await fetch(`/api/opportunities?symbol=${symbol}&timeframe=${timeframe}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json as OpportunityResult;
  } catch {
    return null;
  }
}

function OpportunityRow({ item }: { item: OpportunityResult }) {
  const isEntry = item.status === "entry";
  // Only meaningful for "approaching" — see approachingTrendReady's own
  // doc comment on OpportunityResult. A confirmed downtrend right now
  // means buildTradePlan's own gate would reject a return to this zone as
  // things stand, so a subscriber watching this row shouldn't expect a
  // trade to open the moment price gets there unless the trend turns
  // first. Not shown for "entry" (already open) or when the trend is fine.
  const trendWarning = !isEntry && item.approachingTrendReady === false;
  return (
    <li className="rounded-xl border border-surface-border bg-surface p-4 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{item.symbol}</span>
          <span className="text-xs text-muted">{timeframeLabel(item.timeframe)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              isEntry ? "bg-success-soft text-success" : "bg-info-soft text-info"
            }`}
          >
            {isEntry ? "عند نقطة الدخول" : `يقترب (${Math.abs(item.distancePct ?? 0).toFixed(1)}%)`}
          </span>
          <Link
            href={isEntry ? `/history?symbol=${item.symbol}&timeframe=${item.timeframe}` : `/?symbol=${item.symbol}&timeframe=${item.timeframe}`}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-info transition-colors duration-150 hover:bg-info-soft"
          >
            {isEntry ? "عرض الصفقة" : "فتح الشارت"}
          </Link>
        </div>
      </div>
      {trendWarning && (
        <p className="mt-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
          ⚠️ الاتجاه العام هابط حالياً — لن تُفتح صفقة عند وصول السعر لهذه المنطقة ما لم يتحول الاتجاه أولاً
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-4">
        <span>
          السعر الحالي: <span className="font-medium text-foreground">{formatPrice(item.currentPrice)}</span>
        </span>
        <span>
          الدخول: <span className="font-medium text-foreground">{formatPrice(item.entry ?? 0)}</span>
        </span>
        {item.stopLoss !== null && (
          <span>
            الوقف: <span className="font-medium text-danger">{formatPrice(item.stopLoss)}</span>
          </span>
        )}
        {item.zoneBottom !== null && item.zoneTop !== null && (
          <span>
            المنطقة:{" "}
            <span className="font-medium text-foreground">
              {formatPrice(item.zoneBottom)}–{formatPrice(item.zoneTop)}
            </span>
          </span>
        )}
      </div>
    </li>
  );
}

type NotifyState = "unsupported" | "default" | "granted" | "denied";

export default function OpportunitiesView() {
  const [results, setResults] = useState<OpportunityResult[] | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [notify, setNotify] = useState<NotifyState>("default");
  const notifyRef = useRef<NotifyState>("default");
  const seenEntriesRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  useEffect(() => {
    // Deferred so this initial read from `Notification` doesn't run
    // synchronously inside the effect body itself.
    queueMicrotask(() => {
      setNotify("Notification" in window ? (Notification.permission as NotifyState) : "unsupported");
    });
  }, []);

  const requestNotifications = useCallback(() => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then((permission) => setNotify(permission as NotifyState));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const symbolsRes = await fetch("/api/symbols")
        .then((r) => r.json())
        .catch(() => null);
      const symbols: SymbolInfo[] = Array.isArray(symbolsRes?.symbols) ? symbolsRes.symbols : [];
      if (cancelled) return;
      if (symbols.length === 0) {
        setResults([]);
        return;
      }

      const pairs = symbols.flatMap((s) => TIMEFRAMES.map((t) => ({ symbol: s.symbol, timeframe: t.value })));
      setProgress({ done: 0, total: pairs.length });

      const collected: OpportunityResult[] = [];
      for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = pairs.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map((p) => fetchOpportunity(p.symbol, p.timeframe)));
        for (const r of batchResults) {
          if (r && r.status !== "none") collected.push(r);
        }
        setProgress({ done: Math.min(i + BATCH_SIZE, pairs.length), total: pairs.length });
      }
      if (cancelled) return;

      // Notify only for entries that weren't already here last scan, and
      // never on the very first load — that would fire for everything
      // already true the moment the page opens, not just new arrivals.
      if (notifyRef.current === "granted" && !isFirstLoadRef.current) {
        for (const r of collected) {
          if (r.status !== "entry") continue;
          const key = `${r.symbol}:${r.timeframe}`;
          if (!seenEntriesRef.current.has(key)) {
            new Notification(`${r.symbol} — ${timeframeLabel(r.timeframe)}`, {
              body: `السعر وصل لمنطقة الدخول عند ${formatPrice(r.entry ?? r.currentPrice)}`,
              icon: "/logo-mark.png",
              tag: key,
            });
          }
        }
      }
      seenEntriesRef.current = new Set(
        collected.filter((r) => r.status === "entry").map((r) => `${r.symbol}:${r.timeframe}`)
      );
      isFirstLoadRef.current = false;

      if (!cancelled) setResults(collected);
    }

    run();
    const interval = setInterval(run, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reloadKey]);

  const loading = results === null;
  const entries = (results ?? []).filter((r) => r.status === "entry");
  const approaching = (results ?? [])
    .filter((r) => r.status === "approaching")
    .sort((a, b) => Math.abs(a.distancePct ?? 0) - Math.abs(b.distancePct ?? 0));

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-info via-success to-info" />
        <p className="text-sm leading-relaxed text-muted">
          مسح تلقائي حي لـ 76 عملة على الأطر الزمنية الأربعة كلها — يعرض أي عملة وصل سعرها الآن لمنطقة طلب
          صالحة للدخول، وأي عملة تقترب منها. يتجدد تلقائيًا كل دقيقة طالما هذه الصفحة مفتوحة. تنبيهات المتصفح
          (لو فعّلتها) تعمل فقط أثناء بقاء هذه الصفحة مفتوحة في متصفحك — وليست تنبيهات push تصلك والتطبيق مغلق.
        </p>
        <div className="mt-4">
          {notify === "granted" ? (
            <span className="flex w-fit items-center gap-1.5 rounded-lg bg-success-soft px-3 py-1.5 text-xs font-medium text-success">
              <BellRing className="h-3.5 w-3.5" strokeWidth={2.25} />
              تنبيهات المتصفح مفعّلة
            </span>
          ) : notify === "denied" ? (
            <span className="flex w-fit items-center gap-1.5 rounded-lg bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger">
              <BellOff className="h-3.5 w-3.5" strokeWidth={2.25} />
              تم رفض إذن التنبيهات من إعدادات المتصفح
            </span>
          ) : notify === "unsupported" ? null : (
            <button
              onClick={requestNotifications}
              className="flex items-center gap-1.5 rounded-lg bg-info-soft px-3 py-1.5 text-xs font-medium text-info transition-colors duration-150 hover:bg-info/20"
            >
              <Bell className="h-3.5 w-3.5" strokeWidth={2.25} />
              تفعيل تنبيهات المتصفح
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">
          الفرص الآن {loading ? "" : `(${entries.length + approaching.length})`}
        </h2>
        <button
          onClick={() => {
            setResults(null);
            setReloadKey((k) => k + 1);
          }}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-background hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={2.25} />
          تحديث
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-success" strokeWidth={2.25} />
          جاري فحص العملات
          {progress.total > 0 && ` (${progress.done}/${progress.total})`}
          ...
        </div>
      ) : entries.length === 0 && approaching.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted">
            <Target className="h-5 w-5" strokeWidth={2} />
          </span>
          <p className="text-sm text-muted">لا توجد فرص دخول أو اقتراب من منطقة طلب على أي عملة حاليًا.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {entries.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-success">عند نقطة الدخول الآن ({entries.length})</h3>
              <ul className="flex flex-col gap-3">
                {entries.map((r) => (
                  <OpportunityRow key={`${r.symbol}:${r.timeframe}`} item={r} />
                ))}
              </ul>
            </div>
          )}
          {approaching.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-info">تقترب من منطقة الدخول ({approaching.length})</h3>
              <ul className="flex flex-col gap-3">
                {approaching.slice(0, APPROACHING_DISPLAY_LIMIT).map((r) => (
                  <OpportunityRow key={`${r.symbol}:${r.timeframe}`} item={r} />
                ))}
              </ul>
              {approaching.length > APPROACHING_DISPLAY_LIMIT && (
                <p className="text-center text-xs text-muted">
                  + {approaching.length - APPROACHING_DISPLAY_LIMIT} عملة أخرى أبعد من ذلك، غير معروضة هنا
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

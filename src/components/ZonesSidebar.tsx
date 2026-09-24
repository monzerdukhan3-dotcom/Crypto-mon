"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CircleCheckBig,
  Crosshair,
  ExternalLink,
  Gauge,
  Globe,
  Hash,
  Layers,
  LineChart,
  Loader2,
  Newspaper,
  Shield,
  Target,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatPrice } from "@/lib/format";
import { getFundamentalNote } from "@/lib/fundamentalNotes";
import type { FundamentalData } from "@/lib/fundamentalData";
import type { TradeConfidence } from "@/lib/tradeConfidence";
import type { TradeProgress } from "@/lib/tradeProgress";
import type { TradePlan, Zone, ZoneStrength } from "@/lib/types";
import type { VolatilityCheck } from "@/lib/volatility";
import { zoneStrengthPercent } from "@/lib/zones";

interface ZonesSidebarProps {
  symbol: string;
  zones: Zone[];
  tradePlan: TradePlan | null;
  approachingZone: Zone | null;
  /**
   * Whether, as of right now, buildTradePlan's own trend gate would accept
   * a return to approachingZone — see OpportunityResult's identical field
   * for the full reasoning. Only meaningful alongside approachingZone.
   */
  approachingTrendReady: boolean;
  /**
   * The nearest broken zone to the current price (see
   * findRecentlyBrokenZone's own doc comment) — surfaced here specifically
   * so a demand zone this card once told a subscriber to place a pending
   * buy order at doesn't just silently get replaced by a different
   * suggestion the next time price moves. When set (and it's a demand
   * zone — only those ever get a "علّق أمر شراء" note), an explicit
   * "that order is now stale, cancel it" alert renders above whatever
   * this card is currently recommending, so the two are never conflated.
   */
  recentlyBrokenZone: Zone | null;
  tradeProgress: TradeProgress | null;
  confidence: TradeConfidence | null;
  technicalSummary: string;
  currentPrice: number;
  volatility: VolatilityCheck | null;
}

const STRENGTH_CLASSES: Record<ZoneStrength, string> = {
  strong: "bg-success-soft text-success",
  medium: "bg-warning-soft text-warning",
  weak: "bg-surface-border text-muted",
};

const FUNDAMENTAL_UNAVAILABLE = "تعذّر جلب بيانات التحليل الأساسي لهذه العملة حاليًا. حاول مرة أخرى بعد قليل.";

const TRADE_PROGRESS_STATUS_LABEL: Record<TradeProgress["status"], string> = {
  profit: "في الربح",
  loss: "في الخسارة",
  at_entry: "عند نقطة الدخول",
};

const TRADE_PROGRESS_STATUS_CLASSES: Record<TradeProgress["status"], string> = {
  profit: "text-success",
  loss: "text-danger",
  at_entry: "text-muted",
};

function Row({
  icon: Icon,
  label,
  value,
  className = "",
}: {
  icon: typeof Target;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5 text-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        {label}
      </span>
      <span className={`font-medium ${className}`}>{value}</span>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof Target; title: string; children: ReactNode }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-info/30 hover:shadow-md">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 scale-x-0 bg-gradient-to-r from-info via-success to-info transition-transform duration-300 group-hover:scale-x-100" />
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-info-soft text-info">
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, children }: { icon: typeof Target; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-3 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background text-muted">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

function Note({
  tone,
  icon: Icon,
  children,
}: {
  tone: "warning" | "success" | "info" | "danger";
  icon: typeof AlertTriangle;
  children: ReactNode;
}) {
  const classes =
    tone === "warning"
      ? "bg-warning-soft text-warning"
      : tone === "info"
        ? "bg-info-soft text-info"
        : tone === "danger"
          ? "bg-danger-soft text-danger"
          : "bg-success-soft text-success";
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium ${classes}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
      <span>{children}</span>
    </div>
  );
}

function confidenceColors(score: number): { text: string; bar: string } {
  if (score > 60) return { text: "text-success", bar: "bg-gradient-to-r from-success/70 to-success" };
  if (score >= 40) return { text: "text-warning", bar: "bg-gradient-to-r from-warning/70 to-warning" };
  return { text: "text-danger", bar: "bg-gradient-to-r from-danger/70 to-danger" };
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export default function ZonesSidebar({
  symbol,
  zones,
  tradePlan,
  approachingZone,
  approachingTrendReady,
  recentlyBrokenZone,
  tradeProgress,
  confidence,
  technicalSummary,
  currentPrice,
  volatility,
}: ZonesSidebarProps) {
  // ZonesSidebar only ever renders client-side (after AnalysisDashboard's
  // fetch resolves), so reading localStorage directly at render time here
  // carries no SSR-hydration-mismatch risk.
  const note = useMemo(() => getFundamentalNote(symbol), [symbol]);

  // Live fundamental profile (project description, market cap rank,
  // community sentiment) from /api/fundamentals — auto-refetches whenever
  // the symbol changes, no manual action needed. The admin-written `note`
  // above is a separate, optional supplement shown alongside it, not a
  // replacement for it.
  const [fundamentalResult, setFundamentalResult] = useState<{ symbol: string; data: FundamentalData | null } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fundamentals?symbol=${symbol}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: FundamentalData) => {
        if (!cancelled) setFundamentalResult({ symbol, data });
      })
      .catch(() => {
        if (!cancelled) setFundamentalResult({ symbol, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const fundamentalStatus: "loading" | "ready" | "error" =
    fundamentalResult?.symbol !== symbol ? "loading" : fundamentalResult.data ? "ready" : "error";
  const fundamental = fundamentalStatus === "ready" ? fundamentalResult!.data : null;

  const activeZones = zones
    .filter((z) => z.active)
    .sort((a, b) => Math.abs(a.top - currentPrice) - Math.abs(b.top - currentPrice))
    .slice(0, 12);

  return (
    <aside className="flex w-full flex-col gap-5 lg:w-80">
      <Card icon={Target} title="خطة الصفقة">
        <div className="flex flex-col gap-3">
          {recentlyBrokenZone && recentlyBrokenZone.type === "demand" && (
            <Note tone="danger" icon={AlertTriangle}>
              منطقة الشراء التي كنا ننصح بتعليق أمر شراء عندها (
              {formatPrice(recentlyBrokenZone.bottom)}–{formatPrice(recentlyBrokenZone.top)}) انكسرت. إن كان لديك
              أمر معلّق هناك، أوصي بإلغائه فورًا — لم تعد المنطقة صالحة.
            </Note>
          )}
          {volatility?.isHigh && (
            <Note tone="warning" icon={AlertTriangle}>
              تقلب مرتفع حاليًا — الحركة أعلى من المعتاد لهذه العملة بنسبة{" "}
              {Math.round((volatility.currentAtrPct / volatility.averageAtrPct - 1) * 100)}%
            </Note>
          )}
          {tradePlan ? (
            <>
              {tradePlan.retestNumber > 1 && (
                <Note tone="info" icon={Layers}>
                  هذه إعادة اختبار رقم {tradePlan.retestNumber} لهذه المنطقة — نجحت من قبل، لكن الثقة أقل من دخول
                  جديد على منطقة لم تُختبر بعد.
                </Note>
              )}
              <Row icon={Crosshair} label="الدخول" value={formatPrice(tradePlan.entry)} />
              <Row
                icon={Shield}
                label="وقف الخسارة"
                value={formatPrice(tradePlan.stopLoss)}
                className="text-danger"
              />
              {tradePlan.targets.map((target, i) => (
                <Row
                  key={i}
                  icon={ArrowUpRight}
                  label={`الهدف ${i + 1}`}
                  value={`${formatPrice(target)} (R ${tradePlan.riskRewardRatios[i]})`}
                  className="text-success"
                />
              ))}
            </>
          ) : approachingZone ? (
            <>
              <Note tone="info" icon={Bell}>
                السعر يقترب من منطقة طلب عند {formatPrice(approachingZone.bottom)}–{formatPrice(approachingZone.top)}
                — جهّز أمر شراء معلّق عندها.
              </Note>
              {!approachingTrendReady && (
                <Note tone="warning" icon={AlertTriangle}>
                  الاتجاه العام هابط حاليًا — لن تُفتح صفقة عند وصول السعر لهذه المنطقة ما لم يتحول الاتجاه أولًا.
                </Note>
              )}
              <Row icon={Crosshair} label="نقطة التعليق المقترحة" value={formatPrice(approachingZone.top)} />
            </>
          ) : (
            <EmptyState icon={Target}>لا توجد منطقة طلب نشطة أسفل السعر الحالي حاليًا.</EmptyState>
          )}
        </div>
      </Card>

      {tradePlan && tradeProgress && (
        <Card icon={Activity} title="تتبع الصفقة">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className={`text-lg font-bold ${TRADE_PROGRESS_STATUS_CLASSES[tradeProgress.status]}`}>
                {TRADE_PROGRESS_STATUS_LABEL[tradeProgress.status]}
              </span>
              <span className={`text-sm font-medium ${TRADE_PROGRESS_STATUS_CLASSES[tradeProgress.status]}`}>
                {tradeProgress.priceDiff >= 0 ? "+" : ""}
                {formatPrice(tradeProgress.priceDiff)} ({tradeProgress.priceDiffPct >= 0 ? "+" : ""}
                {tradeProgress.priceDiffPct.toFixed(2)}%)
              </span>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                <span>الاقتراب من {tradeProgress.nearestLevel === "target1" ? "الهدف 1" : "وقف الخسارة"}</span>
                <span>{tradeProgress.proximityPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-border">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${tradeProgress.nearestLevel === "target1" ? "bg-gradient-to-r from-success/70 to-success" : "bg-gradient-to-r from-danger/70 to-danger"}`}
                  style={{ width: `${tradeProgress.proximityPct}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card icon={Gauge} title="قوة الصفقة">
        {confidence ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-bold ${confidenceColors(confidence.score).text}`}>
                {confidence.score}
              </span>
              <span className="text-sm text-muted">/ 100</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-border">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${confidenceColors(confidence.score).bar}`}
                style={{ width: `${confidence.score}%` }}
              />
            </div>
            {confidence.hasReversalPattern && (
              <Note tone="success" icon={CircleCheckBig}>
                تم رصد نمط شمعة انعكاسي (Pin Bar / Engulfing) عند المنطقة
              </Note>
            )}
            {confidence.hasMtfConflict && (
              <Note tone="warning" icon={AlertTriangle}>
                الاتجاه على الفريم اليومي هابط — قد يتعارض مع هذه الصفقة
              </Note>
            )}
          </div>
        ) : (
          <EmptyState icon={Gauge}>لا توجد صفقة مقترحة حاليًا لتقييمها.</EmptyState>
        )}
      </Card>

      <Card icon={LineChart} title="التحليل الفني">
        <p className="text-sm leading-relaxed text-foreground">{technicalSummary}</p>
      </Card>

      <Card icon={Newspaper} title="التحليل الأساسي">
        {fundamentalStatus === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
            جاري التحميل...
          </div>
        ) : fundamental ? (
          <div className="flex flex-col gap-3">
            {fundamental.marketCapRank !== null && (
              <Row icon={Hash} label="الترتيب بالقيمة السوقية" value={`#${fundamental.marketCapRank}`} />
            )}
            {fundamental.sentimentUpPct !== null && fundamental.sentimentDownPct !== null && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                  <span className="flex items-center gap-1 text-success">
                    <ThumbsUp className="h-3 w-3" strokeWidth={2.25} />
                    {fundamental.sentimentUpPct.toFixed(0)}%
                  </span>
                  <span>رأي المجتمع</span>
                  <span className="flex items-center gap-1 text-danger">
                    {fundamental.sentimentDownPct.toFixed(0)}%
                    <ThumbsDown className="h-3 w-3" strokeWidth={2.25} />
                  </span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-border">
                  <div className="h-full bg-success" style={{ width: `${fundamental.sentimentUpPct}%` }} />
                  <div className="h-full bg-danger" style={{ width: `${fundamental.sentimentDownPct}%` }} />
                </div>
              </div>
            )}
            {fundamental.description && (
              <p className="text-sm leading-relaxed text-foreground" dir="ltr">
                {fundamental.description}
              </p>
            )}
            <div className="flex items-center justify-between text-xs text-muted">
              <span>المصدر: CoinGecko · يُحدَّث تلقائيًا</span>
              {fundamental.homepage && (
                <a
                  href={fundamental.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-success hover:underline"
                >
                  <Globe className="h-3 w-3" strokeWidth={2.25} />
                  الموقع الرسمي
                </a>
              )}
            </div>
          </div>
        ) : (
          <EmptyState icon={Newspaper}>{FUNDAMENTAL_UNAVAILABLE}</EmptyState>
        )}

        {note ? (
          <div className="mt-4 flex flex-col gap-1.5 border-t border-surface-border pt-3">
            <p className="text-xs font-semibold text-muted">ملاحظة إضافية من المدير</p>
            <p className="text-sm leading-relaxed text-foreground">{note.text}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span>آخر تحديث: {formatDate(note.updatedAt)}</span>
              <Link href="/admin" className="flex items-center gap-1 text-success hover:underline">
                تحرير
                <ExternalLink className="h-3 w-3" strokeWidth={2.25} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 border-t border-surface-border pt-3 text-xs text-muted">
            <Link href="/admin" className="flex items-center gap-1 text-success hover:underline">
              أضف ملاحظة يدوية
              <ExternalLink className="h-3 w-3" strokeWidth={2.25} />
            </Link>
          </div>
        )}
      </Card>

      <Card icon={Layers} title={`المناطق النشطة (${activeZones.length})`}>
        {activeZones.length === 0 ? (
          <EmptyState icon={Layers}>لم يتم رصد مناطق بعد.</EmptyState>
        ) : (
          <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto">
            {activeZones.map((zone) => (
              <li
                key={zone.id}
                className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm transition-colors duration-150 hover:bg-background ${
                  zone.id === approachingZone?.id ? "bg-info-soft hover:bg-info-soft" : ""
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    zone.type === "demand" ? "bg-success" : "bg-danger"
                  }`}
                  aria-hidden
                />
                <span className="flex flex-1 items-center gap-1.5 text-foreground">
                  {zone.type === "demand" ? "طلب" : "عرض"} {formatPrice(zone.bottom)}–
                  {formatPrice(zone.top)}
                  {zone.id === approachingZone?.id && (
                    <Bell className="h-3 w-3 text-info" strokeWidth={2.25} aria-label="اقتراب" />
                  )}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STRENGTH_CLASSES[zone.strength]}`}
                >
                  {zoneStrengthPercent(zone.strengthScore)}/100
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </aside>
  );
}

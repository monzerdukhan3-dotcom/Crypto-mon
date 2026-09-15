"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CircleCheckBig,
  Crosshair,
  Droplets,
  ExternalLink,
  Gauge,
  Layers,
  LineChart,
  Newspaper,
  Shield,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { formatPrice } from "@/lib/format";
import { getFundamentalNote } from "@/lib/fundamentalNotes";
import type { LiquidityLevel } from "@/lib/liquidityZones";
import type { TradeConfidence } from "@/lib/tradeConfidence";
import type { TradeProgress } from "@/lib/tradeProgress";
import type { TradePlan, Zone, ZoneStrength } from "@/lib/types";
import type { VolatilityCheck } from "@/lib/volatility";

interface ZonesSidebarProps {
  symbol: string;
  zones: Zone[];
  liquidityLevels: LiquidityLevel[];
  tradePlan: TradePlan | null;
  tradeProgress: TradeProgress | null;
  confidence: TradeConfidence | null;
  technicalSummary: string;
  currentPrice: number;
  volatility: VolatilityCheck | null;
}

const LIQUIDITY_TYPE_LABEL: Record<LiquidityLevel["type"], string> = {
  buyside: "قمم متقاربة",
  sellside: "قيعان متقاربة",
};

const STRENGTH_LABEL: Record<ZoneStrength, string> = {
  strong: "قوية",
  medium: "متوسطة",
  weak: "ضعيفة",
};

const STRENGTH_CLASSES: Record<ZoneStrength, string> = {
  strong: "bg-success-soft text-success",
  medium: "bg-warning-soft text-warning",
  weak: "bg-surface-border text-muted",
};

const FUNDAMENTAL_PLACEHOLDER =
  "لا توجد ملاحظة تحليل أساسي محفوظة لهذه العملة بعد. الأخبار الحية تحتاج مصدر خارجي (مثل CryptoPanic أو NewsAPI) غير متوفر حاليًا في المشروع — يمكنك كتابة ملاحظة يدوية من صفحة الإعدادات.";

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
    <div className="rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted" strokeWidth={2.25} />
        {title}
      </h2>
      {children}
    </div>
  );
}

function Note({
  tone,
  icon: Icon,
  children,
}: {
  tone: "warning" | "success";
  icon: typeof AlertTriangle;
  children: ReactNode;
}) {
  const classes = tone === "warning" ? "bg-warning-soft text-warning" : "bg-success-soft text-success";
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium ${classes}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
      <span>{children}</span>
    </div>
  );
}

function confidenceColors(score: number): { text: string; bar: string } {
  if (score > 60) return { text: "text-success", bar: "bg-success" };
  if (score >= 40) return { text: "text-warning", bar: "bg-warning" };
  return { text: "text-danger", bar: "bg-danger" };
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export default function ZonesSidebar({
  symbol,
  zones,
  liquidityLevels,
  tradePlan,
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

  const activeZones = zones
    .filter((z) => z.active)
    .sort((a, b) => Math.abs(a.top - currentPrice) - Math.abs(b.top - currentPrice))
    .slice(0, 12);

  return (
    <aside className="flex w-full flex-col gap-5 lg:w-80">
      <Card icon={Target} title="خطة الصفقة">
        <div className="flex flex-col gap-3">
          {volatility?.isHigh && (
            <Note tone="warning" icon={AlertTriangle}>
              تقلب مرتفع حاليًا — الحركة أعلى من المعتاد لهذه العملة بنسبة{" "}
              {Math.round((volatility.currentAtrPct / volatility.averageAtrPct - 1) * 100)}%
            </Note>
          )}
          {tradePlan ? (
            <>
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
          ) : (
            <p className="text-sm text-muted">لا توجد منطقة طلب نشطة أسفل السعر الحالي حاليًا.</p>
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
                  className={`h-full rounded-full ${tradeProgress.nearestLevel === "target1" ? "bg-success" : "bg-danger"}`}
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
                className={`h-full rounded-full ${confidenceColors(confidence.score).bar}`}
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
          <p className="text-sm text-muted">لا توجد صفقة مقترحة حاليًا لتقييمها.</p>
        )}
      </Card>

      <Card icon={LineChart} title="التحليل الفني">
        <p className="text-sm leading-relaxed text-foreground">{technicalSummary}</p>
      </Card>

      <Card icon={Newspaper} title="التحليل الأساسي">
        <p className="text-sm leading-relaxed text-foreground">{note?.text || FUNDAMENTAL_PLACEHOLDER}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>{note ? `آخر تحديث: ${formatDate(note.updatedAt)}` : ""}</span>
          <Link href="/admin" className="flex items-center gap-1 text-success hover:underline">
            تحرير
            <ExternalLink className="h-3 w-3" strokeWidth={2.25} />
          </Link>
        </div>
      </Card>

      <Card icon={Layers} title={`المناطق النشطة (${activeZones.length})`}>
        {activeZones.length === 0 ? (
          <p className="text-sm text-muted">لم يتم رصد مناطق بعد.</p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto">
            {activeZones.map((zone) => (
              <li key={zone.id} className="flex items-center justify-between gap-2 text-sm">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    zone.type === "demand" ? "bg-success" : "bg-danger"
                  }`}
                  aria-hidden
                />
                <span className="flex-1 text-foreground">
                  {zone.type === "demand" ? "طلب" : "عرض"} {formatPrice(zone.bottom)}–
                  {formatPrice(zone.top)}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STRENGTH_CLASSES[zone.strength]}`}
                >
                  {STRENGTH_LABEL[zone.strength]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card icon={Droplets} title={`مناطق السيولة (${liquidityLevels.length})`}>
        {liquidityLevels.length === 0 ? (
          <p className="text-sm text-muted">لم يتم رصد قمم أو قيعان متقاربة بعد.</p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto">
            {liquidityLevels.map((level) => (
              <li key={level.id} className="flex items-center justify-between gap-2 text-sm">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    level.type === "sellside" ? "bg-success" : "bg-danger"
                  }`}
                  aria-hidden
                />
                <span className="flex-1 text-foreground">
                  {LIQUIDITY_TYPE_LABEL[level.type]} عند {formatPrice(level.price)}
                </span>
                <span className="shrink-0 rounded-full bg-surface-border px-2 py-0.5 text-xs font-medium text-muted">
                  {level.touches} لمسات
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </aside>
  );
}

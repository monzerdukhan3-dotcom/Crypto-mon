import {
  AlertTriangle,
  ArrowUpRight,
  CircleCheckBig,
  Crosshair,
  Droplets,
  Gauge,
  Layers,
  LineChart,
  Newspaper,
  Shield,
  Target,
} from "lucide-react";
import type { ReactNode } from "react";
import { formatPrice } from "@/lib/format";
import type { LiquidityLevel } from "@/lib/liquidityZones";
import type { TradeConfidence } from "@/lib/tradeConfidence";
import type { TradePlan, Zone, ZoneStrength } from "@/lib/types";
import type { VolatilityCheck } from "@/lib/volatility";

interface ZonesSidebarProps {
  zones: Zone[];
  liquidityLevels: LiquidityLevel[];
  tradePlan: TradePlan | null;
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
  "يحتاج هذا القسم ربط مصدر أخبار خارجي لاحقًا (مثل بيانات FOMC، مؤشر CPI، أو تدفقات صناديق ETF) لعرض تحليل أساسي حي، وينطبق نفس الأمر على فلتر مسافة الأمان من الأخبار (يحتاج ربط تقويم اقتصادي خارجي) — هذه البيانات غير متوفرة حاليًا داخل المشروع.";

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

export default function ZonesSidebar({
  zones,
  liquidityLevels,
  tradePlan,
  confidence,
  technicalSummary,
  currentPrice,
  volatility,
}: ZonesSidebarProps) {
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
        <p className="text-sm leading-relaxed text-muted">{FUNDAMENTAL_PLACEHOLDER}</p>
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

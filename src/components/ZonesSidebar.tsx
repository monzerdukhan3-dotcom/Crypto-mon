import { formatPrice } from "@/lib/format";
import type { TradePlan, Zone, ZoneStrength } from "@/lib/types";

interface ZonesSidebarProps {
  zones: Zone[];
  tradePlan: TradePlan | null;
  currentPrice: number;
}

const STRENGTH_LABEL: Record<ZoneStrength, string> = {
  strong: "قوية",
  medium: "متوسطة",
  weak: "ضعيفة",
};

const STRENGTH_CLASSES: Record<ZoneStrength, string> = {
  strong: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  weak: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

function Row({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={`font-medium ${className}`}>{value}</span>
    </div>
  );
}

export default function ZonesSidebar({ zones, tradePlan, currentPrice }: ZonesSidebarProps) {
  const activeZones = zones
    .filter((z) => z.active)
    .sort((a, b) => Math.abs(a.top - currentPrice) - Math.abs(b.top - currentPrice))
    .slice(0, 12);

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-80">
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 font-semibold text-zinc-900 dark:text-zinc-50">خطة الصفقة</h2>
        {tradePlan ? (
          <div className="flex flex-col gap-2">
            <Row label="الدخول" value={formatPrice(tradePlan.entry)} />
            <Row
              label="وقف الخسارة"
              value={formatPrice(tradePlan.stopLoss)}
              className="text-red-500"
            />
            {tradePlan.targets.map((target, i) => (
              <Row
                key={i}
                label={`الهدف ${i + 1}`}
                value={`${formatPrice(target)} (R ${tradePlan.riskRewardRatios[i]})`}
                className="text-green-600 dark:text-green-400"
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            لا توجد منطقة طلب نشطة أسفل السعر الحالي حاليًا.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 font-semibold text-zinc-900 dark:text-zinc-50">
          المناطق النشطة ({activeZones.length})
        </h2>
        {activeZones.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">لم يتم رصد مناطق بعد.</p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {activeZones.map((zone) => (
              <li
                key={zone.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    zone.type === "demand" ? "bg-green-500" : "bg-red-500"
                  }`}
                  aria-hidden
                />
                <span className="flex-1 text-zinc-700 dark:text-zinc-300">
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
      </div>
    </aside>
  );
}

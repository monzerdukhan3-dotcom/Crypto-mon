import type { Candle, TradePlan, Zone } from "./types";

export interface BuildTradePlanOptions {
  /** Extra room below the zone for the stop loss, as a fraction of zone height. */
  stopBufferRatio?: number;
  /** Fallback risk-multiples used for any target with no supply zone to aim at. */
  targetRMultiples?: number[];
  /** Minimum acceptable reward:risk on the first target — reject the setup below this. */
  minFirstTargetRR?: number;
}

/**
 * Builds an automatic trade plan off the nearest active demand zone below the
 * current price: entry at the zone's top (where a pullback would first tag
 * it), stop loss just under the zone's bottom, and 3 ascending targets that
 * prefer real active supply zones above entry, falling back to risk-multiples
 * when there aren't enough of those. Returns null if there's no such zone,
 * or if the first target's reward:risk doesn't clear the minimum bar — a
 * technically strong zone still isn't a trade if the setup itself is poor.
 */
export function buildTradePlan(
  zones: Zone[],
  currentPrice: number,
  options: BuildTradePlanOptions = {}
): TradePlan | null {
  const { stopBufferRatio = 0.15, targetRMultiples = [1.5, 2.5, 4], minFirstTargetRR = 1 } = options;

  const activeDemandZonesBelow = zones.filter(
    (z) => z.type === "demand" && z.active && z.top < currentPrice
  );
  if (activeDemandZonesBelow.length === 0) return null;

  const nearest = activeDemandZonesBelow.reduce((closest, zone) =>
    zone.top > closest.top ? zone : closest
  );

  const entry = nearest.top;
  const zoneHeight = nearest.top - nearest.bottom;
  const stopLoss = nearest.bottom - zoneHeight * stopBufferRatio;
  const riskAmount = entry - stopLoss;
  if (riskAmount <= 0) return null;

  const supplyTargetsAbove = zones
    .filter((z) => z.type === "supply" && z.active && z.bottom > entry)
    .sort((a, b) => a.bottom - b.bottom)
    .map((z) => z.bottom);

  const targets: number[] = [];
  for (let i = 0; i < targetRMultiples.length; i++) {
    const candidate = supplyTargetsAbove[i] ?? entry + riskAmount * targetRMultiples[i];
    const minAllowed = (i === 0 ? entry : targets[i - 1]) + riskAmount * 0.5;
    targets.push(Math.max(candidate, minAllowed));
  }

  const riskRewardRatios = targets.map((t) => Number(((t - entry) / riskAmount).toFixed(2)));
  if (riskRewardRatios[0] < minFirstTargetRR) return null;

  return { zone: nearest, entry, stopLoss, targets, riskAmount, riskRewardRatios };
}

/**
 * The time span a trade plan's entry/stop/target lines should be drawn
 * over: starting at the zone's own origin (its narrow box's end — where the
 * entry level was actually established) and ending the moment price first
 * reaches the stop loss or any target, whichever comes first — the same
 * "worst case first" convention tradeHistory.ts uses to resolve a trade.
 * Runs to the last available candle if nothing has been hit yet.
 */
export function computeTradePlanLineSpan(tradePlan: TradePlan, candles: Candle[]): { startTime: number; endTime: number } {
  const startIndex = candles.findIndex((c) => c.time >= tradePlan.zone.endTime);
  const fromIndex = startIndex === -1 ? 0 : startIndex;
  const startTime = candles[fromIndex]?.time ?? tradePlan.zone.endTime;

  let endTime = candles[candles.length - 1]?.time ?? startTime;
  for (let i = fromIndex; i < candles.length; i++) {
    const c = candles[i];
    if (c.low <= tradePlan.stopLoss || tradePlan.targets.some((t) => c.high >= t)) {
      endTime = c.time;
      break;
    }
  }

  return { startTime, endTime };
}

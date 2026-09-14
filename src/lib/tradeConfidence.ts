import type { TradePlan, Zone, ZoneStrength } from "./types";

const STRENGTH_POINTS: Record<ZoneStrength, number> = { strong: 40, medium: 25, weak: 10 };
const CONFLUENCE_POINTS_PER_ZONE = 10;
const MAX_CONFLUENCE_POINTS = 30;
const MAX_DISTANCE_POINTS = 30;
/** Relative distance to the nearest supply zone that earns full distance points. */
const DISTANCE_FULL_SCORE_THRESHOLD = 0.05;

export interface TradeConfidence {
  /** 0-100 overall score. */
  score: number;
  strengthPoints: number;
  confluencePoints: number;
  confluenceCount: number;
  distancePoints: number;
}

/**
 * Scores a trade plan's entry zone out of 100:
 * - the entry zone's own strength (strong/medium/weak) contributes up to 40
 * - other active demand zones overlapping it (confluence) contribute up to 30
 * - how much room there is before the nearest active supply zone above entry
 *   contributes up to 30 (more room to run scores higher)
 */
export function scoreTradeConfidence(tradePlan: TradePlan, zones: Zone[]): TradeConfidence {
  const { zone: entryZone, entry } = tradePlan;

  const strengthPoints = STRENGTH_POINTS[entryZone.strength];

  const confluenceCount = zones.filter(
    (z) =>
      z.id !== entryZone.id &&
      z.active &&
      z.type === "demand" &&
      z.top >= entryZone.bottom &&
      z.bottom <= entryZone.top
  ).length;
  const confluencePoints = Math.min(MAX_CONFLUENCE_POINTS, confluenceCount * CONFLUENCE_POINTS_PER_ZONE);

  const nearestSupplyAbove = zones
    .filter((z) => z.type === "supply" && z.active && z.bottom > entry)
    .sort((a, b) => a.bottom - b.bottom)[0];

  const distancePoints = nearestSupplyAbove
    ? Math.max(
        0,
        Math.min(
          MAX_DISTANCE_POINTS,
          Math.round(
            (((nearestSupplyAbove.bottom - entry) / entry) / DISTANCE_FULL_SCORE_THRESHOLD) * MAX_DISTANCE_POINTS
          )
        )
      )
    : MAX_DISTANCE_POINTS;

  const score = Math.min(100, strengthPoints + confluencePoints + distancePoints);

  return { score, strengthPoints, confluencePoints, confluenceCount, distancePoints };
}

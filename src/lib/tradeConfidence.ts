import { hasBullishReversalAtZone } from "./candlePatterns";
import { getUpcomingHighImpactEvent } from "./economicCalendar";
import { detectTrend } from "./trend";
import type { Candle, TradePlan, Zone, ZoneStrength } from "./types";

const STRENGTH_POINTS: Record<ZoneStrength, number> = { strong: 40, medium: 25, weak: 10 };
const CONFLUENCE_POINTS_PER_ZONE = 10;
const MAX_CONFLUENCE_POINTS = 30;
const MAX_DISTANCE_POINTS = 30;
/** Relative distance to the nearest supply zone that earns full distance points. */
const DISTANCE_FULL_SCORE_THRESHOLD = 0.05;
const REVERSAL_PATTERN_BONUS = 10;
/** Applied when the daily trend is down while this (long, demand-zone) setup fights it. */
const MTF_CONFLICT_PENALTY = 15;
const NEWS_RISK_PENALTY = 15;

export interface TradeConfidence {
  /** 0-100 overall score. */
  score: number;
  strengthPoints: number;
  confluencePoints: number;
  confluenceCount: number;
  distancePoints: number;
  reversalPatternBonus: number;
  hasReversalPattern: boolean;
  mtfConflictPenalty: number;
  hasMtfConflict: boolean;
  newsRiskPenalty: number;
  upcomingEventName: string | null;
}

/**
 * Scores a trade plan's entry zone out of 100 from:
 * - the entry zone's own strength (strong/medium/weak) — up to 40
 * - other active demand zones overlapping it (confluence) — up to 30
 * - room before the nearest active supply zone above entry — up to 30
 * - a bullish reversal candle (pin bar / engulfing) confirming price is
 *   actually reacting at the zone right now — +10
 * - a conflicting daily trend (down, while this is a long setup) — -15
 * - a high-impact economic event due soon, once a calendar is wired up — -15
 */
export function scoreTradeConfidence(
  tradePlan: TradePlan,
  zones: Zone[],
  candles: Candle[],
  higherTimeframeCandles: Candle[] | null = null
): TradeConfidence {
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

  const hasReversalPattern = hasBullishReversalAtZone(candles, entryZone.top, entryZone.bottom);
  const reversalPatternBonus = hasReversalPattern ? REVERSAL_PATTERN_BONUS : 0;

  const hasMtfConflict = higherTimeframeCandles !== null && detectTrend(higherTimeframeCandles) === "down";
  const mtfConflictPenalty = hasMtfConflict ? MTF_CONFLICT_PENALTY : 0;

  const upcomingEvent = getUpcomingHighImpactEvent();
  const newsRiskPenalty = upcomingEvent ? NEWS_RISK_PENALTY : 0;

  const rawScore =
    strengthPoints + confluencePoints + distancePoints + reversalPatternBonus - mtfConflictPenalty - newsRiskPenalty;
  const score = Math.max(0, Math.min(100, rawScore));

  return {
    score,
    strengthPoints,
    confluencePoints,
    confluenceCount,
    distancePoints,
    reversalPatternBonus,
    hasReversalPattern,
    mtfConflictPenalty,
    hasMtfConflict,
    newsRiskPenalty,
    upcomingEventName: upcomingEvent?.name ?? null,
  };
}

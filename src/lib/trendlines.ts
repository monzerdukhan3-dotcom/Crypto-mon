import type { Candle, SwingPoint } from "./types";

export type TrendlineType = "support" | "resistance";

export interface TrendlineSegment {
  /** Resistance connects two swing highs (price must stay below it); support connects two swing lows (price stays above it). */
  type: TrendlineType;
  point1: { index: number; price: number };
  point2: { index: number; price: number };
}

/** The trendline's projected price at any candle index, extrapolating past point2 using its slope. */
export function trendlineValueAt(line: TrendlineSegment, index: number): number {
  const { point1, point2 } = line;
  if (point2.index === point1.index) return point2.price;
  const slope = (point2.price - point1.price) / (point2.index - point1.index);
  return point1.price + slope * (index - point1.index);
}

/**
 * Connects every pair of same-type swing points (both highs, or both lows)
 * into a candidate trendline, keeping only pairs no candle between them
 * crosses — a real trendline touches price at its two defining points and
 * nowhere else in between. Not restricted to adjacent swings, so both
 * "رئيسي" (major, spanning many swings) and "فرعي" (minor, a couple of
 * bars apart) trendlines are found; the caller doesn't need to tell them
 * apart since both validate a zone equally.
 */
export function detectTrendlines(candles: Candle[], swings: SwingPoint[]): TrendlineSegment[] {
  const lines: TrendlineSegment[] = [];

  function buildForType(type: TrendlineType) {
    const points = swings
      .filter((s) => s.type === (type === "resistance" ? "high" : "low"))
      .sort((a, b) => a.index - b.index);

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const p1 = points[i];
        const p2 = points[j];
        const line: TrendlineSegment = {
          type,
          point1: { index: p1.index, price: p1.price },
          point2: { index: p2.index, price: p2.price },
        };

        let valid = true;
        for (let k = p1.index + 1; k < p2.index; k++) {
          const projected = trendlineValueAt(line, k);
          const breaches = type === "resistance" ? candles[k].high > projected : candles[k].low < projected;
          if (breaches) {
            valid = false;
            break;
          }
        }
        if (valid) lines.push(line);
      }
    }
  }

  buildForType("resistance");
  buildForType("support");

  return lines;
}

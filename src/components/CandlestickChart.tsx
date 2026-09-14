"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Zone } from "@/lib/types";
import { ZoneRectanglePrimitive } from "./ZoneRectanglePrimitive";

interface CandlestickChartProps {
  data: Candle[];
  zones?: Zone[];
}

// Matches the app's unified --success / --danger design tokens (globals.css).
// Chart marks stay at these fixed, saturated values in both themes — the
// tokens' subtler light/dark variants are for text and badges, not candles.
const SUCCESS_COLOR = "#22c55e";
const DANGER_COLOR = "#f04444";

export default function CandlestickChart({ data, zones = [] }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
      },
      grid: {
        vertLines: { color: "rgba(113, 113, 122, 0.1)" },
        horzLines: { color: "rgba(113, 113, 122, 0.1)" },
      },
      width: container.clientWidth,
      height: container.clientHeight,
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: SUCCESS_COLOR,
      downColor: DANGER_COLOR,
      borderVisible: false,
      wickUpColor: SUCCESS_COLOR,
      wickDownColor: DANGER_COLOR,
    });

    series.setData(
      data.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const primitives = zones.map((zone) => new ZoneRectanglePrimitive(zone));
    for (const primitive of primitives) {
      series.attachPrimitive(primitive);
    }

    // Zoom to a range that starts a little before the earliest *active* zone
    // (with a few candles of left margin) instead of the full fetched
    // history, so zones stay fully visible and readable without forcing the
    // chart to zoom out over everything we fetched.
    const activeZoneStarts = zones.filter((z) => z.active).map((z) => z.startTime);
    if (activeZoneStarts.length > 0 && data.length > 0) {
      const earliestZoneTime = Math.min(...activeZoneStarts);
      const zoneStartIndex = data.findIndex((c) => c.time >= earliestZoneTime);
      const leftPadding = 3;
      const fromIndex = Math.max(0, (zoneStartIndex === -1 ? 0 : zoneStartIndex) - leftPadding);
      chart.timeScale().setVisibleRange({
        from: data[fromIndex].time as UTCTimestamp,
        to: data[data.length - 1].time as UTCTimestamp,
      });
    } else {
      chart.timeScale().fitContent();
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      for (const primitive of primitives) {
        series.detachPrimitive(primitive);
      }
      chart.remove();
    };
  }, [data, zones]);

  return <div ref={containerRef} className="h-full w-full" />;
}

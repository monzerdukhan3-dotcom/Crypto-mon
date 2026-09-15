"use client";

import { Eraser, Minus, Ruler, Slash, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";
import { TIMEFRAME_SECONDS, type Timeframe } from "@/lib/constants";
import type { Drawing, DrawingTool } from "@/lib/drawingTypes";
import type { Candle, TradePlan, Zone } from "@/lib/types";
import { ManualDrawingPrimitive } from "./ManualDrawingPrimitive";
import { ZoneRectanglePrimitive } from "./ZoneRectanglePrimitive";

interface CandlestickChartProps {
  data: Candle[];
  zones?: Zone[];
  tradePlan?: TradePlan | null;
  timeframe: Timeframe;
}

// Matches --color-danger / --color-success (see design tokens).
const ENTRY_LINE_COLOR = "#71717a";
const STOP_LINE_COLOR = "#f04444";
const TARGET_LINE_COLOR = "#22c55e";

// Matches the app's unified --success / --danger design tokens (globals.css).
// Chart marks stay at these fixed, saturated values in both themes — the
// tokens' subtler light/dark variants are for text and badges, not candles.
const SUCCESS_COLOR = "#22c55e";
const DANGER_COLOR = "#f04444";
const HIT_TEST_TOLERANCE_PX = 6;

function makeDrawingId(): string {
  return `drawing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function CandlestickChart({ data, zones = [], tradePlan = null, timeframe }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("none");
  // Not state: this only needs to survive between the trend tool's two
  // clicks, and putting it in state would force the click-handler effect
  // below to unsubscribe/resubscribe between those two clicks — a window
  // in which a fast second click can be dropped entirely.
  const pendingPointRef = useRef<{ time: number; price: number } | null>(null);
  const [secondsToClose, setSecondsToClose] = useState<number | null>(null);

  const periodChangePct =
    data.length > 1 && data[0].close > 0 ? ((data[data.length - 1].close - data[0].close) / data[0].close) * 100 : 0;

  // Countdown to the current (last) candle's close, ticking every second.
  useEffect(() => {
    function tick() {
      if (data.length === 0) {
        setSecondsToClose(null);
        return;
      }
      const closeTime = (data[data.length - 1].time + TIMEFRAME_SECONDS[timeframe]) * 1000;
      setSecondsToClose(Math.max(0, Math.round((closeTime - Date.now()) / 1000)));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data, timeframe]);

  // Chart + candles + automated zone overlays. Only rebuilt when the
  // underlying data actually changes, so drawing a line doesn't reset
  // zoom/pan.
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
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: SUCCESS_COLOR,
      downColor: DANGER_COLOR,
      borderVisible: false,
      wickUpColor: SUCCESS_COLOR,
      wickDownColor: DANGER_COLOR,
    });
    seriesRef.current = series;

    series.setData(
      data.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const lastCandleTime = data.length > 0 ? data[data.length - 1].time : 0;
    const zonePrimitives = zones.map((zone) => new ZoneRectanglePrimitive(zone, lastCandleTime));
    for (const primitive of zonePrimitives) {
      series.attachPrimitive(primitive);
    }

    // Zoom to a range that starts a little before the earliest active zone
    // instead of the full fetched history, so everything stays fully
    // visible and readable without zooming out over everything we fetched.
    const drawnStarts = zones.filter((z) => z.active).map((z) => z.startTime);
    if (drawnStarts.length > 0 && data.length > 0) {
      const earliestTime = Math.min(...drawnStarts);
      const startIndex = data.findIndex((c) => c.time >= earliestTime);
      const leftPadding = 3;
      const fromIndex = Math.max(0, (startIndex === -1 ? 0 : startIndex) - leftPadding);
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
      for (const primitive of zonePrimitives) {
        series.detachPrimitive(primitive);
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [data, zones]);

  // Entry / stop-loss / target price lines for the active trade plan, using
  // lightweight-charts' own built-in price lines (not a custom primitive —
  // simpler and doesn't need repainting logic of its own). Reads
  // seriesRef.current fresh rather than depending on the effect above
  // having already run in this exact commit, and depends on `data` too so
  // it re-attaches after that effect rebuilds the series.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !tradePlan) return;

    const lines: IPriceLine[] = [
      series.createPriceLine({
        price: tradePlan.entry,
        color: ENTRY_LINE_COLOR,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "دخول",
      }),
      series.createPriceLine({
        price: tradePlan.stopLoss,
        color: STOP_LINE_COLOR,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "وقف الخسارة",
      }),
      ...tradePlan.targets.map((target, i) =>
        series.createPriceLine({
          price: target,
          color: TARGET_LINE_COLOR,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `هدف ${i + 1}`,
        })
      ),
    ];

    return () => {
      for (const line of lines) series.removePriceLine(line);
    };
  }, [tradePlan, data]);

  // User-drawn lines + click handling (placing points, and click-to-delete
  // in idle mode). Kept separate from the effect above so drawing a line
  // never tears down and rebuilds the chart.
  useEffect(() => {
    const container = containerRef.current;
    // chart/series come from the refs at click time (below), not captured
    // here — if the effect above ever rebuilds the chart (data/zones
    // change) while this effect hasn't re-run, a value captured once at
    // setup time would keep pointing at the destroyed chart/series
    // instance, and every click would silently no-op.
    const series = seriesRef.current;
    if (!container || !series) return;

    const primitives = drawings.map((d) => new ManualDrawingPrimitive(d));
    for (const primitive of primitives) series.attachPrimitive(primitive);
    // attachPrimitive() alone doesn't force a synchronous repaint, so a
    // freshly drawn line can miss a frame. applyOptions() with no actual
    // change still runs the chart's full invalidate+redraw pipeline
    // synchronously, guaranteeing the new primitive paints immediately.
    chartRef.current?.applyOptions({});

    function handlePoint(x: number, y: number) {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;

      if (drawingTool === "horizontal") {
        const price = series.coordinateToPrice(y);
        if (price === null) return;
        setDrawings((prev) => [...prev, { id: makeDrawingId(), kind: "horizontal", price }]);
        setDrawingTool("none");
        return;
      }

      if (drawingTool === "trend" || drawingTool === "measure") {
        const time = chart.timeScale().coordinateToTime(x);
        const price = series.coordinateToPrice(y);
        if (time === null || price === null) return;

        const pendingPoint = pendingPointRef.current;
        if (!pendingPoint) {
          pendingPointRef.current = { time: Number(time), price };
        } else {
          setDrawings((prev) => [
            ...prev,
            {
              id: makeDrawingId(),
              kind: drawingTool,
              point1: pendingPoint,
              point2: { time: Number(time), price },
            },
          ]);
          pendingPointRef.current = null;
          setDrawingTool("none");
        }
        return;
      }

      // Idle mode: clicking an existing line removes it.
      let closestId: string | null = null;
      let closestDistance = Infinity;
      for (const primitive of primitives) {
        const distance = primitive.distanceToPoint(x, y);
        if (distance !== null && distance < closestDistance) {
          closestDistance = distance;
          closestId = primitive.drawing.id;
        }
      }
      if (closestId !== null && closestDistance <= HIT_TEST_TOLERANCE_PX) {
        setDrawings((prev) => prev.filter((d) => d.id !== closestId));
      }
    }

    // Placing a trend line takes two clicks, and lightweight-charts'
    // subscribeClick silently drops a click that lands within ~500ms of
    // the previous one (its own click-vs-double-click disambiguation) —
    // exactly the natural pace for placing two points. Listening for the
    // native DOM click on the chart container instead sidesteps that.
    function handleContainerClick(event: MouseEvent) {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      handlePoint(event.clientX - rect.left, event.clientY - rect.top);
    }

    container.addEventListener("click", handleContainerClick);

    return () => {
      container.removeEventListener("click", handleContainerClick);
      for (const primitive of primitives) series.detachPrimitive(primitive);
    };
  }, [drawings, drawingTool]);

  function toggleTool(tool: DrawingTool) {
    pendingPointRef.current = null;
    setDrawingTool((current) => (current === tool ? "none" : tool));
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5">
        <span
          className={`rounded-md px-2 py-1 text-xs font-semibold ${
            periodChangePct >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {periodChangePct >= 0 ? "+" : ""}
          {periodChangePct.toFixed(2)}%
        </span>
        {secondsToClose !== null && (
          <span className="flex items-center gap-1 rounded-md border border-surface-border bg-surface/90 px-2 py-1 text-xs font-medium text-muted backdrop-blur">
            <Timer className="h-3 w-3" strokeWidth={2.25} />
            {formatCountdown(secondsToClose)}
          </span>
        )}
      </div>

      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-surface-border bg-surface/90 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => toggleTool("horizontal")}
          title="خط أفقي"
          className={`rounded p-1.5 ${drawingTool === "horizontal" ? "bg-success-soft text-success" : "text-muted hover:bg-background"}`}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={() => toggleTool("trend")}
          title="خط ترند"
          className={`rounded p-1.5 ${drawingTool === "trend" ? "bg-success-soft text-success" : "text-muted hover:bg-background"}`}
        >
          <Slash className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={() => toggleTool("measure")}
          title="أداة القياس"
          className={`rounded p-1.5 ${drawingTool === "measure" ? "bg-success-soft text-success" : "text-muted hover:bg-background"}`}
        >
          <Ruler className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        {drawings.length > 0 && (
          <button
            type="button"
            onClick={() => setDrawings([])}
            title="مسح كل الخطوط"
            className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
          >
            <Eraser className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        )}
      </div>
    </div>
  );
}

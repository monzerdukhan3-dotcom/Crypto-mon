"use client";

import { BarChart2, Eraser, Maximize2, Minimize2, Minus, Ruler, Slash, TrendingUp, Timer, Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";
import { TIMEFRAME_SECONDS, type Timeframe } from "@/lib/constants";
import type { Drawing, DrawingTool } from "@/lib/drawingTypes";
import { calculateEMA, calculateMACD, calculateRSI } from "@/lib/indicators";
import { computeTradePlanSpan } from "@/lib/tradePlan";
import type { Candle, TradePlan, Zone } from "@/lib/types";
import { ManualDrawingPrimitive } from "./ManualDrawingPrimitive";
import { MeasurePrimitive, type MeasurePoint } from "./MeasurePrimitive";
import { TradePlanBoxPrimitive, type TradePlanBox } from "./TradePlanBoxPrimitive";
import { ZoneRectanglePrimitive } from "./ZoneRectanglePrimitive";

export interface IndicatorToggles {
  volume: boolean;
  ma: boolean;
  rsi: boolean;
  macd: boolean;
}

export const DEFAULT_INDICATORS: IndicatorToggles = { volume: true, ma: false, rsi: false, macd: false };

interface CandlestickChartProps {
  data: Candle[];
  zones?: Zone[];
  tradePlan?: TradePlan | null;
  /**
   * Draws the same risk/reward box as `tradePlan`, but independently of a
   * live `Zone` — for a trade-history record, which only has its own
   * entry/stop/targets/timestamps, not the zone that produced them. Only
   * one of `tradePlan` / `tradeBox` is normally passed at a time.
   */
  tradeBox?: TradePlanBox | null;
  /** Id of a zone price is currently approaching (but hasn't reached yet) — drawn with an extra highlight. */
  highlightZoneId?: string | null;
  timeframe: Timeframe;
}

// Matches the app's unified --success / --danger design tokens (globals.css).
// Chart marks stay at these fixed, saturated values in both themes — the
// tokens' subtler light/dark variants are for text and badges, not candles.
const SUCCESS_COLOR = "#22c55e";
const DANGER_COLOR = "#f04444";
const HIT_TEST_TOLERANCE_PX = 6;

const VOLUME_UP_COLOR = "rgba(34, 197, 94, 0.5)";
const VOLUME_DOWN_COLOR = "rgba(240, 68, 68, 0.5)";
const EMA20_COLOR = "#f59e0b";
const EMA50_COLOR = "#8b5cf6";
const RSI_COLOR = "#3b82f6";
const RSI_BAND_COLOR = "rgba(113, 113, 122, 0.5)";
const MACD_LINE_COLOR = "#3b82f6";
const MACD_SIGNAL_COLOR = "#f59e0b";
// Leaves room at the bottom of the main pane for the volume histogram to sit
// under the candles without the two overlapping — restored to the plain
// default once volume is toggled off.
const MAIN_SCALE_MARGINS_DEFAULT = { top: 0.1, bottom: 0.1 };
const MAIN_SCALE_MARGINS_WITH_VOLUME = { top: 0.1, bottom: 0.28 };
// A secondary indicator pane (RSI/MACD) gets a modest share of the chart's
// total height — big enough to actually read, small enough that the price
// pane above it stays the main focus.
const INDICATOR_PANE_STRETCH_FACTOR = 0.28;

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

export default function CandlestickChart({
  data,
  zones = [],
  tradePlan = null,
  tradeBox = null,
  highlightZoneId = null,
  timeframe,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  // A CSS-only "fullscreen" (fixed, covers the viewport) rather than the
  // browser's native Fullscreen API — iOS Safari doesn't support that API
  // on arbitrary elements at all (only <video>), so a real requestFullscreen
  // call would leave the button doing nothing there. This works identically
  // on every device.
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Locks background scroll while the chart covers the viewport — without
  // this, a touch-scroll on mobile would scroll the page behind the chart.
  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  // Escape exits fullscreen — independent of the drawing-tool Escape
  // handler further down, which only attaches while a tool is active.
  useEffect(() => {
    if (!isFullscreen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const [indicators, setIndicators] = useState<IndicatorToggles>(DEFAULT_INDICATORS);

  function toggleIndicator(key: keyof IndicatorToggles) {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("none");
  // Not state: this only needs to survive between the trend tool's two
  // clicks, and putting it in state would force the click-handler effect
  // below to unsubscribe/resubscribe between those two clicks — a window
  // in which a fast second click can be dropped entirely.
  const pendingPointRef = useRef<{ time: number; price: number } | null>(null);
  const [secondsToClose, setSecondsToClose] = useState<number | null>(null);
  // Y position (within the chart container) of the current price, so the
  // countdown badge can sit right under the price scale's last-price tag —
  // TradingView's convention — instead of floating in a corner.
  const [priceY, setPriceY] = useState<number | null>(null);

  function toggleFullscreen() {
    setIsFullscreen((current) => !current);
  }

  // Countdown to the current (last) candle's close, ticking every second.
  // Also re-reads the current price's on-screen position each tick — cheap,
  // and keeps the badge glued to the price tag without a separate
  // subscription for every way the price's Y coordinate can move (pan,
  // zoom, resize, new data).
  useEffect(() => {
    function tick() {
      if (data.length === 0) {
        setSecondsToClose(null);
        setPriceY(null);
        return;
      }
      const closeTime = (data[data.length - 1].time + TIMEFRAME_SECONDS[timeframe]) * 1000;
      setSecondsToClose(Math.max(0, Math.round((closeTime - Date.now()) / 1000)));
      const y = seriesRef.current?.priceToCoordinate(data[data.length - 1].close) ?? null;
      setPriceY(y);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data, timeframe]);

  // A resolved/pending record's box can sit well behind whatever's
  // currently active (a trade from a day ago on a fast timeframe, say),
  // while the zoom logic below only looks at active zones — computed once
  // here so both that zoom and the box-drawing effect agree on the same
  // box instead of recomputing it (and potentially disagreeing) twice.
  const resolvedBox: TradePlanBox | null = useMemo(() => {
    if (tradeBox) return tradeBox;
    if (tradePlan && data.length > 0) {
      return {
        ...computeTradePlanSpan(tradePlan, data),
        entry: tradePlan.entry,
        stopLoss: tradePlan.stopLoss,
        targets: tradePlan.targets,
      };
    }
    return null;
  }, [tradeBox, tradePlan, data]);

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

    const zonePrimitives = zones.map((zone) => new ZoneRectanglePrimitive(zone, zone.id === highlightZoneId));
    for (const primitive of zonePrimitives) {
      series.attachPrimitive(primitive);
    }

    // Zoom to a range that starts a little before the earliest active zone
    // (or the trade box being drawn, if that's further back — a resolved
    // history record can predate every currently-active zone) instead of
    // the full fetched history, so everything stays fully visible and
    // readable without zooming out over everything we fetched.
    const drawnStarts = zones.filter((z) => z.active).map((z) => z.startTime);
    if (resolvedBox) drawnStarts.push(resolvedBox.startTime);
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

    function updatePriceY() {
      if (data.length === 0) return;
      setPriceY(series.priceToCoordinate(data[data.length - 1].close));
    }
    updatePriceY();
    // The price's Y position also moves on pan/zoom (price scale
    // autoscales to whatever's visible) and on resize, not just when new
    // data arrives — both need to keep the countdown badge glued in place.
    chart.timeScale().subscribeVisibleLogicalRangeChange(updatePriceY);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
      updatePriceY();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updatePriceY);
      for (const primitive of zonePrimitives) {
        series.detachPrimitive(primitive);
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [data, zones, highlightZoneId, resolvedBox]);

  // Volume + MA/RSI/MACD, added onto the chart the main effect above
  // already built. Kept in its own effect (keyed only on the indicator
  // toggles + data, not zones/highlightZoneId/resolvedBox) so flipping an
  // indicator on or off never tears down and rebuilds the whole chart —
  // that would reset the user's zoom/pan for no reason. RSI and MACD each
  // get their own secondary pane (lightweight-charts v5's multi-pane
  // support); volume and the moving averages overlay directly on the main
  // candlestick pane instead, the same way TradingView's own defaults work.
  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = seriesRef.current;
    if (!chart || !mainSeries || data.length === 0) return;

    const cleanupFns: (() => void)[] = [];

    if (indicators.volume) {
      mainSeries.priceScale().applyOptions({ scaleMargins: MAIN_SCALE_MARGINS_WITH_VOLUME });
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        { priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false },
        0
      );
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeries.setData(
        data.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume ?? 0,
          color: c.close >= c.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
        }))
      );
      cleanupFns.push(() => {
        chart.removeSeries(volumeSeries);
        mainSeries.priceScale().applyOptions({ scaleMargins: MAIN_SCALE_MARGINS_DEFAULT });
      });
    }

    if (indicators.ma) {
      const closes = data.map((c) => c.close);
      const ema20 = calculateEMA(closes, 20);
      const ema50 = calculateEMA(closes, 50);
      const ema20Series = chart.addSeries(
        LineSeries,
        { color: EMA20_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "EMA 20" },
        0
      );
      const ema50Series = chart.addSeries(
        LineSeries,
        { color: EMA50_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "EMA 50" },
        0
      );
      ema20Series.setData(
        data.flatMap((c, i) => (Number.isFinite(ema20[i]) ? [{ time: c.time as UTCTimestamp, value: ema20[i] }] : []))
      );
      ema50Series.setData(
        data.flatMap((c, i) => (Number.isFinite(ema50[i]) ? [{ time: c.time as UTCTimestamp, value: ema50[i] }] : []))
      );
      cleanupFns.push(() => {
        chart.removeSeries(ema20Series);
        chart.removeSeries(ema50Series);
      });
    }

    if (indicators.rsi) {
      const pane = chart.addPane();
      pane.setStretchFactor(INDICATOR_PANE_STRETCH_FACTOR);
      const rsiSeries = chart.addSeries(
        LineSeries,
        { color: RSI_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "RSI 14" },
        pane.paneIndex()
      );
      const rsiValues = calculateRSI(
        data.map((c) => c.close),
        14
      );
      rsiSeries.setData(
        data.flatMap((c, i) => (Number.isFinite(rsiValues[i]) ? [{ time: c.time as UTCTimestamp, value: rsiValues[i] }] : []))
      );
      const overbought = rsiSeries.createPriceLine({
        price: 70,
        color: RSI_BAND_COLOR,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "70",
      });
      const oversold = rsiSeries.createPriceLine({
        price: 30,
        color: RSI_BAND_COLOR,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "30",
      });
      cleanupFns.push(() => {
        rsiSeries.removePriceLine(overbought);
        rsiSeries.removePriceLine(oversold);
        // Removing a pane's last series auto-collapses the (now-empty) pane
        // itself — an explicit chart.removePane() afterward throws
        // ("Invalid pane index"), since there's nothing left to remove.
        chart.removeSeries(rsiSeries);
      });
    }

    if (indicators.macd) {
      const pane = chart.addPane();
      pane.setStretchFactor(INDICATOR_PANE_STRETCH_FACTOR);
      const paneIndex = pane.paneIndex();
      const { macd, signal, histogram } = calculateMACD(data.map((c) => c.close));
      const histogramSeries = chart.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex
      );
      const macdSeries = chart.addSeries(
        LineSeries,
        { color: MACD_LINE_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "MACD" },
        paneIndex
      );
      const signalSeries = chart.addSeries(
        LineSeries,
        { color: MACD_SIGNAL_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "Signal" },
        paneIndex
      );
      histogramSeries.setData(
        data.flatMap((c, i) =>
          Number.isFinite(histogram[i])
            ? [{ time: c.time as UTCTimestamp, value: histogram[i], color: histogram[i] >= 0 ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR }]
            : []
        )
      );
      macdSeries.setData(
        data.flatMap((c, i) => (Number.isFinite(macd[i]) ? [{ time: c.time as UTCTimestamp, value: macd[i] }] : []))
      );
      signalSeries.setData(
        data.flatMap((c, i) => (Number.isFinite(signal[i]) ? [{ time: c.time as UTCTimestamp, value: signal[i] }] : []))
      );
      cleanupFns.push(() => {
        // Same auto-collapse as the RSI pane above — no explicit
        // removePane() once every series in it is gone.
        chart.removeSeries(histogramSeries);
        chart.removeSeries(macdSeries);
        chart.removeSeries(signalSeries);
      });
    }

    chart.applyOptions({});

    return () => {
      // When `data` itself changes, the main chart-creation effect above
      // (declared earlier, so its cleanup runs first) already tore down
      // this exact chart instance via chart.remove() and nulled the refs —
      // which already disposes every series and pane on it, indicators
      // included. Calling removeSeries()/priceScale() on that destroyed
      // instance afterward throws, crashing the whole render on every
      // single symbol/timeframe switch once any indicator was on. Only run
      // this effect's own explicit cleanup when the chart is still the
      // live one (an indicator toggle changed but the chart itself didn't).
      if (chartRef.current !== chart) return;
      for (const cleanup of cleanupFns) cleanup();
    };
  }, [data, indicators.volume, indicators.ma, indicators.rsi, indicators.macd]);

  // Risk/reward box for the active trade plan (or an explicitly passed
  // history record's box) — a bounded shape (not lightweight-charts' full-
  // width price lines): it starts at the entry zone's own origin and ends
  // the moment price first reaches the stop loss or any target, or "now" if
  // nothing's been hit yet. Reads seriesRef.current fresh rather than
  // depending on the effect above having already run in this exact commit,
  // and depends on `data` too so it re-attaches after that effect rebuilds
  // the series.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || data.length === 0 || !resolvedBox) return;

    const primitive = new TradePlanBoxPrimitive(resolvedBox);
    series.attachPrimitive(primitive);
    chartRef.current?.applyOptions({});

    return () => {
      series.detachPrimitive(primitive);
    };
  }, [resolvedBox, data]);

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

      // The measure tool is drag-based (see the dedicated mousedown/
      // mousemove/mouseup effect below) — a stray click while it's active
      // shouldn't place a point or delete an existing drawing.
      if (drawingTool === "measure") return;

      if (drawingTool === "horizontal") {
        const price = series.coordinateToPrice(y);
        if (price === null) return;
        setDrawings((prev) => [...prev, { id: makeDrawingId(), kind: "horizontal", price }]);
        setDrawingTool("none");
        return;
      }

      if (drawingTool === "trend") {
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
              kind: "trend",
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

  // TradingView-style ruler: press, drag, release — not two separate
  // clicks. A MeasurePrimitive is attached only for the lifetime of the
  // drag and detached again on mouse-up; nothing about a measurement is
  // ever kept in `drawings` or persisted.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || drawingTool !== "measure") return;

    let measurePrimitive: MeasurePrimitive | null = null;

    function pointFromEvent(event: MouseEvent): MeasurePoint | null {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series || !container) return null;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const time = chart.timeScale().coordinateToTime(x);
      const price = series.coordinateToPrice(y);
      if (time === null || price === null) return null;
      return { time: Number(time), price };
    }

    function handleMouseDown(event: MouseEvent) {
      const series = seriesRef.current;
      const point = pointFromEvent(event);
      if (!series || !point) return;
      measurePrimitive = new MeasurePrimitive(point, point, data);
      series.attachPrimitive(measurePrimitive);
      chartRef.current?.applyOptions({});
    }

    function handleMouseMove(event: MouseEvent) {
      if (!measurePrimitive) return;
      const point = pointFromEvent(event);
      if (!point) return;
      measurePrimitive.setPoint2(point);
      chartRef.current?.applyOptions({});
    }

    function endDrag() {
      if (!measurePrimitive) return;
      seriesRef.current?.detachPrimitive(measurePrimitive);
      measurePrimitive = null;
      chartRef.current?.applyOptions({});
    }

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", endDrag);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", endDrag);
      endDrag();
    };
  }, [drawingTool, data]);

  // Escape cancels whatever drawing tool is active, TradingView-style —
  // including a trend line waiting on its second click, or (via the effect
  // above re-running once drawingTool changes) a measure drag in progress.
  useEffect(() => {
    if (drawingTool === "none") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        pendingPointRef.current = null;
        setDrawingTool("none");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawingTool]);

  function toggleTool(tool: DrawingTool) {
    pendingPointRef.current = null;
    setDrawingTool((current) => (current === tool ? "none" : tool));
  }

  return (
    <div
      className={
        isFullscreen ? "fixed inset-0 z-50 bg-background p-2" : "relative h-full w-full"
      }
    >
      <div ref={containerRef} className={`h-full w-full ${drawingTool !== "none" ? "cursor-crosshair" : ""}`} />

      {/* Sits right under the price scale's current-price tag, TradingView-
          style, instead of floating in a corner unrelated to what it's
          timing. priceY is the tag's own on-screen position, kept in sync
          with pan/zoom/resize above. */}
      {secondsToClose !== null && priceY !== null && (
        <div
          className="pointer-events-none absolute right-3 z-10 flex items-center gap-1 rounded-md border border-surface-border bg-surface/90 px-2 py-1 text-xs font-medium text-muted shadow-sm backdrop-blur"
          style={{ top: priceY + 14 }}
        >
          <Timer className="h-3 w-3" strokeWidth={2.25} />
          {formatCountdown(secondsToClose)}
        </div>
      )}

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

      <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-md border border-surface-border bg-surface/90 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => toggleIndicator("volume")}
          title="الفوليوم"
          className={`rounded p-1.5 ${indicators.volume ? "bg-success-soft text-success" : "text-muted hover:bg-background"}`}
        >
          <BarChart2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={() => toggleIndicator("ma")}
          title="متوسطات متحركة (EMA 20/50)"
          className={`rounded p-1.5 ${indicators.ma ? "bg-success-soft text-success" : "text-muted hover:bg-background"}`}
        >
          <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={() => toggleIndicator("rsi")}
          title="مؤشر القوة النسبية RSI"
          className={`rounded px-1.5 py-1.5 text-[10px] font-bold ${indicators.rsi ? "bg-success-soft text-success" : "text-muted hover:bg-background"}`}
        >
          RSI
        </button>
        <button
          type="button"
          onClick={() => toggleIndicator("macd")}
          title="مؤشر MACD"
          className={`rounded p-1.5 ${indicators.macd ? "bg-success-soft text-success" : "text-muted hover:bg-background"}`}
        >
          <Waves className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>

      <div className="absolute left-3 top-12 z-10 rounded-md border border-surface-border bg-surface/90 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
          className="rounded p-1.5 text-muted hover:bg-background"
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" strokeWidth={2.25} />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.25} />
          )}
        </button>
      </div>
    </div>
  );
}

import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  Coordinate,
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { Zone } from "@/lib/types";

interface RectangleCoordinates {
  x1: Coordinate | null;
  x2: Coordinate | null;
  y1: Coordinate | null;
  y2: Coordinate | null;
}

// Matches SUCCESS_COLOR / DANGER_COLOR in CandlestickChart.tsx.
const ZONE_COLORS: Record<Zone["type"], { fill: string; band: string; border: string }> = {
  demand: { fill: "rgba(34, 197, 94, 0.30)", band: "rgba(34, 197, 94, 0.10)", border: "rgba(34, 197, 94, 0.75)" },
  supply: { fill: "rgba(240, 68, 68, 0.30)", band: "rgba(240, 68, 68, 0.10)", border: "rgba(240, 68, 68, 0.75)" },
};
// A broken zone (price has closed decisively through it) keeps its box on
// the chart instead of just disappearing, but dimmed to neutral gray and
// dashed — still visible as "this used to be a level", never mistaken for
// a live, tradable one.
const BROKEN_COLORS = { fill: "rgba(148, 163, 184, 0.14)", band: "rgba(148, 163, 184, 0.06)", border: "rgba(148, 163, 184, 0.6)" };
const BROKEN_LABEL_PILL = "rgba(100, 116, 139, 0.92)";
const BROKEN_LABEL_TEXT = "منطقة مكسورة";
// Matches --color-info: the "price is approaching this one" callout, same
// accent as the sidebar's alert so the two clearly refer to each other.
const HIGHLIGHT_COLOR = "#3b82f6";

class ZoneRectanglePaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly coords: RectangleCoordinates,
    private readonly zoneType: Zone["type"],
    private readonly highlighted: boolean,
    private readonly broken: boolean
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    const { x1, x2, y1, y2 } = this.coords;
    if (x1 === null || x2 === null || y1 === null || y2 === null) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const left = Math.min(x1, x2) * scope.horizontalPixelRatio;
      const right = Math.max(x1, x2) * scope.horizontalPixelRatio;
      const top = Math.min(y1, y2) * scope.verticalPixelRatio;
      const bottom = Math.max(y1, y2) * scope.verticalPixelRatio;
      const colors = this.broken ? BROKEN_COLORS : ZONE_COLORS[this.zoneType];

      // The true origin box is only the 1-6 base candles wide (ICT/SMC
      // style) — a handful of pixels once zoomed out, easy to miss
      // entirely. A light fill across the *whole* band out to the right
      // edge of the pane (not just to the last candle — all the way to
      // the visible edge, panned/zoomed or not) keeps the level
      // unmistakably visible, while the origin box itself still gets a
      // visibly stronger fill and border so the precise Order Block is
      // still there to read. A broken zone skips this entirely: the
      // caller has already set its right edge (x2) to the breaking
      // candle itself (see findRecentlyBrokenZone's display copy), so the
      // rectangle simply ends there instead of trailing on as if the
      // level were still live.
      if (!this.broken && scope.bitmapSize.width > right) {
        ctx.fillStyle = colors.band;
        ctx.fillRect(right, top, scope.bitmapSize.width - right, bottom - top);
      }

      ctx.fillStyle = colors.fill;
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1.5;
      // A solid box reads as "still valid" — a broken zone gets a dashed
      // border instead, the same visual language as an unhit target line,
      // so it's unmistakably a past reference and not a live level.
      if (this.broken) ctx.setLineDash([5 * scope.horizontalPixelRatio, 4 * scope.horizontalPixelRatio]);
      ctx.strokeRect(left, top, right - left, bottom - top);
      ctx.setLineDash([]);

      // Price is heading toward this specific zone but hasn't reached it
      // yet — an extra dashed outline around the whole visible band (not
      // just the narrow origin box) flags exactly which one to watch.
      if (this.highlighted && scope.bitmapSize.width > right) {
        ctx.save();
        ctx.strokeStyle = HIGHLIGHT_COLOR;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6 * scope.horizontalPixelRatio, 4 * scope.horizontalPixelRatio]);
        ctx.strokeRect(left, top, scope.bitmapSize.width - left, bottom - top);
        ctx.restore();
      }

      if (this.broken) this.drawBrokenLabel(ctx, scope, left, right, top);
    });
  }

  private drawBrokenLabel(
    ctx: CanvasRenderingContext2D,
    scope: { horizontalPixelRatio: number; verticalPixelRatio: number; bitmapSize: { width: number; height: number } },
    left: number,
    right: number,
    top: number
  ) {
    // Skip the label once the origin box has scrolled entirely off-screen —
    // pinning it to the pane edge like the price-scale countdown does would
    // misattribute it to whatever's currently visible instead of this zone.
    if (right < 0 || left > scope.bitmapSize.width) return;

    const fontSize = 10.5 * scope.verticalPixelRatio;
    ctx.font = `700 ${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(BROKEN_LABEL_TEXT).width;
    const paddingX = 6 * scope.horizontalPixelRatio;
    const paddingY = 4 * scope.verticalPixelRatio;
    const pillWidth = textWidth + paddingX * 2;
    const pillHeight = fontSize + paddingY * 1.4;

    // Anchored just inside the box's own left edge (clamped on-screen while
    // panned), a touch below its top border — out of the way of the price
    // scale and any other overlapping label.
    const pillX = Math.max(left, 0) + 4 * scope.horizontalPixelRatio;
    const pillY = top + 4 * scope.verticalPixelRatio;
    const radius = Math.min(4 * scope.horizontalPixelRatio, pillHeight / 2, pillWidth / 2);

    ctx.fillStyle = BROKEN_LABEL_PILL;
    ctx.beginPath();
    ctx.moveTo(pillX + radius, pillY);
    ctx.lineTo(pillX + pillWidth - radius, pillY);
    ctx.arcTo(pillX + pillWidth, pillY, pillX + pillWidth, pillY + radius, radius);
    ctx.lineTo(pillX + pillWidth, pillY + pillHeight - radius);
    ctx.arcTo(pillX + pillWidth, pillY + pillHeight, pillX + pillWidth - radius, pillY + pillHeight, radius);
    ctx.lineTo(pillX + radius, pillY + pillHeight);
    ctx.arcTo(pillX, pillY + pillHeight, pillX, pillY + pillHeight - radius, radius);
    ctx.lineTo(pillX, pillY + radius);
    ctx.arcTo(pillX, pillY, pillX + radius, pillY, radius);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(BROKEN_LABEL_TEXT, pillX + pillWidth / 2, pillY + pillHeight / 2 + 0.5 * scope.verticalPixelRatio);
  }
}

class ZoneRectanglePaneView implements IPrimitivePaneView {
  private coords: RectangleCoordinates = { x1: null, x2: null, y1: null, y2: null };

  constructor(private readonly source: ZoneRectanglePrimitive) {}

  update() {
    const { chart, series, zone } = this.source;
    if (!chart || !series) return;

    const timeScale = chart.timeScale();
    this.coords = {
      x1: timeScale.timeToCoordinate(zone.startTime as UTCTimestamp),
      x2: timeScale.timeToCoordinate(zone.endTime as UTCTimestamp),
      y1: series.priceToCoordinate(zone.top),
      y2: series.priceToCoordinate(zone.bottom),
    };
  }

  renderer() {
    return new ZoneRectanglePaneRenderer(
      this.coords,
      this.source.zone.type,
      this.source.highlighted,
      !this.source.zone.active
    );
  }
}

/** Draws one supply/demand zone as a colored rectangle on the candlestick pane. */
export class ZoneRectanglePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  private readonly paneView: ZoneRectanglePaneView;

  /** @param highlighted Marks this as the zone price is currently approaching, for the "prepare a limit order" callout. */
  constructor(
    public readonly zone: Zone,
    public readonly highlighted: boolean = false
  ) {
    this.paneView = new ZoneRectanglePaneView(this);
  }

  attached({ chart, series }: SeriesAttachedParameter<Time>) {
    this.chart = chart;
    this.series = series;
  }

  detached() {
    this.chart = null;
    this.series = null;
  }

  updateAllViews() {
    this.paneView.update();
  }

  paneViews() {
    return [this.paneView];
  }
}

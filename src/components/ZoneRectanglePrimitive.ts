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
// Matches --color-info: the "price is approaching this one" callout, same
// accent as the sidebar's alert so the two clearly refer to each other.
const HIGHLIGHT_COLOR = "#3b82f6";

class ZoneRectanglePaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly coords: RectangleCoordinates,
    private readonly zoneType: Zone["type"],
    private readonly highlighted: boolean
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
      const colors = ZONE_COLORS[this.zoneType];

      // The true origin box is only the 1-6 base candles wide (ICT/SMC
      // style) — a handful of pixels once zoomed out, easy to miss
      // entirely. A light fill across the *whole* band out to the right
      // edge of the pane (not just to the last candle — all the way to
      // the visible edge, panned/zoomed or not) keeps the level
      // unmistakably visible, while the origin box itself still gets a
      // visibly stronger fill and border so the precise Order Block is
      // still there to read.
      if (scope.bitmapSize.width > right) {
        ctx.fillStyle = colors.band;
        ctx.fillRect(right, top, scope.bitmapSize.width - right, bottom - top);
      }

      ctx.fillStyle = colors.fill;
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(left, top, right - left, bottom - top);

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
    });
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
    return new ZoneRectanglePaneRenderer(this.coords, this.source.zone.type, this.source.highlighted);
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

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
import type { Drawing } from "@/lib/drawingTypes";
import { formatPrice } from "@/lib/format";

// A neutral accent distinct from the success/danger zone colors, since
// these are user-drawn annotations rather than automated signals.
const DRAWING_COLOR = "#3b82f6";
// The measuring tool reads as a distinct, temporary overlay rather than a
// support/resistance line, so it gets its own accent (matches --color-warning).
const MEASURE_COLOR = "#f59e0b";

interface RenderCoords {
  x1: Coordinate | null;
  y1: Coordinate | null;
  x2: Coordinate | null;
  y2: Coordinate | null;
}

function distancePointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

class DrawingPaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly coords: RenderCoords,
    private readonly drawing: Drawing
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    const { x1, y1, x2, y2 } = this.coords;
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;
    const isMeasure = this.drawing.kind === "measure";

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const px1 = x1 * scope.horizontalPixelRatio;
      const py1 = y1 * scope.verticalPixelRatio;
      const px2 = x2 * scope.horizontalPixelRatio;
      const py2 = y2 * scope.verticalPixelRatio;

      ctx.save();
      ctx.strokeStyle = isMeasure ? MEASURE_COLOR : DRAWING_COLOR;
      ctx.lineWidth = 1.5;
      if (isMeasure) ctx.setLineDash([5 * scope.horizontalPixelRatio, 3 * scope.horizontalPixelRatio]);
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      ctx.restore();

      if (this.drawing.kind === "measure") {
        this.drawMeasureLabel(ctx, scope, px1, py1, px2, py2);
      }
    });
  }

  private drawMeasureLabel(
    ctx: CanvasRenderingContext2D,
    scope: { horizontalPixelRatio: number; verticalPixelRatio: number },
    px1: number,
    py1: number,
    px2: number,
    py2: number
  ) {
    if (this.drawing.kind !== "measure") return;
    const { point1, point2 } = this.drawing;
    const diff = point2.price - point1.price;
    const pct = point1.price !== 0 ? (diff / point1.price) * 100 : 0;
    const sign = diff >= 0 ? "+" : "-";
    const text = `${sign}${formatPrice(Math.abs(diff))} (${sign}${Math.abs(pct).toFixed(2)}%)`;

    const fontSize = 12 * scope.verticalPixelRatio;
    ctx.save();
    ctx.font = `600 ${fontSize}px sans-serif`;
    const paddingX = 6 * scope.horizontalPixelRatio;
    const paddingY = 4 * scope.verticalPixelRatio;
    const metrics = ctx.measureText(text);
    const boxWidth = metrics.width + paddingX * 2;
    const boxHeight = fontSize + paddingY * 2;
    const midX = (px1 + px2) / 2;
    const midY = (py1 + py2) / 2;
    const boxX = midX - boxWidth / 2;
    const boxY = midY - boxHeight / 2;

    ctx.fillStyle = diff >= 0 ? "rgba(34, 197, 94, 0.92)" : "rgba(240, 68, 68, 0.92)";
    ctx.beginPath();
    const radius = 4 * scope.horizontalPixelRatio;
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, midX, midY + 1);
    ctx.restore();
  }
}

class DrawingPaneView implements IPrimitivePaneView {
  private coords: RenderCoords = { x1: null, y1: null, x2: null, y2: null };

  constructor(private readonly source: ManualDrawingPrimitive) {}

  update() {
    const { chart, series, drawing } = this.source;
    if (!chart || !series) return;

    const timeScale = chart.timeScale();

    if (drawing.kind === "horizontal") {
      const visibleRange = timeScale.getVisibleRange();
      if (!visibleRange) {
        this.coords = { x1: null, y1: null, x2: null, y2: null };
        return;
      }
      const y = series.priceToCoordinate(drawing.price);
      this.coords = {
        x1: timeScale.timeToCoordinate(visibleRange.from),
        x2: timeScale.timeToCoordinate(visibleRange.to),
        y1: y,
        y2: y,
      };
    } else {
      this.coords = {
        x1: timeScale.timeToCoordinate(drawing.point1.time as UTCTimestamp),
        y1: series.priceToCoordinate(drawing.point1.price),
        x2: timeScale.timeToCoordinate(drawing.point2.time as UTCTimestamp),
        y2: series.priceToCoordinate(drawing.point2.price),
      };
    }
  }

  renderer() {
    return new DrawingPaneRenderer(this.coords, this.source.drawing);
  }

  getCoords(): RenderCoords {
    return this.coords;
  }
}

/** Draws one user-placed horizontal or trend line, and reports its distance to a click for hit-testing (delete-on-click). */
export class ManualDrawingPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  private readonly paneView: DrawingPaneView;

  constructor(public readonly drawing: Drawing) {
    this.paneView = new DrawingPaneView(this);
  }

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.chart = chart;
    this.series = series;
    // The chart component forces the actual initial repaint (via
    // chart.applyOptions({}) right after attaching); this covers the
    // primitive API contract for any later requestUpdate-driven repaint.
    requestUpdate();
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

  /** Pixel distance from (x, y) to this drawing's line — null if it's not currently rendered. */
  distanceToPoint(x: number, y: number): number | null {
    const { x1, y1, x2, y2 } = this.paneView.getCoords();
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return distancePointToSegment(x, y, x1, y1, x2, y2);
  }
}

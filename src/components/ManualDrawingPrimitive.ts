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

// A neutral accent distinct from the success/danger zone & liquidity colors,
// since these are user-drawn annotations rather than automated signals.
const DRAWING_COLOR = "#3b82f6";

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
  constructor(private readonly coords: RenderCoords) {}

  draw(target: CanvasRenderingTarget2D) {
    const { x1, y1, x2, y2 } = this.coords;
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.strokeStyle = DRAWING_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1 * scope.horizontalPixelRatio, y1 * scope.verticalPixelRatio);
      ctx.lineTo(x2 * scope.horizontalPixelRatio, y2 * scope.verticalPixelRatio);
      ctx.stroke();
    });
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
    return new DrawingPaneRenderer(this.coords);
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

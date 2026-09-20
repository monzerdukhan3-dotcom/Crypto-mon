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
import { formatPrice } from "@/lib/format";
import type { Candle } from "@/lib/types";

const UP_COLOR = "#22c55e";
const DOWN_COLOR = "#f04444";

export interface MeasurePoint {
  time: number;
  price: number;
}

interface RenderCoords {
  x1: Coordinate | null;
  y1: Coordinate | null;
  x2: Coordinate | null;
  y2: Coordinate | null;
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}ي ${hours}س` : `${days}ي`;
  if (hours > 0) return minutes > 0 ? `${hours}س ${minutes}د` : `${hours}س`;
  return `${Math.max(1, minutes)}د`;
}

class MeasurePaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly coords: RenderCoords,
    private readonly point1: MeasurePoint,
    private readonly point2: MeasurePoint,
    private readonly barCount: number
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    const { x1, y1, x2, y2 } = this.coords;
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;

    const diff = this.point2.price - this.point1.price;
    const pct = this.point1.price !== 0 ? (diff / this.point1.price) * 100 : 0;
    const isUp = diff >= 0;
    const color = isUp ? UP_COLOR : DOWN_COLOR;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const px1 = x1 * scope.horizontalPixelRatio;
      const py1 = y1 * scope.verticalPixelRatio;
      const px2 = x2 * scope.horizontalPixelRatio;
      const py2 = y2 * scope.verticalPixelRatio;

      const left = Math.min(px1, px2);
      const top = Math.min(py1, py2);
      const width = Math.max(1, Math.abs(px2 - px1));
      const height = Math.max(1, Math.abs(py2 - py1));

      ctx.save();
      // TradingView-style shaded box spanning the full price/time range
      // measured, not just a diagonal line between the two points.
      ctx.fillStyle = isUp ? "rgba(34, 197, 94, 0.15)" : "rgba(240, 68, 68, 0.15)";
      ctx.fillRect(left, top, width, height);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, scope.horizontalPixelRatio);
      ctx.setLineDash([4 * scope.horizontalPixelRatio, 3 * scope.horizontalPixelRatio]);
      ctx.strokeRect(left, top, width, height);

      // Solid arrow from the start point to the end point, on top of the box.
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5 * scope.horizontalPixelRatio;
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      this.drawArrowhead(ctx, px1, py1, px2, py2, scope.horizontalPixelRatio);
      ctx.restore();

      try {
        this.drawLabel(ctx, scope, px2, py2, diff, pct, isUp, color);
      } catch {
        // The box and arrow already drew — the label is a nice-to-have.
      }
    });
  }

  private drawArrowhead(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ratio: number
  ) {
    if (Math.hypot(x2 - x1, y2 - y1) < 4 * ratio) return;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = 8 * ratio;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  private drawLabel(
    ctx: CanvasRenderingContext2D,
    scope: { horizontalPixelRatio: number; verticalPixelRatio: number; bitmapSize: { width: number; height: number } },
    x2: number,
    y2: number,
    diff: number,
    pct: number,
    isUp: boolean,
    color: string
  ) {
    const sign = isUp ? "+" : "-";
    const durationText = formatDuration(Math.abs(this.point2.time - this.point1.time));
    const line1 = `${sign}${formatPrice(Math.abs(diff))} (${sign}${Math.abs(pct).toFixed(2)}%)`;
    const barLabel = this.barCount === 1 ? "شمعة" : "شموع";
    const line2 = `${this.barCount} ${barLabel}   ${durationText}`;

    const fontSize1 = 12 * scope.verticalPixelRatio;
    const fontSize2 = 10.5 * scope.verticalPixelRatio;
    ctx.save();
    ctx.font = `700 ${fontSize1}px sans-serif`;
    const width1 = ctx.measureText(line1).width;
    ctx.font = `500 ${fontSize2}px sans-serif`;
    const width2 = ctx.measureText(line2).width;

    const paddingX = 8 * scope.horizontalPixelRatio;
    const paddingY = 6 * scope.verticalPixelRatio;
    const lineGap = 3 * scope.verticalPixelRatio;
    const boxWidth = Math.max(width1, width2) + paddingX * 2;
    const boxHeight = fontSize1 + fontSize2 + lineGap + paddingY * 2;
    const offset = 12 * scope.horizontalPixelRatio;

    // Anchored near the end point (offset so it doesn't sit under the
    // cursor/finger), clamped so it never runs off the canvas edge.
    let boxX = x2 + offset;
    if (boxX + boxWidth > scope.bitmapSize.width) boxX = x2 - offset - boxWidth;
    boxX = Math.max(2 * scope.horizontalPixelRatio, Math.min(boxX, scope.bitmapSize.width - boxWidth - 2 * scope.horizontalPixelRatio));

    let boxY = y2 - boxHeight / 2;
    boxY = Math.max(
      2 * scope.verticalPixelRatio,
      Math.min(boxY, scope.bitmapSize.height - boxHeight - 2 * scope.verticalPixelRatio)
    );

    const radius = Math.min(5 * scope.horizontalPixelRatio, boxWidth / 2, boxHeight / 2);
    ctx.fillStyle = isUp ? "rgba(22, 101, 52, 0.95)" : "rgba(127, 29, 29, 0.95)";
    ctx.beginPath();
    ctx.moveTo(boxX + radius, boxY);
    ctx.lineTo(boxX + boxWidth - radius, boxY);
    ctx.arcTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius, radius);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
    ctx.arcTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight, radius);
    ctx.lineTo(boxX + radius, boxY + boxHeight);
    ctx.arcTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius, radius);
    ctx.lineTo(boxX, boxY + radius);
    ctx.arcTo(boxX, boxY, boxX + radius, boxY, radius);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = scope.horizontalPixelRatio;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${fontSize1}px sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(line1, boxX + boxWidth / 2, boxY + paddingY + fontSize1 * 0.85);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = `500 ${fontSize2}px sans-serif`;
    ctx.fillText(line2, boxX + boxWidth / 2, boxY + paddingY + fontSize1 + lineGap + fontSize2 * 0.85);
    ctx.restore();
  }
}

class MeasurePaneView implements IPrimitivePaneView {
  private coords: RenderCoords = { x1: null, y1: null, x2: null, y2: null };

  constructor(private readonly source: MeasurePrimitive) {}

  update() {
    const { chart, series, point1, point2 } = this.source;
    if (!chart || !series) return;
    const timeScale = chart.timeScale();
    this.coords = {
      x1: timeScale.timeToCoordinate(point1.time as UTCTimestamp),
      y1: series.priceToCoordinate(point1.price),
      x2: timeScale.timeToCoordinate(point2.time as UTCTimestamp),
      y2: series.priceToCoordinate(point2.price),
    };
  }

  renderer() {
    return new MeasurePaneRenderer(this.coords, this.source.point1, this.source.point2, this.source.barCount);
  }
}

/**
 * A TradingView-style ruler: attached only while a drag is in progress
 * (mousedown → mousemove → mouseup on the chart), drawing a live shaded
 * box + arrow between the drag's two points and a label with the $/%
 * change, bar count, and time span. Detached again on mouse-up — it never
 * persists like the horizontal/trend line drawings do.
 */
export class MeasurePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  point2: MeasurePoint;
  private readonly paneView: MeasurePaneView;
  private readonly candles: Candle[];

  constructor(
    public readonly point1: MeasurePoint,
    point2: MeasurePoint,
    candles: Candle[]
  ) {
    this.point2 = point2;
    this.candles = candles;
    this.paneView = new MeasurePaneView(this);
  }

  get barCount(): number {
    const lo = Math.min(this.point1.time, this.point2.time);
    const hi = Math.max(this.point1.time, this.point2.time);
    return Math.max(1, this.candles.filter((c) => c.time >= lo && c.time <= hi).length);
  }

  setPoint2(point: MeasurePoint) {
    this.point2 = point;
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

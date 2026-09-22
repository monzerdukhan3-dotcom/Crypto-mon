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

export interface TradePlanBox {
  entry: number;
  stopLoss: number;
  /** Ascending take-profit targets. */
  targets: number[];
  /** Time the box starts from — the entry candle. */
  startTime: number;
  /** Time the box ends — when a level was first reached, or "now" if nothing has been hit yet. */
  endTime: number;
  /** How many targets (counted from the first) have actually been reached so far — drawn solid instead of dashed. */
  targetsHit?: number;
  /** True once price actually reached the stop loss — the risk side is shaded a bit stronger. */
  stoppedOut?: boolean;
}

// Matches SUCCESS_COLOR / DANGER_COLOR in CandlestickChart.tsx.
const PROFIT_FILL = "rgba(34, 197, 94, 0.20)";
const PROFIT_BORDER = "rgba(34, 197, 94, 0.7)";
const RISK_FILL = "rgba(240, 68, 68, 0.20)";
const RISK_FILL_HIT = "rgba(240, 68, 68, 0.34)";
const RISK_BORDER = "rgba(240, 68, 68, 0.7)";
const ENTRY_LINE_COLOR = "#a1a1aa";
const ENTRY_PILL_COLOR = "rgba(63, 63, 70, 0.92)";
const TP_PILL_HIT = "rgba(22, 101, 52, 0.92)";
const TP_PILL_PENDING = "rgba(63, 63, 70, 0.88)";

interface BoxCoordinates {
  x1: Coordinate | null;
  x2: Coordinate | null;
  entryY: Coordinate | null;
  stopY: Coordinate | null;
  targetYs: (Coordinate | null)[];
}

class TradePlanBoxPaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly coords: BoxCoordinates,
    private readonly box: TradePlanBox
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    const { x1, x2, entryY, stopY, targetYs } = this.coords;
    if (x1 === null || x2 === null || entryY === null || stopY === null) return;
    if (targetYs.length === 0 || targetYs.some((y) => y === null)) return;
    const ys = targetYs as Coordinate[];

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const left = Math.min(x1, x2) * scope.horizontalPixelRatio;
      const right = Math.max(x1, x2) * scope.horizontalPixelRatio;
      const entry = entryY * scope.verticalPixelRatio;
      const stop = stopY * scope.verticalPixelRatio;
      const topTarget = Math.min(...ys) * scope.verticalPixelRatio;

      ctx.save();

      // Profit side: entry up to the furthest target — a TradingView "long
      // position tool"-style box rather than the bare dashed lines this
      // used to be, so a trade's whole risk/reward shape reads at a glance.
      ctx.fillStyle = PROFIT_FILL;
      ctx.fillRect(left, topTarget, right - left, entry - topTarget);
      ctx.strokeStyle = PROFIT_BORDER;
      ctx.lineWidth = 1.25;
      ctx.strokeRect(left, topTarget, right - left, entry - topTarget);

      // Risk side: entry down to the stop loss.
      ctx.fillStyle = this.box.stoppedOut ? RISK_FILL_HIT : RISK_FILL;
      ctx.fillRect(left, entry, right - left, stop - entry);
      ctx.strokeStyle = RISK_BORDER;
      ctx.strokeRect(left, entry, right - left, stop - entry);

      // Entry boundary, solid, where the two sides meet — labeled, same as
      // the targets below, so the entry price itself is actually readable
      // on the chart instead of only in the sidebar.
      ctx.strokeStyle = ENTRY_LINE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left, entry);
      ctx.lineTo(right, entry);
      ctx.stroke();
      this.drawLevelLabel(ctx, scope, left, right, entry, "Entry", ENTRY_PILL_COLOR);

      // Take-profit dividers inside the profit side, each labeled — a
      // target already reached is drawn solid, one still pending stays
      // dashed, so the box also doubles as a quick read on how far a
      // resolved/in-progress trade actually got.
      const targetsHit = this.box.targetsHit ?? 0;
      ys.forEach((y, i) => {
        const yPx = y * scope.verticalPixelRatio;
        const hit = i < targetsHit;
        ctx.strokeStyle = PROFIT_BORDER;
        ctx.lineWidth = hit ? 1.5 : 1;
        ctx.setLineDash(hit ? [] : [4 * scope.horizontalPixelRatio, 3 * scope.horizontalPixelRatio]);
        ctx.beginPath();
        ctx.moveTo(left, yPx);
        ctx.lineTo(right, yPx);
        ctx.stroke();
        ctx.setLineDash([]);

        this.drawLevelLabel(ctx, scope, left, right, yPx, `Tp${i + 1}`, hit ? TP_PILL_HIT : TP_PILL_PENDING);
      });

      ctx.restore();
    });
  }

  private drawLevelLabel(
    ctx: CanvasRenderingContext2D,
    scope: { horizontalPixelRatio: number; verticalPixelRatio: number; bitmapSize: { width: number; height: number } },
    left: number,
    right: number,
    y: number,
    text: string,
    pillColor: string
  ) {
    // Centered on whatever's actually visible of the box, not its full
    // (possibly off-screen) span — the same reasoning as clamping other
    // on-chart labels to stay readable while panned/zoomed.
    const visibleLeft = Math.max(left, 0);
    const visibleRight = Math.min(right, scope.bitmapSize.width);
    if (visibleRight - visibleLeft < 24 * scope.horizontalPixelRatio) return;

    const fontSize = 10.5 * scope.verticalPixelRatio;
    ctx.font = `700 ${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const paddingX = 6 * scope.horizontalPixelRatio;
    const paddingY = 4 * scope.verticalPixelRatio;
    const pillWidth = textWidth + paddingX * 2;
    const pillHeight = fontSize + paddingY * 1.4;

    const centerX = (visibleLeft + visibleRight) / 2;
    const pillX = centerX - pillWidth / 2;
    const pillY = y - pillHeight / 2;
    const radius = Math.min(4 * scope.horizontalPixelRatio, pillHeight / 2, pillWidth / 2);

    ctx.fillStyle = pillColor;
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
    ctx.fillText(text, centerX, y + 0.5 * scope.verticalPixelRatio);
  }
}

class TradePlanBoxPaneView implements IPrimitivePaneView {
  private coords: BoxCoordinates = { x1: null, x2: null, entryY: null, stopY: null, targetYs: [] };

  constructor(private readonly source: TradePlanBoxPrimitive) {}

  update() {
    const { chart, series, box } = this.source;
    if (!chart || !series) return;

    const timeScale = chart.timeScale();
    this.coords = {
      x1: timeScale.timeToCoordinate(box.startTime as UTCTimestamp),
      x2: timeScale.timeToCoordinate(box.endTime as UTCTimestamp),
      entryY: series.priceToCoordinate(box.entry),
      stopY: series.priceToCoordinate(box.stopLoss),
      targetYs: box.targets.map((t) => series.priceToCoordinate(t)),
    };
  }

  renderer() {
    return new TradePlanBoxPaneRenderer(this.coords, this.source.box);
  }
}

/**
 * Draws one trade plan (live or from the trade-history backtest) as a single
 * risk/reward box — green from entry up to the furthest target, red from
 * entry down to the stop loss, with each take-profit level as its own
 * labeled divider — instead of separate unlabeled dashed lines. Used both
 * for the dashboard's current live setup and for a resolved/pending record
 * on the trade-history page, so the same shape means the same thing
 * everywhere it appears.
 */
export class TradePlanBoxPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  private readonly paneView: TradePlanBoxPaneView;

  constructor(public readonly box: TradePlanBox) {
    this.paneView = new TradePlanBoxPaneView(this);
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

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
import type { LiquidityLevel } from "@/lib/liquidityZones";

interface LineCoordinates {
  x1: Coordinate | null;
  x2: Coordinate | null;
  y: Coordinate | null;
}

// Matches SUCCESS_COLOR / DANGER_COLOR in CandlestickChart.tsx. Sell-side
// (equal lows) reads like support (green); buy-side (equal highs) like
// resistance (red) — same convention as demand/supply zones.
const LIQUIDITY_COLORS: Record<LiquidityLevel["type"], string> = {
  sellside: "rgba(34, 197, 94, 0.55)",
  buyside: "rgba(240, 68, 68, 0.55)",
};

class LiquidityLinePaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly coords: LineCoordinates,
    private readonly type: LiquidityLevel["type"]
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    const { x1, x2, y } = this.coords;
    if (x1 === null || x2 === null || y === null) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const left = Math.min(x1, x2) * scope.horizontalPixelRatio;
      const right = Math.max(x1, x2) * scope.horizontalPixelRatio;
      const lineY = y * scope.verticalPixelRatio;

      ctx.save();
      ctx.strokeStyle = LIQUIDITY_COLORS[this.type];
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4 * scope.horizontalPixelRatio, 3 * scope.horizontalPixelRatio]);
      ctx.beginPath();
      ctx.moveTo(left, lineY);
      ctx.lineTo(right, lineY);
      ctx.stroke();
      ctx.restore();
    });
  }
}

class LiquidityLinePaneView implements IPrimitivePaneView {
  private coords: LineCoordinates = { x1: null, x2: null, y: null };

  constructor(private readonly source: LiquidityLinePrimitive) {}

  update() {
    const { chart, series, level } = this.source;
    if (!chart || !series) return;

    const timeScale = chart.timeScale();
    this.coords = {
      x1: timeScale.timeToCoordinate(level.startTime as UTCTimestamp),
      x2: timeScale.timeToCoordinate(level.endTime as UTCTimestamp),
      y: series.priceToCoordinate(level.price),
    };
  }

  renderer() {
    return new LiquidityLinePaneRenderer(this.coords, this.source.level.type);
  }
}

/** Draws one liquidity pool (equal highs/lows cluster) as a dashed horizontal line. */
export class LiquidityLinePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  private readonly paneView: LiquidityLinePaneView;

  constructor(public readonly level: LiquidityLevel) {
    this.paneView = new LiquidityLinePaneView(this);
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

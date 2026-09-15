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

export interface TradePlanLine {
  price: number;
  color: string;
  title: string;
  /** Time the trade plan's line starts from — the entry candle. */
  startTime: number;
  /** Time price first reached this specific level, or the last available candle if it hasn't yet. */
  endTime: number;
}

interface LineCoordinates {
  x1: Coordinate | null;
  x2: Coordinate | null;
  y: Coordinate | null;
}

class TradePlanLinePaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly coords: LineCoordinates,
    private readonly line: TradePlanLine
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    const { x1, x2, y } = this.coords;
    if (x1 === null || x2 === null || y === null) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const left = Math.min(x1, x2) * scope.horizontalPixelRatio;
      const right = Math.max(x1, x2) * scope.horizontalPixelRatio;
      const lineY = y * scope.verticalPixelRatio;

      // No inline text label here (unlike the measure tool's) — the
      // entry/stop/targets often sit only a fraction of a percent apart,
      // and with every one of these lines sharing the same start/end time,
      // independently-drawn labels would stack on top of each other with
      // no way for one line to know where its neighbors landed. The
      // sidebar's "خطة الصفقة" card already gives the exact numbers;
      // color alone (gray/red/green) distinguishes entry/stop/targets here.
      ctx.save();
      ctx.strokeStyle = this.line.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5 * scope.horizontalPixelRatio, 3 * scope.horizontalPixelRatio]);
      ctx.beginPath();
      ctx.moveTo(left, lineY);
      ctx.lineTo(right, lineY);
      ctx.stroke();
      ctx.restore();
    });
  }
}

class TradePlanLinePaneView implements IPrimitivePaneView {
  private coords: LineCoordinates = { x1: null, x2: null, y: null };

  constructor(private readonly source: TradePlanLinePrimitive) {}

  update() {
    const { chart, series, line } = this.source;
    if (!chart || !series) return;

    const timeScale = chart.timeScale();
    this.coords = {
      x1: timeScale.timeToCoordinate(line.startTime as UTCTimestamp),
      x2: timeScale.timeToCoordinate(line.endTime as UTCTimestamp),
      y: series.priceToCoordinate(line.price),
    };
  }

  renderer() {
    return new TradePlanLinePaneRenderer(this.coords, this.source.line);
  }
}

/** Draws one entry/stop-loss/target line as a bounded segment from the entry candle to wherever that level was reached (or "now" if it hasn't been). */
export class TradePlanLinePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  private readonly paneView: TradePlanLinePaneView;

  constructor(public readonly line: TradePlanLine) {
    this.paneView = new TradePlanLinePaneView(this);
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

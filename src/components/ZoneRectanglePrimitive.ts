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

const ZONE_COLORS: Record<Zone["type"], { fill: string; border: string }> = {
  demand: { fill: "rgba(34, 197, 94, 0.16)", border: "rgba(34, 197, 94, 0.65)" },
  supply: { fill: "rgba(239, 68, 68, 0.16)", border: "rgba(239, 68, 68, 0.65)" },
};

class ZoneRectanglePaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly coords: RectangleCoordinates,
    private readonly zoneType: Zone["type"]
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

      ctx.fillStyle = colors.fill;
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(left, top, right - left, bottom - top);
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
    return new ZoneRectanglePaneRenderer(this.coords, this.source.zone.type);
  }
}

/** Draws one supply/demand zone as a colored rectangle on the candlestick pane. */
export class ZoneRectanglePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  private readonly paneView: ZoneRectanglePaneView;

  constructor(public readonly zone: Zone) {
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

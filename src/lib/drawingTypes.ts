export type DrawingTool = "none" | "horizontal" | "trend" | "measure";

export interface HorizontalLineDrawing {
  id: string;
  kind: "horizontal";
  price: number;
}

export interface TrendLineDrawing {
  id: string;
  kind: "trend";
  point1: { time: number; price: number };
  point2: { time: number; price: number };
}

/** A TradingView-style ruler: two clicked points, rendered with the $ and % difference between them. */
export interface MeasureDrawing {
  id: string;
  kind: "measure";
  point1: { time: number; price: number };
  point2: { time: number; price: number };
}

export type Drawing = HorizontalLineDrawing | TrendLineDrawing | MeasureDrawing;

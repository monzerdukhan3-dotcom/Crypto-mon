// "measure" is a tool mode, not a persisted drawing kind — see MeasurePrimitive:
// a TradingView-style ruler is ephemeral, drawn live while dragging and
// discarded on mouse-up rather than kept around like the other tools.
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

export type Drawing = HorizontalLineDrawing | TrendLineDrawing;

export type DrawingTool = "none" | "horizontal" | "trend";

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

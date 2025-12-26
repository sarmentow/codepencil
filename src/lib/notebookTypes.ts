export type Point = { x: number; y: number; p: number; t: number };

export type Stroke = Point[];

export type Cell = {
  id: string;
  strokes: Stroke[];
  recognizedCode?: string;
  status?: "idle" | "converting" | "error";
  error?: string;
  runStatus?: "idle" | "running" | "done" | "error";
  stdout?: string;
  stderr?: string;
  height?: number;
};

export type Notebook = {
  version: 1;
  cells: Cell[];
};






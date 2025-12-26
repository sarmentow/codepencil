import type { Stroke, Cell } from "./notebookTypes";

/**
 * Convert a stroke to an SVG path d attribute
 */
function strokeToPathD(stroke: Stroke): string {
  if (stroke.length === 0) return "";
  if (stroke.length === 1) {
    // Single point - draw a tiny line to make it visible
    const p = stroke[0];
    return `M${p.x.toFixed(2)} ${p.y.toFixed(2)} L${(p.x + 0.1).toFixed(2)} ${(p.y + 0.1).toFixed(2)}`;
  }
  const parts = [`M${stroke[0].x.toFixed(2)} ${stroke[0].y.toFixed(2)}`];
  for (let i = 1; i < stroke.length; i++) {
    parts.push(`L${stroke[i].x.toFixed(2)} ${stroke[i].y.toFixed(2)}`);
  }
  return parts.join(" ");
}

/**
 * Convert strokes to SVG string
 */
export function strokesToSvg(strokes: Stroke[], width: number, height: number, strokeWidth: number = 4): string {
  const paths = strokes
    .map((stroke) => {
      const d = strokeToPathD(stroke);
      if (!d) return "";
      return `  <path d="${d}" stroke="#000" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
${paths}
</svg>`;
}

/**
 * Parse SVG path d attribute to stroke points
 */
function parsePathD(d: string): Stroke {
  const stroke: Stroke = [];
  // Match M/L commands with coordinates
  const regex = /([ML])\s*([\d.-]+)\s+([\d.-]+)/gi;
  let match;
  while ((match = regex.exec(d)) !== null) {
    const x = parseFloat(match[2]);
    const y = parseFloat(match[3]);
    if (!isNaN(x) && !isNaN(y)) {
      stroke.push({ x, y, p: 0.5, t: 0 });
    }
  }
  return stroke;
}

/**
 * Parse SVG string to strokes
 */
export function svgToStrokes(svgString: string): { strokes: Stroke[]; width: number; height: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.querySelector("svg");
  
  let width = 800;
  let height = 320;
  
  if (svg) {
    // Try to get dimensions from viewBox or width/height attributes
    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      if (parts.length >= 4) {
        width = parseFloat(parts[2]) || width;
        height = parseFloat(parts[3]) || height;
      }
    } else {
      const w = svg.getAttribute("width");
      const h = svg.getAttribute("height");
      if (w) width = parseFloat(w) || width;
      if (h) height = parseFloat(h) || height;
    }
  }

  const paths = doc.querySelectorAll("path");
  const strokes: Stroke[] = [];

  paths.forEach((path) => {
    const d = path.getAttribute("d");
    if (d) {
      const stroke = parsePathD(d);
      if (stroke.length > 0) {
        strokes.push(stroke);
      }
    }
  });

  return { strokes, width, height };
}

/**
 * Project manifest type
 */
export type ProjectManifest = {
  version: 1;
  cells: {
    file: string;
    height?: number;
    recognizedCode?: string;
  }[];
  strokeWidth?: number;
};

/**
 * Create manifest from cells
 */
export function createManifest(cells: Cell[], strokeWidth: number): ProjectManifest {
  return {
    version: 1,
    strokeWidth,
    cells: cells.map((cell, idx) => ({
      file: `cell-${String(idx + 1).padStart(3, "0")}.svg`,
      height: cell.height,
      recognizedCode: cell.recognizedCode,
    })),
  };
}


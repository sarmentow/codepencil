"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Stroke } from "@/lib/notebookTypes";

export type Tool = "pen" | "eraser";

export type InkCanvasHandle = {
  toDataURL: () => string;
};

type Props = {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  height?: number;
  tool?: Tool;
  strokeSize?: number;
};

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, dpr: number, size: number) {
  if (stroke.length === 0) return;
  
  const r = (size / 2) * dpr;
  
  if (stroke.length === 1) {
    const p = stroke[0];
    ctx.beginPath();
    ctx.arc(p.x * dpr, p.y * dpr, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * dpr;
  
  ctx.beginPath();
  ctx.moveTo(stroke[0].x * dpr, stroke[0].y * dpr);
  for (let i = 1; i < stroke.length; i++) {
    ctx.lineTo(stroke[i].x * dpr, stroke[i].y * dpr);
  }
  ctx.stroke();
}

function isPointNearStroke(px: number, py: number, stroke: Stroke, threshold: number): boolean {
  for (const pt of stroke) {
    const dx = pt.x - px;
    const dy = pt.y - py;
    if (dx * dx + dy * dy < threshold * threshold) return true;
  }
  return false;
}

export const InkCanvas = forwardRef<InkCanvasHandle, Props>(function InkCanvas(
  { strokes, onChange, height = 320, tool = "pen", strokeSize = 4 }: Props,
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const activeStrokeRef = useRef<Stroke>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const strokeSizeRef = useRef(strokeSize);

  useEffect(() => {
    strokeSizeRef.current = strokeSize;
  }, [strokeSize]);

  useImperativeHandle(
    ref,
    () => ({
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
    }),
    [],
  );

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.strokeStyle = "#000";

    for (const s of strokes) drawStroke(ctx, s, dpr, strokeSizeRef.current);
    drawStroke(ctx, activeStrokeRef.current, dpr, strokeSizeRef.current);
  };

  useEffect(() => {
    redraw();
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, height, strokeSize]);

  const eventPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const p = typeof e.pressure === "number" && e.pressure > 0 ? e.pressure : 0.5;
    return { x, y, p, t: performance.now() };
  };

  const acceptPointer = (e: React.PointerEvent) => e.pointerType === "pen" || e.pointerType === "mouse";

  const handleErase = (x: number, y: number) => {
    const threshold = 20;
    const remaining = strokes.filter((s) => !isPointNearStroke(x, y, s, threshold));
    if (remaining.length !== strokes.length) {
      onChange(remaining);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full bg-white touch-none"
      style={{ height }}
      onPointerDown={(e) => {
        e.preventDefault();
        if (e.button !== 0 || !acceptPointer(e)) return;
        if (drawingRef.current) return;
        (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
        drawingRef.current = true;
        activePointerIdRef.current = e.pointerId;

        if (tool === "eraser") {
          const pt = eventPoint(e);
          handleErase(pt.x, pt.y);
        } else {
          activeStrokeRef.current = [eventPoint(e)];
          redraw();
        }
      }}
      onPointerMove={(e) => {
        e.preventDefault();
        if (!drawingRef.current || e.pointerId !== activePointerIdRef.current) return;

        if (tool === "eraser") {
          const pt = eventPoint(e);
          handleErase(pt.x, pt.y);
        } else {
          activeStrokeRef.current.push(eventPoint(e));
          redraw();
        }
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        if (!drawingRef.current || e.pointerId !== activePointerIdRef.current) return;
        drawingRef.current = false;
        activePointerIdRef.current = null;

        if (tool === "pen") {
          const stroke = activeStrokeRef.current;
          activeStrokeRef.current = [];
          if (stroke.length >= 1) onChange([...strokes, stroke]);
        }
        redraw();
      }}
      onPointerCancel={(e) => {
        e.preventDefault();
        if (e.pointerId !== activePointerIdRef.current) return;
        drawingRef.current = false;
        activePointerIdRef.current = null;
        activeStrokeRef.current = [];
        redraw();
      }}
    />
  );
});

"use client";
import { useEffect, useRef } from "react";
import { RGBA, Gray, drawToCanvas } from "@/lib/imgproc";
import { Box } from "@/lib/metrics";
import { drawBoxes } from "@/lib/detectors";

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Histogram çubuk grafiği (+ isteğe bağlı CDF eğrisi veya eşleme eğrisi). */
export function Histogram({ hist, cdf, lut, height = 120, color, label }: {
  hist: Uint32Array | null; cdf?: boolean; lut?: ArrayLike<number> | null; height?: number; color?: string; label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || !hist) return;
    const W = 512, H = height * 2; c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    let max = 0, total = 0;
    for (let i = 0; i < 256; i++) { max = Math.max(max, hist[i]); total += hist[i]; }
    ctx.fillStyle = color ?? cssVar("--accent", "#564d80");
    for (let i = 0; i < 256; i++) { const h = max ? (hist[i] / max) * (H - 8) : 0; ctx.fillRect(i * 2, H - h, 2, h); }
    if (cdf && total) {
      ctx.strokeStyle = cssVar("--warm", "#e0795b"); ctx.lineWidth = 3; ctx.beginPath();
      let acc = 0;
      for (let i = 0; i < 256; i++) { acc += hist[i]; const y = H - (acc / total) * (H - 8); i ? ctx.lineTo(i * 2, y) : ctx.moveTo(0, y); }
      ctx.stroke();
    }
    if (lut) {
      ctx.strokeStyle = cssVar("--ok", "#1f9d55"); ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i < 256; i++) { const y = H - (lut[i] / 255) * (H - 8); i ? ctx.lineTo(i * 2, y) : ctx.moveTo(0, y); }
      ctx.stroke();
    }
  }, [hist, cdf, lut, height, color]);
  return (
    <figure className="figure">
      <canvas ref={ref} className="cv" style={{ height }} />
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}

/** Görüntü + kutular. gt: yeşil kesikli, pred: renkli. */
export function ImageView({ im, boxes, labels, color, gt, caption, pixelated, className }: {
  im: RGBA | Gray | null; boxes?: Box[]; labels?: string[]; color?: string; gt?: Box[]; caption?: string; pixelated?: boolean; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!im || !ref.current) return;
    drawToCanvas(ref.current, im);
    const ctx = ref.current.getContext("2d")!;
    if (gt?.length) drawBoxes(ctx, gt, cssVar("--gt", "#1f9d55"), undefined, true, 2);
    if (boxes?.length) drawBoxes(ctx, boxes, color ?? cssVar("--accent", "#564d80"), labels, false, 3);
  }, [im, boxes, labels, color, gt]);
  return (
    <figure className="figure">
      <canvas ref={ref} className={`cv${pixelated ? " pixelated" : ""} ${className ?? ""}`} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

import { BASE } from "@/lib/base";
/**
 * Tarayıcı içinde çalışan iki dedektör:
 *  - Viola-Jones / Haar Cascade : OpenCV.js (WASM) + haarcascade_frontalface_default.xml
 *  - YOLOv8n-face               : onnxruntime-web (WASM) + yolov8n-face-lindevs.onnx
 * Görüntü hiçbir sunucuya gönderilmez (gizlilik + Vercel'de sunucusuz çalışma).
 * Varsayılan parametreler Python deneyleriyle (python/fd/detectors.py) aynıdır.
 */
import { Box, iou } from "./metrics";
import { RGBA, Gray, newRGBA, resize, toGray, rgbToYCrCb, yCrCbToRgb, CLAHE_CLIP, CLAHE_TILES } from "./imgproc";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { cv: any; ort: any } }

export const HAAR_DEFAULTS = { scaleFactor: 1.1, minNeighbors: 5, minSize: 24 };
export const YOLO_DEFAULTS = { conf: 0.35, nmsIoU: 0.45, size: 640 };
export type HaarParams = typeof HAAR_DEFAULTS;
export type YoloParams = typeof YOLO_DEFAULTS;
export type Detection = { boxes: Box[]; scores: number[]; inferenceMs: number; totalMs: number };

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => res();
      s.onerror = () => { scripts.delete(src); rej(new Error("Betik yüklenemedi: " + src)); };
      document.head.appendChild(s);
    }));
  }
  return scripts.get(src)!;
}

/* ============================ OpenCV.js ============================ */
let cvPromise: Promise<any> | null = null;
export function loadOpenCV(): Promise<any> {
  if (!cvPromise) {
    cvPromise = (async () => {
      await loadScript(BASE + "/vendor/opencv.js");
      let cv = window.cv;
      if (cv instanceof Promise) cv = await cv;
      if (!cv.Mat) {
        cv = await new Promise((res) => {
          if (typeof cv.then === "function") cv.then((m: any) => { delete m.then; res(m); });
          else cv.onRuntimeInitialized = () => res(cv);
        });
      }
      window.cv = cv;
      return cv;
    })();
    cvPromise.catch(() => { cvPromise = null; });
  }
  return cvPromise;
}

let haarPromise: Promise<any> | null = null;
export function loadHaar(): Promise<any> {
  if (!haarPromise) {
    haarPromise = (async () => {
      const cv = await loadOpenCV();
      const buf = new Uint8Array(await (await fetch(BASE + "/models/haarcascade_frontalface_default.xml")).arrayBuffer());
      try { cv.FS_unlink("/haar.xml"); } catch { /* ilk yükleme */ }
      cv.FS_createDataFile("/", "haar.xml", buf, true, false, false);
      const clf = new cv.CascadeClassifier();
      if (!clf.load("haar.xml")) throw new Error("Haar cascade yüklenemedi");
      return clf;
    })();
    haarPromise.catch(() => { haarPromise = null; });
  }
  return haarPromise;
}

export async function detectHaar(im: RGBA, p: HaarParams = HAAR_DEFAULTS, grayIn?: Gray): Promise<Detection> {
  const t0 = performance.now();
  const cv = await loadOpenCV();
  const clf = await loadHaar();
  const g = grayIn ?? toGray(im); // 0.2989R + 0.5870G + 0.1140B
  const mat = new cv.Mat(g.h, g.w, cv.CV_8UC1);
  mat.data.set(g.data);
  const faces = new cv.RectVector();
  const t1 = performance.now();
  clf.detectMultiScale(mat, faces, p.scaleFactor, p.minNeighbors, 0, new cv.Size(p.minSize, p.minSize), new cv.Size(0, 0));
  const inferenceMs = performance.now() - t1;
  const boxes: Box[] = [];
  for (let i = 0; i < faces.size(); i++) { const r = faces.get(i); boxes.push([r.x, r.y, r.width, r.height]); }
  mat.delete(); faces.delete();
  return { boxes, scores: boxes.map(() => 1), inferenceMs, totalMs: performance.now() - t0 };
}

/** CLAHE (OpenCV) — deney hattında Python ile birebir aynı sonuç için kullanılır. */
export async function claheOpenCV(im: RGBA, clip = CLAHE_CLIP, tiles = CLAHE_TILES): Promise<RGBA> {
  const cv = await loadOpenCV();
  const { Y, Cr, Cb } = rgbToYCrCb(im);
  const src = new cv.Mat(im.h, im.w, cv.CV_8UC1), dst = new cv.Mat();
  const y8 = new Uint8Array(Y.length);
  for (let i = 0; i < Y.length; i++) y8[i] = Math.max(0, Math.min(255, Math.round(Y[i])));
  src.data.set(y8);
  const op = new cv.CLAHE(clip, new cv.Size(tiles, tiles));
  op.apply(src, dst);
  const out = yCrCbToRgb(im.w, im.h, dst.data, Cr, Cb);
  src.delete(); dst.delete(); op.delete();
  return out;
}

/* ============================ YOLO (ONNX) ============================ */
let ortSession: Promise<any> | null = null;
export function loadYolo(): Promise<any> {
  if (!ortSession) {
    ortSession = (async () => {
      await loadScript(BASE + "/vendor/ort/ort.wasm.min.js");
      const ort = window.ort;
      ort.env.wasm.wasmPaths = BASE + "/vendor/ort/";
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      return ort.InferenceSession.create(BASE + "/models/yolov8n-face-lindevs.onnx", { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    })();
    ortSession.catch(() => { ortSession = null; });
  }
  return ortSession;
}

/** En-boy oranını koruyarak size×size tuvale yerleştir; boşluklar gri (114). */
export function letterbox(im: RGBA, size = 640) {
  const r = Math.min(size / im.h, size / im.w);
  const nw = Math.round(im.w * r), nh = Math.round(im.h * r);
  const rs = resize(im, nw, nh, "bilinear");
  const out = newRGBA(size, size);
  out.data.fill(114);
  const px = Math.floor((size - nw) / 2), py = Math.floor((size - nh) / 2);
  for (let y = 0; y < nh; y++) out.data.set(rs.data.subarray(y * nw * 4, (y + 1) * nw * 4), ((y + py) * size + px) * 4);
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
  return { img: out, r, px, py };
}

/** Greedy NMS: skor sırasıyla; tutulan bir kutuyla IoU ≥ eşik olanları at. */
export function nms(boxes: Box[], scores: number[], thr: number): number[] {
  const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const keep: number[] = [];
  for (const i of order) if (keep.every((k) => iou(boxes[i], boxes[k]) < thr)) keep.push(i);
  return keep;
}

export type YoloRaw = { candidates: number; preNms: { boxes: Box[]; scores: number[] } };

export async function detectYolo(im: RGBA, p: YoloParams = YOLO_DEFAULTS, debug?: (d: YoloRaw) => void): Promise<Detection> {
  const t0 = performance.now();
  const sess = await loadYolo();
  const ort = window.ort;
  const S = p.size;
  const { img, r, px, py } = letterbox(im, S);
  // HWC uint8 -> CHW float32 [0,1]
  const n = S * S, x = new Float32Array(3 * n);
  for (let i = 0, j = 0; j < n; i += 4, j++) { x[j] = img.data[i] / 255; x[n + j] = img.data[i + 1] / 255; x[2 * n + j] = img.data[i + 2] / 255; }
  const t1 = performance.now();
  const res = await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", x, [1, 3, S, S]) });
  const inferenceMs = performance.now() - t1;
  const out = res[sess.outputNames[0]];
  const data = out.data as Float32Array, A = out.dims[2]; // [1, 5, 8400]
  const boxes: Box[] = [], scores: number[] = [];
  for (let a = 0; a < A; a++) {
    const s = data[4 * A + a];
    if (s < p.conf) continue;
    const cx = data[a], cy = data[A + a], bw = data[2 * A + a], bh = data[3 * A + a];
    const x1 = (cx - bw / 2 - px) / r, y1 = (cy - bh / 2 - py) / r;
    const x1c = Math.max(0, x1), y1c = Math.max(0, y1);
    const x2c = Math.min(im.w, x1 + bw / r), y2c = Math.min(im.h, y1 + bh / r);
    boxes.push([x1c, y1c, x2c - x1c, y2c - y1c]); scores.push(s);
  }
  debug?.({ candidates: boxes.length, preNms: { boxes: [...boxes], scores: [...scores] } });
  const keep = nms(boxes, scores, p.nmsIoU);
  return { boxes: keep.map((k) => boxes[k]), scores: keep.map((k) => scores[k]), inferenceMs, totalMs: performance.now() - t0 };
}

/* ============================ çizim ============================ */
export function drawBoxes(ctx: CanvasRenderingContext2D, boxes: Box[], color: string, labels?: string[], dashed = false, lw = 2) {
  const s = Math.max(1, ctx.canvas.width / 640);
  ctx.save();
  ctx.lineWidth = lw * s;
  ctx.strokeStyle = color;
  if (dashed) ctx.setLineDash([6 * s, 4 * s]);
  ctx.font = `600 ${Math.round(12 * s)}px system-ui, sans-serif`;
  boxes.forEach((b, i) => {
    ctx.strokeRect(b[0], b[1], b[2], b[3]);
    const t = labels?.[i];
    if (t) {
      const tw = ctx.measureText(t).width + 8 * s, th = 16 * s;
      ctx.fillStyle = color;
      ctx.fillRect(b[0] - (lw * s) / 2, b[1] - th, tw, th);
      ctx.fillStyle = "#fff";
      ctx.fillText(t, b[0] + 4 * s - (lw * s) / 2, b[1] - 4 * s);
    }
  });
  ctx.restore();
}

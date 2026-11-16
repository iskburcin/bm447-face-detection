/** Değerlendirme: IoU ≥ 0.50 bire bir eşleştirme (Python fd/metrics.py ile aynı algoritma). */
export type Box = [number, number, number, number]; // x, y, w, h
export const IOU_THR = 0.5;

export function iou(a: Box, b: Box): number {
  const iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const inter = iw * ih, uni = a[2] * a[3] + b[2] * b[3] - inter;
  return uni > 0 ? inter / uni : 0;
}

/** Tüm (tahmin, referans) çiftleri IoU'ya göre büyükten küçüğe; ikisi de boştaysa eşleştir. */
export function match(preds: Box[], gts: Box[], thr = IOU_THR) {
  const pairs: [number, number, number][] = [];
  preds.forEach((p, i) => gts.forEach((g, j) => { const v = iou(p, g); if (v >= thr) pairs.push([v, i, j]); }));
  pairs.sort((a, b) => b[0] - a[0]);
  const up = new Set<number>(), ug = new Set<number>(), matches: [number, number, number][] = [];
  for (const [v, i, j] of pairs) {
    if (up.has(i) || ug.has(j)) continue;
    up.add(i); ug.add(j); matches.push([i, j, v]);
  }
  const tp = matches.length;
  return { tp, fp: preds.length - tp, fn: gts.length - tp, matches, matchedPred: up, matchedGt: ug };
}

export function prf(tp: number, fp: number, fn: number) {
  const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0;
  return { precision: p, recall: r, f1: p + r ? (2 * p * r) / (p + r) : 0 };
}

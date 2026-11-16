/**
 * Elle yazılmış görüntü işleme kütüphanesi (hazır görüntü işleme fonksiyonu kullanılmaz).
 * Python tarafındaki python/fd/enhance.py ile aynı formüller kullanılır.
 *
 *  RGBA  : tarayıcının ImageData biçimi (w*h*4)
 *  Gray  : tek kanal (w*h), 0..255
 */
export type RGBA = { w: number; h: number; data: Uint8ClampedArray };
export type Gray = { w: number; h: number; data: Uint8ClampedArray };

// ---- Sabit deney parametreleri (Python ile aynı) ----
export const ALPHA = 1.3;
export const BETA = 20;
export const CLAHE_CLIP = 2.0;
export const CLAHE_TILES = 8;
export const W_R = 0.2989, W_G = 0.587, W_B = 0.114;

export const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export function cloneRGBA(im: RGBA): RGBA {
  return { w: im.w, h: im.h, data: new Uint8ClampedArray(im.data) };
}
export function newRGBA(w: number, h: number): RGBA {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

/* ======================= 1. Renk / gri dönüşüm ======================= */

/** Y = 0.2989 R + 0.5870 G + 0.1140 B  (MATLAB rgb2gray ağırlıkları) */
export function toGray(im: RGBA): Gray {
  const out = new Uint8ClampedArray(im.w * im.h);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = W_R * im.data[i] + W_G * im.data[i + 1] + W_B * im.data[i + 2];
  }
  return { w: im.w, h: im.h, data: out };
}
/** Basit ortalama (karşılaştırma için): (R+G+B)/3 */
export function toGrayAverage(im: RGBA): Gray {
  const out = new Uint8ClampedArray(im.w * im.h);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = (im.data[i] + im.data[i + 1] + im.data[i + 2]) / 3;
  return { w: im.w, h: im.h, data: out };
}
export function grayToRGBA(g: Gray): RGBA {
  const out = newRGBA(g.w, g.h);
  for (let j = 0, i = 0; j < g.data.length; j++, i += 4) {
    out.data[i] = out.data[i + 1] = out.data[i + 2] = g.data[j];
    out.data[i + 3] = 255;
  }
  return out;
}
/** Tek bir kanalı göster: 0=R, 1=G, 2=B (diğerleri sıfır) */
export function channel(im: RGBA, c: 0 | 1 | 2, tinted = true): RGBA {
  const out = newRGBA(im.w, im.h);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = im.data[i + c];
    if (tinted) { out.data[i + c] = v; } else { out.data[i] = out.data[i + 1] = out.data[i + 2] = v; }
    out.data[i + 3] = 255;
  }
  return out;
}

/* YCrCb (BT.601) — renkli HE/CLAHE yalnız Y kanalına uygulanır */
export function rgbToYCrCb(im: RGBA) {
  const n = im.w * im.h, Y = new Float32Array(n), Cr = new Float32Array(n), Cb = new Float32Array(n);
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    Y[j] = y; Cr[j] = (r - y) * 0.713 + 128; Cb[j] = (b - y) * 0.564 + 128;
  }
  return { Y, Cr, Cb };
}
export function yCrCbToRgb(w: number, h: number, Y: ArrayLike<number>, Cr: Float32Array, Cb: Float32Array): RGBA {
  const out = newRGBA(w, h);
  for (let j = 0, i = 0; j < w * h; j++, i += 4) {
    const y = Y[j], cr = Cr[j] - 128, cb = Cb[j] - 128;
    out.data[i] = clamp8(y + 1.403 * cr);
    out.data[i + 1] = clamp8(y - 0.714 * cr - 0.344 * cb);
    out.data[i + 2] = clamp8(y + 1.773 * cb);
    out.data[i + 3] = 255;
  }
  return out;
}
const yToU8 = (Y: Float32Array) => { const o = new Uint8ClampedArray(Y.length); for (let i = 0; i < Y.length; i++) o[i] = Math.round(Y[i]); return o; };

/* ======================= 2. Nokta işlemleri ======================= */

/** g = clip(α·f + β) — parlaklık (β) ve kontrast (α) */
export function brightnessContrast(im: RGBA, alpha = ALPHA, beta = BETA): RGBA {
  const out = cloneRGBA(im);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = clamp8(alpha * v + beta);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = lut[im.data[i]]; out.data[i + 1] = lut[im.data[i + 1]]; out.data[i + 2] = lut[im.data[i + 2]];
  }
  return out;
}
/** Gama düzeltmesi: s = 255·(r/255)^γ */
export function gamma(im: RGBA, g: number): RGBA {
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = clamp8(255 * Math.pow(v / 255, g));
  return applyLUT(im, lut);
}
export function negative(im: RGBA): RGBA {
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 - v;
  return applyLUT(im, lut);
}
export function applyLUT(im: RGBA, lut: Uint8ClampedArray): RGBA {
  const out = cloneRGBA(im);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = lut[im.data[i]]; out.data[i + 1] = lut[im.data[i + 1]]; out.data[i + 2] = lut[im.data[i + 2]];
  }
  return out;
}
export function threshold(g: Gray, t: number): Gray {
  const o = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < o.length; i++) o[i] = g.data[i] >= t ? 255 : 0;
  return { w: g.w, h: g.h, data: o };
}
/** Otsu: sınıflar arası varyansı en büyükleyen eşik */
export function otsu(g: Gray): number {
  const h = histogram(g.data), n = g.data.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * h[i];
  let sumB = 0, wB = 0, best = 0, bestT = 0;
  for (let t = 0; t < 256; t++) {
    wB += h[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sumB += t * h[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; bestT = t; }
  }
  return bestT;
}

/* ======================= 3. Histogram ======================= */

export function histogram(data: ArrayLike<number>, step = 1): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < data.length; i += step) h[data[i]]++;
  return h;
}
export function lumaHistogram(im: RGBA): Uint32Array {
  return histogram(toGray(im).data);
}
/** Histogram eşitleme LUT'u: s_k = round((CDF(k) − CDF_min)/(N − CDF_min)·255) */
export function equalizeLUT(h: Uint32Array): { lut: Uint8ClampedArray; cdf: Float64Array } {
  const cdf = new Float64Array(256);
  let acc = 0; for (let i = 0; i < 256; i++) { acc += h[i]; cdf[i] = acc; }
  const n = acc; let cdfMin = 0;
  for (let i = 0; i < 256; i++) if (cdf[i] > 0) { cdfMin = cdf[i]; break; }
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = n === cdfMin ? i : Math.round(((cdf[i] - cdfMin) / (n - cdfMin)) * 255);
  return { lut, cdf };
}
export function equalizeGray(g: Gray): Gray {
  const { lut } = equalizeLUT(histogram(g.data));
  const o = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < o.length; i++) o[i] = lut[g.data[i]];
  return { w: g.w, h: g.h, data: o };
}
/** Renkli HE: Y kanalı eşitlenir, Cr/Cb korunur (Python hist_equalize_manual ile aynı) */
export function histEqualize(im: RGBA): RGBA {
  const { Y, Cr, Cb } = rgbToYCrCb(im);
  const y8 = yToU8(Y);
  const { lut } = equalizeLUT(histogram(y8));
  const yEq = new Uint8ClampedArray(y8.length);
  for (let i = 0; i < y8.length; i++) yEq[i] = lut[y8[i]];
  return yCrCbToRgb(im.w, im.h, yEq, Cr, Cb);
}
/** Histogram germe (min-max normalizasyon) */
export function stretch(im: RGBA): RGBA {
  const g = toGray(im).data;
  let lo = 255, hi = 0;
  for (let i = 0; i < g.length; i++) { if (g[i] < lo) lo = g[i]; if (g[i] > hi) hi = g[i]; }
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = hi === lo ? v : clamp8(((v - lo) / (hi - lo)) * 255);
  return applyLUT(im, lut);
}

/**
 * CLAHE — elle yazılmış sürüm (eğitim amaçlı, laboratuvar sayfası).
 * 1) Görüntü tiles×tiles bloğa bölünür, 2) her bloğun histogramı clipLimit·(ortalama) ile kırpılır,
 * 3) taşan sayım tüm kutulara eşit dağıtılır, 4) blok başına eşitleme LUT'u çıkarılır,
 * 5) her piksel en yakın 4 blok LUT'unun çift doğrusal (bilinear) ağırlıklı ortalamasıyla eşlenir.
 * Deney hattında OpenCV createCLAHE kullanılır (Python ile birebir tutarlılık için).
 */
export function claheGray(g: Gray, clip = CLAHE_CLIP, tiles = CLAHE_TILES): Gray {
  const { w, h, data } = g;
  const tw = Math.ceil(w / tiles), th = Math.ceil(h / tiles);
  const luts: Uint8ClampedArray[] = [];
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
    const hist = new Uint32Array(256);
    const x0 = tx * tw, y0 = ty * th, x1 = Math.min(w, x0 + tw), y1 = Math.min(h, y0 + th);
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { hist[data[y * w + x]]++; n++; }
    const limit = Math.max(1, Math.floor((clip * n) / 256));
    let excess = 0;
    for (let i = 0; i < 256; i++) if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
    const add = Math.floor(excess / 256), rem = excess - add * 256;
    for (let i = 0; i < 256; i++) hist[i] += add + (i < rem ? 1 : 0);
    const lut = new Uint8ClampedArray(256);
    let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; lut[i] = n ? Math.round((acc / n) * 255) : i; }
    luts.push(lut);
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const gy = y / th - 0.5, ty0 = Math.max(0, Math.floor(gy)), ty1 = Math.min(tiles - 1, ty0 + 1), fy = Math.min(1, Math.max(0, gy - ty0));
    for (let x = 0; x < w; x++) {
      const gx = x / tw - 0.5, tx0 = Math.max(0, Math.floor(gx)), tx1 = Math.min(tiles - 1, tx0 + 1), fx = Math.min(1, Math.max(0, gx - tx0));
      const v = data[y * w + x];
      const a = luts[ty0 * tiles + tx0][v], b = luts[ty0 * tiles + tx1][v], c = luts[ty1 * tiles + tx0][v], d = luts[ty1 * tiles + tx1][v];
      out[y * w + x] = (1 - fy) * ((1 - fx) * a + fx * b) + fy * ((1 - fx) * c + fx * d);
    }
  }
  return { w, h, data: out };
}
export function claheRGB(im: RGBA, clip = CLAHE_CLIP, tiles = CLAHE_TILES): RGBA {
  const { Y, Cr, Cb } = rgbToYCrCb(im);
  const yc = claheGray({ w: im.w, h: im.h, data: yToU8(Y) }, clip, tiles);
  return yCrCbToRgb(im.w, im.h, yc.data, Cr, Cb);
}

/* ======================= 4. Geometrik dönüşümler ======================= */

export type Interp = "nearest" | "bilinear";

function sample(im: RGBA, x: number, y: number, mode: Interp, out: Uint8ClampedArray, o: number, fill = 0) {
  const { w, h, data } = im;
  if (x < -0.5 || y < -0.5 || x > w - 0.5 || y > h - 0.5) { out[o] = out[o + 1] = out[o + 2] = fill; out[o + 3] = 255; return; }
  if (mode === "nearest") {
    const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y)));
    const i = (yi * w + xi) * 4;
    out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2]; out[o + 3] = 255;
    return;
  }
  const xc = Math.min(w - 1, Math.max(0, x)), yc = Math.min(h - 1, Math.max(0, y));
  const x0 = Math.floor(xc), y0 = Math.floor(yc), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = xc - x0, fy = yc - y0;
  for (let c = 0; c < 3; c++) {
    const a = data[(y0 * w + x0) * 4 + c], b = data[(y0 * w + x1) * 4 + c];
    const d = data[(y1 * w + x0) * 4 + c], e = data[(y1 * w + x1) * 4 + c];
    out[o + c] = (1 - fy) * ((1 - fx) * a + fx * b) + fy * ((1 - fx) * d + fx * e);
  }
  out[o + 3] = 255;
}

/**
 * Genel afin dönüşüm — TERS EŞLEME (backward mapping):
 * çıktıdaki her (x', y') için kaynakta (x, y) = M⁻¹·(x', y', 1) hesaplanır ve interpolasyonla örneklenir.
 * Böylece çıktıda "delik" kalmaz (ileri eşlemede kalırdı).
 * M = [[a, b, c], [d, e, f]]  (x' = a x + b y + c ;  y' = d x + e y + f)
 */
export function affine(im: RGBA, M: number[], outW: number, outH: number, mode: Interp = "bilinear", fill = 0): RGBA {
  const [a, b, c, d, e, f] = M;
  const det = a * e - b * d;
  const ia = e / det, ib = -b / det, id = -d / det, ie = a / det;
  const out = newRGBA(outW, outH);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const X = x - c, Y = y - f;
    sample(im, ia * X + ib * Y, id * X + ie * Y, mode, out.data, (y * outW + x) * 4, fill);
  }
  return out;
}
/** Merkez etrafında θ derece döndürme matrisi (tuval boyutu korunur) */
export function rotationMatrix(w: number, h: number, deg: number, scale = 1): number[] {
  const t = (deg * Math.PI) / 180, cos = Math.cos(t) * scale, sin = Math.sin(t) * scale;
  const cx = w / 2, cy = h / 2;
  // x' = cos·(x−cx) − sin·(y−cy) + cx ; y' = sin·(x−cx) + cos·(y−cy) + cy
  return [cos, -sin, cx - cos * cx + sin * cy, sin, cos, cy - sin * cx - cos * cy];
}
export function resize(im: RGBA, nw: number, nh: number, mode: Interp): RGBA {
  const sx = im.w / nw, sy = im.h / nh, out = newRGBA(nw, nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    // piksel merkezlerini hizala: (x+0.5)·s − 0.5
    sample(im, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5, mode, out.data, (y * nw + x) * 4);
  }
  return out;
}
export function flip(im: RGBA, horizontal: boolean): RGBA {
  const out = newRGBA(im.w, im.h);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const sx = horizontal ? im.w - 1 - x : x, sy = horizontal ? y : im.h - 1 - y;
    const i = (sy * im.w + sx) * 4, o = (y * im.w + x) * 4;
    out.data[o] = im.data[i]; out.data[o + 1] = im.data[i + 1]; out.data[o + 2] = im.data[i + 2]; out.data[o + 3] = 255;
  }
  return out;
}
export function crop(im: RGBA, x0: number, y0: number, w: number, h: number): RGBA {
  const out = newRGBA(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(im.w - 1, Math.max(0, x0 + x)), sy = Math.min(im.h - 1, Math.max(0, y0 + y));
    const i = (sy * im.w + sx) * 4, o = (y * w + x) * 4;
    out.data[o] = im.data[i]; out.data[o + 1] = im.data[i + 1]; out.data[o + 2] = im.data[i + 2]; out.data[o + 3] = 255;
  }
  return out;
}

/* ======================= 5. Komşuluk işlemleri ======================= */

/** 2B KONVOLÜSYON (çekirdek 180° çevrilir). Kenarlar: yansıtmalı (reflect) dolgu. */
export function convolve(im: RGBA, k: number[], ks: number, correlation = false): RGBA {
  const { w, h, data } = im, r = (ks - 1) / 2, out = newRGBA(w, h);
  const kk = correlation ? k : [...k].reverse(); // konvolüsyon = çevrilmiş çekirdekle korelasyon
  const refl = (v: number, n: number) => (v < 0 ? -v - 1 : v >= n ? 2 * n - v - 1 : v);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s0 = 0, s1 = 0, s2 = 0;
    for (let j = -r; j <= r; j++) {
      const yy = refl(y + j, h);
      for (let i = -r; i <= r; i++) {
        const wv = kk[(j + r) * ks + (i + r)], p = (yy * w + refl(x + i, w)) * 4;
        s0 += wv * data[p]; s1 += wv * data[p + 1]; s2 += wv * data[p + 2];
      }
    }
    const o = (y * w + x) * 4;
    out.data[o] = s0; out.data[o + 1] = s1; out.data[o + 2] = s2; out.data[o + 3] = 255;
  }
  return out;
}
export const meanKernel = (n: number) => Array(n * n).fill(1 / (n * n));
export function gaussianKernel(n: number, sigma: number): number[] {
  const r = (n - 1) / 2, k: number[] = [];
  let s = 0;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const v = Math.exp(-(x * x + y * y) / (2 * sigma * sigma)); k.push(v); s += v; }
  return k.map((v) => v / s);
}
export const SHARPEN = [0, -1, 0, -1, 5, -1, 0, -1, 0];
/** Medyan filtre (doğrusal olmayan): tuz-biber gürültüsünde en etkili */
export function median(im: RGBA, n: number): RGBA {
  const { w, h, data } = im, r = (n - 1) / 2, out = newRGBA(w, h), buf = [[], [], []] as number[][];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    buf[0].length = buf[1].length = buf[2].length = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const p = (Math.min(h - 1, Math.max(0, y + j)) * w + Math.min(w - 1, Math.max(0, x + i))) * 4;
      buf[0].push(data[p]); buf[1].push(data[p + 1]); buf[2].push(data[p + 2]);
    }
    const o = (y * w + x) * 4, m = (n * n - 1) / 2;
    for (let c = 0; c < 3; c++) { buf[c].sort((a, b) => a - b); out.data[o + c] = buf[c][m]; }
    out.data[o + 3] = 255;
  }
  return out;
}
export function saltPepper(im: RGBA, p: number, seed = 7): RGBA {
  const out = cloneRGBA(im);
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < out.data.length; i += 4) {
    const r = rnd();
    if (r < p / 2) out.data[i] = out.data[i + 1] = out.data[i + 2] = 0;
    else if (r < p) out.data[i] = out.data[i + 1] = out.data[i + 2] = 255;
  }
  return out;
}
/** Sobel / Prewitt gradyan büyüklüğü |G| = sqrt(Gx² + Gy²) */
export function gradient(g: Gray, op: "sobel" | "prewitt"): Gray {
  const kx = op === "sobel" ? [-1, 0, 1, -2, 0, 2, -1, 0, 1] : [-1, 0, 1, -1, 0, 1, -1, 0, 1];
  const ky = op === "sobel" ? [-1, -2, -1, 0, 0, 0, 1, 2, 1] : [-1, -1, -1, 0, 0, 0, 1, 1, 1];
  const { w, h, data } = g, out = new Uint8ClampedArray(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let gx = 0, gy = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const v = data[(y + j) * w + x + i], k = (j + 1) * 3 + (i + 1);
      gx += kx[k] * v; gy += ky[k] * v;
    }
    out[y * w + x] = Math.hypot(gx, gy) / (op === "sobel" ? 4 : 3);
  }
  return { w, h, data: out };
}

/* ======================= 6. İntegral görüntü (Viola-Jones) ======================= */

/** ii(x,y) = Σ_{x'≤x, y'≤y} i(x',y')  — tek geçişte hesaplanır */
export function integralImage(g: Gray): Float64Array {
  const { w, h, data } = g, ii = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) { row += data[(y - 1) * w + (x - 1)]; ii[y * (w + 1) + x] = ii[(y - 1) * (w + 1) + x] + row; }
  }
  return ii;
}
/** Herhangi bir dikdörtgenin toplamı 4 okuma ile: D − B − C + A */
export function rectSum(ii: Float64Array, w: number, x: number, y: number, rw: number, rh: number): number {
  const W = w + 1;
  return ii[(y + rh) * W + (x + rw)] - ii[y * W + (x + rw)] - ii[(y + rh) * W + x] + ii[y * W + x];
}

/* ======================= 7. Ölçüm ======================= */

export function mse(a: RGBA, b: RGBA): number {
  let s = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) { const d = a.data[i + c] - b.data[i + c]; s += d * d; n++; }
  return s / n;
}
export const psnr = (a: RGBA, b: RGBA) => { const m = mse(a, b); return m === 0 ? Infinity : 10 * Math.log10((255 * 255) / m); };
export function meanStd(g: Gray) {
  let s = 0; for (let i = 0; i < g.data.length; i++) s += g.data[i];
  const m = s / g.data.length; let v = 0;
  for (let i = 0; i < g.data.length; i++) v += (g.data[i] - m) ** 2;
  return { mean: m, std: Math.sqrt(v / g.data.length) };
}
export function entropy(h: Uint32Array): number {
  let n = 0; for (let i = 0; i < 256; i++) n += h[i];
  let e = 0; for (let i = 0; i < 256; i++) if (h[i]) { const p = h[i] / n; e -= p * Math.log2(p); }
  return e;
}

/* ======================= Canvas yardımcıları ======================= */

export function fromImageElement(el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, maxSide = 960): RGBA {
  const sw = el instanceof HTMLVideoElement ? el.videoWidth : el instanceof HTMLImageElement ? el.naturalWidth : el.width;
  const sh = el instanceof HTMLVideoElement ? el.videoHeight : el instanceof HTMLImageElement ? el.naturalHeight : el.height;
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.round(sw * s), h = Math.round(sh * s);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(el, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { w, h, data: d.data };
}
export function drawToCanvas(c: HTMLCanvasElement | null, im: RGBA | Gray | null) {
  if (!c || !im) return;
  const rgba = im.data.length === im.w * im.h ? grayToRGBA(im as Gray) : (im as RGBA);
  c.width = rgba.w; c.height = rgba.h;
  const ctx = c.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), rgba.w, rgba.h), 0, 0);
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Görüntü yüklenemedi: " + src));
    im.src = src;
  });
}

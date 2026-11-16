import { RGBA, brightnessContrast, histEqualize, claheRGB, ALPHA, BETA, CLAHE_CLIP, CLAHE_TILES } from "./imgproc";
import { claheOpenCV } from "./detectors";
import { EnhKey } from "./data";

export type PipelineOpts = {
  bc: { on: boolean; alpha: number; beta: number };
  he: { on: boolean };
  clahe: { on: boolean; clip: number; tiles: number; impl: "opencv" | "manual" };
};
export const DEFAULT_PIPELINE: PipelineOpts = {
  bc: { on: false, alpha: ALPHA, beta: BETA },
  he: { on: false },
  clahe: { on: false, clip: CLAHE_CLIP, tiles: CLAHE_TILES, impl: "opencv" },
};
/** Deneydeki dört koşulun ön işleme ayarları (tek işlem, sabit parametre). */
export function presetFor(k: EnhKey): PipelineOpts {
  return {
    bc: { ...DEFAULT_PIPELINE.bc, on: k === "brightness_contrast" },
    he: { on: k === "hist_eq" },
    clahe: { ...DEFAULT_PIPELINE.clahe, on: k === "clahe" },
  };
}
export type Stage = { key: string; title: string; detail: string; im: RGBA; ms: number };

/** Sıra: Parlaklık/Kontrast → Histogram Eşitleme → CLAHE. Her adımın ara çıktısı döndürülür. */
export async function runPipeline(src: RGBA, o: PipelineOpts): Promise<Stage[]> {
  const stages: Stage[] = [{ key: "src", title: "Giriş", detail: `${src.w}×${src.h}`, im: src, ms: 0 }];
  let cur = src;
  const step = async (key: string, title: string, detail: string, fn: () => RGBA | Promise<RGBA>) => {
    const t = performance.now();
    cur = await fn();
    stages.push({ key, title, detail, im: cur, ms: performance.now() - t });
  };
  if (o.bc.on) await step("bc", "Parlaklık / Kontrast", `g = ${o.bc.alpha.toFixed(2)}·f ${o.bc.beta >= 0 ? "+" : "−"} ${Math.abs(o.bc.beta)}`, () => brightnessContrast(cur, o.bc.alpha, o.bc.beta));
  if (o.he.on) await step("he", "Histogram Eşitleme", "elle yazıldı · Y kanalı", () => histEqualize(cur));
  if (o.clahe.on) await step("clahe", "CLAHE", `clip=${o.clahe.clip} · ${o.clahe.tiles}×${o.clahe.tiles} · ${o.clahe.impl === "opencv" ? "OpenCV" : "elle"}`,
    () => (o.clahe.impl === "opencv" ? claheOpenCV(cur, o.clahe.clip, o.clahe.tiles) : claheRGB(cur, o.clahe.clip, o.clahe.tiles)));
  return stages;
}

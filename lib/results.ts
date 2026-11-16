import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* Sunucu tarafı (derleme zamanı): Python deneylerinin çıktısı results/results.json */
export type SummaryRow = {
  detector: string; enhancement: string; condition?: string; images: number; gt: number; pred: number;
  tp: number; fp: number; fn: number; precision: number; recall: number; f1: number; mae: number;
  mean_inference_ms: number; mean_end_to_end_ms: number;
};
export type PerImageRow = {
  image: string; condition: string; enhancement: string; detector: string; gt_count: number; pred_count: number;
  tp: number; fp: number; fn: number; precision: number; recall: number; f1: number; abs_count_error: number;
  inference_ms: number; end_to_end_ms: number; boxes: number[][]; scores: number[];
};
export type Results = {
  generated: string; machine: string; iou_threshold: number; timing_note: string;
  enhancement_params: Record<string, unknown>; detectors: Record<string, Record<string, unknown>>;
  summary: SummaryRow[]; summary_by_condition: SummaryRow[]; per_image: PerImageRow[];
  quality: { image: string; condition: string; enhancement: string; mean: number; std: number; entropy: number }[];
};

export function readResults(): Results | null {
  const p = join(process.cwd(), "results", "results.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

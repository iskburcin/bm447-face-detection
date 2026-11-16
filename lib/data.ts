import { Box } from "./metrics";

export type DatasetItem = { file: string; condition: string; width: number; height: number; faces: Box[]; count: number; note?: string };
export type Dataset = { name: string; warning?: string; conditions: Record<string, string>; images: DatasetItem[] };

export const ENH_KEYS = ["original", "brightness_contrast", "hist_eq", "clahe"] as const;
export type EnhKey = (typeof ENH_KEYS)[number];
export const ENH_LABELS: Record<EnhKey, string> = {
  original: "Ham (orijinal)",
  brightness_contrast: "Parlaklık/Kontrast",
  hist_eq: "Histogram Eşitleme",
  clahe: "CLAHE",
};
export const DET_LABELS: Record<string, string> = { viola_jones: "Viola-Jones (Haar)", yolo: "YOLOv8n-face" };
export const COND_LABELS: Record<string, string> = { normal: "Normal ışık", low_light: "Düşük ışık", backlight: "Ters ışık" };

export async function fetchDataset(): Promise<Dataset> {
  const r = await fetch("/dataset/annotations.json");
  if (!r.ok) throw new Error("dataset/annotations.json bulunamadı");
  return r.json();
}

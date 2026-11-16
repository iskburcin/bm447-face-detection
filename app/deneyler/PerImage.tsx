"use client";
import { useState } from "react";
import { ENH_KEYS, ENH_LABELS, DET_LABELS, COND_LABELS, EnhKey } from "@/lib/data";

type Row = { image: string; condition: string; enhancement: string; detector: string; gt_count: number; pred_count: number; tp: number; fp: number; fn: number; f1: number; abs_count_error: number; inference_ms: number; end_to_end_ms: number };

export default function PerImage({ rows }: { rows: Row[] }) {
  const [det, setDet] = useState("viola_jones");
  const [enh, setEnh] = useState<EnhKey | "all">("all");
  const shown = rows.filter((r) => r.detector === det && (enh === "all" || r.enhancement === enh));
  return (
    <div className="stack">
      <div className="row">
        <div className="seg">{Object.entries(DET_LABELS).map(([k, l]) => <button key={k} aria-pressed={det === k} onClick={() => setDet(k)}>{l}</button>)}</div>
        <div className="seg">
          <button aria-pressed={enh === "all"} onClick={() => setEnh("all")}>Tümü</button>
          {ENH_KEYS.map((k) => <button key={k} aria-pressed={enh === k} onClick={() => setEnh(k)}>{ENH_LABELS[k]}</button>)}
        </div>
      </div>
      <div className="table-wrap" style={{ maxHeight: 480 }}>
        <table>
          <thead><tr><th className="l">Görüntü</th><th className="l">Koşul</th><th className="l">Ön işleme</th><th>GT</th><th>Tahmin</th><th>TP</th><th>FP</th><th>FN</th><th>F1</th><th>|hata|</th><th>Çıkarım ms</th><th>Uçtan uca ms</th></tr></thead>
          <tbody>{shown.map((r, i) => (
            <tr key={i}>
              <td className="l">{r.image.replace("images/", "")}</td><td className="l">{COND_LABELS[r.condition]}</td><td className="l">{ENH_LABELS[r.enhancement as EnhKey]}</td>
              <td>{r.gt_count}</td><td>{r.pred_count}</td><td>{r.tp}</td><td style={{ color: r.fp ? "var(--err)" : undefined }}>{r.fp}</td>
              <td style={{ color: r.fn ? "var(--err)" : undefined }}>{r.fn}</td><td>{r.f1.toFixed(2)}</td><td>{r.abs_count_error}</td>
              <td>{r.inference_ms.toFixed(1)}</td><td>{r.end_to_end_ms.toFixed(1)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

"use client";
import { BASE } from "@/lib/base";
import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import { RGBA, fromImageElement, loadImage } from "@/lib/imgproc";
import { detectHaar, detectYolo } from "@/lib/detectors";
import { runPipeline, presetFor } from "@/lib/pipeline";
import { Dataset, ENH_KEYS, ENH_LABELS, DET_LABELS, fetchDataset } from "@/lib/data";
import { Box, match, prf } from "@/lib/metrics";
import type { SummaryRow } from "@/lib/results";

type Agg = { detector: string; enhancement: string; tp: number; fp: number; fn: number; err: number; n: number; inf: number; e2e: number };

export default function BrowserBenchmark({ python }: { python: SummaryRow[] }) {
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState(0);
  const [msg, setMsg] = useState("");
  const [agg, setAgg] = useState<Agg[] | null>(null);
  const [custom, setCustom] = useState<{ ds: Dataset; files: Map<string, File> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = async (fl: FileList | null) => {
    if (!fl) return;
    const files = new Map<string, File>();
    let ann: Dataset | null = null;
    for (const f of Array.from(fl)) {
      if (f.name.toLowerCase().endsWith(".json")) ann = JSON.parse(await f.text());
      else files.set(f.name, f);
    }
    if (!ann) { setMsg("annotations.json seçilmedi."); return; }
    setCustom({ ds: ann, files });
    setMsg(`Özel veri kümesi: ${ann.images.length} kayıt, ${files.size} görüntü dosyası.`);
  };

  const run = async () => {
    setRunning(true); setAgg(null); setProg(0);
    try {
      const ds = custom?.ds ?? (await fetchDataset());
      const a: Agg[] = [];
      for (const d of ["viola_jones", "yolo"]) for (const e of ENH_KEYS) a.push({ detector: d, enhancement: e, tp: 0, fp: 0, fn: 0, err: 0, n: 0, inf: 0, e2e: 0 });
      const total = ds.images.length * ENH_KEYS.length * 2;
      let done = 0;
      for (const it of ds.images) {
        let img: HTMLImageElement;
        if (custom) {
          const f = custom.files.get(it.file.split("/").pop()!);
          if (!f) { setMsg(`Eksik dosya: ${it.file}`); continue; }
          const u = URL.createObjectURL(f); img = await loadImage(u); URL.revokeObjectURL(u);
        } else img = await loadImage(BASE + "/dataset/" + it.file);
        const src: RGBA = fromImageElement(img, 8192);
        for (const e of ENH_KEYS) {
          for (const d of ["viola_jones", "yolo"]) {
            const t0 = performance.now();
            const st = await runPipeline(src, presetFor(e));
            const im = st[st.length - 1].im;
            const r = d === "yolo" ? await detectYolo(im) : await detectHaar(im);
            const e2e = performance.now() - t0;
            const m = match(r.boxes, it.faces as Box[]);
            const row = a.find((x) => x.detector === d && x.enhancement === e)!;
            row.tp += m.tp; row.fp += m.fp; row.fn += m.fn; row.err += Math.abs(r.boxes.length - it.faces.length); row.n++;
            row.inf += r.inferenceMs; row.e2e += e2e;
            done++; setProg(done / total); setMsg(`${it.file} · ${ENH_LABELS[e]} · ${DET_LABELS[d]}`);
          }
        }
      }
      setAgg(a); setMsg("Tamamlandı.");
    } catch (err) { setMsg("Hata: " + err); }
    setRunning(false);
  };

  return (
    <div className="card stack">
      <p style={{ color: "var(--text)" }}>
        Tüm deney (görüntü × 4 ön işleme × 2 dedektör) bu tarayıcıda OpenCV.js ve ONNX Runtime Web ile yeniden çalıştırılır ve
        Python sonuçlarıyla yan yana gösterilir. İsterseniz kendi veri kümenizi (görüntüler + Etiketleme aracından indirilen <code>annotations.json</code>) seçebilirsiniz.
      </p>
      <div className="row">
        <button className="btn btn--accent" onClick={run} disabled={running}>{running ? <><span className="spin" /> Çalışıyor</> : <><Icon name="play" size={15} /> {custom ? "Özel veri kümesiyle çalıştır" : "Demo veri kümesiyle çalıştır"}</>}</button>
        <button className="btn btn--sm" onClick={() => fileRef.current?.click()} disabled={running}><Icon name="upload" size={14} /> Kendi veri kümem (çoklu seçim)</button>
        {custom && <button className="btn btn--sm" onClick={() => { setCustom(null); setMsg(""); }}>Demo kümeye dön</button>}
        <input ref={fileRef} type="file" multiple accept="image/*,.json" hidden onChange={(e) => onFiles(e.target.files)} />
      </div>
      {(running || prog > 0) && <div className="progress"><i style={{ width: `${prog * 100}%` }} /></div>}
      {msg && <span className="small muted">{msg}</span>}
      {agg && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Dedektör</th><th className="l">Ön işleme</th><th>TP</th><th>FP</th><th>FN</th><th>F1 (tarayıcı)</th><th>F1 (Python)</th><th>MAE</th><th>Çıkarım ms</th><th>Uçtan uca ms</th></tr></thead>
            <tbody>{agg.map((r) => {
              const m = prf(r.tp, r.fp, r.fn);
              const py = custom ? undefined : python.find((p) => p.detector === r.detector && p.enhancement === r.enhancement);
              return (
                <tr key={r.detector + r.enhancement}>
                  <td>{DET_LABELS[r.detector]}</td><td className="l">{ENH_LABELS[r.enhancement as keyof typeof ENH_LABELS]}</td>
                  <td>{r.tp}</td><td>{r.fp}</td><td>{r.fn}</td><td><b>{m.f1.toFixed(3)}</b></td><td>{py ? py.f1.toFixed(3) : "–"}</td>
                  <td>{(r.err / r.n).toFixed(2)}</td><td>{(r.inf / r.n).toFixed(1)}</td><td>{(r.e2e / r.n).toFixed(1)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <span className="small muted">Küçük farklar beklenir: tarayıcıdaki JPEG çözücü ve letterbox yeniden boyutlandırması OpenCV'ninkinden birkaç gri seviye farklı olabilir; süreler WASM tek iş parçacığıyla ölçülür.</span>
    </div>
  );
}

import { BASE } from "@/lib/base";
import type { Metadata } from "next";
import { readResults, SummaryRow } from "@/lib/results";
import { ENH_KEYS, ENH_LABELS, DET_LABELS, COND_LABELS } from "@/lib/data";
import BrowserBenchmark from "./BrowserBenchmark";
import PerImage from "./PerImage";

export const metadata: Metadata = { title: "Deneyler" };

const pct = (v: number) => (v * 100).toFixed(1);

function SummaryTable({ rows, showCond }: { rows: SummaryRow[]; showCond?: boolean }) {
  const bestF1 = Math.max(...rows.map((r) => r.f1));
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>
          <th>Dedektör</th>{showCond && <th className="l">Koşul</th>}<th className="l">Ön işleme</th>
          <th>GT</th><th>Tahmin</th><th>TP</th><th>FP</th><th>FN</th><th>Precision</th><th>Recall</th><th>F1</th><th className="l">F1</th><th>MAE</th><th>Çıkarım (ms)</th><th>Uçtan uca (ms)</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{DET_LABELS[r.detector]}</td>{showCond && <td className="l">{COND_LABELS[r.condition!]}</td>}
              <td className="l">{ENH_LABELS[r.enhancement as keyof typeof ENH_LABELS]}</td>
              <td>{r.gt}</td><td>{r.pred}</td><td>{r.tp}</td><td>{r.fp}</td><td>{r.fn}</td>
              <td>{pct(r.precision)}%</td><td>{pct(r.recall)}%</td>
              <td className={!showCond && r.f1 === bestF1 ? "best" : ""}>{r.f1.toFixed(3)}</td>
              <td className="l"><div className="bar"><i style={{ width: `${r.f1 * 100}%`, background: r.detector === "yolo" ? "var(--yolo)" : "var(--haar)" }} /></div></td>
              <td>{r.mae.toFixed(2)}</td><td>{r.mean_inference_ms.toFixed(1)}</td><td>{r.mean_end_to_end_ms.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Page() {
  const res = readResults();
  if (!res) return <div className="card">results/results.json bulunamadı. Önce <code>python python/run_experiments.py</code> çalıştırın.</div>;
  const conds = Array.from(new Set(res.summary_by_condition.map((r) => r.condition!)));
  const byCond = conds.flatMap((c) => res.summary_by_condition.filter((r) => r.condition === c));
  const q = (e: string, c: string) => {
    const xs = res.quality.filter((x) => x.enhancement === e && x.condition === c);
    return { mean: xs.reduce((s, x) => s + x.mean, 0) / xs.length, std: xs.reduce((s, x) => s + x.std, 0) / xs.length, ent: xs.reduce((s, x) => s + x.entropy, 0) / xs.length };
  };
  const det = res.detectors as Record<string, Record<string, unknown>>;

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Kontrollü karşılaştırma</span>
        <h1>Deney sonuçları</h1>
        <p>
          Aynı {new Set(res.per_image.map((r) => r.image)).size} görüntü, aynı referans kutular ve <b>sabit</b> dedektör ayarlarıyla
          2 dedektör × 4 ön işleme. Eşleştirme IoU ≥ {res.iou_threshold}. Sonuçlar Python hattından (<code>python/run_experiments.py</code>)
          gelir; aşağıdan aynı deneyi tarayıcıda da tekrar çalıştırabilirsiniz.
        </p>
      </div>

      <div className="note note--warn" style={{ marginBottom: 16 }}>
        <b>Not:</b> Şu anki veri kümesi, hattı test etmek için kamu malı NASA portresinden üretilmiş <b>sentetik demo</b> kümesidir.
        Teslimde grup üyelerinin onaylı fotoğrafları ve Etiketleme aracıyla çizilen kutularla değiştirilip deney yeniden çalıştırılmalıdır.
      </div>

      <div className="section-title"><span className="num">1</span><h2>Genel özet (tüm veri kümesi)</h2></div>
      <SummaryTable rows={res.summary} />
      <p className="small muted" style={{ marginTop: 8 }}>{res.timing_note} Makine: {res.machine}. Üretim: {res.generated}.</p>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card"><img src={BASE + "/results/figures/bar_f1.png"} alt="F1 çubuk grafiği" /></div>
        <div className="card"><img src={BASE + "/results/figures/bar_mae.png"} alt="MAE çubuk grafiği" /></div>
        <div className="card"><img src={BASE + "/results/figures/bar_recall.png"} alt="Recall çubuk grafiği" /></div>
        <div className="card"><img src={BASE + "/results/figures/bar_precision.png"} alt="Precision çubuk grafiği" /></div>
      </div>

      <div className="section-title"><span className="num">2</span><h2>Koşul × ön işleme</h2></div>
      <div className="card" style={{ marginBottom: 16 }}><img src={BASE + "/results/figures/heatmap_f1.png"} alt="F1 ısı haritası" /></div>
      <SummaryTable rows={byCond} showCond />

      <div className="section-title"><span className="num">3</span><h2>Görsel olarak daha iyi = daha iyi tespit mi?</h2></div>
      <div className="grid-2">
        <div className="card stack">
          <p style={{ color: "var(--text)" }}>
            Aşağıdaki tablo her ön işlemin görüntü istatistiğini (ortalama parlaklık μ, kontrast σ, entropi H) gösterir.
            HE en yüksek σ'yı üretir ve görüntüyü insan gözüne “en net” gösterir; ancak Viola-Jones için en iyi sonuç CLAHE'dedir ve
            normal ışıkta HE/CLAHE yanlış pozitif ekler. YOLO'nun F1'i ise ön işlemeden bağımsız kalır.
          </p>
          <div className="table-wrap"><table>
            <thead><tr><th className="l">Koşul</th><th className="l">Ön işleme</th><th>μ</th><th>σ</th><th>H (bit)</th><th>F1 VJ</th><th>F1 YOLO</th></tr></thead>
            <tbody>{conds.flatMap((c) => ENH_KEYS.map((e) => {
              const qq = q(e, c);
              const f = (d: string) => res.summary_by_condition.find((r) => r.detector === d && r.enhancement === e && r.condition === c)?.f1 ?? 0;
              return <tr key={c + e}><td className="l">{COND_LABELS[c]}</td><td className="l">{ENH_LABELS[e]}</td><td>{qq.mean.toFixed(1)}</td><td>{qq.std.toFixed(1)}</td><td>{qq.ent.toFixed(2)}</td><td>{f("viola_jones").toFixed(2)}</td><td>{f("yolo").toFixed(2)}</td></tr>;
            }))}</tbody>
          </table></div>
        </div>
        <div className="card stack">
          <img src={BASE + "/results/figures/entropy_vs_f1.png"} alt="Entropi ve F1 ilişkisi" />
          <img src={BASE + "/results/figures/histograms_lowlight.png"} alt="Düşük ışık histogramları" />
        </div>
      </div>

      <div className="section-title"><span className="num">4</span><h2>Örnek çıktılar</h2></div>
      <div className="stack">
        {["examples_normal_03.png", "examples_lowlight_05.png", "examples_backlight_05.png"].map((f) => (
          <div key={f} className="card"><img src={`${BASE}/results/figures/${f}`} alt={f} /></div>
        ))}
      </div>

      <div className="section-title"><span className="num">5</span><h2>Görüntü bazında sonuçlar</h2></div>
      <PerImage rows={res.per_image.map(({ boxes: _b, scores: _s, ...r }) => r)} />

      <div className="section-title"><span className="num">6</span><h2>Model ve deney ayarları</h2></div>
      <div className="grid-3">
        {Object.entries(det).map(([k, v]) => (
          <div key={k} className="card"><h4>{DET_LABELS[k]}</h4>
            <ul className="small" style={{ paddingLeft: 18, marginTop: 8 }}>{Object.entries(v).filter(([kk]) => kk !== "label").map(([kk, vv]) => <li key={kk}><b>{kk}</b>: {Array.isArray(vv) ? vv.join("×") : String(vv)}</li>)}</ul>
          </div>
        ))}
        <div className="card"><h4>Ön işleme</h4>
          <ul className="small" style={{ paddingLeft: 18, marginTop: 8 }}>{Object.entries(res.enhancement_params).map(([k, v]) => <li key={k}><b>{k}</b>: {Array.isArray(v) ? v.join("×") : String(v)}</li>)}</ul>
        </div>
      </div>

      <div className="section-title"><span className="num">7</span><h2>Deneyi tarayıcıda tekrar çalıştır</h2></div>
      <BrowserBenchmark python={res.summary} />
    </>
  );
}

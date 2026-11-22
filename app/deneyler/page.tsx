import { BASE } from "@/lib/base";
import type { Metadata } from "next";
import { readResults, SummaryRow } from "@/lib/results";
import { ENH_KEYS, ENH_LABELS, DET_LABELS, COND_LABELS, ENH_EN, COND_EN, EnhKey } from "@/lib/data";
import { T } from "@/components/I18n";

const EN_VALUES: Record<string, string> = {
  "gri (0.2989R+0.5870G+0.1140B)": "grayscale (0.2989R+0.5870G+0.1140B)",
  "elle yazıldı (CDF eşleme, Y kanalı)": "hand-written (CDF mapping, Y channel)",
};
const val = (v: unknown) => { const s = Array.isArray(v) ? v.join("×") : String(v); return EN_VALUES[s] ? <T tr={s} en={EN_VALUES[s]} /> : s; };
import BrowserBenchmark from "./BrowserBenchmark";
import PerImage from "./PerImage";

export const metadata: Metadata = { title: "Deneyler · Experiments" };

const pct = (v: number) => (v * 100).toFixed(1);

function SummaryTable({ rows, showCond }: { rows: SummaryRow[]; showCond?: boolean }) {
  const bestF1 = Math.max(...rows.map((r) => r.f1));
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>
          <th><T tr="Dedektör" en="Detector" /></th>{showCond && <th className="l"><T tr="Koşul" en="Condition" /></th>}<th className="l"><T tr="Ön işleme" en="Preprocessing" /></th>
          <th>GT</th><th><T tr="Tahmin" en="Pred." /></th><th>TP</th><th>FP</th><th>FN</th><th>Precision</th><th>Recall</th><th>F1</th><th className="l">F1</th><th>MAE</th><th><T tr="Çıkarım (ms)" en="Inference (ms)" /></th><th><T tr="Uçtan uca (ms)" en="End-to-end (ms)" /></th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{DET_LABELS[r.detector]}</td>{showCond && <td className="l"><T tr={COND_LABELS[r.condition!]} en={COND_EN[r.condition!]} /></td>}
              <td className="l"><T tr={ENH_LABELS[r.enhancement as EnhKey]} en={ENH_EN[r.enhancement as EnhKey]} /></td>
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
  if (!res) return <div className="card"><T tr="results/results.json bulunamadı. Önce python/run_experiments.py çalıştırın." en="results/results.json not found. Run python/run_experiments.py first." /></div>;
  const conds = Array.from(new Set(res.summary_by_condition.map((r) => r.condition!)));
  const byCond = conds.flatMap((c) => res.summary_by_condition.filter((r) => r.condition === c));
  const q = (e: string, c: string) => {
    const xs = res.quality.filter((x) => x.enhancement === e && x.condition === c);
    return { mean: xs.reduce((s, x) => s + x.mean, 0) / xs.length, std: xs.reduce((s, x) => s + x.std, 0) / xs.length, ent: xs.reduce((s, x) => s + x.entropy, 0) / xs.length };
  };
  const det = res.detectors as Record<string, Record<string, unknown>>;
  const nImg = new Set(res.per_image.map((r) => r.image)).size;

  return (
    <>
      <div className="page-head">
        <span className="eyebrow"><T tr="Kontrollü karşılaştırma" en="Controlled comparison" /></span>
        <h1><T tr="Deney sonuçları" en="Experiment results" /></h1>
        <p>
          <T
            tr={<>Aynı {nImg} görüntü, aynı referans kutular ve <b>sabit</b> dedektör ayarlarıyla 2 dedektör × 4 ön işleme. Eşleştirme IoU ≥ {res.iou_threshold}. Sonuçlar Python hattından (<code>python/run_experiments.py</code>) gelir; aşağıdan aynı deneyi tarayıcıda da tekrar çalıştırabilirsiniz.</>}
            en={<>Same {nImg} images, same ground-truth boxes and <b>fixed</b> detector settings: 2 detectors × 4 preprocessing variants. Matching at IoU ≥ {res.iou_threshold}. Results come from the Python pipeline (<code>python/run_experiments.py</code>); you can rerun the exact same experiment in your browser below.</>}
          />
        </p>
      </div>

      <div className="note note--warn" style={{ marginBottom: 16 }}>
        <T
          tr={<><b>Veri kümesi:</b> grup üyelerinin onaylı {nImg / 3} fotoğrafı; her biri normal, <b>düşük ışık</b> ve <b>ters ışık</b> olmak üzere 3 koşulda. Düşük ışık ve ters ışık sürümleri ayrı çekimler değil, aynı fotoğraftan kontrollü olarak türetildi (gama, kazanç, gürültü / kişi maskesi + aşırı pozlanmış arka plan); böylece aynı yüzler üç koşulda karşılaştırılabiliyor.</>}
          en={<><b>Dataset:</b> {nImg / 3} consented photos of the group members, each in 3 conditions: normal, <b>low light</b> and <b>backlight</b>. The low-light and backlit versions are not separate shots but controlled derivations of the same photo (gamma, gain, noise / person mask + over-exposed background), so the same faces can be compared across the three conditions.</>}
        />
      </div>

      <div className="section-title"><span className="num">1</span><h2><T tr="Genel özet (tüm veri kümesi)" en="Overall summary (whole dataset)" /></h2></div>
      <SummaryTable rows={res.summary} />
      <p className="small muted" style={{ marginTop: 8 }}><T tr={res.timing_note} en="inference_ms: detector call only; end_to_end_ms: preprocessing + inference + post-processing. CPU, after warm-up." /> <T tr="Makine" en="Machine" />: {res.machine}. <T tr="Üretim" en="Generated" />: {res.generated}.</p>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card"><img src={BASE + "/results/figures/bar_f1.png"} alt="F1 bar chart" /></div>
        <div className="card"><img src={BASE + "/results/figures/bar_mae.png"} alt="MAE bar chart" /></div>
        <div className="card"><img src={BASE + "/results/figures/bar_recall.png"} alt="Recall bar chart" /></div>
        <div className="card"><img src={BASE + "/results/figures/bar_precision.png"} alt="Precision bar chart" /></div>
      </div>

      <div className="section-title"><span className="num">2</span><h2><T tr="Koşul × ön işleme" en="Condition × preprocessing" /></h2></div>
      <div className="card" style={{ marginBottom: 16 }}><img src={BASE + "/results/figures/heatmap_f1.png"} alt="F1 heatmap" /></div>
      <SummaryTable rows={byCond} showCond />

      <div className="section-title"><span className="num">3</span><h2><T tr="Görsel olarak daha iyi = daha iyi tespit mi?" en="Looks better = detects better?" /></h2></div>
      <div className="grid-2">
        <div className="card stack">
          <p style={{ color: "var(--text)" }}>
            <T
              tr="Aşağıdaki tablo her ön işlemin görüntü istatistiğini (ortalama parlaklık μ, kontrast σ, entropi H) ve F1'i gösterir. Düşük ışıkta HE/CLAHE görüntüyü açıp Viola-Jones'un bulduğu yüz sayısını belirgin biçimde artırıyor. Ama normal ışıkta aynı işlemler Viola-Jones'u kötüleştiriyor; ters ışıkta görüntüyü gözle en çok açan global HE ise iki dedektörün de F1'ini düşürüyor, yerel çalışan CLAHE ikisini de iyileştiriyor. YOLO'nun F1'i tüm koşullarda dar bir aralıkta kalıyor."
              en="The table shows each variant's image statistics (mean brightness μ, contrast σ, entropy H) next to F1. In low light HE/CLAHE brighten the image and clearly increase the faces Viola-Jones finds. But in normal light the same operations make Viola-Jones worse, and in backlight global HE — which visibly opens up the image most — lowers F1 for both detectors, while locally operating CLAHE improves both. YOLO's F1 stays within a narrow range in every condition."
            />
          </p>
          <div className="table-wrap"><table>
            <thead><tr><th className="l"><T tr="Koşul" en="Condition" /></th><th className="l"><T tr="Ön işleme" en="Preprocessing" /></th><th>μ</th><th>σ</th><th>H (bit)</th><th>F1 VJ</th><th>F1 YOLO</th></tr></thead>
            <tbody>{conds.flatMap((c) => ENH_KEYS.map((e) => {
              const qq = q(e, c);
              const f = (d: string) => res.summary_by_condition.find((r) => r.detector === d && r.enhancement === e && r.condition === c)?.f1 ?? 0;
              return <tr key={c + e}><td className="l"><T tr={COND_LABELS[c]} en={COND_EN[c]} /></td><td className="l"><T tr={ENH_LABELS[e]} en={ENH_EN[e]} /></td><td>{qq.mean.toFixed(1)}</td><td>{qq.std.toFixed(1)}</td><td>{qq.ent.toFixed(2)}</td><td>{f("viola_jones").toFixed(2)}</td><td>{f("yolo").toFixed(2)}</td></tr>;
            }))}</tbody>
          </table></div>
        </div>
        <div className="card stack">
          <img src={BASE + "/results/figures/entropy_vs_f1.png"} alt="Entropy vs F1" />
          <img src={BASE + "/results/figures/histograms_lowlight.png"} alt="Low-light histograms" />
        </div>
      </div>

      <div className="section-title"><span className="num">4</span><h2><T tr="Örnek çıktılar" en="Example outputs" /></h2></div>
      <div className="stack">
        {["examples_normal_03.png", "examples_lowlight_03.png", "examples_backlight_03.png"].map((f) => (
          <div key={f} className="card"><img src={`${BASE}/results/figures/${f}`} alt={f} /></div>
        ))}
      </div>

      <div className="section-title"><span className="num">5</span><h2><T tr="Görüntü bazında sonuçlar" en="Per-image results" /></h2></div>
      <PerImage rows={res.per_image.map(({ boxes: _b, scores: _s, ...r }) => r)} />

      <div className="section-title"><span className="num">6</span><h2><T tr="Model ve deney ayarları" en="Model & experiment settings" /></h2></div>
      <div className="grid-3">
        {Object.entries(det).map(([k, v]) => (
          <div key={k} className="card"><h4>{DET_LABELS[k]}</h4>
            <ul className="small" style={{ paddingLeft: 18, marginTop: 8 }}>{Object.entries(v).filter(([kk]) => kk !== "label").map(([kk, vv]) => <li key={kk}><b>{kk === "kaynak" ? <T tr="kaynak" en="source" /> : kk}</b>: {val(vv)}</li>)}</ul>
          </div>
        ))}
        <div className="card"><h4><T tr="Ön işleme" en="Preprocessing" /></h4>
          <ul className="small" style={{ paddingLeft: 18, marginTop: 8 }}>{Object.entries(res.enhancement_params).map(([k, v]) => <li key={k}><b>{k}</b>: {val(v)}</li>)}</ul>
        </div>
      </div>

      <div className="section-title"><span className="num">7</span><h2><T tr="Deneyi tarayıcıda tekrar çalıştır" en="Rerun the experiment in your browser" /></h2></div>
      <BrowserBenchmark python={res.summary} />
    </>
  );
}

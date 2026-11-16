import { BASE } from "@/lib/base";
import Link from "next/link";
import Icon from "@/components/Icon";
import { readResults } from "@/lib/results";

export default function Home() {
  const res = readResults();
  const s = (d: string, e: string) => res?.summary.find((r) => r.detector === d && r.enhancement === e);
  const vjRaw = s("viola_jones", "original"), vjClahe = s("viola_jones", "clahe"), yRaw = s("yolo", "original");
  const nImg = res ? new Set(res.per_image.map((r) => r.image)).size : 15;
  const nFace = vjRaw?.gt ?? 41;

  return (
    <>
      <section className="bento" aria-label="Proje özeti">
        <div className="tile tile--l tile--hero">
          <span className="hello">BM447 · Sayısal Görüntü İşleme Projesi</span>
          <h1>Zorlu ışıkta yüz tespiti ve kişi sayma</h1>
          <p style={{ maxWidth: "58ch", fontSize: "1.02rem" }}>
            Klasik <b>Viola-Jones (Haar Cascade)</b> ile <b>YOLOv8n-face</b> derin öğrenme modelini; normal, düşük ve ters ışıkta,
            ham / parlaklık-kontrast / histogram eşitleme / CLAHE ön işlemleriyle aynı veri ve sabit ayarlarla karşılaştırıyoruz.
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <Link className="btn btn--primary" href="/tespit"><Icon name="play" size={16} /> Canlı tespiti dene</Link>
            <Link className="btn" href="/laboratuvar"><Icon name="book" size={16} /> Adım adım ders</Link>
            <Link className="btn" href="/deneyler"><Icon name="chart" size={16} /> Sonuçlar</Link>
          </div>
          <div className="chips" style={{ marginTop: 10 }}>
            <span className="chip"><span className="dot" /> Tarayıcıda çalışır</span>
            <span className="chip">Next.js · OpenCV.js · ONNX Runtime Web</span>
            <span className="chip">Python/OpenCV deney hattı</span>
          </div>
        </div>

        <Link href="/deneyler" className="tile tile--img tile--w">
          <img src={BASE + "/results/figures/examples_lowlight_05.png"} alt="Düşük ışık örneğinde iki dedektörün dört ön işlemdeki sonuçları" />
          <span className="caption">Düşük ışık: ön işleme Viola-Jones'u kurtarıyor</span>
        </Link>

        <div className="tile">
          <span className="tile-icon"><Icon name="image" /></span>
          <span className="big-number">{nImg}</span>
          <span className="tile-title">görüntü · {nFace} yüz</span>
          <span className="tile-sub">3 koşul × 5 görüntü, her yüz için referans kutu</span>
        </div>

        <div className="tile tile--dark">
          <span className="tile-title">Viola-Jones recall</span>
          <span className="big-number">{vjRaw ? Math.round(vjRaw.recall * 100) : "–"}% → {vjClahe ? Math.round(vjClahe.recall * 100) : "–"}%</span>
          <span className="tile-sub">ham görüntü → CLAHE (tüm veri kümesi)</span>
          <span className="tile-sub tile-foot">YOLO ham görüntüde bile F1 = {yRaw?.f1.toFixed(2) ?? "–"}</span>
        </div>

        <div className="tile tile--w" style={{ background: "linear-gradient(140deg, color-mix(in srgb, var(--warm) 14%, var(--surface)), var(--surface) 70%)" }}>
          <span className="tile-title" style={{ fontFamily: "var(--font-display)", fontSize: "1.45rem" }}>
            Görsel olarak daha iyi görünen bir görüntü her zaman daha iyi tespit sağlar mı?
          </span>
          <p>
            <b>Hayır.</b> Histogram eşitleme ve CLAHE karanlık sahnelerde Viola-Jones'un kaçırdığı yüzleri geri kazandırırken,
            zaten iyi aydınlatılmış görüntülerde gürültüyü ve dokuyu da güçlendirip <b>yanlış pozitif</b> üretir. YOLO ise ön işlemeden
            neredeyse etkilenmez. Kanıtlar Deneyler sayfasında.
          </p>
          <Link href="/deneyler" className="btn btn--sm" style={{ alignSelf: "flex-start", marginTop: "auto" }}>Kanıtları gör <Icon name="arrow" size={14} /></Link>
        </div>

        <Link href="/laboratuvar" className="tile tile--t">
          <Icon name="arrow" className="tile-arrow" />
          <span className="tile-icon" style={{ background: "var(--warm)" }}><Icon name="book" /></span>
          <span className="tile-title">Ders Laboratuvarı</span>
          <span className="tile-sub">Hattın her adımı ders anlatır gibi: formül, neden, canlı önce/sonra.</span>
          <ol className="tile-sub" style={{ paddingLeft: 18, display: "grid", gap: 2 }}>
            <li>Piksel matrisi & örnekleme</li><li>RGB kanallar & gri dönüşüm</li><li>Geometrik dönüşümler & interpolasyon</li>
            <li>Parlaklık/kontrast, gama</li><li>Histogram, HE, CLAHE</li><li>Konvolüsyon & filtreler</li>
            <li>Sobel kenarları, eşikleme</li><li>İntegral görüntü & Haar özellikleri</li><li>YOLO: letterbox, NMS</li><li>IoU & metrikler</li>
          </ol>
        </Link>

        <Link href="/tespit" className="tile">
          <Icon name="arrow" className="tile-arrow" />
          <span className="tile-icon"><Icon name="camera" /></span>
          <span className="tile-title">Canlı Tespit</span>
          <span className="tile-sub">Dosya, kamera veya örnek görüntü; ön işleme zinciri + iki dedektör yan yana.</span>
        </Link>

        <Link href="/etiketleme" className="tile">
          <Icon name="arrow" className="tile-arrow" />
          <span className="tile-icon" style={{ background: "var(--ok)" }}><Icon name="pen" /></span>
          <span className="tile-title">Etiketleme aracı</span>
          <span className="tile-sub">Grup fotoğraflarında referans kutuları çiz, annotations.json indir.</span>
        </Link>

        <div className="tile tile--w">
          <span className="tile-title">İşlem hattı</span>
          <div className="flow">
            <span className="step">Görüntü</span><span className="arr">→</span>
            <span className="step">Ön işleme<br /><small className="muted">P/K · HE · CLAHE</small></span><span className="arr">→</span>
            <span className="step">Gri + Haar<br /><small className="muted">Viola-Jones</small></span>
            <span className="step">Letterbox + CNN<br /><small className="muted">YOLOv8n-face</small></span><span className="arr">→</span>
            <span className="step">IoU ≥ 0.5 eşleme</span><span className="arr">→</span>
            <span className="step">TP/FP/FN · F1 · MAE · süre</span>
          </div>
          <Link href="/yontem" className="btn btn--sm" style={{ alignSelf: "flex-start", marginTop: "auto" }}>Yöntem ve mimari <Icon name="arrow" size={14} /></Link>
        </div>

        <div className="tile">
          <span className="tile-icon" style={{ background: "var(--text)", color: "var(--bg)" }}><Icon name="shield" /></span>
          <span className="tile-title">Gizlilik & etik</span>
          <span className="tile-sub">Görüntüler tarayıcıdan çıkmaz. Yalnız yüz <b>tespiti</b> yapılır; yüz tanıma / kimlik etiketleme yoktur.</span>
        </div>
      </section>
    </>
  );
}

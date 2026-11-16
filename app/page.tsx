import { BASE } from "@/lib/base";
import Link from "next/link";
import Icon from "@/components/Icon";
import { T } from "@/components/I18n";
import { readResults } from "@/lib/results";

export default function Home() {
  const res = readResults();
  const s = (d: string, e: string) => res?.summary.find((r) => r.detector === d && r.enhancement === e);
  const vjRaw = s("viola_jones", "original"), vjClahe = s("viola_jones", "clahe"), yRaw = s("yolo", "original");
  const nImg = res ? new Set(res.per_image.map((r) => r.image)).size : 15;
  const nFace = vjRaw?.gt ?? 41;

  return (
    <section className="bento" aria-label="Overview">
      <div className="tile tile--l tile--hero">
        <span className="hello"><T tr="BM447 · Sayısal Görüntü İşleme Projesi" en="BM447 · Digital Image Processing Project" /></span>
        <h1><T tr="Zorlu ışıkta yüz tespiti ve kişi sayma" en="Face detection & people counting in challenging light" /></h1>
        <p style={{ maxWidth: "58ch", fontSize: "1.02rem" }}>
          <T
            tr={<>Klasik <b>Viola-Jones (Haar Cascade)</b> ile <b>YOLOv8n-face</b> derin öğrenme modelini; normal, düşük ve ters ışıkta, ham / parlaklık-kontrast / histogram eşitleme / CLAHE ön işlemleriyle aynı veri ve sabit ayarlarla karşılaştırıyoruz.</>}
            en={<>We compare the classical <b>Viola-Jones (Haar cascade)</b> detector with the deep-learning <b>YOLOv8n-face</b> model in normal, low and back lighting, with raw / brightness-contrast / histogram-equalized / CLAHE preprocessing — same data, fixed settings.</>}
          />
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <Link className="btn btn--primary" href="/tespit"><Icon name="play" size={16} /> <T tr="Canlı tespiti dene" en="Try live detection" /></Link>
          <Link className="btn" href="/laboratuvar"><Icon name="book" size={16} /> <T tr="Adım adım ders" en="Step-by-step lecture" /></Link>
          <Link className="btn" href="/deneyler"><Icon name="chart" size={16} /> <T tr="Sonuçlar" en="Results" /></Link>
        </div>
        <div className="chips" style={{ marginTop: 10 }}>
          <span className="chip"><span className="dot" /> <T tr="Tarayıcıda çalışır" en="Runs in the browser" /></span>
          <span className="chip">Next.js · OpenCV.js · ONNX Runtime Web</span>
          <span className="chip"><T tr="Python/OpenCV deney hattı" en="Python/OpenCV experiment pipeline" /></span>
        </div>
      </div>

      <Link href="/deneyler" className="tile tile--img tile--w">
        <img src={BASE + "/results/figures/examples_lowlight_05.png"} alt="Low-light example: both detectors with four preprocessing variants" />
        <span className="caption"><T tr="Düşük ışık: ön işleme Viola-Jones'u kurtarıyor" en="Low light: preprocessing rescues Viola-Jones" /></span>
      </Link>

      <div className="tile">
        <span className="tile-icon"><Icon name="image" /></span>
        <span className="big-number">{nImg}</span>
        <span className="tile-title"><T tr={`görüntü · ${nFace} yüz`} en={`images · ${nFace} faces`} /></span>
        <span className="tile-sub"><T tr="3 koşul × 5 görüntü, her yüz için referans kutu" en="3 conditions × 5 images, a ground-truth box for every face" /></span>
      </div>

      <div className="tile tile--dark">
        <span className="tile-title">Viola-Jones recall</span>
        <span className="big-number">{vjRaw ? Math.round(vjRaw.recall * 100) : "–"}% → {vjClahe ? Math.round(vjClahe.recall * 100) : "–"}%</span>
        <span className="tile-sub"><T tr="ham görüntü → CLAHE (tüm veri kümesi)" en="raw image → CLAHE (whole dataset)" /></span>
        <span className="tile-sub tile-foot"><T tr={`YOLO ham görüntüde bile F1 = ${yRaw?.f1.toFixed(2) ?? "–"}`} en={`YOLO reaches F1 = ${yRaw?.f1.toFixed(2) ?? "–"} even on raw images`} /></span>
      </div>

      <div className="tile tile--w" style={{ background: "linear-gradient(140deg, color-mix(in srgb, var(--warm) 14%, var(--surface)), var(--surface) 70%)" }}>
        <span className="tile-title" style={{ fontFamily: "var(--font-display)", fontSize: "1.45rem" }}>
          <T tr="Görsel olarak daha iyi görünen bir görüntü her zaman daha iyi tespit sağlar mı?" en="Does an image that looks better always give better detection?" />
        </span>
        <p>
          <T
            tr={<><b>Hayır.</b> Histogram eşitleme ve CLAHE karanlık sahnelerde Viola-Jones&apos;un kaçırdığı yüzleri geri kazandırırken, zaten iyi aydınlatılmış görüntülerde gürültüyü ve dokuyu da güçlendirip <b>yanlış pozitif</b> üretir. YOLO ise ön işlemeden neredeyse etkilenmez. Kanıtlar Deneyler sayfasında.</>}
            en={<><b>No.</b> Histogram equalization and CLAHE recover the faces Viola-Jones misses in dark scenes, but on already well-lit images they also amplify noise and texture and create <b>false positives</b>. YOLO is almost unaffected by preprocessing. The evidence is on the Experiments page.</>}
          />
        </p>
        <Link href="/deneyler" className="btn btn--sm" style={{ alignSelf: "flex-start", marginTop: "auto" }}><T tr="Kanıtları gör" en="See the evidence" /> <Icon name="arrow" size={14} /></Link>
      </div>

      <Link href="/laboratuvar" className="tile tile--t">
        <Icon name="arrow" className="tile-arrow" />
        <span className="tile-icon" style={{ background: "var(--warm)" }}><Icon name="book" /></span>
        <span className="tile-title"><T tr="Ders Laboratuvarı" en="Lecture Lab" /></span>
        <span className="tile-sub"><T tr="Hattın her adımı ders anlatır gibi: formül, neden, canlı önce/sonra." en="Every pipeline step explained like a lecture: formula, why, live before/after." /></span>
        <T
          tr={<ol className="tile-sub" style={{ paddingLeft: 18, display: "grid", gap: 2 }}>
            <li>Piksel matrisi & örnekleme</li><li>RGB kanallar & gri dönüşüm</li><li>Geometrik dönüşümler & interpolasyon</li>
            <li>Parlaklık/kontrast, gama</li><li>Histogram, HE, CLAHE</li><li>Konvolüsyon & filtreler</li>
            <li>Sobel kenarları, eşikleme</li><li>İntegral görüntü & Haar özellikleri</li><li>YOLO: letterbox, NMS</li><li>IoU & metrikler</li>
          </ol>}
          en={<ol className="tile-sub" style={{ paddingLeft: 18, display: "grid", gap: 2 }}>
            <li>Pixel matrix & sampling</li><li>RGB channels & grayscale</li><li>Geometric transforms & interpolation</li>
            <li>Brightness/contrast, gamma</li><li>Histogram, HE, CLAHE</li><li>Convolution & filters</li>
            <li>Sobel edges, thresholding</li><li>Integral image & Haar features</li><li>YOLO: letterbox, NMS</li><li>IoU & metrics</li>
          </ol>}
        />
      </Link>

      <Link href="/tespit" className="tile">
        <Icon name="arrow" className="tile-arrow" />
        <span className="tile-icon"><Icon name="camera" /></span>
        <span className="tile-title"><T tr="Canlı Tespit" en="Live Detection" /></span>
        <span className="tile-sub"><T tr="Dosya, kamera veya örnek görüntü; ön işleme zinciri + iki dedektör karşılaştırmalı." en="File, camera or sample image; preprocessing chain + both detectors compared." /></span>
      </Link>

      <Link href="/etiketleme" className="tile">
        <Icon name="arrow" className="tile-arrow" />
        <span className="tile-icon" style={{ background: "var(--ok)" }}><Icon name="pen" /></span>
        <span className="tile-title"><T tr="Etiketleme aracı" en="Annotation tool" /></span>
        <span className="tile-sub"><T tr="Grup fotoğraflarında referans kutuları çiz, annotations.json indir." en="Draw ground-truth boxes on group photos, export annotations.json." /></span>
      </Link>

      <div className="tile tile--w">
        <span className="tile-title"><T tr="İşlem hattı" en="Pipeline" /></span>
        <div className="flow">
          <span className="step"><T tr="Görüntü" en="Image" /></span><span className="arr">→</span>
          <span className="step"><T tr="Ön işleme" en="Preprocessing" /><br /><small className="muted"><T tr="P/K · HE · CLAHE" en="B/C · HE · CLAHE" /></small></span><span className="arr">→</span>
          <span className="step"><T tr="Gri + Haar" en="Gray + Haar" /><br /><small className="muted">Viola-Jones</small></span>
          <span className="step">Letterbox + CNN<br /><small className="muted">YOLOv8n-face</small></span><span className="arr">→</span>
          <span className="step"><T tr="IoU ≥ 0.5 eşleme" en="IoU ≥ 0.5 matching" /></span><span className="arr">→</span>
          <span className="step"><T tr="TP/FP/FN · F1 · MAE · süre" en="TP/FP/FN · F1 · MAE · time" /></span>
        </div>
        <Link href="/yontem" className="btn btn--sm" style={{ alignSelf: "flex-start", marginTop: "auto" }}><T tr="Yöntem ve mimari" en="Method & architecture" /> <Icon name="arrow" size={14} /></Link>
      </div>

      <div className="tile">
        <span className="tile-icon" style={{ background: "var(--text)", color: "var(--bg)" }}><Icon name="shield" /></span>
        <span className="tile-title"><T tr="Gizlilik & etik" en="Privacy & ethics" /></span>
        <span className="tile-sub">
          <T
            tr={<>Görüntüler tarayıcıdan çıkmaz. Yalnız yüz <b>tespiti</b> yapılır; yüz tanıma / kimlik etiketleme yoktur.</>}
            en={<>Images never leave the browser. Only face <b>detection</b> is performed; no face recognition or identity labelling.</>}
          />
        </span>
      </div>
    </section>
  );
}

"use client";
import { BASE } from "@/lib/base";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Histogram, ImageView } from "@/components/Viz";
import { useT } from "@/components/I18n";
import * as P from "@/lib/imgproc";
import { RGBA } from "@/lib/imgproc";
import { Dataset, DatasetItem, fetchDataset, COND_LABELS, COND_EN } from "@/lib/data";
import { detectHaar, detectYolo, letterbox, loadHaar, loadOpenCV, YoloRaw, YOLO_DEFAULTS, drawBoxes } from "@/lib/detectors";
import { Box, iou, match, prf } from "@/lib/metrics";

const LESSONS: [string, string, string][] = [
  ["piksel", "Piksel matrisi, örnekleme, nicemleme", "Pixel matrix, sampling, quantization"],
  ["renk", "RGB kanallar ve gri dönüşüm", "RGB channels and grayscale"],
  ["geometri", "Geometrik dönüşümler ve interpolasyon", "Geometric transforms & interpolation"],
  ["nokta", "Parlaklık, kontrast, gama", "Brightness, contrast, gamma"],
  ["histogram", "Histogram ve histogram eşitleme", "Histogram & histogram equalization"],
  ["clahe", "Adaptif histogram eşitleme (CLAHE)", "Adaptive histogram equalization (CLAHE)"],
  ["filtre", "Konvolüsyon ve gürültü filtreleri", "Convolution & noise filters"],
  ["kenar", "Kenar tespiti ve eşikleme", "Edge detection & thresholding"],
  ["vj", "Viola-Jones: integral görüntü, Haar, kaskad", "Viola-Jones: integral image, Haar, cascade"],
  ["yolo", "YOLO: letterbox, ızgara, NMS", "YOLO: letterbox, grid, NMS"],
  ["iou", "IoU ve başarım ölçütleri", "IoU & evaluation metrics"],
];

/* ---------------- küçük yardımcı bileşenler ---------------- */
function Lesson({ id, n, title, lead, children }: { id: string; n: number; title: ReactNode; lead: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="lesson">
      <div className="lesson-head">
        <span className="num">{n}</span>
        <div><h2 style={{ fontSize: "1.7rem" }}>{title}</h2><p>{lead}</p></div>
      </div>
      <div className="lesson-body">{children}</div>
    </section>
  );
}
function Slider({ label, v, set, min, max, step = 1, fmt }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step?: number; fmt?: (n: number) => string }) {
  return (
    <div className="field">
      <label>{label}: <span className="muted">{fmt ? fmt(v) : v}</span></label>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} />
    </div>
  );
}
function Seg<T extends string>({ v, set, opts }: { v: T; set: (t: T) => void; opts: [T, string][] }) {
  return <div className="seg">{opts.map(([k, l]) => <button key={k} aria-pressed={v === k} onClick={() => set(k)}>{l}</button>)}</div>;
}
function Why({ children }: { children: ReactNode }) {
  const t = useT();
  return <div className="why"><b>{t("Projedeki rolü: ", "Role in the project: ")}</b>{children}</div>;
}
const F = ({ children }: { children: ReactNode }) => <div className="formula">{children}</div>;

/* ========================================================================= */
export default function Lab() {
  const t = useT();
  const [ds, setDs] = useState<Dataset | null>(null);
  const [item, setItem] = useState<DatasetItem | null>(null);
  const [src, setSrc] = useState<RGBA | null>(null);
  const [active, setActive] = useState<string>("piksel");

  useEffect(() => { fetchDataset().then(setDs).catch(() => {}); }, []);
  const pick = async (it: DatasetItem) => {
    const img = await P.loadImage(BASE + "/dataset/" + it.file);
    setItem(it); setSrc(P.fromImageElement(img, 4096));
  };
  useEffect(() => { if (ds && !src) pick(ds.images[0]); }, [ds, src]); // eslint-disable-line react-hooks/exhaustive-deps
  const onFile = async (f?: File | null) => {
    if (!f) return;
    const u = URL.createObjectURL(f);
    const img = await P.loadImage(u); URL.revokeObjectURL(u);
    setItem(null); setSrc(P.fromImageElement(img, 640));
  };
  // laboratuvarda hız için en fazla 420 px
  const im = useMemo(() => {
    if (!src) return null;
    const s = Math.min(1, 420 / Math.max(src.w, src.h));
    return s < 1 ? P.resize(src, Math.round(src.w * s), Math.round(src.h * s), "bilinear") : src;
  }, [src]);

  useEffect(() => {
    const obs = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-30% 0px -60% 0px" });
    LESSONS.forEach(([id]) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [im]);

  return (
    <div className="lab-layout">
      <aside className="lab-toc">
        <div className="card" style={{ padding: 14, marginBottom: 8 }}>
          <div className="label" style={{ marginBottom: 6 }}>{t("Ders görüntüsü", "Lecture image")}</div>
          <div className="thumbs" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            {ds?.images.map((i) => (
              <button key={i.file} aria-pressed={item?.file === i.file} onClick={() => pick(i)} title={t(COND_LABELS[i.condition], COND_EN[i.condition])}>
                <img src={BASE + "/dataset/" + i.file} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <label className="btn btn--sm" style={{ marginTop: 8, width: "100%" }}>
            <Icon name="upload" size={14} /> {t("Kendi görüntün", "Your own image")}
            <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        {LESSONS.map(([id, tr, en], i) => (
          <a key={id} href={`#${id}`} className={active === id ? "active" : ""}><span className="n">{i + 1}</span>{t(tr, en)}</a>
        ))}
      </aside>
      <div>
        {!im ? <div className="card"><span className="spin" /> {t("Görüntü yükleniyor…", "Loading image…")}</div> : (
          <>
            <PixelLesson im={im} />
            <ColorLesson im={im} />
            <GeometryLesson im={im} />
            <PointLesson im={im} />
            <HistLesson im={im} />
            <ClaheLesson im={im} />
            <FilterLesson im={im} />
            <EdgeLesson im={im} />
            <VJLesson src={src!} item={item} />
            <YoloLesson src={src!} />
            <IoULesson />
          </>
        )}
      </div>
    </div>
  );
}

/* ============================ 1. Piksel ============================ */
function PixelLesson({ im }: { im: RGBA }) {
  const t = useT();
  const [factor, setFactor] = useState(4);
  const [bits, setBits] = useState(8);
  const [px, setPx] = useState(0.5), [py, setPy] = useState(0.3);
  const g = useMemo(() => P.toGray(im), [im]);
  const N = 10;
  const x0 = Math.round(px * (im.w - N)), y0 = Math.round(py * (im.h - N));
  const sampled = useMemo(() => {
    const small = P.resize(im, Math.max(1, Math.round(im.w / factor)), Math.max(1, Math.round(im.h / factor)), "nearest");
    const levels = 2 ** bits, q = 255 / (levels - 1);
    for (let i = 0; i < small.data.length; i += 4) for (let c = 0; c < 3; c++) small.data[i + c] = Math.round(Math.round(small.data[i + c] / q) * q);
    return P.resize(small, im.w, im.h, "nearest");
  }, [im, factor, bits]);
  return (
    <Lesson id="piksel" n={1}
      title={t("Dijital görüntü = sayılardan oluşan matris", "A digital image is a matrix of numbers")}
      lead={t("Kamera sürekli sahneyi uzayda örnekler (piksel) ve parlaklığı nicemler (gri seviye). Bilgisayar için görüntü yalnızca bir sayı matrisidir.",
        "A camera samples the continuous scene in space (pixels) and quantizes brightness (gray levels). To a computer an image is just a matrix of numbers.")}>
      <div className="theory">
        {t(<p>Gri bir görüntü <b>f(x, y)</b> fonksiyonudur: her (x, y) konumunda 0 (siyah) ile 255 (beyaz) arası bir tam sayı. Renkli görüntüde her piksel üç sayı taşır (R, G, B).</p>,
          <p>A grayscale image is a function <b>f(x, y)</b>: at every position (x, y) an integer between 0 (black) and 255 (white). In a color image every pixel carries three numbers (R, G, B).</p>)}
        <F>{t(`f : {0..H−1} × {0..W−1} → {0..2^b − 1}\nb = 8 bit → 256 gri seviye\nÇözünürlük: ${im.w} × ${im.h} = ${(im.w * im.h).toLocaleString("tr")} piksel`,
          `f : {0..H−1} × {0..W−1} → {0..2^b − 1}\nb = 8 bits → 256 gray levels\nResolution: ${im.w} × ${im.h} = ${(im.w * im.h).toLocaleString("en")} pixels`)}</F>
        {t(<ul>
          <li><b>Örnekleme</b> (sampling): uzaysal çözünürlük. Faktör büyüdükçe bloklaşma (aliasing) olur.</li>
          <li><b>Nicemleme</b> (quantization): bit derinliği. Bit azaldıkça yanlış konturlar (false contouring) görülür.</li>
        </ul>, <ul>
          <li><b>Sampling</b>: spatial resolution. A larger factor causes blocking (aliasing).</li>
          <li><b>Quantization</b>: bit depth. Fewer bits produce false contouring.</li>
        </ul>)}
        <Why>{t("Haar dedektörü en küçük 24×24 pencerede çalışır; yüz bundan küçük örneklenirse (uzak/küçük yüz) tespit imkânsızlaşır. YOLO girdiyi 640×640'a yeniden örnekler.",
          "The Haar detector works with a smallest window of 24×24; if a face is sampled smaller than that (distant/small face) it cannot be detected. YOLO resamples the input to 640×640.")}</Why>
        <div className="controls">
          <Slider label={t("Örnekleme faktörü", "Sampling factor")} v={factor} set={setFactor} min={1} max={16} fmt={(v) => `1/${v} (${Math.round(im.w / v)}×${Math.round(im.h / v)})`} />
          <Slider label={t("Bit derinliği", "Bit depth")} v={bits} set={setBits} min={1} max={8} fmt={(v) => t(`${v} bit = ${2 ** v} seviye`, `${v} bit = ${2 ** v} levels`)} />
        </div>
      </div>
      <div className="demo">
        <ImageView im={sampled} pixelated caption={t("Örneklenmiş + nicemlenmiş görüntü", "Sampled + quantized image")} />
        <div className="controls">
          <span className="small">{t(`Aşağıda gri görüntünün ${N}×${N} bölgesinin gerçek değerleri (konum: x=${x0}, y=${y0})`, `Actual values of a ${N}×${N} region of the gray image (position: x=${x0}, y=${y0})`)}</span>
          <Slider label="x" v={px} set={setPx} min={0} max={1} step={0.01} fmt={() => String(x0)} />
          <Slider label="y" v={py} set={setPy} min={0} max={1} step={0.01} fmt={() => String(y0)} />
          <div className="matrix" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
            {Array.from({ length: N * N }, (_, k) => {
              const v = g.data[(y0 + Math.floor(k / N)) * g.w + x0 + (k % N)];
              return <div key={k} style={{ background: `rgb(${v},${v},${v})`, color: v > 128 ? "#000" : "#fff" }}>{v}</div>;
            })}
          </div>
        </div>
      </div>
    </Lesson>
  );
}

/* ============================ 2. Renk ============================ */
function ColorLesson({ im }: { im: RGBA }) {
  const t = useT();
  const [tint, setTint] = useState(true);
  const r = useMemo(() => P.channel(im, 0, tint), [im, tint]), g = useMemo(() => P.channel(im, 1, tint), [im, tint]), b = useMemo(() => P.channel(im, 2, tint), [im, tint]);
  const gw = useMemo(() => P.toGray(im), [im]), ga = useMemo(() => P.toGrayAverage(im), [im]);
  const diff = useMemo(() => {
    const o = new Uint8ClampedArray(gw.data.length);
    for (let i = 0; i < o.length; i++) o[i] = Math.min(255, Math.abs(gw.data[i] - ga.data[i]) * 8);
    return { w: gw.w, h: gw.h, data: o };
  }, [gw, ga]);
  return (
    <Lesson id="renk" n={2}
      title={t("RGB kanallar ve ağırlıklı gri dönüşüm", "RGB channels and weighted grayscale conversion")}
      lead={t("Renkli görüntü üç ayrı gri matristen oluşur. Gri dönüşüm bu üç kanalı, gözün duyarlılığına göre ağırlıklandırarak tek kanala indirir.",
        "A color image consists of three separate gray matrices. Grayscale conversion merges them into one channel, weighted by the eye's sensitivity.")}>
      <div className="theory">
        <F>{t(`Y = 0.2989·R + 0.5870·G + 0.1140·B   (ITU-R BT.601, MATLAB rgb2gray)\nOrtalama: Y = (R + G + B) / 3   (göz duyarlılığını yok sayar)`,
          `Y = 0.2989·R + 0.5870·G + 0.1140·B   (ITU-R BT.601, MATLAB rgb2gray)\nAverage: Y = (R + G + B) / 3   (ignores the eye's sensitivity)`)}</F>
        <p>{t("Göz yeşile en duyarlı, maviye en az duyarlıdır; bu yüzden G ağırlığı en büyüktür. Sağ altta iki yöntem arasındaki fark (8× büyütülmüş) gösteriliyor: özellikle turuncu/mavi yüzeylerde fark belirgindir.",
          "The eye is most sensitive to green and least to blue, so G has the largest weight. Bottom right shows the difference between the two methods (amplified 8×): it is clearest on orange/blue surfaces.")}</p>
        <Why>{t(<>Viola-Jones yalnız <b>gri</b> görüntüde çalışır: Haar özellikleri parlaklık farklarıdır, renk bilgisi kullanılmaz. Bu yüzden projede Haar&apos;a girmeden önce bu ağırlıklarla gri dönüşüm yapılır. YOLO ise 3 kanalı (RGB) birlikte kullanır; ten rengi de bir ipucudur.</>,
          <>Viola-Jones works only on <b>grayscale</b>: Haar features are brightness differences, color is not used. That is why the project converts to gray with these weights before Haar. YOLO uses all 3 channels (RGB) together; skin color is a cue as well.</>)}</Why>
        <label className="toggle"><input type="checkbox" checked={tint} onChange={(e) => setTint(e.target.checked)} /><span className="t-title">{t("Kanalları kendi renginde göster", "Show channels in their own color")}</span></label>
      </div>
      <div className="demo">
        <div className="grid-3" style={{ gap: 8 }}>
          <ImageView im={r} caption={t("R kanalı", "R channel")} /><ImageView im={g} caption={t("G kanalı", "G channel")} /><ImageView im={b} caption={t("B kanalı", "B channel")} />
        </div>
        <div className="grid-3" style={{ gap: 8 }}>
          <ImageView im={gw} caption={t("Ağırlıklı gri", "Weighted gray")} /><ImageView im={ga} caption={t("Ortalama gri", "Average gray")} /><ImageView im={diff} caption={t("|fark| × 8", "|difference| × 8")} />
        </div>
      </div>
    </Lesson>
  );
}

/* ============================ 3. Geometri ============================ */
function GeometryLesson({ im }: { im: RGBA }) {
  const t = useT();
  const [deg, setDeg] = useState(20), [sc, setSc] = useState(1), [tx, setTx] = useState(0), [ty, setTy] = useState(0);
  const [fh, setFh] = useState(false), [mode, setMode] = useState<P.Interp>("bilinear");
  const [zoom, setZoom] = useState(6);
  const out = useMemo(() => {
    const base = fh ? P.flip(im, true) : im;
    const M = P.rotationMatrix(im.w, im.h, deg, sc);
    M[2] += tx; M[5] += ty;
    return { img: P.affine(base, M, im.w, im.h, mode), M };
  }, [im, deg, sc, tx, ty, fh, mode]);
  const round = useMemo(() => {
    const a = P.affine(im, P.rotationMatrix(im.w, im.h, deg), im.w, im.h, mode);
    const b = P.affine(a, P.rotationMatrix(im.w, im.h, -deg), im.w, im.h, mode);
    const c = Math.round(Math.min(im.w, im.h) * 0.25);
    return P.psnr(P.crop(im, c, c, im.w - 2 * c, im.h - 2 * c), P.crop(b, c, c, im.w - 2 * c, im.h - 2 * c));
  }, [im, deg, mode]);
  const zoomed = useMemo(() => {
    const cw = Math.round(im.w / zoom / 2), ch = Math.round(im.h / zoom / 2);
    const c = P.crop(im, Math.round(im.w * 0.42), Math.round(im.h * 0.2), cw, ch);
    return { n: P.resize(c, cw * zoom, ch * zoom, "nearest"), b: P.resize(c, cw * zoom, ch * zoom, "bilinear") };
  }, [im, zoom]);
  const m = out.M.map((v) => v.toFixed(3));
  const psnrTxt = Number.isFinite(round) ? round.toFixed(2) : "∞";
  return (
    <Lesson id="geometri" n={3}
      title={t("Döndürme, ölçekleme, öteleme, çevirme", "Rotation, scaling, translation, flipping")}
      lead={t("Geometrik dönüşümler piksel değerlerini değil, piksellerin konumunu değiştirir. Hepsi tek bir 2×3 afin matrisle yazılabilir.",
        "Geometric transforms change where pixels are, not their values. All of them can be written as a single 2×3 affine matrix.")}>
      <div className="theory">
        <F>{`[x']   [ s·cosθ  −s·sinθ  tx' ] [x]\n[y'] = [ s·sinθ   s·cosθ  ty' ] [y]\n                               [1]\n${t("Güncel", "Current")} M = [${m[0]}  ${m[1]}  ${m[2]}]\n${t("          ", "          ")} [${m[3]}  ${m[4]}  ${m[5]}]`}</F>
        {t(<ol>
          <li><b>Ters eşleme:</b> çıktıdaki her piksel için kaynaktaki yer <code>M⁻¹·(x′, y′)</code> ile bulunur. İleri eşleme yapılsaydı çıktıda boş delikler kalırdı.</li>
          <li>Bulunan konum genelde tam sayı değildir → <b>interpolasyon</b>: en yakın komşu (hızlı, bloklu) veya çift doğrusal (4 komşunun ağırlıklı ortalaması, yumuşak).</li>
          <li>Merkez etrafında döndürmek için önce merkeze öteleme, döndürme, sonra geri öteleme yapılır (matristeki ofsetler).</li>
        </ol>, <ol>
          <li><b>Backward mapping:</b> for every output pixel the source location is found with <code>M⁻¹·(x′, y′)</code>. Forward mapping would leave empty holes in the output.</li>
          <li>The source location is usually not an integer → <b>interpolation</b>: nearest neighbour (fast, blocky) or bilinear (weighted average of 4 neighbours, smooth).</li>
          <li>To rotate around the center: translate to the center, rotate, translate back (the offsets in the matrix).</li>
        </ol>)}
        <F>{t(`Çift doğrusal: f(x,y) ≈ (1−a)(1−b)·f00 + a(1−b)·f10 + (1−a)b·f01 + ab·f11`, `Bilinear: f(x,y) ≈ (1−a)(1−b)·f00 + a(1−b)·f10 + (1−a)b·f01 + ab·f11`)}</F>
        <p>{t(<>Döndürüp geri döndürünce görüntü aynı olmaz: interpolasyon bilgi kaybettirir. Merkez bölgede <b>PSNR = {psnrTxt} dB</b> ({mode === "nearest" ? "en yakın komşu" : "çift doğrusal"}).</>,
          <>Rotating and rotating back does not give the same image: interpolation loses information. In the central region <b>PSNR = {psnrTxt} dB</b> ({mode === "nearest" ? "nearest neighbour" : "bilinear"}).</>)}</p>
        <Why>{t(<>Haar Cascade yalnız <b>dik (frontal) ve hafif eğik</b> yüzler için eğitilmiştir; ~15°&apos;den fazla eğik başlarda kaçırır. YOLO eğitimde döndürme/ölçek veri artırmasıyla eğitildiği için daha dayanıklıdır. Ayrıca YOLO&apos;nun letterbox adımı tam olarak bir <b>ölçekleme + öteleme</b> dönüşümüdür.</>,
          <>The Haar cascade is trained only for <b>upright (frontal) and slightly tilted</b> faces; it misses heads tilted more than ~15°. YOLO is more robust because it was trained with rotation/scale augmentation. Also, YOLO&apos;s letterbox step is exactly a <b>scale + translation</b> transform.</>)}</Why>
        <div className="controls">
          <Slider label={t("Açı θ", "Angle θ")} v={deg} set={setDeg} min={-180} max={180} fmt={(v) => `${v}°`} />
          <Slider label={t("Ölçek s", "Scale s")} v={sc} set={setSc} min={0.3} max={2} step={0.05} fmt={(v) => v.toFixed(2)} />
          <Slider label={t("Öteleme tx", "Translation tx")} v={tx} set={setTx} min={-150} max={150} fmt={(v) => `${v}px`} />
          <Slider label={t("Öteleme ty", "Translation ty")} v={ty} set={setTy} min={-150} max={150} fmt={(v) => `${v}px`} />
          <div className="row">
            <Seg v={mode} set={setMode} opts={[["nearest", t("En yakın komşu", "Nearest neighbour")], ["bilinear", t("Çift doğrusal", "Bilinear")]]} />
            <label className="toggle" style={{ padding: "6px 10px" }}><input type="checkbox" checked={fh} onChange={(e) => setFh(e.target.checked)} />{t("Yatay çevir", "Flip horizontally")}</label>
          </div>
        </div>
      </div>
      <div className="demo">
        <div className="canvas-pair"><ImageView im={im} caption={t("Orijinal", "Original")} /><ImageView im={out.img} caption={t("Dönüştürülmüş", "Transformed")} /></div>
        <div className="controls">
          <Slider label={t("Büyütme (yeniden boyutlandırma)", "Zoom (resizing)")} v={zoom} set={setZoom} min={2} max={12} fmt={(v) => `${v}×`} />
          <div className="canvas-pair">
            <ImageView im={zoomed.n} pixelated caption={t("En yakın komşu — bloklu", "Nearest neighbour — blocky")} />
            <ImageView im={zoomed.b} pixelated caption={t("Çift doğrusal — yumuşak", "Bilinear — smooth")} />
          </div>
        </div>
      </div>
    </Lesson>
  );
}

/* ============================ 4. Nokta işlemleri ============================ */
function PointLesson({ im }: { im: RGBA }) {
  const t = useT();
  const [a, setA] = useState(P.ALPHA), [b, setB] = useState(P.BETA), [gm, setGm] = useState(1), [neg, setNeg] = useState(false);
  const lut = useMemo(() => {
    const l = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) { let x = P.clamp8(a * v + b); x = P.clamp8(255 * Math.pow(x / 255, gm)); l[v] = neg ? 255 - x : x; }
    return l;
  }, [a, b, gm, neg]);
  const out = useMemo(() => P.applyLUT(im, lut), [im, lut]);
  const h0 = useMemo(() => P.lumaHistogram(im), [im]), h1 = useMemo(() => P.lumaHistogram(out), [out]);
  let sat = 0; for (let v = 0; v < 256; v++) if (lut[v] === 255 || lut[v] === 0) sat += h0[v];
  const satPct = ((sat / (im.w * im.h)) * 100).toFixed(1);
  return (
    <Lesson id="nokta" n={4}
      title={t("Nokta işlemleri: parlaklık, kontrast, gama", "Point operations: brightness, contrast, gamma")}
      lead={t("Her çıkış pikseli yalnız aynı konumdaki giriş pikseline bağlıdır: s = T(r). Bu yüzden 256 elemanlı bir arama tablosu (LUT) ile çok hızlı uygulanır.",
        "Each output pixel depends only on the input pixel at the same position: s = T(r). So it is applied very fast with a 256-entry lookup table (LUT).")}>
      <div className="theory">
        <F>{t(`Doğrusal:  g = clip(α·f + β, 0, 255)     α: kontrast, β: parlaklık\nGama:      s = 255·(r/255)^γ             γ<1 karanlığı açar\nNegatif:   s = 255 − r`,
          `Linear:    g = clip(α·f + β, 0, 255)     α: contrast, β: brightness\nGamma:     s = 255·(r/255)^γ             γ<1 brightens dark areas\nNegative:  s = 255 − r`)}</F>
        <p>{t(<>Yeşil eğri dönüşüm fonksiyonu T(r)&apos;dir. α&gt;1 histogramı yayar (kontrast artar), β histogramı kaydırır. Uçlarda 0/255&apos;e <b>doyan</b> pikseller geri döndürülemez bilgi kaybıdır: şu an %{satPct}.</>,
          <>The green curve is the transfer function T(r). α&gt;1 stretches the histogram (more contrast), β shifts it. Pixels that <b>saturate</b> at 0/255 are an irreversible loss of information: currently {satPct}%.</>)}</p>
        <Why>{t(<>Deneydeki 1. iyileştirme: <b>α = {P.ALPHA}, β = {P.BETA}</b> (tüm görüntülerde sabit). Düşük ışıkta yüzü biraz aydınlatır ama gürültüyü de aynı oranda büyütür; ters ışıkta parlak arka planı 255&apos;te doyurur. Bu işlem projede elle yazılmıştır.</>,
          <>Enhancement #1 in the experiment: <b>α = {P.ALPHA}, β = {P.BETA}</b> (fixed for all images). In low light it brightens the face a little but amplifies noise by the same factor; in backlight it saturates the bright background at 255. Implemented by hand in the project.</>)}</Why>
        <div className="controls">
          <Slider label={t("Kontrast α", "Contrast α")} v={a} set={setA} min={0.2} max={3} step={0.05} fmt={(v) => v.toFixed(2)} />
          <Slider label={t("Parlaklık β", "Brightness β")} v={b} set={setB} min={-120} max={120} />
          <Slider label={t("Gama γ", "Gamma γ")} v={gm} set={setGm} min={0.2} max={3} step={0.05} fmt={(v) => v.toFixed(2)} />
          <div className="row">
            <label className="toggle" style={{ padding: "6px 10px" }}><input type="checkbox" checked={neg} onChange={(e) => setNeg(e.target.checked)} />{t("Negatif", "Negative")}</label>
            <button className="btn btn--sm" onClick={() => { setA(P.ALPHA); setB(P.BETA); setGm(1); setNeg(false); }}>{t("Deney ayarı", "Experiment setting")}</button>
            <button className="btn btn--sm" onClick={() => { setA(1); setB(0); setGm(1); setNeg(false); }}>{t("Kimlik (değişiklik yok)", "Identity (no change)")}</button>
          </div>
        </div>
      </div>
      <div className="demo">
        <div className="canvas-pair"><ImageView im={im} caption={t("Giriş", "Input")} /><ImageView im={out} caption={t("Çıkış", "Output")} /></div>
        <div className="canvas-pair">
          <Histogram hist={h0} lut={lut} label={t("Giriş histogramı + T(r) (yeşil)", "Input histogram + T(r) (green)")} height={100} />
          <Histogram hist={h1} label={t("Çıkış histogramı", "Output histogram")} height={100} />
        </div>
      </div>
    </Lesson>
  );
}

/* ============================ 5. Histogram eşitleme ============================ */
function HistLesson({ im }: { im: RGBA }) {
  const t = useT();
  const g = useMemo(() => P.toGray(im), [im]);
  const h = useMemo(() => P.histogram(g.data), [g]);
  const { lut } = useMemo(() => P.equalizeLUT(h), [h]);
  const eq = useMemo(() => P.equalizeGray(g), [g]);
  const heq = useMemo(() => P.histogram(eq.data), [eq]);
  const color = useMemo(() => P.histEqualize(im), [im]);
  const stretched = useMemo(() => P.stretch(im), [im]);
  const e0 = P.entropy(h).toFixed(2), e1 = P.entropy(heq).toFixed(2);
  return (
    <Lesson id="histogram" n={5}
      title={t("Histogram ve histogram eşitleme (elle yazıldı)", "Histogram & histogram equalization (hand-written)")}
      lead={t("Histogram her gri seviyeden kaç piksel olduğunu sayar. Eşitleme, kümülatif dağılımı (CDF) dönüşüm fonksiyonu olarak kullanıp histogramı tüm aralığa yayar.",
        "A histogram counts how many pixels have each gray level. Equalization uses the cumulative distribution (CDF) as the transfer function and spreads the histogram over the full range.")}>
      <div className="theory">
        <F>{`h(k) = #{ ${t("piksel", "pixel")} | f(x,y) = k }            k = 0..255\nCDF(k) = Σ_{j≤k} h(j)\ns_k = round( (CDF(k) − CDF_min) / (N − CDF_min) · 255 )`}</F>
        {t(<ol>
          <li>Histogramı say (tek geçiş).</li>
          <li>Kümülatif toplamı al (turuncu eğri).</li>
          <li>CDF&apos;yi 0–255&apos;e normalize et → LUT (yeşil eğri).</li>
          <li>Her pikseli LUT ile eşle. Renkli görüntüde yalnız <b>Y (parlaklık)</b> kanalı eşitlenir; Cr/Cb korunur, renk tonu bozulmaz.</li>
        </ol>, <ol>
          <li>Count the histogram (single pass).</li>
          <li>Take the cumulative sum (orange curve).</li>
          <li>Normalize the CDF to 0–255 → LUT (green curve).</li>
          <li>Map every pixel through the LUT. In color images only the <b>Y (luma)</b> channel is equalized; Cr/Cb are kept, so hues are preserved.</li>
        </ol>)}
        <p>{t(<>Entropi {e0} → {e1} bit. Eşitleme seviyeleri birleştirebildiği için entropiyi <b>artıramaz</b>; görüntü “daha zengin” görünse de yeni bilgi eklenmez, var olan kontrast yeniden dağıtılır.</>,
          <>Entropy {e0} → {e1} bits. Because equalization can merge levels it <b>cannot increase</b> entropy; the image looks “richer” but no new information is added — existing contrast is only redistributed.</>)}</p>
        <Why>{t(<>Projedeki “en az bir algoritmayı kendiniz yazın” şartı bu adımla karşılanır (<code>python/fd/enhance.py</code> ve <code>lib/imgproc.ts</code>). Doğrulama: elle yazılan sürüm <code>cv2.equalizeHist</code> ile <b>piksel piksel aynı</b> çıktı verir (maks. fark 0). Düşük ışıkta Viola-Jones recall&apos;unu büyük ölçüde artırır; ancak normal görüntülerde gürültü ve arka plan dokusunu da güçlendirip yanlış pozitiflere yol açabilir.</>,
          <>This step satisfies the “implement at least one algorithm yourself” requirement (<code>python/fd/enhance.py</code> and <code>lib/imgproc.ts</code>). Verification: the hand-written version gives <b>pixel-identical</b> output to <code>cv2.equalizeHist</code> (max. difference 0). In low light it greatly increases Viola-Jones recall, but on normal images it also amplifies noise and background texture and can cause false positives.</>)}</Why>
      </div>
      <div className="demo">
        <div className="canvas-pair"><ImageView im={g} caption={t("Gri giriş", "Gray input")} /><ImageView im={eq} caption={t("Eşitlenmiş", "Equalized")} /></div>
        <div className="canvas-pair">
          <Histogram hist={h} cdf lut={lut} label={t("Giriş: histogram, CDF (turuncu), LUT (yeşil)", "Input: histogram, CDF (orange), LUT (green)")} height={100} />
          <Histogram hist={heq} cdf label={t("Çıkış: CDF neredeyse doğrusal", "Output: CDF is nearly linear")} height={100} />
        </div>
        <div className="canvas-pair"><ImageView im={color} caption={t("Renkli HE (Y kanalı)", "Color HE (Y channel)")} /><ImageView im={stretched} caption={t("Karşılaştırma: histogram germe (min-max)", "Comparison: histogram stretching (min-max)")} /></div>
      </div>
    </Lesson>
  );
}

/* ============================ 6. CLAHE ============================ */
function ClaheLesson({ im }: { im: RGBA }) {
  const t = useT();
  const [clip, setClip] = useState(P.CLAHE_CLIP), [tiles, setTiles] = useState(P.CLAHE_TILES), [grid, setGrid] = useState(true);
  const g = useMemo(() => P.toGray(im), [im]);
  const out = useMemo(() => P.claheGray(g, clip, tiles), [g, clip, tiles]);
  const he = useMemo(() => P.equalizeGray(g), [g]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    P.drawToCanvas(c, out);
    if (!grid) return;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "rgba(224,121,91,.85)"; ctx.lineWidth = 1;
    for (let i = 1; i < tiles; i++) {
      ctx.beginPath(); ctx.moveTo((i * out.w) / tiles, 0); ctx.lineTo((i * out.w) / tiles, out.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (i * out.h) / tiles); ctx.lineTo(out.w, (i * out.h) / tiles); ctx.stroke();
    }
  }, [out, grid, tiles]);
  const tile = useMemo(() => {
    const tw = Math.ceil(g.w / tiles), th = Math.ceil(g.h / tiles), tx = Math.floor(tiles / 2), ty = Math.floor(tiles / 3);
    const hh = new Uint32Array(256); let n = 0;
    for (let y = ty * th; y < Math.min(g.h, (ty + 1) * th); y++) for (let x = tx * tw; x < Math.min(g.w, (tx + 1) * tw); x++) { hh[g.data[y * g.w + x]]++; n++; }
    const limit = Math.max(1, Math.floor((clip * n) / 256));
    const clipped = new Uint32Array(256); let ex = 0;
    for (let i = 0; i < 256; i++) { clipped[i] = Math.min(hh[i], limit); ex += hh[i] - clipped[i]; }
    for (let i = 0; i < 256; i++) clipped[i] += Math.floor(ex / 256);
    return { hh, clipped, limit };
  }, [g, tiles, clip]);
  return (
    <Lesson id="clahe" n={6}
      title={t("CLAHE: kontrast sınırlı adaptif histogram eşitleme", "CLAHE: contrast-limited adaptive histogram equalization")}
      lead={t("Global HE tüm görüntü için tek bir LUT kullanır. CLAHE görüntüyü bloklara böler, her bloğa ayrı ama kırpılmış bir eşitleme uygular ve blok sınırlarını çift doğrusal interpolasyonla birleştirir.",
        "Global HE uses a single LUT for the whole image. CLAHE splits the image into tiles, applies a separate but clipped equalization to each tile and blends tile borders with bilinear interpolation.")}>
      <div className="theory">
        {t(<ol>
          <li>Görüntüyü {tiles}×{tiles} bloğa böl (turuncu ızgara).</li>
          <li>Her bloğun histogramını hesapla.</li>
          <li>Histogramı <code>limit = clip · N_blok / 256</code> = {tile.limit} değerinde <b>kırp</b>; taşan sayımı tüm kutulara eşit dağıt. Bu, eğimi (kontrast kazancını) sınırlar → gürültü aşırı büyümez.</li>
          <li>Her blok için CDF → LUT.</li>
          <li>Her piksel, en yakın 4 bloğun LUT çıktısının çift doğrusal ağırlıklı ortalamasıyla eşlenir (blok kenarı izi oluşmaz).</li>
        </ol>, <ol>
          <li>Split the image into {tiles}×{tiles} tiles (orange grid).</li>
          <li>Compute the histogram of each tile.</li>
          <li><b>Clip</b> the histogram at <code>limit = clip · N_tile / 256</code> = {tile.limit}; redistribute the excess evenly over all bins. This limits the slope (contrast gain) → noise is not over-amplified.</li>
          <li>CDF → LUT for each tile.</li>
          <li>Each pixel is mapped by the bilinear-weighted average of the LUT outputs of its 4 nearest tiles (no visible tile seams).</li>
        </ol>)}
        <Why>{t(<>Deneydeki 3. iyileştirme: <b>clipLimit = {P.CLAHE_CLIP}, blok = {P.CLAHE_TILES}×{P.CLAHE_TILES}</b>. Ters ışıkta (karanlık yüz + parlak arka plan) global HE parlak alana takılırken CLAHE yüz bölgesini yerel olarak açar. Deney hattında Python ile birebir aynı sonuç için OpenCV&apos;nin CLAHE&apos;si kullanılır; buradaki sürüm aynı algoritmanın eğitim amaçlı elle yazılmış hâlidir.</>,
          <>Enhancement #3 in the experiment: <b>clipLimit = {P.CLAHE_CLIP}, tiles = {P.CLAHE_TILES}×{P.CLAHE_TILES}</b>. In backlight (dark face + bright background) global HE is dominated by the bright area, while CLAHE brightens the face region locally. The experiment pipeline uses OpenCV&apos;s CLAHE for identical results with Python; the version here is a hand-written teaching implementation of the same algorithm.</>)}</Why>
        <div className="controls">
          <Slider label="Clip limit" v={clip} set={setClip} min={1} max={10} step={0.5} />
          <Slider label={t("Blok sayısı (kenar başına)", "Tiles (per side)")} v={tiles} set={setTiles} min={2} max={16} />
          <label className="toggle" style={{ padding: "6px 10px" }}><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />{t("Blok ızgarasını göster", "Show tile grid")}</label>
        </div>
        <div className="canvas-pair">
          <Histogram hist={tile.hh} label={t("Örnek blok: ham histogram", "Sample tile: raw histogram")} height={80} />
          <Histogram hist={tile.clipped} label={t("Kırpılmış + yeniden dağıtılmış", "Clipped + redistributed")} height={80} color="var(--warm)" />
        </div>
      </div>
      <div className="demo">
        <div className="canvas-pair">
          <ImageView im={he} caption={t("Global HE", "Global HE")} />
          <figure className="figure"><canvas ref={ref} className="cv" /><figcaption>{t("CLAHE (elle yazılmış)", "CLAHE (hand-written)")}</figcaption></figure>
        </div>
        <ImageView im={g} caption={t("Gri giriş", "Gray input")} />
      </div>
    </Lesson>
  );
}

/* ============================ 7. Filtreler ============================ */
function FilterLesson({ im }: { im: RGBA }) {
  const t = useT();
  const [noise, setNoise] = useState(0.05), [ks, setKs] = useState(3), [sigma, setSigma] = useState(1);
  const [kind, setKind] = useState<"mean" | "gauss" | "median" | "sharpen">("median");
  const noisy = useMemo(() => P.saltPepper(im, noise), [im, noise]);
  const kernel = kind === "mean" ? P.meanKernel(ks) : kind === "gauss" ? P.gaussianKernel(ks, sigma) : kind === "sharpen" ? P.SHARPEN : null;
  const kSize = kind === "sharpen" ? 3 : ks;
  const out = useMemo(() => (kind === "median" ? P.median(noisy, ks) : P.convolve(noisy, kernel!, kSize)), [noisy, kind, ks, sigma]); // eslint-disable-line react-hooks/exhaustive-deps
  const p0 = P.psnr(im, noisy).toFixed(2), p1 = P.psnr(im, out).toFixed(2);
  return (
    <Lesson id="filtre" n={7}
      title={t("Konvolüsyon, ortalama / Gauss / medyan filtre", "Convolution, mean / Gaussian / median filters")}
      lead={t("Komşuluk işlemlerinde çıkış pikseli, giriş pikselinin etrafındaki bir pencereye bağlıdır. Doğrusal filtreler bir çekirdekle (kernel) konvolüsyondur; medyan doğrusal değildir.",
        "In neighbourhood operations the output pixel depends on a window around the input pixel. Linear filters are a convolution with a kernel; the median filter is non-linear.")}>
      <div className="theory">
        <F>{t(`Konvolüsyon:  g(x,y) = Σ_i Σ_j h(i,j) · f(x−i, y−j)\nKorelasyon:   g(x,y) = Σ_i Σ_j h(i,j) · f(x+i, y+j)\n→ Konvolüsyon = çekirdeği 180° çevirip korelasyon. Simetrik çekirdekte ikisi aynı.`,
          `Convolution:  g(x,y) = Σ_i Σ_j h(i,j) · f(x−i, y−j)\nCorrelation:  g(x,y) = Σ_i Σ_j h(i,j) · f(x+i, y+j)\n→ Convolution = correlation with the kernel rotated 180°. Identical for symmetric kernels.`)}</F>
        {t(<ul>
          <li><b>Ortalama</b>: tüm ağırlıklar 1/n². Gürültüyü azaltır, kenarları bulanıklaştırır.</li>
          <li><b>Gauss</b>: ağırlıklar merkezden uzaklaştıkça azalır (σ). Daha doğal yumuşatma; CNN&apos;lerin ilk katmanları da benzer çekirdekler öğrenir.</li>
          <li><b>Medyan</b>: pencere sıralanır, ortanca seçilir. Tuz-biber gürültüsünde en iyisidir, kenarı korur.</li>
          <li><b>Keskinleştirme</b>: merkez − komşular (Laplace tabanlı).</li>
        </ul>, <ul>
          <li><b>Mean</b>: all weights 1/n². Reduces noise, blurs edges.</li>
          <li><b>Gaussian</b>: weights decay with distance from the center (σ). More natural smoothing; the first layers of CNNs learn similar kernels.</li>
          <li><b>Median</b>: the window is sorted and the middle value chosen. Best for salt-and-pepper noise, preserves edges.</li>
          <li><b>Sharpening</b>: center − neighbours (Laplacian-based).</li>
        </ul>)}
        <p>{t(<>PSNR (temiz görüntüye göre): gürültülü <b>{p0} dB</b> → filtreli <b>{p1} dB</b>.</>, <>PSNR (w.r.t. the clean image): noisy <b>{p0} dB</b> → filtered <b>{p1} dB</b>.</>)}</p>
        <Why>{t("Düşük ışıkta sensör gürültüsü artar; HE/CLAHE bu gürültüyü de büyütür. Haar özellikleri dikdörtgen toplamları olduğundan doğal bir ortalama filtresi gibi davranır ve küçük gürültüye görece dayanıklıdır, ancak güçlendirilmiş doku yanlış pozitif üretir. CNN tabanlı YOLO, tam olarak bu konvolüsyon işleminin öğrenilmiş çekirdeklerle onlarca katman üst üste uygulanmasıdır.",
          "Sensor noise increases in low light, and HE/CLAHE amplify it too. Haar features are rectangle sums, so they act like a built-in mean filter and are fairly robust to small noise, but amplified texture produces false positives. The CNN-based YOLO is exactly this convolution, applied in dozens of stacked layers with learned kernels.")}</Why>
        <div className="controls">
          <Seg v={kind} set={setKind} opts={[["mean", t("Ortalama", "Mean")], ["gauss", t("Gauss", "Gaussian")], ["median", t("Medyan", "Median")], ["sharpen", t("Keskinleştir", "Sharpen")]]} />
          <Slider label={t("Tuz-biber gürültü oranı", "Salt-and-pepper noise ratio")} v={noise} set={setNoise} min={0} max={0.3} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} />
          {kind !== "sharpen" && <Slider label={t("Pencere boyutu", "Window size")} v={ks} set={setKs} min={3} max={9} step={2} fmt={(v) => `${v}×${v}`} />}
          {kind === "gauss" && <Slider label="σ" v={sigma} set={setSigma} min={0.5} max={4} step={0.1} fmt={(v) => v.toFixed(1)} />}
          {kernel && (
            <div className="kernel" style={{ gridTemplateColumns: `repeat(${kSize}, auto)` }}>
              {kernel.map((v, i) => <span key={i}>{Math.abs(v) < 1 && v !== 0 ? v.toFixed(3) : v}</span>)}
            </div>
          )}
        </div>
      </div>
      <div className="demo">
        <div className="canvas-pair"><ImageView im={noisy} caption={t("Gürültülü giriş", "Noisy input")} /><ImageView im={out} caption={t("Filtrelenmiş", "Filtered")} /></div>
      </div>
    </Lesson>
  );
}

/* ============================ 8. Kenar ============================ */
function EdgeLesson({ im }: { im: RGBA }) {
  const t = useT();
  const [op, setOp] = useState<"sobel" | "prewitt">("sobel"), [auto, setAuto] = useState(true), [th, setTh] = useState(60);
  const g = useMemo(() => P.toGray(im), [im]);
  const mag = useMemo(() => P.gradient(g, op), [g, op]);
  const ot = useMemo(() => P.otsu(mag), [mag]);
  const thr = auto ? ot : th;
  const bin = useMemo(() => P.threshold(mag, thr), [mag, thr]);
  return (
    <Lesson id="kenar" n={8}
      title={t("Sobel / Prewitt kenar tespiti ve Otsu eşikleme", "Sobel / Prewitt edge detection and Otsu thresholding")}
      lead={t("Kenar, parlaklığın hızla değiştiği yerdir; türevle (gradyan) bulunur. Gradyan büyüklüğü eşiklenerek ikili kenar haritası elde edilir.",
        "An edge is where brightness changes rapidly; it is found with a derivative (gradient). Thresholding the gradient magnitude gives a binary edge map.")}>
      <div className="theory">
        <F>{op === "sobel"
          ? `Gx = [−1 0 1; −2 0 2; −1 0 1]   Gy = [−1 −2 −1; 0 0 0; 1 2 1]\n|G| = √(Gx² + Gy²)     θ = atan2(Gy, Gx)`
          : `Gx = [−1 0 1; −1 0 1; −1 0 1]   Gy = [−1 −1 −1; 0 0 0; 1 1 1]\n|G| = √(Gx² + Gy²)`}</F>
        <p>{t(<>Sobel, merkez satıra 2 ağırlık vererek Prewitt&apos;e göre gürültüye biraz daha dayanıklıdır. <b>Otsu</b> eşiği, iki sınıf (kenar/arka plan) arasındaki varyansı en büyükleyen eşiktir: şu an T = {ot}.</>,
          <>Sobel gives weight 2 to the center row, which makes it slightly more noise-robust than Prewitt. The <b>Otsu</b> threshold maximizes the between-class variance of the two classes (edge/background): currently T = {ot}.</>)}</p>
        <Why>{t(<>Haar özellikleri aslında kaba, ölçeklenebilir <b>kenar ve çizgi dedektörleridir</b>: “göz bölgesi yanaktan koyu”, “burun kemeri yanlardan açık” gibi parlaklık farklarını ölçer. YOLO&apos;nun ilk konvolüsyon katmanları da Sobel benzeri yönlü kenar filtreleri öğrenir. Düşük ışıkta gradyanlar zayıfladığı için iki dedektör de zorlanır; HE/CLAHE gradyanları büyütür.</>,
          <>Haar features are really coarse, scalable <b>edge and line detectors</b>: they measure brightness differences such as “the eye region is darker than the cheeks” or “the nose bridge is brighter than its sides”. YOLO&apos;s first convolution layers also learn Sobel-like oriented edge filters. In low light gradients become weak, so both detectors struggle; HE/CLAHE amplify the gradients.</>)}</Why>
        <div className="controls">
          <Seg v={op} set={setOp} opts={[["sobel", "Sobel"], ["prewitt", "Prewitt"]]} />
          <label className="toggle" style={{ padding: "6px 10px" }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />{t("Otsu ile otomatik eşik", "Automatic threshold (Otsu)")}</label>
          {!auto && <Slider label={t("Eşik T", "Threshold T")} v={th} set={setTh} min={0} max={255} />}
        </div>
      </div>
      <div className="demo">
        <div className="canvas-pair"><ImageView im={mag} caption={t("Gradyan büyüklüğü |G|", "Gradient magnitude |G|")} /><ImageView im={bin} caption={t(`İkili kenar haritası (T=${thr})`, `Binary edge map (T=${thr})`)} /></div>
      </div>
    </Lesson>
  );
}

/* ============================ 9. Viola-Jones ============================ */
function VJLesson({ src, item }: { src: RGBA; item: DatasetItem | null }) {
  const t = useT();
  const [mn, setMn] = useState(0);
  const [raw, setRaw] = useState<Box[] | null>(null);
  const [final, setFinal] = useState<Box[] | null>(null);
  const [busy, setBusy] = useState(false);
  const g = useMemo(() => P.toGray(src), [src]);
  const ii = useMemo(() => P.integralImage(g), [g]);
  const face: Box | null = (item?.faces?.[0] as Box) ?? null;
  const feats = useMemo(() => {
    if (!face) return null;
    const [x, y, w, h] = face.map(Math.round);
    const S = (a: number, b: number, c: number, d: number) => P.rectSum(ii, g.w, Math.round(a), Math.round(b), Math.max(1, Math.round(c)), Math.max(1, Math.round(d)));
    const mean = (a: number, b: number, c: number, d: number) => S(a, b, c, d) / (Math.max(1, Math.round(c)) * Math.max(1, Math.round(d)));
    const eyeY = y + h * 0.3, band = h * 0.15;
    return [
      { tr: "Kenar (2 dikdörtgen): göz bandı vs. yanak", en: "Edge (2 rectangles): eye band vs. cheeks", rects: [[x, eyeY, w, band, "dark"], [x, eyeY + band, w, band, "light"]], v: mean(x, eyeY + band, w, band) - mean(x, eyeY, w, band) },
      { tr: "Çizgi (3 dikdörtgen): burun kemeri vs. gözler", en: "Line (3 rectangles): nose bridge vs. eyes", rects: [[x + w * 0.15, eyeY, w * 0.23, band, "dark"], [x + w * 0.38, eyeY, w * 0.24, band, "light"], [x + w * 0.62, eyeY, w * 0.23, band, "dark"]], v: mean(x + w * 0.38, eyeY, w * 0.24, band) - (mean(x + w * 0.15, eyeY, w * 0.23, band) + mean(x + w * 0.62, eyeY, w * 0.23, band)) / 2 },
      { tr: "Dörtlü (köşegen)", en: "Four-rectangle (diagonal)", rects: [[x, y, w / 2, h / 2, "dark"], [x + w / 2, y, w / 2, h / 2, "light"], [x, y + h / 2, w / 2, h / 2, "light"], [x + w / 2, y + h / 2, w / 2, h / 2, "dark"]], v: mean(x + w / 2, y, w / 2, h / 2) + mean(x, y + h / 2, w / 2, h / 2) - mean(x, y, w / 2, h / 2) - mean(x + w / 2, y + h / 2, w / 2, h / 2) },
    ];
  }, [face, ii, g.w]);
  const ref = useRef<HTMLCanvasElement>(null);
  const faceLbl = t("yüz", "face");
  useEffect(() => {
    if (!ref.current) return;
    P.drawToCanvas(ref.current, g);
    const ctx = ref.current.getContext("2d")!;
    if (raw) drawBoxes(ctx, raw, "rgba(224,121,91,0.55)", undefined, false, 1);
    if (final) drawBoxes(ctx, final, "#1f9d55", final.map(() => faceLbl), false, 3);
    if (feats && !raw) feats.forEach((f) => f.rects.forEach((r) => {
      ctx.fillStyle = r[4] === "dark" ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.55)";
      ctx.fillRect(+r[0], +r[1], +r[2], +r[3]);
    }));
  }, [g, raw, final, feats, faceLbl]);
  const run = async () => {
    setBusy(true);
    await loadOpenCV(); await loadHaar();
    const r = await detectHaar(src, { scaleFactor: 1.1, minNeighbors: 0, minSize: 24 }, g);
    const f = await detectHaar(src, { scaleFactor: 1.1, minNeighbors: Math.max(1, mn || 5), minSize: 24 }, g);
    setRaw(r.boxes); setFinal(f.boxes); setBusy(false);
  };
  const demoRect = { x: Math.round(g.w * 0.3), y: Math.round(g.h * 0.2), w: Math.round(g.w * 0.2), h: Math.round(g.h * 0.15) };
  const sumFast = P.rectSum(ii, g.w, demoRect.x, demoRect.y, demoRect.w, demoRect.h);
  return (
    <Lesson id="vj" n={9}
      title={t("Viola-Jones: integral görüntü + Haar özellikleri + AdaBoost kaskadı", "Viola-Jones: integral image + Haar features + AdaBoost cascade")}
      lead={t("2001'de gerçek zamanlı yüz tespitini mümkün kılan klasik yöntem. Dört fikrin birleşimidir: Haar özellikleri, integral görüntü, AdaBoost ile özellik seçimi ve dikkat kaskadı.",
        "The classical method that made real-time face detection possible in 2001. It combines four ideas: Haar features, the integral image, AdaBoost feature selection and an attentional cascade.")}>
      <div className="theory">
        {t(<ol>
          <li><b>Haar özellikleri:</b> siyah ve beyaz dikdörtgenlerin piksel toplamları farkı. Yüzde göz bölgesi yanaktan, gözler burun kemerinden koyudur. 24×24 pencerede ~160.000 olası özellik vardır.</li>
          <li><b>İntegral görüntü:</b> her konumdaki değer, sol-üstündeki tüm piksellerin toplamıdır. Herhangi bir dikdörtgenin toplamı, boyutundan bağımsız olarak <b>4 okuma</b> ile hesaplanır → özellik hesabı O(1).</li>
          <li><b>AdaBoost:</b> her biri tek bir özellik + eşikten oluşan zayıf sınıflandırıcılar içinden en ayırt edici olanları seçer ve ağırlıklı toplar.</li>
          <li><b>Kaskad:</b> sınıflandırıcılar aşamalara dizilir (bu modelde 25 aşama). İlk aşamalar az özellikle arka plan pencerelerinin çoğunu hemen eler; yalnız “yüze benzeyen” pencereler sonraki aşamalara geçer → hız.</li>
          <li><b>Çok ölçekli tarama:</b> pencere görüntü üzerinde kaydırılır, görüntü her adımda <code>scaleFactor = 1.1</code> oranında küçültülür (piramit). Aynı yüz çok sayıda örtüşen aday üretir; <code>minNeighbors</code> en az bu kadar komşusu olan adayları tutup gruplar.</li>
        </ol>, <ol>
          <li><b>Haar features:</b> the difference between pixel sums of black and white rectangles. In a face the eye region is darker than the cheeks, the eyes darker than the nose bridge. A 24×24 window has ~160,000 possible features.</li>
          <li><b>Integral image:</b> each value is the sum of all pixels above and to the left. The sum of any rectangle, regardless of its size, takes <b>4 lookups</b> → O(1) feature evaluation.</li>
          <li><b>AdaBoost:</b> picks the most discriminative weak classifiers (each a single feature + threshold) and combines them with weights.</li>
          <li><b>Cascade:</b> classifiers are arranged in stages (25 in this model). Early stages reject most background windows with very few features; only “face-like” windows reach later stages → speed.</li>
          <li><b>Multi-scale scan:</b> the window slides over the image, which is shrunk by <code>scaleFactor = 1.1</code> at each step (pyramid). One face produces many overlapping candidates; <code>minNeighbors</code> keeps and groups candidates with at least that many neighbours.</li>
        </ol>)}
        <F>{t(`ii(x,y) = Σ_{x'≤x, y'≤y} i(x',y')\nToplam(D) = ii(4) − ii(2) − ii(3) + ii(1)\nÖrnek: ${demoRect.w}×${demoRect.h} dikdörtgen toplamı = ${sumFast.toLocaleString("tr")} (yalnız 4 okuma)`,
          `ii(x,y) = Σ_{x'≤x, y'≤y} i(x',y')\nSum(D) = ii(4) − ii(2) − ii(3) + ii(1)\nExample: sum of a ${demoRect.w}×${demoRect.h} rectangle = ${sumFast.toLocaleString("en")} (just 4 lookups)`)}</F>
        {feats && (
          <div className="table-wrap"><table><thead><tr><th>{t("Haar özelliği (referans yüz üzerinde)", "Haar feature (on the ground-truth face)")}</th><th>{t("değer", "value")}</th></tr></thead>
            <tbody>{feats.map((f) => <tr key={f.en}><td>{t(f.tr, f.en)}</td><td>{f.v.toFixed(1)}</td></tr>)}</tbody></table></div>
        )}
        <Why>{t(<>Projedeki <b>klasik dedektör</b>. Model: OpenCV <code>haarcascade_frontalface_default.xml</code> (Lienhart). Sabit ayarlar: scaleFactor 1.1, minNeighbors 5, minSize 24×24. Parlaklık <b>farklarına</b> dayandığı için düşük ışıkta farklar sıfıra yaklaşır ve aşamalar yüzü reddeder; HE/CLAHE bu farkları yeniden büyüttüğü için recall belirgin artar.</>,
          <>The project&apos;s <b>classical detector</b>. Model: OpenCV <code>haarcascade_frontalface_default.xml</code> (Lienhart). Fixed settings: scaleFactor 1.1, minNeighbors 5, minSize 24×24. Because it relies on brightness <b>differences</b>, in low light those differences approach zero and the stages reject the face; HE/CLAHE enlarge them again, so recall rises clearly.</>)}</Why>
        <div className="controls">
          <Slider label={t("minNeighbors (gruplama eşiği)", "minNeighbors (grouping threshold)")} v={mn || 5} set={setMn} min={1} max={15} />
          <button className="btn btn--accent" onClick={run} disabled={busy}>{busy ? <><span className="spin" /> {t("çalışıyor", "running")}</> : t("Ham adayları + son tespitleri göster", "Show raw candidates + final detections")}</button>
          {raw && <span className="small">{t(<>minNeighbors=0 ile <b>{raw.length}</b> ham aday pencere (turuncu) → gruplama sonrası <b>{final?.length}</b> yüz (yeşil).</>,
            <>With minNeighbors=0: <b>{raw.length}</b> raw candidate windows (orange) → after grouping <b>{final?.length}</b> face(s) (green).</>)}</span>}
        </div>
      </div>
      <div className="demo">
        <figure className="figure"><canvas ref={ref} className="cv" /><figcaption>{raw
          ? t("Turuncu: kaskadı geçen tüm pencereler · Yeşil: minNeighbors sonrası", "Orange: all windows that pass the cascade · Green: after minNeighbors")
          : t("Gri girdi üzerinde örnek Haar özellikleri (koyu/açık dikdörtgenler)", "Example Haar features on the gray input (dark/light rectangles)")}</figcaption></figure>
      </div>
    </Lesson>
  );
}

/* ============================ 10. YOLO ============================ */
function YoloLesson({ src }: { src: RGBA }) {
  const t = useT();
  const [conf, setConf] = useState(YOLO_DEFAULTS.conf), [nmsT, setNmsT] = useState(YOLO_DEFAULTS.nmsIoU);
  const [dbg, setDbg] = useState<YoloRaw | null>(null), [fin, setFin] = useState<Box[] | null>(null), [ms, setMs] = useState(0), [busy, setBusy] = useState(false);
  const [showGrid, setShowGrid] = useState<0 | 8 | 16 | 32>(32);
  const lb = useMemo(() => letterbox(src, 640), [src]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    P.drawToCanvas(c, lb.img);
    const ctx = c.getContext("2d")!;
    if (showGrid) {
      ctx.strokeStyle = "rgba(141,145,191,.6)"; ctx.lineWidth = 1;
      for (let i = 0; i <= 640; i += showGrid) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 640); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(640, i); ctx.stroke(); }
    }
    const toLb = (b: Box): Box => [b[0] * lb.r + lb.px, b[1] * lb.r + lb.py, b[2] * lb.r, b[3] * lb.r];
    if (dbg) drawBoxes(ctx, dbg.preNms.boxes.map(toLb), "rgba(224,121,91,.6)", undefined, false, 1);
    if (fin) drawBoxes(ctx, fin.map(toLb), "#1f9d55", undefined, false, 3);
  }, [lb, dbg, fin, showGrid]);
  const run = async () => {
    setBusy(true);
    const r = await detectYolo(src, { conf, nmsIoU: nmsT, size: 640 }, setDbg);
    setFin(r.boxes); setMs(r.inferenceMs); setBusy(false);
  };
  return (
    <Lesson id="yolo" n={10}
      title={t("YOLOv8n-face: tek bakışta tespit", "YOLOv8n-face: detection in a single look")}
      lead={t("“You Only Look Once”: görüntü tek bir ileri geçişte evrişimli sinir ağından geçer; ağ her ızgara hücresi için kutu + güven skoru tahmin eder. Bu projede WIDER FACE ile yüz için eğitilmiş bir model kullanılır (genel “person” sınıfı değil).",
        "“You Only Look Once”: the image passes through a convolutional neural network in a single forward pass; the network predicts a box + confidence score for each grid cell. This project uses a model trained for faces on WIDER FACE (not the generic “person” class).")}>
      <div className="theory">
        {t(<ol>
          <li><b>Letterbox:</b> görüntü en-boy oranı korunarak 640×640&apos;a ölçeklenir (r = {lb.r.toFixed(3)}), kalan alan gri (114) ile doldurulur (ofset {lb.px}, {lb.py}). Bu bir ölçekleme + öteleme dönüşümüdür; çıkıştaki kutular ters dönüşümle orijinal koordinata geri taşınır.</li>
          <li><b>Normalizasyon:</b> piksel/255 → [0,1], HWC → CHW tensör [1, 3, 640, 640].</li>
          <li><b>Omurga + boyun (CSPDarknet + PAN):</b> art arda konvolüsyon, BatchNorm, SiLU katmanları; 3 ölçekte öznitelik haritası: adım 8 (80×80), 16 (40×40), 32 (20×20).</li>
          <li><b>Çıkış:</b> 80² + 40² + 20² = <b>8400</b> aday; her biri (cx, cy, w, h, skor). Anchor-free: kutu doğrudan hücre merkezine göre tahmin edilir.</li>
          <li><b>Güven eşiği</b> (conf ≥ {conf}) → adaylar (turuncu). <b>NMS</b>: skor sırasıyla, tutulan kutuyla IoU ≥ {nmsT} olanları sil → son kutular (yeşil).</li>
        </ol>, <ol>
          <li><b>Letterbox:</b> the image is scaled to 640×640 keeping its aspect ratio (r = {lb.r.toFixed(3)}); the rest is padded with gray (114) (offset {lb.px}, {lb.py}). This is a scale + translation transform; output boxes are mapped back to original coordinates with the inverse transform.</li>
          <li><b>Normalization:</b> pixel/255 → [0,1], HWC → CHW tensor [1, 3, 640, 640].</li>
          <li><b>Backbone + neck (CSPDarknet + PAN):</b> stacked convolution, BatchNorm and SiLU layers; feature maps at 3 scales: stride 8 (80×80), 16 (40×40), 32 (20×20).</li>
          <li><b>Output:</b> 80² + 40² + 20² = <b>8400</b> candidates, each (cx, cy, w, h, score). Anchor-free: boxes are predicted directly relative to the cell center.</li>
          <li><b>Confidence threshold</b> (conf ≥ {conf}) → candidates (orange). <b>NMS</b>: in score order, delete boxes with IoU ≥ {nmsT} to a kept box → final boxes (green).</li>
        </ol>)}
        <F>{t(`Model: yolov8n-face-lindevs.onnx (~3M parametre, 12 MB)\nKaynak: github.com/lindevs/yolov8-face (v1.0.1, WIDER FACE)\nÇalışma zamanı: onnxruntime-web (WASM), tarayıcıda`,
          `Model: yolov8n-face-lindevs.onnx (~3M parameters, 12 MB)\nSource: github.com/lindevs/yolov8-face (v1.0.1, WIDER FACE)\nRuntime: onnxruntime-web (WASM), in the browser`)}</F>
        <Why>{t(<>Projedeki <b>derin öğrenme dedektörü</b>. Eğitim verisindeki (WIDER FACE) aydınlatma, ölçek ve poz çeşitliliği sayesinde ön işlemeye neredeyse ihtiyaç duymaz. Ön işleme ancak görüntü istatistiğini eğitim dağılımından uzaklaştırırsa (aşırı gürültü güçlendirme) zarar verebilir.</>,
          <>The project&apos;s <b>deep-learning detector</b>. Thanks to the lighting, scale and pose variety of its training data (WIDER FACE) it hardly needs preprocessing. Preprocessing can only hurt if it pushes image statistics away from the training distribution (e.g. heavy noise amplification).</>)}</Why>
        <div className="controls">
          <Slider label={t("Güven eşiği", "Confidence threshold")} v={conf} set={setConf} min={0.05} max={0.95} step={0.05} fmt={(v) => v.toFixed(2)} />
          <Slider label={t("NMS IoU eşiği", "NMS IoU threshold")} v={nmsT} set={setNmsT} min={0.1} max={0.9} step={0.05} fmt={(v) => v.toFixed(2)} />
          <div className="row"><span className="small">{t("Izgara:", "Grid:")}</span>
            <Seg v={String(showGrid) as "0" | "8" | "16" | "32"} set={(v) => setShowGrid(+v as 0 | 8 | 16 | 32)} opts={[["0", t("yok", "none")], ["8", "80×80"], ["16", "40×40"], ["32", "20×20"]]} /></div>
          <button className="btn btn--accent" onClick={run} disabled={busy}>{busy ? <><span className="spin" /> {t("çalışıyor", "running")}</> : t("Modeli çalıştır", "Run the model")}</button>
          {dbg && <span className="small">{t(<>8400 aday → eşik sonrası <b>{dbg.candidates}</b> → NMS sonrası <b>{fin?.length}</b> yüz · çıkarım {ms.toFixed(0)} ms</>,
            <>8400 candidates → after threshold <b>{dbg.candidates}</b> → after NMS <b>{fin?.length}</b> face(s) · inference {ms.toFixed(0)} ms</>)}</span>}
        </div>
      </div>
      <div className="demo">
        <figure className="figure"><canvas ref={ref} className="cv" /><figcaption>{t("640×640 letterbox girdi · turuncu: NMS öncesi · yeşil: NMS sonrası", "640×640 letterboxed input · orange: before NMS · green: after NMS")}</figcaption></figure>
      </div>
    </Lesson>
  );
}

/* ============================ 11. IoU ============================ */
function IoULesson() {
  const t = useT();
  const gt: Box = [80, 60, 120, 140];
  const [dx, setDx] = useState(30), [dy, setDy] = useState(20), [sw, setSw] = useState(1);
  const pred: Box = [80 + dx, 60 + dy, 120 * sw, 140 * sw];
  const v = iou(pred, gt);
  const ref = useRef<HTMLCanvasElement>(null);
  const lblGt = t("referans", "ground truth"), lblPred = t("tahmin", "prediction");
  useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = 360; c.height = 300;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface-2"); ctx.fillRect(0, 0, 360, 300);
    const ix = Math.max(gt[0], pred[0]), iy = Math.max(gt[1], pred[1]);
    const iw = Math.min(gt[0] + gt[2], pred[0] + pred[2]) - ix, ih = Math.min(gt[1] + gt[3], pred[1] + pred[3]) - iy;
    if (iw > 0 && ih > 0) { ctx.fillStyle = "rgba(141,145,191,.5)"; ctx.fillRect(ix, iy, iw, ih); }
    drawBoxes(ctx, [gt], "#1f9d55", [lblGt], true);
    drawBoxes(ctx, [pred], v >= 0.5 ? "#564d80" : "#d64545", [`${lblPred} · IoU ${v.toFixed(2)}`]);
  }, [dx, dy, sw, lblGt, lblPred]); // eslint-disable-line react-hooks/exhaustive-deps
  const ex = match([[10, 10, 50, 50], [12, 12, 50, 50], [200, 200, 40, 40]], [[10, 10, 52, 52], [100, 100, 40, 40]]);
  const m = prf(ex.tp, ex.fp, ex.fn);
  return (
    <Lesson id="iou" n={11}
      title={t("IoU, bire bir eşleştirme ve başarım ölçütleri", "IoU, one-to-one matching and evaluation metrics")}
      lead={t("Bir tahmin kutusunun doğru sayılması için referans kutuyla yeterince örtüşmesi gerekir. Ölçüt: kesişim / birleşim (IoU).",
        "A predicted box counts as correct only if it overlaps the ground-truth box enough. The measure: intersection over union (IoU).")}>
      <div className="theory">
        <F>{t(`IoU = |A ∩ B| / |A ∪ B|        doğru eşleşme: IoU ≥ 0.50\nPrecision = TP / (TP + FP)      ("bulduklarımın ne kadarı yüz?")\nRecall    = TP / (TP + FN)      ("yüzlerin ne kadarını buldum?")\nF1        = 2·P·R / (P + R)\nSayma hatası = |tahmin sayısı − gerçek sayı|,  MAE = ortalama`,
          `IoU = |A ∩ B| / |A ∪ B|        correct match: IoU ≥ 0.50\nPrecision = TP / (TP + FP)      ("how many of my detections are faces?")\nRecall    = TP / (TP + FN)      ("how many of the faces did I find?")\nF1        = 2·P·R / (P + R)\nCount error = |predicted count − true count|,  MAE = mean`)}</F>
        {t(<ol>
          <li>Tüm (tahmin, referans) çiftlerinin IoU&apos;su hesaplanır; IoU ≥ 0.5 olanlar büyükten küçüğe sıralanır.</li>
          <li>Sırayla, ikisi de daha önce kullanılmamışsa eşleştirilir (<b>bire bir</b>): aynı yüze iki kutu çizilirse biri TP, diğeri FP olur.</li>
          <li>Eşleşmeyen tahminler FP, eşleşmeyen referanslar FN&apos;dir.</li>
        </ol>, <ol>
          <li>Compute the IoU of every (prediction, ground-truth) pair; sort pairs with IoU ≥ 0.5 from largest to smallest.</li>
          <li>Match them in order if neither has been used yet (<b>one-to-one</b>): two boxes on the same face give one TP and one FP.</li>
          <li>Unmatched predictions are FP, unmatched ground-truth boxes are FN.</li>
        </ol>)}
        <p>{t(<>Örnek: 3 tahmin, 2 referans → TP={ex.tp}, FP={ex.fp}, FN={ex.fn}; P={m.precision.toFixed(2)}, R={m.recall.toFixed(2)}, F1={m.f1.toFixed(2)}. Sayma hatası |3−2| = 1, ama yalnız sayıya bakmak yanıltıcıdır: yanlış yerdeki bir kutu da sayıyı “doğru” gösterebilir. Bu yüzden hem F1 hem MAE raporlanır.</>,
          <>Example: 3 predictions, 2 ground-truth boxes → TP={ex.tp}, FP={ex.fp}, FN={ex.fn}; P={m.precision.toFixed(2)}, R={m.recall.toFixed(2)}, F1={m.f1.toFixed(2)}. The count error is |3−2| = 1, but looking only at counts is misleading: a box in the wrong place can still make the count “right”. That is why both F1 and MAE are reported.</>)}</p>
        <Why>{t(<>Ödevin 5. adımı. Python (<code>fd/metrics.py</code>) ve web (<code>lib/metrics.ts</code>) aynı açgözlü eşleştirme algoritmasını kullanır.</>,
          <>Step 5 of the assignment. Python (<code>fd/metrics.py</code>) and the web app (<code>lib/metrics.ts</code>) use the same greedy matching algorithm.</>)}</Why>
      </div>
      <div className="demo">
        <figure className="figure"><canvas ref={ref} className="cv" style={{ maxWidth: 360 }} /><figcaption>{t("Mor: IoU ≥ 0.5 (TP) · Kırmızı: IoU < 0.5 (FP + FN)", "Purple: IoU ≥ 0.5 (TP) · Red: IoU < 0.5 (FP + FN)")}</figcaption></figure>
        <div className="controls">
          <Slider label={t("Yatay kayma", "Horizontal shift")} v={dx} set={setDx} min={-80} max={150} />
          <Slider label={t("Dikey kayma", "Vertical shift")} v={dy} set={setDy} min={-60} max={150} />
          <Slider label={t("Ölçek", "Scale")} v={sw} set={setSw} min={0.4} max={1.6} step={0.05} fmt={(x) => x.toFixed(2)} />
        </div>
      </div>
    </Lesson>
  );
}

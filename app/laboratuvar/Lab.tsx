"use client";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Histogram, ImageView } from "@/components/Viz";
import * as P from "@/lib/imgproc";
import { RGBA } from "@/lib/imgproc";
import { Dataset, DatasetItem, fetchDataset, COND_LABELS } from "@/lib/data";
import { detectHaar, detectYolo, letterbox, loadHaar, loadOpenCV, YoloRaw, YOLO_DEFAULTS, drawBoxes } from "@/lib/detectors";
import { Box, iou, match, prf } from "@/lib/metrics";

const LESSONS = [
  ["piksel", "Piksel matrisi, örnekleme, nicemleme"],
  ["renk", "RGB kanallar ve gri dönüşüm"],
  ["geometri", "Geometrik dönüşümler ve interpolasyon"],
  ["nokta", "Parlaklık, kontrast, gama"],
  ["histogram", "Histogram ve histogram eşitleme"],
  ["clahe", "Adaptif histogram eşitleme (CLAHE)"],
  ["filtre", "Konvolüsyon ve gürültü filtreleri"],
  ["kenar", "Kenar tespiti ve eşikleme"],
  ["vj", "Viola-Jones: integral görüntü, Haar, kaskad"],
  ["yolo", "YOLO: letterbox, ızgara, NMS"],
  ["iou", "IoU ve başarım ölçütleri"],
] as const;

/* ---------------- küçük yardımcı bileşenler ---------------- */
function Lesson({ id, n, title, lead, children }: { id: string; n: number; title: string; lead: string; children: ReactNode }) {
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
const Why = ({ children }: { children: ReactNode }) => <div className="why"><b>Projedeki rolü: </b>{children}</div>;
const F = ({ children }: { children: ReactNode }) => <div className="formula">{children}</div>;

/* ========================================================================= */
export default function Lab() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [item, setItem] = useState<DatasetItem | null>(null);
  const [src, setSrc] = useState<RGBA | null>(null);
  const [active, setActive] = useState<string>("piksel");

  useEffect(() => { fetchDataset().then(setDs).catch(() => {}); }, []);
  const pick = async (it: DatasetItem) => {
    const img = await P.loadImage("/dataset/" + it.file);
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
          <div className="label" style={{ marginBottom: 6 }}>Ders görüntüsü</div>
          <div className="thumbs" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            {ds?.images.map((i) => (
              <button key={i.file} aria-pressed={item?.file === i.file} onClick={() => pick(i)} title={`${COND_LABELS[i.condition]} · ${i.note ?? ""}`}>
                <img src={"/dataset/" + i.file} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <label className="btn btn--sm" style={{ marginTop: 8, width: "100%" }}>
            <Icon name="upload" size={14} /> Kendi görüntün
            <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        {LESSONS.map(([id, t], i) => (
          <a key={id} href={`#${id}`} className={active === id ? "active" : ""}><span className="n">{i + 1}</span>{t}</a>
        ))}
      </aside>
      <div>
        {!im ? <div className="card"><span className="spin" /> Görüntü yükleniyor…</div> : (
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
    <Lesson id="piksel" n={1} title="Dijital görüntü = sayılardan oluşan matris" lead="Kamera sürekli sahneyi uzayda örnekler (piksel) ve parlaklığı nicemler (gri seviye). Bilgisayar için görüntü yalnızca bir sayı matrisidir.">
      <div className="theory">
        <p>Gri bir görüntü <b>f(x, y)</b> fonksiyonudur: her (x, y) konumunda 0 (siyah) ile 255 (beyaz) arası bir tam sayı. Renkli görüntüde her piksel üç sayı taşır (R, G, B).</p>
        <F>{`f : {0..H−1} × {0..W−1} → {0..2^b − 1}\nb = 8 bit → 256 gri seviye\nÇözünürlük: ${im.w} × ${im.h} = ${(im.w * im.h).toLocaleString("tr")} piksel`}</F>
        <ul>
          <li><b>Örnekleme</b> (sampling): uzaysal çözünürlük. Faktör büyüdükçe bloklaşma (aliasing) olur.</li>
          <li><b>Nicemleme</b> (quantization): bit derinliği. Bit azaldıkça yanlış konturlar (false contouring) görülür.</li>
        </ul>
        <Why>Haar dedektörü en küçük 24×24 pencerede çalışır; yüz bundan küçük örneklenirse (uzak/küçük yüz) tespit imkânsızlaşır. YOLO girdiyi 640×640'a yeniden örnekler.</Why>
        <div className="controls">
          <Slider label="Örnekleme faktörü" v={factor} set={setFactor} min={1} max={16} fmt={(v) => `1/${v} (${Math.round(im.w / v)}×${Math.round(im.h / v)})`} />
          <Slider label="Bit derinliği" v={bits} set={setBits} min={1} max={8} fmt={(v) => `${v} bit = ${2 ** v} seviye`} />
        </div>
      </div>
      <div className="demo">
        <ImageView im={sampled} pixelated caption="Örneklenmiş + nicemlenmiş görüntü" />
        <div className="controls">
          <span className="small">Aşağıda gri görüntünün {N}×{N} bölgesinin gerçek değerleri (konum: x={x0}, y={y0})</span>
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
  const [tint, setTint] = useState(true);
  const r = useMemo(() => P.channel(im, 0, tint), [im, tint]), g = useMemo(() => P.channel(im, 1, tint), [im, tint]), b = useMemo(() => P.channel(im, 2, tint), [im, tint]);
  const gw = useMemo(() => P.toGray(im), [im]), ga = useMemo(() => P.toGrayAverage(im), [im]);
  const diff = useMemo(() => {
    const o = new Uint8ClampedArray(gw.data.length);
    for (let i = 0; i < o.length; i++) o[i] = Math.min(255, Math.abs(gw.data[i] - ga.data[i]) * 8);
    return { w: gw.w, h: gw.h, data: o };
  }, [gw, ga]);
  return (
    <Lesson id="renk" n={2} title="RGB kanallar ve ağırlıklı gri dönüşüm" lead="Renkli görüntü üç ayrı gri matristen oluşur. Gri dönüşüm bu üç kanalı, gözün duyarlılığına göre ağırlıklandırarak tek kanala indirir.">
      <div className="theory">
        <F>{`Y = 0.2989·R + 0.5870·G + 0.1140·B   (ITU-R BT.601, MATLAB rgb2gray)\nOrtalama: Y = (R + G + B) / 3   (göz duyarlılığını yok sayar)`}</F>
        <p>Göz yeşile en duyarlı, maviye en az duyarlıdır; bu yüzden G ağırlığı en büyüktür. Sağ altta iki yöntem arasındaki fark (8× büyütülmüş) gösteriliyor: özellikle turuncu/mavi yüzeylerde fark belirgindir.</p>
        <Why>Viola-Jones yalnız <b>gri</b> görüntüde çalışır: Haar özellikleri parlaklık farklarıdır, renk bilgisi kullanılmaz. Bu yüzden projede Haar'a girmeden önce bu ağırlıklarla gri dönüşüm yapılır. YOLO ise 3 kanalı (RGB) birlikte kullanır; ten rengi de bir ipucudur.</Why>
        <label className="toggle"><input type="checkbox" checked={tint} onChange={(e) => setTint(e.target.checked)} /><span className="t-title">Kanalları kendi renginde göster</span></label>
      </div>
      <div className="demo">
        <div className="grid-3" style={{ gap: 8 }}>
          <ImageView im={r} caption="R kanalı" /><ImageView im={g} caption="G kanalı" /><ImageView im={b} caption="B kanalı" />
        </div>
        <div className="grid-3" style={{ gap: 8 }}>
          <ImageView im={gw} caption="Ağırlıklı gri" /><ImageView im={ga} caption="Ortalama gri" /><ImageView im={diff} caption="|fark| × 8" />
        </div>
      </div>
    </Lesson>
  );
}

/* ============================ 3. Geometri ============================ */
function GeometryLesson({ im }: { im: RGBA }) {
  const [deg, setDeg] = useState(20), [sc, setSc] = useState(1), [tx, setTx] = useState(0), [ty, setTy] = useState(0);
  const [fh, setFh] = useState(false), [mode, setMode] = useState<P.Interp>("bilinear");
  const [zoom, setZoom] = useState(6);
  const out = useMemo(() => {
    const base = fh ? P.flip(im, true) : im;
    const M = P.rotationMatrix(im.w, im.h, deg, sc);
    M[2] += tx; M[5] += ty;
    return { img: P.affine(base, M, im.w, im.h, mode), M };
  }, [im, deg, sc, tx, ty, fh, mode]);
  // döndür + geri döndür → bilgi kaybı (PSNR)
  const round = useMemo(() => {
    const a = P.affine(im, P.rotationMatrix(im.w, im.h, deg), im.w, im.h, mode);
    const b = P.affine(a, P.rotationMatrix(im.w, im.h, -deg), im.w, im.h, mode);
    // yalnız merkez bölge (köşeler tuval dışına taşar)
    const c = Math.round(Math.min(im.w, im.h) * 0.25);
    return P.psnr(P.crop(im, c, c, im.w - 2 * c, im.h - 2 * c), P.crop(b, c, c, im.w - 2 * c, im.h - 2 * c));
  }, [im, deg, mode]);
  const zoomed = useMemo(() => {
    const cw = Math.round(im.w / zoom / 2), ch = Math.round(im.h / zoom / 2);
    const c = P.crop(im, Math.round(im.w * 0.42), Math.round(im.h * 0.2), cw, ch);
    return { n: P.resize(c, cw * zoom, ch * zoom, "nearest"), b: P.resize(c, cw * zoom, ch * zoom, "bilinear") };
  }, [im, zoom]);
  const m = out.M.map((v) => v.toFixed(3));
  return (
    <Lesson id="geometri" n={3} title="Döndürme, ölçekleme, öteleme, çevirme" lead="Geometrik dönüşümler piksel değerlerini değil, piksellerin konumunu değiştirir. Hepsi tek bir 2×3 afin matrisle yazılabilir.">
      <div className="theory">
        <F>{`[x']   [ s·cosθ  −s·sinθ  tx' ] [x]\n[y'] = [ s·sinθ   s·cosθ  ty' ] [y]\n                               [1]\nGüncel M = [${m[0]}  ${m[1]}  ${m[2]}]\n           [${m[3]}  ${m[4]}  ${m[5]}]`}</F>
        <ol>
          <li><b>Ters eşleme:</b> çıktıdaki her piksel için kaynaktaki yer <code>M⁻¹·(x′, y′)</code> ile bulunur. İleri eşleme yapılsaydı çıktıda boş delikler kalırdı.</li>
          <li>Bulunan konum genelde tam sayı değildir → <b>interpolasyon</b>: en yakın komşu (hızlı, bloklu) veya çift doğrusal (4 komşunun ağırlıklı ortalaması, yumuşak).</li>
          <li>Merkez etrafında döndürmek için önce merkeze öteleme, döndürme, sonra geri öteleme yapılır (matristeki ofsetler).</li>
        </ol>
        <F>{`Çift doğrusal: f(x,y) ≈ (1−a)(1−b)·f00 + a(1−b)·f10 + (1−a)b·f01 + ab·f11`}</F>
        <p>Döndürüp geri döndürünce görüntü aynı olmaz: interpolasyon bilgi kaybettirir. Merkez bölgede <b>PSNR = {Number.isFinite(round) ? round.toFixed(2) : "∞"} dB</b> ({mode === "nearest" ? "en yakın komşu" : "çift doğrusal"}).</p>
        <Why>Haar Cascade yalnız <b>dik (frontal) ve hafif eğik</b> yüzler için eğitilmiştir; ~15°'den fazla eğik başlarda kaçırır. YOLO eğitimde döndürme/ölçek veri artırmasıyla eğitildiği için daha dayanıklıdır. Bu kaydırıcıyla eğip ardından Canlı Tespit'te deneyebilirsiniz. Ayrıca YOLO'nun letterbox adımı tam olarak bir <b>ölçekleme + öteleme</b> dönüşümüdür.</Why>
        <div className="controls">
          <Slider label="Açı θ" v={deg} set={setDeg} min={-180} max={180} fmt={(v) => `${v}°`} />
          <Slider label="Ölçek s" v={sc} set={setSc} min={0.3} max={2} step={0.05} fmt={(v) => v.toFixed(2)} />
          <Slider label="Öteleme tx" v={tx} set={setTx} min={-150} max={150} fmt={(v) => `${v}px`} />
          <Slider label="Öteleme ty" v={ty} set={setTy} min={-150} max={150} fmt={(v) => `${v}px`} />
          <div className="row">
            <Seg v={mode} set={setMode} opts={[["nearest", "En yakın komşu"], ["bilinear", "Çift doğrusal"]]} />
            <label className="toggle" style={{ padding: "6px 10px" }}><input type="checkbox" checked={fh} onChange={(e) => setFh(e.target.checked)} />Yatay çevir</label>
          </div>
        </div>
      </div>
      <div className="demo">
        <div className="canvas-pair"><ImageView im={im} caption="Orijinal" /><ImageView im={out.img} caption="Dönüştürülmüş" /></div>
        <div className="controls">
          <Slider label="Büyütme (yeniden boyutlandırma)" v={zoom} set={setZoom} min={2} max={12} fmt={(v) => `${v}×`} />
          <div className="canvas-pair">
            <ImageView im={zoomed.n} pixelated caption="En yakın komşu — bloklu" />
            <ImageView im={zoomed.b} pixelated caption="Çift doğrusal — yumuşak" />
          </div>
        </div>
      </div>
    </Lesson>
  );
}

/* ============================ 4. Nokta işlemleri ============================ */
function PointLesson({ im }: { im: RGBA }) {
  const [a, setA] = useState(P.ALPHA), [b, setB] = useState(P.BETA), [gm, setGm] = useState(1), [neg, setNeg] = useState(false);
  const lut = useMemo(() => {
    const l = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) { let x = P.clamp8(a * v + b); x = P.clamp8(255 * Math.pow(x / 255, gm)); l[v] = neg ? 255 - x : x; }
    return l;
  }, [a, b, gm, neg]);
  const out = useMemo(() => P.applyLUT(im, lut), [im, lut]);
  const h0 = useMemo(() => P.lumaHistogram(im), [im]), h1 = useMemo(() => P.lumaHistogram(out), [out]);
  let sat = 0; for (let v = 0; v < 256; v++) if (lut[v] === 255 || lut[v] === 0) sat += h0[v];
  return (
    <Lesson id="nokta" n={4} title="Nokta işlemleri: parlaklık, kontrast, gama" lead="Her çıkış pikseli yalnız aynı konumdaki giriş pikseline bağlıdır: s = T(r). Bu yüzden 256 elemanlı bir arama tablosu (LUT) ile çok hızlı uygulanır.">
      <div className="theory">
        <F>{`Doğrusal:  g = clip(α·f + β, 0, 255)     α: kontrast, β: parlaklık\nGama:      s = 255·(r/255)^γ             γ<1 karanlığı açar\nNegatif:   s = 255 − r`}</F>
        <p>Yeşil eğri dönüşüm fonksiyonu T(r)'dir. α&gt;1 histogramı yayar (kontrast artar), β histogramı kaydırır. Uçlarda 0/255'e <b>doyan</b> pikseller geri döndürülemez bilgi kaybıdır: şu an %{((sat / (im.w * im.h)) * 100).toFixed(1)}.</p>
        <Why>Deneydeki 1. iyileştirme: <b>α = {P.ALPHA}, β = {P.BETA}</b> (tüm görüntülerde sabit). Düşük ışıkta yüzü biraz aydınlatır ama gürültüyü de aynı oranda büyütür; ters ışıkta parlak arka planı 255'te doyurur. Bu işlem projede elle yazılmıştır.</Why>
        <div className="controls">
          <Slider label="Kontrast α" v={a} set={setA} min={0.2} max={3} step={0.05} fmt={(v) => v.toFixed(2)} />
          <Slider label="Parlaklık β" v={b} set={setB} min={-120} max={120} />
          <Slider label="Gama γ" v={gm} set={setGm} min={0.2} max={3} step={0.05} fmt={(v) => v.toFixed(2)} />
          <div className="row">
            <label className="toggle" style={{ padding: "6px 10px" }}><input type="checkbox" checked={neg} onChange={(e) => setNeg(e.target.checked)} />Negatif</label>
            <button className="btn btn--sm" onClick={() => { setA(P.ALPHA); setB(P.BETA); setGm(1); setNeg(false); }}>Deney ayarı</button>
            <button className="btn btn--sm" onClick={() => { setA(1); setB(0); setGm(1); setNeg(false); }}>Kimlik (değişiklik yok)</button>
          </div>
        </div>
      </div>
      <div className="demo">
        <div className="canvas-pair"><ImageView im={im} caption="Giriş" /><ImageView im={out} caption="Çıkış" /></div>
        <div className="canvas-pair">
          <Histogram hist={h0} lut={lut} label="Giriş histogramı + T(r) (yeşil)" height={100} />
          <Histogram hist={h1} label="Çıkış histogramı" height={100} />
        </div>
      </div>
    </Lesson>
  );
}

/* ============================ 5. Histogram eşitleme ============================ */
function HistLesson({ im }: { im: RGBA }) {
  const g = useMemo(() => P.toGray(im), [im]);
  const h = useMemo(() => P.histogram(g.data), [g]);
  const { lut } = useMemo(() => P.equalizeLUT(h), [h]);
  const eq = useMemo(() => P.equalizeGray(g), [g]);
  const heq = useMemo(() => P.histogram(eq.data), [eq]);
  const color = useMemo(() => P.histEqualize(im), [im]);
  const stretched = useMemo(() => P.stretch(im), [im]);
  const e0 = P.entropy(h), e1 = P.entropy(heq);
  return (
    <Lesson id="histogram" n={5} title="Histogram ve histogram eşitleme (elle yazıldı)" lead="Histogram her gri seviyeden kaç piksel olduğunu sayar. Eşitleme, kümülatif dağılımı (CDF) dönüşüm fonksiyonu olarak kullanıp histogramı tüm aralığa yayar.">
      <div className="theory">
        <F>{`h(k) = #{ piksel | f(x,y) = k }            k = 0..255\nCDF(k) = Σ_{j≤k} h(j)\ns_k = round( (CDF(k) − CDF_min) / (N − CDF_min) · 255 )`}</F>
        <ol>
          <li>Histogramı say (tek geçiş).</li>
          <li>Kümülatif toplamı al (turuncu eğri).</li>
          <li>CDF'yi 0–255'e normalize et → LUT (yeşil eğri).</li>
          <li>Her pikseli LUT ile eşle. Renkli görüntüde yalnız <b>Y (parlaklık)</b> kanalı eşitlenir; Cr/Cb korunur, renk tonu bozulmaz.</li>
        </ol>
        <p>Entropi {e0.toFixed(2)} → {e1.toFixed(2)} bit. Eşitleme seviyeleri birleştirebildiği için entropiyi <b>artıramaz</b>; görüntü “daha zengin” görünse de yeni bilgi eklenmez, var olan kontrast yeniden dağıtılır.</p>
        <Why>Projedeki “en az bir algoritmayı kendiniz yazın” şartı bu adımla karşılanır (<code>python/fd/enhance.py</code> ve <code>lib/imgproc.ts</code>). Doğrulama: elle yazılan sürüm <code>cv2.equalizeHist</code> ile <b>piksel piksel aynı</b> çıktı verir (maks. fark 0). Düşük ışıkta Viola-Jones recall'unu büyük ölçüde artırır; ancak normal görüntülerde gürültü ve arka plan dokusunu da güçlendirip yanlış pozitiflere yol açabilir.</Why>
      </div>
      <div className="demo">
        <div className="canvas-pair"><ImageView im={g} caption="Gri giriş" /><ImageView im={eq} caption="Eşitlenmiş" /></div>
        <div className="canvas-pair">
          <Histogram hist={h} cdf lut={lut} label="Giriş: histogram, CDF (turuncu), LUT (yeşil)" height={100} />
          <Histogram hist={heq} cdf label="Çıkış: CDF neredeyse doğrusal" height={100} />
        </div>
        <div className="canvas-pair"><ImageView im={color} caption="Renkli HE (Y kanalı)" /><ImageView im={stretched} caption="Karşılaştırma: histogram germe (min-max)" /></div>
      </div>
    </Lesson>
  );
}

/* ============================ 6. CLAHE ============================ */
function ClaheLesson({ im }: { im: RGBA }) {
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
  // örnek blok histogramı: kırpma etkisi
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
    <Lesson id="clahe" n={6} title="CLAHE: kontrast sınırlı adaptif histogram eşitleme" lead="Global HE tüm görüntü için tek bir LUT kullanır. CLAHE görüntüyü bloklara böler, her bloğa ayrı ama kırpılmış bir eşitleme uygular ve blok sınırlarını çift doğrusal interpolasyonla birleştirir.">
      <div className="theory">
        <ol>
          <li>Görüntüyü {tiles}×{tiles} bloğa böl (turuncu ızgara).</li>
          <li>Her bloğun histogramını hesapla.</li>
          <li>Histogramı <code>limit = clip · N_blok / 256</code> = {tile.limit} değerinde <b>kırp</b>; taşan sayımı tüm kutulara eşit dağıt. Bu, eğimi (kontrast kazancını) sınırlar → gürültü aşırı büyümez.</li>
          <li>Her blok için CDF → LUT.</li>
          <li>Her piksel, en yakın 4 bloğun LUT çıktısının çift doğrusal ağırlıklı ortalamasıyla eşlenir (blok kenarı izi oluşmaz).</li>
        </ol>
        <Why>Deneydeki 3. iyileştirme: <b>clipLimit = {P.CLAHE_CLIP}, blok = {P.CLAHE_TILES}×{P.CLAHE_TILES}</b>. Ters ışıkta (karanlık yüz + parlak arka plan) global HE parlak alana takılırken CLAHE yüz bölgesini yerel olarak açar. Deney hattında Python ile birebir aynı sonuç için OpenCV'nin CLAHE'si kullanılır; buradaki sürüm aynı algoritmanın eğitim amaçlı elle yazılmış hâlidir.</Why>
        <div className="controls">
          <Slider label="Clip limit" v={clip} set={setClip} min={1} max={10} step={0.5} />
          <Slider label="Blok sayısı (kenar başına)" v={tiles} set={setTiles} min={2} max={16} />
          <label className="toggle" style={{ padding: "6px 10px" }}><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />Blok ızgarasını göster</label>
        </div>
        <div className="canvas-pair">
          <Histogram hist={tile.hh} label="Örnek blok: ham histogram" height={80} />
          <Histogram hist={tile.clipped} label="Kırpılmış + yeniden dağıtılmış" height={80} color="var(--warm)" />
        </div>
      </div>
      <div className="demo">
        <div className="canvas-pair">
          <ImageView im={he} caption="Global HE" />
          <figure className="figure"><canvas ref={ref} className="cv" /><figcaption>CLAHE (elle yazılmış)</figcaption></figure>
        </div>
        <ImageView im={g} caption="Gri giriş" />
      </div>
    </Lesson>
  );
}

/* ============================ 7. Filtreler ============================ */
function FilterLesson({ im }: { im: RGBA }) {
  const [noise, setNoise] = useState(0.05), [ks, setKs] = useState(3), [sigma, setSigma] = useState(1);
  const [kind, setKind] = useState<"mean" | "gauss" | "median" | "sharpen">("median");
  const noisy = useMemo(() => P.saltPepper(im, noise), [im, noise]);
  const kernel = kind === "mean" ? P.meanKernel(ks) : kind === "gauss" ? P.gaussianKernel(ks, sigma) : kind === "sharpen" ? P.SHARPEN : null;
  const kSize = kind === "sharpen" ? 3 : ks;
  const out = useMemo(() => (kind === "median" ? P.median(noisy, ks) : P.convolve(noisy, kernel!, kSize)), [noisy, kind, ks, sigma]); // eslint-disable-line react-hooks/exhaustive-deps
  const p0 = P.psnr(im, noisy), p1 = P.psnr(im, out);
  return (
    <Lesson id="filtre" n={7} title="Konvolüsyon, ortalama / Gauss / medyan filtre" lead="Komşuluk işlemlerinde çıkış pikseli, giriş pikselinin etrafındaki bir pencereye bağlıdır. Doğrusal filtreler bir çekirdekle (kernel) konvolüsyondur; medyan doğrusal değildir.">
      <div className="theory">
        <F>{`Konvolüsyon:  g(x,y) = Σ_i Σ_j h(i,j) · f(x−i, y−j)\nKorelasyon:   g(x,y) = Σ_i Σ_j h(i,j) · f(x+i, y+j)\n→ Konvolüsyon = çekirdeği 180° çevirip korelasyon. Simetrik çekirdekte ikisi aynı.`}</F>
        <ul>
          <li><b>Ortalama</b>: tüm ağırlıklar 1/n². Gürültüyü azaltır, kenarları bulanıklaştırır.</li>
          <li><b>Gauss</b>: ağırlıklar merkezden uzaklaştıkça azalır (σ). Daha doğal yumuşatma; YOLO/CNN'lerin ilk katmanları da benzer çekirdekler öğrenir.</li>
          <li><b>Medyan</b>: pencere sıralanır, ortanca seçilir. Tuz-biber gürültüsünde en iyisidir, kenarı korur.</li>
          <li><b>Keskinleştirme</b>: merkez − komşular (Laplace tabanlı).</li>
        </ul>
        <p>PSNR (temiz görüntüye göre): gürültülü <b>{p0.toFixed(2)} dB</b> → filtreli <b>{p1.toFixed(2)} dB</b>.</p>
        <Why>Düşük ışıkta sensör gürültüsü artar; HE/CLAHE bu gürültüyü de büyütür. Haar özellikleri dikdörtgen toplamları olduğundan doğal bir ortalama filtresi gibi davranır ve küçük gürültüye görece dayanıklıdır, ancak güçlendirilmiş doku yanlış pozitif üretir. CNN tabanlı YOLO, tam olarak bu konvolüsyon işleminin öğrenilmiş çekirdeklerle onlarca katman üst üste uygulanmasıdır.</Why>
        <div className="controls">
          <Seg v={kind} set={setKind} opts={[["mean", "Ortalama"], ["gauss", "Gauss"], ["median", "Medyan"], ["sharpen", "Keskinleştir"]]} />
          <Slider label="Tuz-biber gürültü oranı" v={noise} set={setNoise} min={0} max={0.3} step={0.01} fmt={(v) => `%${Math.round(v * 100)}`} />
          {kind !== "sharpen" && <Slider label="Pencere boyutu" v={ks} set={setKs} min={3} max={9} step={2} fmt={(v) => `${v}×${v}`} />}
          {kind === "gauss" && <Slider label="σ" v={sigma} set={setSigma} min={0.5} max={4} step={0.1} fmt={(v) => v.toFixed(1)} />}
          {kernel && (
            <div className="kernel" style={{ gridTemplateColumns: `repeat(${kSize}, auto)` }}>
              {kernel.map((v, i) => <span key={i}>{Math.abs(v) < 1 && v !== 0 ? v.toFixed(3) : v}</span>)}
            </div>
          )}
        </div>
      </div>
      <div className="demo">
        <div className="canvas-pair"><ImageView im={noisy} caption="Gürültülü giriş" /><ImageView im={out} caption="Filtrelenmiş" /></div>
      </div>
    </Lesson>
  );
}

/* ============================ 8. Kenar ============================ */
function EdgeLesson({ im }: { im: RGBA }) {
  const [op, setOp] = useState<"sobel" | "prewitt">("sobel"), [auto, setAuto] = useState(true), [t, setT] = useState(60);
  const g = useMemo(() => P.toGray(im), [im]);
  const mag = useMemo(() => P.gradient(g, op), [g, op]);
  const ot = useMemo(() => P.otsu(mag), [mag]);
  const thr = auto ? ot : t;
  const bin = useMemo(() => P.threshold(mag, thr), [mag, thr]);
  return (
    <Lesson id="kenar" n={8} title="Sobel / Prewitt kenar tespiti ve Otsu eşikleme" lead="Kenar, parlaklığın hızla değiştiği yerdir; türevle (gradyan) bulunur. Gradyan büyüklüğü eşiklenerek ikili kenar haritası elde edilir.">
      <div className="theory">
        <F>{op === "sobel"
          ? `Gx = [−1 0 1; −2 0 2; −1 0 1]   Gy = [−1 −2 −1; 0 0 0; 1 2 1]\n|G| = √(Gx² + Gy²)     θ = atan2(Gy, Gx)`
          : `Gx = [−1 0 1; −1 0 1; −1 0 1]   Gy = [−1 −1 −1; 0 0 0; 1 1 1]\n|G| = √(Gx² + Gy²)`}</F>
        <p>Sobel, merkez satıra 2 ağırlık vererek Prewitt'e göre gürültüye biraz daha dayanıklıdır. <b>Otsu</b> eşiği, iki sınıf (kenar/arka plan) arasındaki varyansı en büyükleyen eşiktir: şu an T = {ot}.</p>
        <Why>Haar özellikleri aslında kaba, ölçeklenebilir <b>kenar ve çizgi dedektörleridir</b>: “göz bölgesi yanaktan koyu”, “burun kemeri yanlardan açık” gibi parlaklık farklarını ölçer. YOLO'nun ilk konvolüsyon katmanları da Sobel benzeri yönlü kenar filtreleri öğrenir. Düşük ışıkta gradyanlar zayıfladığı için iki dedektör de zorlanır; HE/CLAHE gradyanları büyütür.</Why>
        <div className="controls">
          <Seg v={op} set={setOp} opts={[["sobel", "Sobel"], ["prewitt", "Prewitt"]]} />
          <label className="toggle" style={{ padding: "6px 10px" }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Otsu ile otomatik eşik</label>
          {!auto && <Slider label="Eşik T" v={t} set={setT} min={0} max={255} />}
        </div>
      </div>
      <div className="demo">
        <div className="canvas-pair"><ImageView im={mag} caption="Gradyan büyüklüğü |G|" /><ImageView im={bin} caption={`İkili kenar haritası (T=${thr})`} /></div>
      </div>
    </Lesson>
  );
}

/* ============================ 9. Viola-Jones ============================ */
function VJLesson({ src, item }: { src: RGBA; item: DatasetItem | null }) {
  const [mn, setMn] = useState(0);
  const [raw, setRaw] = useState<Box[] | null>(null);
  const [final, setFinal] = useState<Box[] | null>(null);
  const [busy, setBusy] = useState(false);
  const g = useMemo(() => P.toGray(src), [src]);
  const ii = useMemo(() => P.integralImage(g), [g]);
  const face: Box | null = (item?.faces?.[0] as Box) ?? null;
  // Haar benzeri özellikleri ilk referans yüzün üzerinde hesapla
  const feats = useMemo(() => {
    if (!face) return null;
    const [x, y, w, h] = face.map(Math.round);
    const S = (a: number, b: number, c: number, d: number) => P.rectSum(ii, g.w, Math.round(a), Math.round(b), Math.max(1, Math.round(c)), Math.max(1, Math.round(d)));
    const mean = (a: number, b: number, c: number, d: number) => S(a, b, c, d) / (Math.max(1, Math.round(c)) * Math.max(1, Math.round(d)));
    const eyeY = y + h * 0.3, band = h * 0.15;
    return [
      { name: "Kenar (2 dikdörtgen): göz bandı vs. yanak", rects: [[x, eyeY, w, band, "dark"], [x, eyeY + band, w, band, "light"]], v: mean(x, eyeY + band, w, band) - mean(x, eyeY, w, band) },
      { name: "Çizgi (3 dikdörtgen): burun kemeri vs. gözler", rects: [[x + w * 0.15, eyeY, w * 0.23, band, "dark"], [x + w * 0.38, eyeY, w * 0.24, band, "light"], [x + w * 0.62, eyeY, w * 0.23, band, "dark"]], v: mean(x + w * 0.38, eyeY, w * 0.24, band) - (mean(x + w * 0.15, eyeY, w * 0.23, band) + mean(x + w * 0.62, eyeY, w * 0.23, band)) / 2 },
      { name: "Dörtlü (köşegen)", rects: [[x, y, w / 2, h / 2, "dark"], [x + w / 2, y, w / 2, h / 2, "light"], [x, y + h / 2, w / 2, h / 2, "light"], [x + w / 2, y + h / 2, w / 2, h / 2, "dark"]], v: mean(x + w / 2, y, w / 2, h / 2) + mean(x, y + h / 2, w / 2, h / 2) - mean(x, y, w / 2, h / 2) - mean(x + w / 2, y + h / 2, w / 2, h / 2) },
    ];
  }, [face, ii, g.w]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    P.drawToCanvas(ref.current, g);
    const ctx = ref.current.getContext("2d")!;
    if (raw) drawBoxes(ctx, raw, "rgba(224,121,91,0.55)", undefined, false, 1);
    if (final) drawBoxes(ctx, final, "#1f9d55", final.map(() => "yüz"), false, 3);
    if (feats && !raw) feats.forEach((f, k) => f.rects.forEach((r) => {
      ctx.fillStyle = r[4] === "dark" ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.55)";
      ctx.fillRect(+r[0], +r[1] + k * 0, +r[2], +r[3]);
    }));
  }, [g, raw, final, feats]);
  const run = async () => {
    setBusy(true);
    await loadOpenCV(); await loadHaar();
    const r = await detectHaar(src, { scaleFactor: 1.1, minNeighbors: 0, minSize: 24 }, g);
    const f = await detectHaar(src, { scaleFactor: 1.1, minNeighbors: Math.max(1, mn || 5), minSize: 24 }, g);
    setRaw(r.boxes); setFinal(f.boxes); setBusy(false);
  };
  // örnek dikdörtgen toplamı
  const demoRect = { x: Math.round(g.w * 0.3), y: Math.round(g.h * 0.2), w: Math.round(g.w * 0.2), h: Math.round(g.h * 0.15) };
  const sumFast = P.rectSum(ii, g.w, demoRect.x, demoRect.y, demoRect.w, demoRect.h);
  return (
    <Lesson id="vj" n={9} title="Viola-Jones: integral görüntü + Haar özellikleri + AdaBoost kaskadı" lead="2001'de gerçek zamanlı yüz tespitini mümkün kılan klasik yöntem. Dört fikrin birleşimidir: Haar özellikleri, integral görüntü, AdaBoost ile özellik seçimi ve dikkat kaskadı.">
      <div className="theory">
        <ol>
          <li><b>Haar özellikleri:</b> siyah ve beyaz dikdörtgenlerin piksel toplamları farkı. Yüzde göz bölgesi yanaktan, gözler burun kemerinden koyudur. 24×24 pencerede ~160.000 olası özellik vardır.</li>
          <li><b>İntegral görüntü:</b> her konumdaki değer, sol-üstündeki tüm piksellerin toplamıdır. Herhangi bir dikdörtgenin toplamı, boyutundan bağımsız olarak <b>4 okuma</b> ile hesaplanır → özellik hesabı O(1).</li>
          <li><b>AdaBoost:</b> her biri tek bir özellik + eşikten oluşan zayıf sınıflandırıcılar içinden en ayırt edici olanları seçer ve ağırlıklı toplar.</li>
          <li><b>Kaskad:</b> sınıflandırıcılar aşamalara dizilir (bu modelde 25 aşama). İlk aşamalar az özellikle arka plan pencerelerinin çoğunu hemen eler; yalnız “yüze benzeyen” pencereler sonraki aşamalara geçer → hız.</li>
          <li><b>Çok ölçekli tarama:</b> pencere görüntü üzerinde kaydırılır, görüntü her adımda <code>scaleFactor = 1.1</code> oranında küçültülür (piramit). Aynı yüz çok sayıda örtüşen aday üretir; <code>minNeighbors</code> en az bu kadar komşusu olan adayları tutup gruplar.</li>
        </ol>
        <F>{`ii(x,y) = Σ_{x'≤x, y'≤y} i(x',y')\nToplam(D) = ii(4) − ii(2) − ii(3) + ii(1)\nÖrnek: ${demoRect.w}×${demoRect.h} dikdörtgen toplamı = ${sumFast.toLocaleString("tr")} (yalnız 4 okuma)`}</F>
        {feats && (
          <div className="table-wrap"><table><thead><tr><th>Haar özelliği (referans yüz üzerinde)</th><th>değer</th></tr></thead>
            <tbody>{feats.map((f) => <tr key={f.name}><td>{f.name}</td><td>{f.v.toFixed(1)}</td></tr>)}</tbody></table></div>
        )}
        <Why>Projedeki <b>klasik dedektör</b>. Model: OpenCV <code>haarcascade_frontalface_default.xml</code> (Lienhart). Sabit ayarlar: scaleFactor 1.1, minNeighbors 5, minSize 24×24. Parlaklık <b>farklarına</b> dayandığı için düşük ışıkta farklar sıfıra yaklaşır ve aşamalar yüzü reddeder; HE/CLAHE bu farkları yeniden büyüttüğü için recall belirgin artar.</Why>
        <div className="controls">
          <Slider label="minNeighbors (gruplama eşiği)" v={mn || 5} set={setMn} min={1} max={15} />
          <button className="btn btn--accent" onClick={run} disabled={busy}>{busy ? <><span className="spin" /> çalışıyor</> : "Ham adayları + son tespitleri göster"}</button>
          {raw && <span className="small">minNeighbors=0 ile <b>{raw.length}</b> ham aday pencere (turuncu) → gruplama sonrası <b>{final?.length}</b> yüz (yeşil).</span>}
        </div>
      </div>
      <div className="demo">
        <figure className="figure"><canvas ref={ref} className="cv" /><figcaption>{raw ? "Turuncu: kaskadı geçen tüm pencereler · Yeşil: minNeighbors sonrası" : "Gri girdi üzerinde örnek Haar özellikleri (koyu/açık dikdörtgenler)"}</figcaption></figure>
      </div>
    </Lesson>
  );
}

/* ============================ 10. YOLO ============================ */
function YoloLesson({ src }: { src: RGBA }) {
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
    <Lesson id="yolo" n={10} title="YOLOv8n-face: tek bakışta tespit" lead="“You Only Look Once”: görüntü tek bir ileri geçişte evrişimli sinir ağından geçer; ağ her ızgara hücresi için kutu + güven skoru tahmin eder. Bu projede WIDER FACE ile yüz için eğitilmiş bir model kullanılır (genel “person” sınıfı değil).">
      <div className="theory">
        <ol>
          <li><b>Letterbox:</b> görüntü en-boy oranı korunarak 640×640'a ölçeklenir (r = {lb.r.toFixed(3)}), kalan alan gri (114) ile doldurulur (ofset {lb.px}, {lb.py}). Bu bir ölçekleme + öteleme dönüşümüdür; çıkıştaki kutular ters dönüşümle orijinal koordinata geri taşınır.</li>
          <li><b>Normalizasyon:</b> piksel/255 → [0,1], HWC → CHW tensör [1, 3, 640, 640].</li>
          <li><b>Omurga + boyun (CSPDarknet + PAN):</b> art arda konvolüsyon, BatchNorm, SiLU katmanları; 3 ölçekte öznitelik haritası: adım 8 (80×80), 16 (40×40), 32 (20×20).</li>
          <li><b>Çıkış:</b> 80² + 40² + 20² = <b>8400</b> aday; her biri (cx, cy, w, h, skor). Anchor-free: kutu doğrudan hücre merkezine göre tahmin edilir.</li>
          <li><b>Güven eşiği</b> (conf ≥ {conf}) → adaylar (turuncu). <b>NMS</b>: skor sırasıyla, tutulan kutuyla IoU ≥ {nmsT} olanları sil → son kutular (yeşil).</li>
        </ol>
        <F>{`Model: yolov8n-face-lindevs.onnx (~3M parametre, 12 MB)\nKaynak: github.com/lindevs/yolov8-face (v1.0.1, WIDER FACE)\nÇalışma zamanı: onnxruntime-web (WASM), tarayıcıda`}</F>
        <Why>Projedeki <b>derin öğrenme dedektörü</b>. Eğitim verisindeki (WIDER FACE) aydınlatma, ölçek ve poz çeşitliliği sayesinde ön işlemeye neredeyse ihtiyaç duymaz. Ön işleme ancak görüntü istatistiğini eğitim dağılımından uzaklaştırırsa (aşırı gürültü güçlendirme) zarar verebilir.</Why>
        <div className="controls">
          <Slider label="Güven eşiği" v={conf} set={setConf} min={0.05} max={0.95} step={0.05} fmt={(v) => v.toFixed(2)} />
          <Slider label="NMS IoU eşiği" v={nmsT} set={setNmsT} min={0.1} max={0.9} step={0.05} fmt={(v) => v.toFixed(2)} />
          <div className="row"><span className="small">Izgara:</span>
            <Seg v={String(showGrid) as "0" | "8" | "16" | "32"} set={(v) => setShowGrid(+v as 0 | 8 | 16 | 32)} opts={[["0", "yok"], ["8", "80×80"], ["16", "40×40"], ["32", "20×20"]]} /></div>
          <button className="btn btn--accent" onClick={run} disabled={busy}>{busy ? <><span className="spin" /> çalışıyor</> : "Modeli çalıştır"}</button>
          {dbg && <span className="small">8400 aday → eşik sonrası <b>{dbg.candidates}</b> → NMS sonrası <b>{fin?.length}</b> yüz · çıkarım {ms.toFixed(0)} ms</span>}
        </div>
      </div>
      <div className="demo">
        <figure className="figure"><canvas ref={ref} className="cv" /><figcaption>640×640 letterbox girdi · turuncu: NMS öncesi · yeşil: NMS sonrası</figcaption></figure>
      </div>
    </Lesson>
  );
}

/* ============================ 11. IoU ============================ */
function IoULesson() {
  const gt: Box = [80, 60, 120, 140];
  const [dx, setDx] = useState(30), [dy, setDy] = useState(20), [sw, setSw] = useState(1);
  const pred: Box = [80 + dx, 60 + dy, 120 * sw, 140 * sw];
  const v = iou(pred, gt);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = 360; c.height = 300;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface-2"); ctx.fillRect(0, 0, 360, 300);
    const ix = Math.max(gt[0], pred[0]), iy = Math.max(gt[1], pred[1]);
    const iw = Math.min(gt[0] + gt[2], pred[0] + pred[2]) - ix, ih = Math.min(gt[1] + gt[3], pred[1] + pred[3]) - iy;
    if (iw > 0 && ih > 0) { ctx.fillStyle = "rgba(141,145,191,.5)"; ctx.fillRect(ix, iy, iw, ih); }
    drawBoxes(ctx, [gt], "#1f9d55", ["referans"], true);
    drawBoxes(ctx, [pred], v >= 0.5 ? "#564d80" : "#d64545", [`tahmin · IoU ${v.toFixed(2)}`]);
  }, [dx, dy, sw]); // eslint-disable-line react-hooks/exhaustive-deps
  // küçük örnek: eşleştirme
  const ex = match([[10, 10, 50, 50], [12, 12, 50, 50], [200, 200, 40, 40]], [[10, 10, 52, 52], [100, 100, 40, 40]]);
  const m = prf(ex.tp, ex.fp, ex.fn);
  return (
    <Lesson id="iou" n={11} title="IoU, bire bir eşleştirme ve başarım ölçütleri" lead="Bir tahmin kutusunun doğru sayılması için referans kutuyla yeterince örtüşmesi gerekir. Ölçüt: kesişim / birleşim (IoU).">
      <div className="theory">
        <F>{`IoU = |A ∩ B| / |A ∪ B|        doğru eşleşme: IoU ≥ 0.50\nPrecision = TP / (TP + FP)      ("bulduklarımın ne kadarı yüz?")\nRecall    = TP / (TP + FN)      ("yüzlerin ne kadarını buldum?")\nF1        = 2·P·R / (P + R)\nSayma hatası = |tahmin sayısı − gerçek sayı|,  MAE = ortalama`}</F>
        <ol>
          <li>Tüm (tahmin, referans) çiftlerinin IoU'su hesaplanır; IoU ≥ 0.5 olanlar büyükten küçüğe sıralanır.</li>
          <li>Sırayla, ikisi de daha önce kullanılmamışsa eşleştirilir (<b>bire bir</b>): aynı yüze iki kutu çizilirse biri TP, diğeri FP olur.</li>
          <li>Eşleşmeyen tahminler FP, eşleşmeyen referanslar FN'dir.</li>
        </ol>
        <p>Örnek: 3 tahmin, 2 referans → TP={ex.tp}, FP={ex.fp}, FN={ex.fn}; P={m.precision.toFixed(2)}, R={m.recall.toFixed(2)}, F1={m.f1.toFixed(2)}. Sayma hatası |3−2| = 1, ama yalnız sayıya bakmak yanıltıcıdır: yanlış yerdeki bir kutu da sayıyı “doğru” gösterebilir. Bu yüzden hem F1 hem MAE raporlanır.</p>
        <Why>Ödevin 5. adımı. Python (<code>fd/metrics.py</code>) ve web (<code>lib/metrics.ts</code>) aynı açgözlü eşleştirme algoritmasını kullanır.</Why>
      </div>
      <div className="demo">
        <figure className="figure"><canvas ref={ref} className="cv" style={{ maxWidth: 360 }} /><figcaption>Mor: IoU ≥ 0.5 (TP) · Kırmızı: IoU &lt; 0.5 (FP + FN)</figcaption></figure>
        <div className="controls">
          <Slider label="Yatay kayma" v={dx} set={setDx} min={-80} max={150} />
          <Slider label="Dikey kayma" v={dy} set={setDy} min={-60} max={150} />
          <Slider label="Ölçek" v={sw} set={setSw} min={0.4} max={1.6} step={0.05} fmt={(x) => x.toFixed(2)} />
        </div>
      </div>
    </Lesson>
  );
}

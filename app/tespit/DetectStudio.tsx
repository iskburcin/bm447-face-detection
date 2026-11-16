"use client";
import { BASE } from "@/lib/base";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Histogram, ImageView } from "@/components/Viz";
import { RGBA, fromImageElement, loadImage, lumaHistogram, meanStd, toGray, entropy } from "@/lib/imgproc";
import { detectHaar, detectYolo, Detection, HAAR_DEFAULTS, YOLO_DEFAULTS, loadHaar, loadYolo } from "@/lib/detectors";
import { DEFAULT_PIPELINE, PipelineOpts, presetFor, runPipeline, Stage } from "@/lib/pipeline";
import { Dataset, DatasetItem, fetchDataset, ENH_KEYS, ENH_LABELS, COND_LABELS, ENH_EN, COND_EN } from "@/lib/data";
import { useT } from "@/components/I18n";

const STAGE_EN: Record<string, string> = { src: "Input", bc: "Brightness / Contrast", he: "Histogram Equalization", clahe: "CLAHE" };
const detailEn = (d: string) => d.replace("elle yazıldı · Y kanalı", "hand-written · Y channel").replace("· elle", "· by hand");
import { Box, match, prf } from "@/lib/metrics";

type Which = "both" | "yolo" | "haar";

export default function DetectStudio() {
  const t = useT();
  const stTitle = (s: Stage) => t(s.title, STAGE_EN[s.key] ?? s.title);
  const stDetail = (s: Stage) => t(s.detail, detailEn(s.detail));
  const [ds, setDs] = useState<Dataset | null>(null);
  const [item, setItem] = useState<DatasetItem | null>(null);
  const [src, setSrc] = useState<RGBA | null>(null);
  const [srcName, setSrcName] = useState("");
  const [pipe, setPipe] = useState<PipelineOpts>(DEFAULT_PIPELINE);
  const [stages, setStages] = useState<Stage[]>([]);
  const [which, setWhich] = useState<Which>("both");
  const [haarP, setHaarP] = useState(HAAR_DEFAULTS);
  const [yoloP, setYoloP] = useState(YOLO_DEFAULTS);
  const [yolo, setYolo] = useState<Detection | null>(null);
  const [haar, setHaar] = useState<Detection | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [models, setModels] = useState({ yolo: false, haar: false });
  const [cam, setCam] = useState(false);
  const [live, setLive] = useState(false);
  const [drag, setDrag] = useState(false);
  const [auto, setAuto] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollNext = useRef(false); // ilk otomatik seçimde kaydırma yapma

  // veri kümesi + modelleri arka planda yükle
  useEffect(() => {
    fetchDataset().then(setDs).catch((e) => setErr(String(e)));
    loadYolo().then(() => setModels((m) => ({ ...m, yolo: true }))).catch((e) => setErr("YOLO: " + e));
    loadHaar().then(() => setModels((m) => ({ ...m, haar: true }))).catch((e) => setErr("OpenCV: " + e));
  }, []);

  const pickSample = useCallback(async (it: DatasetItem) => {
    const img = await loadImage(BASE + "/dataset/" + it.file);
    setItem(it); setSrc(fromImageElement(img, 4096)); setSrcName(it.file); setYolo(null); setHaar(null);
    if (scrollNext.current) document.getElementById("asama-2")?.scrollIntoView({ behavior: "smooth", block: "start" });
    scrollNext.current = true;
  }, []);
  useEffect(() => { if (ds && !src) pickSample(ds.images.find((i) => i.condition === "low_light") ?? ds.images[0]); }, [ds, src, pickSample]);

  const onFile = async (f?: File | null) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    try {
      const img = await loadImage(url);
      setItem(null); setSrc(fromImageElement(img, 1280)); setSrcName(f.name); setYolo(null); setHaar(null);
      document.getElementById("asama-2")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally { URL.revokeObjectURL(url); }
  };

  // ön işleme zinciri her değişiklikte yeniden hesaplanır
  useEffect(() => {
    if (!src) return;
    let alive = true;
    runPipeline(src, pipe).then((s) => alive && setStages(s)).catch((e) => setErr(String(e)));
    return () => { alive = false; };
  }, [src, pipe]);
  const processed = stages.length ? stages[stages.length - 1].im : null;

  const detect = useCallback(async (im: RGBA | null = processed) => {
    if (!im) return;
    setBusy(t("Tespit ediliyor…", "Detecting…")); setErr(null);
    try {
      if (which !== "haar") setYolo(await detectYolo(im, yoloP)); else setYolo(null);
      if (which !== "yolo") setHaar(await detectHaar(im, haarP)); else setHaar(null);
    } catch (e) { setErr(String(e)); }
    setBusy(null);
  }, [processed, which, yoloP, haarP, t]);

  // otomatik tespit: işlenmiş görüntü veya ayarlar değişince (canlı mod kendi döngüsünü kullanır)
  useEffect(() => {
    if (!auto || live || !processed || (!models.yolo && !models.haar)) return;
    const t = setTimeout(() => detect(processed), 150);
    return () => clearTimeout(t);
  }, [auto, live, processed, models.yolo, models.haar, detect]);

  // ---- kamera ----
  const startCam = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720 }, audio: false });
      streamRef.current = st; setCam(true);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = st; videoRef.current.play(); } });
    } catch (e) { setErr(t("Kamera açılamadı: ", "Could not open camera: ") + e); }
  };
  const stopCam = () => { liveRef.current = false; setLive(false); streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setCam(false); };
  useEffect(() => () => stopCam(), []);
  const snap = () => { if (videoRef.current) { setItem(null); setSrc(fromImageElement(videoRef.current, 960)); setSrcName(t("kamera karesi", "camera frame")); } };
  useEffect(() => {
    liveRef.current = live;
    if (!live) return;
    let stop = false;
    const loop = async () => {
      while (!stop && liveRef.current && videoRef.current) {
        const fr = fromImageElement(videoRef.current, 640);
        const st = await runPipeline(fr, pipe);
        const im = st[st.length - 1].im;
        setItem(null); setSrc(fr); setSrcName(t("canlı kamera", "live camera"));
        if (which !== "haar") setYolo(await detectYolo(im, yoloP));
        if (which !== "yolo") setHaar(await detectHaar(im, haarP));
        await new Promise((r) => setTimeout(r, 30));
      }
    };
    loop();
    return () => { stop = true; };
  }, [live, pipe, which, yoloP, haarP]);

  const gt = item?.faces as Box[] | undefined;
  const evalOf = (d: Detection | null) => {
    if (!d || !gt) return null;
    const m = match(d.boxes, gt); return { ...m, ...prf(m.tp, m.fp, m.fn) };
  };
  const ey = evalOf(yolo), eh = evalOf(haar);
  const activePreset = ENH_KEYS.find((k) => JSON.stringify(presetFor(k)) === JSON.stringify(pipe));

  const download = () => {
    const c = document.querySelector<HTMLCanvasElement>("#yolo-out canvas") ?? document.querySelector<HTMLCanvasElement>("#haar-out canvas");
    if (!c) return;
    const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = "tespit_sonucu.png"; a.click();
  };

  const s1 = stages[0], sN = stages[stages.length - 1];
  const hSrc = useMemo(() => (src ? lumaHistogram(src) : null), [src]);
  const hProc = useMemo(() => (processed ? lumaHistogram(processed) : null), [processed]);
  const statOf = (im: RGBA | null, h: Uint32Array | null) => {
    if (!im || !h) return "";
    const m = meanStd(toGray(im));
    return `μ=${m.mean.toFixed(1)} · σ=${m.std.toFixed(1)} · H=${entropy(h).toFixed(2)} bit`;
  };
  const models3 = [
    { key: "yolo", title: "YOLOv8n-face", icon: "cpu", color: "#7c6fd0", chip: "chip--yolo", d: yolo, e: ey, labels: yolo?.scores.map((s) => `face ${s.toFixed(2)}`), timeLabel: "session.run" },
    { key: "haar", title: "Viola-Jones (Haar)", icon: "grid", color: "#e0795b", chip: "chip--haar", d: haar, e: eh, labels: haar?.boxes.map(() => t("yüz", "face")), timeLabel: "detectMultiScale" },
  ];
  type M = (typeof models3)[number];
  const cmpRows: [string, (m: M) => number | null, "max" | "min", (v: number) => string][] = [
    [t("Tespit edilen yüz", "Detected faces"), (m) => m.d?.boxes.length ?? null, "max", (v) => String(v)],
    ["TP (IoU ≥ 0.5)", (m) => m.e?.tp ?? null, "max", (v) => String(v)],
    ["FP", (m) => m.e?.fp ?? null, "min", (v) => String(v)],
    ["FN", (m) => m.e?.fn ?? null, "min", (v) => String(v)],
    ["Precision", (m) => m.e?.precision ?? null, "max", (v) => v.toFixed(2)],
    ["Recall", (m) => m.e?.recall ?? null, "max", (v) => v.toFixed(2)],
    ["F1", (m) => m.e?.f1 ?? null, "max", (v) => v.toFixed(2)],
    [t("Sayma hatası |tahmin − gerçek|", "Count error |pred − true|"), (m) => (m.d && gt ? Math.abs(m.d.boxes.length - gt.length) : null), "min", (v) => String(v)],
    [t("Çıkarım süresi (ms)", "Inference time (ms)"), (m) => m.d?.inferenceMs ?? null, "min", (v) => v.toFixed(0)],
    [t("Uçtan uca süre (ms)", "End-to-end time (ms)"), (m) => m.d?.totalMs ?? null, "min", (v) => v.toFixed(0)],
  ];
  const slider = (label: string, v: number, set: (n: number) => void, min: number, max: number, step: number) => (
    <div className="field"><label>{label}</label>
      <div className="slider-row"><input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} />
        <input type="number" step={step} value={v} onChange={(e) => set(+e.target.value)} /></div></div>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      {err && <div className="note note--warn">{err}</div>}

      {/* ============ AŞAMA 1: KAYNAK ============ */}
      <section className="card stage">
        <div className="stage-side stack">
          <div className="row"><span className="num">1</span><h3>{t("Görüntü kaynağı", "Image source")}</h3></div>
          <div className={`dropzone${drag ? " drag" : ""}`} onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}>
            <Icon name="upload" /> <div className="small">{t("Dosya seç veya buraya bırak", "Choose a file or drop it here")}</div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <div className="row">
            {!cam ? <button className="btn btn--sm" onClick={startCam}><Icon name="camera" size={15} /> {t("Kamerayı aç", "Open camera")}</button>
              : <>
                <button className="btn btn--sm" onClick={snap}>{t("Kare al", "Capture frame")}</button>
                <button className="btn btn--sm" aria-pressed={live} onClick={() => setLive(!live)}>{live ? t("Canlıyı durdur", "Stop live") : t("Canlı mod", "Live mode")}</button>
                <button className="btn btn--sm" onClick={stopCam}>{t("Kapat", "Close")}</button>
              </>}
          </div>
          {cam && <video ref={videoRef} muted playsInline className="cv" />}
          <div className="chips">
            <span className={`chip ${models.yolo ? "chip--ok" : ""}`}>{models.yolo ? "✓" : <span className="spin" />} YOLOv8n-face</span>
            <span className={`chip ${models.haar ? "chip--ok" : ""}`}>{models.haar ? "✓" : <span className="spin" />} OpenCV Haar</span>
          </div>
        </div>
        <div className="stack">
          <div className="label">{t("Veri kümesinden örnekler", "Samples from the dataset")} {item && <span className="muted">· {t("seçili", "selected")}: {item.file.replace("images/", "")} ({t(COND_LABELS[item.condition], COND_EN[item.condition])}, {item.count} {t("yüz", "faces")})</span>}</div>
          {ds && Object.keys(ds.conditions).map((c) => (
            <div key={c} className="stack" style={{ gap: 4 }}>
              <span className="small muted">{t(COND_LABELS[c] ?? c, COND_EN[c] ?? c)}</span>
              <div className="thumbs" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
                {ds.images.filter((i) => i.condition === c).map((i) => (
                  <button key={i.file} aria-pressed={item?.file === i.file} onClick={() => pickSample(i)} title={i.note}>
                    <img src={BASE + "/dataset/" + i.file} alt={i.file} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ AŞAMA 2: ÖN İŞLEME ============ */}
      <section className="card stage" id="asama-2">
        <div className="stage-side stack">
          <div className="row"><span className="num">2</span><h3>{t("Ön işleme zinciri", "Preprocessing chain")}</h3></div>
          <div className="small muted">{t("Deney koşulu ön ayarları (tek işlem, sabit parametre):", "Experiment presets (single operation, fixed parameters):")}</div>
          <div className="seg">
            {ENH_KEYS.map((k) => <button key={k} aria-pressed={activePreset === k} onClick={() => setPipe(presetFor(k))}>{t(ENH_LABELS[k], ENH_EN[k])}</button>)}
          </div>
          <label className="toggle">
            <input type="checkbox" checked={pipe.bc.on} onChange={(e) => setPipe({ ...pipe, bc: { ...pipe.bc, on: e.target.checked } })} />
            <span><span className="t-title">{t("Parlaklık / Kontrast", "Brightness / Contrast")}</span><br /><span className="t-sub">{t("g = α·f + β (elle)", "g = α·f + β (by hand)")}</span></span>
          </label>
          {pipe.bc.on && (
            <div className="controls">
              {slider(t("Kontrast α", "Contrast α"), pipe.bc.alpha, (v) => setPipe({ ...pipe, bc: { ...pipe.bc, alpha: v } }), 0.3, 3, 0.05)}
              {slider(t("Parlaklık β", "Brightness β"), pipe.bc.beta, (v) => setPipe({ ...pipe, bc: { ...pipe.bc, beta: v } }), -100, 100, 1)}
            </div>
          )}
          <label className="toggle">
            <input type="checkbox" checked={pipe.he.on} onChange={(e) => setPipe({ ...pipe, he: { on: e.target.checked } })} />
            <span><span className="t-title">{t("Histogram Eşitleme", "Histogram Equalization")}</span><br /><span className="t-sub">{t("CDF eşlemesi — hazır fonksiyon yok", "CDF mapping — no library call")}</span></span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={pipe.clahe.on} onChange={(e) => setPipe({ ...pipe, clahe: { ...pipe.clahe, on: e.target.checked } })} />
            <span><span className="t-title">{t("Adaptif HE (CLAHE)", "Adaptive HE (CLAHE)")}</span><br /><span className="t-sub">{t("bloklara bölünmüş, kırpılmış HE", "tiled, clipped HE")}</span></span>
          </label>
          {pipe.clahe.on && (
            <div className="controls">
              {slider("Clip limit", pipe.clahe.clip, (v) => setPipe({ ...pipe, clahe: { ...pipe.clahe, clip: v } }), 0.5, 10, 0.5)}
              {slider(t("Blok ızgarası", "Tile grid"), pipe.clahe.tiles, (v) => setPipe({ ...pipe, clahe: { ...pipe.clahe, tiles: v } }), 2, 16, 1)}
              <div className="seg">
                <button aria-pressed={pipe.clahe.impl === "opencv"} onClick={() => setPipe({ ...pipe, clahe: { ...pipe.clahe, impl: "opencv" } })}>OpenCV</button>
                <button aria-pressed={pipe.clahe.impl === "manual"} onClick={() => setPipe({ ...pipe, clahe: { ...pipe.clahe, impl: "manual" } })}>{t("Elle yazılmış", "Hand-written")}</button>
              </div>
            </div>
          )}
          <button className="btn btn--sm" onClick={() => setPipe(DEFAULT_PIPELINE)}>{t("Zinciri sıfırla", "Reset chain")}</button>
        </div>
        <div className="stack">
          <div className="grid-2">
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 8 }}><b>{t("Orijinal", "Original")}</b><span className="chip">{srcName}</span></div>
              <ImageView im={s1?.im ?? src} gt={gt} />
              <Histogram hist={hSrc} cdf height={90} label={statOf(src, hSrc)} />
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 8 }}><b>{t("Ön işlenmiş", "Preprocessed")}</b><span className="chip">{stages.length > 1 ? stages.slice(1).map(stTitle).join(" → ") : t("işlem yok (ham)", "no processing (raw)")}</span></div>
              <ImageView im={sN?.im ?? null} />
              <Histogram hist={hProc} cdf height={90} label={statOf(processed, hProc)} />
            </div>
          </div>
          {stages.length > 2 && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="label">{t("Ara adımlar", "Intermediate steps")}</div>
              <div className="grid-4">
                {stages.map((s, i) => (
                  <div key={s.key} className="stack" style={{ gap: 4 }}>
                    <span className="small"><b>{i}. {stTitle(s)}</b> <span className="muted">{stDetail(s)}{s.ms ? ` · ${s.ms.toFixed(0)} ms` : ""}</span></span>
                    <ImageView im={s.im} />
                    <Histogram hist={lumaHistogram(s.im)} height={50} />
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="small muted">{t("Histogramlar gri seviye (Y) dağılımıdır; turuncu eğri kümülatif dağılım (CDF). Yeşil kesikli kutular referans (ground truth) yüzlerdir.", "Histograms show the gray-level (Y) distribution; the orange curve is the cumulative distribution (CDF). Green dashed boxes are the ground-truth faces.")}</p>
        </div>
      </section>

      {/* ============ AŞAMA 3: TESPİT ============ */}
      <section className="card stage" id="asama-3">
        <div className="stage-side stack">
          <div className="row"><span className="num">3</span><h3>{t("Tespit", "Detection")}</h3></div>
          <div className="seg">
            <button aria-pressed={which === "both"} onClick={() => setWhich("both")}>{t("İkisi de", "Both")}</button>
            <button aria-pressed={which === "yolo"} onClick={() => setWhich("yolo")}>YOLO</button>
            <button aria-pressed={which === "haar"} onClick={() => setWhich("haar")}>Viola-Jones</button>
          </div>
          <div className="controls">
            <div className="label"><Icon name="sliders" size={14} /> {t("YOLO parametreleri", "YOLO parameters")}</div>
            {slider(t("Güven eşiği (conf)", "Confidence threshold"), yoloP.conf, (v) => setYoloP({ ...yoloP, conf: v }), 0.05, 0.95, 0.05)}
            {slider("NMS IoU", yoloP.nmsIoU, (v) => setYoloP({ ...yoloP, nmsIoU: v }), 0.1, 0.9, 0.05)}
          </div>
          <div className="controls">
            <div className="label"><Icon name="sliders" size={14} /> {t("Viola-Jones parametreleri", "Viola-Jones parameters")}</div>
            {slider("scaleFactor", haarP.scaleFactor, (v) => setHaarP({ ...haarP, scaleFactor: v }), 1.02, 1.5, 0.01)}
            {slider("minNeighbors", haarP.minNeighbors, (v) => setHaarP({ ...haarP, minNeighbors: v }), 1, 15, 1)}
            {slider("minSize (px)", haarP.minSize, (v) => setHaarP({ ...haarP, minSize: v }), 12, 120, 2)}
          </div>
          <button className="btn btn--sm" onClick={() => { setHaarP(HAAR_DEFAULTS); setYoloP(YOLO_DEFAULTS); }}>{t("Deney ayarlarına dön", "Back to experiment settings")}</button>
          <span className="hint small muted">{t("Deneylerde bu değerler tüm görüntülerde sabittir; burada yalnız savunmada gösterim içindir.", "In the experiments these values are fixed for all images; here they are only for demonstration during the defence.")}</span>
          <label className="toggle"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /><span><span className="t-title">{t("Otomatik tespit", "Auto-detect")}</span><br /><span className="t-sub">{t("görüntü/ayar değişince yeniden çalıştır", "rerun when the image or settings change")}</span></span></label>
          <button className="btn btn--accent" style={{ padding: "14px 18px", fontSize: "1rem" }} disabled={!processed || !!busy || (!models.yolo && !models.haar)} onClick={() => detect()}>
            {busy ? <><span className="spin" /> {busy}</> : <><Icon name="play" size={16} /> {t("Tespit Et", "Detect")}</>}
          </button>
          <button className="btn btn--sm" disabled={!yolo && !haar} onClick={download}><Icon name="download" size={14} /> {t("Sonucu PNG indir", "Download PNG")}</button>
        </div>
        <div className="stack">
          {models3.map((m) => (
            <div key={m.key} className="result-row" id={m.key === "yolo" ? "yolo-out" : "haar-out"}>
              <div className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 8 }}><Icon name={m.icon} /><b>{m.title}</b><span className={`chip ${m.chip}`}>{m.d ? `${m.d.boxes.length} ${t("yüz", "faces")}` : "–"}</span></div>
                {m.d ? <ImageView im={processed} boxes={m.d.boxes} labels={m.labels} color={m.color} gt={gt} />
                  : <div className="panel-body small muted">{which === (m.key === "yolo" ? "haar" : "yolo") ? t("Bu model seçili değil", "This model is not selected") : t("Henüz çalıştırılmadı — Tespit Et'e bas", "Not run yet — press Detect")}</div>}
              </div>
              <div className="stack" style={{ gap: 10, alignContent: "start" }}>
                <div className="grid-2" style={{ gap: 10 }}>
                  <div className="stat"><span className="k"><Icon name="users" size={13} /> {t("Kişi sayısı", "People count")}</span><span className="v">{m.d?.boxes.length ?? "–"}{gt && <span className="muted" style={{ fontSize: "1rem" }}> / {gt.length} {t("gerçek", "true")}</span>}</span></div>
                  <div className="stat"><span className="k"><Icon name="clock" size={13} /> {t("Uçtan uca", "End-to-end")}</span><span className="v">{m.d ? (m.d.totalMs / 1000).toFixed(3) : "–"}<span className="muted" style={{ fontSize: "1rem" }}> {t("sn", "s")}</span></span></div>
                </div>
                {m.e ? (
                  <div className="chips">
                    <span className="chip chip--ok">TP {m.e.tp}</span><span className={`chip ${m.e.fp ? "chip--err" : ""}`}>FP {m.e.fp}</span><span className={`chip ${m.e.fn ? "chip--err" : ""}`}>FN {m.e.fn}</span>
                    <span className="chip">P {m.e.precision.toFixed(2)}</span><span className="chip">R {m.e.recall.toFixed(2)}</span><span className="chip">F1 {m.e.f1.toFixed(2)}</span>
                  </div>
                ) : <span className="small muted">{gt ? "" : t("Etiketli örnek seçilince TP/FP/FN hesaplanır.", "TP/FP/FN are computed when a labelled sample is selected.")}</span>}
                {m.d && <span className="small muted">{m.timeLabel}: {m.d.inferenceMs.toFixed(0)} ms{m.key === "yolo" && m.d.scores.length ? ` · ${t("skorlar", "scores")}: ${m.d.scores.map((s) => s.toFixed(2)).join(", ")}` : ""}</span>}
              </div>
            </div>
          ))}
          {(yolo || haar) && (
            <div className="table-wrap">
              <table>
                <thead><tr><th className="l">{t("Karşılaştırma", "Comparison")}</th><th>YOLOv8n-face</th><th>Viola-Jones</th></tr></thead>
                <tbody>
                  {cmpRows.map(([name, get, better, fmt]) => {
                    const a = get(models3[0]), b = get(models3[1]);
                    const win = a != null && b != null && a !== b ? ((better === "max" ? a > b : a < b) ? 0 : 1) : -1;
                    return (
                      <tr key={name}><td className="l">{name}</td>
                        <td className={win === 0 ? "best" : ""}>{a == null ? "–" : fmt(a)}</td>
                        <td className={win === 1 ? "best" : ""}>{b == null ? "–" : fmt(b)}</td></tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Histogram, ImageView } from "@/components/Viz";
import { RGBA, fromImageElement, loadImage, lumaHistogram, meanStd, toGray, entropy } from "@/lib/imgproc";
import { detectHaar, detectYolo, Detection, HAAR_DEFAULTS, YOLO_DEFAULTS, loadHaar, loadYolo } from "@/lib/detectors";
import { DEFAULT_PIPELINE, PipelineOpts, presetFor, runPipeline, Stage } from "@/lib/pipeline";
import { Dataset, DatasetItem, fetchDataset, ENH_KEYS, ENH_LABELS, COND_LABELS } from "@/lib/data";
import { Box, match, prf } from "@/lib/metrics";

type Which = "both" | "yolo" | "haar";

export default function DetectStudio() {
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // veri kümesi + modelleri arka planda yükle
  useEffect(() => {
    fetchDataset().then(setDs).catch((e) => setErr(String(e)));
    loadYolo().then(() => setModels((m) => ({ ...m, yolo: true }))).catch((e) => setErr("YOLO: " + e));
    loadHaar().then(() => setModels((m) => ({ ...m, haar: true }))).catch((e) => setErr("OpenCV: " + e));
  }, []);

  const pickSample = useCallback(async (it: DatasetItem) => {
    const img = await loadImage("/dataset/" + it.file);
    setItem(it); setSrc(fromImageElement(img, 4096)); setSrcName(it.file); setYolo(null); setHaar(null);
  }, []);
  useEffect(() => { if (ds && !src) pickSample(ds.images.find((i) => i.condition === "low_light") ?? ds.images[0]); }, [ds, src, pickSample]);

  const onFile = async (f?: File | null) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    try {
      const img = await loadImage(url);
      setItem(null); setSrc(fromImageElement(img, 1280)); setSrcName(f.name); setYolo(null); setHaar(null);
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
    setBusy("Tespit ediliyor…"); setErr(null);
    try {
      if (which !== "haar") setYolo(await detectYolo(im, yoloP)); else setYolo(null);
      if (which !== "yolo") setHaar(await detectHaar(im, haarP)); else setHaar(null);
    } catch (e) { setErr(String(e)); }
    setBusy(null);
  }, [processed, which, yoloP, haarP]);

  // ---- kamera ----
  const startCam = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720 }, audio: false });
      streamRef.current = st; setCam(true);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = st; videoRef.current.play(); } });
    } catch (e) { setErr("Kamera açılamadı: " + e); }
  };
  const stopCam = () => { liveRef.current = false; setLive(false); streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setCam(false); };
  useEffect(() => () => stopCam(), []);
  const snap = () => { if (videoRef.current) { setItem(null); setSrc(fromImageElement(videoRef.current, 960)); setSrcName("kamera karesi"); } };
  useEffect(() => {
    liveRef.current = live;
    if (!live) return;
    let stop = false;
    const loop = async () => {
      while (!stop && liveRef.current && videoRef.current) {
        const fr = fromImageElement(videoRef.current, 640);
        const st = await runPipeline(fr, pipe);
        const im = st[st.length - 1].im;
        setItem(null); setSrc(fr); setSrcName("canlı kamera");
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

  return (
    <div className="stack" style={{ gap: 20 }}>
      {err && <div className="note note--warn">{err}</div>}

      {/* 1-2-3: kaynak, ön işleme, dedektör */}
      <div className="grid-3" style={{ alignItems: "start" }}>
        <section className="card stack">
          <div className="row"><span className="num">1</span><h3>Görüntü kaynağı</h3></div>
          <div className={`dropzone${drag ? " drag" : ""}`} onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}>
            <Icon name="upload" /> <div className="small">Dosya seç veya buraya bırak</div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <div className="row">
            {!cam ? <button className="btn btn--sm" onClick={startCam}><Icon name="camera" size={15} /> Kamerayı aç</button>
              : <>
                <button className="btn btn--sm" onClick={snap}>Kare al</button>
                <button className="btn btn--sm" aria-pressed={live} onClick={() => setLive(!live)}>{live ? "Canlıyı durdur" : "Canlı mod"}</button>
                <button className="btn btn--sm" onClick={stopCam}>Kapat</button>
              </>}
          </div>
          {cam && <video ref={videoRef} muted playsInline className="cv" />}
          <div className="label">Veri kümesinden örnekler</div>
          {ds && Object.keys(ds.conditions).map((c) => (
            <div key={c} className="stack" style={{ gap: 4 }}>
              <span className="small muted">{COND_LABELS[c] ?? c}</span>
              <div className="thumbs">
                {ds.images.filter((i) => i.condition === c).map((i) => (
                  <button key={i.file} aria-pressed={item?.file === i.file} onClick={() => pickSample(i)} title={i.note}>
                    <img src={"/dataset/" + i.file} alt={i.file} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="card stack">
          <div className="row"><span className="num">2</span><h3>Ön işleme zinciri</h3></div>
          <div className="small muted">Deney koşulu ön ayarları (tek işlem, sabit parametre):</div>
          <div className="seg">
            {ENH_KEYS.map((k) => <button key={k} aria-pressed={activePreset === k} onClick={() => setPipe(presetFor(k))}>{ENH_LABELS[k]}</button>)}
          </div>
          <label className="toggle">
            <input type="checkbox" checked={pipe.bc.on} onChange={(e) => setPipe({ ...pipe, bc: { ...pipe.bc, on: e.target.checked } })} />
            <span><span className="t-title">Parlaklık / Kontrast</span><br /><span className="t-sub">g = α·f + β (elle)</span></span>
          </label>
          {pipe.bc.on && (
            <div className="controls">
              <div className="field"><label>Kontrast α</label>
                <div className="slider-row"><input type="range" min={0.3} max={3} step={0.05} value={pipe.bc.alpha} onChange={(e) => setPipe({ ...pipe, bc: { ...pipe.bc, alpha: +e.target.value } })} />
                  <input type="number" step={0.05} value={pipe.bc.alpha} onChange={(e) => setPipe({ ...pipe, bc: { ...pipe.bc, alpha: +e.target.value } })} /></div></div>
              <div className="field"><label>Parlaklık β</label>
                <div className="slider-row"><input type="range" min={-100} max={100} step={1} value={pipe.bc.beta} onChange={(e) => setPipe({ ...pipe, bc: { ...pipe.bc, beta: +e.target.value } })} />
                  <input type="number" value={pipe.bc.beta} onChange={(e) => setPipe({ ...pipe, bc: { ...pipe.bc, beta: +e.target.value } })} /></div></div>
            </div>
          )}
          <label className="toggle">
            <input type="checkbox" checked={pipe.he.on} onChange={(e) => setPipe({ ...pipe, he: { on: e.target.checked } })} />
            <span><span className="t-title">Histogram Eşitleme</span><br /><span className="t-sub">CDF eşlemesi — hazır fonksiyon yok</span></span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={pipe.clahe.on} onChange={(e) => setPipe({ ...pipe, clahe: { ...pipe.clahe, on: e.target.checked } })} />
            <span><span className="t-title">Adaptif HE (CLAHE)</span><br /><span className="t-sub">bloklara bölünmüş, kırpılmış HE</span></span>
          </label>
          {pipe.clahe.on && (
            <div className="controls">
              <div className="field"><label>Clip limit</label>
                <div className="slider-row"><input type="range" min={0.5} max={10} step={0.5} value={pipe.clahe.clip} onChange={(e) => setPipe({ ...pipe, clahe: { ...pipe.clahe, clip: +e.target.value } })} />
                  <input type="number" step={0.5} value={pipe.clahe.clip} onChange={(e) => setPipe({ ...pipe, clahe: { ...pipe.clahe, clip: +e.target.value } })} /></div></div>
              <div className="field"><label>Blok ızgarası</label>
                <div className="slider-row"><input type="range" min={2} max={16} step={1} value={pipe.clahe.tiles} onChange={(e) => setPipe({ ...pipe, clahe: { ...pipe.clahe, tiles: +e.target.value } })} />
                  <input type="number" value={pipe.clahe.tiles} onChange={(e) => setPipe({ ...pipe, clahe: { ...pipe.clahe, tiles: +e.target.value } })} /></div></div>
              <div className="seg">
                <button aria-pressed={pipe.clahe.impl === "opencv"} onClick={() => setPipe({ ...pipe, clahe: { ...pipe.clahe, impl: "opencv" } })}>OpenCV</button>
                <button aria-pressed={pipe.clahe.impl === "manual"} onClick={() => setPipe({ ...pipe, clahe: { ...pipe.clahe, impl: "manual" } })}>Elle yazılmış</button>
              </div>
            </div>
          )}
          <button className="btn btn--sm" onClick={() => setPipe(DEFAULT_PIPELINE)}>Zinciri sıfırla</button>
        </section>

        <section className="card stack">
          <div className="row"><span className="num">3</span><h3>Tespit</h3></div>
          <div className="seg">
            <button aria-pressed={which === "both"} onClick={() => setWhich("both")}>İkisi de</button>
            <button aria-pressed={which === "yolo"} onClick={() => setWhich("yolo")}>YOLO</button>
            <button aria-pressed={which === "haar"} onClick={() => setWhich("haar")}>Viola-Jones</button>
          </div>
          <div className="chips">
            <span className={`chip ${models.yolo ? "chip--ok" : ""}`}>{models.yolo ? "✓" : <span className="spin" />} YOLOv8n-face</span>
            <span className={`chip ${models.haar ? "chip--ok" : ""}`}>{models.haar ? "✓" : <span className="spin" />} OpenCV Haar</span>
          </div>
          <details>
            <summary className="label" style={{ cursor: "pointer" }}><Icon name="sliders" size={14} /> Dedektör parametreleri</summary>
            <div className="controls" style={{ marginTop: 8 }}>
              <div className="field"><label>YOLO güven eşiği (conf)</label>
                <div className="slider-row"><input type="range" min={0.05} max={0.95} step={0.05} value={yoloP.conf} onChange={(e) => setYoloP({ ...yoloP, conf: +e.target.value })} /><input type="number" step={0.05} value={yoloP.conf} onChange={(e) => setYoloP({ ...yoloP, conf: +e.target.value })} /></div></div>
              <div className="field"><label>YOLO NMS IoU</label>
                <div className="slider-row"><input type="range" min={0.1} max={0.9} step={0.05} value={yoloP.nmsIoU} onChange={(e) => setYoloP({ ...yoloP, nmsIoU: +e.target.value })} /><input type="number" step={0.05} value={yoloP.nmsIoU} onChange={(e) => setYoloP({ ...yoloP, nmsIoU: +e.target.value })} /></div></div>
              <div className="field"><label>Haar scaleFactor</label>
                <div className="slider-row"><input type="range" min={1.02} max={1.5} step={0.01} value={haarP.scaleFactor} onChange={(e) => setHaarP({ ...haarP, scaleFactor: +e.target.value })} /><input type="number" step={0.01} value={haarP.scaleFactor} onChange={(e) => setHaarP({ ...haarP, scaleFactor: +e.target.value })} /></div></div>
              <div className="field"><label>Haar minNeighbors</label>
                <div className="slider-row"><input type="range" min={1} max={15} step={1} value={haarP.minNeighbors} onChange={(e) => setHaarP({ ...haarP, minNeighbors: +e.target.value })} /><input type="number" value={haarP.minNeighbors} onChange={(e) => setHaarP({ ...haarP, minNeighbors: +e.target.value })} /></div></div>
              <div className="field"><label>Haar minSize (px)</label>
                <div className="slider-row"><input type="range" min={12} max={120} step={2} value={haarP.minSize} onChange={(e) => setHaarP({ ...haarP, minSize: +e.target.value })} /><input type="number" value={haarP.minSize} onChange={(e) => setHaarP({ ...haarP, minSize: +e.target.value })} /></div></div>
              <button className="btn btn--sm" onClick={() => { setHaarP(HAAR_DEFAULTS); setYoloP(YOLO_DEFAULTS); }}>Deney ayarlarına dön</button>
              <span className="hint small muted">Deneylerde bu değerler tüm görüntülerde sabittir; burada yalnız savunmada gösterim içindir.</span>
            </div>
          </details>
          <button className="btn btn--accent" style={{ padding: "14px 18px", fontSize: "1rem" }} disabled={!processed || !!busy || (!models.yolo && !models.haar)} onClick={() => detect()}>
            {busy ? <><span className="spin" /> {busy}</> : <><Icon name="play" size={16} /> Tespit Et</>}
          </button>
          <button className="btn btn--sm" disabled={!yolo && !haar} onClick={download}><Icon name="download" size={14} /> Sonucu PNG indir</button>
        </section>
      </div>

      {/* ön işleme zinciri: adım adım */}
      {stages.length > 1 && (
        <section className="card">
          <h3 style={{ marginBottom: 12 }}>Ön işleme adım adım</h3>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, minmax(180px, 1fr))`, gap: 12, overflowX: "auto" }}>
            {stages.map((s, i) => {
              const g = toGray(s.im), ms = meanStd(g), h = lumaHistogram(s.im);
              return (
                <div key={s.key} className="stack" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 6 }}><span className="num" style={{ width: 26, height: 26, fontSize: 13 }}>{i}</span><b>{s.title}</b></div>
                  <ImageView im={s.im} />
                  <Histogram hist={h} cdf height={70} />
                  <span className="small muted">{s.detail} · μ={ms.mean.toFixed(0)} σ={ms.std.toFixed(0)} H={entropy(h).toFixed(2)} bit{s.ms ? ` · ${s.ms.toFixed(0)} ms` : ""}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* sonuç panelleri */}
      <div className="grid-4">
        <div className="panel"><div className="panel-head"><Icon name="image" /> Orijinal <span className="chip">{srcName}</span></div>
          <div className="panel-body"><ImageView im={src} gt={gt} /></div>
          <div className="panel-foot">{gt ? <>Referans: <b>{gt.length}</b> yüz (yeşil kesikli)</> : "Referans etiket yok"}</div></div>
        <div className="panel"><div className="panel-head"><Icon name="layers" /> Ön işleme sonucu</div>
          <div className="panel-body"><ImageView im={processed} /></div>
          <div className="panel-foot">{stages.length > 1 ? stages.slice(1).map((s) => s.title).join(" → ") : "Ön işleme yok (ham)"}</div></div>
        <div className="panel" id="yolo-out"><div className="panel-head"><Icon name="cpu" /> YOLO sonucu <span className="chip chip--yolo">{yolo ? `${yolo.boxes.length} yüz` : "–"}</span></div>
          <div className="panel-body"><ImageView im={yolo ? processed : null} boxes={yolo?.boxes} labels={yolo?.scores.map((s) => `face ${s.toFixed(2)}`)} color="#7c6fd0" gt={gt} /></div>
          <div className="panel-foot">{yolo ? <>çıkarım {yolo.inferenceMs.toFixed(0)} ms · uçtan uca {yolo.totalMs.toFixed(0)} ms</> : "Henüz çalıştırılmadı"}</div></div>
        <div className="panel" id="haar-out"><div className="panel-head"><Icon name="grid" /> Viola-Jones sonucu <span className="chip chip--haar">{haar ? `${haar.boxes.length} yüz` : "–"}</span></div>
          <div className="panel-body"><ImageView im={haar ? processed : null} boxes={haar?.boxes} labels={haar?.boxes.map(() => "yüz")} color="#e0795b" gt={gt} /></div>
          <div className="panel-foot">{haar ? <>detectMultiScale {haar.inferenceMs.toFixed(0)} ms · uçtan uca {haar.totalMs.toFixed(0)} ms</> : "Henüz çalıştırılmadı"}</div></div>
      </div>

      {(yolo || haar) && (
        <section className="card">
          <div className="grid-4">
            <div className="stat"><span className="k"><Icon name="users" size={14} /> Kişi sayısı (YOLO / VJ)</span>
              <span className="v">{yolo?.boxes.length ?? "–"} / {haar?.boxes.length ?? "–"}</span>
              {gt && <span className="k">gerçek: {gt.length}</span>}</div>
            <div className="stat"><span className="k"><Icon name="clock" size={14} /> YOLO süre</span><span className="v">{yolo ? (yolo.totalMs / 1000).toFixed(3) : "–"} sn</span></div>
            <div className="stat"><span className="k"><Icon name="clock" size={14} /> Viola-Jones süre</span><span className="v">{haar ? (haar.totalMs / 1000).toFixed(3) : "–"} sn</span></div>
            <div className="stat"><span className="k"><Icon name="check" size={14} /> Değerlendirme (IoU ≥ 0.5)</span>
              {gt ? (
                <span className="small">
                  {ey && <>YOLO: TP {ey.tp} · FP {ey.fp} · FN {ey.fn} · F1 {ey.f1.toFixed(2)}<br /></>}
                  {eh && <>VJ: TP {eh.tp} · FP {eh.fp} · FN {eh.fn} · F1 {eh.f1.toFixed(2)}</>}
                </span>
              ) : <span className="small muted">Etiketli örnek seçildiğinde hesaplanır</span>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

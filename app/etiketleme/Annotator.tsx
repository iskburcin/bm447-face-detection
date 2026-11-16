"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Box } from "@/lib/metrics";
import { COND_LABELS, COND_EN } from "@/lib/data";
import { useT } from "@/components/I18n";
import { detectYolo } from "@/lib/detectors";
import { fromImageElement } from "@/lib/imgproc";

type Entry = { name: string; url: string; w: number; h: number; condition: string; faces: Box[] };

export default function Annotator() {
  const t = useT();
  const [items, setItems] = useState<Entry[]>([]);
  const [cur, setCur] = useState(0);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const cRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const it = items[cur];

  const addFiles = async (fl: FileList | null) => {
    if (!fl) return;
    const arr = Array.from(fl);
    const json = arr.find((f) => f.name.endsWith(".json"));
    const prev: Record<string, { condition: string; faces: Box[] }> = {};
    if (json) {
      const d = JSON.parse(await json.text());
      for (const i of d.images ?? []) prev[String(i.file).split("/").pop()!] = { condition: i.condition, faces: i.faces };
    }
    const next: Entry[] = [];
    for (const f of arr.filter((f) => f.type.startsWith("image/"))) {
      const url = URL.createObjectURL(f);
      const im = new Image(); im.src = url; await im.decode();
      const p = prev[f.name];
      const guess = /low|dusuk|karanlik/i.test(f.name) ? "low_light" : /back|ters/i.test(f.name) ? "backlight" : "normal";
      next.push({ name: f.name, url, w: im.naturalWidth, h: im.naturalHeight, condition: p?.condition ?? guess, faces: p?.faces ?? [] });
    }
    setItems((old) => [...old, ...next]);
  };

  // çizim
  useEffect(() => {
    if (!it) return;
    const im = new Image(); im.src = it.url;
    im.onload = () => { imgRef.current = im; draw(); };
  }, [it?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { draw(); }); // her render'da kutuları güncelle

  function draw() {
    const c = cRef.current, im = imgRef.current;
    if (!c || !im || !it) return;
    c.width = it.w; c.height = it.h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(im, 0, 0);
    const s = Math.max(1, it.w / 700);
    ctx.lineWidth = 3 * s; ctx.font = `600 ${14 * s}px system-ui`;
    it.faces.forEach((b, i) => {
      ctx.strokeStyle = i === sel ? "#e0795b" : "#1f9d55";
      ctx.strokeRect(b[0], b[1], b[2], b[3]);
      ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(b[0], b[1] - 18 * s, 26 * s, 18 * s);
      ctx.fillStyle = "#fff"; ctx.fillText(String(i + 1), b[0] + 5 * s, b[1] - 4 * s);
    });
    if (drag) { ctx.setLineDash([8 * s, 5 * s]); ctx.strokeStyle = "#564d80"; ctx.strokeRect(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0)); }
  }

  const pos = (e: React.PointerEvent) => {
    const r = cRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * it.w, y: ((e.clientY - r.top) / r.height) * it.h };
  };
  const update = (faces: Box[]) => setItems((xs) => xs.map((x, i) => (i === cur ? { ...x, faces } : x)));
  const onDown = (e: React.PointerEvent) => {
    const p = pos(e);
    const hit = it.faces.findIndex((b) => p.x >= b[0] && p.x <= b[0] + b[2] && p.y >= b[1] && p.y <= b[1] + b[3]);
    if (hit >= 0 && !e.shiftKey) { setSel(hit); return; }
    (e.target as Element).setPointerCapture(e.pointerId);
    setSel(null); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onMove = (e: React.PointerEvent) => { if (drag) { const p = pos(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } };
  const onUp = () => {
    if (!drag) return;
    const b: Box = [Math.round(Math.min(drag.x0, drag.x1)), Math.round(Math.min(drag.y0, drag.y1)), Math.round(Math.abs(drag.x1 - drag.x0)), Math.round(Math.abs(drag.y1 - drag.y0))];
    if (b[2] > 6 && b[3] > 6) update([...it.faces, b]);
    setDrag(null);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && sel !== null && it) { update(it.faces.filter((_, i) => i !== sel)); setSel(null); }
      if (e.key === "ArrowRight") setCur((c) => Math.min(items.length - 1, c + 1));
      if (e.key === "ArrowLeft") setCur((c) => Math.max(0, c - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // YOLO ile ön etiket önerisi (insan kontrol eder ve düzeltir)
  const suggest = async () => {
    if (!imgRef.current) return;
    setBusy(true);
    const r = await detectYolo(fromImageElement(imgRef.current, 8192));
    update([...it.faces, ...r.boxes.map((b) => b.map(Math.round) as Box)]);
    setBusy(false);
  };

  const exportJson = () => {
    const data = {
      name: "BM447 grup yüz veri kümesi",
      box_format: "[x, y, w, h] piksel, sol-üst köşe",
      conditions: { normal: "Normal ışık", low_light: "Düşük ışık", backlight: "Ters ışık" },
      images: items.map((x) => ({ file: `images/${x.name}`, condition: x.condition, width: x.w, height: x.h, faces: x.faces, count: x.faces.length })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "annotations.json"; a.click();
  };
  const counts = Object.keys(COND_LABELS).map((c) => [c, items.filter((x) => x.condition === c).length] as const);

  return (
    <div className="grid-2" style={{ gridTemplateColumns: "300px minmax(0,1fr)", alignItems: "start" }}>
      <aside className="card stack">
        <label className="dropzone">
          <Icon name="upload" /><div className="small">{t("Görüntüleri (ve varsa önceki annotations.json'ı) seç", "Select images (and a previous annotations.json, if any)")}</div>
          <input type="file" multiple accept="image/*,.json" hidden onChange={(e) => addFiles(e.target.files)} />
        </label>
        <div className="small">
          {counts.map(([c, n]) => <div key={c} className="row" style={{ justifyContent: "space-between" }}><span>{t(COND_LABELS[c], COND_EN[c])}</span><span className={`chip ${n >= 5 ? "chip--ok" : "chip--err"}`}>{n} / 5+</span></div>)}
          <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}><b>{t("Toplam", "Total")}</b><span className={`chip ${items.length >= 15 ? "chip--ok" : "chip--err"}`}>{items.length} / 15+</span></div>
          <div className="muted" style={{ marginTop: 4 }}>{t("Toplam yüz", "Total faces")}: {items.reduce((s, x) => s + x.faces.length, 0)}</div>
        </div>
        <div className="stack" style={{ gap: 4, maxHeight: 360, overflow: "auto" }}>
          {items.map((x, i) => (
            <button key={x.url} className="btn btn--sm" style={{ justifyContent: "space-between", borderColor: i === cur ? "var(--accent)" : undefined }} onClick={() => { setCur(i); setSel(null); }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{x.name}</span>
              <span className="chip">{x.faces.length}</span>
            </button>
          ))}
        </div>
        <button className="btn btn--primary" disabled={!items.length} onClick={exportJson}><Icon name="download" size={15} /> {t("annotations.json indir", "Download annotations.json")}</button>
      </aside>

      <section className="card stack">
        {!it ? <p>{t("Başlamak için soldan görüntü seç.", "Select images on the left to start.")}</p> : (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{it.name}</b>
              <div className="seg">{Object.entries(COND_LABELS).map(([k, l]) => (
                <button key={k} aria-pressed={it.condition === k} onClick={() => setItems((xs) => xs.map((x, i) => (i === cur ? { ...x, condition: k } : x)))}>{t(l, COND_EN[k])}</button>
              ))}</div>
            </div>
            <div className="annot-stage">
              <canvas ref={cRef} style={{ maxWidth: "100%", maxHeight: "70vh", width: "auto" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
            </div>
            <div className="row">
              <button className="btn btn--sm" onClick={() => setCur(Math.max(0, cur - 1))}>{t("← Önceki", "← Previous")}</button>
              <button className="btn btn--sm" onClick={() => setCur(Math.min(items.length - 1, cur + 1))}>{t("Sonraki →", "Next →")}</button>
              <button className="btn btn--sm" disabled={sel === null} onClick={() => { update(it.faces.filter((_, i) => i !== sel)); setSel(null); }}><Icon name="trash" size={14} /> {t("Seçili kutuyu sil", "Delete selected box")}</button>
              <button className="btn btn--sm" onClick={() => update([])}>{t("Tümünü temizle", "Clear all")}</button>
              <button className="btn btn--sm" disabled={busy} onClick={suggest}>{busy ? <span className="spin" /> : <Icon name="cpu" size={14} />} {t("YOLO ile öner", "Suggest with YOLO")}</button>
            </div>
            <p className="small muted">
              {t("Sürükle: yeni kutu · Tıkla: seç · Delete: sil · ←/→: görüntü değiştir · Shift+sürükle: bir kutunun içinden yeni kutu. Kural: görünen her yüz (kısmen örtülü olsa da) alından çeneye, kulaktan kulağa kadar işaretlenir. “YOLO ile öner” yalnızca hız içindir; öneriler mutlaka elle kontrol edilmelidir — aksi hâlde referans YOLO'ya yanlı olur.",
                "Drag: new box · Click: select · Delete: remove · ←/→: switch image · Shift+drag: new box inside a box. Rule: every visible face (even partly occluded) is boxed from forehead to chin, ear to ear. “Suggest with YOLO” is only a speed-up; suggestions must be checked by hand — otherwise the ground truth becomes biased towards YOLO.")}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

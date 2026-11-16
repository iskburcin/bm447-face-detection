"""Kontrollü deney: 2 dedektör x 4 ön işleme x tüm veri kümesi.

Kullanım:
    python run_experiments.py                    # dataset/annotations.json
    python run_experiments.py --dataset ../dataset --out ../results

Çıktılar (results/):
    results.json          : tüm özetler + görüntü bazlı kutular (web arayüzü de okur)
    summary.csv           : dedektör x ön işleme -> TP, FP, FN, P, R, F1, MAE, süreler
    summary_by_condition.csv
    per_image.csv         : her görüntü / dedektör / ön işleme satırı
    figures/*.png         : grafikler ve önce/sonra örnekleri

Süre ölçümü:
    inference_ms  = yalnızca dedektör çağrısı (Haar: detectMultiScale, YOLO: session.run)
    end_to_end_ms = ön işleme + gri/letterbox + çıkarım + son işleme (NMS, koordinat dönüşümü)
    Her ölçümden önce 1 ısınma (warm-up) çalıştırması yapılır; CPU, tek süreç.
"""
from __future__ import annotations

import argparse
import csv
import json
import platform
import time
from pathlib import Path

import cv2
import numpy as np

from fd.detectors import HaarDetector, YoloFaceDetector
from fd.enhance import ALPHA, BETA, CLAHE_CLIP, CLAHE_TILES, ENH_LABELS_TR, ENHANCEMENTS
from fd.metrics import IOU_THR, match, prf

ROOT = Path(__file__).resolve().parents[1]


def read_rgb(path: Path) -> np.ndarray:
    bgr = cv2.imdecode(np.fromfile(str(path), np.uint8), cv2.IMREAD_COLOR)  # Unicode yol güvenli
    if bgr is None:
        raise FileNotFoundError(path)
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def write_png(path: Path, rgb: np.ndarray) -> None:
    ok, buf = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    assert ok
    buf.tofile(str(path))


def aggregate(rows: list[dict]) -> dict:
    tp = sum(r["tp"] for r in rows)
    fp = sum(r["fp"] for r in rows)
    fn = sum(r["fn"] for r in rows)
    p, r, f1 = prf(tp, fp, fn)
    return {
        "images": len(rows), "gt": sum(r["gt_count"] for r in rows), "pred": sum(r["pred_count"] for r in rows),
        "tp": tp, "fp": fp, "fn": fn,
        "precision": round(p, 4), "recall": round(r, 4), "f1": round(f1, 4),
        "mae": round(float(np.mean([r["abs_count_error"] for r in rows])), 4),
        "mean_inference_ms": round(float(np.mean([r["inference_ms"] for r in rows])), 2),
        "mean_end_to_end_ms": round(float(np.mean([r["end_to_end_ms"] for r in rows])), 2),
    }


def draw(rgb: np.ndarray, gts, preds, color) -> np.ndarray:
    out = rgb.copy()
    for x, y, w, h in gts:
        cv2.rectangle(out, (int(x), int(y)), (int(x + w), int(y + h)), (255, 255, 255), 1, cv2.LINE_AA)
    for x, y, w, h in preds:
        cv2.rectangle(out, (int(x), int(y)), (int(x + w), int(y + h)), color, 2, cv2.LINE_AA)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default=str(ROOT / "dataset"))
    ap.add_argument("--out", default=str(ROOT / "results"))
    args = ap.parse_args()
    ds, out = Path(args.dataset), Path(args.out)
    (out / "figures").mkdir(parents=True, exist_ok=True)
    ann = json.loads((ds / "annotations.json").read_text(encoding="utf-8"))

    detectors = [HaarDetector(), YoloFaceDetector()]
    rows: list[dict] = []
    samples = {}  # görsel örnekler için
    for item in ann["images"]:
        img = read_rgb(ds / item["file"])
        gts = item["faces"]
        for enh_key, enh in ENHANCEMENTS.items():
            for det in detectors:
                enh(img); det.detect(enh(img))  # ısınma
                t0 = time.perf_counter()
                proc = enh(img)
                boxes, scores, inf_ms = det.detect(proc)
                e2e = (time.perf_counter() - t0) * 1000
                tp, fp, fn, matches = match(boxes, gts, IOU_THR)
                p, r, f1 = prf(tp, fp, fn)
                rows.append({
                    "image": item["file"], "condition": item["condition"], "enhancement": enh_key,
                    "detector": det.name, "gt_count": len(gts), "pred_count": len(boxes),
                    "tp": tp, "fp": fp, "fn": fn, "precision": round(p, 4), "recall": round(r, 4),
                    "f1": round(f1, 4), "abs_count_error": abs(len(boxes) - len(gts)),
                    "inference_ms": round(inf_ms, 2), "end_to_end_ms": round(e2e, 2),
                    "boxes": [[round(v, 1) for v in b] for b in boxes],
                    "scores": [round(s, 3) for s in scores], "matches": matches,
                })
                samples[(item["file"], enh_key, det.name)] = (proc, boxes)
        print(f"  {item['file']} tamam")

    # ---- özetler ----
    summary, by_cond = [], []
    for det in detectors:
        for enh_key in ENHANCEMENTS:
            sel = [r for r in rows if r["detector"] == det.name and r["enhancement"] == enh_key]
            summary.append({"detector": det.name, "enhancement": enh_key, **aggregate(sel)})
            for cond in ann["conditions"]:
                sc = [r for r in sel if r["condition"] == cond]
                if sc:
                    by_cond.append({"detector": det.name, "enhancement": enh_key, "condition": cond, **aggregate(sc)})

    # ---- görüntü kalite göstergeleri (görsel olarak "daha iyi" mi?) ----
    quality = []
    for item in ann["images"]:
        img = read_rgb(ds / item["file"])
        for enh_key, enh in ENHANCEMENTS.items():
            g = cv2.cvtColor(enh(img), cv2.COLOR_RGB2GRAY).astype(np.float32)
            hist = np.bincount(g.astype(np.uint8).ravel(), minlength=256) / g.size
            ent = float(-(hist[hist > 0] * np.log2(hist[hist > 0])).sum())
            quality.append({"image": item["file"], "condition": item["condition"], "enhancement": enh_key,
                            "mean": round(float(g.mean()), 2), "std": round(float(g.std()), 2),
                            "entropy": round(ent, 3)})

    result = {
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "machine": f"{platform.system()} {platform.release()} / {platform.processor()} / Python {platform.python_version()} / OpenCV {cv2.__version__}",
        "iou_threshold": IOU_THR,
        "enhancement_params": {"alpha": ALPHA, "beta": BETA, "clahe_clip": CLAHE_CLIP, "clahe_tiles": list(CLAHE_TILES),
                               "hist_eq": "elle yazıldı (CDF eşleme, Y kanalı)"},
        "detectors": {d.name: {"label": d.label, **d.params()} for d in detectors},
        "enhancement_labels": ENH_LABELS_TR,
        "conditions": ann["conditions"],
        "timing_note": "inference_ms: yalnız dedektör çağrısı; end_to_end_ms: ön işleme+çıkarım+son işleme. CPU, ısınma sonrası.",
        "summary": summary, "summary_by_condition": by_cond, "quality": quality, "per_image": rows,
    }
    (out / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")

    def write_csv(path, data, drop=()):
        keys = [k for k in data[0].keys() if k not in drop]
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
            w.writeheader()
            w.writerows(data)

    write_csv(out / "summary.csv", summary)
    write_csv(out / "summary_by_condition.csv", by_cond)
    write_csv(out / "per_image.csv", rows, drop=("boxes", "scores", "matches"))
    write_csv(out / "image_quality.csv", quality)

    make_figures(out / "figures", summary, by_cond, ann, ds, samples, quality)
    print("\nÖZET (tüm veri kümesi)")
    print(f"{'dedektör':12s} {'ön işleme':20s}  TP  FP  FN   P     R     F1    MAE   inf(ms) e2e(ms)")
    for s in summary:
        print(f"{s['detector']:12s} {s['enhancement']:20s} {s['tp']:3d} {s['fp']:3d} {s['fn']:3d} "
              f"{s['precision']:.3f} {s['recall']:.3f} {s['f1']:.3f} {s['mae']:.3f} {s['mean_inference_ms']:7.1f} {s['mean_end_to_end_ms']:7.1f}")


def make_figures(fig_dir: Path, summary, by_cond, ann, ds, samples, quality) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    enh_keys = list(ENHANCEMENTS)
    labels = [ENH_LABELS_TR[k] for k in enh_keys]
    dets = [("viola_jones", "Viola-Jones", "#8d91bf"), ("yolo", "YOLOv8n-face", "#564d80")]
    conds = list(ann["conditions"])

    # 1) F1 / Recall / MAE çubuk grafikleri
    for metric, title in [("f1", "F1 skoru"), ("recall", "Recall (duyarlılık)"), ("precision", "Precision (kesinlik)"), ("mae", "MAE (sayma hatası)")]:
        fig, ax = plt.subplots(figsize=(8, 4))
        x = np.arange(len(enh_keys))
        for i, (dk, dl, c) in enumerate(dets):
            vals = [next(s[metric] for s in summary if s["detector"] == dk and s["enhancement"] == e) for e in enh_keys]
            b = ax.bar(x + (i - 0.5) * 0.38, vals, 0.38, label=dl, color=c)
            ax.bar_label(b, fmt="%.2f", fontsize=8)
        ax.set_xticks(x, labels)
        ax.set_title(f"{title} - tüm veri kümesi")
        ax.legend()
        ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        fig.savefig(fig_dir / f"bar_{metric}.png", dpi=150)
        plt.close(fig)

    # 2) Koşul x ön işleme F1 ısı haritası (her dedektör)
    fig, axes = plt.subplots(1, 2, figsize=(11, 3.6))
    for ax, (dk, dl, _) in zip(axes, dets):
        m = np.array([[next(r["f1"] for r in by_cond if r["detector"] == dk and r["enhancement"] == e and r["condition"] == c)
                       for e in enh_keys] for c in conds])
        im = ax.imshow(m, vmin=0, vmax=1, cmap="Purples")
        ax.set_xticks(range(len(enh_keys)), labels, rotation=20, fontsize=8)
        ax.set_yticks(range(len(conds)), [ann["conditions"][c] for c in conds], fontsize=8)
        for i in range(m.shape[0]):
            for j in range(m.shape[1]):
                ax.text(j, i, f"{m[i, j]:.2f}", ha="center", va="center", color="white" if m[i, j] > 0.55 else "black", fontsize=9)
        ax.set_title(f"{dl} - F1 (koşul x ön işleme)")
    fig.colorbar(im, ax=axes, shrink=0.8)
    fig.savefig(fig_dir / "heatmap_f1.png", dpi=150, bbox_inches="tight")
    plt.close(fig)

    # 3) Önce/sonra + tespit örnekleri: her koşuldan bir görüntü
    picks = []
    for c in conds:
        cand = [i for i in ann["images"] if i["condition"] == c]
        picks.append(max(cand, key=lambda i: i["count"]) if c != "normal" else cand[2])
    for it in picks:
        fig, axes = plt.subplots(2, 4, figsize=(14, 6))
        for row, (dk, dl, col) in enumerate(dets):
            for j, e in enumerate(enh_keys):
                proc, boxes = samples[(it["file"], e, dk)]
                rgbc = (86, 77, 128) if dk == "yolo" else (230, 120, 60)
                axes[row, j].imshow(draw(proc, it["faces"], boxes, rgbc))
                tp, fp, fn, _ = match(boxes, it["faces"])
                axes[row, j].set_title(f"{dl} | {ENH_LABELS_TR[e]}\nTP={tp} FP={fp} FN={fn} (GT={it['count']})", fontsize=8)
                axes[row, j].axis("off")
        fig.suptitle(f"{it['file']} - beyaz: referans, renkli: tahmin", fontsize=10)
        fig.tight_layout()
        fig.savefig(fig_dir / f"examples_{Path(it['file']).stem}.png", dpi=110)
        plt.close(fig)

    # 4) Histogram örneği (düşük ışık görüntüsü)
    it = next(i for i in ann["images"] if i["condition"] == "low_light")
    img = read_rgb(ds / it["file"])
    fig, axes = plt.subplots(2, 4, figsize=(14, 5.5))
    for j, e in enumerate(enh_keys):
        p = ENHANCEMENTS[e](img)
        g = cv2.cvtColor(p, cv2.COLOR_RGB2GRAY)
        axes[0, j].imshow(p)
        axes[0, j].set_title(ENH_LABELS_TR[e], fontsize=9)
        axes[0, j].axis("off")
        axes[1, j].hist(g.ravel(), 256, (0, 256), color="#564d80")
        axes[1, j].set_xlim(0, 255)
        axes[1, j].set_yticks([])
    fig.suptitle(f"{it['file']}: ön işleme ve gri seviye histogramları", fontsize=10)
    fig.tight_layout()
    fig.savefig(fig_dir / "histograms_lowlight.png", dpi=110)
    plt.close(fig)

    # 5) "Görsel kalite" (entropi) ile F1 ilişkisi
    fig, ax = plt.subplots(figsize=(6.5, 4))
    for dk, dl, c in dets:
        xs, ys = [], []
        for e in enh_keys:
            for cnd in conds:
                q = np.mean([q["entropy"] for q in quality if q["enhancement"] == e and q["condition"] == cnd])
                f = next(r["f1"] for r in by_cond if r["detector"] == dk and r["enhancement"] == e and r["condition"] == cnd)
                xs.append(q)
                ys.append(f)
        ax.scatter(xs, ys, label=dl, color=c, s=40)
    ax.set_xlabel("Ortalama gri seviye entropisi (bit) - 'görsel zenginlik'")
    ax.set_ylabel("F1")
    ax.set_title("Görsel olarak daha zengin görüntü = daha iyi tespit mi?")
    ax.legend()
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(fig_dir / "entropy_vs_f1.png", dpi=150)
    plt.close(fig)


if __name__ == "__main__":
    main()

"""English versions of the experiment figures -> results/figures_en/*.png

Redraws every figure from results/results.json (boxes, scores, metrics) and the dataset images,
WITHOUT rerunning the detectors, so the numbers are exactly those of the Turkish figures.
Used by make_report_en.py.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from fd.enhance import ENHANCEMENTS
from fd.metrics import match

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "results"
OUT = RES / "figures_en"
ENH = {"original": "Raw (original)", "brightness_contrast": "Brightness/Contrast", "hist_eq": "Histogram Eq.", "clahe": "CLAHE"}
COND = {"normal": "Normal light", "low_light": "Low light", "backlight": "Backlight"}
DETS = [("viola_jones", "Viola-Jones", "#8d91bf"), ("yolo", "YOLOv8n-face", "#564d80")]


def read_rgb(p: Path) -> np.ndarray:
    return cv2.cvtColor(cv2.imdecode(np.fromfile(str(p), np.uint8), cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)


def draw(rgb, gts, preds, color):
    out = rgb.copy()
    for x, y, w, h in gts:
        cv2.rectangle(out, (int(x), int(y)), (int(x + w), int(y + h)), (255, 255, 255), 1, cv2.LINE_AA)
    for x, y, w, h in preds:
        cv2.rectangle(out, (int(x), int(y)), (int(x + w), int(y + h)), color, 2, cv2.LINE_AA)
    return out


def main() -> None:
    res = json.loads((RES / "results.json").read_text(encoding="utf-8"))
    ann = json.loads((ROOT / "dataset" / "annotations.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    summary, by_cond, quality = res["summary"], res["summary_by_condition"], res["quality"]
    enh_keys, conds = list(ENH), list(ann["conditions"])

    for metric, title in [("f1", "F1 score"), ("recall", "Recall"), ("precision", "Precision"), ("mae", "MAE (counting error)")]:
        fig, ax = plt.subplots(figsize=(8, 4))
        x = np.arange(len(enh_keys))
        for i, (dk, dl, c) in enumerate(DETS):
            vals = [next(s[metric] for s in summary if s["detector"] == dk and s["enhancement"] == e) for e in enh_keys]
            b = ax.bar(x + (i - 0.5) * 0.38, vals, 0.38, label=dl, color=c)
            ax.bar_label(b, fmt="%.2f", fontsize=8)
        ax.set_xticks(x, [ENH[e] for e in enh_keys])
        ax.set_title(f"{title} - whole dataset")
        ax.legend()
        ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        fig.savefig(OUT / f"bar_{metric}.png", dpi=150)
        plt.close(fig)

    fig, axes = plt.subplots(1, 2, figsize=(11, 3.6))
    for ax, (dk, dl, _) in zip(axes, DETS):
        m = np.array([[next(r["f1"] for r in by_cond if r["detector"] == dk and r["enhancement"] == e and r["condition"] == c) for e in enh_keys] for c in conds])
        im = ax.imshow(m, vmin=0, vmax=1, cmap="Purples")
        ax.set_xticks(range(len(enh_keys)), [ENH[e] for e in enh_keys], rotation=20, fontsize=8)
        ax.set_yticks(range(len(conds)), [COND.get(c, c) for c in conds], fontsize=8)
        for i in range(m.shape[0]):
            for j in range(m.shape[1]):
                ax.text(j, i, f"{m[i, j]:.2f}", ha="center", va="center", color="white" if m[i, j] > 0.55 else "black", fontsize=9)
        ax.set_title(f"{dl} - F1 (condition × preprocessing)")
    fig.colorbar(im, ax=axes, shrink=0.8)
    fig.savefig(OUT / "heatmap_f1.png", dpi=150, bbox_inches="tight")
    plt.close(fig)

    rows = {(r["image"], r["enhancement"], r["detector"]): r for r in res["per_image"]}
    picks = []
    for c in conds:
        cand = [i for i in ann["images"] if i["condition"] == c]
        picks.append(max(cand, key=lambda i: i["count"]) if c != "normal" else cand[2])
    for it in picks:
        img = read_rgb(ROOT / "dataset" / it["file"])
        fig, axes = plt.subplots(2, 4, figsize=(14, 6))
        for row, (dk, dl, _) in enumerate(DETS):
            for j, e in enumerate(enh_keys):
                boxes = rows[(it["file"], e, dk)]["boxes"]
                rgbc = (86, 77, 128) if dk == "yolo" else (230, 120, 60)
                axes[row, j].imshow(draw(ENHANCEMENTS[e](img), it["faces"], boxes, rgbc))
                tp, fp, fn, _ = match(boxes, it["faces"])
                axes[row, j].set_title(f"{dl} | {ENH[e]}\nTP={tp} FP={fp} FN={fn} (GT={it['count']})", fontsize=8)
                axes[row, j].axis("off")
        fig.suptitle(f"{it['file']} - white: ground truth, colored: prediction", fontsize=10)
        fig.tight_layout()
        fig.savefig(OUT / f"examples_{Path(it['file']).stem}.png", dpi=110)
        plt.close(fig)

    it = next(i for i in ann["images"] if i["condition"] == "low_light")
    img = read_rgb(ROOT / "dataset" / it["file"])
    fig, axes = plt.subplots(2, 4, figsize=(14, 5.5))
    for j, e in enumerate(enh_keys):
        p = ENHANCEMENTS[e](img)
        g = cv2.cvtColor(p, cv2.COLOR_RGB2GRAY)
        axes[0, j].imshow(p)
        axes[0, j].set_title(ENH[e], fontsize=9)
        axes[0, j].axis("off")
        axes[1, j].hist(g.ravel(), 256, (0, 256), color="#564d80")
        axes[1, j].set_xlim(0, 255)
        axes[1, j].set_yticks([])
    fig.suptitle(f"{it['file']}: preprocessing and gray-level histograms", fontsize=10)
    fig.tight_layout()
    fig.savefig(OUT / "histograms_lowlight.png", dpi=110)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(6.5, 4))
    for dk, dl, c in DETS:
        xs, ys = [], []
        for e in enh_keys:
            for cnd in conds:
                xs.append(np.mean([q["entropy"] for q in quality if q["enhancement"] == e and q["condition"] == cnd]))
                ys.append(next(r["f1"] for r in by_cond if r["detector"] == dk and r["enhancement"] == e and r["condition"] == cnd))
        ax.scatter(xs, ys, label=dl, color=c, s=40)
    ax.set_xlabel("Mean gray-level entropy (bits) - 'visual richness'")
    ax.set_ylabel("F1")
    ax.set_title("Does a visually richer image detect better?")
    ax.legend()
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(OUT / "entropy_vs_f1.png", dpi=150)
    plt.close(fig)
    print("->", OUT)


if __name__ == "__main__":
    main()

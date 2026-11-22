"""IEEE formatındaki rapor için siyah-beyaz, tek sütun genişliğinde (≈ 8,6 cm) şekiller üretir.

    python make_figures_report.py tr   -> results/figures_report_tr/
    python make_figures_report.py en   -> results/figures_report_en/

Detektörleri yeniden çalıştırmaz; results/results.json'daki kutuları ve metrikleri kullanır.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

from fd.enhance import ENHANCEMENTS

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "results"
COL_W = 3.4  # inç (IEEE sütun genişliği ≈ 3,5")

plt.rcParams.update({
    "font.family": "serif", "font.serif": ["Times New Roman", "Times", "DejaVu Serif"],
    "font.size": 8, "axes.titlesize": 8, "axes.labelsize": 8, "xtick.labelsize": 7, "ytick.labelsize": 7,
    "legend.fontsize": 7, "axes.edgecolor": "black", "axes.linewidth": 0.6, "hatch.linewidth": 0.6,
    "savefig.dpi": 300, "figure.dpi": 150,
})

L = {
    "tr": {
        "enh": {"original": "Ham", "brightness_contrast": "P/K", "hist_eq": "HE", "clahe": "CLAHE"},
        "cond": {"normal": "Normal", "low_light": "Düşük ışık", "backlight": "Ters ışık"},
        "det": {"viola_jones": "Viola-Jones", "yolo": "YOLOv8n-face"},
        "f1": "F1", "gt": "beyaz kesikli: referans, siyah-beyaz: tahmin",
        "flow": ["Görüntü (6 foto × 3 koşul)", "Ön işleme: Ham | P/K | HE (elle) | CLAHE", "Gri dönüşüm", "Letterbox 640×640",
                 "Viola-Jones\nHaar kaskad", "YOLOv8n-face\nCNN + NMS", "IoU ≥ 0,50 bire bir eşleştirme", "TP · FP · FN · P · R · F1 · MAE · süre"],
        "hist": "Gri seviye", "count": "Piksel sayısı",
    },
    "en": {
        "enh": {"original": "Raw", "brightness_contrast": "B/C", "hist_eq": "HE", "clahe": "CLAHE"},
        "cond": {"normal": "Normal", "low_light": "Low light", "backlight": "Backlight"},
        "det": {"viola_jones": "Viola-Jones", "yolo": "YOLOv8n-face"},
        "f1": "F1", "gt": "white dashed: ground truth, black-white: prediction",
        "flow": ["Image (6 photos × 3 conditions)", "Preprocessing: Raw | B/C | HE (own) | CLAHE", "Grayscale", "Letterbox 640×640",
                 "Viola-Jones\nHaar cascade", "YOLOv8n-face\nCNN + NMS", "IoU ≥ 0.50 one-to-one matching", "TP · FP · FN · P · R · F1 · MAE · time"],
        "hist": "Gray level", "count": "Pixel count",
    },
}
ENH_KEYS = ["original", "brightness_contrast", "hist_eq", "clahe"]
DETS = ["viola_jones", "yolo"]


def read_rgb(p: Path) -> np.ndarray:
    return cv2.cvtColor(cv2.imdecode(np.fromfile(str(p), np.uint8), cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)


def to_gray3(rgb: np.ndarray) -> np.ndarray:
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    return cv2.cvtColor(g, cv2.COLOR_GRAY2RGB)


def dashed_rect(img, x, y, w, h, color, th=2, dash=10):
    x, y, w, h = int(x), int(y), int(w), int(h)
    for (a, b) in [((x, y), (x + w, y)), ((x + w, y), (x + w, y + h)), ((x + w, y + h), (x, y + h)), ((x, y + h), (x, y))]:
        n = max(1, int(np.hypot(b[0] - a[0], b[1] - a[1]) // dash))
        for i in range(0, n, 2):
            p0 = (int(a[0] + (b[0] - a[0]) * i / n), int(a[1] + (b[1] - a[1]) * i / n))
            p1 = (int(a[0] + (b[0] - a[0]) * min(n, i + 1) / n), int(a[1] + (b[1] - a[1]) * min(n, i + 1) / n))
            cv2.line(img, p0, p1, color, th, cv2.LINE_AA)


def draw_bw(rgb, gts, preds):
    out = to_gray3(rgb)
    for x, y, w, h in gts:
        dashed_rect(out, x, y, w, h, (255, 255, 255), 3, 14)
    for x, y, w, h in preds:  # siyah dış + beyaz iç çizgi: hem karanlık hem parlak zeminde görünür
        cv2.rectangle(out, (int(x), int(y)), (int(x + w), int(y + h)), (0, 0, 0), 9)
        cv2.rectangle(out, (int(x), int(y)), (int(x + w), int(y + h)), (255, 255, 255), 3)
    return out


def main(lang: str) -> None:
    t = L[lang]
    out = RES / f"figures_report_{lang}"
    out.mkdir(parents=True, exist_ok=True)
    res = json.loads((RES / "results.json").read_text(encoding="utf-8"))
    ann = json.loads((ROOT / "dataset" / "annotations.json").read_text(encoding="utf-8"))
    S = {(r["detector"], r["enhancement"]): r for r in res["summary"]}
    SC = {(r["detector"], r["enhancement"], r["condition"]): r for r in res["summary_by_condition"]}
    conds = list(ann["conditions"])
    dec = (lambda v: f"{v:.2f}".replace(".", ",")) if lang == "tr" else (lambda v: f"{v:.2f}")

    # ---- Şekil: akış şeması (dikey, sütun genişliği) ----
    fig, ax = plt.subplots(figsize=(COL_W, 3.3))
    ax.set_xlim(0, 10); ax.set_ylim(0, 10.6); ax.axis("off")

    def box(x, y, w, h, txt, bold=False):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.15", fc="white", ec="black", lw=0.7))
        ax.text(x + w / 2, y + h / 2, txt, ha="center", va="center", fontsize=7, fontweight="bold" if bold else "normal")
        return (x, y, w, h)

    def arr(a, b):
        ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=7, color="black", lw=0.7))
    f = t["flow"]
    b0 = box(1.5, 9.4, 7, 0.9, f[0], True)
    b1 = box(0.6, 7.8, 8.8, 0.9, f[1])
    b2 = box(0.4, 6.1, 4.0, 0.9, f[2]); b3 = box(5.6, 6.1, 4.0, 0.9, f[3])
    b4 = box(0.4, 4.2, 4.0, 1.2, f[4], True); b5 = box(5.6, 4.2, 4.0, 1.2, f[5], True)
    b6 = box(1.5, 2.6, 7, 0.9, f[6]); b7 = box(1.5, 1.0, 7, 0.9, f[7])
    arr((5, 9.4), (5, 8.7)); arr((3, 7.8), (2.4, 7.0)); arr((7, 7.8), (7.6, 7.0))
    arr((2.4, 6.1), (2.4, 5.4)); arr((7.6, 6.1), (7.6, 5.4)); arr((2.4, 4.2), (4.0, 3.5)); arr((7.6, 4.2), (6.0, 3.5)); arr((5, 2.6), (5, 1.9))
    fig.savefig(out / "fig_flow.png", bbox_inches="tight", facecolor="white"); plt.close(fig)

    # ---- Şekil: veri kümesinden bir fotoğrafın üç koşulu ----
    src = next(i for i in ann["images"] if i["condition"] == "normal" and i["file"].endswith("_05.jpg"))
    idx = src["file"].split("_")[-1]
    fig, axes = plt.subplots(1, 3, figsize=(COL_W, 1.0))
    for a, c, pre in zip(axes, conds, ["normal", "lowlight", "backlight"]):
        im = read_rgb(ROOT / "dataset" / "images" / f"{pre}_{idx}")
        a.imshow(to_gray3(im)); a.set_title(t["cond"][c], fontsize=7, pad=2); a.axis("off")
    fig.tight_layout(pad=0.2)
    fig.savefig(out / "fig_conditions.png", bbox_inches="tight", facecolor="white"); plt.close(fig)

    # ---- Şekil: genel F1 (siyah / gri, taralı) ----
    fig, ax = plt.subplots(figsize=(COL_W, 1.9))
    x = np.arange(len(ENH_KEYS))
    styles = {"viola_jones": dict(color="white", edgecolor="black", hatch="///"), "yolo": dict(color="0.25", edgecolor="black")}
    for i, d in enumerate(DETS):
        vals = [S[(d, e)]["f1"] for e in ENH_KEYS]
        bars = ax.bar(x + (i - 0.5) * 0.38, vals, 0.38, label=t["det"][d], lw=0.6, **styles[d])
        for bb, v in zip(bars, vals):
            ax.text(bb.get_x() + bb.get_width() / 2, v + 0.015, dec(v), ha="center", va="bottom", fontsize=6)
    ax.set_xticks(x, [t["enh"][e] for e in ENH_KEYS]); ax.set_ylim(0, 1.08); ax.set_ylabel(t["f1"])
    ax.legend(loc="upper center", ncol=2, frameon=False, bbox_to_anchor=(0.5, 1.18))
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout(pad=0.3)
    fig.savefig(out / "fig_f1.png", bbox_inches="tight", facecolor="white"); plt.close(fig)

    # ---- Şekil: koşul × ön işleme F1 (gri tonlu ısı haritası, iki panel alt alta) ----
    fig, axes = plt.subplots(2, 1, figsize=(COL_W, 2.1))
    for a, d in zip(axes, DETS):
        m = np.array([[SC[(d, e, c)]["f1"] for e in ENH_KEYS] for c in conds])
        a.imshow(m, vmin=0, vmax=1, cmap="Greys", aspect="auto")
        a.set_xticks(range(4), [t["enh"][e] for e in ENH_KEYS]); a.set_yticks(range(len(conds)), [t["cond"][c] for c in conds])
        for i in range(m.shape[0]):
            for j in range(m.shape[1]):
                a.text(j, i, dec(m[i, j]), ha="center", va="center", fontsize=7, color="white" if m[i, j] > 0.55 else "black")
        a.set_title(t["det"][d], fontsize=7.5, pad=2)
        a.tick_params(length=0)
    fig.tight_layout(pad=0.3)
    fig.savefig(out / "fig_heatmap.png", bbox_inches="tight", facecolor="white"); plt.close(fig)

    # ---- Şekil: örnek tespitler (VJ / YOLO × Ham / HE / CLAHE) ----
    rows = {(r["image"], r["enhancement"], r["detector"]): r for r in res["per_image"]}

    def examples(file, name):
        it = next(i for i in ann["images"] if i["file"] == file)
        img = read_rgb(ROOT / "dataset" / file)
        fig, axes = plt.subplots(2, 3, figsize=(COL_W, 1.9 * img.shape[0] / img.shape[1] * 1.12 + 0.25))
        for r_, d in enumerate(DETS):
            for c_, e in enumerate(["original", "hist_eq", "clahe"]):
                rr = rows[(file, e, d)]
                axes[r_, c_].imshow(draw_bw(ENHANCEMENTS[e](img), it["faces"], rr["boxes"]))
                axes[r_, c_].set_title(f"{t['det'][d].split('v8')[0] if d == 'yolo' else 'VJ'} · {t['enh'][e]} · TP {rr['tp']}/{it['count']}, FP {rr['fp']}",
                                       fontsize=5.8, pad=1.5)
                axes[r_, c_].axis("off")
        fig.tight_layout(pad=0.15, h_pad=0.3, w_pad=0.2)
        fig.savefig(out / name, bbox_inches="tight", facecolor="white"); plt.close(fig)

    examples("images/lowlight_01.jpg", "fig_ex_lowlight.png")
    examples("images/backlight_06.jpg", "fig_ex_backlight.png")

    # ---- Şekil: düşük ışık histogramları ----
    img = read_rgb(ROOT / "dataset" / "images" / "lowlight_01.jpg")
    fig, axes = plt.subplots(1, 3, figsize=(COL_W, 1.15), sharey=False)
    for a, e in zip(axes, ["original", "hist_eq", "clahe"]):
        g = cv2.cvtColor(ENHANCEMENTS[e](img), cv2.COLOR_RGB2GRAY)
        a.hist(g.ravel(), bins=64, range=(0, 256), color="0.2")
        a.set_title(t["enh"][e], fontsize=7, pad=2); a.set_xlim(0, 255); a.set_yticks([]); a.set_xticks([0, 128, 255])
        a.spines[["top", "right", "left"]].set_visible(False)
    axes[1].set_xlabel(t["hist"], fontsize=7)
    fig.tight_layout(pad=0.3)
    fig.savefig(out / "fig_hist.png", bbox_inches="tight", facecolor="white"); plt.close(fig)
    print("->", out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "en")

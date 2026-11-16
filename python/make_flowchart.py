"""Projenin akış şemasını docs/akis_semasi.png olarak üretir (teslim kontrol listesi maddesi)."""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

OUT = Path(__file__).resolve().parents[1] / "docs" / "akis_semasi.png"

ACC, SOFT, WARM, OK, TXT, MUT = "#564d80", "#e7e5f6", "#e0795b", "#1f9d55", "#1d1b26", "#6b6880"


def box(ax, x, y, w, h, title, sub="", fc=SOFT, ec=ACC):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.12", fc=fc, ec=ec, lw=1.4))
    ax.text(x + w / 2, y + h * 0.62, title, ha="center", va="center", fontsize=10.5, fontweight="bold", color=TXT)
    if sub:
        ax.text(x + w / 2, y + h * 0.28, sub, ha="center", va="center", fontsize=8, color=MUT)
    return (x, y, w, h)


def arrow(ax, a, b, side_a="r", side_b="l"):
    def pt(bx, s):
        x, y, w, h = bx
        return {"r": (x + w, y + h / 2), "l": (x, y + h / 2), "t": (x + w / 2, y + h), "b": (x + w / 2, y)}[s]
    ax.add_patch(FancyArrowPatch(pt(a, side_a), pt(b, side_b), arrowstyle="-|>", mutation_scale=12, color="#8d91bf", lw=1.4))


def main():
    fig, ax = plt.subplots(figsize=(15, 7.2))
    ax.set_xlim(0, 15)
    ax.set_ylim(0, 7.2)
    ax.axis("off")
    ax.text(7.5, 6.9, "BM447 - Zorlu Koşullarda Yüz Tespiti: İşlem Akışı", ha="center", fontsize=14, fontweight="bold", color=TXT)

    a1 = box(ax, 0.2, 5.3, 2.4, 0.9, "1. Görüntü toplama", "≥15 görüntü, 3 koşul × ≥5")
    a2 = box(ax, 0.2, 3.9, 2.4, 0.9, "Etiketleme", "GT kutular + gerçek sayı")
    a3 = box(ax, 0.2, 2.5, 2.4, 0.9, "annotations.json", "[x, y, w, h]")
    arrow(ax, a1, a2, "b", "t")
    arrow(ax, a2, a3, "b", "t")

    e0 = box(ax, 3.3, 5.5, 2.6, 0.8, "Ham (orijinal)", "baseline")
    e1 = box(ax, 3.3, 4.4, 2.6, 0.8, "Parlaklık/Kontrast", "g = 1.3·f + 20  (elle)")
    e2 = box(ax, 3.3, 3.3, 2.6, 0.8, "Histogram Eşitleme", "CDF→LUT, Y kanalı (elle)")
    e3 = box(ax, 3.3, 2.2, 2.6, 0.8, "CLAHE", "clip 2.0, 8×8 blok")
    for e in (e0, e1, e2, e3):
        arrow(ax, a3, e)
    ax.text(4.6, 1.75, "3. Görüntü iyileştirme (her biri ayrı ayrı)", ha="center", fontsize=8.5, color=MUT, style="italic")

    g = box(ax, 6.7, 4.6, 2.5, 0.9, "Gri dönüşüm", "0.2989R+0.5870G+0.1140B")
    lb = box(ax, 6.7, 2.6, 2.5, 0.9, "Letterbox 640×640", "ölçek+öteleme, /255, CHW")
    for e in (e0, e1, e2, e3):
        arrow(ax, e, g)
        arrow(ax, e, lb)

    vj = box(ax, 9.9, 4.6, 2.4, 0.9, "Viola-Jones", "Haar+kaskad sf1.1 mN5", fc="#fbe4dc", ec=WARM)
    yo = box(ax, 9.9, 2.6, 2.4, 0.9, "YOLOv8n-face", "CNN, conf .35, NMS .45", fc="#e3e0f5", ec=ACC)
    arrow(ax, g, vj)
    arrow(ax, lb, yo)

    ev = box(ax, 12.8, 3.9, 2.0, 0.9, "5. Değerlendirme", "IoU ≥ 0.50 bire bir", fc="#ddf1e5", ec=OK)
    rp = box(ax, 12.8, 2.5, 2.0, 0.9, "Raporlama", "TP FP FN P R F1 MAE ms", fc="#ddf1e5", ec=OK)
    arrow(ax, vj, ev)
    arrow(ax, yo, ev)
    arrow(ax, ev, rp, "b", "t")

    ax.text(10.4, 1.75, "2. Baseline + 4. Kontrollü karşılaştırma: aynı veri, sabit ayarlar", ha="center", fontsize=8.5, color=MUT, style="italic")
    box(ax, 3.3, 0.35, 11.5, 0.9, "Sonuç: Görsel olarak daha iyi görüntü ≠ her zaman daha iyi tespit",
        "VJ: HE/CLAHE düşük ışıkta recall'u artırır ama normal ışıkta FP ekler · YOLO: ön işlemeye duyarsız", fc="#fff6e0", ec="#c98a12")
    OUT.parent.mkdir(exist_ok=True)
    fig.savefig(OUT, dpi=160, bbox_inches="tight", facecolor="white")
    print("->", OUT)


if __name__ == "__main__":
    main()

"""Görüntü iyileştirme işlemleri.

Projede istenen üç iyileştirme:
  1) Parlaklık / kontrast ayarı   -> brightness_contrast()   (ELLE yazıldı)
  2) Histogram eşitleme           -> hist_equalize_manual()  (ELLE yazıldı, hazır fonksiyon yok)
  3) Adaptif histogram eşitleme   -> clahe()                 (OpenCV createCLAHE)

Renkli görüntülerde HE ve CLAHE yalnızca parlaklık (Y) kanalına uygulanır;
böylece renk tonu (Cr, Cb) bozulmaz ve YOLO renkli girdiyi kullanmaya devam eder.
Tüm görüntüler RGB uint8 (H, W, 3) olarak dolaşır.
"""
from __future__ import annotations

import cv2
import numpy as np

# ---- Sabit deney parametreleri (tüm görüntülerde aynı; görüntü başına ayar YOK) ----
ALPHA = 1.3   # kontrast kazancı
BETA = 20     # parlaklık ofseti (gri seviye)
CLAHE_CLIP = 2.0
CLAHE_TILES = (8, 8)

# ITU-R BT.601 ağırlıkları (MATLAB rgb2gray ile aynı)
W_R, W_G, W_B = 0.2989, 0.5870, 0.1140


def to_gray_manual(rgb: np.ndarray) -> np.ndarray:
    """Gri dönüşüm: Y = 0.2989 R + 0.5870 G + 0.1140 B (elle)."""
    f = rgb.astype(np.float32)
    y = W_R * f[..., 0] + W_G * f[..., 1] + W_B * f[..., 2]
    return np.clip(np.rint(y), 0, 255).astype(np.uint8)


def brightness_contrast(rgb: np.ndarray, alpha: float = ALPHA, beta: float = BETA) -> np.ndarray:
    """g(x,y) = clip(alpha * f(x,y) + beta, 0, 255)  (nokta işlemi, elle)."""
    g = alpha * rgb.astype(np.float32) + beta
    return np.clip(np.rint(g), 0, 255).astype(np.uint8)


def histogram_manual(channel: np.ndarray) -> np.ndarray:
    """256 kutulu histogram; np.histogram/cv2.calcHist kullanılmadan sayılır."""
    h = np.zeros(256, dtype=np.int64)
    # np.add.at: her piksel değeri için ilgili kutuyu 1 artırır (döngünün vektörel hali)
    np.add.at(h, channel.ravel(), 1)
    return h


def equalize_channel_manual(channel: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Klasik histogram eşitleme (Gonzalez & Woods):
        s_k = round( (CDF(k) - CDF_min) / (N - CDF_min) * 255 )
    Dönüş: (eşitlenmiş kanal, 256 elemanlı LUT)."""
    h = histogram_manual(channel)
    cdf = np.cumsum(h)
    n = channel.size
    nz = cdf[cdf > 0]
    cdf_min = int(nz[0]) if nz.size else 0
    if n == cdf_min:  # tek renkli görüntü: değişiklik yok
        lut = np.arange(256, dtype=np.uint8)
    else:
        lut = np.rint((cdf - cdf_min) / (n - cdf_min) * 255.0)
        lut = np.clip(lut, 0, 255).astype(np.uint8)
    return lut[channel], lut


def _rgb_to_ycrcb_manual(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    f = rgb.astype(np.float32)
    y = 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]
    cr = (f[..., 0] - y) * 0.713 + 128.0
    cb = (f[..., 2] - y) * 0.564 + 128.0
    return y, cr, cb


def _ycrcb_to_rgb_manual(y: np.ndarray, cr: np.ndarray, cb: np.ndarray) -> np.ndarray:
    y = y.astype(np.float32)
    r = y + 1.403 * (cr - 128.0)
    g = y - 0.714 * (cr - 128.0) - 0.344 * (cb - 128.0)
    b = y + 1.773 * (cb - 128.0)
    return np.clip(np.rint(np.stack([r, g, b], -1)), 0, 255).astype(np.uint8)


def hist_equalize_manual(rgb: np.ndarray) -> np.ndarray:
    """Renkli görüntüde HE: Y kanalı elle eşitlenir, Cr/Cb korunur."""
    y, cr, cb = _rgb_to_ycrcb_manual(rgb)
    y8 = np.clip(np.rint(y), 0, 255).astype(np.uint8)
    y_eq, _ = equalize_channel_manual(y8)
    return _ycrcb_to_rgb_manual(y_eq, cr, cb)


def clahe(rgb: np.ndarray, clip: float = CLAHE_CLIP, tiles: tuple[int, int] = CLAHE_TILES) -> np.ndarray:
    """CLAHE (Contrast Limited Adaptive HE) - OpenCV, yalnız Y kanalında."""
    y, cr, cb = _rgb_to_ycrcb_manual(rgb)
    y8 = np.clip(np.rint(y), 0, 255).astype(np.uint8)
    op = cv2.createCLAHE(clipLimit=clip, tileGridSize=tiles)
    return _ycrcb_to_rgb_manual(op.apply(y8), cr, cb)


ENHANCEMENTS = {
    "original": lambda im: im,
    "brightness_contrast": brightness_contrast,
    "hist_eq": hist_equalize_manual,
    "clahe": clahe,
}

ENH_LABELS_TR = {
    "original": "Ham (orijinal)",
    "brightness_contrast": "Parlaklık/Kontrast",
    "hist_eq": "Histogram Eşitleme",
    "clahe": "CLAHE",
}

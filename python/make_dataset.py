"""Grup fotoğraflarından deney veri kümesini üretir (18 görüntü = 6 fotoğraf × 3 koşul).

Girdi:
  dataset/originals/group_XX.jpg     grup üyelerinin onaylı, işlenmemiş fotoğrafları (6 adet)
  dataset/originals/faces_1280.json  her fotoğraf için referans yüz kutuları [x, y, w, h]
                                     (uzun kenarı 1280 px'e küçültülmüş görüntü koordinatlarında)

Çıktı:
  dataset/images/normal_XX.jpg       fotoğrafın kendisi (yön düzeltilmiş, uzun kenar 1280 px)
  dataset/images/lowlight_XX.jpg     düşük ışık sürümü  (gama + kazanç + sensör gürültüsü)
  dataset/images/backlight_XX.jpg    ters ışık sürümü   (özne kararır, arka plan parlar)
  dataset/annotations.json           referans kutular + koşul etiketleri

Referans kutular nasıl çizildi: YOLOv8n-face düşük eşikle (0.10) ve Viola-Jones aday kutu önerdi; her öneri
görsel olarak tek tek kontrol edildi, yalnız gerçekten görünen yüzler tutuldu (arkası dönük / yüzü görünmeyen
kişiler çıkarıldı; kenarda kesilen veya elle kısmen örtülen yüzler tutuldu). Düşük ışık ve ters ışık
sürümleri aynı fotoğrafın piksel değerlerini değiştirir, geometrisini değiştirmez; bu yüzden kutular aynıdır.

Not: Düşük ışık ve ters ışık koşulları gerçek çekimler değil, normal fotoğraflardan kontrollü olarak
türetilmiştir (rapordaki "Sınırlılıklar" bölümüne bakınız). Tohum sabit (42) -> tekrarlanabilir.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ORIG = ROOT / "dataset" / "originals"
OUT = ROOT / "dataset"
IMG_DIR = OUT / "images"
MAX_SIDE = 1280
RNG = np.random.default_rng(42)

# ---- koşul dönüşümlerinin sabit parametreleri ----
LOW_GAMMA, LOW_GAIN, LOW_SIGMA = 2.0, 0.22, 5.0   # s = 255·gain·(r/255)^gamma + N(0, sigma)
BACK_GAMMA, BACK_GAIN = 1.8, 0.30                 # özne kararması
BACK_LEVEL = 200                                   # arka planın taban parlaklığı (+ 55'e kadar parlama)


def read_rgb(p: Path) -> np.ndarray:
    bgr = cv2.imdecode(np.fromfile(str(p), np.uint8), cv2.IMREAD_COLOR)  # EXIF yönü uygulanır
    s = MAX_SIDE / max(bgr.shape[:2])
    if s < 1:
        bgr = cv2.resize(bgr, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def write_jpg(path: Path, rgb: np.ndarray) -> None:
    ok, buf = cv2.imencode(".jpg", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
    assert ok
    buf.tofile(str(path))  # Unicode yol güvenli


def low_light(rgb: np.ndarray) -> np.ndarray:
    """Az ışık: gama ile koyulaştırma + kazanç düşürme + Gauss sensör gürültüsü."""
    f = (rgb.astype(np.float32) / 255.0) ** LOW_GAMMA * LOW_GAIN * 255.0
    f += RNG.normal(0, LOW_SIGMA, f.shape)
    return np.clip(f, 0, 255).astype(np.uint8)


def backlight(rgb: np.ndarray, faces: list) -> np.ndarray:
    """Ters ışık: kişiler (yüz kutularından türetilen baş-gövde maskesi) kararır,
    arka plan üstten gelen parlak bir kaynakla neredeyse beyaza doyar."""
    h, w = rgb.shape[:2]
    subject = (rgb.astype(np.float32) / 255.0) ** BACK_GAMMA * BACK_GAIN * 255.0
    yy, xx = np.mgrid[0:h, 0:w]
    glow = np.exp(-(((xx - w * 0.5) / (w * 0.7)) ** 2 + ((yy - h * 0.05) / (h * 0.8)) ** 2))
    # arka plan: aşırı pozlanmış sahne (gama 0.35 ile parlatma) + üstten gelen ışık parlaması (haze)
    over = 255.0 * (rgb.astype(np.float32) / 255.0) ** 0.35
    haze = (BACK_LEVEL + 55 * glow)[..., None] * np.array([1.0, 0.98, 0.93])
    background = 0.45 * over + 0.55 * haze
    mask = np.zeros((h, w), np.float32)
    for x, y, fw, fh in faces:
        cx, cy = int(x + fw / 2), int(y + fh / 2)
        cv2.ellipse(mask, (cx, cy), (int(fw * 0.8), int(fh * 0.75)), 0, 0, 360, 1.0, -1)                # baş
        cv2.ellipse(mask, (cx, int(cy + fh * 2.2)), (int(fw * 1.5), int(fh * 2.0)), 0, 0, 360, 1.0, -1)  # omuz/gövde
    k = max(3, int(min(h, w) * 0.04))
    mask = cv2.GaussianBlur(mask, (0, 0), k)[..., None]
    return np.clip(subject * mask + background * (1 - mask), 0, 255).astype(np.uint8)


def main() -> None:
    faces_all = json.loads((ORIG / "faces_1280.json").read_text(encoding="utf-8"))
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    for old in IMG_DIR.glob("*"):  # eski görüntüleri temizle
        old.unlink()
    items = []
    for i, name in enumerate(sorted(faces_all), start=1):
        rgb = read_rgb(ORIG / f"{name}.jpg")
        faces = [[float(v) for v in b] for b in faces_all[name]]
        variants = [("normal", "normal", rgb), ("lowlight", "low_light", low_light(rgb)), ("backlight", "backlight", backlight(rgb, faces))]
        for prefix, cond, img in variants:
            fn = f"{prefix}_{i:02d}.jpg"
            write_jpg(IMG_DIR / fn, img)
            items.append({"file": f"images/{fn}", "condition": cond, "width": int(img.shape[1]), "height": int(img.shape[0]),
                          "faces": faces, "count": len(faces), "source": f"originals/{name}.jpg",
                          "note": {"normal": "orijinal fotoğraf", "low_light": "düşük ışık (türetilmiş)", "backlight": "ters ışık (türetilmiş)"}[cond]})
    items.sort(key=lambda it: (["normal", "low_light", "backlight"].index(it["condition"]), it["file"]))
    meta = {
        "name": "CE447 grup fotoğrafları veri kümesi",
        "description": "6 grup fotoğrafı; her biri normal, düşük ışık (türetilmiş) ve ters ışık (türetilmiş) olmak üzere 3 koşulda.",
        "box_format": "[x, y, w, h] piksel, sol-üst köşe",
        "annotation": "YOLO (eşik 0.10) ve Viola-Jones önerileri görsel olarak tek tek kontrol edildi; yalnız görünen yüzler tutuldu.",
        "conditions": {"normal": "Normal ışık", "low_light": "Düşük ışık", "backlight": "Ters ışık"},
        "derivation": {"low_light": f"gamma={LOW_GAMMA}, gain={LOW_GAIN}, noise_sigma={LOW_SIGMA}",
                       "backlight": f"subject gamma={BACK_GAMMA}, gain={BACK_GAIN}; background level={BACK_LEVEL}+55·glow"},
        "seed": 42,
        "images": items,
    }
    (OUT / "annotations.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(items)} görüntü, {sum(i['count'] for i in items)} yüz -> {OUT}")


if __name__ == "__main__":
    main()

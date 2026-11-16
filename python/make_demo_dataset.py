"""SENTETİK DEMO veri kümesi üretir (15 görüntü, kesin referans kutularıyla).

ÖNEMLİ: Ödev, grup üyelerinin kendi fotoğraflarını (en az 15, her koşulda en az 5)
istemektedir. Bu betik yalnızca hattın (pipeline) uçtan uca çalıştığını göstermek ve
grup fotoğrafları çekilene kadar sistemi test etmek için kamu malı (public domain)
NASA astronot portresinden (scikit-image `data.astronaut`, Eileen Collins) türetilmiş
bir demo kümesi üretir. Gerçek teslimde `dataset/` klasörü grup fotoğrafları ve
web arayüzündeki Etiketleme aracıyla çizilmiş kutularla değiştirilmelidir.

Koşullar (her biri 5 görüntü):
  normal    : normal ışık, 1-4 yüz
  low_light : düşük ışık  -> gama (γ=2.2) + kazanç (x0.13) + Gauss sensör gürültüsü
  backlight : ters ışık   -> çok parlak arka plan + kararmış özne (siluet etkisi)
Çoklu yüzlü sahneler, portre kırpıntısının farklı ölçeklerde yapıştırılmasıyla kurulur;
böylece referans kutular geometrik olarak KESİN bilinir.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from skimage import data

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dataset"
IMG_DIR = OUT / "images"
RNG = np.random.default_rng(42)  # sabit tohum -> tekrarlanabilir

# Orijinal 512x512 portrede elle çizilmiş referans yüz kutusu [x, y, w, h]
# (alın/saç çizgisi -> çene, iki yanak arası)
BASE_FACE = (176, 58, 96, 124)
# Baş-omuz kırpıntısı (300x300) ve bu kırpıntı içindeki yüz kutusu
CROP = (76, 20, 300, 300)  # x, y, w, h
FACE_IN_CROP = (BASE_FACE[0] - CROP[0], BASE_FACE[1] - CROP[1], BASE_FACE[2], BASE_FACE[3])


def write_jpg(path: Path, rgb: np.ndarray) -> None:
    ok, buf = cv2.imencode(".jpg", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
    assert ok
    buf.tofile(str(path))  # Unicode yol güvenli


def gradient_bg(h: int, w: int, c1, c2) -> np.ndarray:
    t = np.linspace(0, 1, h)[:, None, None]
    return (np.array(c1)[None, None] * (1 - t) + np.array(c2)[None, None] * t).repeat(w, 1).astype(np.float32)


def paste(canvas: np.ndarray, crop: np.ndarray, x: int, y: int, s: float, flip: bool, faces: list) -> None:
    size = int(round(crop.shape[0] * s))
    p = cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA)
    if flip:
        p = p[:, ::-1]
    # yumuşak kenarlı maske (dairesel/eliptik) ile yapıştır -> daha doğal kolaj
    yy, xx = np.mgrid[0:size, 0:size]
    m = (((xx - size / 2) / (size * 0.48)) ** 2 + ((yy - size * 0.55) / (size * 0.56)) ** 2) <= 1.0
    m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), size * 0.03)[..., None]
    h, w = canvas.shape[:2]
    x2, y2 = min(w, x + size), min(h, y + size)
    region = canvas[y:y2, x:x2]
    pp, mm = p[: y2 - y, : x2 - x].astype(np.float32), m[: y2 - y, : x2 - x]
    canvas[y:y2, x:x2] = region * (1 - mm) + pp * mm
    fx, fy, fw, fh = FACE_IN_CROP
    if flip:
        fx = CROP[2] - fx - fw
    faces.append([round(x + fx * s, 1), round(y + fy * s, 1), round(fw * s, 1), round(fh * s, 1)])


def group_scene(layout, bg) -> tuple[np.ndarray, list]:
    a = data.astronaut()
    cx, cy, cw, ch = CROP
    crop = a[cy:cy + ch, cx:cx + cw]
    canvas = bg.copy()
    faces: list = []
    for x, y, s, flip in layout:
        paste(canvas, crop, x, y, s, flip, faces)
    return np.clip(canvas, 0, 255).astype(np.uint8), faces


def low_light(rgb: np.ndarray, gamma=2.2, gain=0.13, sigma=5.0) -> np.ndarray:
    f = (rgb.astype(np.float32) / 255.0) ** gamma * gain * 255.0
    f += RNG.normal(0, sigma, f.shape)
    return np.clip(f, 0, 255).astype(np.uint8)


def backlight(rgb: np.ndarray, faces: list, gain=0.17, gamma=2.0) -> np.ndarray:
    """Özne kararır, arka plan neredeyse beyaza patlar (ters ışık)."""
    h, w = rgb.shape[:2]
    f = (rgb.astype(np.float32) / 255.0) ** gamma * gain * 255.0
    # merkezdeki parlak kaynak (pencere/güneş) + genel parlak arka plan
    yy, xx = np.mgrid[0:h, 0:w]
    glow = np.exp(-(((xx - w * 0.5) / (w * 0.6)) ** 2 + ((yy - h * 0.1) / (h * 0.7)) ** 2))
    bright = 175 + 80 * glow
    # özne maskesi: yüzlerin etrafındaki baş-omuz bölgesi (kararmış kalır)
    mask = np.zeros((h, w), np.float32)
    for x, y, fw, fh in faces:
        cv2.ellipse(mask, (int(x + fw / 2), int(y + fh * 0.9)), (int(fw * 1.25), int(fh * 1.6)), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), 9)[..., None]
    out = f * mask + (bright[..., None] * np.array([1.0, 0.98, 0.93]) * (1 - mask) + f * 0.25 * (1 - mask))
    return np.clip(out, 0, 255).astype(np.uint8)


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    a = data.astronaut()
    items = []

    def add(name, cond, img, faces, note):
        write_jpg(IMG_DIR / f"{name}.jpg", img)
        items.append({
            "file": f"images/{name}.jpg", "condition": cond, "width": int(img.shape[1]),
            "height": int(img.shape[0]), "faces": faces, "count": len(faces), "note": note,
        })

    W, H = 640, 480
    warm = gradient_bg(H, W, (205, 200, 195), (150, 140, 135))
    cool = gradient_bg(H, W, (190, 205, 220), (110, 120, 140))
    green = gradient_bg(H, W, (200, 215, 200), (120, 135, 120))

    layouts = {
        "one_big": [(150, 70, 1.15, False)],
        "two": [(40, 110, 0.95, False), (330, 90, 1.0, True)],
        "three": [(10, 160, 0.72, False), (215, 90, 0.75, True), (420, 150, 0.72, False)],
        "four": [(0, 200, 0.58, True), (150, 110, 0.6, False), (310, 170, 0.6, True), (460, 100, 0.58, False)],
        "five_small": [(20, 60, 0.42, False), (160, 220, 0.4, True), (300, 70, 0.42, False), (430, 230, 0.4, True), (500, 40, 0.38, False)],
    }

    # --- normal ---
    add("normal_01", "normal", a.copy(), [list(map(float, BASE_FACE))], "orijinal portre")
    fl = cv2.resize(a[:, ::-1].copy(), (480, 480), interpolation=cv2.INTER_AREA)
    s = 480 / 512
    fx, fy, fw, fh = BASE_FACE
    add("normal_02", "normal", fl, [[round((512 - fx - fw) * s, 1), round(fy * s, 1), round(fw * s, 1), round(fh * s, 1)]], "yatay çevrilmiş + ölçeklenmiş")
    for i, (key, bg) in enumerate([("two", warm), ("three", cool), ("four", green)], start=3):
        img, faces = group_scene(layouts[key], bg)
        add(f"normal_{i:02d}", "normal", img, faces, f"grup kolajı ({len(faces)} yüz)")

    # --- low light ---
    ll = [("one_big", cool), ("two", green), ("three", warm), ("four", cool), ("five_small", warm)]
    for i, (key, bg) in enumerate(ll, start=1):
        img, faces = group_scene(layouts[key], bg)
        add(f"lowlight_{i:02d}", "low_light", low_light(img), faces, f"düşük ışık ({len(faces)} yüz)")

    # --- backlight ---
    bl = [("one_big", warm), ("two", cool), ("three", green), ("four", warm), ("five_small", cool)]
    for i, (key, bg) in enumerate(bl, start=1):
        img, faces = group_scene(layouts[key], bg)
        add(f"backlight_{i:02d}", "backlight", backlight(img, faces), faces, f"ters ışık ({len(faces)} yüz)")

    meta = {
        "name": "BM447 sentetik demo yüz veri kümesi",
        "warning": "Demo amaçlıdır. Teslimde grup üyelerinin onaylı fotoğraflarıyla değiştirilmelidir.",
        "source": "scikit-image data.astronaut (NASA, public domain)",
        "box_format": "[x, y, w, h] piksel, sol-üst köşe",
        "conditions": {"normal": "Normal ışık", "low_light": "Düşük ışık", "backlight": "Ters ışık"},
        "seed": 42,
        "images": items,
    }
    (OUT / "annotations.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(items)} görüntü, {sum(i['count'] for i in items)} yüz -> {OUT}")


if __name__ == "__main__":
    main()

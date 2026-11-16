"""İki yüz dedektörü: Viola-Jones (Haar Cascade) ve YOLOv8n-face (ONNX).

Kutular her yerde [x, y, w, h] (piksel, sol-üst köşe) biçimindedir.
Parametreler SABİTTİR; görüntü bazında değiştirilmez (ödev kuralı).
"""
from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

from .enhance import to_gray_manual

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "models"

# ---- Viola-Jones parametreleri ----
HAAR_FILE = MODELS / "haarcascade_frontalface_default.xml"
HAAR_SCALE = 1.1
HAAR_NEIGHBORS = 5
HAAR_MIN_SIZE = (24, 24)

# ---- YOLO parametreleri ----
YOLO_FILE = MODELS / "yolov8n-face-lindevs.onnx"
YOLO_SIZE = 640
YOLO_CONF = 0.35
YOLO_NMS_IOU = 0.45


class HaarDetector:
    name = "viola_jones"
    label = "Viola-Jones (Haar)"

    def __init__(self) -> None:
        self.clf = cv2.CascadeClassifier()
        if str(HAAR_FILE).isascii():
            self.clf.load(str(HAAR_FILE))
        if self.clf.empty():
            # Windows'ta OpenCV, ASCII olmayan yolları (ör. "GÜZ") açamıyor:
            # dosyayı ASCII bir geçici klasöre kopyalayıp oradan yükle.
            import shutil
            import tempfile

            tmp = Path(tempfile.gettempdir()) / "fd_haarcascade_frontalface_default.xml"
            shutil.copyfile(HAAR_FILE, tmp)
            self.clf = cv2.CascadeClassifier(str(tmp))
        if self.clf.empty():
            raise RuntimeError(f"Haar cascade yüklenemedi: {HAAR_FILE}")

    def params(self) -> dict:
        return {
            "model": HAAR_FILE.name,
            "scaleFactor": HAAR_SCALE,
            "minNeighbors": HAAR_NEIGHBORS,
            "minSize": list(HAAR_MIN_SIZE),
            "input": "gri (0.2989R+0.5870G+0.1140B)",
        }

    def detect(self, rgb: np.ndarray) -> tuple[list[list[float]], list[float], float]:
        gray = to_gray_manual(rgb)
        t0 = time.perf_counter()
        boxes = self.clf.detectMultiScale(
            gray, scaleFactor=HAAR_SCALE, minNeighbors=HAAR_NEIGHBORS, minSize=HAAR_MIN_SIZE
        )
        ms = (time.perf_counter() - t0) * 1000
        out = [list(map(float, b)) for b in (boxes if len(boxes) else [])]
        return out, [1.0] * len(out), ms


def letterbox(rgb: np.ndarray, size: int = YOLO_SIZE) -> tuple[np.ndarray, float, int, int]:
    """En-boy oranını koruyarak size x size tuvale yerleştir (gri 114 dolgu)."""
    h, w = rgb.shape[:2]
    r = min(size / h, size / w)
    nw, nh = round(w * r), round(h * r)
    resized = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((size, size, 3), 114, dtype=np.uint8)
    px, py = (size - nw) // 2, (size - nh) // 2
    canvas[py:py + nh, px:px + nw] = resized
    return canvas, r, px, py


def iou_xywh(a, b) -> float:
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0.0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def nms(boxes: list, scores: list, thr: float) -> list[int]:
    """Greedy Non-Maximum Suppression (elle)."""
    order = sorted(range(len(boxes)), key=lambda i: scores[i], reverse=True)
    keep: list[int] = []
    for i in order:
        if all(iou_xywh(boxes[i], boxes[k]) < thr for k in keep):
            keep.append(i)
    return keep


class YoloFaceDetector:
    name = "yolo"
    label = "YOLOv8n-face"

    def __init__(self) -> None:
        so = ort.SessionOptions()
        so.intra_op_num_threads = 4
        self.sess = ort.InferenceSession(str(YOLO_FILE), so, providers=["CPUExecutionProvider"])
        self.inp = self.sess.get_inputs()[0].name

    def params(self) -> dict:
        return {
            "model": YOLO_FILE.name,
            "kaynak": "https://github.com/lindevs/yolov8-face (release 1.0.1, WIDER FACE)",
            "inputSize": YOLO_SIZE,
            "confThreshold": YOLO_CONF,
            "nmsIoU": YOLO_NMS_IOU,
            "runtime": f"onnxruntime {ort.__version__} (CPU)",
        }

    def detect(self, rgb: np.ndarray):
        img, r, px, py = letterbox(rgb)
        x = img.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
        t0 = time.perf_counter()
        out = self.sess.run(None, {self.inp: x})[0][0]  # (5, 8400): cx, cy, w, h, skor
        ms = (time.perf_counter() - t0) * 1000
        scores = out[4]
        idx = np.where(scores >= YOLO_CONF)[0]
        boxes, confs = [], []
        h, w = rgb.shape[:2]
        for i in idx:
            cx, cy, bw, bh = out[0, i], out[1, i], out[2, i], out[3, i]
            x1 = (cx - bw / 2 - px) / r
            y1 = (cy - bh / 2 - py) / r
            x1c, y1c = max(0.0, x1), max(0.0, y1)
            x2c, y2c = min(w, x1 + bw / r), min(h, y1 + bh / r)
            boxes.append([float(x1c), float(y1c), float(x2c - x1c), float(y2c - y1c)])
            confs.append(float(scores[i]))
        keep = nms(boxes, confs, YOLO_NMS_IOU)
        return [boxes[k] for k in keep], [confs[k] for k in keep], ms

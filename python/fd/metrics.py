"""Başarım ölçütleri: IoU >= 0.50 ile bire bir eşleştirme, TP/FP/FN, P/R/F1, sayma hatası, MAE."""
from __future__ import annotations

from .detectors import iou_xywh

IOU_THR = 0.50


def match(preds: list, gts: list, thr: float = IOU_THR) -> tuple[int, int, int, list]:
    """Greedy bire bir eşleştirme: tüm (tahmin, referans) çiftlerinin IoU'su
    büyükten küçüğe sıralanır; ikisi de boştaysa ve IoU >= thr ise eşleşir.
    Bir referans kutu en fazla bir tahminle eşleşir (çift sayım yok)."""
    pairs = []
    for i, p in enumerate(preds):
        for j, g in enumerate(gts):
            v = iou_xywh(p, g)
            if v >= thr:
                pairs.append((v, i, j))
    pairs.sort(reverse=True)
    used_p, used_g, matches = set(), set(), []
    for v, i, j in pairs:
        if i in used_p or j in used_g:
            continue
        used_p.add(i)
        used_g.add(j)
        matches.append((i, j, round(v, 4)))
    tp = len(matches)
    return tp, len(preds) - tp, len(gts) - tp, matches


def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    return p, r, f1

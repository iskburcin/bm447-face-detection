# BM447 Face Detection Project — Presentation and Defense Guide

This document is meant to be used while presenting the project to our instructor (Prof. Dr. Pakize Erdoğmuş) and while answering individual questions.
For every algorithm it explains **what** it is, **why** we chose it and **where** it is in the code; at the end there is a list of likely questions with ready answers.

> **Language note:** the website has a **TR/EN language switch in the header**. Switch it to **EN** before the demo so that all page names, labels and panels appear in English (Live Detection, Lecture Lab, Experiments, Annotation, Method). Route paths do not change (`/tespit`, `/laboratuvar`, `/deneyler`, `/etiketleme`, `/yontem`).

> The highest-weighted rubric item (5/20) is the **live demonstration and individual defense**. Every group member must be able to explain the whole pipeline and describe their own contribution in detail.

---

## 0. 5-minute presentation flow (suggested)

| Time | What to show | Where |
|---|---|---|
| 0:00–0:40 | Goal + research question, two detectors, three conditions | Home page (`/`) |
| 0:40–1:30 | Flowchart: image → 4 preprocessing options → gray/letterbox → VJ/YOLO → IoU → metrics | **Method** page (`/yontem`) or `docs/akis_semasi.png` |
| 1:30–3:00 | **Live demo**: pick a low-light sample → raw: VJ misses most faces, YOLO finds most of them → apply the “HE” preset → VJ now finds the faces. Then backlight + HE → both detectors get worse, CLAHE fixes it. Normal light + CLAHE → VJ loses faces. Live mode with the camera. | **Live Detection** (`/tespit`) |
| 3:00–4:00 | Result tables, heat map, “visually better ≠ better detection” (global HE in backlight) | **Experiments** (`/deneyler`) |
| 4:00–5:00 | Hand-written histogram equalization: CDF → LUT, difference from `cv2.equalizeHist` is 0. One lesson from the Lab (e.g. Viola-Jones raw candidates, or YOLO before/after NMS) | **Lecture Lab** (`/laboratuvar#histogram`, `#vj`, `#yolo`) |

Pre-demo check: run with `npm run build && npm start` (or `docker compose up`), open the page once and make sure the models have loaded (✓ marks); no internet connection is needed (the models are served by the server).

---

## 1. Project summary (memorize this)

> “We measured how lighting and image enhancement affect face detection. We compared the classic Viola-Jones detector with YOLOv8n-face, a model trained specifically for faces, under normal, low and back lighting, with four preprocessing options — raw, brightness/contrast, histogram equalization and CLAHE — using the same data and fixed settings. We matched detections one-to-one with IoU ≥ 0.5 and reported TP, FP, FN, precision, recall, F1, counting error, MAE and run times. The result: YOLO is far better overall (raw F1 0.93 versus 0.50) and preprocessing changes it by only a few faces. Enhancement rescues Viola-Jones in the dark (4/24 → 14/24 faces with HE) but makes it worse in good lighting; in backlight, global HE hurts both detectors while local CLAHE helps both. In other words, a visually better image does not always mean better detection — the effect depends on the detector, the starting condition and whether the enhancement is global or local.”

Dataset: 6 consented group photos × 3 conditions = **18 images, 72 faces** (24 per condition). Whole dataset (`results/summary.csv`):

| Detector | Raw F1 | B/C F1 | HE F1 | CLAHE F1 |
|---|---|---|---|---|
| Viola-Jones | 0.495 (TP 27, FP 10, P 0.730, R 0.375, MAE 2.28) | 0.528 (TP 28, FP 6) | 0.562 (TP 34, FP 15, MAE 1.50) | 0.555 (TP 33, FP 14, MAE 1.39) |
| YOLOv8n-face | 0.934 (TP 64, FP 1, P 0.985, R 0.889, MAE 0.39) | 0.935 | 0.926 | **0.950** (TP 66, MAE 0.28) |

(B/C = brightness/contrast, HE = histogram equalization.)

By condition (TP out of 24, F1 in brackets):

| Detector / condition | Raw | B/C | HE | CLAHE |
|---|---|---|---|---|
| VJ normal | 15 (0.667; 6 FP) | 14 (0.667) | 14 (0.636) | 12 (0.585) |
| VJ low light | 4 (0.258) | 7 (0.424) | **14 (0.651)** | 12 (0.571) |
| VJ backlight | 8 (0.485) | 7 (0.452) | 6 (0.353; 4 FP) | 9 (0.500) |
| YOLO normal | 23 (0.958) | 24 (0.960; 2 FP) | 23 (0.958) | 23 (0.958) |
| YOLO low light | 20 (0.909) | 20 | 21 (0.933) | 21 (0.933) |
| YOLO backlight | 21 (0.933) | 21 | 19 (0.884) | **22 (0.957)** |

Timing (CPU, inference / end-to-end): VJ raw 92 / 108 ms (end-to-end 245 ms with HE, 221 ms with CLAHE); YOLO raw 51.5 / 55.5 ms (end-to-end 113 ms with CLAHE). On these 1280-px images **YOLO inference is faster than Viola-Jones**; preprocessing increases the end-to-end time for both detectors.

---

## 2. Every step of the pipeline: what, why, where

### 2.1 Image collection and annotation
* **What:** **6 consented group photos** of the students (night/day, indoor/outdoor, selfies and a standing group shot). Each photo in 3 conditions → **18 images** (6 per condition), **72 faces** (24 per condition). The visible faces of people in the background are annotated too. Every visible face gets an `[x, y, w, h]` box, plus the true face count.
* **Conditions:** *Normal* = the photo itself (orientation-corrected, long side 1280 px). *Low light* and *backlight* are not separate shots but **controlled derivations** of the same photo: low light `s = 255·0.22·(r/255)^2.0` + Gaussian noise σ = 5; backlight: the people inside a head/body mask built from the face boxes are darkened (γ = 1.8, gain 0.30) and the background is over-exposed with glare. Script: `python/make_dataset.py` (seed 42).
* **Ground-truth boxes:** YOLOv8n-face at a low threshold (0.10) and Viola-Jones proposed candidates; each was checked visually and only genuinely visible faces were kept (people facing away removed; border-cut or hand-covered faces kept). Honest caveat: the boxes follow YOLO's box style, so IoU may be slightly biased in YOLO's favour.
* **Tool:** the **Annotation** tool on the website (`/etiketleme`): drag-and-drop with the mouse, condition selection, per-condition counters, `annotations.json` export. “Suggest with YOLO” is only for speed; every box must be checked by hand.
* **Annotation rule:** from the forehead/hairline to the chin, cheek to cheek; partially occluded but visible faces are also annotated.
* **Code:** `python/make_dataset.py`, `app/etiketleme/Annotator.tsx`, data: `dataset/annotations.json`.

### 2.2 Digital image fundamentals (Lab 1–2)
* Image = an `f(x, y)` matrix; 8 bits → 0–255. Sampling (resolution) and quantization (bit depth).
* **Grayscale conversion:** `Y = 0.2989R + 0.5870G + 0.1140B` (MATLAB `rgb2gray`, BT.601). The eye is most sensitive to green, so G has the largest weight. A plain average `(R+G+B)/3` ignores this sensitivity.
* **Why it matters:** Haar works only on grayscale images (brightness differences). YOLO uses RGB.
* **Code:** `python/fd/enhance.py → to_gray_manual`, `lib/imgproc.ts → toGray`.

### 2.3 Geometric transformations and interpolation (Lab 3)
* Rotation/scaling/translation form a single 2×3 **affine matrix**: `x' = s·cosθ·x − s·sinθ·y + tx`, `y' = s·sinθ·x + s·cosθ·y + ty`.
* **Backward mapping:** for each output pixel the source position is found with `M⁻¹` → no holes. Forward mapping leaves gaps in the output.
* **Interpolation:** nearest neighbour (fast, blocky) vs. bilinear (weighted average of 4 neighbours: `(1−a)(1−b)f00 + a(1−b)f10 + (1−a)b f01 + ab f11`).
* Rotating and rotating back lowers the PSNR → interpolation loses information (shown live in the Lab).
* **Link to the project:** YOLO's *letterbox* step is a scaling + translation transform (bilinear resize). Haar was trained on frontal faces, so it fails on heads tilted more than ~15°.
* **Code:** `lib/imgproc.ts → affine, rotationMatrix, resize`.

### 2.4 Brightness / contrast (enhancement 1 — hand-written)
* `g = clip(α·f + β, 0, 255)`, **α = 1.3, β = +20** (fixed for all images).
* α > 1 **stretches** the histogram (contrast), β **shifts** it (brightness). Pixels saturated at 0/255 are an irreversible loss of information.
* It is a point operation → applied with a 256-entry LUT.
* **Observation:** in low light it is not enough (it does not brighten the faces sufficiently and amplifies noise by α; VJ only 4 → 7/24); in backlight it saturates the bright background (VJ 8 → 7).

### 2.5 Histogram equalization (enhancement 2 — written without a library function)
This is the “implement at least one algorithm yourselves” item of the assignment. **Every group member must be able to write it on the board.**

```text
1) h(k)  = k gri seviyesindeki piksel sayısı          (k = 0..255)
2) CDF(k) = h(0) + h(1) + ... + h(k)
3) s_k   = round( (CDF(k) − CDF_min) / (N − CDF_min) · 255 )   → LUT
4) g(x,y) = LUT[ f(x,y) ]
```

(Step 1 reads: h(k) = number of pixels with gray level k, k = 0..255.)

Python (`python/fd/enhance.py`):

```python
h = np.zeros(256, np.int64); np.add.at(h, channel.ravel(), 1)   # histogram (np.histogram yok)
cdf = np.cumsum(h)
cdf_min = cdf[cdf > 0][0]
lut = np.rint((cdf - cdf_min) / (N - cdf_min) * 255).astype(np.uint8)
out = lut[channel]
```

(The comment `np.histogram yok` means “no np.histogram” — the histogram is built by hand.)

* **On colour images:** RGB → YCrCb, only **Y** is equalized and Cr/Cb are kept → the hue is not distorted and YOLO still receives a colour input.
* **Verification:** the hand-written function is **pixel-for-pixel identical** to `cv2.equalizeHist` (maximum difference 0). The TypeScript version gives the same mapping; when the whole experiment is rerun in the browser, F1 matches Python in 6 of 8 configurations and differs by one face in the other two (the browser decodes JPEGs slightly differently from OpenCV).
* **Why subtract CDF_min?** So that the darkest existing level maps to 0 and the full range is used (Gonzalez & Woods definition; OpenCV does the same).
* **Entropy:** equalization can merge levels but cannot create new ones → entropy does not increase. It “looks richer” but adds no new information.

### 2.6 CLAHE (enhancement 3)
* Global HE applies **one** LUT to the whole image; if a bright background dominates the histogram, the face is not brightened.
* **CLAHE:** split the image into 8×8 tiles → **clip** each tile's histogram at `clipLimit · N_blok / 256` (this limits the contrast gain, and therefore the noise amplification) → redistribute the excess counts evenly → one LUT per tile → compute each pixel value as the **bilinear** weighted average of the LUTs of the 4 nearest tiles (no visible tile borders).
* Settings: **clipLimit = 2.0, tileGridSize = 8×8**, on the Y channel.
* In the experiment we used OpenCV `createCLAHE` (so that Python and the web give the same result); the website also contains a hand-written CLAHE for teaching purposes (`lib/imgproc.ts → claheGray`).
* **Result:** in backlight, global HE hurt both detectors (VJ 8 → 6, YOLO 21 → 19 TP) while local CLAHE helped both (VJ 9, YOLO 22). YOLO's best overall F1 is with CLAHE (0.950).

### 2.7 Convolution and filters (Lab 7)
* Convolution: `g = Σ h(i,j)·f(x−i, y−j)`; correlation: `f(x+i, y+j)`. Convolution = correlation with the kernel rotated by 180°. For a symmetric kernel they are the same. (CNN libraries actually compute correlation but call it “convolution”.)
* Mean (blurs), Gaussian (σ, more natural), median (non-linear, best for salt-and-pepper noise, preserves edges), sharpening.
* **Link to the project:** noise increases in low light, and HE/CLAHE amplify it as well. YOLO itself is a stack of convolution layers.

### 2.8 Edge detection (Lab 8)
* Sobel `Gx = [−1 0 1; −2 0 2; −1 0 1]`, `|G| = √(Gx² + Gy²)`; Prewitt gives no extra weight to the centre. Otsu: the threshold that maximizes the between-class variance.
* **Link to the project:** Haar features are coarse, scalable edge/line detectors; YOLO's first layers learn Sobel-like filters.

### 2.9 Viola-Jones (classic detector)
Four ideas:
1. **Haar features:** the difference between the pixel sums of black and white rectangles (edge, line, four-rectangle). The eye band is darker than the cheeks, the eyes are darker than the bridge of the nose. About 160,000 possible features in a 24×24 window.
2. **Integral image:** `ii(x,y) = Σ_{x'≤x, y'≤y} i(x',y')`. The sum of any rectangle takes **4 lookups**: `D − B − C + A` → feature computation is O(1), independent of size.
3. **AdaBoost:** from weak classifiers, each a single feature + threshold, it selects and weights the most discriminative ones.
4. **Cascade:** 25 stages; the first stages reject most of the background immediately with only a few features → real-time speed.

Scanning: the window slides, and at each step the image is shrunk by `scaleFactor = 1.1` (a pyramid). Many overlapping candidates are produced for the same face; `minNeighbors = 5` keeps the groups with at least 5 neighbours. `minSize = 24×24`.
**Lab 9** shows, with `minNeighbors = 0`, all raw candidate windows (orange) and the final detections after grouping (green) — very effective in the presentation.

* **Model:** `haarcascade_frontalface_default.xml` (OpenCV, Lienhart). No training was needed (the assignment allows this).
* **Why does it fail in low light?** The features are brightness *differences*; in the dark these differences approach zero and cannot pass the stage thresholds → FN (raw: 4/24). HE/CLAHE enlarge the differences → recall goes up (HE 14/24, CLAHE 12/24).
* **Why does enhancement hurt under normal light?** The contrast is already sufficient; the amplified texture and noise create face-like difference patterns and distort the faces' own pattern → F1 0.667 → 0.636 (HE) → 0.585 (CLAHE; TP 15 → 12).
* **Sources of false positives:** leaves, patterned clothing, objects on the table. **Misses:** selfie/close-up faces and tilted or border-cut faces (the frontal cascade does not recognise them).
* **Code:** `python/fd/detectors.py → HaarDetector`, `lib/detectors.ts → detectHaar` (OpenCV.js).

### 2.10 YOLOv8n-face (deep learning detector)
* **Model:** `yolov8n-face-lindevs.onnx`, release 1.0.1, <https://github.com/lindevs/yolov8-face>. Ultralytics YOLOv8n architecture, trained on the **WIDER FACE** dataset for a **single class, “face”** (not the generic COCO “person” class — the assignment explicitly forbids that). ~3 M parameters, 12 MB.
* **Preprocessing:** letterbox (640×640 keeping the aspect ratio, padding value 114), /255, HWC → CHW, tensor `[1, 3, 640, 640]`.
* **Network:** CSPDarknet backbone + PAN neck + anchor-free decoupled head. 3 scales: strides 8/16/32 → 80×80 + 40×40 + 20×20 = **8400 candidates**, each `(cx, cy, w, h, score)` → output `[1, 5, 8400]`.
* **Post-processing:** score ≥ **0.35** → **NMS** (remove lower-scoring boxes with IoU ≥ **0.45**) → inverse letterbox: `x = (x' − pad_x) / r`.
* **Why is it only slightly sensitive to preprocessing?** WIDER FACE contains a wide variety of lighting/scale/pose, and HSV/brightness data augmentation is used during training; the network has already learned features that are largely invariant to illumination. In the experiment preprocessing changed YOLO by only a few faces (F1 0.926–0.950); in backlight global HE cost 2 faces and CLAHE gained 1.
* **Code:** `python/fd/detectors.py → YoloFaceDetector` (onnxruntime), `lib/detectors.ts → detectYolo` (onnxruntime-web). NMS and letterbox were written by hand.

### 2.11 Evaluation
* `IoU = |A ∩ B| / |A ∪ B|`, threshold **0.50**.
* **One-to-one (greedy) matching:** the IoU of every pair is computed, pairs with IoU ≥ 0.5 are sorted from largest to smallest, and a pair is matched if both boxes are still free. Two boxes on the same face → 1 TP + 1 FP.
* `P = TP/(TP+FP)`, `R = TP/(TP+FN)`, `F1 = 2PR/(P+R)`; **micro-average** (TP/FP/FN are summed over the whole dataset, then the metrics are computed).
* **Counting error:** `|predicted − true|`, **MAE** = mean over the images. The count can be right while the boxes are in the wrong place → that is why we report F1 + MAE together.
* **Timing:** `inference_ms` = model call only (`detectMultiScale` / `session.run`); `end_to_end_ms` = preprocessing + gray/letterbox + model + NMS. One warm-up run before each measurement; CPU.
* **Code:** `python/fd/metrics.py`, `lib/metrics.ts`.

### 2.12 Architecture and deployment
* **Python pipeline** (experiment, tables, figures, Word report) + **Next.js web application** (live demo).
* On the web, detection runs **in the browser with WebAssembly**: OpenCV.js (Haar + CLAHE) and ONNX Runtime Web (YOLO). Same model files.
* **Why?** (1) Vercel serverless functions hit size/cold-start limits with OpenCV + the models; running in the browser keeps the site static. (2) Privacy: face images never leave the device. (3) The Docker image is a single small Node service.
* **Docker:** multi-stage (deps → builder → runner), `output: "standalone"`, non-root user, healthcheck. `docker compose up --build`. An optional `experiments` service runs the Python experiment in a container.
* **Vercel:** import the repository → Next.js detected automatically → `npm run build` (prebuild copies the models into `public/`).

---

## 3. Likely questions from the instructor and ready answers

### General / method
**Q1. What is the goal of the project, and what is your answer to the research question?**
To measure quantitatively how lighting and enhancement affect detection performance. Answer: No, an image that looks visually better does not always give better detection. The effect depends on three things: (1) **the detector** — VJ with hand-designed features is strongly affected, YOLO with learned features changes by only a few faces; (2) **the starting condition** — it helps dark images (VJ low light 4 → 14/24 with HE) and hurts good ones (VJ normal F1 0.667 → 0.585 with CLAHE); (3) **global vs local** — in backlight, global HE, the method that visibly opens up the image most, makes both detectors worse (VJ 8 → 6, YOLO 21 → 19), while local CLAHE helps both (VJ 9, YOLO 22). Recommendation: use enhancement selectively — only when the image is dark, and CLAHE rather than global HE.

**Q2. Why two different detectors?**
It is a requirement of the assignment; it also lets us compare two different paradigms: hand-crafted features + boosting (VJ) versus CNN features learned from data (YOLO). The effect of preprocessing turns out to be very different for the two — this is the main finding of the study.

**Q3. Why didn't you use YOLO's “person” class?**
The assignment explicitly forbids it, and it is also logically wrong: a person box covers the whole body, so it cannot reach IoU ≥ 0.5 with a face box; it would also count people facing away from the camera. We used YOLOv8n-face, trained on WIDER FACE for the single class “face”.

**Q4. Did you train the models yourselves?**
No, the assignment allows pre-trained models. Haar: OpenCV's ready-made cascade. YOLO: lindevs/yolov8-face release 1.0.1 (WIDER FACE). Versions and sources are listed in the README.

**Q5. Which algorithm did you implement yourselves?**
Histogram equalization (histogram, CDF, LUT) — no library function, difference from `cv2.equalizeHist` is 0. In addition: brightness/contrast, grayscale conversion, YCrCb conversion, IoU, matching, NMS, letterbox; on the web, CLAHE, affine transform, interpolation, convolution, median, Sobel, Otsu and the integral image are all hand-written (`lib/imgproc.ts`).

**Q6. Can you write histogram equalization on the board?** → The 4 steps and the code in §2.5. Example: 4 pixels `[50, 50, 100, 200]` → h(50)=2, h(100)=1, h(200)=1; CDF: 50→2, 100→3, 200→4; CDF_min=2, N=4 → s(50)=0, s(100)=round(1/2·255)=128, s(200)=255.

**Q7. What is the difference between HE and CLAHE?**
HE uses a single global LUT; CLAHE splits the image into tiles, applies a separate LUT built from a clipped histogram to each tile, and blends the tiles bilinearly. Clipping prevents excessive noise amplification in flat regions. In backlight the bright background dominates the global histogram, so CLAHE brightens the face better — and in the experiment HE made both detectors worse in backlight while CLAHE improved them (VJ 9, YOLO 22/24).

**Q8. What happens if we increase clipLimit?**
Less clipping → the behaviour approaches global HE, contrast and noise increase. A very small clipLimit → almost no change. More tiles → more local, but fewer pixels per tile, so the histogram becomes unreliable. (Can be shown with the slider on the Live Detection / Lecture Lab pages.)

**Q9. How did you apply HE to colour images? What if you had applied it to each channel separately?**
We converted to YCrCb and equalized only Y. Applying it to R, G and B separately breaks the channel ratios → colour shift (skin tone changes) and a distribution shift for YOLO.

**Q10. How did you choose α and β for brightness/contrast? Why not adapt them per image?**
We chose a single reasonable value for the whole dataset (α = 1.3, β = 20) and kept it fixed; the assignment forbids changing thresholds/settings per image, otherwise the comparison would not be fair (fitting to the test data = data leakage).

### Viola-Jones
**Q11. How does Viola-Jones work?** → §2.9: Haar features, integral image, AdaBoost, cascade, multi-scale scanning, minNeighbors grouping.

**Q12. Why is the integral image needed?**
Each window needs thousands of rectangle sums; summing directly would cost time proportional to the window size. With the integral image every rectangle takes 4 lookups → constant time, independent of scale. This also makes it cheap to scale up the features instead of shrinking the image.

**Q13. What do scaleFactor and minNeighbors do? What if we change them?**
scaleFactor is the pyramid step: small (1.05) → more scales, slower, more candidates (recall↑, FP↑); large (1.3) → faster, but some face sizes are skipped. minNeighbors: small → more FP, large → more FN. We can show this instantly on the Live Detection page in the “Detector parameters” panel.

**Q14. Why does Viola-Jones use grayscale images?**
Its features are brightness differences; it was trained without colour information. Grayscale conversion reduces the dimension from 3 to 1 and is less sensitive to the colour of the illumination.

**Q15. Why does Viola-Jones fail on profile/tilted faces?**
The `frontalface` cascade was trained on frontal faces; its features are axis-aligned rectangles and are not rotation-invariant. Profile faces need a separate cascade (`haarcascade_profileface.xml`).

### YOLO
**Q16. How does YOLO work?** → §2.10: letterbox, CNN, 8400 candidates at 3 scales, score threshold, NMS, inverse transform.

**Q17. What is NMS and why is it needed?**
Neighbouring cells produce many high-scoring boxes for the same face. NMS: keep the highest-scoring box, remove those with IoU ≥ 0.45 against it, repeat. Without it a face would be counted several times → FP and counting error. Lab 10 shows the boxes before and after NMS.

**Q18. Why letterbox? What if we simply stretched the image to 640×640?**
Stretching distorts the aspect ratio, faces become squashed/elongated and drift away from the training distribution. Letterbox preserves the ratio and is identical to the preprocessing used in training. When mapping the boxes back, `(x − pad)/r` is applied.

**Q19. You chose a confidence threshold of 0.35 — what if we change it?**
Lowering it (0.1) → recall↑, FP↑; raising it (0.7) → precision↑, but FN↑ for small/dark faces. We kept it fixed; during the defense it can be changed and its effect shown live.

**Q20. Why is YOLO only slightly affected by preprocessing?**
WIDER FACE contains very diverse lighting, and brightness/HSV augmentation is used in training; the network learns largely illumination-invariant features. Enhancement adds no new information, it only redistributes what is already there — something the network can already do internally. That is why F1 only moved between 0.926 and 0.950. Excessive amplification can even hurt, by pushing the input away from the training distribution: in backlight, global HE dropped it from 21 to 19 faces, while CLAHE raised it to 22.

**Q21. Which one is faster? Why is YOLO preferred?**
On these 1280-px images, on CPU, YOLO inference (≈51 ms) is **faster** than Viola-Jones (≈92 ms): VJ scans the whole image over a multi-scale pyramid, while YOLO shrinks the image to 640×640 and runs a single pass. Preprocessing increases the end-to-end time for both (VJ + HE 245 ms, YOLO + CLAHE 113 ms). YOLO is also far more accurate and robust (F1 0.93 vs 0.50), and even faster on a GPU.

### Evaluation
**Q22. Why an IoU threshold of 0.50?** It is the threshold given in the assignment and the PASCAL VOC standard. It tolerates a few pixels of uncertainty at the annotation borders.

**Q23. How was the one-to-one matching done?** → §2.11. Two predictions cannot be matched to the same GT.

**Q24. What is the difference between precision and recall? Which one matters more in this project?**
Precision: how many of the faces I found are correct. Recall: how many of the real faces I found. For counting people both matter; F1 measures their balance, MAE measures counting accuracy.

**Q25. Can F1 be low while MAE is low?**
Yes: if the detector draws 3 boxes on an image with 3 faces but two of them are in the wrong place, the counting error is 0 but F1 is low. That is why we report both together.

**Q26. How did you measure time?**
`time.perf_counter()` (Python) / `performance.now()` (browser). Inference = model call only; end-to-end = preprocessing + model + post-processing. After a warm-up run, on CPU. The report states clearly which time was measured.

### Results and failures
**Q27. Where does VJ fail the most, and why?**
Raw low-light images: only 4 of 24 faces were found (F1 0.258). The mean brightness is very low, so the Haar differences fall below the cascade thresholds. Also in backlight (8/24; darkened faces, bright background). In every condition it also misses selfie/close-up, tilted and border-cut faces; its false positives come from leaves, patterned clothing and objects on the table.

**Q28. Why did enhancement make detection worse in some cases?**
Under normal light there is already enough contrast; HE/CLAHE amplified background texture and noise, created face-like difference patterns and distorted the faces' own pattern → VJ F1 0.667 → 0.636 (HE) → 0.585 (CLAHE; TP 15 → 12). In backlight, global HE builds its single LUT around the bright background; the dark faces get squeezed into a few levels and noise is amplified → although it is the method that visibly opens up the image most, it made both detectors worse (VJ 8 → 6 TP with 4 FP; YOLO 21 → 19).

**Q29. Why didn't YOLO get perfect scores?**
It found 64 of 72 faces (1 FP, F1 0.934; with CLAHE 66, F1 0.950). The misses are small and blurry background faces, border-cut faces and hard faces in the darkened derived conditions. The ground truth deliberately includes background people and partly visible faces — so the task is not easy, and F1 = 1.00 is not a realistic expectation on real photos.

**Q29b. Why are the low-light and backlight images derived rather than real shots?**
For a controlled comparison: the same faces, the same poses, the same ground-truth boxes; **only the lighting changes**. With separate shots people move, pose/expression/framing change, and we could not tell whether a difference comes from the light or from something else. The derivation is reproducible with `python/make_dataset.py`, seed 42 (low light: gamma 2.0 + gain 0.22 + σ = 5 noise; backlight: the person mask is darkened with γ = 1.8 and gain 0.30, the background is over-exposed + glare). Limitation: real low light also brings motion blur, colour noise and the camera's auto-exposure/noise reduction; these were not modelled.

**Q29c. How were the ground-truth boxes made? Is there a bias toward YOLO?**
YOLOv8n-face at a low threshold (0.10) and Viola-Jones proposed candidates; every candidate was checked visually one by one and only genuinely visible faces were kept (people facing away removed; border-cut or hand-covered faces kept). Honest answer: yes, there may be a small bias — the boxes follow YOLO's box style (borders/aspect ratio), so IoU may be slightly in YOLO's favour. But thanks to the low threshold and the VJ candidates, faces that YOLO misses at its normal threshold are also in the ground truth, so YOLO's recall is not inflated; the IoU ≥ 0.5 threshold also tolerates a few pixels of style difference. The gap between VJ and YOLO (F1 0.50 vs 0.93) is far too large to be explained by this bias.

**Q30. What would you do to improve the results?**
Condition-aware preprocessing (apply CLAHE only if the mean brightness is below a threshold); noise reduction before CLAHE (bilateral/Gaussian); add a profile cascade for VJ; a larger YOLO model (s/m) or test-time augmentation; combining several detectors.

### Application, deployment, ethics
**Q31. Where does detection run in the web application?**
In the browser, with WebAssembly. OpenCV.js for Haar + CLAHE, ONNX Runtime Web for YOLO. No image is sent to a server. Same model files as in Python; the F1 of the experiment rerun in the browser matches Python in 6 of 8 configurations and differs by one face in the other two (JPEG decoding differences).

**Q32. Why didn't you write a Python server?**
Vercel's serverless Python functions hit size and cold-start limits with OpenCV + ONNX + model weights; also, sending face images to a server is a privacy risk. Running in the browser keeps the site static and fast even on the free tier, and the Docker image is a single small service.

**Q33. How is the Docker image built?**
Multi-stage: (1) `npm ci`, (2) `npm run build` (prebuild copies the models and WASM into `public/`, Next produces a standalone output), (3) a small `node:22-alpine` image that takes only `.next/standalone`, `.next/static` and `public`, non-root user, `node server.js`, healthcheck. `docker compose up --build`.

**Q34. How is it deployed to Vercel?**
Repository to GitHub → vercel.com/new → import → Next.js is detected automatically → `npm run build` → deploy. No environment variables. The camera requires HTTPS (Vercel's default).

**Q35. What did you pay attention to ethically?**
Photos with consent, no minors, no face recognition/identity labelling (detection and counting only), identifiable images are not published in the public version, and images never leave the browser.

**Q36. Did you use AI?**
Yes, we made substantial use of an AI coding assistant (Claude) for code and documentation, and declared this in the README/report. We can show that we understand every algorithm through the Lecture Lab page and this guide; we are responsible for the correctness of the results. (**Be honest**: say which parts you checked or changed yourselves.)

### Things the instructor may ask to see live
| Request | How to show it |
|---|---|
| “Try it on an image I haven't seen” | Live Detection (`/tespit`) → upload a file or use the camera → Detect |
| “Set minNeighbors to 3” / “set conf to 0.6” | Live Detection (`/tespit`) → Detector parameters → enter the value → Detect (the comparison was done with fixed settings; this is only a demonstration) |
| “Change the CLAHE clipLimit” | Live Detection (`/tespit`) → turn on CLAHE → clip slider; the histogram changes in the step-by-step preprocessing panel |
| “Show the histogram equalization code” | `python/fd/enhance.py → equalize_channel_manual` and Lecture Lab (`/laboratuvar#histogram`) |
| “Rotate an image by 30° and try it” | Lecture Lab (`/laboratuvar#geometri`) (concept) → save the rotated image and upload it to Live Detection (`/tespit`) |
| “Re-run the experiment” | Experiments (`/deneyler`) → “Run with project dataset” (in the browser, ~1 min) or `python run_experiments.py` |

---

## 4. Individual contribution template (each member fills in their own part)

| Member | Responsible for | Will explain in the defense |
|---|---|---|
| Member 1 | Data collection, annotation, metrics | §2.1, §2.11, Q22–Q26 |
| Member 2 | Preprocessing (hand-written HE), CLAHE | §2.4–2.6, Q5–Q10 |
| Member 3 | Viola-Jones, YOLO integration | §2.9–2.10, Q11–Q21 |
| Member 4 | Web application, Docker/Vercel, report | §2.12, Q31–Q36 |

Everyone should also know the §1 summary and the answer to the research question.

---

## 5. Pre-submission checklist

1. Fill in names/student numbers/contributions in the `GROUP` list inside `make_report.py`, then `cd python && python make_report.py` → `docs/BM447_Yuz_Tespiti_Raporu.docx` is updated.
2. Name the folder `Proje1_No1_No2_No3`; zip it excluding `node_modules`, `.next`, `.venv`; **one person uploads it, once**.
3. Deadline: **24.11.2026 08:00** (akademik.duzce.edu.tr).

---

## 6. Useful English phrasing for the talk

**Opening**
* “Good morning. Our project asks a simple question: does making an image look better also make face detection better?”
* “We compared two detectors — the classic Viola-Jones cascade and a deep-learning model, YOLOv8n-face — under normal, low and back lighting.”

**Transitions**
* “Now that we've seen the pipeline, let me show you how it behaves on a real example.”
* “Let's move from the live demo to the overall numbers on the Experiments page.”
* “Next, I'd like to show the one algorithm we implemented entirely by hand: histogram equalization.”

**Explaining the research-question answer**
* “Our answer to the research question is: not always. A visually better image does not guarantee better detection.”
* “Enhancement rescues Viola-Jones in the dark — in low light it goes from 4 of 24 faces on raw images to 14 with histogram equalization — but it makes it worse in good lighting.”
* “In backlight, global histogram equalization — the version that looks best to the eye — actually hurts both detectors, while local CLAHE helps both.”
* “YOLO is far better overall, F1 0.93 versus 0.50, and changes by only a few faces, because it was trained on very diverse lighting and has already learned largely illumination-invariant features.”

**Handling a question you're unsure about**
* “That's a good question. I'm not completely sure, but my understanding is that…”
* “I don't want to guess on that — may I check it in the code? It's in `python/fd/detectors.py`.”
* “That part was mainly handled by my teammate; could they add to my answer?”
* “We didn't test that case directly, but we could show it live by changing the parameter on the Live Detection page.”

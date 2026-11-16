"""English Word report (docs/BM447_Face_Detection_Report_EN.docx), generated from results/.

Same structure and numbers as the Turkish report (make_report.py). Rerun after the experiment
is repeated with the group photos. Edit GROUP below for the cover page.
"""
from __future__ import annotations

import json
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt, RGBColor

from make_report import ACCENT, RES, ROOT, bullet, caption, figure, table

FIG = RES / "figures_en"  # English figures (python make_figures_en.py)

OUT = ROOT / "docs" / "BM447_Face_Detection_Report_EN.docx"

# ---- Cover page: fill in before submission ----
GROUP = [("Name Surname 1", "Student No 1", "Contribution: ..."), ("Name Surname 2", "Student No 2", "Contribution: ...")]

ENH = {"original": "Raw", "brightness_contrast": "Brightness/Contrast", "hist_eq": "Histogram Equalization", "clahe": "CLAHE"}
DET = {"viola_jones": "Viola-Jones", "yolo": "YOLOv8n-face"}
COND = {"normal": "Normal light", "low_light": "Low light", "backlight": "Backlight"}
TIMING_EN = ("inference_ms: detector call only; end_to_end_ms: preprocessing + inference + post-processing. "
             "CPU, measured after one warm-up run.")


def main() -> None:
    import make_figures_en
    make_figures_en.main()  # always regenerate the English figures first
    res = json.loads((RES / "results.json").read_text(encoding="utf-8"))
    ann = json.loads((ROOT / "dataset" / "annotations.json").read_text(encoding="utf-8"))
    S = {(r["detector"], r["enhancement"]): r for r in res["summary"]}
    SC = {(r["detector"], r["enhancement"], r["condition"]): r for r in res["summary_by_condition"]}
    n_img = len(ann["images"])
    n_face = sum(i["count"] for i in ann["images"])
    conds = list(ann["conditions"])
    cond = lambda c: COND.get(c, c)
    synthetic = "sentetik" in ann.get("name", "").lower() or "demo" in ann.get("name", "").lower()

    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(11)
    for s in ("Heading 1", "Heading 2", "Heading 3"):
        doc.styles[s].font.color.rgb = ACCENT
    sec = doc.sections[0]
    sec.left_margin = sec.right_margin = Cm(2.2)
    sec.top_margin = sec.bottom_margin = Cm(2)

    # ---------------- Cover ----------------
    for t, size, bold in [("DÜZCE UNIVERSITY", 14, True), ("Faculty of Engineering · Department of Computer Engineering", 11, False),
                          ("BM447 Digital Image Processing", 12, True), ("", 11, False),
                          ("Face Detection and People Counting under Challenging Imaging Conditions:", 18, True),
                          ("Comparison of a Classical Method (Viola-Jones) and YOLO", 16, True), ("", 11, False),
                          ("Project Report", 13, False), ("Instructor: Prof. Dr. Pakize Erdoğmuş", 11, False), ("", 11, False)]:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(t)
        r.font.size = Pt(size)
        r.bold = bold
        if size >= 16:
            r.font.color.rgb = ACCENT
    table(doc, ["Name", "Student No", "Individual contribution"], GROUP, widths=[5, 4, 7], font=10)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run(f"\nExperiment date: {res['generated']}").font.size = Pt(9)
    doc.add_page_break()

    # ---------------- Abstract ----------------
    vj0, vjc, yo0 = S[("viola_jones", "original")], S[("viola_jones", "clahe")], S[("yolo", "original")]
    doc.add_heading("Abstract", level=1)
    doc.add_paragraph(
        f"This study examines how lighting conditions and image enhancement affect face-detection accuracy. On {n_img} images "
        f"containing {n_face} ground-truth faces, the classical Viola-Jones (Haar cascade) detector and a YOLOv8n-face model trained "
        f"for faces on the WIDER FACE dataset are compared on raw, brightness/contrast-adjusted, histogram-equalized and CLAHE-processed "
        f"images with fixed settings. Predictions are matched one-to-one to ground-truth boxes at IoU ≥ 0.50, and TP, FP, FN, precision, "
        f"recall, F1, absolute counting error, MAE and processing times are reported. On raw images Viola-Jones reaches F1 = {vj0['f1']:.3f} "
        f"(recall {vj0['recall']:.2f}); with CLAHE it reaches F1 = {vjc['f1']:.3f} (recall {vjc['recall']:.2f}). However, histogram "
        f"equalization and CLAHE produce false positives on normally lit images. YOLOv8n-face achieves F1 = {yo0['f1']:.3f} on raw images and "
        f"stays highly accurate regardless of preprocessing. Hence an image that looks visually better does not always yield higher detection "
        f"accuracy; the direction of the effect depends on the detector type and on the initial condition of the image. The system is also "
        f"delivered as a Next.js web application that runs in the browser and can be deployed to Vercel, Docker and GitHub Pages.")
    if synthetic:
        p = doc.add_paragraph()
        r = p.add_run("IMPORTANT: the numbers in this report belong to a SYNTHETIC DEMO dataset generated from a public-domain portrait to "
                      "validate the pipeline. Before submission, the consented photos of the group members must be annotated and the "
                      "experiment and this report regenerated (python run_experiments.py → python make_report_en.py).")
        r.bold = True
        r.font.color.rgb = RGBColor(0xC9, 0x3A, 0x12)

    # ---------------- 1 ----------------
    doc.add_heading("1. Objective and research question", level=1)
    doc.add_paragraph("The goal is to quantify how illumination and image-processing transformations affect face-detection accuracy, to compare "
                      "the detection and counting errors of a classical face detector and a pretrained YOLO face model on the same images, and to "
                      "explain failures with quantitative evidence.")
    doc.add_paragraph("Guiding research question: “Does an image that looks visually better always produce higher face-detection accuracy?”")

    # ---------------- 2 ----------------
    doc.add_heading("2. Dataset and annotation", level=1)
    rows = []
    for c in conds:
        items = [i for i in ann["images"] if i["condition"] == c]
        rows.append([cond(c), len(items), sum(i["count"] for i in items), f"{min(i['count'] for i in items)}–{max(i['count'] for i in items)}"])
    rows.append(["Total", n_img, n_face, ""])
    table(doc, ["Condition", "Images", "Faces (GT)", "Faces per image"], rows, widths=[5, 3, 3, 4], font=10)
    caption(doc, "Table 1. Distribution of the dataset across conditions.")
    doc.add_paragraph(
        "Every visible face is annotated with an axis-aligned bounding box [x, y, w, h] from the forehead/hairline to the chin and between the "
        "cheeks, and the true number of people in each image is recorded. Labels are stored in dataset/annotations.json. Annotation is done "
        "with the Annotation tool of the project's web application (/etiketleme), which shows counters for the requirement of at least 5 "
        "images per condition and at least 15 in total.")
    if synthetic:
        doc.add_paragraph(
            "The demo set was generated as follows (python/make_demo_dataset.py, seed 42): for normal light, the original portrait, a "
            "horizontally flipped copy and 2–4 person collages; for low light, the transform s = 255·0.13·(r/255)^2.2 plus Gaussian sensor noise "
            "with σ = 5; for backlight, a darkened subject (gain 0.17, γ = 2.0) in front of an almost saturated white background. Because the "
            "collages paste the portrait crop at known scales, the ground-truth boxes are geometrically exact.")
    figure(doc, FIG / "examples_normal_03.png", 16, "Figure 1. Normal-light example: two detectors × four preprocessing variants (white: ground truth, colored: prediction).")

    # ---------------- 3 ----------------
    doc.add_heading("3. Method", level=1)
    figure(doc, ROOT / "docs" / "flowchart_en.png", 16.5, "Figure 2. Processing flowchart.")
    doc.add_heading("3.1 Image enhancement", level=2)
    bullet(doc, " g(x,y) = clip(α·f(x,y) + β, 0, 255) with α = 1.3 and β = +20. A point operation applied through a 256-entry lookup table. Implemented by hand.", "Brightness/contrast:")
    bullet(doc, " implemented without any ready-made function (python/fd/enhance.py → equalize_channel_manual). The histogram h(k) is counted, the "
           "cumulative distribution CDF(k) is computed and the mapping s_k = round((CDF(k) − CDF_min)/(N − CDF_min)·255) is applied. In color "
           "images the operation is applied only to the Y (luma) channel of YCrCb; Cr/Cb are preserved. Verification: the output of the "
           "hand-written function is pixel-identical to cv2.equalizeHist (maximum difference 0).", "Histogram equalization (by hand):")
    bullet(doc, " cv2.createCLAHE(clipLimit = 2.0, tileGridSize = 8×8), Y channel only. The image is split into tiles, each tile histogram is "
           "clipped and equalized, and tile borders are blended with bilinear interpolation. The web application also contains a hand-written "
           "CLAHE implementation for teaching purposes.", "CLAHE:")
    doc.add_heading("3.2 Classical detector: Viola-Jones", level=2)
    doc.add_paragraph(
        "OpenCV's haarcascade_frontalface_default.xml model is used. The image is converted to grayscale with the weights 0.2989R + 0.5870G + "
        "0.1140B. Thanks to the integral image, every Haar feature (edge, line and four-rectangle differences) is evaluated with four memory "
        "lookups; weak classifiers selected by AdaBoost form a 25-stage cascade. The window slides over an image pyramid (scaleFactor = 1.1, "
        "minSize = 24×24) and candidates with at least minNeighbors = 5 neighbours are merged.")
    doc.add_heading("3.3 Deep-learning detector: YOLOv8n-face", level=2)
    d = res["detectors"]["yolo"]
    doc.add_paragraph(
        f"Model: {d['model']} ({d['kaynak'].replace('WIDER FACE', 'WIDER FACE')}). This is not the generic “person” class but a model trained for the "
        "single class “face” on WIDER FACE. The image is placed on a 640×640 canvas keeping its aspect ratio (letterbox, padding 114), "
        "normalized to 0–1 and converted to a CHW tensor. The network produces 8400 candidates (cx, cy, w, h, score) on 80×80, 40×40 and 20×20 "
        "grids; candidates with a score below 0.35 are discarded, greedy NMS with an IoU threshold of 0.45 is applied to the rest, and the "
        f"boxes are mapped back to original coordinates with the inverse letterbox transform. Runtime: {d['runtime']}.")
    doc.add_heading("3.4 Evaluation", level=2)
    doc.add_paragraph(
        "For every image, the IoU of all (prediction, ground-truth) pairs is computed; pairs with IoU ≥ 0.50 are sorted from largest to "
        "smallest and matched if neither has been used yet (one-to-one). Matched pairs are TP, unmatched predictions FP and unmatched "
        "ground-truth boxes FN. Precision = TP/(TP+FP), Recall = TP/(TP+FN), F1 = 2PR/(P+R). The per-image absolute counting error "
        "|predicted − true| and the dataset-level MAE are computed. TP/FP/FN are summed over the dataset (micro-average) to obtain P/R/F1.")
    doc.add_paragraph(f"Timing: {TIMING_EN} Machine: {res['machine']}.")

    # ---------------- 4 ----------------
    doc.add_heading("4. Experimental settings", level=1)
    rows = [["Brightness/contrast", "α = 1.3 ; β = +20"], ["Histogram equalization", "by hand, Y channel"], ["CLAHE", "clipLimit 2.0 ; 8×8 ; Y channel"]]
    for k, v in res["detectors"].items():
        rows.append([DET[k], "; ".join(f"{('source' if a == 'kaynak' else a)}={str(b).replace('gri', 'grayscale')}" for a, b in v.items() if a != "label")])
    rows += [["Matching", "IoU ≥ 0.50, one-to-one"], ["Randomness", "demo data seed 42; detectors are deterministic"]]
    table(doc, ["Setting", "Value"], rows, widths=[4, 12.5], font=9)
    caption(doc, "Table 2. Settings kept fixed in all comparisons (no per-image threshold changes).")

    # ---------------- 5 ----------------
    doc.add_heading("5. Results", level=1)
    doc.add_heading("5.1 Baseline results (raw images)", level=2)
    rows = []
    for dk in DET:
        r = S[(dk, "original")]
        rows.append([DET[dk], r["gt"], r["pred"], r["tp"], r["fp"], r["fn"], f"{r['precision']:.3f}", f"{r['recall']:.3f}", f"{r['f1']:.3f}", f"{r['mae']:.2f}", f"{r['mean_inference_ms']:.1f}", f"{r['mean_end_to_end_ms']:.1f}"])
    table(doc, ["Detector", "GT", "Pred.", "TP", "FP", "FN", "P", "R", "F1", "MAE", "Inference ms", "End-to-end ms"], rows)
    caption(doc, "Table 3. Baseline results on raw images.")
    doc.add_heading("5.2 Controlled comparison (whole dataset)", level=2)
    rows = []
    for dk in DET:
        for ek in ENH:
            r = S[(dk, ek)]
            rows.append([DET[dk], ENH[ek], r["tp"], r["fp"], r["fn"], f"{r['precision']:.3f}", f"{r['recall']:.3f}", f"{r['f1']:.3f}", f"{r['mae']:.2f}", f"{r['mean_inference_ms']:.1f}", f"{r['mean_end_to_end_ms']:.1f}"])
    table(doc, ["Detector", "Preprocessing", "TP", "FP", "FN", "P", "R", "F1", "MAE", "Inference ms", "End-to-end ms"], rows)
    caption(doc, "Table 4. Two detectors × four preprocessing variants.")
    figure(doc, FIG / "bar_f1.png", 14, "Figure 3. F1 by preprocessing.")
    figure(doc, FIG / "bar_mae.png", 14, "Figure 4. Counting error (MAE) by preprocessing.")
    doc.add_heading("5.3 Results by condition", level=2)
    rows = []
    for c in conds:
        for dk in DET:
            rows.append([cond(c), DET[dk]] + [f"{SC[(dk, ek, c)]['f1']:.2f} ({SC[(dk, ek, c)]['tp']}/{SC[(dk, ek, c)]['fp']}/{SC[(dk, ek, c)]['fn']})" for ek in ENH])
    table(doc, ["Condition", "Detector"] + [ENH[e] for e in ENH], rows, font=8.5)
    caption(doc, "Table 5. F1 per condition × preprocessing; TP/FP/FN in parentheses.")
    figure(doc, FIG / "heatmap_f1.png", 16.5, "Figure 5. F1 heatmap, condition × preprocessing.")
    figure(doc, FIG / "examples_lowlight_05.png", 16.5, "Figure 6. Low-light example.")
    figure(doc, FIG / "examples_backlight_05.png", 16.5, "Figure 7. Backlight example.")
    doc.add_heading("5.4 Per-image results (raw and CLAHE)", level=2)
    rows = []
    for r in res["per_image"]:
        if r["enhancement"] in ("original", "clahe"):
            rows.append([r["image"].replace("images/", ""), DET[r["detector"]], ENH[r["enhancement"]], r["gt_count"], r["pred_count"], r["tp"], r["fp"], r["fn"], r["abs_count_error"], f"{r['inference_ms']:.1f}"])
    table(doc, ["Image", "Detector", "Preprocessing", "GT", "Pred.", "TP", "FP", "FN", "|error|", "ms"], rows, font=7.5)
    caption(doc, "Table 6. Per-image results (complete list: results/per_image.csv).")

    # ---------------- 6 ----------------
    doc.add_heading("6. Discussion: does a visually better image detect better?", level=1)
    Q = {}
    for q in res["quality"]:
        Q.setdefault((q["enhancement"], q["condition"]), []).append(q)
    rows = []
    for c in conds:
        for ek in ENH:
            xs = Q[(ek, c)]
            rows.append([cond(c), ENH[ek], f"{sum(x['mean'] for x in xs) / len(xs):.1f}", f"{sum(x['std'] for x in xs) / len(xs):.1f}",
                         f"{sum(x['entropy'] for x in xs) / len(xs):.2f}", f"{SC[('viola_jones', ek, c)]['f1']:.2f}", f"{SC[('yolo', ek, c)]['f1']:.2f}"])
    table(doc, ["Condition", "Preprocessing", "Mean brightness μ", "Contrast σ", "Entropy (bits)", "F1 VJ", "F1 YOLO"], rows, font=8.5)
    caption(doc, "Table 7. Image statistics vs. detection accuracy.")
    figure(doc, FIG / "entropy_vs_f1.png", 12, "Figure 8. Mean entropy vs. F1.")
    figure(doc, FIG / "histograms_lowlight.png", 16, "Figure 9. Effect of preprocessing on the histograms of a low-light image.")
    ll = lambda dk, ek: SC.get((dk, ek, "low_light"))
    nm = lambda dk, ek: SC.get((dk, ek, "normal"))
    txt = []
    if ll("viola_jones", "original"):
        txt.append(f"In low light, Viola-Jones finds {ll('viola_jones','original')['tp']}/{ll('viola_jones','original')['gt']} faces on raw images, "
                   f"{ll('viola_jones','hist_eq')['tp']} with histogram equalization and {ll('viola_jones','clahe')['tp']} with CLAHE. Haar features are "
                   "brightness differences between rectangular regions; as the image gets darker these differences approach zero and the early "
                   "stages of the cascade reject the windows. HE/CLAHE spread the gray levels and enlarge the differences again.")
        txt.append(f"Brightness/contrast adjustment (α = 1.3, β = 20) is insufficient in low light (TP = {ll('viola_jones','brightness_contrast')['tp']}): "
                   "the linear transform only shifts the dark histogram slightly with a fixed stretch factor, and it also amplifies noise by α.")
    if nm("viola_jones", "clahe"):
        txt.append(f"In normal light, by contrast, Viola-Jones has FP = {nm('viola_jones','original')['fp']} on raw images but FP = "
                   f"{nm('viola_jones','hist_eq')['fp']} with histogram equalization and FP = {nm('viola_jones','clahe')['fp']} with CLAHE. Enhancement "
                   "amplifies background texture (clothing, patterns, noise) and creates new face-like brightness patterns. In other words, the "
                   "visually more “vivid”, higher-contrast image lowered the precision of the classical detector.")
    txt.append(f"YOLOv8n-face stays within F1 ≈ {min(S[('yolo', e)]['f1'] for e in ENH):.2f}–{max(S[('yolo', e)]['f1'] for e in ENH):.2f} under all "
               "conditions and preprocessing variants. Because it was trained on a dataset with high variety in lighting, scale and pose (WIDER "
               "FACE) and with brightness/contrast augmentation, the information provided by enhancement is already represented in its learned "
               "features. Preprocessing only increased the processing time.")
    txt.append("Conclusion: an image that looks visually better does not always give higher detection accuracy. Histogram equalization gives "
               "the highest contrast (σ) to the human eye, yet the best balance for the classical detector is CLAHE, and the benefit of "
               "enhancement appears only on images that were initially poor (low light, backlight). On well-lit images the same operation is "
               "harmful. For the deep-learning detector preprocessing is practically irrelevant. Preprocessing should therefore be chosen per "
               "detector and condition and, where possible, applied only when needed (e.g. by detecting the condition with a mean-brightness "
               "threshold).")
    for t in txt:
        doc.add_paragraph(t)

    doc.add_heading("7. Failure analysis", level=1)
    for b, t in [
        ("Low light + Viola-Jones (FN): ", "When mean brightness is very low, Haar feature values fall below the cascade thresholds and all faces are missed."),
        ("Backlight + Viola-Jones (FN): ", "The bright background dominates the global histogram and squeezes the face region into a narrow dark range. Global HE expands the bright area but cannot brighten the face enough; locally operating CLAHE is more successful here."),
        ("HE/CLAHE + normal light (FP): ", "Amplified texture and noise create face-like windows. Increasing minNeighbors would reduce FP, but this was not done in the experiment because settings must stay fixed."),
        ("Small faces: ", "Haar's smallest window is 24×24 pixels, so smaller faces cannot be found in principle; YOLO can find faces down to ~10 pixels after letterboxing to 640."),
        ("Tilted/profile faces: ", "The frontalface cascade is trained only on frontal faces; its accuracy drops quickly for heads turned more than ~15°."),
    ]:
        bullet(doc, t, b)

    doc.add_heading("8. Limitations", level=1)
    lims = ["The dataset is small (15 images); the results show tendencies and cannot be generalized statistically.",
            "Timings were measured on a single CPU and depend on hardware. Browser timings are measured with WASM (single thread) and differ from Python.",
            "Preprocessing parameters (α, β, clipLimit) were chosen as fixed values; adaptive, image-dependent selection might perform better.",
            "Ground-truth box borders can vary by a few pixels between annotators; the IoU threshold of 0.50 tolerates this uncertainty."]
    if synthetic:
        lims.insert(0, "The reported numbers belong to the synthetic demo set: all faces belong to the same person and are frontal; on real group "
                       "photos both detectors will perform worse because of pose, expression, occlusion and real sensor noise.")
    for t in lims:
        bullet(doc, t)

    doc.add_heading("9. Software architecture and how to run", level=1)
    doc.add_paragraph(
        "Experiments are run with Python 3.12 (python/run_experiments.py). For the live demonstration a web application was developed with "
        "Next.js 16 (App Router, TypeScript). Detection runs in the browser with WebAssembly: OpenCV.js 4.10 for Viola-Jones and ONNX Runtime "
        "Web for YOLO, using the same model files. As a result the application runs statically on Vercel and GitHub Pages without server "
        "functions, face images never leave the user's device, and the Docker image is a single small Node.js service. The F1 values of the "
        "experiment rerun in the browser are identical to the Python results. Pages: Live Detection (camera/file, preprocessing chain, both "
        "detectors), Lecture Lab (formula and live before/after for each operation), Experiments, Annotation and Method; the interface has a "
        "Turkish/English language switch.")
    for t in ["npm install && npm run dev  → http://localhost:3000",
              "docker compose up --build  → http://localhost:3000",
              "Vercel: import the repository, framework Next.js, build command npm run build",
              "GitHub Pages: npm run build:pages (deployed automatically by .github/workflows/pages.yml) → https://iskburcin.github.io/bm447-face-detection/",
              "Experiments: python -m venv .venv ; pip install -r python/requirements.txt ; cd python ; python run_experiments.py ; python make_report_en.py"]:
        bullet(doc, t)

    doc.add_heading("10. Ethics and use of AI", level=1)
    doc.add_paragraph("Images were collected only with the informed consent of the group members; no minors are included. The system only performs "
                      "face detection and counting; no face recognition or identity labelling was done. Identifiable images were not published "
                      "publicly. A substantial part of the code and documentation was prepared with the help of an AI coding assistant "
                      "(Anthropic Claude); the pretrained models and libraries are listed in the References. The group members are responsible "
                      "for the correctness and explanation of the results.")

    doc.add_heading("References", level=1)
    for t in ["P. Viola, M. Jones, “Rapid Object Detection using a Boosted Cascade of Simple Features,” CVPR, 2001.",
              "R. Lienhart, J. Maydt, “An Extended Set of Haar-like Features for Rapid Object Detection,” ICIP, 2002.",
              "K. Zuiderveld, “Contrast Limited Adaptive Histogram Equalization,” Graphics Gems IV, 1994.",
              "R. C. Gonzalez, R. E. Woods, Digital Image Processing, 4th ed., Pearson.",
              "S. Yang, P. Luo, C. C. Loy, X. Tang, “WIDER FACE: A Face Detection Benchmark,” CVPR, 2016.",
              "G. Jocher et al., Ultralytics YOLOv8, https://github.com/ultralytics/ultralytics",
              "lindevs/yolov8-face (YOLOv8n-face, release 1.0.1), https://github.com/lindevs/yolov8-face",
              "OpenCV Haar cascades, https://github.com/opencv/opencv/tree/4.x/data/haarcascades",
              "ONNX Runtime Web, https://onnxruntime.ai ; OpenCV.js (@techstark/opencv-js)"]:
        bullet(doc, t)

    OUT.parent.mkdir(exist_ok=True)
    doc.save(str(OUT))
    print("->", OUT)


if __name__ == "__main__":
    main()

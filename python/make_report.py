"""IEEE konferans formatında Word raporu üretir (iki sütun, Times New Roman, siyah-beyaz).

    python make_report.py        -> docs/CE447_Yuz_Tespiti_Raporu.docx ve docs/CE447_Face_Detection_Report_EN.docx
    python make_report.py tr     -> yalnız Türkçe
    python make_report.py en     -> yalnız İngilizce

Tüm sayılar results/results.json ve dataset/annotations.json'dan okunur; şekiller make_figures_report.py ile
siyah-beyaz olarak yeniden çizilir. Yazarlar ve katkılar aşağıdaki GROUP listesindedir.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

import make_figures_report

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "results"
COURSE = "CE447 – Digital Image Processing"
INSTRUCTOR = "Prof. Dr. Pakize Erdoğmuş"
OUT = {"tr": ROOT / "docs" / "CE447_Yuz_Tespiti_Raporu.docx", "en": ROOT / "docs" / "CE447_Face_Detection_Report_EN.docx"}

# ---- Yazarlar ve bireysel katkılar ----
GROUP = [
    ("Burçin Işık", "251015404",
     {"tr": "Proje koordinasyonu; web uygulaması (Canlı Tespit, Ders Laboratuvarı, Deneyler, Etiketleme, TR/EN); dedektörlerin tarayıcıya "
            "taşınması (OpenCV.js, ONNX Runtime Web); Vercel, Docker ve GitHub Pages dağıtımı; raporların derlenmesi.",
      "en": "Project coordination; web application (Live Detection, Lecture Lab, Experiments, Annotation, TR/EN); porting the detectors to the "
            "browser (OpenCV.js, ONNX Runtime Web); deployment to Vercel, Docker and GitHub Pages; compiling the reports."}),
    ("Yağmur Yılmaz", "251015306",
     {"tr": "Grup fotoğraflarının toplanması ve onayların alınması; referans yüz kutularının etiketlenmesi ve kontrolü; düşük ışık ve ters ışık "
            "koşullarının türetilmesi; ön işleme algoritmaları (elle yazılan histogram eşitleme, parlaklık/kontrast, CLAHE) ve doğrulaması.",
      "en": "Collecting the group photos and the consents; annotating and checking the ground-truth face boxes; deriving the low-light and "
            "backlit conditions; preprocessing algorithms (hand-written histogram equalization, brightness/contrast, CLAHE) and their verification."}),
    ("Yiğitcan Yıldız", "221015055",
     {"tr": "Viola-Jones ve YOLOv8n-face dedektörlerinin Python hattına entegrasyonu ve parametrelerin sabitlenmesi; IoU ≥ 0,50 bire bir "
            "eşleştirme, TP/FP/FN, precision, recall, F1, MAE ve süre ölçümü; deneylerin çalıştırılması ve sonuçların analizi.",
      "en": "Integrating the Viola-Jones and YOLOv8n-face detectors into the Python pipeline and fixing their parameters; one-to-one matching at "
            "IoU ≥ 0.50, TP/FP/FN, precision, recall, F1, MAE and timing; running the experiments and analysing the results."}),
]

ENH_KEYS = ["original", "brightness_contrast", "hist_eq", "clahe"]
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
BLACK = RGBColor(0, 0, 0)
FONT = "Times New Roman"
COL_GAP_MM = 4.2


# =============================== yardımcılar ===============================
class Paper:
    def __init__(self, lang: str):
        self.lang = lang
        self.doc = Document()
        self.h1n = self.h2n = self.fign = self.tabn = 0
        self.col_w = 180.0
        self._setup()

    def L(self, tr, en):
        return tr if self.lang == "tr" else en

    def num(self, v, d=2):
        s = f"{v:.{d}f}"
        return s.replace(".", ",") if self.lang == "tr" else s

    def _setup(self):
        sec = self.doc.sections[0]
        sec.page_width, sec.page_height = Mm(210), Mm(297)
        sec.top_margin, sec.bottom_margin = Mm(19), Mm(25)
        sec.left_margin = sec.right_margin = Mm(15)
        st = self.doc.styles["Normal"]
        st.font.name = FONT
        st.font.size = Pt(10)
        st.font.color.rgb = BLACK
        rpr = st.element.get_or_add_rPr()
        rfonts = rpr.find(qn("w:rFonts"))
        if rfonts is None:
            rfonts = OxmlElement("w:rFonts")
            rpr.append(rfonts)
        for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
            rfonts.set(qn(a), FONT)
        pf = st.paragraph_format
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        pf.line_spacing = 1.0

    def two_columns(self):
        sec = self.doc.add_section(WD_SECTION.CONTINUOUS)
        sectPr = sec._sectPr
        cols = sectPr.find(qn("w:cols"))
        if cols is None:
            cols = OxmlElement("w:cols")
            sectPr.append(cols)
        cols.set(qn("w:num"), "2")
        cols.set(qn("w:space"), str(int(COL_GAP_MM / 25.4 * 1440)))
        self.col_w = (210 - 30 - COL_GAP_MM) / 2  # mm

    def _run(self, p, text, bold=False, italic=False, size=None, small_caps=False):
        r = p.add_run(text)
        r.bold, r.italic = bold, italic
        r.font.name = FONT
        r.font.color.rgb = BLACK
        r._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), FONT)
        if size:
            r.font.size = Pt(size)
        if small_caps:
            r.font.small_caps = True
        return r

    def par(self, parts, indent=True, align=WD_ALIGN_PARAGRAPH.JUSTIFY, size=None, after=0, before=0):
        """parts: str veya [(metin, 'b'|'i'|'bi'|''), ...]"""
        p = self.doc.add_paragraph()
        p.alignment = align
        pf = p.paragraph_format
        pf.first_line_indent = Mm(3.5) if indent else Mm(0)
        pf.space_after, pf.space_before = Pt(after), Pt(before)
        if isinstance(parts, str):
            parts = [(parts, "")]
        for text, sty in parts:
            self._run(p, text, bold="b" in sty, italic="i" in sty, size=size)
        return p

    def h1(self, title, numbered=True):
        p = self.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        if numbered:
            self.h1n += 1
            self.h2n = 0
            self._run(p, f"{ROMAN[self.h1n - 1]}. ")
        self._run(p, title, small_caps=True)

    def h2(self, title):
        p = self.doc.add_paragraph()
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.keep_with_next = True
        self._run(p, f"{chr(65 + self.h2n)}. ", italic=True)
        self.h2n += 1
        self._run(p, title, italic=True)

    def eq(self, text, n):
        p = self.doc.add_paragraph()
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        ts = p.paragraph_format.tab_stops
        ts.add_tab_stop(Mm(self.col_w / 2), WD_TAB_ALIGNMENT.CENTER)
        ts.add_tab_stop(Mm(self.col_w - 0.5), WD_TAB_ALIGNMENT.RIGHT)
        self._run(p, "\t")
        self._run(p, text, italic=True, size=9)
        self._run(p, f"\t({n})")

    def bullets(self, items):
        for it in items:
            p = self.par("• " + it, indent=False)
            p.paragraph_format.left_indent = Mm(4)
            p.paragraph_format.first_line_indent = Mm(-3)

    def figure(self, path, caption, width_mm=None):
        self.fign += 1
        p = self.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.keep_with_next = True
        p.add_run().add_picture(str(path), width=Mm(width_mm or self.col_w))
        c = self.doc.add_paragraph()
        c.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        c.paragraph_format.space_after = Pt(6)
        self._run(c, f"{self.L('Şekil', 'Fig.')} {self.fign}. ", size=8)
        self._run(c, caption, size=8)
        return self.fign

    def table(self, caption, header, rows, widths_mm=None, size=7.5, first_left=True):
        self.tabn += 1
        c1 = self.doc.add_paragraph()
        c1.alignment = WD_ALIGN_PARAGRAPH.CENTER
        c1.paragraph_format.space_before = Pt(6)
        c1.paragraph_format.keep_with_next = True
        self._run(c1, f"{self.L('Tablo', 'Table')} {ROMAN[self.tabn - 1]}", size=8, small_caps=True)
        c2 = self.doc.add_paragraph()
        c2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        c2.paragraph_format.space_after = Pt(2)
        c2.paragraph_format.keep_with_next = True
        self._run(c2, caption, size=8, small_caps=True)
        t = self.doc.add_table(rows=1, cols=len(header))
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.style = "Table Grid"
        for i, h in enumerate(header):
            cell = t.rows[0].cells[i]
            cell.text = ""
            pp = cell.paragraphs[0]
            pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
            self._run(pp, str(h), bold=True, size=size)
        for row in rows:
            cells = t.add_row().cells
            for i, v in enumerate(row):
                cells[i].text = ""
                pp = cells[i].paragraphs[0]
                pp.alignment = WD_ALIGN_PARAGRAPH.LEFT if (i == 0 and first_left) else WD_ALIGN_PARAGRAPH.CENTER
                self._run(pp, str(v), size=size)
        if widths_mm:
            for r in t.rows:
                for i, w in enumerate(widths_mm):
                    r.cells[i].width = Mm(w)
        tblPr = t._tbl.tblPr
        mar = OxmlElement("w:tblCellMar")
        for side in ("left", "right"):
            e = OxmlElement(f"w:{side}")
            e.set(qn("w:w"), "40")
            e.set(qn("w:type"), "dxa")
            mar.append(e)
        tblPr.append(mar)
        sp = self.doc.add_paragraph()
        sp.paragraph_format.space_after = Pt(4)
        sp.paragraph_format.line_spacing = Pt(2)
        return self.tabn

    def save(self, path):
        path.parent.mkdir(exist_ok=True)
        self.doc.save(str(path))
        print("->", path)


# =============================== rapor ===============================
def build(lang: str) -> None:
    make_figures_report.main(lang)
    FIG = RES / f"figures_report_{lang}"
    res = json.loads((RES / "results.json").read_text(encoding="utf-8"))
    ann = json.loads((ROOT / "dataset" / "annotations.json").read_text(encoding="utf-8"))
    S = {(r["detector"], r["enhancement"]): r for r in res["summary"]}
    SC = {(r["detector"], r["enhancement"], r["condition"]): r for r in res["summary_by_condition"]}
    conds = list(ann["conditions"])
    n_img = len(ann["images"])
    n_face = sum(i["count"] for i in ann["images"])
    n_photo = n_img // 3
    per_cond = n_face // 3

    P = Paper(lang)
    L, N = P.L, P.num
    ENH = {"original": L("Ham", "Raw"), "brightness_contrast": L("P/K", "B/C"), "hist_eq": "HE", "clahe": "CLAHE"}
    COND = {"normal": "Normal", "low_light": L("Düşük ışık", "Low light"), "backlight": L("Ters ışık", "Backlight")}
    vj0, yo0 = S[("viola_jones", "original")], S[("yolo", "original")]
    vjh, vjc, yoc = S[("viola_jones", "hist_eq")], S[("viola_jones", "clahe")], S[("yolo", "clahe")]
    ll = lambda d, e: SC[(d, e, "low_light")]
    bl = lambda d, e: SC[(d, e, "backlight")]
    nm = lambda d, e: SC[(d, e, "normal")]
    yolo_rng = (min(S[("yolo", e)]["f1"] for e in ENH_KEYS), max(S[("yolo", e)]["f1"] for e in ENH_KEYS))

    # ---------------- başlık ve yazarlar (tek sütun) ----------------
    t = P.doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    t.paragraph_format.space_after = Pt(6)
    P._run(t, L("Zorlu Görüntüleme Koşullarında Yüz Tespiti ve Kişi Sayma: Viola-Jones ve YOLOv8n-face Karşılaştırması",
                "Face Detection and People Counting under Challenging Imaging Conditions: A Comparison of Viola-Jones and YOLOv8n-face"), size=22)
    sub = P.doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.paragraph_format.space_after = Pt(10)
    P._run(sub, f"{COURSE} — {L('Dönem Projesi', 'Course Project')} · {L('Öğretim Üyesi', 'Instructor')}: {INSTRUCTOR}", italic=True, size=9)

    at = P.doc.add_table(rows=1, cols=len(GROUP))
    at.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, (name, no, _) in enumerate(GROUP):
        cell = at.rows[0].cells[i]
        cell.text = ""
        lines = [(name, 11, False), (L("Bilgisayar Mühendisliği Bölümü", "Department of Computer Engineering"), 10, True),
                 (L("Mühendislik Fakültesi", "Faculty of Engineering"), 10, True), (L("Düzce Üniversitesi", "Düzce University"), 10, True),
                 ("Düzce, Türkiye", 10, False), (f"{L('Öğrenci No', 'Student ID')}: {no}", 10, False)]
        for j, (txt, sz, it) in enumerate(lines):
            pp = cell.paragraphs[0] if j == 0 else cell.add_paragraph()
            pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
            P._run(pp, txt, italic=it, size=sz)
    gap = P.doc.add_paragraph()
    gap.paragraph_format.space_after = Pt(6)
    P.two_columns()

    # ---------------- özet ----------------
    P.par([(L("Özet—", "Abstract—"), "bi"), (L(
        f"Bu çalışmada aydınlatma koşullarının ve görüntü iyileştirme işlemlerinin yüz tespitine etkisi incelenmiştir. Grup üyelerinin "
        f"{n_photo} fotoğrafından normal, düşük ışık ve ters ışık koşullarında oluşturulan {n_img} görüntü ve {n_face} referans yüz üzerinde klasik "
        f"Viola-Jones (Haar kaskadı) dedektörü ile WIDER FACE üzerinde yüz için eğitilmiş YOLOv8n-face modeli; ham, parlaklık/kontrast ayarlı, "
        f"elle yazılmış histogram eşitleme (HE) uygulanmış ve CLAHE uygulanmış görüntülerde sabit ayarlarla karşılaştırılmıştır. Tahminler IoU ≥ 0,50 "
        f"ile bire bir eşleştirilmiş; precision, recall, F1, sayma hatası (MAE) ve işlem süresi raporlanmıştır. YOLOv8n-face ham görüntülerde "
        f"F1 = {N(yo0['f1'], 3)} ile Viola-Jones'tan (F1 = {N(vj0['f1'], 3)}) belirgin biçimde üstündür ve ön işlemeden yalnızca birkaç yüz kadar "
        f"etkilenmiştir. Düşük ışıkta Viola-Jones'un bulduğu yüz sayısı ham görüntüde {ll('viola_jones', 'original')['tp']}, HE ile {ll('viola_jones', 'hist_eq')['tp']} "
        f"olmuştur; ancak HE normal ışıkta Viola-Jones'u kötüleştirmiş, ters ışıkta ise iki dedektörün de başarısını düşürmüştür. Sonuç olarak "
        f"görsel olarak daha iyi görünen bir görüntü her zaman daha iyi tespit sağlamaz; etki dedektöre, başlangıç koşuluna ve yöntemin "
        f"global ya da yerel olmasına bağlıdır.",
        f"This study examines how lighting conditions and image enhancement affect face detection. On {n_img} images with {n_face} "
        f"ground-truth faces, built from {n_photo} photos of the group members in normal, low-light and backlit conditions, the classical "
        f"Viola-Jones (Haar cascade) detector and a YOLOv8n-face model trained for faces on WIDER FACE are compared on raw, brightness/contrast-"
        f"adjusted, hand-implemented histogram-equalized (HE) and CLAHE-processed images with fixed settings. Predictions are matched one-to-one "
        f"at IoU ≥ 0.50, and precision, recall, F1, counting error (MAE) and processing time are reported. YOLOv8n-face clearly outperforms "
        f"Viola-Jones on raw images (F1 = {N(yo0['f1'], 3)} vs. {N(vj0['f1'], 3)}) and changes by only a few faces with preprocessing. HE raises the "
        f"number of faces Viola-Jones finds in low light from {ll('viola_jones', 'original')['tp']} to {ll('viola_jones', 'hist_eq')['tp']}, but it makes "
        f"Viola-Jones worse in normal light and lowers the accuracy of both detectors in backlight. Hence a visually better image does not "
        f"always give better detection; the effect depends on the detector, the starting condition and whether the method is global or local."),
        "b")], indent=False, size=9)
    P.par([(L("Anahtar Kelimeler—", "Index Terms—"), "bi"),
           (L("yüz tespiti, Viola-Jones, YOLO, histogram eşitleme, CLAHE, düşük ışık, ters ışık",
              "face detection, Viola-Jones, YOLO, histogram equalization, CLAHE, low light, backlight"), "b")], indent=False, size=9, before=4)

    # ---------------- I. Giriş ----------------
    P.h1(L("Giriş", "Introduction"))
    P.par(L("Kalabalık sayma, güvenlik ve fotoğraf düzenleme gibi uygulamalarda yüz tespiti çoğu zaman ideal olmayan ışıkta çalışmak zorundadır. "
            "Gece çekimleri, iç mekân aydınlatması ve arkadan gelen güçlü ışık yüz bölgesindeki kontrastı azaltır. Bu durumlarda insan gözüne "
            "daha iyi görünen görüntüler elde etmek için histogram eşitleme gibi iyileştirme yöntemleri sıkça uygulanır [4].",
            "Face detection in applications such as crowd counting, security and photo editing often has to work in non-ideal lighting. Night "
            "shots, indoor lighting and strong light from behind reduce the contrast in the face region. Enhancement methods such as histogram "
            "equalization are commonly applied to make such images look better to the human eye [4]."))
    P.par(L("Bu çalışmanın yönlendirici sorusu şudur: Görsel olarak daha iyi görünen bir görüntü her zaman daha yüksek yüz tespit başarısı "
            "sağlar mı? Soruyu cevaplamak için el yapımı özelliklere dayanan klasik bir dedektör (Viola-Jones [1], [2]) ile veriden öğrenen bir "
            "derin öğrenme dedektörü (YOLOv8n-face [6], [7]) aynı görüntülerde, aynı referans kutularla ve sabit ayarlarla karşılaştırılmıştır. "
            "Katkılarımız: (i) grup üyelerinin fotoğraflarından üç ışık koşullu, etiketli bir veri kümesi; (ii) hazır fonksiyon kullanmadan "
            "yazılmış bir histogram eşitleme gerçeklemesi; (iii) iki dedektör × dört ön işleme için nicel karşılaştırma ve başarısızlık analizi; "
            "(iv) aynı hattı tarayıcıda çalıştıran bir web uygulaması.",
            "The guiding question of this work is: does an image that looks visually better always yield higher face-detection accuracy? To "
            "answer it, a classical detector based on hand-crafted features (Viola-Jones [1], [2]) and a deep-learning detector that learns from "
            "data (YOLOv8n-face [6], [7]) are compared on the same images, with the same ground truth and fixed settings. Our contributions are: "
            "(i) a labelled three-condition dataset built from photos of the group members; (ii) a histogram-equalization implementation written "
            "without library functions; (iii) a quantitative comparison and failure analysis for two detectors × four preprocessing variants; "
            "(iv) a web application that runs the same pipeline in the browser."))

    # ---------------- II. Arka plan ----------------
    P.h1(L("Arka Plan", "Background"))
    P.h2("Viola-Jones")
    P.par(L("Viola-Jones dedektörü [1], komşu dikdörtgen bölgelerin piksel toplamları arasındaki farkları ölçen Haar benzeri özellikler kullanır. "
            "İntegral görüntü sayesinde her dikdörtgen toplamı dört bellek okumasıyla hesaplanır. AdaBoost ile seçilen zayıf sınıflandırıcılar bir "
            "kaskad oluşturur; ilk aşamalar arka plan pencerelerinin çoğunu erkenden eler. Bu çalışmada OpenCV'nin önceden eğitilmiş, 25 aşamalı "
            "ön yüz kaskadı [2], [8] kullanılmıştır.",
            "The Viola-Jones detector [1] uses Haar-like features that measure differences between the pixel sums of adjacent rectangles. With "
            "the integral image, each rectangle sum costs four memory lookups. Weak classifiers selected by AdaBoost form a cascade whose early "
            "stages reject most background windows. We use OpenCV's pretrained 25-stage frontal-face cascade [2], [8]."))
    P.h2("YOLOv8n-face")
    P.par(L("YOLO ailesi görüntüyü tek ileri geçişte işleyerek her ızgara hücresi için kutu ve güven skoru tahmin eder. YOLOv8n-face, "
            "Ultralytics YOLOv8n [6] ağırlıklarından başlatılıp WIDER FACE [5] üzerinde 300 epoch (batch 16, 640×640) yalnızca yüz sınıfı için "
            "eğitilmiş, yaklaşık 3 milyon parametreli bir modeldir [7]. Genel “person” sınıfı kullanılmamıştır.",
            "The YOLO family processes the image in a single forward pass and predicts a box and a confidence score for each grid cell. "
            "YOLOv8n-face is a model of about 3 million parameters that was initialised from Ultralytics YOLOv8n [6] weights and trained on "
            "WIDER FACE [5] for the single class “face” for 300 epochs (batch 16, 640×640) [7]. The generic “person” class is not used."))
    P.h2(L("Histogram eşitleme ve CLAHE", "Histogram equalization and CLAHE"))
    P.par(L("Histogram eşitleme, kümülatif dağılımı dönüşüm fonksiyonu olarak kullanıp gri seviyeleri tüm aralığa yayar [4]. CLAHE [3] ise "
            "görüntüyü bloklara bölüp her bloğun histogramını kırparak eşitler ve blok sınırlarını çift doğrusal interpolasyonla birleştirir; "
            "böylece yerel kontrastı artırırken gürültünün aşırı büyümesini sınırlar.",
            "Histogram equalization uses the cumulative distribution as the transfer function and spreads the gray levels over the full range "
            "[4]. CLAHE [3] splits the image into tiles, equalizes each tile with a clipped histogram and blends tile borders bilinearly, "
            "increasing local contrast while limiting noise amplification."))

    # ---------------- III. Veri kümesi ----------------
    P.h1(L("Veri Kümesi", "Dataset"))
    P.par(L(f"Veri kümesi grup üyelerinin bilgilendirilmiş onayıyla çekilmiş {n_photo} fotoğraftan oluşur: gece ve gündüz, iç ve dış mekân, "
            "selfie ve ayakta grup pozları. Arka planda görünen diğer kişilerin yüzleri de etiketlenmiştir. Fotoğraflar yönü düzeltilip uzun kenarı "
            "1280 piksel olacak şekilde küçültülmüş ve üç koşulda kullanılmıştır (Şekil 1): normal (fotoğrafın kendisi), düşük ışık ve ters ışık. "
            "Düşük ışık sürümü",
            f"The dataset consists of {n_photo} photos taken with the informed consent of the group members: night and daylight, indoor and "
            "outdoor, selfies and standing group shots. Visible faces of other people in the background are annotated as well. Each photo is "
            "orientation-corrected, resized to 1280 pixels on its long side and used in three conditions (Fig. 1): normal (the photo itself), "
            "low light and backlight. The low-light version is"))
    P.eq(L("s = 255 · 0,22 · (r / 255)^2,0 + n,  n ~ N(0, 5²)", "s = 255 · 0.22 · (r / 255)^2.0 + n,  n ~ N(0, 5²)"), 1)
    P.par(L("ile üretilir; burada r giriş, s çıkış gri seviyesi, n sensör gürültüsüdür. Ters ışık sürümünde yüz kutularından türetilen baş-gövde "
            "maskesi içindeki kişiler karartılır (γ = 1,8, kazanç 0,30), arka plan ise aşırı pozlanıp üstten parlama eklenir. Böylece aynı yüzler "
            "üç koşulda karşılaştırılabilir; düşük ışık ve ters ışık görüntüleri ayrı çekimler değil, kontrollü türetimlerdir (tohum 42).",
            "where r and s are the input and output gray levels and n is sensor noise. In the backlit version the people inside a head-and-body "
            "mask derived from the face boxes are darkened (γ = 1.8, gain 0.30) while the background is over-exposed with a glare from above. "
            "The same faces can thus be compared across conditions; the low-light and backlit images are controlled derivations, not separate "
            "shots (seed 42)."), indent=False)
    P.figure(FIG / "fig_conditions.png", L("Bir fotoğrafın üç koşulu.", "The three conditions of one photo."))
    P.par(L("Referans kutular şöyle çizilmiştir: YOLOv8n-face düşük güven eşiğiyle (0,10) ve Viola-Jones aday kutular önermiş, her öneri görsel "
            "olarak tek tek kontrol edilmiştir. Yalnız gerçekten görünen yüzler tutulmuş; arkası dönük kişiler çıkarılmış, kenarda kesilen veya "
            "elle kısmen örtülen yüzler tutulmuştur. Veri kümesinin dağılımı Tablo I'de verilmiştir.",
            "Ground-truth boxes were drawn as follows: YOLOv8n-face with a low confidence threshold (0.10) and Viola-Jones proposed candidates, and "
            "every proposal was checked visually. Only genuinely visible faces were kept; people facing away were removed, while faces cut by the "
            "border or partly covered by a hand were kept. The distribution of the dataset is given in Table I."))
    rows = []
    for c in conds:
        items = [i for i in ann["images"] if i["condition"] == c]
        rows.append([COND[c], len(items), sum(i["count"] for i in items), f"{min(i['count'] for i in items)}–{max(i['count'] for i in items)}"])
    rows.append([L("Toplam", "Total"), n_img, n_face, ""])
    P.table(L("Veri kümesinin dağılımı", "Dataset distribution"), [L("Koşul", "Condition"), L("Görüntü", "Images"), L("Yüz", "Faces"),
            L("Yüz/görüntü", "Faces/image")], rows, [26, 16, 14, 20], size=8)

    # ---------------- IV. Yöntem ----------------
    P.h1(L("Yöntem", "Method"))
    P.par(L("İşlem hattı Şekil 2'de özetlenmiştir.", "The processing pipeline is summarized in Fig. 2."))
    P.figure(FIG / "fig_flow.png", L("İşlem hattının akış şeması.", "Flowchart of the processing pipeline."), width_mm=P.col_w * 0.92)
    P.h2(L("Görüntü iyileştirme", "Image enhancement"))
    P.par(L("Her görüntünün dört sürümü kullanılmıştır: ham; parlaklık/kontrast (P/K); histogram eşitleme (HE); CLAHE. P/K bir nokta işlemidir:",
            "Four versions of every image are used: raw; brightness/contrast (B/C); histogram equalization (HE); CLAHE. B/C is a point operation:"))
    P.eq(L("g(x, y) = clip(α f(x, y) + β, 0, 255),  α = 1,3,  β = 20", "g(x, y) = clip(α f(x, y) + β, 0, 255),  α = 1.3,  β = 20"), 2)
    P.par(L("HE hazır bir fonksiyon kullanılmadan yazılmıştır: histogram h(k) sayılır, kümülatif dağılım CDF(k) alınır ve",
            "HE was implemented without any library function: the histogram h(k) is counted, the cumulative distribution CDF(k) is taken and"))
    P.eq("s_k = round(255 (CDF(k) − c) / (N − c)),  c = CDF_min", 3)
    P.par(L("eşlemesi uygulanır (N piksel sayısıdır). Renkli görüntülerde işlem yalnız YCrCb uzayının Y kanalına uygulanır. Gerçekleme "
            "cv2.equalizeHist ile piksel piksel aynı çıktıyı verir (en büyük fark 0). CLAHE için OpenCV kullanılmıştır (clipLimit 2,0, 8×8 blok, Y kanalı).",
            "is applied (N is the number of pixels). In color images it is applied only to the Y channel of YCrCb. The implementation produces "
            "pixel-identical output to cv2.equalizeHist (maximum difference 0). CLAHE uses OpenCV (clipLimit 2.0, 8×8 tiles, Y channel)."), indent=False)
    P.h2(L("Dedektörler", "Detectors"))
    P.par(L("Viola-Jones, 0,2989R + 0,5870G + 0,1140B ile elde edilen gri görüntüde scaleFactor = 1,1, minNeighbors = 5 ve minSize = 24×24 ile "
            "çalıştırılmıştır. YOLOv8n-face için görüntü en-boy oranı korunarak 640×640'a yerleştirilir (letterbox); ağın ürettiği 8400 adaydan "
            "güveni 0,35'in altında olanlar atılır ve kalanlara IoU eşiği 0,45 ile NMS uygulanır. Ayarlar tüm görüntülerde sabittir (Tablo II).",
            "Viola-Jones runs on the gray image obtained with 0.2989R + 0.5870G + 0.1140B, with scaleFactor = 1.1, minNeighbors = 5 and minSize = "
            "24×24. For YOLOv8n-face the image is letterboxed to 640×640 keeping its aspect ratio; of the 8400 candidates produced by the network, "
            "those with confidence below 0.35 are discarded and NMS with an IoU threshold of 0.45 is applied to the rest. Settings are fixed for "
            "all images (Table II)."))
    P.table(L("Sabit deney ayarları", "Fixed experimental settings"), [L("Ayar", "Setting"), L("Değer", "Value")], [
        [ENH["brightness_contrast"], L("α = 1,3; β = +20", "α = 1.3; β = +20")],
        ["HE", L("elle, Y kanalı", "own implementation, Y channel")],
        ["CLAHE", L("clipLimit 2,0; 8×8; Y kanalı", "clipLimit 2.0; 8×8; Y channel")],
        ["Viola-Jones", L("sf 1,1; minNeighbors 5; minSize 24", "sf 1.1; minNeighbors 5; minSize 24")],
        ["YOLOv8n-face", L("640×640; conf 0,35; NMS 0,45", "640×640; conf 0.35; NMS 0.45")],
        [L("Eşleştirme", "Matching"), L("IoU ≥ 0,50, bire bir", "IoU ≥ 0.50, one-to-one")],
    ], [24, 58], size=8)
    P.h2(L("Değerlendirme", "Evaluation"))
    P.par(L("Her görüntüde tüm (tahmin, referans) çiftlerinin örtüşmesi hesaplanır:",
            "For every image the overlap of all (prediction, ground-truth) pairs is computed:"))
    P.eq("IoU(A, B) = |A ∩ B| / |A ∪ B|", 4)
    P.par(L("IoU ≥ 0,50 olan çiftler büyükten küçüğe sıralanıp, ikisi de kullanılmamışsa bire bir eşleştirilir. Eşleşenler TP, eşleşmeyen tahminler "
            "FP, eşleşmeyen referanslar FN'dir. TP/FP/FN veri kümesi boyunca toplanır ve",
            "Pairs with IoU ≥ 0.50 are sorted in descending order and matched one-to-one if neither is used yet. Matched pairs are TP, unmatched "
            "predictions FP and unmatched ground-truth boxes FN. TP/FP/FN are summed over the dataset and"), indent=False)
    P.eq("P = TP/(TP+FP),  R = TP/(TP+FN),  F1 = 2PR/(P+R)", 5)
    P.par(L("hesaplanır. Görüntü başına mutlak sayma hatası |tahmin − gerçek| ve ortalaması (MAE) da raporlanır. Süre iki biçimde ölçülmüştür: "
            "yalnız dedektör çağrısı (çıkarım) ve ön işleme + çıkarım + son işleme (uçtan uca); her ölçümden önce bir ısınma çalıştırması yapılmış, "
            "ölçümler CPU üzerinde alınmıştır.",
            "are computed. The per-image absolute counting error |predicted − true| and its mean (MAE) are also reported. Time is measured in two "
            "ways: the detector call only (inference) and preprocessing + inference + post-processing (end-to-end), after one warm-up run, on the CPU."),
          indent=False)
    P.h2(L("Gerçekleme", "Implementation"))
    P.par(L("Deneyler Python 3.12, OpenCV 4.10 ve ONNX Runtime ile çalıştırılmıştır. Aynı hat, canlı gösterim için Next.js tabanlı bir web "
            "uygulamasında tarayıcıda (OpenCV.js ve ONNX Runtime Web [9]) çalışır; görüntüler sunucuya gönderilmez. Tarayıcıda tekrarlanan "
            "deneyin F1 değerleri Python ile en fazla bir yüzlük farkla örtüşür.",
            "Experiments were run with Python 3.12, OpenCV 4.10 and ONNX Runtime. For the live demonstration the same pipeline runs in the browser "
            "in a Next.js web application (OpenCV.js and ONNX Runtime Web [9]); images are never uploaded. F1 values of the experiment rerun in the "
            "browser agree with Python within one face."))

    # ---------------- V. Sonuçlar ----------------
    P.h1(L("Sonuçlar", "Results"))
    P.h2(L("Genel karşılaştırma", "Overall comparison"))
    P.par(L(f"Tablo III ve Şekil 3 tüm veri kümesi sonuçlarını verir. YOLOv8n-face ham görüntülerde precision {N(yo0['precision'])}, recall "
            f"{N(yo0['recall'])} ve F1 {N(yo0['f1'])} elde ederken Viola-Jones'un F1 değeri yalnızca {N(vj0['f1'])} "
            f"olmuştur (recall {N(vj0['recall'])}). Ön işleme ile Viola-Jones'un en yüksek F1 değeri {N(max(vjh['f1'], vjc['f1']))} olmuş, "
            f"YOLO'nun en iyi sonucu CLAHE ile (F1 {N(yoc['f1'])}) alınmıştır.",
            f"Table III and Fig. 3 give the results on the whole dataset. On raw images YOLOv8n-face reaches precision {N(yo0['precision'])}, recall "
            f"{N(yo0['recall'])} and F1 {N(yo0['f1'])}, whereas Viola-Jones reaches F1 {N(vj0['f1'])}, finding only {round(vj0['recall'] * 100)}% of the "
            f"faces. Preprocessing raises Viola-Jones' F1 to at most {N(max(vjh['f1'], vjc['f1']))}; YOLO's best result is obtained with CLAHE "
            f"(F1 {N(yoc['f1'])})."))
    rows = []
    for d in ["viola_jones", "yolo"]:
        for e in ENH_KEYS:
            r = S[(d, e)]
            rows.append(["VJ" if d == "viola_jones" else "YOLO", ENH[e], r["tp"], r["fp"], r["fn"], N(r["precision"]), N(r["recall"]), N(r["f1"]), N(r["mae"])])
    P.table(L(f"Tüm veri kümesinde sonuçlar ({n_face} yüz)", f"Results on the whole dataset ({n_face} faces)"),
            [L("Dedek.", "Det."), L("Ön işl.", "Prep."), "TP", "FP", "FN", "P", "R", "F1", "MAE"], rows, [11, 11, 7, 7, 7, 9, 9, 9, 9], size=7.5)
    P.figure(FIG / "fig_f1.png", L("Ön işlemeye göre F1 (tüm veri kümesi).", "F1 by preprocessing (whole dataset)."))

    P.h2(L("Koşullara göre sonuçlar", "Results by condition"))
    P.par(L(f"Tablo IV ve Şekil 4 koşul bazında F1 değerlerini verir. Düşük ışıkta Viola-Jones ham görüntüde {per_cond} yüzün yalnızca "
            f"{ll('viola_jones', 'original')['tp']} tanesini bulurken HE ile {ll('viola_jones', 'hist_eq')['tp']}, CLAHE ile {ll('viola_jones', 'clahe')['tp']} "
            f"yüz bulmuştur; P/K ise {ll('viola_jones', 'brightness_contrast')['tp']} yüzde kalmıştır. Ters ışıkta HE doğru tespit sayısını Viola-Jones'ta "
            f"{bl('viola_jones', 'original')['tp']} → {bl('viola_jones', 'hist_eq')['tp']}, YOLO'da {bl('yolo', 'original')['tp']} → {bl('yolo', 'hist_eq')['tp']} "
            f"düşürmüş, CLAHE ise iki dedektörü de iyileştirmiştir ({bl('viola_jones', 'clahe')['tp']} ve {bl('yolo', 'clahe')['tp']}). Normal ışıkta "
            f"iyileştirme Viola-Jones'u kötüleştirmiştir (CLAHE ile F1 {N(nm('viola_jones', 'original')['f1'])} → {N(nm('viola_jones', 'clahe')['f1'])}). "
            "Şekil 5 ve Şekil 6 iki örnek görüntüyü gösterir.",
            f"Table IV and Fig. 4 give F1 per condition. In low light Viola-Jones finds only {ll('viola_jones', 'original')['tp']} of {per_cond} faces "
            f"on raw images, {ll('viola_jones', 'hist_eq')['tp']} with HE and {ll('viola_jones', 'clahe')['tp']} with CLAHE, while B/C stays at "
            f"{ll('viola_jones', 'brightness_contrast')['tp']}. In backlight HE lowers the correct detections from {bl('viola_jones', 'original')['tp']} to "
            f"{bl('viola_jones', 'hist_eq')['tp']} for Viola-Jones and from {bl('yolo', 'original')['tp']} to {bl('yolo', 'hist_eq')['tp']} for YOLO, whereas "
            f"CLAHE improves both ({bl('viola_jones', 'clahe')['tp']} and {bl('yolo', 'clahe')['tp']}). In normal light enhancement makes Viola-Jones "
            f"worse (F1 {N(nm('viola_jones', 'original')['f1'])} → {N(nm('viola_jones', 'clahe')['f1'])} with CLAHE). Figs. 5 and 6 show two examples."))
    rows = []
    for c in conds:
        for d in ["viola_jones", "yolo"]:
            rows.append([COND[c], "VJ" if d == "viola_jones" else "YOLO"] + [f"{N(SC[(d, e, c)]['f1'])} ({SC[(d, e, c)]['tp']})" for e in ENH_KEYS])
    P.table(L("Koşul × ön işleme F1 (parantez içinde TP)", "F1 per condition × preprocessing (TP in parentheses)"),
            [L("Koşul", "Cond."), L("Dedek.", "Det."), ENH["original"], ENH["brightness_contrast"], "HE", "CLAHE"], rows, [16, 10, 14, 14, 14, 14], size=7.5)
    P.figure(FIG / "fig_heatmap.png", L("Koşul × ön işleme F1 değerleri (koyu: yüksek).", "F1 per condition × preprocessing (dark: high)."))
    P.figure(FIG / "fig_ex_lowlight.png", L("Düşük ışık örneği (beyaz kesikli: referans, siyah-beyaz çerçeve: tahmin). HE ve CLAHE Viola-Jones'un "
                                            "yüz bulmasını sağlar; YOLO ham görüntüde de tüm yüzleri bulur.",
                                            "Low-light example (white dashed: ground truth, black-white frame: prediction). HE and CLAHE let Viola-Jones "
                                            "find faces; YOLO finds all faces even on the raw image."))
    P.figure(FIG / "fig_ex_backlight.png", L("Ters ışık örneği. Görüntüyü en çok açan HE iki dedektörde de yüz kaybettirir; CLAHE kaybettirmez.",
                                             "Backlight example. HE, which opens up the image most, makes both detectors lose faces; CLAHE does not."))
    P.h2(L("İşlem süresi", "Processing time"))
    rows = []
    for d in ["viola_jones", "yolo"]:
        for e in ENH_KEYS:
            r = S[(d, e)]
            rows.append(["VJ" if d == "viola_jones" else "YOLO", ENH[e], N(r["mean_inference_ms"], 1), N(r["mean_end_to_end_ms"], 1)])
    P.par(L(f"Tablo V ortalama süreleri verir. 1280 piksellik görüntülerde YOLO'nun çıkarım süresi ({N(yo0['mean_inference_ms'], 0)} ms) "
            f"Viola-Jones'unkinden ({N(vj0['mean_inference_ms'], 0)} ms) kısadır; ön işleme iki dedektörde de uçtan uca süreyi artırmıştır.",
            f"Table V gives the mean times. On 1280-pixel images YOLO's inference time ({N(yo0['mean_inference_ms'], 0)} ms) is shorter than "
            f"Viola-Jones' ({N(vj0['mean_inference_ms'], 0)} ms); preprocessing increases the end-to-end time of both detectors."))
    P.table(L("Ortalama süre (ms, CPU)", "Mean time (ms, CPU)"), [L("Dedek.", "Det."), L("Ön işl.", "Prep."), L("Çıkarım", "Inference"),
            L("Uçtan uca", "End-to-end")], rows, [14, 16, 22, 22], size=7.5)

    # ---------------- VI. Tartışma ----------------
    P.h1(L("Tartışma", "Discussion"))
    P.par(L("Viola-Jones'un düşük ışıktaki başarısızlığı yönteminin doğasından gelir: Haar özellikleri parlaklık farklarıdır ve görüntü karardıkça "
            "bu farklar kaskad eşiklerinin altına iner. HE ve CLAHE gri seviyeleri yaydığı için farkları yeniden büyütür (Şekil 7); P/K ise karanlık "
            "histogramı yalnızca biraz kaydırır ve gürültüyü α kadar büyütür.",
            "Viola-Jones' failure in low light follows from its design: Haar features are brightness differences, and as the image gets darker "
            "these differences fall below the cascade thresholds. HE and CLAHE spread the gray levels and enlarge the differences again (Fig. 7), "
            "whereas B/C only shifts the dark histogram slightly and amplifies noise by α."))
    P.figure(FIG / "fig_hist.png", L("Düşük ışık görüntüsünün gri seviye histogramı: ham, HE ve CLAHE.",
                                     "Gray-level histogram of a low-light image: raw, HE and CLAHE."))
    P.par(L("Ters ışıkta parlak arka plan global histogramı domine eder; HE parlak alanı genişletirken yüz bölgesini yeterince açamaz ve gürültüyü "
            "büyütür. Yerel çalışan CLAHE bu sorunu yaşamaz. Normal ışıkta ise kontrast zaten yeterlidir; iyileştirme yüzün parlaklık örüntüsünü "
            "değiştirir ve yaprak, desenli giysi gibi dokuları güçlendirerek Viola-Jones'un yanlış pozitiflerini artırır. YOLOv8n-face, aydınlatma "
            "çeşitliliği yüksek bir veri kümesiyle ve parlaklık artırmasıyla eğitildiği için ışık değişimine büyük ölçüde dayanıklıdır; "
            "kaçırdığı yüzler çoğunlukla arka plandaki küçük ve bulanık yüzlerdir.",
            "In backlight the bright background dominates the global histogram; HE stretches the bright area without opening up the face region "
            "and amplifies noise. Locally operating CLAHE avoids this. In normal light the contrast is already sufficient; enhancement changes the "
            "brightness pattern of the face and strengthens textures such as leaves and patterned clothing, increasing Viola-Jones' false positives. "
            "YOLOv8n-face, trained on data with high lighting variety and with brightness augmentation, is largely robust to lighting; its misses "
            "are mostly small, blurry background faces."))
    P.par(L("Araştırma sorusunun cevabı bu nedenle hayırdır: görsel olarak daha iyi görünen görüntü her zaman daha iyi tespit sağlamaz. "
            "İyileştirmenin etkisi dedektörün türüne, görüntünün başlangıç koşuluna ve yöntemin global ya da yerel olmasına bağlıdır. Uygulamada "
            "iyileştirme seçici olarak, örneğin yalnızca ortalama parlaklık düşükken ve global HE yerine CLAHE ile uygulanmalıdır.",
            "The answer to the research question is therefore no: a visually better image does not always give better detection. The effect of "
            "enhancement depends on the detector type, the starting condition of the image and whether the method is global or local. In practice, "
            "enhancement should be applied selectively, e.g. only when the mean brightness is low and with CLAHE rather than global HE."))

    # ---------------- VII. Sınırlılıklar ----------------
    P.h1(L("Sınırlılıklar", "Limitations"))
    P.bullets([
        L(f"Veri kümesi küçüktür ({n_img} görüntü, {n_photo} fotoğraf); sonuçlar bir eğilim gösterir, istatistiksel genelleme değildir.",
          f"The dataset is small ({n_img} images from {n_photo} photos); the results show a tendency, not a statistical generalization."),
        L("Düşük ışık ve ters ışık görüntüleri türetilmiştir; gerçek karanlıkta hareket bulanıklığı, renk gürültüsü ve otomatik pozlama da etkilidir.",
          "Low-light and backlit images are derived; real darkness also brings motion blur, color noise and auto-exposure effects."),
        L("Referans kutular YOLO ve Viola-Jones önerilerinin elle kontrolüyle çizildiğinden IoU hesabı YOLO lehine hafif bir yanlılık taşıyabilir.",
          "Ground-truth boxes were drawn by checking YOLO and Viola-Jones proposals, so IoU may be slightly biased in YOLO's favor."),
        L("Süreler tek bir CPU'da ölçülmüştür ve donanıma göre değişir; ön işleme parametreleri sabit seçilmiştir.",
          "Timings were measured on a single CPU and depend on hardware; preprocessing parameters were fixed rather than adaptive."),
    ])

    # ---------------- VIII. Sonuç ----------------
    P.h1(L("Sonuç", "Conclusion"))
    P.par(L(f"Klasik ve derin öğrenme tabanlı iki yüz dedektörü, grup fotoğraflarından oluşturulan üç ışık koşullu bir veri kümesinde dört ön işleme "
            f"ile karşılaştırılmıştır. YOLOv8n-face her koşulda belirgin biçimde üstündür (F1 ≈ {N(yolo_rng[0])}–{N(yolo_rng[1])}). İyileştirme "
            "yalnız karanlık görüntülerde ve klasik dedektörde belirgin fayda sağlamış, normal ve ters ışıkta zarar verebilmiştir. Gelecek "
            "çalışmada gerçek düşük ışık çekimleri, daha büyük bir veri kümesi ve parlaklığa göre otomatik ön işleme seçimi incelenecektir.",
            f"Two face detectors, one classical and one deep-learning based, were compared with four preprocessing variants on a three-condition "
            f"dataset built from group photos. YOLOv8n-face is clearly superior in every condition (F1 ≈ {N(yolo_rng[0])}–{N(yolo_rng[1])}). "
            "Enhancement brought a clear benefit only on dark images and for the classical detector, and it could hurt in normal and backlit "
            "conditions. Future work will study real low-light shots, a larger dataset and automatic, brightness-dependent selection of preprocessing."))

    # ---------------- etik, YZ, katkılar ----------------
    P.h1(L("Etik ve Yapay Zekâ Kullanımı", "Ethics and Use of AI"), numbered=False)
    P.par(L("Fotoğraflar grup üyelerinin bilgilendirilmiş onayıyla kullanılmıştır; yalnız yüz tespiti ve sayma yapılmış, yüz tanıma veya kimlik "
            "etiketleme yapılmamıştır. Kodun ve dokümantasyonun önemli bir bölümü bir yapay zekâ kodlama asistanı (Anthropic Claude) yardımıyla "
            "hazırlanmıştır; önceden eğitilmiş modeller ve kütüphaneler kaynaklarda listelenmiştir. Sonuçların doğruluğundan ve açıklanmasından "
            "grup üyeleri sorumludur.",
            "The photos are used with the informed consent of the group members; only face detection and counting are performed, with no face "
            "recognition or identity labelling. A substantial part of the code and documentation was prepared with the help of an AI coding "
            "assistant (Anthropic Claude); pretrained models and libraries are listed in the references. The group members are responsible for "
            "the correctness and explanation of the results."))
    P.h1(L("Yazar Katkıları", "Author Contributions"), numbered=False)
    for name, no, contrib in GROUP:
        P.par([(f"{name} ({no}): ", "b"), (contrib[lang], "")], indent=False, size=9, after=2)

    # ---------------- kaynaklar ----------------
    P.h1(L("Kaynaklar", "References"), numbered=False)
    refs = [
        "P. Viola and M. Jones, “Rapid object detection using a boosted cascade of simple features,” in Proc. IEEE CVPR, 2001, pp. I-511–I-518.",
        "R. Lienhart and J. Maydt, “An extended set of Haar-like features for rapid object detection,” in Proc. IEEE ICIP, 2002, pp. I-900–I-903.",
        "K. Zuiderveld, “Contrast limited adaptive histogram equalization,” in Graphics Gems IV, P. S. Heckbert, Ed. San Diego, CA, USA: Academic Press, 1994, pp. 474–485.",
        "R. C. Gonzalez and R. E. Woods, Digital Image Processing, 4th ed. New York, NY, USA: Pearson, 2018.",
        "S. Yang, P. Luo, C. C. Loy, and X. Tang, “WIDER FACE: A face detection benchmark,” in Proc. IEEE CVPR, 2016, pp. 5525–5533.",
        "G. Jocher, A. Chaurasia, and J. Qiu, “Ultralytics YOLOv8,” 2023. [Online]. Available: https://github.com/ultralytics/ultralytics",
        "Lindevs, “YOLOv8-Face: Pre-trained YOLOv8 models for face detection,” release 1.0.1, 2024. [Online]. Available: https://github.com/lindevs/yolov8-face",
        "OpenCV, “Haar cascades,” OpenCV 4.x. [Online]. Available: https://github.com/opencv/opencv/tree/4.x/data/haarcascades",
        "ONNX Runtime developers, “ONNX Runtime,” 2024. [Online]. Available: https://onnxruntime.ai",
    ]
    for i, r in enumerate(refs, 1):
        p = P.par(f"[{i}]\t{r}", indent=False, size=8, after=1, align=WD_ALIGN_PARAGRAPH.LEFT)
        p.paragraph_format.left_indent = Mm(6)
        p.paragraph_format.first_line_indent = Mm(-6)
        p.paragraph_format.tab_stops.add_tab_stop(Mm(6))

    P.save(OUT[lang])


if __name__ == "__main__":
    for lg in (sys.argv[1:] or ["tr", "en"]):
        build(lg)

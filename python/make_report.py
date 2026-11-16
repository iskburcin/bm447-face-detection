"""Word raporunu (docs/BM447_Yuz_Tespiti_Raporu.docx) results/ verilerinden üretir.

Grup fotoğraflarıyla deney yeniden çalıştırıldığında bu betik tekrar çalıştırılarak
tüm tablo, şekil ve sayıların güncel hâli rapora yansıtılır. Kapak bilgilerini
(öğrenci adları/numaraları) aşağıdaki GROUP listesinden düzenleyin.
"""
from __future__ import annotations

import json
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "results"
FIG = RES / "figures"
OUT = ROOT / "docs" / "BM447_Yuz_Tespiti_Raporu.docx"

# ---- Kapak bilgileri: teslimden önce doldurun ----
GROUP = [("Ad Soyad 1", "Öğrenci No 1", "Katkı: ..."), ("Ad Soyad 2", "Öğrenci No 2", "Katkı: ...")]

ENH = {"original": "Ham", "brightness_contrast": "Parlaklık/Kontrast", "hist_eq": "Histogram Eşitleme", "clahe": "CLAHE"}
DET = {"viola_jones": "Viola-Jones", "yolo": "YOLOv8n-face"}
COND = {"normal": "Normal ışık", "low_light": "Düşük ışık", "backlight": "Ters ışık"}
ACCENT = RGBColor(0x56, 0x4D, 0x80)


def shade(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def table(doc, header, rows, widths=None, font=8.5):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]
        c.text = ""
        r = c.paragraphs[0].add_run(str(h))
        r.bold = True
        r.font.size = Pt(font)
        shade(c, "E7E5F6")
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = ""
            r = cells[i].paragraphs[0].add_run(str(v))
            r.font.size = Pt(font)
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Cm(w)
    return t


def caption(doc, text):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.italic = True
    r.font.size = Pt(9)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER


def figure(doc, path, width_cm, cap):
    if path.exists():
        doc.add_picture(str(path), width=Cm(width_cm))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        caption(doc, cap)


def bullet(doc, text, bold_prefix=None):
    p = doc.add_paragraph(style="List Bullet")
    if bold_prefix:
        p.add_run(bold_prefix).bold = True
    p.add_run(text)
    return p


def main() -> None:
    res = json.loads((RES / "results.json").read_text(encoding="utf-8"))
    ann = json.loads((ROOT / "dataset" / "annotations.json").read_text(encoding="utf-8"))
    S = {(r["detector"], r["enhancement"]): r for r in res["summary"]}
    SC = {(r["detector"], r["enhancement"], r["condition"]): r for r in res["summary_by_condition"]}
    n_img = len(ann["images"])
    n_face = sum(i["count"] for i in ann["images"])
    conds = list(ann["conditions"])
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

    # ---------------- Kapak ----------------
    for t, size, bold in [("DÜZCE ÜNİVERSİTESİ", 14, True), ("Mühendislik Fakültesi · Bilgisayar Mühendisliği", 11, False),
                          ("BM447 Sayısal Görüntü İşleme", 12, True), ("", 11, False),
                          ("Zorlu Görüntüleme Koşullarında Yüz Tespiti ve Kişi Sayma:", 18, True),
                          ("Klasik Yöntem (Viola-Jones) ve YOLO Karşılaştırması", 16, True), ("", 11, False),
                          ("Proje Raporu", 13, False), ("Öğretim Üyesi: Prof. Dr. Pakize Erdoğmuş", 11, False), ("", 11, False)]:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(t)
        r.font.size = Pt(size)
        r.bold = bold
        if size >= 16:
            r.font.color.rgb = ACCENT
    table(doc, ["Ad Soyad", "Öğrenci No", "Bireysel katkı"], GROUP, widths=[5, 4, 7], font=10)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run(f"\nDeney tarihi: {res['generated']}").font.size = Pt(9)
    doc.add_page_break()

    # ---------------- Özet ----------------
    vj0, vjc, vjh, yo0 = S[("viola_jones", "original")], S[("viola_jones", "clahe")], S[("viola_jones", "hist_eq")], S[("yolo", "original")]
    doc.add_heading("Özet", level=1)
    doc.add_paragraph(
        f"Bu çalışmada aydınlatma koşullarının ve görüntü iyileştirme işlemlerinin yüz tespiti başarısına etkisi incelenmiştir. "
        f"{n_img} görüntü ve {n_face} referans yüz üzerinde klasik Viola-Jones (Haar Cascade) dedektörü ile WIDER FACE veri kümesinde "
        f"yüz için eğitilmiş YOLOv8n-face modeli; ham, parlaklık/kontrast ayarlı, histogram eşitlenmiş ve CLAHE uygulanmış görüntülerde, "
        f"sabit ayarlarla karşılaştırılmıştır. Tahminler referans kutularla IoU ≥ 0,50 koşulunda bire bir eşleştirilmiş; TP, FP, FN, "
        f"precision, recall, F1, mutlak sayma hatası, MAE ve işlem süreleri raporlanmıştır. Ham görüntülerde Viola-Jones F1 = {vj0['f1']:.3f} "
        f"(recall {vj0['recall']:.2f}) iken CLAHE ile F1 = {vjc['f1']:.3f} (recall {vjc['recall']:.2f}) olmuştur; buna karşın histogram "
        f"eşitleme ve CLAHE normal ışıklı görüntülerde yanlış pozitif üretmiştir. YOLOv8n-face ham görüntülerde F1 = {yo0['f1']:.3f} ile "
        f"ön işlemeden bağımsız yüksek başarı göstermiştir. Sonuç olarak görsel olarak daha iyi görünen bir görüntü her zaman daha yüksek "
        f"tespit başarısı sağlamamaktadır; etkinin yönü dedektörün türüne ve görüntünün başlangıç koşuluna bağlıdır. Ayrıca sistem, "
        f"tarayıcıda çalışan, Vercel'e ve Docker'a dağıtılabilen bir Next.js web uygulaması olarak sunulmuştur."
    )
    if synthetic:
        p = doc.add_paragraph()
        r = p.add_run("ÖNEMLİ NOT: Bu rapordaki sayılar, hattın doğrulanması için kamu malı bir portreden üretilmiş SENTETİK DEMO veri "
                      "kümesine aittir. Teslimden önce grup üyelerinin onaylı fotoğrafları etiketlenip deney ve bu rapor yeniden "
                      "üretilmelidir (python run_experiments.py → python make_report.py).")
        r.bold = True
        r.font.color.rgb = RGBColor(0xC9, 0x3A, 0x12)

    # ---------------- 1. Amaç ----------------
    doc.add_heading("1. Amaç ve araştırma sorusu", level=1)
    doc.add_paragraph("Projenin amacı, aydınlatmanın ve görüntü işleme dönüşümlerinin yüz tespiti doğruluğunu nasıl etkilediğini nicel "
                      "olarak göstermek; aynı görüntülerde klasik bir yüz dedektörü ile önceden eğitilmiş bir YOLO yüz modelinin tespit "
                      "ve sayma hatalarını karşılaştırmak ve başarısızlıkları sayısal kanıtlarla açıklamaktır.")
    doc.add_paragraph("Yönlendirici araştırma sorusu: “Görsel olarak daha iyi görünen bir görüntü her zaman daha yüksek yüz tespit başarısı sağlar mı?”")

    # ---------------- 2. Veri ----------------
    doc.add_heading("2. Veri kümesi ve etiketleme", level=1)
    rows = []
    for c in conds:
        items = [i for i in ann["images"] if i["condition"] == c]
        rows.append([ann["conditions"].get(c, c), len(items), sum(i["count"] for i in items),
                     f"{min(i['count'] for i in items)}–{max(i['count'] for i in items)}"])
    rows.append(["Toplam", n_img, n_face, ""])
    table(doc, ["Koşul", "Görüntü", "Yüz (GT)", "Görüntü başına yüz"], rows, widths=[5, 3, 3, 4], font=10)
    caption(doc, "Tablo 1. Veri kümesinin koşullara göre dağılımı.")
    doc.add_paragraph(
        "Her görünen yüz, alından/saç çizgisinden çeneye ve iki yanak arasında kalacak şekilde eksen hizalı bir sınırlayıcı kutu "
        "[x, y, w, h] ile işaretlenmiş ve görüntüdeki gerçek kişi sayısı kaydedilmiştir. Etiketler dataset/annotations.json dosyasında "
        "tutulur. Etiketleme için projenin web uygulamasındaki Etiketleme aracı (/etiketleme) kullanılır; araç her koşul için en az 5, "
        "toplamda en az 15 görüntü şartını sayaçla gösterir.")
    if synthetic:
        doc.add_paragraph(
            "Demo kümesi şöyle üretilmiştir (python/make_demo_dataset.py, tohum 42): normal ışık için orijinal portre, yatay çevrilmiş "
            "ve 2–4 kişilik kolajlar; düşük ışık için s = 255·0,13·(r/255)^2,2 dönüşümü ve σ = 5 Gauss sensör gürültüsü; ters ışık için "
            "kararmış özne (0,17 kazanç, γ = 2,0) ve neredeyse beyaza doymuş arka plan. Kolajlar portre kırpıntısının bilinen ölçeklerle "
            "yapıştırılmasıyla kurulduğundan referans kutular geometrik olarak kesindir.")
    figure(doc, FIG / "examples_normal_03.png", 16, "Şekil 1. Normal ışık örneği: iki dedektör × dört ön işleme (beyaz: referans, renkli: tahmin).")

    # ---------------- 3. Yöntem ----------------
    doc.add_heading("3. Yöntem", level=1)
    figure(doc, ROOT / "docs" / "akis_semasi.png", 16.5, "Şekil 2. İşlem akış şeması.")
    doc.add_heading("3.1 Görüntü iyileştirme", level=2)
    bullet(doc, " g(x,y) = clip(α·f(x,y) + β, 0, 255), α = 1,3 ve β = +20. Nokta işlemidir; 256 elemanlı bir arama tablosu ile uygulanır. Elle yazılmıştır.", "Parlaklık/kontrast:")
    bullet(doc, " Hazır fonksiyon kullanılmadan yazılmıştır (python/fd/enhance.py → equalize_channel_manual). Histogram h(k) sayılır, "
           "kümülatif dağılım CDF(k) alınır ve s_k = round((CDF(k) − CDF_min)/(N − CDF_min)·255) eşlemesi uygulanır. Renkli görüntüde "
           "işlem yalnızca YCrCb uzayının Y (parlaklık) kanalına uygulanır, Cr/Cb korunur. Doğrulama: elle yazılan fonksiyonun çıktısı "
           "cv2.equalizeHist ile piksel piksel aynıdır (maksimum fark 0).", "Histogram eşitleme (elle):")
    bullet(doc, " cv2.createCLAHE(clipLimit = 2,0, tileGridSize = 8×8), yalnız Y kanalında. Görüntü bloklara bölünür, her blok histogramı "
           "kırpılarak eşitlenir, blok sınırları çift doğrusal interpolasyonla birleştirilir. Web uygulamasında eğitim amaçlı elle yazılmış "
           "bir CLAHE sürümü de bulunmaktadır.", "CLAHE:")
    doc.add_heading("3.2 Klasik dedektör: Viola-Jones", level=2)
    doc.add_paragraph(
        "OpenCV'nin haarcascade_frontalface_default.xml modeli kullanılmıştır. Görüntü 0,2989R + 0,5870G + 0,1140B ağırlıklarıyla griye "
        "çevrilir. Integral görüntü sayesinde her Haar özelliği (kenar, çizgi, dörtlü dikdörtgen farkları) dört bellek okumasıyla hesaplanır; "
        "AdaBoost ile seçilen zayıf sınıflandırıcılar 25 aşamalı bir kaskad oluşturur. Pencere görüntü piramidi üzerinde kaydırılır "
        "(scaleFactor = 1,1, minSize = 24×24) ve en az minNeighbors = 5 komşusu olan adaylar birleştirilir.")
    doc.add_heading("3.3 Derin öğrenme dedektörü: YOLOv8n-face", level=2)
    d = res["detectors"]["yolo"]
    doc.add_paragraph(
        f"Model: {d['model']} ({d['kaynak']}). Genel “person” sınıfı değil, WIDER FACE üzerinde tek sınıf “face” için eğitilmiş bir modeldir. "
        "Görüntü en-boy oranı korunarak 640×640 tuvale yerleştirilir (letterbox, dolgu 114), 0–1 aralığına normalize edilip CHW tensöre "
        "çevrilir. Ağ 80×80, 40×40 ve 20×20 ızgaralarda toplam 8400 aday (cx, cy, w, h, skor) üretir; skoru 0,35'in altındaki adaylar elenir, "
        "kalanlara IoU eşiği 0,45 ile açgözlü NMS uygulanır ve kutular ters letterbox dönüşümüyle orijinal koordinatlara taşınır. "
        f"Çalışma zamanı: {d['runtime']}.")
    doc.add_heading("3.4 Değerlendirme", level=2)
    doc.add_paragraph(
        "Her görüntüde tüm (tahmin, referans) çiftlerinin IoU değeri hesaplanır; IoU ≥ 0,50 olan çiftler büyükten küçüğe sıralanıp, ikisi "
        "de kullanılmamışsa eşleştirilir (bire bir). Eşleşenler TP, eşleşmeyen tahminler FP, eşleşmeyen referanslar FN'dir. "
        "Precision = TP/(TP+FP), Recall = TP/(TP+FN), F1 = 2PR/(P+R). Görüntü başına mutlak sayma hatası |tahmin − gerçek| ve "
        "veri kümesi geneli MAE hesaplanır. TP/FP/FN değerleri veri kümesi genelinde toplanarak (mikro ortalama) P/R/F1 bulunur.")
    doc.add_paragraph(f"Süre ölçümü: {res['timing_note']} Makine: {res['machine']}.")

    # ---------------- 4. Ayarlar ----------------
    doc.add_heading("4. Deney ayarları", level=1)
    rows = [["Parlaklık/kontrast", "α = 1,3 ; β = +20"], ["Histogram eşitleme", "elle, Y kanalı"], ["CLAHE", "clipLimit 2,0 ; 8×8 ; Y kanalı"]]
    for k, v in res["detectors"].items():
        rows.append([DET[k], "; ".join(f"{a}={b}" for a, b in v.items() if a not in ("label",))])
    rows += [["Eşleştirme", "IoU ≥ 0,50, bire bir"], ["Rastgelelik", "demo veri tohumu 42; dedektörler deterministik"]]
    table(doc, ["Ayar", "Değer"], rows, widths=[4, 12.5], font=9)
    caption(doc, "Tablo 2. Tüm karşılaştırmalarda sabit tutulan ayarlar (görüntü başına eşik değişikliği yapılmamıştır).")

    # ---------------- 5. Sonuçlar ----------------
    doc.add_heading("5. Sonuçlar", level=1)
    doc.add_heading("5.1 Başlangıç (ham görüntü) sonuçları", level=2)
    rows = []
    for dk in DET:
        r = S[(dk, "original")]
        rows.append([DET[dk], r["gt"], r["pred"], r["tp"], r["fp"], r["fn"], f"{r['precision']:.3f}", f"{r['recall']:.3f}", f"{r['f1']:.3f}", f"{r['mae']:.2f}", f"{r['mean_inference_ms']:.1f}", f"{r['mean_end_to_end_ms']:.1f}"])
    table(doc, ["Dedektör", "GT", "Tahmin", "TP", "FP", "FN", "P", "R", "F1", "MAE", "Çıkarım ms", "Uçtan uca ms"], rows)
    caption(doc, "Tablo 3. Ham görüntülerde başlangıç sonuçları.")
    doc.add_heading("5.2 Kontrollü karşılaştırma (tüm veri kümesi)", level=2)
    rows = []
    for dk in DET:
        for ek in ENH:
            r = S[(dk, ek)]
            rows.append([DET[dk], ENH[ek], r["tp"], r["fp"], r["fn"], f"{r['precision']:.3f}", f"{r['recall']:.3f}", f"{r['f1']:.3f}", f"{r['mae']:.2f}", f"{r['mean_inference_ms']:.1f}", f"{r['mean_end_to_end_ms']:.1f}"])
    table(doc, ["Dedektör", "Ön işleme", "TP", "FP", "FN", "P", "R", "F1", "MAE", "Çıkarım ms", "Uçtan uca ms"], rows)
    caption(doc, "Tablo 4. İki dedektör × dört ön işleme.")
    figure(doc, FIG / "bar_f1.png", 14, "Şekil 3. Ön işlemeye göre F1.")
    figure(doc, FIG / "bar_mae.png", 14, "Şekil 4. Ön işlemeye göre sayma hatası (MAE).")
    doc.add_heading("5.3 Koşullara göre sonuçlar", level=2)
    rows = []
    for c in conds:
        for dk in DET:
            rows.append([COND.get(c, c), DET[dk]] + [f"{SC[(dk, ek, c)]['f1']:.2f} ({SC[(dk, ek, c)]['tp']}/{SC[(dk, ek, c)]['fp']}/{SC[(dk, ek, c)]['fn']})" for ek in ENH])
    table(doc, ["Koşul", "Dedektör"] + [ENH[e] for e in ENH], rows, font=8.5)
    caption(doc, "Tablo 5. Koşul × ön işleme F1 değerleri; parantez içinde TP/FP/FN.")
    figure(doc, FIG / "heatmap_f1.png", 16.5, "Şekil 5. Koşul × ön işleme F1 ısı haritası.")
    figure(doc, FIG / "examples_lowlight_05.png", 16.5, "Şekil 6. Düşük ışık örneği.")
    figure(doc, FIG / "examples_backlight_05.png", 16.5, "Şekil 7. Ters ışık örneği.")
    doc.add_heading("5.4 Görüntü bazında sonuçlar (ham ve CLAHE)", level=2)
    rows = []
    for r in res["per_image"]:
        if r["enhancement"] in ("original", "clahe"):
            rows.append([r["image"].replace("images/", ""), DET[r["detector"]], ENH[r["enhancement"]], r["gt_count"], r["pred_count"], r["tp"], r["fp"], r["fn"], r["abs_count_error"], f"{r['inference_ms']:.1f}"])
    table(doc, ["Görüntü", "Dedektör", "Ön işleme", "GT", "Tahmin", "TP", "FP", "FN", "|hata|", "ms"], rows, font=7.5)
    caption(doc, "Tablo 6. Görüntü bazında sonuçlar (tamamı: results/per_image.csv).")

    # ---------------- 6. Tartışma ----------------
    doc.add_heading("6. Tartışma: görsel olarak daha iyi görüntü = daha iyi tespit mi?", level=1)
    Q = {}
    for q in res["quality"]:
        Q.setdefault((q["enhancement"], q["condition"]), []).append(q)
    rows = []
    for c in conds:
        for ek in ENH:
            xs = Q[(ek, c)]
            rows.append([COND.get(c, c), ENH[ek], f"{sum(x['mean'] for x in xs) / len(xs):.1f}", f"{sum(x['std'] for x in xs) / len(xs):.1f}",
                         f"{sum(x['entropy'] for x in xs) / len(xs):.2f}", f"{SC[('viola_jones', ek, c)]['f1']:.2f}", f"{SC[('yolo', ek, c)]['f1']:.2f}"])
    table(doc, ["Koşul", "Ön işleme", "Ort. parlaklık μ", "Kontrast σ", "Entropi (bit)", "F1 VJ", "F1 YOLO"], rows, font=8.5)
    caption(doc, "Tablo 7. Görüntü istatistikleri ile tespit başarısı.")
    figure(doc, FIG / "entropy_vs_f1.png", 12, "Şekil 8. Ortalama entropi ile F1 ilişkisi.")
    figure(doc, FIG / "histograms_lowlight.png", 16, "Şekil 9. Düşük ışık görüntüsünde ön işlemlerin histogramlara etkisi.")
    ll = lambda dk, ek: SC[(dk, ek, "low_light")] if (dk, ek, "low_light") in SC else None
    nm = lambda dk, ek: SC[(dk, ek, "normal")] if (dk, ek, "normal") in SC else None
    txt = []
    if ll("viola_jones", "original"):
        txt.append(f"Düşük ışıkta Viola-Jones ham görüntüde {ll('viola_jones','original')['tp']}/{ll('viola_jones','original')['gt']} yüz bulurken, "
                   f"histogram eşitleme ile {ll('viola_jones','hist_eq')['tp']}, CLAHE ile {ll('viola_jones','clahe')['tp']} yüz bulmuştur. Haar özellikleri "
                   "dikdörtgen bölgeler arasındaki parlaklık farklarıdır; görüntü karardıkça bu farklar sıfıra yaklaşır ve kaskadın erken aşamaları "
                   "pencereleri reddeder. HE/CLAHE gri seviyeleri yaydığı için farkları yeniden büyütür.")
        txt.append(f"Parlaklık/kontrast ayarı (α=1,3, β=20) düşük ışıkta yetersiz kalmıştır (TP = {ll('viola_jones','brightness_contrast')['tp']}): "
                   "doğrusal dönüşüm karanlık histogramı yalnızca biraz kaydırır ve germe oranı sabittir; aynı zamanda gürültüyü de α kadar büyütür.")
    if nm("viola_jones", "clahe"):
        txt.append(f"Normal ışıkta ise Viola-Jones ham görüntüde FP = {nm('viola_jones','original')['fp']} iken histogram eşitlemede "
                   f"FP = {nm('viola_jones','hist_eq')['fp']}, CLAHE'de FP = {nm('viola_jones','clahe')['fp']} olmuştur. İyileştirme arka plandaki "
                   "dokuyu (giysi, desen, gürültü) güçlendirerek yüze benzeyen yeni parlaklık örüntüleri oluşturur. Yani görsel olarak daha "
                   "“canlı” ve kontrastlı görüntü, klasik dedektörde precision'ı düşürmüştür.")
    txt.append(f"YOLOv8n-face tüm koşul ve ön işlemelerde F1 ≈ {min(S[('yolo', e)]['f1'] for e in ENH):.2f}–{max(S[('yolo', e)]['f1'] for e in ENH):.2f} aralığında kalmıştır. "
               "Model WIDER FACE gibi aydınlatma, ölçek ve poz çeşitliliği yüksek bir veri kümesiyle ve parlaklık/kontrast veri artırmasıyla "
               "eğitildiğinden, iyileştirmenin sağladığı bilgi zaten öğrenilmiş öznitelikler içinde temsil edilmektedir. Ön işleme yalnızca "
               "işlem süresini artırmıştır.")
    txt.append("Sonuç: Görsel olarak daha iyi görünen görüntü her zaman daha yüksek tespit başarısı sağlamaz. Histogram eşitleme insan gözüne "
               "en yüksek kontrastı (σ) verir; ancak klasik dedektör için en iyi denge CLAHE'dedir ve iyileştirmenin faydası yalnızca "
               "başlangıçta kötü olan görüntülerde (düşük ışık, ters ışık) ortaya çıkar. İyi aydınlatılmış görüntülerde aynı işlem zarar verir. "
               "Derin öğrenme tabanlı dedektör için ise ön işleme neredeyse etkisizdir. Bu nedenle ön işleme dedektöre ve koşula göre "
               "seçilmeli; mümkünse koşul tespit edilerek (ör. ortalama parlaklık eşiği) yalnızca gerektiğinde uygulanmalıdır.")
    for t in txt:
        doc.add_paragraph(t)

    doc.add_heading("7. Başarısızlık analizi", level=1)
    for b, t in [
        ("Düşük ışık + Viola-Jones (FN): ", "Ortalama parlaklığın çok düşük olduğu görüntülerde Haar özellik değerleri kaskad eşiklerinin altında kalır; tüm yüzler kaçırılır."),
        ("Ters ışık + Viola-Jones (FN): ", "Parlak arka plan global histogramı domine eder; yüz bölgesi dar bir koyu gri aralığa sıkışır. Global HE parlak alanı genişletirken yüzü yeterince açamaz; yerel çalışan CLAHE bu durumda daha başarılıdır."),
        ("HE/CLAHE + normal ışık (FP): ", "Güçlendirilmiş doku ve gürültü yüze benzeyen pencereler üretir. minNeighbors artırılarak FP azaltılabilir ama bu, sabit ayar kuralı gereği deneyde yapılmamıştır."),
        ("Küçük yüzler: ", "Haar'ın en küçük penceresi 24×24 piksel olduğundan daha küçük yüzler prensip olarak bulunamaz; YOLO 640'a letterbox sonrası ~10 piksele kadar yüzleri bulabilir."),
        ("Eğik/profil yüzler: ", "frontalface kaskadı yalnız önden yüzler için eğitilmiştir; ~15°'den fazla dönük başlarda başarısı hızla düşer."),
    ]:
        bullet(doc, t, b)

    doc.add_heading("8. Sınırlılıklar", level=1)
    lims = ["Veri kümesi küçüktür (15 görüntü); sonuçlar istatistiksel olarak genellenemez, eğilim gösterir.",
            "Süre ölçümleri tek bir CPU'da yapılmıştır; donanıma göre değişir. Tarayıcıdaki süreler WASM (tek iş parçacığı) ile ölçülür ve Python'dan farklıdır.",
            "Ön işleme parametreleri (α, β, clipLimit) sabit seçilmiştir; görüntüye uyarlanmış (adaptif) seçim daha iyi sonuç verebilir.",
            "Referans kutuların sınırları etiketleyiciye göre birkaç piksel değişebilir; IoU 0,50 eşiği bu belirsizliği tolere eder."]
    if synthetic:
        lims.insert(0, "Raporlanan sayılar sentetik demo kümesine aittir: tüm yüzler aynı kişiye ait ve önden çekilmiştir; gerçek grup fotoğraflarında "
                       "poz, ifade, örtülme ve gerçek sensör gürültüsü nedeniyle her iki dedektörün başarısı daha düşük olacaktır.")
    for t in lims:
        bullet(doc, t)

    doc.add_heading("9. Yazılım mimarisi ve çalıştırma", level=1)
    doc.add_paragraph(
        "Deneyler Python 3.12 ile (python/run_experiments.py) yürütülür. Canlı gösterim için Next.js 16 (App Router, TypeScript) ile bir web "
        "uygulaması geliştirilmiştir. Tespit tarayıcıda WebAssembly ile yapılır: Viola-Jones için OpenCV.js 4.10, YOLO için ONNX Runtime Web "
        "ve aynı model dosyaları kullanılır. Bu sayede uygulama Vercel'de sunucu fonksiyonu gerektirmeden statik olarak çalışır, yüz "
        "görüntüleri kullanıcının cihazından çıkmaz ve Docker imajı tek bir küçük Node.js servisinden oluşur. Tarayıcıda yeniden çalıştırılan "
        "deneyin F1 değerleri Python sonuçlarıyla aynıdır. Uygulamanın sayfaları: Canlı Tespit (kamera/dosya, ön işleme zinciri, iki dedektör), "
        "Ders Laboratuvarı (her işlemin formülü ve canlı önce/sonra gösterimi), Deneyler, Etiketleme ve Yöntem.")
    for t in ["npm install && npm run dev  → http://localhost:3000",
              "docker compose up --build  → http://localhost:3000",
              "Vercel: depo içe aktarılır, framework Next.js, build komutu npm run build",
              "Deneyler: python -m venv .venv ; pip install -r python/requirements.txt ; cd python ; python run_experiments.py ; python make_report.py"]:
        bullet(doc, t)

    doc.add_heading("10. Etik ve yapay zekâ kullanımı", level=1)
    doc.add_paragraph("Görüntüler yalnızca grup üyelerinin bilgilendirilmiş onayıyla toplanmıştır; reşit olmayan kişi yoktur. Sistem yalnızca yüz "
                      "tespiti ve sayma yapar; yüz tanıma veya kimlik etiketleme yapılmamıştır. Kimliği belirlenebilir görüntüler herkese açık "
                      "olarak yayımlanmamıştır. Kodun ve dokümantasyonun önemli bir bölümü bir yapay zekâ kodlama asistanı (Anthropic Claude) "
                      "yardımıyla hazırlanmıştır; önceden eğitilmiş modeller ve kütüphaneler Kaynaklar bölümünde listelenmiştir. Grup üyeleri "
                      "sonuçların doğruluğundan ve açıklanmasından sorumludur.")

    doc.add_heading("Kaynaklar", level=1)
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

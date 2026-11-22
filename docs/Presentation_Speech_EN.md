# BM447 Face Detection — Presentation Speech (≈ 6 minutes)

> **Not (Türkçe):** Sunumda söylenecek metin aşağıdaki İngilizce bölümdür. Yalnızca proje, modeller ve sonuçlar anlatılır;
> ders konusu anlatımı ve site tanıtımı yoktur. Köşeli parantezli sayılar `[...]` şu anki **demo** veri kümesine aittir —
> grup fotoğraflarıyla deneyi yeniden çalıştırdıktan sonra `results/summary.csv` ve `results/summary_by_condition.csv`
> dosyalarından güncelleyin. En altta metnin Türkçe karşılığı var (anlamak ve prova için).

---

## 1. Opening — the question (≈ 40 s)

Good morning, professor. Our project is about face detection and people counting under difficult lighting.

We wanted to answer one question: **does an image that looks better to the human eye always give better face detection?**

To answer it, we compared a classical detector and a deep-learning detector on the same images, under three lighting
conditions, with and without image enhancement — and we measured everything with the same metrics.

## 2. Data (≈ 40 s)

Our dataset has **[15] images** with **[41] faces**, split into three conditions with five images each:
**normal light, low light and backlight**.

Every visible face was annotated with a ground-truth bounding box, and we recorded the true number of people in each
image. Both detectors were evaluated on exactly the same images and the same labels.

## 3. The two models (≈ 1 min 20 s)

**The first model is Viola-Jones**, using OpenCV's pretrained frontal-face Haar cascade.
It works on the grayscale image. It slides a window over an image pyramid and, at each position, computes Haar
features — brightness differences between neighbouring rectangles, for example "the eye region is darker than the
cheeks". Thanks to the integral image, each feature costs only four lookups. A cascade of 25 boosted stages rejects
background windows early, which makes it fast. Our fixed settings are: scale factor 1.1, minimum neighbours 5,
minimum face size 24 by 24 pixels.

**The second model is YOLOv8n-face** — a YOLOv8 nano network trained specifically for faces on the WIDER FACE dataset.
We did not use the generic "person" class. The image is letterboxed to 640 by 640, the network predicts 8,400
candidate boxes with a confidence score, we keep boxes above 0.35 confidence and remove duplicates with
non-maximum suppression at IoU 0.45.

The key difference: Viola-Jones relies on **hand-designed brightness differences**; YOLO relies on **features learned
from a very large and varied dataset**. We expected them to react to lighting very differently — and they did.

## 4. Enhancement and experimental setup (≈ 1 min)

We tested four versions of every image:

1. **Raw** — the baseline.
2. **Brightness and contrast** — g equals 1.3 times f plus 20.
3. **Histogram equalization** — which **we implemented ourselves**, without any library function: we compute the
   histogram, its cumulative distribution, and map every gray level through the normalized CDF. Our output is
   pixel-for-pixel identical to OpenCV's equalizeHist. We apply it only to the luminance channel so colors are preserved.
4. **CLAHE** — adaptive equalization on 8 by 8 tiles with clip limit 2.

All detector settings stayed **fixed** for every image — we never tuned a threshold per image.

For evaluation we matched predictions to ground truth **one-to-one at IoU 0.5**, and reported TP, FP, FN, precision,
recall, F1, the absolute counting error per image and the MAE over the dataset. We also measured inference time and
end-to-end time separately.

## 5. Results (≈ 1 min 30 s)

**YOLO first.** On raw images YOLO already reaches **F1 [1.00]** with **MAE [0]**, and it stays there for every
enhancement and every lighting condition. Enhancement did not help it — it only added processing time.

**Viola-Jones is the interesting case.** On raw images its F1 is only **[0.59]**: precision is perfect, but recall is
**[41]%** — it misses most faces. Almost all misses are in low light, where it found **[0 of 15]** faces, and in backlight.

- Brightness/contrast raised F1 to **[0.78]**, but it still found **[none]** of the low-light faces.
- Histogram equalization raised F1 to **[0.91]**.
- CLAHE gave the best result, **F1 [0.96]** and recall **[100]%**.

**But** — and this is our main finding — on the **normal-light** images the same enhancements made Viola-Jones
**worse**: CLAHE added **[3]** false positives and histogram equalization **[1]**, where the raw images had none.
Equalization amplifies background texture and noise, and Viola-Jones sees new face-like patterns in them.

On speed, Viola-Jones is faster: about **[42] ms** per image versus **[174] ms** for YOLO on our CPU — but adding
CLAHE roughly triples Viola-Jones' end-to-end time.

## 6. Answer to the research question (≈ 40 s)

So, does a visually better image always give better detection? **No.**

Histogram equalization produces the highest contrast — the image that "looks best" — but for Viola-Jones the best
detector result came from CLAHE, and on already well-lit images both equalizations **hurt** precision.
For YOLO, enhancement made **no difference at all**.

The benefit of enhancement depends on two things: **the detector** — hand-crafted features need it, learned features
don't — and **the starting condition of the image** — it helps dark and backlit images and harms good ones.
In practice this means enhancement should be applied **selectively**, for example only when the mean brightness is low.

## 7. Limitations and closing (≈ 30 s)

Our main limitation is the small dataset: [15] images show a clear tendency, but not a statistically general result.
The frontal Haar cascade also cannot handle profile faces or faces smaller than 24 pixels.

Thank you. We are happy to run the detectors live on any image you choose, or to change a parameter and show the effect.

---

## Prova notları

- Toplam ≈ 6 dk. Süre kısıtlıysa §4'teki CLAHE ve süre ölçümü cümlelerini kısaltın, §5 ve §6'yı **asla** kısaltmayın.
- Vurgulanacak 3 cümle: *"We implemented histogram equalization ourselves"*, *"settings stayed fixed"*, *"No — it depends on the detector and the starting condition."*
- Sayılar demo kümesinden; gerçek fotoğraflarla sonuçlar değişirse §5'teki yorumları da (özellikle YOLO'nun F1 = 1.00 olması) yeni sonuca göre düzeltin.
- Hoca canlı test isterse: Canlı Tespit sayfasında görüntüyü yükleyin, gerekirse istenen parametreyi değiştirin — açıklamayı modele bağlayın, siteyi tanıtmayın.

---

## Türkçe karşılığı (anlamak ve prova için)

**1. Açılış.** Projemiz zorlu ışıkta yüz tespiti ve kişi sayma üzerine. Tek bir soruya cevap aradık: *insan gözüne daha iyi görünen görüntü her zaman daha iyi tespit sağlar mı?* Bunun için aynı görüntülerde klasik ve derin öğrenme tabanlı iki dedektörü, üç ışık koşulunda, iyileştirmeli ve iyileştirmesiz karşılaştırdık.

**2. Veri.** [15] görüntü, [41] yüz; normal, düşük ve ters ışık için beşer görüntü. Her yüz referans kutuyla etiketlendi, gerçek kişi sayısı kaydedildi; iki dedektör aynı görüntü ve etiketlerle değerlendirildi.

**3. Modeller.** *Viola-Jones*: OpenCV'nin hazır ön yüz Haar kaskadı; gri görüntüde, piramit üzerinde pencere kaydırır, komşu dikdörtgenler arası parlaklık farklarını (Haar özellikleri) integral görüntüyle 4 okumada hesaplar; 25 aşamalı kaskad arka planı erken eler. Ayarlar: scaleFactor 1.1, minNeighbors 5, minSize 24×24. *YOLOv8n-face*: WIDER FACE'te yalnız yüz için eğitilmiş YOLOv8 nano; genel "person" sınıfı kullanılmadı. 640×640 letterbox, 8400 aday kutu, güven ≥ 0.35, NMS IoU 0.45. Temel fark: VJ elle tasarlanmış parlaklık farklarına, YOLO büyük ve çeşitli veriden öğrenilmiş özniteliklere dayanır.

**4. İyileştirme ve deney düzeni.** Dört sürüm: ham; parlaklık/kontrast (g = 1.3f + 20); kendimiz yazdığımız histogram eşitleme (histogram → CDF → LUT, OpenCV ile piksel piksel aynı, yalnız parlaklık kanalında); CLAHE (8×8 blok, clip 2). Ayarlar tüm görüntülerde sabit. Değerlendirme: IoU 0.5 ile bire bir eşleştirme; TP, FP, FN, precision, recall, F1, sayma hatası, MAE; çıkarım ve uçtan uca süre ayrı ölçüldü.

**5. Sonuçlar.** YOLO ham görüntüde F1 [1.00], MAE [0]; her koşulda ve her iyileştirmede aynı kaldı, iyileştirme sadece süreyi artırdı. Viola-Jones ham görüntüde F1 [0.59]: precision tam ama recall [%41]; kayıpların çoğu düşük ışıkta ([0/15]) ve ters ışıkta. Parlaklık/kontrast F1'i [0.78]'e çıkardı ama düşük ışıkta yine hiç yüz bulamadı; HE [0.91]; CLAHE en iyisi, F1 [0.96], recall [%100]. Ancak normal ışıkta aynı iyileştirmeler VJ'yi kötüleştirdi: CLAHE [3], HE [1] yanlış pozitif ekledi. Hız: VJ ≈ [42] ms, YOLO ≈ [174] ms; CLAHE eklenince VJ'nin uçtan uca süresi yaklaşık üç katına çıkıyor.

**6. Araştırma sorusunun cevabı.** Hayır. HE en yüksek kontrastı verir ama VJ için en iyi sonuç CLAHE'de; iyi aydınlatılmış görüntülerde her iki eşitleme de precision'ı düşürdü; YOLO'da hiç fark yaratmadı. İyileştirmenin faydası dedektöre (elle tasarlanmış öznitelikler ihtiyaç duyar, öğrenilmişler duymaz) ve görüntünün başlangıç durumuna (karanlıkta yardım eder, iyi görüntüde zarar verir) bağlıdır; bu yüzden seçici uygulanmalı, örneğin yalnız ortalama parlaklık düşükken.

**7. Sınırlılık ve kapanış.** Veri kümesi küçük; eğilim gösteriyor, istatistiksel genelleme değil. Ön yüz kaskadı profil yüzleri ve 24 pikselden küçük yüzleri bulamaz. Teşekkürler; istediğiniz bir görüntüde dedektörleri canlı çalıştırabilir veya bir parametreyi değiştirip etkisini gösterebiliriz.

# BM447 Yüz Tespiti Projesi — Sunum ve Savunma Rehberi

Bu doküman, projeyi hocaya (Prof. Dr. Pakize Erdoğmuş) sunarken ve bireysel sorulara cevap verirken kullanılmak üzere hazırlandı.
Her algoritmanın **ne** olduğunu, **neden** seçildiğini ve **kodda nerede** olduğunu anlatır; sonunda olası sorular ve hazır cevaplar var.

> Rubrikte en yüksek puan (5/20) **canlı gösterim ve bireysel savunma**. Her grup üyesi tüm hattı anlatabilmeli, kendi katkısını ayrıntılı açıklayabilmeli.

---

## 0. 5 dakikalık sunum akışı (önerilen)

| Süre | Ne gösterilir | Nerede |
|---|---|---|
| 0:00–0:40 | Amaç + araştırma sorusu, iki dedektör, üç koşul | Ana sayfa (`/`) |
| 0:40–1:30 | Akış şeması: görüntü → 4 ön işleme → gri/letterbox → VJ/YOLO → IoU → metrikler | `/yontem` veya `docs/akis_semasi.png` |
| 1:30–3:00 | **Canlı demo**: düşük ışık örneği seç → ham: VJ 0 yüz, YOLO hepsi → “CLAHE” ön ayarı → VJ yüzleri buluyor. Ardından normal ışık + HE → VJ'de yanlış pozitif. Kamera ile canlı mod. | `/tespit` |
| 3:00–4:00 | Sonuç tabloları, ısı haritası, “görsel olarak daha iyi ≠ daha iyi tespit” | `/deneyler` |
| 4:00–5:00 | Elle yazılan histogram eşitleme: CDF → LUT, `cv2.equalizeHist` ile fark 0. Laboratuvar'dan bir ders (ör. Viola-Jones ham adaylar veya YOLO NMS öncesi/sonrası) | `/laboratuvar#histogram`, `#vj`, `#yolo` |

Demo öncesi kontrol: `npm run build && npm start` (veya `docker compose up`) ile çalıştırın, sayfayı bir kez açıp modellerin yüklendiğini (✓ işaretleri) görün; internet bağlantısı gerekmez (modeller sunucudan servis edilir).

---

## 1. Projenin özeti (ezber cümle)

> “Aydınlatmanın ve görüntü iyileştirmenin yüz tespitine etkisini ölçtük. Klasik Viola-Jones ile yüz için eğitilmiş YOLOv8n-face modelini; normal, düşük ve ters ışıkta, ham / parlaklık-kontrast / histogram eşitleme / CLAHE ön işlemleriyle, aynı veri ve sabit ayarlarla karşılaştırdık. IoU ≥ 0,5 ile bire bir eşleştirip TP, FP, FN, precision, recall, F1, sayma hatası, MAE ve süreleri raporladık. Sonuç: iyileştirme klasik dedektörü karanlıkta kurtarıyor ama iyi ışıkta yanlış pozitif ekliyor; YOLO ise neredeyse etkilenmiyor. Yani görsel olarak daha iyi görüntü her zaman daha iyi tespit demek değil.”

Demo veri kümesindeki sayılar (grup fotoğraflarıyla yeniden üretildiğinde değişecek — sunumdan önce `results/summary.csv`'den güncelleyin):

| Dedektör | Ham F1 | P/K F1 | HE F1 | CLAHE F1 |
|---|---|---|---|---|
| Viola-Jones | 0,586 (recall 0,41) | 0,776 | 0,909 | 0,965 (3 FP) |
| YOLOv8n-face | 1,000 | 1,000 | 1,000 | 1,000 |

---

## 2. Hattın her adımı: ne, neden, nerede

### 2.1 Görüntü toplama ve etiketleme
* **Ne:** ≥15 görüntü; normal, düşük ışık, ters ışık için ≥5'er. Her görünen yüze `[x, y, w, h]` kutu + gerçek sayı.
* **Nasıl:** Web'deki **Etiketleme** aracı (`/etiketleme`): fareyle sürükle-bırak, koşul seçimi, koşul sayaçları, `annotations.json` dışa aktarma. “YOLO ile öner” yalnız hız içindir; her kutu elle kontrol edilmeli, yoksa referans YOLO'ya yanlı olur.
* **Etiketleme kuralı:** Alın/saç çizgisinden çeneye, yanaktan yanağa; kısmen örtülü ama görünen yüz de etiketlenir.
* **Kod:** `app/etiketleme/Annotator.tsx`, veri: `dataset/annotations.json`.

### 2.2 Dijital görüntü temelleri (Laboratuvar 1–2)
* Görüntü = `f(x, y)` matrisi; 8 bit → 0–255. Örnekleme (çözünürlük) ve nicemleme (bit derinliği).
* **Gri dönüşüm:** `Y = 0,2989R + 0,5870G + 0,1140B` (MATLAB `rgb2gray`, BT.601). Göz yeşile en duyarlı olduğu için G ağırlığı en büyük. Ortalama `(R+G+B)/3` bu duyarlılığı yok sayar.
* **Neden önemli:** Haar yalnız gri görüntüde çalışır (parlaklık farkları). YOLO RGB kullanır.
* **Kod:** `python/fd/enhance.py → to_gray_manual`, `lib/imgproc.ts → toGray`.

### 2.3 Geometrik dönüşümler ve interpolasyon (Laboratuvar 3)
* Döndürme/ölçekleme/öteleme tek bir 2×3 **afin matris**: `x' = s·cosθ·x − s·sinθ·y + tx`, `y' = s·sinθ·x + s·cosθ·y + ty`.
* **Ters eşleme (backward mapping):** çıktıdaki her piksel için kaynaktaki konum `M⁻¹` ile bulunur → delik oluşmaz. İleri eşlemede çıktıda boşluklar kalır.
* **Interpolasyon:** en yakın komşu (hızlı, bloklu) vs. çift doğrusal (4 komşunun ağırlıklı ortalaması: `(1−a)(1−b)f00 + a(1−b)f10 + (1−a)b f01 + ab f11`).
* Döndürüp geri döndürünce PSNR düşer → interpolasyon bilgi kaybettirir (Laboratuvar'da canlı gösterilir).
* **Projeyle ilişkisi:** YOLO'nun *letterbox* adımı bir ölçekleme + öteleme dönüşümüdür (çift doğrusal yeniden boyutlandırma). Haar frontal yüz için eğitildiğinden ~15°'den fazla eğik başlarda başarısız olur.
* **Kod:** `lib/imgproc.ts → affine, rotationMatrix, resize`.

### 2.4 Parlaklık / kontrast (1. iyileştirme — elle yazıldı)
* `g = clip(α·f + β, 0, 255)`, **α = 1,3, β = +20** (tüm görüntülerde sabit).
* α > 1 histogramı **yayar** (kontrast), β histogramı **kaydırır** (parlaklık). 0/255'e doyan pikseller geri dönmez bilgi kaybıdır.
* Nokta işlemi → 256 elemanlı LUT ile uygulanır.
* **Gözlem:** Düşük ışıkta yetersiz (yüzleri yeterince açmaz, gürültüyü α kadar büyütür); ters ışıkta parlak arka planı doyurur.

### 2.5 Histogram eşitleme (2. iyileştirme — hazır fonksiyon olmadan yazıldı)
Bu, ödevdeki “en az bir algoritmayı kendiniz yazın” maddesidir. **Her grup üyesi bunu tahtada yazabilmeli.**

```text
1) h(k)  = k gri seviyesindeki piksel sayısı          (k = 0..255)
2) CDF(k) = h(0) + h(1) + ... + h(k)
3) s_k   = round( (CDF(k) − CDF_min) / (N − CDF_min) · 255 )   → LUT
4) g(x,y) = LUT[ f(x,y) ]
```

Python (`python/fd/enhance.py`):

```python
h = np.zeros(256, np.int64); np.add.at(h, channel.ravel(), 1)   # histogram (np.histogram yok)
cdf = np.cumsum(h)
cdf_min = cdf[cdf > 0][0]
lut = np.rint((cdf - cdf_min) / (N - cdf_min) * 255).astype(np.uint8)
out = lut[channel]
```

* **Renkli görüntüde:** RGB → YCrCb, yalnız **Y** eşitlenir, Cr/Cb korunur → renk tonu bozulmaz, YOLO renkli girdi almaya devam eder.
* **Doğrulama:** Elle yazılan fonksiyon `cv2.equalizeHist` ile **piksel piksel aynı** (maksimum fark 0). Ayrıca TypeScript sürümü de aynı sonucu verdiği için tarayıcıda yeniden çalıştırılan deneyin F1'i Python ile birebir eşit çıktı.
* **CDF_min neden çıkarılıyor?** En koyu mevcut seviye 0'a eşlensin, tüm aralık kullanılsın diye (Gonzalez & Woods tanımı; OpenCV de böyle yapar).
* **Entropi:** Eşitleme seviyeleri birleştirebilir, yeni seviye yaratmaz → entropi artmaz. “Daha zengin görünür” ama yeni bilgi eklemez.

### 2.6 CLAHE (3. iyileştirme)
* Global HE tüm görüntüye **tek** LUT uygular; parlak arka plan histogramı domine ederse yüz açılmaz.
* **CLAHE:** görüntüyü 8×8 bloğa böl → her bloğun histogramını `clipLimit · N_blok / 256` seviyesinde **kırp** (kontrast kazancını, dolayısıyla gürültü güçlendirmeyi sınırlar) → taşan sayımı eşit dağıt → blok başına LUT → piksel değerini en yakın 4 bloğun LUT'unun **çift doğrusal** ağırlıklı ortalamasıyla bul (blok kenarı izi olmaz).
* Ayarlar: **clipLimit = 2,0, tileGridSize = 8×8**, Y kanalında.
* Deneyde OpenCV `createCLAHE` kullanıldı (Python ile web aynı sonucu versin diye); web'de eğitim amaçlı elle yazılmış CLAHE de var (`lib/imgproc.ts → claheGray`).

### 2.7 Konvolüsyon ve filtreler (Laboratuvar 7)
* Konvolüsyon: `g = Σ h(i,j)·f(x−i, y−j)`; korelasyon: `f(x+i, y+j)`. Konvolüsyon = çekirdeği 180° çevirip korelasyon. Simetrik çekirdekte aynıdır. (CNN kütüphaneleri aslında korelasyon yapar ama “convolution” der.)
* Ortalama (bulanıklaştırır), Gauss (σ, daha doğal), medyan (doğrusal değil, tuz-biberde en iyi, kenar korur), keskinleştirme.
* **Projeyle ilişkisi:** Düşük ışıkta gürültü artar, HE/CLAHE onu da büyütür. YOLO'nun kendisi üst üste konvolüsyon katmanlarıdır.

### 2.8 Kenar tespiti (Laboratuvar 8)
* Sobel `Gx = [−1 0 1; −2 0 2; −1 0 1]`, `|G| = √(Gx² + Gy²)`; Prewitt merkeze ağırlık vermez. Otsu: sınıflar arası varyansı en büyükleyen eşik.
* **Projeyle ilişkisi:** Haar özellikleri kaba, ölçeklenebilir kenar/çizgi dedektörleridir; YOLO'nun ilk katmanları Sobel benzeri filtreler öğrenir.

### 2.9 Viola-Jones (klasik dedektör)
Dört fikir:
1. **Haar özellikleri:** siyah ve beyaz dikdörtgenlerin piksel toplamları farkı (kenar, çizgi, dörtlü). Göz bandı yanaklardan, gözler burun kemerinden koyudur. 24×24 pencerede ~160.000 olası özellik.
2. **İntegral görüntü:** `ii(x,y) = Σ_{x'≤x, y'≤y} i(x',y')`. Herhangi bir dikdörtgenin toplamı **4 okuma**: `D − B − C + A` → özellik hesabı boyuttan bağımsız O(1).
3. **AdaBoost:** her biri tek özellik + eşik olan zayıf sınıflandırıcılardan en ayırt edicileri seçer, ağırlıklandırır.
4. **Kaskad:** 25 aşama; ilk aşamalar birkaç özellikle arka planın çoğunu hemen eler → gerçek zamanlı hız.

Tarama: pencere kaydırılır, görüntü her adımda `scaleFactor = 1,1` küçültülür (piramit). Aynı yüz için çok sayıda örtüşen aday çıkar; `minNeighbors = 5` en az 5 komşusu olan grupları tutar. `minSize = 24×24`.
**Laboratuvar 9**'da `minNeighbors = 0` ile tüm ham aday pencereler (turuncu) ve gruplama sonrası son tespitler (yeşil) gösterilir — sunumda çok etkili.

* **Model:** `haarcascade_frontalface_default.xml` (OpenCV, Lienhart). Eğitim gerekmedi (ödev izin veriyor).
* **Neden düşük ışıkta başarısız?** Özellikler parlaklık *farkları*; karanlıkta farklar sıfıra yaklaşır, aşama eşiklerini geçemez → FN. HE/CLAHE farkları büyütür → recall artar.
* **Neden HE ile FP?** Güçlenen doku ve gürültü yüze benzeyen fark örüntüleri üretir.
* **Kod:** `python/fd/detectors.py → HaarDetector`, `lib/detectors.ts → detectHaar` (OpenCV.js).

### 2.10 YOLOv8n-face (derin öğrenme dedektörü)
* **Model:** `yolov8n-face-lindevs.onnx`, release 1.0.1, <https://github.com/lindevs/yolov8-face>. Ultralytics YOLOv8n mimarisi, **WIDER FACE** veri kümesinde **tek sınıf “face”** için eğitilmiş (genel COCO “person” sınıfı değil — ödev bunu özellikle yasaklıyor). ~3 M parametre, 12 MB.
* **Ön işleme:** letterbox (en-boy oranı korunarak 640×640, dolgu 114), /255, HWC → CHW, tensör `[1, 3, 640, 640]`.
* **Ağ:** CSPDarknet omurga + PAN boyun + anchor-free ayrık (decoupled) baş. 3 ölçek: adım 8/16/32 → 80×80 + 40×40 + 20×20 = **8400 aday**, her biri `(cx, cy, w, h, skor)` → çıktı `[1, 5, 8400]`.
* **Son işleme:** skor ≥ **0,35** → **NMS** (IoU ≥ **0,45** olan daha düşük skorlu kutuları sil) → ters letterbox: `x = (x' − pad_x) / r`.
* **Neden ön işlemeye duyarsız?** WIDER FACE çok çeşitli ışık/ölçek/poz içerir ve eğitimde HSV/parlaklık veri artırması (augmentation) kullanılır; ağ zaten aydınlatmaya karşı değişmez öznitelikler öğrenmiştir.
* **Kod:** `python/fd/detectors.py → YoloFaceDetector` (onnxruntime), `lib/detectors.ts → detectYolo` (onnxruntime-web). NMS ve letterbox elle yazıldı.

### 2.11 Değerlendirme
* `IoU = |A ∩ B| / |A ∪ B|`, eşik **0,50**.
* **Bire bir eşleştirme (açgözlü):** tüm çiftlerin IoU'su hesaplanır, ≥ 0,5 olanlar büyükten küçüğe sıralanır, ikisi de boştaysa eşlenir. Aynı yüze iki kutu → 1 TP + 1 FP.
* `P = TP/(TP+FP)`, `R = TP/(TP+FN)`, `F1 = 2PR/(P+R)`; **mikro ortalama** (TP/FP/FN veri kümesi genelinde toplanıp hesaplanır).
* **Sayma hatası:** `|tahmin − gerçek|`, **MAE** = görüntülerin ortalaması. Sayı doğru olsa da kutular yanlış yerde olabilir → bu yüzden F1 + MAE birlikte.
* **Süre:** `inference_ms` = yalnız model çağrısı (`detectMultiScale` / `session.run`); `end_to_end_ms` = ön işleme + gri/letterbox + model + NMS. Her ölçümden önce 1 ısınma çalıştırması; CPU.
* **Kod:** `python/fd/metrics.py`, `lib/metrics.ts`.

### 2.12 Mimari ve dağıtım
* **Python hattı** (deney, tablo, şekil, Word raporu) + **Next.js web uygulaması** (canlı demo).
* Web'de tespit **tarayıcıda WebAssembly** ile: OpenCV.js (Haar + CLAHE) ve ONNX Runtime Web (YOLO). Aynı model dosyaları.
* **Neden?** (1) Vercel sunucusuz fonksiyonları OpenCV + modeller için boyut/soğuk başlangıç sınırına takılır; tarayıcıda çalışınca site statik. (2) Gizlilik: yüz görüntüsü cihazdan çıkmaz. (3) Docker imajı tek küçük Node servisi.
* **Docker:** çok aşamalı (deps → builder → runner), `output: "standalone"`, root olmayan kullanıcı, healthcheck. `docker compose up --build`. İsteğe bağlı `experiments` servisi Python deneyini konteynerde çalıştırır.
* **Vercel:** depo içe aktar → Next.js otomatik → `npm run build` (prebuild modelleri `public/`'e kopyalar).

---

## 3. Olası hoca soruları ve hazır cevaplar

### Genel / yöntem
**S1. Projenin amacı ne, araştırma sorusuna cevabınız ne?**
Aydınlatma ve iyileştirmenin tespit başarısına etkisini nicel olarak ölçmek. Cevap: Hayır, görsel olarak daha iyi görünen görüntü her zaman daha iyi tespit sağlamaz. HE görüntüyü insan gözüne en kontrastlı gösterir ama VJ'de normal ışıkta FP artırır; YOLO'da etkisizdir. Fayda yalnız başlangıçta kötü görüntülerde (karanlık/ters ışık) ve klasik dedektörde görülür.

**S2. Neden iki farklı dedektör?**
Ödev şartı; ayrıca iki farklı paradigmayı karşılaştırmak: el yapımı özellik + boosting (VJ) ile veriden öğrenilmiş CNN özellikleri (YOLO). Ön işlemenin etkisi bu ikisinde çok farklı çıkıyor — çalışmanın ana bulgusu bu.

**S3. YOLO'nun “person” sınıfını neden kullanmadınız?**
Ödev açıkça yasaklıyor ve mantıksal olarak da yanlış: person kutusu tüm vücudu kapsar, yüz kutusuyla IoU ≥ 0,5 sağlamaz; arkası dönük kişiyi de sayar. Biz WIDER FACE üzerinde tek sınıf “face” için eğitilmiş YOLOv8n-face kullandık.

**S4. Modelleri siz mi eğittiniz?**
Hayır, ödev önceden eğitilmiş model kullanımına izin veriyor. Haar: OpenCV'nin hazır kaskadı. YOLO: lindevs/yolov8-face release 1.0.1 (WIDER FACE). Sürüm ve kaynaklar README'de.

**S5. Hangi algoritmayı kendiniz yazdınız?**
Histogram eşitleme (histogram, CDF, LUT) — hazır fonksiyon yok, `cv2.equalizeHist` ile fark 0. Ayrıca parlaklık/kontrast, gri dönüşüm, YCrCb dönüşümü, IoU, eşleştirme, NMS, letterbox; web'de CLAHE, afin dönüşüm, interpolasyon, konvolüsyon, medyan, Sobel, Otsu, integral görüntü hepsi elle (`lib/imgproc.ts`).

**S6. Histogram eşitlemeyi tahtada yazar mısın?** → §2.5'teki 4 adım ve kod. Örnek: 4 piksel `[50, 50, 100, 200]` → h(50)=2, h(100)=1, h(200)=1; CDF: 50→2, 100→3, 200→4; CDF_min=2, N=4 → s(50)=0, s(100)=round(1/2·255)=128, s(200)=255.

**S7. HE ile CLAHE farkı?**
HE global tek LUT; CLAHE bloklara bölüp her bloğa kırpılmış histogramla ayrı LUT uygular ve blokları çift doğrusal birleştirir. Kırpma, düz bölgelerde gürültünün aşırı büyümesini engeller. Ters ışıkta parlak arka plan global histogramı domine ettiği için CLAHE yüzü daha iyi açar.

**S8. clipLimit'i artırırsak ne olur?**
Kırpma azalır → davranış global HE'ye yaklaşır, kontrast ve gürültü artar. Çok küçük clipLimit → neredeyse değişiklik yok. Blok sayısı artarsa daha yerel ama blok başına piksel azalır, histogram güvenilmezleşir. (Canlı Tespit/Laboratuvar'da kaydırıcıyla gösterilebilir.)

**S9. Renkli görüntüde HE'yi nasıl uyguladınız? Her kanala ayrı uygulasaydınız?**
YCrCb'ye çevirip yalnız Y'yi eşitledik. R, G, B'ye ayrı ayrı uygulamak kanal oranlarını bozar → renk kayması (ten rengi değişir), YOLO için dağılım kayması.

**S10. Parlaklık/kontrast için α, β'yi nasıl seçtiniz? Neden görüntüye göre değiştirmediniz?**
Tüm veri kümesi için makul tek bir değer (α = 1,3, β = 20) seçip sabit tuttuk; ödev görüntü başına eşik/ayar değiştirmeyi yasaklıyor, aksi hâlde karşılaştırma adil olmaz (test verisine uyum = veri sızıntısı).

### Viola-Jones
**S11. Viola-Jones nasıl çalışır?** → §2.9: Haar özellikleri, integral görüntü, AdaBoost, kaskad, çok ölçekli tarama, minNeighbors gruplaması.

**S12. İntegral görüntü neden gerekli?**
Her pencerede binlerce dikdörtgen toplamı gerekir; doğrudan toplasak pencere boyutuyla orantılı maliyet olurdu. İntegral görüntüyle her dikdörtgen 4 okumada → ölçekten bağımsız sabit süre. Görüntüyü küçültmek yerine özellikleri büyütmek de bu sayede ucuz.

**S13. scaleFactor ve minNeighbors ne yapar? Değiştirirsek?**
scaleFactor piramit adımı: küçük (1,05) → daha çok ölçek, daha yavaş, daha çok aday (recall↑, FP↑); büyük (1,3) → hızlı ama bazı yüz boyutları atlanır. minNeighbors: küçük → daha çok FP, büyük → daha çok FN. Canlı Tespit'te “Dedektör parametreleri” panelinden anında gösterebiliriz.

**S14. Viola-Jones neden gri görüntü kullanır?**
Özellikleri parlaklık farkıdır; renk bilgisi kullanılmadan eğitilmiştir. Gri dönüşüm boyutu 3'ten 1'e indirir ve aydınlatma rengine daha az duyarlıdır.

**S15. Viola-Jones neden profil/eğik yüzde başarısız?**
`frontalface` kaskadı önden yüzlerle eğitildi; özellikler eksen hizalı dikdörtgenler, dönmeye değişmez değil. Profil için ayrı kaskad (`haarcascade_profileface.xml`) gerekir.

### YOLO
**S16. YOLO nasıl çalışır?** → §2.10: letterbox, CNN, 3 ölçekte 8400 aday, skor eşiği, NMS, ters dönüşüm.

**S17. NMS nedir, neden gerekli?**
Aynı yüz için komşu hücrelerden birçok yüksek skorlu kutu gelir. NMS: en yüksek skorluyu tut, onunla IoU ≥ 0,45 olanları sil, tekrarla. Olmasaydı bir yüz birden çok kez sayılır → FP ve sayma hatası. Laboratuvar 10'da NMS öncesi/sonrası kutular gösteriliyor.

**S18. Letterbox neden? Doğrudan 640×640'a sündürseydik?**
Sündürme en-boy oranını bozar, yüzler basık/uzun olur, eğitim dağılımından sapar. Letterbox oranı korur, eğitimdeki ön işlemeyle aynıdır. Kutuları geri taşırken `(x − pad)/r` uygulanır.

**S19. Güven eşiğini 0,35 seçtiniz, değiştirirsek?**
Düşürmek (0,1) → recall↑, FP↑; yükseltmek (0,7) → precision↑, küçük/karanlık yüzlerde FN↑. Sabit tuttuk; savunmada değiştirilip etkisi canlı gösterilebilir.

**S20. YOLO neden ön işlemeden etkilenmiyor?**
WIDER FACE çok çeşitli aydınlatma içerir ve eğitimde parlaklık/HSV artırması yapılır; ağ aydınlatmaya karşı değişmez öznitelikler öğrenir. İyileştirme yeni bilgi eklemez, yalnızca var olanı yeniden dağıtır — ağ bunu zaten içsel olarak yapabilir. Aşırı gürültü büyütme ise eğitim dağılımından uzaklaştırıp zarar bile verebilir.

**S21. YOLO daha yavaş, neden yine de tercih edilir?**
Daha doğru ve sağlam (karanlık, ters ışık, küçük ve eğik yüz). VJ ham görüntüde daha hızlı ama ön işleme eklenince fark kapanır. GPU'da YOLO gerçek zamanlıdır.

### Değerlendirme
**S22. IoU eşiği neden 0,50?** Ödevin belirttiği ve PASCAL VOC'nin standart eşiği. Etiketleme sınırlarındaki birkaç piksellik belirsizliği tolere eder.

**S23. Bire bir eşleştirme nasıl yapıldı?** → §2.11. Aynı GT'ye iki tahmin eşlenemez.

**S24. Precision ile recall farkı? Hangisi bu projede daha önemli?**
Precision: bulduklarımın ne kadarı doğru. Recall: gerçek yüzlerin ne kadarını buldum. Kişi saymada ikisi de önemli; F1 dengesini, MAE sayma doğruluğunu ölçer.

**S25. MAE düşükken F1 düşük olabilir mi?**
Evet: dedektör 3 yüzlük görüntüde 3 kutu çizer ama ikisi yanlış yerdeyse sayma hatası 0, F1 düşüktür. Bu yüzden ikisini birlikte raporladık.

**S26. Süreyi nasıl ölçtünüz?**
`time.perf_counter()` (Python) / `performance.now()` (tarayıcı). Çıkarım = yalnız model çağrısı; uçtan uca = ön işleme + model + son işleme. Isınma çalıştırması sonrası, CPU. Raporda hangi sürenin ölçüldüğü açıkça yazıyor.

### Sonuçlar ve başarısızlıklar
**S27. VJ'nin en çok başarısız olduğu durum ve sebebi?**
Düşük ışık ham görüntü: tüm yüzler kaçırıldı (FN). Ortalama parlaklık çok düşük, Haar farkları kaskad eşiklerinin altında. Ters ışıkta da kısmen (parlak arka plan).

**S28. HE neden bazı durumlarda tespiti kötüleştirdi?**
Normal ışıkta zaten yeterli kontrast var; HE arka plan dokusunu ve gürültüyü güçlendirip yüze benzeyen fark örüntüleri üretti → FP. Ters ışıkta global HE parlak arka plana takılır, yüzü yeterince açmaz.

**S29. Gerçek grup fotoğraflarında sonuçlar neden farklı olabilir?** (Demo küme sorulursa)
Demo küme pipeline'ı doğrulamak için sentetikti: aynı yüz, önden, temiz. Gerçek fotoğraflarda poz, ifade, gözlük/saç örtmesi, gerçek sensör gürültüsü, hareket bulanıklığı → iki dedektörde de düşüş, özellikle VJ'de.

**S30. Sonuçları iyileştirmek için ne yapardınız?**
Koşula duyarlı ön işleme (ortalama parlaklık eşiğinin altındaysa CLAHE uygula, değilse uygulama); CLAHE öncesi gürültü azaltma (bilateral/Gauss); VJ için profil kaskadı ekleme; YOLO için daha büyük model (s/m) veya test-time augmentation; birden çok dedektörün birleştirilmesi.

### Uygulama, dağıtım, etik
**S31. Web uygulamasında tespit nerede çalışıyor?**
Tarayıcıda, WebAssembly ile. OpenCV.js Haar + CLAHE, ONNX Runtime Web YOLO. Sunucuya görüntü gitmez. Python ile aynı model dosyaları; tarayıcıda yeniden çalıştırılan deneyin F1'i Python ile birebir aynı.

**S32. Neden Python sunucusu yazmadınız?**
Vercel'in sunucusuz Python fonksiyonları OpenCV + ONNX + model ağırlığı için boyut ve soğuk başlangıç sınırlarına takılır; ayrıca yüz görüntülerini sunucuya göndermek gizlilik riski. Tarayıcıda çalışınca site statik, ücretsiz katmanda bile hızlı, Docker imajı tek küçük servis.

**S33. Docker imajı nasıl kurulu?**
Çok aşamalı: (1) `npm ci`, (2) `npm run build` (prebuild modelleri ve WASM'ı `public/`'e kopyalar, Next standalone çıktı üretir), (3) yalnız `.next/standalone`, `.next/static`, `public` alınan küçük `node:22-alpine` imajı, root olmayan kullanıcı, `node server.js`, healthcheck. `docker compose up --build`.

**S34. Vercel'e nasıl dağıtılır?**
Depo GitHub'a → vercel.com/new → içe aktar → Next.js otomatik algılanır → `npm run build` → deploy. Ortam değişkeni yok. Kamera için HTTPS gerekir (Vercel varsayılanı).

**S35. Etik olarak neye dikkat ettiniz?**
Onaylı fotoğraf, reşit olmayan yok, yüz tanıma/kimlik etiketleme yok (yalnız tespit ve sayma), kimliği belirlenebilir görüntüler herkese açık sürümde yayımlanmıyor, görüntüler tarayıcıdan çıkmıyor.

**S36. Yapay zekâ kullandınız mı?**
Evet, kod ve dokümantasyonda bir YZ kodlama asistanından (Claude) önemli ölçüde yararlanıldı ve README/raporda beyan edildi. Her algoritmayı anladığımızı Laboratuvar sayfası ve bu rehberle gösterebiliyoruz; sonuçların doğruluğundan biz sorumluyuz. (**Dürüst olun**: hangi kısımları kendiniz kontrol ettiğinizi/değiştirdiğinizi söyleyin.)

### Hocanın canlı isteyebileceği şeyler
| İstek | Nasıl gösterilir |
|---|---|
| “Görmediğim bir görüntüde dene” | `/tespit` → dosya yükle veya kamera → Tespit Et |
| “minNeighbors'ı 3 yap” / “conf'u 0,6 yap” | `/tespit` → Dedektör parametreleri → değeri gir → Tespit Et (karşılaştırma sabit ayarla yapıldı, bu yalnız gösterim) |
| “CLAHE clipLimit'i değiştir” | `/tespit` → CLAHE aç → clip kaydırıcısı; ön işleme adım adım panelinde histogram değişir |
| “Histogram eşitlemenin kodunu göster” | `python/fd/enhance.py → equalize_channel_manual` ve `/laboratuvar#histogram` |
| “Bir görüntüyü 30° döndürüp dene” | `/laboratuvar#geometri` (kavram) → döndürülmüş görüntüyü kaydedip `/tespit`'e yükle |
| “Deneyi yeniden çalıştır” | `/deneyler` → “Demo veri kümesiyle çalıştır” (tarayıcıda, ~1 dk) veya `python run_experiments.py` |

---

## 4. Bireysel katkı şablonu (her üye kendi kısmını doldursun)

| Üye | Sorumlu olduğu kısım | Savunmada anlatacağı |
|---|---|---|
| Üye 1 | Veri toplama, etiketleme, metrikler | §2.1, §2.11, S22–S26 |
| Üye 2 | Ön işleme (elle HE), CLAHE | §2.4–2.6, S5–S10 |
| Üye 3 | Viola-Jones, YOLO entegrasyonu | §2.9–2.10, S11–S21 |
| Üye 4 | Web uygulaması, Docker/Vercel, rapor | §2.12, S31–S36 |

Herkes ayrıca §1 özet cümlesini ve araştırma sorusunun cevabını bilmeli.

---

## 5. Teslim öncesi kontrol

1. Grup fotoğraflarını çekin (onay alın), `/etiketleme` ile etiketleyin, `dataset/`'e koyun.
2. `cd python && python run_experiments.py && python make_report.py` → `results/` ve `docs/BM447_Yuz_Tespiti_Raporu.docx` güncellenir. `make_report.py` içindeki `GROUP` listesine ad/numara/katkı yazın.
3. Bu rehberdeki sayıları (§1 tablo) yeni `results/summary.csv`'ye göre güncelleyin.
4. Klasörü `Proje1_No1_No2_No3` olarak adlandırın; `node_modules`, `.next`, `.venv` hariç zip'leyin; **tek kişi, tek sefer** yükleyin.
5. Son tarih: **24.11.2026 08:00** (akademik.duzce.edu.tr).

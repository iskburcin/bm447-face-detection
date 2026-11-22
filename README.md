# YüzLab — Zorlu Görüntüleme Koşullarında Yüz Tespiti ve Kişi Sayma

**BM447 Sayısal Görüntü İşleme · Düzce Üniversitesi · Prof. Dr. Pakize Erdoğmuş**
Klasik yöntem (Viola-Jones / Haar Cascade) ile önceden eğitilmiş YOLO yüz modeli (YOLOv8n-face) karşılaştırması.

**Live demo:** <https://iskburcin.github.io/bm447-face-detection/> · the site has a **TR / EN** language switch in the header.

<details>
<summary><b>English summary</b></summary>

**YüzLab** studies how lighting and image enhancement affect face detection. It compares the classical
**Viola-Jones (Haar cascade)** detector with a pretrained **YOLOv8n-face** model (WIDER FACE) on normal, low-light
and backlit images, each processed four ways: raw, brightness/contrast, **hand-written histogram equalization** and
CLAHE. Detections are matched to ground truth one-to-one at IoU ≥ 0.5 and reported as TP/FP/FN, precision, recall,
F1, per-image count error, MAE and timing.

* **Web app** (Next.js 16, TypeScript): everything runs **in the browser** via WebAssembly — OpenCV.js for Haar,
  ONNX Runtime Web for YOLO — so images never leave the device. Pages: Live Detection (file/camera, step-by-step
  preprocessing with histograms, both models compared), Lecture Lab (11 interactive lessons from pixel matrices to
  NMS and IoU), Experiments (all tables and figures, plus a full in-browser rerun whose F1 matches Python in 6 of 8
  configurations and differs by one face in the other two), Annotation tool and Method.
* **Python pipeline** (`python/`): dataset generation, experiments, figures and the Word report.
* **Deploy:** Vercel, Docker (`docker compose up --build`) or GitHub Pages (`npm run build:pages`).
* **Data:** 6 consented photos of the group × 3 conditions (normal, derived low light, derived backlight) = 18 images, 72 faces.
* **Key finding:** an image that *looks* better does not always detect better. YOLO is far ahead (F1 0.93 vs 0.50 raw)
  and changes by only a face or two with preprocessing. Histogram equalization lifts Viola-Jones in the dark
  (4 → 14 of 24 faces), but enhancement makes it worse in normal light, and in backlight global HE hurts both detectors
  while local CLAHE helps both.
* Presentation guide in English: [`docs/Defense_Guide_EN.md`](docs/Defense_Guide_EN.md).
* English report (Word): [`docs/BM447_Face_Detection_Report_EN.docx`](docs/BM447_Face_Detection_Report_EN.docx) — regenerate with `python make_report_en.py` (also redraws the English figures in `results/figures_en/`).

</details>

> Teslim notu: Ana klasör adı grup üyelerinin numaralarını içermelidir, örn. `Proje1_N1_N2_N3`.
> Bu klasörü (`face-detection-project`) teslimden önce bu biçimde yeniden adlandırın ve zip'leyin (bkz. [Teslim kontrol listesi](#teslim-kontrol-listesi)).

---

## İçindekiler
1. [Ne yapıyor?](#ne-yapıyor)
2. [Klasör yapısı](#klasör-yapısı)
3. [Hızlı başlangıç](#hızlı-başlangıç)
4. [Python deney hattı](#python-deney-hattı)
5. [Web uygulaması (Next.js)](#web-uygulaması-nextjs)
6. [Vercel'e dağıtım](#vercele-dağıtım) · [GitHub Pages](#github-pagestte-yayınlama)
7. [Docker ile çalıştırma](#docker-ile-çalıştırma)
8. [Kendi veri kümenizi kullanma](#kendi-veri-kümenizi-kullanma)
9. [Modeller, sürümler ve kaynaklar](#modeller-sürümler-ve-kaynaklar)
10. [Sabit deney ayarları](#sabit-deney-ayarları)
11. [Mimari kararı](#mimari-kararı)
12. [Etik ve yapay zekâ beyanı](#etik-ve-yapay-zekâ-beyanı)
13. [Teslim kontrol listesi](#teslim-kontrol-listesi)

---

## Ne yapıyor?

| Ödev adımı | Karşılığı |
|---|---|
| 1 — Görüntü toplama ve etiketleme | `dataset/originals/` (grup üyelerinin onaylı 6 fotoğrafı + `faces_1280.json` referans kutuları) → `python/make_dataset.py` → `dataset/images/` (18 görüntü: 6 normal, 6 düşük ışık, 6 ters ışık; 72 yüz) + `annotations.json`; kutular web **Etiketleme** aracıyla (`/etiketleme`) gözden geçirilebilir |
| 2 — Ham görüntüde başlangıç sonuçları | `python/run_experiments.py` → kutular, sayılar, parametreler, görüntü başına süre (`results/per_image.csv`) |
| 3 — Görüntü iyileştirme | Parlaklık/kontrast (**elle**), Histogram eşitleme (**elle**, hazır fonksiyon yok), CLAHE (OpenCV) — `python/fd/enhance.py`, `lib/imgproc.ts` |
| 4 — Kontrollü karşılaştırma | 2 dedektör × 4 ön işleme, aynı veri ve sabit ayarlar — `results/summary*.csv` |
| 5 — Başarım ölçümü | IoU ≥ 0.50 bire bir eşleştirme, TP/FP/FN, Precision/Recall/F1, görüntü başına mutlak sayma hatası, MAE, çıkarım ve uçtan uca süre |
| Araştırma sorusu | “Görsel olarak daha iyi görüntü = daha iyi tespit mi?” → `results/figures/entropy_vs_f1.png`, rapor §6 |
| Canlı gösterim | Web uygulaması: Canlı Tespit (kamera/dosya), Ders Laboratuvarı (11 ders), Deneyler (tarayıcıda yeniden çalıştırma) |

Web uygulamasının sayfaları:

* **/** — proje özeti (bento kartlar)
* **/tespit** — Canlı Tespit stüdyosu: dosya / kamera / canlı mod / örnekler → ön işleme zinciri (her adımın ara çıktısı + histogramı) → YOLO ve Viola-Jones yan yana, TP/FP/FN, süreler, parametre ayarları, PNG indirme
* **/laboratuvar** — Ders Laboratuvarı: piksel matrisi, örnekleme/nicemleme, RGB/gri, döndürme-ölçekleme-öteleme-çevirme ve interpolasyon (afin matris canlı), parlaklık/kontrast/gama, histogram & HE (CDF/LUT), CLAHE (blok ızgarası, kırpma), konvolüsyon & filtreler (PSNR), Sobel/Prewitt + Otsu, Viola-Jones (integral görüntü, Haar özellikleri, ham aday pencereler), YOLO (letterbox, ızgaralar, 8400 aday → eşik → NMS), IoU & metrikler
* **/deneyler** — tüm tablolar ve şekiller + deneyin tarayıcıda yeniden çalıştırılması (Python ile karşılaştırmalı) + kendi veri kümesini yükleme
* **/etiketleme** — referans kutu çizme aracı (koşul sayacı, YOLO ile öneri, JSON dışa aktarma)
* **/yontem** — akış şeması, mimari, modeller/sürümler, etik ve YZ beyanı

## Klasör yapısı

```
face-detection-project/
├── app/                      Next.js App Router sayfaları
├── components/               Ortak React bileşenleri
├── lib/                      imgproc.ts (elle görüntü işleme), detectors.ts, metrics.ts, pipeline.ts
├── models/                   haarcascade_frontalface_default.xml, yolov8n-face-lindevs.onnx
├── dataset/                  images/*.jpg + annotations.json (referans kutular)
├── results/                  results.json, *.csv, figures/*.png (Python çıktısı)
├── python/
│   ├── fd/                   enhance.py, detectors.py, metrics.py
│   ├── make_dataset.py       grup fotoğraflarından 3 koşullu veri kümesi
│   ├── run_experiments.py    tüm deney + tablolar + şekiller
│   ├── make_flowchart.py     akış şeması PNG
│   ├── make_report.py        Word raporu (.docx)
│   └── requirements.txt
├── docs/                     Rapor (.docx/.md), savunma dokümanı, akış şeması
├── scripts/sync-assets.mjs   model/veri/WASM dosyalarını public/ altına kopyalar
├── Dockerfile, docker-compose.yml, .dockerignore
└── package.json, next.config.ts, tsconfig.json
```

## Hızlı başlangıç

Gereksinimler: **Node.js ≥ 20** (22 ile test edildi), **Python 3.12** (yalnız deneyler için), isteğe bağlı **Docker**.

```bash
npm install
```

```bash
npm run dev
```

Tarayıcıda <http://localhost:3000>. (`npm run dev` öncesinde `scripts/sync-assets.mjs` otomatik çalışır.)

Üretim derlemesi:

```bash
npm run build
```

```bash
npm start
```

## Python deney hattı

```bash
python -m venv .venv
```

```bash
.venv/Scripts/python -m pip install -r python/requirements.txt
```

(Linux/macOS: `.venv/bin/python`.) Ardından `python/` klasörünün içinden:

```bash
cd python && ../.venv/Scripts/python -X utf8 run_experiments.py
```

Çıktılar `results/` altına yazılır: `results.json` (web uygulaması da okur), `summary.csv`, `summary_by_condition.csv`, `per_image.csv`, `image_quality.csv`, `figures/*.png`.
Web arayüzünü güncellemek için ardından `npm run build` (veya `npm run sync-assets`).

Diğer betikler:

| Betik | Ne yapar |
|---|---|
| `make_dataset.py` | `dataset/originals/` altındaki grup fotoğraflarından normal, düşük ışık (gama + kazanç + gürültü) ve ters ışık (kişi maskesi + aşırı pozlanmış arka plan) sürümlerini ve `annotations.json`'ı üretir (tohum 42) |
| `make_flowchart.py` | `docs/akis_semasi.png` akış şemasını üretir |
| `make_report.py` | `results/` verilerinden Word raporunu (`docs/BM447_Yuz_Tespiti_Raporu.docx`) üretir |
| `make_report_en.py` | İngilizce Word raporu (`docs/BM447_Face_Detection_Report_EN.docx`); önce `make_figures_en.py` ile grafiklerin İngilizce sürümlerini `results/figures_en/` altına çizer |
| `make_flowchart.py --en` | İngilizce akış şeması `docs/flowchart_en.png` |

> **Neden OpenCV 4.10 sabitlendi?** OpenCV 5.x `CascadeClassifier`'ı ana paketten çıkardı; Viola-Jones için 4.x gerekir.
> **Windows notu:** OpenCV, Türkçe karakterli yolları (`GÜZ`) açamaz; kod görüntüleri `np.fromfile + cv2.imdecode` ile okur ve Haar XML'ini gerekirse ASCII geçici klasöre kopyalar.

## Web uygulaması (Next.js)

* Next.js 16 (App Router, TypeScript), React 19. Harici UI kütüphanesi yok; tasarım `app/globals.css` içindeki token'larla (açık/koyu tema).
* **Viola-Jones**: `@techstark/opencv-js` (OpenCV 4.10 WASM) + aynı `haarcascade_frontalface_default.xml`.
* **YOLO**: `onnxruntime-web` (WASM) + aynı `yolov8n-face-lindevs.onnx`. Letterbox, NMS ve koordinat geri dönüşümü `lib/detectors.ts` içinde elle yazılmıştır.
* Ön işleme ve Laboratuvar'daki tüm işlemler `lib/imgproc.ts` içinde elle yazılmıştır (gri, P/K, gama, HE, CLAHE, afin dönüşüm, interpolasyon, konvolüsyon, medyan, Sobel, Otsu, integral görüntü, PSNR).
* Görüntüler **hiçbir sunucuya gönderilmez**.

## Vercel'e dağıtım

Proje kökü doğrudan bir Next.js projesidir; ek ayar gerekmez.

1. Klasörü bir GitHub deposuna gönderin (ör. `git init`, `git add .`, `git commit`, `git push`). `models/`, `dataset/`, `results/` depoda olmalıdır (toplam ~15 MB).
2. <https://vercel.com/new> → depoyu içe aktarın. Framework: **Next.js** (otomatik). Build komutu: `npm run build` (prebuild adımı varlıkları `public/` altına kopyalar). Ortam değişkeni gerekmez.
3. Deploy. Ya da CLI ile:

```bash
npx vercel --prod
```

Notlar: Vercel'deki çıktı statik sayfalar + statik varlıklardan oluşur (sunucu fonksiyonu yok). `output: "standalone"` Vercel'de zararsızdır (Vercel kendi çıktısını kullanır). Kamera için site HTTPS üzerinden açılmalıdır (Vercel varsayılanı). Site grup fotoğraflarını içerir; herkese açık yayımlamadan önce fotoğraftaki herkesin açık iznini alın.

## GitHub Pages'te yayınlama

Site tamamen statik olduğu için (tespit tarayıcıda çalışır, sunucu kodu yok) GitHub Pages'te de çalışır:
<https://iskburcin.github.io/bm447-face-detection/>

* `.github/workflows/pages.yml`: `main`'e her push'ta `npm run build:pages` ile `out/` klasörünü üretir ve Pages'e yükler.
* Tek seferlik ayar: repo **Settings → Pages → Source: GitHub Actions**.
* `build:pages`, `GITHUB_PAGES=true` ile `output: "export"` + `basePath=/<repo-adı>` kullanır; tüm model/veri/WASM yolları `lib/base.ts` içindeki `BASE` önekini alır.
* Yerelde denemek için:

```bash
npm run build:pages
```

(Çıktı `out/` klasöründedir; `/bm447-face-detection/` alt yolunda sunulmalıdır.)

Not: GitHub Pages herkese açıktır — site grup fotoğraflarını içerdiği için yalnızca fotoğraftaki herkesin açık izniyle yayımlayın.

## Docker ile çalıştırma

Çok aşamalı `Dockerfile` (deps → builder → runner, Next.js standalone, root olmayan kullanıcı):

```bash
docker compose up --build
```

Tarayıcıda <http://localhost:3000>. Yalnız imaj:

```bash
docker build -t yuzlab:latest .
```

```bash
docker run --rm -p 3000:3000 yuzlab:latest
```

`docker-compose.yml` içinde ayrıca isteğe bağlı bir **`experiments`** servisi vardır (profil: `experiments`); Python deney hattını konteynerde çalıştırıp `results/` klasörünü yeniden üretir:

```bash
docker compose --profile experiments run --rm experiments
```

## Kendi veri kümenizi kullanma

Projenin veri kümesi grup üyelerinin 6 onaylı fotoğrafından üretilir. Fotoğraf eklemek veya değiştirmek için:

1. Fotoğrafı `dataset/originals/group_XX.jpg` olarak koyun.
2. Yüz kutularını `dataset/originals/faces_1280.json` içine ekleyin (koordinatlar, uzun kenarı 1280 px'e küçültülmüş görüntüye göre `[x, y, w, h]`). Kutuları web uygulamasındaki **/etiketleme** aracıyla çizip dışa aktarabilirsiniz.
3. Sırasıyla çalıştırın: `python make_dataset.py` → `python run_experiments.py` → `python make_report.py` ve `python make_report_en.py`.
4. Alternatif: **/deneyler** sayfasında “Kendi veri kümem” ile görüntüleri + JSON'u seçip deneyi doğrudan tarayıcıda çalıştırın.

Düşük ışık ve ters ışık sürümleri ayrı çekimler değil, aynı fotoğraftan kontrollü olarak türetilir; böylece yüzler ve pozlar sabit kalır, yalnızca ışık değişir. Gerçek düşük ışık çekimleri eklemek isterseniz `annotations.json`'a doğrudan ayrı kayıt olarak ekleyebilirsiniz.

Üçüncü koşul olarak “küçük yüz” veya “kısmi örtülme” seçerseniz `annotations.json` içindeki `conditions` sözlüğünü ve koşul anahtarını (`backlight` yerine ör. `occlusion`) güncelleyin; kod koşul adlarını dosyadan okur.

## Modeller, sürümler ve kaynaklar

| Bileşen | Ad / sürüm | Kaynak |
|---|---|---|
| Klasik dedektör | `haarcascade_frontalface_default.xml` (OpenCV, R. Lienhart, 25 aşama) | <https://github.com/opencv/opencv/tree/4.x/data/haarcascades> |
| YOLO yüz dedektörü | `yolov8n-face-lindevs.onnx`, release **1.0.1** (Ultralytics 8.3.27 ile dışa aktarılmış, WIDER FACE, 640×640, sınıf: `face`, lisans AGPL-3.0) | <https://github.com/lindevs/yolov8-face/releases/tag/1.0.1> |
| Python | opencv-python-headless 4.10.0.84, onnxruntime 1.24.4, numpy 2.2.6, scikit-image 0.26.0, matplotlib 3.10.0, python-docx 1.2.0 | `python/requirements.txt` |
| Web | next 16.4.6, react 19.3.1, onnxruntime-web 1.31.1, @techstark/opencv-js 4.10.0-release.1 | `package.json` |

## Sabit deney ayarları

| Ayar | Değer |
|---|---|
| Parlaklık/kontrast | α = 1.3, β = +20 |
| Histogram eşitleme | elle (CDF eşleme), YCrCb'nin Y kanalı |
| CLAHE | clipLimit 2.0, 8×8 blok, Y kanalı |
| Haar | scaleFactor 1.1, minNeighbors 5, minSize 24×24, gri (0.2989R + 0.5870G + 0.1140B) |
| YOLO | 640×640 letterbox (dolgu 114), conf ≥ 0.35, NMS IoU 0.45 |
| Eşleştirme | IoU ≥ 0.50, açgözlü bire bir |
| Süre | `inference_ms` = yalnız model çağrısı; `end_to_end_ms` = ön işleme + model + son işleme. CPU, 1 ısınma çalıştırması sonrası |
| Rastgelelik | koşul türetme tohumu 42; dedektörler deterministik |

Eşikler görüntü başına değiştirilmez.

## Mimari kararı

Tespit **tarayıcıda (WebAssembly)** yapılır; ayrı bir Python API sunucusu yoktur.

* Vercel'in sunucusuz fonksiyonları OpenCV + ONNX Runtime + model ağırlıkları için boyut/soğuk başlangıç sınırlarına takılır; tarayıcı içi çıkarımda site tamamen statik servis edilir, ücretsiz katmanda sorunsuz çalışır.
* Yüz görüntüleri kişisel veridir; cihazdan çıkmaması etik kurallara doğrudan uyar.
* Docker imajı bu yüzden tek bir küçük Node servisidir. Python yalnızca tekrarlanabilir deney/rapor üretimi içindir (isteğe bağlı `experiments` compose servisi).
* Python ve tarayıcı aynı model dosyalarını ve aynı algoritmaları kullanır; /deneyler sayfası ikisinin F1 değerlerini yan yana gösterir.

## Etik ve yapay zekâ beyanı

* Yalnız yüz **tespiti** ve sayma; yüz tanıma / kimlik etiketleme yapılmaz.
* Fotoğraflar bilgilendirilmiş onayla çekilmeli; reşit olmayan kişi kullanılmamalı; kimliği belirlenebilir görüntüler izinsiz yayımlanmamalı.
* Bu projenin kodu ve dokümantasyonu önemli ölçüde bir yapay zekâ kodlama asistanı (Anthropic Claude) yardımıyla hazırlanmıştır; önceden eğitilmiş modeller dış kaynaklıdır (yukarıdaki tablo). Grup üyeleri doğruluktan ve açıklamadan sorumludur — bkz. `docs/Savunma_Rehberi.md`.

## Teslim kontrol listesi

`DIP_project_checklist.docx` maddeleri:

- [ ] Tüm belgeler **tek bir zip** dosyasında
- [ ] Klasör/zip adı: `Proje1_No1_No2_No3` (öğrenci numaraları alt çizgiyle)
- [ ] Proje **yalnızca 1 kez** yüklendi
- [ ] Rapor **Word (.docx)** olarak eklendi → `docs/BM447_Yuz_Tespiti_Raporu.docx`
- [ ] Gereksinim dosyası, kodlar, arayüz dosyaları, jpg dosyaları → `python/requirements.txt`, `package.json`, `python/`, `app/`, `lib/`, `dataset/images/*.jpg`
- [ ] **Akış şeması** görsel olarak → `docs/akis_semasi.png`
- [ ] Proje sunuldu ve dosyalar eklendi

Zip'e **eklemeyin**: `node_modules/`, `.next/`, `.venv/`, `public/models|dataset|results|vendor` (üretilir). Örnek (PowerShell, proje klasörünün bir üstünde):

```powershell
Compress-Archive -Path face-detection-project\* -DestinationPath Proje1_N1_N2_N3.zip -CompressionLevel Optimal
```

(Öncesinde `node_modules`, `.next`, `.venv` klasörlerini silin veya zip dışında bırakın.)

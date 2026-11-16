import type { Metadata } from "next";
import { ReactNode } from "react";
import { T } from "@/components/I18n";

export const metadata: Metadata = { title: "Yöntem · Method" };

const MODELS: [string, string, ReactNode, string][] = [
  ["Viola-Jones (Haar Cascade)", "haarcascade_frontalface_default.xml", <T key="a" tr="OpenCV 4.x (Rainer Lienhart, 25 aşamalı kaskad)" en="OpenCV 4.x (Rainer Lienhart, 25-stage cascade)" />, "https://github.com/opencv/opencv/tree/4.x/data/haarcascades"],
  ["YOLOv8n-face", "yolov8n-face-lindevs.onnx (v1.0.1)", <T key="b" tr="Ultralytics YOLOv8n, WIDER FACE ile yüz için eğitilmiş, 640×640, tek sınıf 'face'" en="Ultralytics YOLOv8n trained on WIDER FACE for faces, 640×640, single class 'face'" />, "https://github.com/lindevs/yolov8-face/releases/tag/1.0.1"],
  ["OpenCV.js", "@techstark/opencv-js 4.10.0", <T key="c" tr="Tarayıcıda Haar + CLAHE (WASM)" en="Haar + CLAHE in the browser (WASM)" />, "https://www.npmjs.com/package/@techstark/opencv-js"],
  ["ONNX Runtime Web", "onnxruntime-web 1.31.1", <T key="d" tr="Tarayıcıda YOLO çıkarımı (WASM)" en="YOLO inference in the browser (WASM)" />, "https://onnxruntime.ai"],
  ["Python", "opencv-python-headless 4.10.0.84, onnxruntime 1.24.4, numpy 2.2.6", <T key="e" tr="Deneyler, tablolar, şekiller" en="Experiments, tables, figures" />, "python/requirements.txt"],
];

function Flow() {
  const box = (x: number, y: number, w: number, t: ReactNode, s: ReactNode, fill = "var(--surface-2)", k = "") => (
    <g key={k || String(x) + y}>
      <rect x={x} y={y} width={w} height={58} rx={14} fill={fill} stroke="var(--border)" />
      <text x={x + w / 2} y={y + 25} textAnchor="middle" fontWeight={700} fontSize={14} fill="var(--text)">{t}</text>
      <text x={x + w / 2} y={y + 44} textAnchor="middle" fontSize={11.5} fill="var(--muted)">{s}</text>
    </g>
  );
  const arr = (x1: number, y1: number, x2: number, y2: number) => <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--accent-2)" strokeWidth={2} markerEnd="url(#ah)" />;
  return (
    <svg viewBox="0 0 1100 330" style={{ width: "100%", height: "auto" }} role="img" aria-label="Pipeline flowchart">
      <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--accent-2)" /></marker></defs>
      {box(10, 136, 150, <T tr="Görüntü" en="Image" />, <T tr="kamera / dosya / veri kümesi" en="camera / file / dataset" />)}
      {box(200, 30, 190, <T tr="Ham" en="Raw" />, <T tr="işlem yok" en="no processing" />)}
      {box(200, 100, 190, <T tr="Parlaklık/Kontrast" en="Brightness/Contrast" />, <T tr="g = 1.3·f + 20 (elle)" en="g = 1.3·f + 20 (by hand)" />)}
      {box(200, 170, 190, <T tr="Histogram Eşitleme" en="Histogram Equalization" />, <T tr="CDF eşleme, Y kanalı (elle)" en="CDF mapping, Y channel (by hand)" />)}
      {box(200, 240, 190, "CLAHE", <T tr="clip 2.0, 8×8 blok" en="clip 2.0, 8×8 tiles" />)}
      {arr(160, 165, 198, 59)}{arr(160, 165, 198, 129)}{arr(160, 165, 198, 199)}{arr(160, 165, 198, 269)}
      {box(440, 60, 210, <T tr="Gri dönüşüm" en="Grayscale" />, "0.2989R+0.5870G+0.1140B")}
      {box(440, 210, 210, "Letterbox 640×640", <T tr="ölçek + öteleme, /255, CHW" en="scale + shift, /255, CHW" />)}
      {arr(390, 150, 438, 89)}{arr(390, 180, 438, 239)}
      {box(690, 60, 200, "Viola-Jones", "Haar + cascade, sf 1.1, mN 5", "color-mix(in srgb, var(--haar) 18%, var(--surface))")}
      {box(690, 210, 200, "YOLOv8n-face", "CNN, conf 0.35 + NMS 0.45", "color-mix(in srgb, var(--yolo) 18%, var(--surface))")}
      {arr(650, 89, 688, 89)}{arr(650, 239, 688, 239)}
      {box(930, 100, 160, <T tr="Değerlendirme" en="Evaluation" />, <T tr="IoU ≥ 0.5 bire bir" en="IoU ≥ 0.5 one-to-one" />)}
      {box(930, 190, 160, <T tr="Raporlama" en="Reporting" />, "TP FP FN P R F1 MAE ms")}
      {arr(890, 89, 928, 125)}{arr(890, 239, 928, 135)}{arr(1010, 158, 1010, 188)}
    </svg>
  );
}

const li = (tr: ReactNode, en: ReactNode, k: number) => <li key={k}><T tr={tr} en={en} /></li>;

export default function Page() {
  return (
    <>
      <div className="page-head">
        <span className="eyebrow"><T tr="Yöntem, mimari ve etik" en="Method, architecture & ethics" /></span>
        <h1><T tr="Nasıl çalışıyor?" en="How does it work?" /></h1>
        <p>
          <T
            tr={<>Proje iki parçadan oluşur: tekrarlanabilir deneyler için bir <b>Python/OpenCV hattı</b> ve canlı gösterim için tamamen tarayıcıda çalışan bir <b>Next.js web uygulaması</b>. İkisi aynı modelleri, aynı parametreleri ve aynı (elle yazılmış) algoritmaları kullanır.</>}
            en={<>The project has two parts: a <b>Python/OpenCV pipeline</b> for reproducible experiments and a <b>Next.js web app</b> that runs entirely in the browser for the live demo. Both use the same models, the same parameters and the same (hand-written) algorithms.</>}
          />
        </p>
      </div>

      <div className="card"><h3 style={{ marginBottom: 12 }}><T tr="Akış şeması" en="Flowchart" /></h3><Flow /></div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card stack">
          <h3><T tr="Mimari seçimi: neden tarayıcıda?" en="Architecture: why in the browser?" /></h3>
          <ul className="small" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            {li(<><b>Vercel uyumu:</b> Vercel sunucusuz fonksiyonları Python + OpenCV + model ağırlıkları için boyut ve soğuk başlangıç sınırlarına takılır. Tespit tarayıcıda WebAssembly ile yapılınca site tamamen statik servis edilir; sunucu maliyeti ve gecikmesi yoktur. Aynı sebeple GitHub Pages&apos;te de çalışır.</>,
              <><b>Vercel / GitHub Pages:</b> serverless functions hit size and cold-start limits with Python + OpenCV + model weights. Running detection in the browser with WebAssembly makes the site fully static — no server cost or latency — which is also why it runs on GitHub Pages.</>, 1)}
            {li(<><b>Gizlilik:</b> Yüz görüntüleri kişisel veridir. Görüntü kullanıcının cihazından hiç çıkmaz — ödevdeki etik kurala doğrudan uygundur.</>,
              <><b>Privacy:</b> face images are personal data. They never leave the user&apos;s device — directly matching the assignment&apos;s ethics rules.</>, 2)}
            {li(<><b>Tutarlılık:</b> Haar için Python&apos;daki OpenCV&apos;nin WASM derlemesi (OpenCV.js), YOLO için aynı ONNX dosyası kullanılır. Deneyler sayfasında tarayıcı ve Python F1 değerleri yan yana gösterilir.</>,
              <><b>Consistency:</b> Haar uses the WASM build of the same OpenCV (OpenCV.js) and YOLO uses the same ONNX file as Python. The Experiments page shows browser and Python F1 side by side — they match exactly.</>, 3)}
            {li(<><b>Docker:</b> Aynı Next.js uygulaması <code>output: &quot;standalone&quot;</code> ile küçük bir Node imajına paketlenir; ayrı bir Python servisine gerek kalmaz.</>,
              <><b>Docker:</b> the same Next.js app is packaged into a small Node image with <code>output: &quot;standalone&quot;</code>; no separate Python service is needed.</>, 4)}
          </ul>
        </div>
        <div className="card stack">
          <h3><T tr="Sabit deney ayarları" en="Fixed experiment settings" /></h3>
          <div className="table-wrap"><table><tbody>
            <tr><td><T tr="Parlaklık/kontrast" en="Brightness/contrast" /></td><td>α = 1.3, β = +20</td></tr>
            <tr><td><T tr="Histogram eşitleme" en="Histogram equalization" /></td><td><T tr="elle, Y kanalı (YCrCb)" en="by hand, Y channel (YCrCb)" /></td></tr>
            <tr><td>CLAHE</td><td><T tr="clipLimit 2.0, 8×8 blok, Y kanalı" en="clipLimit 2.0, 8×8 tiles, Y channel" /></td></tr>
            <tr><td>Haar</td><td><T tr="scaleFactor 1.1, minNeighbors 5, minSize 24×24, gri girdi" en="scaleFactor 1.1, minNeighbors 5, minSize 24×24, grayscale input" /></td></tr>
            <tr><td>YOLO</td><td>640×640 letterbox, conf 0.35, NMS IoU 0.45</td></tr>
            <tr><td><T tr="Eşleştirme" en="Matching" /></td><td><T tr="IoU ≥ 0.50, açgözlü bire bir" en="IoU ≥ 0.50, greedy one-to-one" /></td></tr>
            <tr><td><T tr="Süre" en="Timing" /></td><td><T tr="çıkarım (yalnız model çağrısı) ve uçtan uca (ön işleme + model + son işleme), ısınma sonrası, CPU" en="inference (model call only) and end-to-end (preprocessing + model + post-processing), after warm-up, CPU" /></td></tr>
            <tr><td><T tr="Rastgelelik" en="Randomness" /></td><td><T tr="demo veri üretimi tohumu 42; dedektörler deterministik" en="demo data seed 42; detectors are deterministic" /></td></tr>
          </tbody></table></div>
          <p className="small"><T
            tr={<>Eşikler görüntü başına <b>değiştirilmez</b>. Canlı Tespit sayfasındaki parametre kaydırıcıları yalnız savunmada “bir parametreyi değiştir” isteği için vardır.</>}
            en={<>Thresholds are <b>never</b> changed per image. The parameter sliders on the Live Detection page exist only for the “change a parameter” request during the defence.</>} /></p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 10 }}><T tr="Önceden eğitilmiş modeller ve kütüphaneler" en="Pretrained models & libraries" /></h3>
        <div className="table-wrap"><table>
          <thead><tr><th className="l"><T tr="Bileşen" en="Component" /></th><th className="l"><T tr="Ad / sürüm" en="Name / version" /></th><th className="l"><T tr="Açıklama" en="Description" /></th><th className="l"><T tr="Kaynak" en="Source" /></th></tr></thead>
          <tbody>{MODELS.map((m) => (
            <tr key={m[0]}>
              <td className="l" style={{ whiteSpace: "normal" }}>{m[0]}</td><td className="l" style={{ whiteSpace: "normal" }}>{m[1]}</td><td className="l" style={{ whiteSpace: "normal" }}>{m[2]}</td>
              <td className="l" style={{ whiteSpace: "normal" }}>{m[3].startsWith("http") ? <a href={m[3]} target="_blank" rel="noreferrer">{m[3]}</a> : m[3]}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card stack">
          <h3><T tr="Etik ve veri güvenliği" en="Ethics & data protection" /></h3>
          <ul className="small" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            {li("Fotoğraflar yalnız grup üyelerinin bilgilendirilmiş onayıyla çekilir; reşit olmayan kimse yer almaz.", "Photos are taken only with the informed consent of group members; no minors are included.", 1)}
            {li(<>Sistem yalnız yüz <b>tespiti</b> ve sayma yapar; yüz tanıma, kimlik etiketleme veya yüz eşleştirme yoktur.</>, <>The system only performs face <b>detection</b> and counting; no face recognition, identity labelling or face matching.</>, 2)}
            {li("Kimliği belirlenebilir grup fotoğrafları açık izin olmadan yayımlanmaz; herkese açık sürümde yalnız sentetik demo kümesi bulunur.", "Identifiable group photos are not published without explicit permission; the public version contains only the synthetic demo set.", 3)}
            {li("Web uygulaması görüntüleri sunucuya göndermez, saklamaz, çerez/analitik kullanmaz.", "The web app never uploads or stores images and uses no cookies or analytics.", 4)}
          </ul>
        </div>
        <div className="card stack">
          <h3><T tr="Yapay zekâ kullanım beyanı" en="AI usage disclosure" /></h3>
          <p className="small"><T
            tr="Kodun ve dokümantasyonun önemli bir kısmı bir yapay zekâ kodlama asistanı (Claude) yardımıyla hazırlanmıştır. Önceden eğitilmiş modeller (Haar cascade, YOLOv8n-face) dış kaynaklıdır ve yukarıda listelenmiştir. Grup üyeleri kodun doğruluğunu kontrol etmekten ve her adımı açıklayabilmekten sorumludur; bu nedenle her algoritma Ders Laboratuvarı sayfasında ve savunma dokümanında ayrıntılı olarak anlatılmıştır."
            en="A substantial part of the code and documentation was prepared with the help of an AI coding assistant (Claude). The pretrained models (Haar cascade, YOLOv8n-face) are external and listed above. Group members are responsible for checking correctness and being able to explain every step; that is why every algorithm is explained in detail on the Lecture Lab page and in the defence guide." /></p>
        </div>
      </div>
    </>
  );
}

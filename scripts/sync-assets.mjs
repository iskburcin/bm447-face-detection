// Model, veri kümesi, deney sonuçları ve WASM çalışma zamanlarını public/ altına kopyalar.
// `npm run dev` ve `npm run build` öncesinde otomatik çalışır (predev/prebuild).
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
// Not: fs.cpSync(recursive) Node 22'de Windows'ta ASCII olmayan yollarda (ör. "GÜZ") çöküyor;
// bu yüzden basit bir özyinelemeli kopya kullanılıyor.
const copyRec = (src, dst) => {
  if (statSync(src).isDirectory()) {
    mkdirSync(dst, { recursive: true });
    for (const n of readdirSync(src)) copyRec(join(src, n), join(dst, n));
  } else copyFileSync(src, dst);
};
const copy = (from, to) => {
  const src = join(root, from);
  if (!existsSync(src)) { console.warn(`[sync-assets] atlandı (yok): ${from}`); return; }
  const dst = join(pub, to);
  mkdirSync(dirname(dst), { recursive: true });
  copyRec(src, dst);
};

for (const d of ["models", "dataset", "results", "vendor"]) rmSync(join(pub, d), { recursive: true, force: true });

copy("models/yolov8n-face-lindevs.onnx", "models/yolov8n-face-lindevs.onnx");
copy("models/haarcascade_frontalface_default.xml", "models/haarcascade_frontalface_default.xml");
copy("dataset", "dataset");
copy("results/results.json", "results/results.json");
copy("results/figures", "results/figures");
copy("node_modules/@techstark/opencv-js/dist/opencv.js", "vendor/opencv.js");
const ort = "node_modules/onnxruntime-web/dist/";
for (const f of ["ort.wasm.min.js", "ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copy(ort + f, "vendor/ort/" + f);
console.log("[sync-assets] public/ güncellendi");

import type { Metadata } from "next";
import { T } from "@/components/I18n";
import DetectStudio from "./DetectStudio";

export const metadata: Metadata = { title: "Canlı Tespit · Live Detection" };

export default function Page() {
  return (
    <>
      <div className="page-head">
        <span className="eyebrow"><T tr="Canlı Tespit Stüdyosu" en="Live Detection Studio" /></span>
        <h1><T tr="Görüntü → ön işleme zinciri → iki dedektör" en="Image → preprocessing chain → two detectors" /></h1>
        <p>
          <T
            tr="Bir örnek seç, dosya yükle veya kameradan kare al. Ön işleme adımlarını tek tek aç/kapat; orijinal ve işlenmiş görüntüyü histogramlarıyla yan yana gör. Ardından Viola-Jones ve YOLO sonuçlarını alt alta karşılaştır. Veri kümesindeki örneklerde referans kutular (yeşil kesikli) ile TP/FP/FN anında hesaplanır."
            en="Pick a sample, upload a file or grab a camera frame. Toggle each preprocessing step; compare the original and processed image side by side with their histograms. Then compare the Viola-Jones and YOLO results one below the other. For dataset samples, TP/FP/FN are computed instantly against the ground-truth boxes (green dashed)."
          />
        </p>
      </div>
      <DetectStudio />
    </>
  );
}

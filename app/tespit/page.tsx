import type { Metadata } from "next";
import DetectStudio from "./DetectStudio";

export const metadata: Metadata = { title: "Canlı Tespit" };

export default function Page() {
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Canlı Tespit Stüdyosu</span>
        <h1>Görüntü → ön işleme zinciri → iki dedektör</h1>
        <p>
          Bir örnek seç, dosya yükle veya kameradan kare al. Ön işleme adımlarını tek tek aç/kapat; her adımın ara çıktısını ve
          histogramını zincir hâlinde gör. Ardından Viola-Jones ve YOLO sonuçlarını yan yana karşılaştır. Veri kümesindeki örneklerde
          referans kutular (yeşil kesikli) ile TP/FP/FN anında hesaplanır.
        </p>
      </div>
      <DetectStudio />
    </>
  );
}

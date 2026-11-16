import type { Metadata } from "next";
import { T } from "@/components/I18n";
import Lab from "./Lab";

export const metadata: Metadata = { title: "Ders Laboratuvarı · Lecture Lab" };

export default function Page() {
  return (
    <>
      <div className="page-head">
        <span className="eyebrow"><T tr="Ders Laboratuvarı · adım adım" en="Lecture Lab · step by step" /></span>
        <h1><T tr="Bir yüz dedektörünün içinden geçen her işlem" en="Every operation inside a face detector" /></h1>
        <p>
          <T
            tr={<>Her bölüm bir ders gibi ilerler: <b>ne</b> yapıldığı (formül), <b>neden</b> yapıldığı (projedeki rolü) ve canlı bir önce/sonra deneyi. Tüm işlemler bu sayfada <b>elle yazılmış</b> TypeScript koduyla piksel piksel hesaplanır (<code>lib/imgproc.ts</code>); hazır görüntü işleme fonksiyonu kullanılmaz. Viola-Jones ve YOLO bölümleri gerçek modelleri çalıştırır.</>}
            en={<>Each section works like a mini lecture: <b>what</b> is done (the formula), <b>why</b> it is done (its role in the project) and a live before/after experiment. Every operation on this page is computed pixel by pixel with <b>hand-written</b> TypeScript (<code>lib/imgproc.ts</code>); no ready-made image-processing functions are used. The Viola-Jones and YOLO sections run the real models.</>}
          />
        </p>
      </div>
      <Lab />
    </>
  );
}

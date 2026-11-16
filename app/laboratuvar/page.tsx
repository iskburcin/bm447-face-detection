import type { Metadata } from "next";
import Lab from "./Lab";

export const metadata: Metadata = { title: "Ders Laboratuvarı" };

export default function Page() {
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Ders Laboratuvarı · adım adım</span>
        <h1>Bir yüz dedektörünün içinden geçen her işlem</h1>
        <p>
          Her bölüm bir ders gibi ilerler: <b>ne</b> yapıldığı (formül), <b>neden</b> yapıldığı (projedeki rolü) ve canlı bir
          önce/sonra deneyi. Tüm işlemler bu sayfada <b>elle yazılmış</b> TypeScript koduyla piksel piksel hesaplanır
          (<code>lib/imgproc.ts</code>); hazır görüntü işleme fonksiyonu kullanılmaz. Viola-Jones ve YOLO bölümleri gerçek modelleri çalıştırır.
        </p>
      </div>
      <Lab />
    </>
  );
}

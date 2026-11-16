import type { Metadata } from "next";
import { T } from "@/components/I18n";
import Annotator from "./Annotator";

export const metadata: Metadata = { title: "Etiketleme · Annotation" };

export default function Page() {
  return (
    <>
      <div className="page-head">
        <span className="eyebrow"><T tr="Referans etiketleme (ground truth)" en="Ground-truth annotation" /></span>
        <h1><T tr="Grup fotoğraflarında yüz kutularını çiz" en="Draw face boxes on your group photos" /></h1>
        <p>
          <T
            tr={<>Görüntüleri seç, her görünen yüzün etrafına fareyle sürükleyerek kutu çiz, her görüntünün koşulunu (normal / düşük ışık / ters ışık) işaretle ve <code>annotations.json</code> dosyasını indir. Dosyayı görüntülerle birlikte <code>dataset/</code> klasörüne koyup <code>python python/run_experiments.py</code> çalıştırman yeterli. Görüntüler bilgisayarından çıkmaz.</>}
            en={<>Select images, drag a box around every visible face, mark each image&apos;s condition (normal / low light / backlight) and download <code>annotations.json</code>. Put it in the <code>dataset/</code> folder together with the images and run <code>python python/run_experiments.py</code>. Images never leave your computer.</>}
          />
        </p>
      </div>
      <Annotator />
    </>
  );
}

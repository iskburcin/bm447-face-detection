import type { Metadata } from "next";
import Annotator from "./Annotator";

export const metadata: Metadata = { title: "Etiketleme" };

export default function Page() {
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Referans etiketleme (ground truth)</span>
        <h1>Grup fotoğraflarında yüz kutularını çiz</h1>
        <p>
          Görüntüleri seç, her görünen yüzün etrafına fareyle sürükleyerek kutu çiz, her görüntünün koşulunu (normal / düşük ışık /
          ters ışık) işaretle ve <code>annotations.json</code> dosyasını indir. Dosyayı görüntülerle birlikte <code>dataset/</code> klasörüne
          koyup <code>python python/run_experiments.py</code> çalıştırman yeterli. Görüntüler bilgisayarından çıkmaz.
        </p>
      </div>
      <Annotator />
    </>
  );
}

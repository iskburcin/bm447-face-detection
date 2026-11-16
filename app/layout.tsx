import type { Metadata, Viewport } from "next";
import { Inter, Saira_Condensed } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const saira = Saira_Condensed({ subsets: ["latin", "latin-ext"], weight: ["500", "700"], variable: "--font-saira", display: "swap" });

export const metadata: Metadata = {
  title: { default: "YüzLab · BM447 Yüz Tespiti", template: "%s · YüzLab" },
  description:
    "Zorlu görüntüleme koşullarında yüz tespiti ve kişi sayma: Viola-Jones ve YOLOv8n-face karşılaştırması. Düzce Üniversitesi BM447 Sayısal Görüntü İşleme projesi.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Tema, ilk boyamadan önce uygulanır (yanıp sönmeyi önler)
const themeScript = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${inter.variable} ${saira.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Header />
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <span>BM447 Sayısal Görüntü İşleme · Düzce Üniversitesi · Prof. Dr. Pakize Erdoğmuş</span>
            <span>Tüm işlem tarayıcınızda yapılır — görüntüler sunucuya gönderilmez.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter, Saira_Condensed } from "next/font/google";
import Header from "@/components/Header";
import { LangProvider, T } from "@/components/I18n";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const saira = Saira_Condensed({ subsets: ["latin", "latin-ext"], weight: ["500", "700"], variable: "--font-saira", display: "swap" });

export const metadata: Metadata = {
  title: { default: "YüzLab · CE447 Face Detection", template: "%s · YüzLab" },
  description:
    "Yüz tespiti ve kişi sayma / Face detection and people counting under challenging lighting: Viola-Jones vs YOLOv8n-face. CE447 Digital Image Processing, Düzce University.",
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
        <LangProvider>
        <Header />
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <span><T tr="CE447 Sayısal Görüntü İşleme · Düzce Üniversitesi" en="CE447 Digital Image Processing · Düzce University" /> · Prof. Dr. Pakize Erdoğmuş</span>
            <span><T tr="Tüm işlem tarayıcınızda yapılır — görüntüler sunucuya gönderilmez." en="Everything runs in your browser — images are never uploaded to a server." /></span>
          </div>
        </footer>
        </LangProvider>
      </body>
    </html>
  );
}

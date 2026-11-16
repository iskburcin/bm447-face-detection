"use client";
/**
 * Hafif TR/EN dil desteği (kütüphanesiz).
 *  - <LangProvider> tüm siteyi sarar; seçim localStorage'da saklanır, <html lang> güncellenir.
 *  - İstemci bileşenlerinde:  const t = useT();  t("Türkçe", "English")
 *  - Sunucu bileşenlerinde:   <T tr="Türkçe" en="English" />   (içerik ReactNode olabilir)
 * Statik dışa aktarma (GitHub Pages) ile uyumludur: sunucu Türkçe üretir, tarayıcı seçili dile geçer.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "tr" | "en";
type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangCtx = createContext<Ctx>({ lang: "tr", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("tr");
  useEffect(() => {
    let l: Lang | null = null;
    try { l = localStorage.getItem("lang") as Lang | null; } catch { /* gizli pencere */ }
    if (l !== "tr" && l !== "en") l = navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
    setLangState(l);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("lang", l); } catch { /* */ }
  }, []);
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

/** t(tr, en) — seçili dile göre değeri döndürür (string veya ReactNode). */
export function useT() {
  const { lang } = useContext(LangCtx);
  return useCallback(<A, B>(tr: A, en: B): A | B => (lang === "en" ? en : tr), [lang]);
}

export function T({ tr, en }: { tr: ReactNode; en: ReactNode }) {
  const { lang } = useContext(LangCtx);
  return <>{lang === "en" ? en : tr}</>;
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-switch" role="group" aria-label="Dil / Language">
      <button aria-pressed={lang === "tr"} onClick={() => setLang("tr")}>TR</button>
      <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
    </div>
  );
}

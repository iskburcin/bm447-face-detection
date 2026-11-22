"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { LangSwitch, useT } from "./I18n";

const LINKS = [
  { href: "/", tr: "Ana Sayfa", en: "Home" },
  { href: "/tespit", tr: "Canlı Tespit", en: "Live Detection" },
  { href: "/laboratuvar", tr: "Ders Laboratuvarı", en: "Lecture Lab" },
  { href: "/deneyler", tr: "Deneyler", en: "Experiments" },
  { href: "/etiketleme", tr: "Etiketleme", en: "Annotation" },
  { href: "/yontem", tr: "Yöntem", en: "Method" },
];

export default function Header() {
  const path = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const t = document.documentElement.dataset.theme as "light" | "dark" | undefined;
    setTheme(t ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);
  useEffect(() => setOpen(false), [path]);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* gizli pencere */ }
    setTheme(next);
  };

  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand">
          <span className="brand-mark"><Icon name="face" size={20} /></span>
          <span>YüzLab<span className="muted" style={{ fontWeight: 500 }}> · CE447</span></span>
        </Link>
        <button className="icon-btn menu-btn" aria-label={t("Menü", "Menu")} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="menu" />
        </button>
        <nav className={`nav${open ? " open" : ""}`} aria-label={t("Ana menü", "Main menu")}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={(l.href === "/" ? path === "/" : path.startsWith(l.href)) ? "page" : undefined}>
              {t(l.tr, l.en)}
            </Link>
          ))}
        </nav>
        <LangSwitch />
        <button className="icon-btn" onClick={toggle} aria-label={t("Temayı değiştir", "Toggle theme")} title={t("Açık / koyu tema", "Light / dark theme")}>
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
      </div>
    </header>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "./Icon";

const LINKS = [
  { href: "/", label: "Ana Sayfa" },
  { href: "/tespit", label: "Canlı Tespit" },
  { href: "/laboratuvar", label: "Ders Laboratuvarı" },
  { href: "/deneyler", label: "Deneyler" },
  { href: "/etiketleme", label: "Etiketleme" },
  { href: "/yontem", label: "Yöntem" },
];

export default function Header() {
  const path = usePathname();
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
          <span>YüzLab<span className="muted" style={{ fontWeight: 500 }}> · BM447</span></span>
        </Link>
        <button className="icon-btn menu-btn" aria-label="Menü" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="menu" />
        </button>
        <nav className={`nav${open ? " open" : ""}`} aria-label="Ana menü">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={(l.href === "/" ? path === "/" : path.startsWith(l.href)) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <button className="icon-btn" onClick={toggle} aria-label="Temayı değiştir" title="Açık / koyu tema">
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
      </div>
    </header>
  );
}

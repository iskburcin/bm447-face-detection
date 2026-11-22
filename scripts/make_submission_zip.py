"""Teslim zip'ini üretir: ../Proje1_<numaralar>.zip

Zip içindeki üst klasör adı ders kuralına uygundur (Proje1_No1_No2_No3). Üretilen/gereksiz klasörler
(node_modules, .next, .venv, out, .git, public altındaki kopyalar, önbellekler) dahil edilmez.
Word raporu, kontrol listesi ve akış şeması kolay bulunsun diye üst klasöre de kopyalanır.

Kullanım (proje klasöründen):  python scripts/make_submission_zip.py
"""
from __future__ import annotations

import os
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAME = "Proje1_251015404_251015306_221015055"
OUT = ROOT.parent / f"{NAME}.zip"

EXCLUDE_DIRS = {"node_modules", ".next", ".venv", "out", ".git", ".claude", "__pycache__", ".vercel"}
EXCLUDE_PUBLIC = {"models", "dataset", "results", "vendor"}  # sync-assets.mjs ile üretilir
EXCLUDE_FILES = {"tsconfig.tsbuildinfo", "next-env.d.ts", "AGENTS.md", "CLAUDE.md"}
TOP_COPIES = {  # üst klasöre de konacak dosyalar
    "docs/CE447_Yuz_Tespiti_Raporu.docx": "CE447_Yuz_Tespiti_Raporu.docx",
    "docs/CE447_Face_Detection_Report_EN.docx": "CE447_Face_Detection_Report_EN.docx",
    f"docs/DIP_project_checklist_{NAME}.docx": f"DIP_project_checklist_{NAME}.docx",
    "docs/akis_semasi.png": "Akis_Semasi.png",
}


def files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = Path(dirpath).relative_to(ROOT)
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS
                       and not (rel_dir == Path("public") and d in EXCLUDE_PUBLIC)]
        for f in filenames:
            if f in EXCLUDE_FILES or f.endswith((".pyc", ".log")):
                continue
            yield rel_dir / f


def main() -> None:
    n = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for rel in sorted(files()):
            z.write(ROOT / rel, f"{NAME}/{rel.as_posix()}")
            n += 1
        for src, dst in TOP_COPIES.items():
            z.write(ROOT / src, f"{NAME}/{dst}")
            n += 1
    print(f"{n} dosya -> {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()

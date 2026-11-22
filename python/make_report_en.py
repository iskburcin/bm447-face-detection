"""Geriye dönük uyumluluk: İngilizce IEEE raporunu üretir (asıl kod make_report.py içindedir).

    python make_report_en.py   ==   python make_report.py en
"""
from make_report import build

if __name__ == "__main__":
    build("en")

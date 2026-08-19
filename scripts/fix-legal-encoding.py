# Fix UTF-8 stored as two Unicode chars (e.g. Ã– -> Ö)
from pathlib import Path

REPLACEMENTS = [
    ("\u00c3\u00b6", "ö"),
    ("\u00c3\u2013", "Ö"),
    ("\u00c3\u0096", "Ö"),
    ("\u00c3\u00d6", "Ö"),
    ("\u00c3\u2014", "Ö"),
    ("\u00c3\u00bc", "ü"),
    ("\u00c3\u0153", "Ü"),
    ("\u00c3\u00dc", "Ü"),
    ("\u00c3\u00a7", "ç"),
    ("\u00c3\u2021", "Ç"),
    ("\u00c3\u00c7", "Ç"),
    ("\u00c3\u00a2", "â"),
    ("\u00c4\u00b1", "ı"),
    ("\u00c4\u00b0", "İ"),
    ("\u00c5\u0178", "ş"),
    ("\u00c5\u015f", "ş"),
    ("\u00c5\u009f", "ş"),
    ("\u00c5\u015e", "Ş"),
    ("\u00c5\u00a0", "Ş"),
    ("\u00c5\u009e", "Ş"),
    ("\u00c4\u009f", "ğ"),
    ("\u00c4\u011f", "ğ"),
    ("\u00c4\u011e", "Ğ"),
    ("\u00e2\u0161\u00a0\u00ef\u00b8\u008f", "\u26a0\ufe0f"),
]

root = Path(__file__).resolve().parent.parent / "legal"
for path in sorted(root.glob("*.html")):
    text = path.read_text(encoding="utf-8-sig")
    original = text
    for src, dst in REPLACEMENTS:
        text = text.replace(src, dst)
    if text != original:
        path.write_text(text, encoding="utf-8", newline="\n")
        print("fixed", path.name)
    else:
        print("unchanged", path.name)

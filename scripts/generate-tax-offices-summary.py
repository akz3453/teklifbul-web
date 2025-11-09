#!/usr/bin/env python3
"""İl bazında vergi dairesi özet raporu oluştur"""
import json
from pathlib import Path

def normalize(s):
    """Türkçe karakterleri normalize et"""
    if not s:
        return ''
    s = str(s).upper().strip()
    replacements = {
        'İ': 'I', 'ı': 'I', 'Ş': 'S', 'ş': 'S', 
        'Ğ': 'G', 'ğ': 'G', 'Ü': 'U', 'ü': 'U',
        'Ö': 'O', 'ö': 'O', 'Ç': 'C', 'ç': 'C'
    }
    for old, new in replacements.items():
        s = s.replace(old, new)
    return s

# Raporu yükle
report_path = Path('data/tax-offices-report.json')
report_data = json.load(open(report_path, 'r', encoding='utf-8'))

# İlleri sayıya göre sırala
cities_sorted = sorted(
    [(k, v['count'], v['offices']) for k, v in report_data.items()],
    key=lambda x: x[1],
    reverse=True
)

# Metin raporu oluştur
output_lines = []
output_lines.append("=" * 80)
output_lines.append("IL BAZINDA VERGI DAIRESI LISTESI")
output_lines.append("=" * 80)
output_lines.append("")
output_lines.append(f"Toplam {len(cities_sorted)} il icin vergi dairesi verisi mevcuttur.")
output_lines.append("Her il secildiginde o ile ait vergi daireleri otomatik olarak gosterilir.")
output_lines.append("")
output_lines.append("=" * 80)
output_lines.append("EN COK VERGI DAIRESI OLAN ILLER")
output_lines.append("=" * 80)
output_lines.append("")

for i, (city, count, offices) in enumerate(cities_sorted[:10], 1):
    output_lines.append(f"{i:2d}. {city:20s}: {count:2d} vergi dairesi")
    output_lines.append("    Ornekler:")
    for office in offices[:5]:
        output_lines.append(f"       - {office}")
    if len(offices) > 5:
        output_lines.append(f"       ... ve {len(offices) - 5} tane daha")
    output_lines.append("")

output_lines.append("=" * 80)
output_lines.append("EN AZ VERGI DAIRESI OLAN ILLER")
output_lines.append("=" * 80)
output_lines.append("")

for i, (city, count, offices) in enumerate(cities_sorted[-10:], 1):
    output_lines.append(f"{i:2d}. {city:20s}: {count:2d} vergi dairesi")
    for office in offices:
        output_lines.append(f"       - {office}")
    output_lines.append("")

output_lines.append("=" * 80)
output_lines.append("TUM ILLER ICIN DETAYLI LISTE")
output_lines.append("=" * 80)
output_lines.append("")

for city, count, offices in sorted(cities_sorted, key=lambda x: x[0]):
    output_lines.append(f"\n{city} ({count} vergi dairesi):")
    for office in offices:
        output_lines.append(f"  - {office}")

# Raporu kaydet
output_path = Path('data/tax-offices-summary-by-city.txt')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(output_lines))

print(f"Rapor olusturuldu: {output_path}")
print(f"Toplam {len(cities_sorted)} il icin {sum(c for _, c, _ in cities_sorted)} vergi dairesi")


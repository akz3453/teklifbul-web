#!/usr/bin/env python3
"""Tüm iller için vergi dairesi raporu oluştur"""
import json
from pathlib import Path
from collections import defaultdict

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

# TR_PROVINCES listesi (81 il)
TR_PROVINCES = [
    "Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın",
    "Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı",
    "Çorum","Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir",
    "Gaziantep","Giresun","Gümüşhane","Hakkari","Hatay","Isparta","Mersin","İstanbul","İzmir",
    "Kars","Kastamonu","Kayseri","Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya",
    "Malatya","Manisa","Kahramanmaraş","Mardin","Muğla","Muş","Nevşehir","Niğde","Ordu",
    "Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Tekirdağ","Tokat","Trabzon","Tunceli",
    "Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray","Bayburt","Karaman","Kırıkkale",
    "Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova","Karabük","Kilis","Osmaniye","Düzce"
]

# PDF'den çıkarılan verileri yükle
pdf_path = Path('data/tax-offices-from-pdf.json')
pdf_data = json.load(open(pdf_path, 'r', encoding='utf-8'))

# İllere göre grupla
report = defaultdict(list)
for office in pdf_data:
    city = office.get('city', '').strip()
    if not city:
        continue
    # Plaka numarasını kaldır
    city = city.replace(r'^\d{1,2}\s+', '').strip().upper()
    
    # Geçersiz il adlarını filtrele
    invalid = ['GENEL', 'SIRA', 'NO.', 'IL', 'DEFTERDARLIK', 'ILCE', 'MERKEZ', 'VERGI', 'DAIRESI']
    if city in invalid or len(city) < 3:
        continue
    
    name = office.get('name', '').strip()
    if name:
        report[city].append(name)

# TR_PROVINCES ile eşleştir
final_report = {}
for prov in TR_PROVINCES:
    prov_norm = normalize(prov)
    # PDF'de bu il var mı?
    found_city = None
    for pdf_city in report.keys():
        if normalize(pdf_city) == prov_norm:
            found_city = pdf_city
            break
    
    if found_city:
        final_report[prov] = {
            'pdf_city_name': found_city,
            'normalized': prov_norm,
            'count': len(report[found_city]),
            'offices': sorted(report[found_city])
        }
    else:
        final_report[prov] = {
            'pdf_city_name': None,
            'normalized': prov_norm,
            'count': 0,
            'offices': []
        }

# JSON raporu oluştur
output_path = Path('data/tax-offices-report.json')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(final_report, f, ensure_ascii=False, indent=2)

# Konsol çıktısı
print(f"Toplam {len([p for p in final_report.values() if p['count'] > 0])} il icin vergi dairesi bulundu")
print(f"Toplam {sum(p['count'] for p in final_report.values())} vergi dairesi")
print(f"\nRapor kaydedildi: {output_path}")

# İstanbul kontrolü
if 'İstanbul' in final_report:
    ist = final_report['İstanbul']
    print(f"\nIstanbul durumu:")
    print(f"   PDF'deki il adi: {ist['pdf_city_name']}")
    print(f"   Normalize edilmis: {ist['normalized']}")
    print(f"   Vergi dairesi sayisi: {ist['count']}")
    if ist['count'] > 0:
        print(f"   Ilk 5 vergi dairesi:")
        for office in ist['offices'][:5]:
            print(f"     - {office}")


#!/usr/bin/env python3
"""Tüm iller için vergi dairesi kapsamını kontrol et"""
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

# PDF'deki illeri topla
pdf_cities = {}
for office in pdf_data:
    city = office.get('city', '')
    if not city:
        continue
    # Plaka numarasını kaldır
    city = city.replace(r'^\d{1,2}\s+', '').strip().upper()
    if city not in pdf_cities:
        pdf_cities[city] = []
    pdf_cities[city].append(office.get('name', ''))

# Geçersiz il adları
invalid_cities = ['GENEL', 'SIRA', 'NO.', 'IL', 'DEFTERDARLIK', 'ILCE', 'MERKEZ', 'VERGI', 'DAIRESI']

# Eşleştirme kontrolü
missing = []
found = []
for prov in TR_PROVINCES:
    prov_norm = normalize(prov)
    # PDF'de bu il var mı?
    found_city = None
    for pdf_city in pdf_cities.keys():
        if normalize(pdf_city) == prov_norm:
            found_city = pdf_city
            break
    
    if found_city and found_city not in invalid_cities:
        count = len(pdf_cities[found_city])
        found.append((prov, count))
    else:
        missing.append(prov)

print(f"TR_PROVINCES: {len(TR_PROVINCES)} il")
print(f"PDF'de bulunan geçerli iller: {len([c for c in pdf_cities.keys() if c not in invalid_cities and len(c) >= 3])}")
print(f"Eşleşen iller: {len(found)}")
print(f"Eksik iller: {len(missing)}")
print(f"\nEşleşen iller (ilk 20):")
for prov, count in sorted(found)[:20]:
    print(f"  {prov:20s}: {count:2d} vergi dairesi")

if missing:
    print(f"\n⚠️ Eksik iller ({len(missing)}):")
    for prov in missing:
        print(f"  - {prov}")


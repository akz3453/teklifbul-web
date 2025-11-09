#!/usr/bin/env python3
"""
PDF'den vergi dairelerini çıkar ve JSON formatına dönüştür
"""
import json
import re
import sys
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("pdfplumber yuklu degil. Yuklemek icin: pip install pdfplumber")
    sys.exit(1)

def normalize_city_name(city):
    """İl adını normalize et"""
    if not city:
        return None
    city = str(city).strip()
    # Plaka numaralarını kaldır (01-81 arası)
    # Örnek: "13 BITLIS" -> "BITLIS", "10 BALIKESIR" -> "BALIKESIR"
    city = re.sub(r'^\d{1,2}\s+', '', city)  # Baştaki 1-2 haneli sayıyı kaldır
    # Sayı içeriyorsa None dön (sıra numarası olabilir)
    if city.isdigit() or (len(city) <= 3 and city.isdigit()):
        return None
    # Türkçe karakterleri normalize et
    replacements = {
        'İ': 'I', 'ı': 'i', 'Ş': 'S', 'ş': 's', 
        'Ğ': 'G', 'ğ': 'g', 'Ü': 'U', 'ü': 'u',
        'Ö': 'O', 'ö': 'o', 'Ç': 'C', 'ç': 'c'
    }
    for old, new in replacements.items():
        city = city.replace(old, new)
    city = city.upper().strip()
    # Geçersiz değerleri filtrele
    invalid = ['GENEL', 'SIRA', 'NO.', 'IL', 'MERKEZ', 'VERGI', 'DAIRESI']
    if city in invalid or len(city) < 3:
        return None
    return city

def clean_office_name(name):
    """Vergi dairesi adını temizle"""
    if not name:
        return None
    name = str(name).strip()
    # Sıra numarası ve il kodunu kaldır
    # Örnek: "189 13 BİTLİS Merkez 13260 Bitlis Vergi Dairesi" -> "Bitlis Vergi Dairesi"
    # Pattern: sayı sayı İL_ADI ... Vergi Dairesi
    patterns = [
        r'^\d+\s+\d+\s+\w+\s+',  # "189 13 BİTLİS " kısmını kaldır
        r'^\d+\s+',  # Baştaki sayıyı kaldır
        r'\s+\d{5}\s+',  # 5 haneli kodları kaldır (örn: 13260)
        r'Merkez\s+',  # "Merkez " kısmını kaldır
    ]
    for pattern in patterns:
        name = re.sub(pattern, ' ', name, flags=re.IGNORECASE)
    name = ' '.join(name.split())  # Çoklu boşlukları temizle
    
    # İlçe adı tekrarı varsa kaldır (örn: "Tatvan Tatvan" -> "Tatvan", "Güroymak Güroymak" -> "Güroymak")
    parts = name.split()
    if len(parts) >= 2:
        # İlk iki kelime aynıysa (normalize edilmiş) birini kaldır
        first_word = parts[0].strip().upper()
        second_word = parts[1].strip().upper()
        # Türkçe karakterleri normalize et
        replacements = {'İ': 'I', 'Ş': 'S', 'Ğ': 'G', 'Ü': 'U', 'Ö': 'O', 'Ç': 'C'}
        for old, new in replacements.items():
            first_word = first_word.replace(old, new)
            second_word = second_word.replace(old, new)
        if first_word == second_word:
            name = ' '.join(parts[1:])
    
    # "Müdürlüğü" kısmını kaldır
    name = re.sub(r'\s+Müdürlüğü$', '', name, flags=re.IGNORECASE).strip()
    
    # Eğer "Vergi Dairesi" veya "Malmüdürlüğü" yoksa ekle
    if 'vergi' not in name.lower() and 'malmüdür' not in name.lower():
        name = f"{name} Vergi Dairesi"
    return name.strip()

def extract_tax_offices_from_pdf(pdf_path):
    """PDF'den vergi dairelerini çıkar"""
    tax_offices = []
    
    with pdfplumber.open(pdf_path) as pdf:
        current_city = None
        
        for page_num, page in enumerate(pdf.pages, 1):
            print(f"Sayfa {page_num} isleniyor...")
            
            # Tablo formatını dene
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    for row_idx, row in enumerate(table):
                        if not row or len(row) < 2:
                            continue
                        
                        # İlk sütundan il adını bul
                        city_col = None
                        office_col = None
                        
                        # İlk birkaç sütunu kontrol et
                        for col_idx, cell in enumerate(row[:5]):
                            if not cell:
                                continue
                            cell_str = str(cell).strip()
                            
                            # İl adı genellikle büyük harflerle ve 3+ karakter
                            if len(cell_str) >= 3 and cell_str.isupper() and not cell_str.isdigit():
                                # Geçersiz kelimeleri filtrele
                                if cell_str not in ['GENEL', 'SIRA', 'NO.', 'MERKEZ', 'VERGI', 'DAIRESI']:
                                    city_col = normalize_city_name(cell_str)
                                    if city_col:
                                        current_city = city_col
                                        break
                        
                        # Vergi dairesi adını bul (genellikle son sütunlarda)
                        for col_idx, cell in enumerate(row):
                            if not cell:
                                continue
                            cell_str = str(cell).strip()
                            
                            # "Vergi Dairesi" veya "Malmüdürlüğü" içeriyorsa
                            if 'vergi' in cell_str.lower() or 'malmüdür' in cell_str.lower():
                                office_name = clean_office_name(cell_str)
                                if office_name and current_city:
                                    # Çift kayıt kontrolü
                                    if not any(o['name'] == office_name and o['city'] == current_city 
                                              for o in tax_offices):
                                        tax_offices.append({
                                            'name': office_name,
                                            'city': current_city,
                                            'scope': 'district'
                                        })
            
            # Metin fallback
            text = page.extract_text()
            if not text:
                continue
            
            lines = text.split('\n')
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # İl adını bul
                # Format: "13 BİTLİS" veya sadece "BİTLİS"
                city_match = re.search(r'\b([A-ZÇĞIİÖŞÜ]{3,})\b', line)
                if city_match:
                    city_candidate = normalize_city_name(city_match.group(1))
                    if city_candidate:
                        current_city = city_candidate
                
                # Vergi dairesi adını bul
                if 'vergi' in line.lower() or 'malmüdür' in line.lower():
                    office_name = clean_office_name(line)
                    if office_name and current_city:
                        if not any(o['name'] == office_name and o['city'] == current_city 
                                  for o in tax_offices):
                            tax_offices.append({
                                'name': office_name,
                                'city': current_city,
                                'scope': 'district'
                            })
    
    return tax_offices

def main():
    pdf_path = Path('data/vergidaireleri.pdf')
    
    if not pdf_path.exists():
        print(f"PDF dosyasi bulunamadi: {pdf_path}")
        sys.exit(1)
    
    print(f"PDF okunuyor: {pdf_path}")
    tax_offices = extract_tax_offices_from_pdf(pdf_path)
    
    # Geçersiz kayıtları filtrele
    tax_offices = [o for o in tax_offices if o['city'] and o['name'] and 
                   o['city'] not in ['GENEL', 'SIRA', 'NO.', 'IL']]
    
    print(f"\nToplam {len(tax_offices)} vergi dairesi bulundu")
    
    # İllere göre grupla
    by_city = {}
    for office in tax_offices:
        city = office['city']
        if city not in by_city:
            by_city[city] = []
        by_city[city].append(office['name'])
    
    print(f"\nIllere gore dagilim (ilk 20):")
    for city, offices in sorted(by_city.items())[:20]:
        print(f"  {city}: {len(offices)} vergi dairesi")
    
    # Bitlis kontrolü
    if 'BITLIS' in by_city:
        print(f"\nBITLIS icin {len(by_city['BITLIS'])} vergi dairesi:")
        for office in by_city['BITLIS']:
            print(f"  - {office}")
    
    # JSON'a kaydet
    output_path = Path('data/tax-offices-from-pdf.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(tax_offices, f, ensure_ascii=False, indent=2)
    
    print(f"\nJSON dosyasi kaydedildi: {output_path}")
    print(f"   Toplam {len(tax_offices)} vergi dairesi")
    print(f"   Toplam {len(by_city)} il")

if __name__ == '__main__':
    main()

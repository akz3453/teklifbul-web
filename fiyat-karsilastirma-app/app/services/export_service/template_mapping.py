"""
Template mapping constants for Excel template injection
Based on TEKLİF MUKAYESE FORMU.xlsx template structure
"""

# Template koordinatları - TEKLİF MUKAYESE FORMU.xlsx'den alınmıştır
TEMPLATE_MAPPING = {
    "header_row": 7,
    "data_start_row": 9,
    "columns": {
        "no": "A",
        "hizmet_adi": "B", 
        "miktar": "C",
        "birim": "D",
        "vendor": [
            {"birim_fiyat": "F", "toplam": "G", "toplam_tl": "H"},
            {"birim_fiyat": "I", "toplam": "J", "toplam_tl": "K"},
            {"birim_fiyat": "L", "toplam": "M", "toplam_tl": "N"},
            {"birim_fiyat": "O", "toplam": "P", "toplam_tl": "Q"},
            {"birim_fiyat": "R", "toplam": "S", "toplam_tl": "T"}
        ]
    },
    "footer": {
        "odeme_satir": 22,
        "teslim_satir": 24,
        "not_satir": 28,
        "en_uygun_firma_satir": 31,
        "footer_text_column": "B"  # Footer metinleri B sütunundan başlar
    }
}

# Vendor grupları için maksimum sayı
MAX_VENDORS_PER_SHEET = 5
MAX_VENDORS_STANDARD = 3

# Template dosya yolu
TEMPLATE_FILE_PATH = "assets/TEKLİF MUKAYESE FORMU.xlsx"

def get_vendor_column_mapping(vendor_index: int) -> dict:
    """Vendor index'e göre kolon mapping'i getir"""
    if vendor_index >= len(TEMPLATE_MAPPING["columns"]["vendor"]):
        raise ValueError(f"Vendor index {vendor_index} desteklenmiyor. Max: {len(TEMPLATE_MAPPING['columns']['vendor'])}")
    
    return TEMPLATE_MAPPING["columns"]["vendor"][vendor_index]

def get_vendor_columns_for_chunk(vendor_chunk: list) -> list:
    """Vendor chunk'ı için kolon mapping'lerini getir"""
    mappings = []
    for i, vendor in enumerate(vendor_chunk):
        if i >= MAX_VENDORS_PER_SHEET:
            break
        mappings.append(get_vendor_column_mapping(i))
    return mappings

def get_footer_row_mapping() -> dict:
    """Footer satır mapping'ini getir"""
    return TEMPLATE_MAPPING["footer"]

def get_template_coordinates() -> dict:
    """Template koordinatlarını getir"""
    return TEMPLATE_MAPPING

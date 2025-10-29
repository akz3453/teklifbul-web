"""
Domain models for Fiyat Karşılaştırma Tablosu
"""
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime


@dataclass
class Item:
    """Ürün/Hizmet modeli"""
    urun_kodu: str
    hizmet_adi: str
    miktar: float
    birim: str
    aciklama: Optional[str] = None
    kategori: Optional[str] = None


@dataclass
class Vendor:
    """Tedarikçi modeli"""
    firma_adi: str
    firma_id: str
    iletisim_kisi: Optional[str] = None
    telefon: Optional[str] = None
    email: Optional[str] = None


@dataclass
class Offer:
    """Teklif modeli"""
    urun_kodu: str
    firma_adi: str
    firma_id: str
    birim_fiyat: float
    para_birimi: str
    toplam: float
    toplam_tl: float
    odeme_sekli: Optional[str] = None
    teslim_suresi: Optional[str] = None
    teslim_sekli: Optional[str] = None
    notlar: Optional[str] = None
    teklif_tarihi: Optional[datetime] = None
    kdv_orani: Optional[float] = None


@dataclass
class ComparisonRow:
    """Karşılaştırma satırı modeli"""
    no: int
    hizmet_adi: str
    miktar: float
    birim: str
    urun_kodu: str
    vendor_offers: Dict[str, Offer]  # firma_adi -> Offer
    en_iyi_teklif_firma: Optional[str] = None
    en_iyi_teklif_toplam: Optional[float] = None


@dataclass
class Config:
    """Uygulama konfigürasyonu"""
    membership_tier: str = "standard"  # "standard" | "premium"
    max_vendors_standard: int = 3
    max_vendors_per_sheet: int = 5
    default_currency: str = "TL"
    exchange_rates: Dict[str, float] = None
    
    def __post_init__(self):
        if self.exchange_rates is None:
            self.exchange_rates = {
                "USD": 34.50,
                "EUR": 37.20,
                "TL": 1.0
            }


@dataclass
class ExportSettings:
    """Export ayarları"""
    filename_prefix: str = "mukayese"
    include_template_format: bool = True
    create_multiple_sheets: bool = True
    max_vendors_per_sheet: int = 5
    include_signature_areas: bool = True
    include_technical_evaluation: bool = True


@dataclass
class ComparisonResult:
    """Karşılaştırma sonucu"""
    total_items: int
    total_vendors: int
    best_overall_vendor: Optional[str]
    best_overall_total: Optional[float]
    comparison_rows: List[ComparisonRow]
    export_settings: ExportSettings
    config: Config


@dataclass
class PurchaseItem:
    """Satın alma talebi kalemi"""
    sira_no: int
    malzeme_kodu: str
    malzeme_tanimi: str
    marka: str
    birim: str
    miktar: float
    istenilen_teslim_tarihi: Optional[str] = None
    ambardaki_miktar: Optional[float] = None
    siparis_miktari: Optional[float] = None
    hedef_fiyat: Optional[float] = None
    genel_toplam_tl: Optional[float] = None
    
    def __post_init__(self):
        """Veri temizleme ve validasyon"""
        # Numeric alanları temizle
        if self.ambardaki_miktar is not None and pd.isna(self.ambardaki_miktar):
            self.ambardaki_miktar = None
        if self.siparis_miktari is not None and pd.isna(self.siparis_miktari):
            self.siparis_miktari = None
        if self.hedef_fiyat is not None and pd.isna(self.hedef_fiyat):
            self.hedef_fiyat = None
        if self.genel_toplam_tl is not None and pd.isna(self.genel_toplam_tl):
            self.genel_toplam_tl = None


@dataclass
class PurchaseRequest:
    """Satın alma talebi"""
    talep_no: str
    stf_no: str
    stf_tarihi: str
    santiye: str
    alim_yeri: str
    requester: str
    items: List[PurchaseItem] = field(default_factory=list)
    notes: str = ""
    created_at: str = ""
    requested_delivery_date: Optional[str] = None
    status: str = "draft"  # draft, created, sent, completed
    
    def __post_init__(self):
        """Varsayılan değerler"""
        if not self.created_at:
            from datetime import datetime
            self.created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if not self.talep_no:
            self.talep_no = f"PR-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    
    @property
    def total_items(self) -> int:
        """Toplam kalem sayısı"""
        return len(self.items)
    
    @property
    def total_value(self) -> float:
        """Toplam değer (TL)"""
        return sum(item.genel_toplam_tl or 0 for item in self.items)


@dataclass
class VendorGroup:
    """Tedarikçi grubu"""
    id: str
    name: str
    description: str = ""
    vendor_ids: List[str] = field(default_factory=list)
    contact_email: str = ""
    is_active: bool = True


@dataclass
class RFQ:
    """Request for Quotation - Teklif talebi"""
    id: str
    purchase_request_id: str
    vendor_group_id: str
    status: str = "pending"  # pending, sent, received, completed
    created_at: str = ""
    sent_at: Optional[str] = None
    response_deadline: Optional[str] = None
    notes: str = ""
    
    def __post_init__(self):
        """Varsayılan değerler"""
        if not self.created_at:
            from datetime import datetime
            self.created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if not self.id:
            self.id = f"RFQ-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

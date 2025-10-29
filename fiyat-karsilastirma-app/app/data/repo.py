"""
Data repository for Fiyat Karşılaştırma Tablosu
Mock data ile başlayıp gerçek veri kaynaklarına geçiş yapılabilir
"""
import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import random

from ..domain.models import (
    Item, Vendor, Offer, Config, 
    PurchaseRequest, PurchaseItem, VendorGroup, RFQ
)


class DataRepository:
    """Veri erişim katmanı"""
    
    def __init__(self):
        self._items: List[Item] = []
        self._vendors: List[Vendor] = []
        self._offers: List[Offer] = []
        self._config: Optional[Config] = None
        self._load_mock_data()
    
    def _load_mock_data(self):
        """Mock veri yükle"""
        # Mock Items (Ürünler/Hizmetler)
        self._items = [
            Item("ITEM001", "Laptop Dell Inspiron 15", 5, "adet", "İş bilgisayarı", "Bilgisayar"),
            Item("ITEM002", "Yazıcı HP LaserJet Pro", 3, "adet", "Siyah beyaz lazer yazıcı", "Yazıcı"),
            Item("ITEM003", "Projeksiyon Cihazı", 2, "adet", "Konferans salonu için", "Projeksiyon"),
            Item("ITEM004", "Ofis Masa Takımı", 10, "takım", "6 kişilik ofis masası", "Mobilya"),
            Item("ITEM005", "Klima Split Tip", 4, "adet", "18000 BTU", "Klima"),
            Item("ITEM006", "Güvenlik Kamerası", 8, "adet", "IP kamera sistemi", "Güvenlik"),
            Item("ITEM007", "Fotokopi Makinesi", 2, "adet", "Renkli A3 fotokopi", "Fotokopi"),
            Item("ITEM008", "Telefon Santrali", 1, "adet", "32 hatlı IP santral", "Telekom"),
            Item("ITEM009", "Sunucu Rack", 1, "adet", "42U sunucu dolabı", "Sunucu"),
            Item("ITEM010", "UPS Güç Kaynağı", 3, "adet", "3KVA UPS", "Elektrik"),
        ]
        
        # Mock Vendors (Tedarikçiler)
        self._vendors = [
            Vendor("Teknoloji A.Ş.", "VENDOR001", "Ahmet Yılmaz", "0212-555-0101", "ahmet@teknoloji.com"),
            Vendor("Bilgisayar Ltd.", "VENDOR002", "Mehmet Kaya", "0212-555-0102", "mehmet@bilgisayar.com"),
            Vendor("Ofis Malzemeleri", "VENDOR003", "Ayşe Demir", "0212-555-0103", "ayse@ofis.com"),
            Vendor("Elektronik Dünyası", "VENDOR004", "Fatma Öz", "0212-555-0104", "fatma@elektronik.com"),
            Vendor("Mobilya Merkezi", "VENDOR005", "Ali Çelik", "0212-555-0105", "ali@mobilya.com"),
            Vendor("Güvenlik Sistemleri", "VENDOR006", "Zeynep Arslan", "0212-555-0106", "zeynep@guvenlik.com"),
            Vendor("Telekom Çözümleri", "VENDOR007", "Mustafa Yıldız", "0212-555-0107", "mustafa@telekom.com"),
            Vendor("Elektrik Malzemeleri", "VENDOR008", "Elif Kocaman", "0212-555-0108", "elif@elektrik.com"),
        ]
        
        # Mock Offers (Teklifler)
        self._offers = []
        base_date = datetime.now() - timedelta(days=random.randint(1, 30))
        
        for item in self._items:
            # Her ürün için 3-6 farklı teklif oluştur
            num_offers = random.randint(3, 6)
            selected_vendors = random.sample(self._vendors, num_offers)
            
            for vendor in selected_vendors:
                # Fiyat varyasyonu (%80-120 arası)
                base_price = random.uniform(1000, 50000)
                price_variation = random.uniform(0.8, 1.2)
                birim_fiyat = round(base_price * price_variation, 2)
                
                # Para birimi seçimi
                currency = random.choice(["TL", "USD", "EUR"])
                
                # Toplam hesapla
                toplam = birim_fiyat * item.miktar
                
                # TL'ye çevir (basit kur)
                if currency == "USD":
                    toplam_tl = toplam * 34.50
                elif currency == "EUR":
                    toplam_tl = toplam * 37.20
                else:
                    toplam_tl = toplam
                
                offer = Offer(
                    urun_kodu=item.urun_kodu,
                    firma_adi=vendor.firma_adi,
                    firma_id=vendor.firma_id,
                    birim_fiyat=birim_fiyat,
                    para_birimi=currency,
                    toplam=toplam,
                    toplam_tl=toplam_tl,
                    odeme_sekli=random.choice(["Peşin", "30 Gün Vadeli", "60 Gün Vadeli"]),
                    teslim_suresi=f"{random.randint(1, 15)} gün",
                    teslim_sekli=random.choice(["Kargo", "Kurulum ile", "Firma teslimi"]),
                    notlar=random.choice(["Stokta mevcut", "Özel indirim", "Garanti dahil", ""]),
                    teklif_tarihi=base_date + timedelta(days=random.randint(0, 10)),
                    kdv_orani=18.0
                )
                self._offers.append(offer)
        
        # Mock Config
        self._config = Config(
            membership_tier="premium",  # Test için premium
            max_vendors_standard=3,
            max_vendors_per_sheet=5,
            default_currency="TL",
            exchange_rates={
                "USD": 34.50,
                "EUR": 37.20,
                "TL": 1.0
            }
        )
    
    def get_items(self) -> List[Item]:
        """Ürün/hizmet listesini getir"""
        return self._items.copy()
    
    def get_vendors(self) -> List[Vendor]:
        """Tedarikçi listesini getir"""
        return self._vendors.copy()
    
    def get_offers(self) -> List[Offer]:
        """Teklif listesini getir"""
        return self._offers.copy()
    
    def get_config(self) -> Config:
        """Konfigürasyonu getir"""
        return self._config
    
    # Purchase Request Methods
    def create_purchase_request(self, purchase_request: PurchaseRequest) -> str:
        """Satın alma talebi oluştur"""
        # Mock storage - gerçek uygulamada veritabanına kaydet
        if not hasattr(self, '_purchase_requests'):
            self._purchase_requests = []
        
        self._purchase_requests.append(purchase_request)
        return purchase_request.talep_no
    
    def get_purchase_request(self, talep_no: str) -> Optional[PurchaseRequest]:
        """Satın alma talebini getir"""
        if not hasattr(self, '_purchase_requests'):
            return None
        
        for pr in self._purchase_requests:
            if pr.talep_no == talep_no:
                return pr
        return None
    
    def get_all_purchase_requests(self) -> List[PurchaseRequest]:
        """Tüm satın alma taleplerini getir"""
        if not hasattr(self, '_purchase_requests'):
            return []
        return self._purchase_requests.copy()
    
    def update_purchase_request_status(self, talep_no: str, status: str) -> bool:
        """Satın alma talebi durumunu güncelle"""
        if not hasattr(self, '_purchase_requests'):
            return False
        
        for pr in self._purchase_requests:
            if pr.talep_no == talep_no:
                pr.status = status
                return True
        return False
    
    # Vendor Group Methods
    def list_vendor_groups(self) -> List[VendorGroup]:
        """Tedarikçi gruplarını listele"""
        return [
            VendorGroup(
                id="VG001",
                name="Ana Tedarikçiler",
                description="Ana tedarikçi grubu",
                vendor_ids=["V001", "V002", "V003"],
                contact_email="ana@tedarikci.com",
                is_active=True
            ),
            VendorGroup(
                id="VG002", 
                name="Yedek Tedarikçiler",
                description="Yedek tedarikçi grubu",
                vendor_ids=["V004", "V005"],
                contact_email="yedek@tedarikci.com",
                is_active=True
            ),
            VendorGroup(
                id="VG003",
                name="Özel Proje Tedarikçileri",
                description="Özel projeler için tedarikçiler",
                vendor_ids=["V006", "V007", "V008"],
                contact_email="ozel@tedarikci.com",
                is_active=True
            ),
            VendorGroup(
                id="VG004",
                name="Teknoloji Tedarikçileri",
                description="Teknoloji ürünleri tedarikçileri",
                vendor_ids=["V001", "V006"],
                contact_email="teknoloji@tedarikci.com",
                is_active=True
            ),
            VendorGroup(
                id="VG005",
                name="İnşaat Malzemeleri Tedarikçileri",
                description="İnşaat malzemeleri tedarikçileri",
                vendor_ids=["V002", "V003", "V007"],
                contact_email="insaat@tedarikci.com",
                is_active=True
            )
        ]
    
    def get_vendor_group(self, group_id: str) -> Optional[VendorGroup]:
        """Tedarikçi grubunu getir"""
        groups = self.list_vendor_groups()
        for group in groups:
            if group.id == group_id:
                return group
        return None
    
    def get_offers_by_item(self, urun_kodu: str) -> List[Offer]:
        """Belirli bir ürün için teklifleri getir"""
        return [offer for offer in self._offers if offer.urun_kodu == urun_kodu]
    
    def get_vendor_by_id(self, firma_id: str) -> Optional[Vendor]:
        """ID'ye göre tedarikçi getir"""
        for vendor in self._vendors:
            if vendor.firma_id == firma_id:
                return vendor
        return None
    
    def get_item_by_code(self, urun_kodu: str) -> Optional[Item]:
        """Koda göre ürün getir"""
        for item in self._items:
            if item.urun_kodu == urun_kodu:
                return item
        return None
    
    def update_config(self, config: Config):
        """Konfigürasyonu güncelle"""
        self._config = config
    
    def add_offer(self, offer: Offer):
        """Yeni teklif ekle"""
        self._offers.append(offer)
    
    def remove_offer(self, offer: Offer):
        """Teklifi kaldır"""
        if offer in self._offers:
            self._offers.remove(offer)
    
    def get_vendor_names(self) -> List[str]:
        """Tedarikçi isimlerini getir"""
        return [vendor.firma_adi for vendor in self._vendors]
    
    def get_item_codes(self) -> List[str]:
        """Ürün kodlarını getir"""
        return [item.urun_kodu for item in self._items]

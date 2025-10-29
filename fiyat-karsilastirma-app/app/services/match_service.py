"""
Match service for matching items with offers and calculating best deals
"""
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from ..domain.models import Item, Offer, Vendor, ComparisonRow, Config, ComparisonResult, ExportSettings


class MatchService:
    """Ürün-teklif eşleştirme ve en iyi teklif hesaplama servisi"""
    
    def __init__(self, config: Config):
        self.config = config
        self.exchange_rates = config.exchange_rates
    
    def match_items_with_offers(
        self, 
        items: List[Item], 
        offers: List[Offer], 
        vendors: List[Vendor]
    ) -> ComparisonResult:
        """Ürünleri tekliflerle eşleştir ve karşılaştırma sonucu oluştur"""
        
        # Üyelik kurallarına göre tedarikçi sayısını sınırla
        if self.config.membership_tier == "standard":
            max_vendors = self.config.max_vendors_standard
            vendors = vendors[:max_vendors]
        
        # Karşılaştırma satırlarını oluştur
        comparison_rows = []
        vendor_names = [v.firma_adi for v in vendors]
        
        for i, item in enumerate(items, 1):
            # Bu ürün için teklifleri getir
            item_offers = [offer for offer in offers if offer.urun_kodu == item.urun_kodu]
            
            # Sadece seçili tedarikçilerin tekliflerini al
            vendor_offers = {}
            for vendor in vendors:
                vendor_offer = next(
                    (offer for offer in item_offers if offer.firma_adi == vendor.firma_adi), 
                    None
                )
                if vendor_offer:
                    vendor_offers[vendor.firma_adi] = vendor_offer
            
            # En iyi teklifi bul
            best_vendor, best_total = self._find_best_offer(vendor_offers)
            
            comparison_row = ComparisonRow(
                no=i,
                hizmet_adi=item.hizmet_adi,
                miktar=item.miktar,
                birim=item.birim,
                urun_kodu=item.urun_kodu,
                vendor_offers=vendor_offers,
                en_iyi_teklif_firma=best_vendor,
                en_iyi_teklif_toplam=best_total
            )
            comparison_rows.append(comparison_row)
        
        # Genel en iyi tedarikçiyi bul
        best_overall_vendor, best_overall_total = self._find_overall_best_vendor(comparison_rows)
        
        # Export ayarları
        export_settings = ExportSettings(
            filename_prefix="mukayese",
            include_template_format=True,
            create_multiple_sheets=self.config.membership_tier == "premium",
            max_vendors_per_sheet=self.config.max_vendors_per_sheet,
            include_signature_areas=True,
            include_technical_evaluation=True
        )
        
        return ComparisonResult(
            total_items=len(items),
            total_vendors=len(vendors),
            best_overall_vendor=best_overall_vendor,
            best_overall_total=best_overall_total,
            comparison_rows=comparison_rows,
            export_settings=export_settings,
            config=self.config
        )
    
    def _find_best_offer(self, vendor_offers: Dict[str, Offer]) -> Tuple[Optional[str], Optional[float]]:
        """Bir ürün için en iyi teklifi bul"""
        if not vendor_offers:
            return None, None
        
        best_vendor = None
        best_total = float('inf')
        
        for vendor_name, offer in vendor_offers.items():
            if offer.toplam_tl < best_total:
                best_total = offer.toplam_tl
                best_vendor = vendor_name
        
        return best_vendor, best_total if best_total != float('inf') else None
    
    def _find_overall_best_vendor(self, comparison_rows: List[ComparisonRow]) -> Tuple[Optional[str], Optional[float]]:
        """Genel en iyi tedarikçiyi bul"""
        vendor_totals = {}
        
        for row in comparison_rows:
            for vendor_name, offer in row.vendor_offers.items():
                if vendor_name not in vendor_totals:
                    vendor_totals[vendor_name] = 0
                vendor_totals[vendor_name] += offer.toplam_tl
        
        if not vendor_totals:
            return None, None
        
        best_vendor = min(vendor_totals, key=vendor_totals.get)
        best_total = vendor_totals[best_vendor]
        
        return best_vendor, best_total
    
    def convert_currency(self, amount: float, from_currency: str, to_currency: str = "TL") -> float:
        """Para birimi dönüşümü yap"""
        if from_currency == to_currency:
            return amount
        
        if from_currency not in self.exchange_rates:
            return amount
        
        if to_currency not in self.exchange_rates:
            return amount
        
        from_rate = self.exchange_rates[from_currency]
        to_rate = self.exchange_rates[to_currency]
        
        # Önce TL'ye çevir, sonra hedef para birimine
        amount_tl = amount * from_rate
        converted_amount = amount_tl / to_rate
        
        return converted_amount
    
    def calculate_total_with_kdv(self, amount: float, kdv_rate: float = 18.0) -> float:
        """KDV dahil toplam hesapla"""
        return amount * (1 + kdv_rate / 100)
    
    def get_vendor_groups_for_export(self, vendors: List[Vendor]) -> List[List[Vendor]]:
        """Export için tedarikçi gruplarını oluştur"""
        if self.config.membership_tier == "standard":
            # Standard üyelik: sadece ilk grup
            return [vendors[:self.config.max_vendors_standard]]
        
        # Premium üyelik: 5'li gruplar
        groups = []
        for i in range(0, len(vendors), self.config.max_vendors_per_sheet):
            groups.append(vendors[i:i + self.config.max_vendors_per_sheet])
        
        return groups
    
    def get_comparison_dataframe(self, comparison_result: ComparisonResult) -> pd.DataFrame:
        """Karşılaştırma sonucunu DataFrame'e çevir"""
        data = []
        
        for row in comparison_result.comparison_rows:
            row_data = {
                'NO': row.no,
                'HİZMETİN ADI': row.hizmet_adi,
                'MİKTAR': row.miktar,
                'BİRİM': row.birim,
                'ÜRÜN KODU': row.urun_kodu,
                'EN İYİ TEKLİF FİRMA': row.en_iyi_teklif_firma,
                'EN İYİ TEKLİF TOPLAM': row.en_iyi_teklif_toplam
            }
            
            # Her tedarikçi için kolonlar ekle
            for vendor_name in comparison_result.export_settings.get_vendor_names():
                offer = row.vendor_offers.get(vendor_name)
                if offer:
                    row_data.update({
                        f'{vendor_name}_BİRİM_FİYAT': offer.birim_fiyat,
                        f'{vendor_name}_TOPLAM': offer.toplam,
                        f'{vendor_name}_TOPLAM_TL': offer.toplam_tl,
                        f'{vendor_name}_PARA_BİRİMİ': offer.para_birimi,
                        f'{vendor_name}_ÖDEME_ŞEKLİ': offer.odeme_sekli,
                        f'{vendor_name}_TESLİM_SÜRESİ': offer.teslim_suresi,
                        f'{vendor_name}_TESLİM_ŞEKLİ': offer.teslim_sekli,
                        f'{vendor_name}_NOTLAR': offer.notlar
                    })
                else:
                    # Teklif yoksa boş değerler
                    row_data.update({
                        f'{vendor_name}_BİRİM_FİYAT': None,
                        f'{vendor_name}_TOPLAM': None,
                        f'{vendor_name}_TOPLAM_TL': None,
                        f'{vendor_name}_PARA_BİRİMİ': None,
                        f'{vendor_name}_ÖDEME_ŞEKLİ': None,
                        f'{vendor_name}_TESLİM_SÜRESİ': None,
                        f'{vendor_name}_TESLİM_ŞEKLİ': None,
                        f'{vendor_name}_NOTLAR': None
                    })
            
            data.append(row_data)
        
        return pd.DataFrame(data)
    
    def validate_offers(self, offers: List[Offer]) -> List[str]:
        """Teklifleri validate et"""
        errors = []
        
        for offer in offers:
            if offer.birim_fiyat <= 0:
                errors.append(f"Geçersiz fiyat: {offer.firma_adi} - {offer.urun_kodu}")
            
            if offer.para_birimi not in self.exchange_rates:
                errors.append(f"Desteklenmeyen para birimi: {offer.para_birimi}")
            
            if offer.toplam <= 0:
                errors.append(f"Geçersiz toplam: {offer.firma_adi} - {offer.urun_kodu}")
        
        return errors
    
    def get_summary_statistics(self, comparison_result: ComparisonResult) -> Dict[str, Any]:
        """Özet istatistikleri getir"""
        total_items = comparison_result.total_items
        total_vendors = comparison_result.total_vendors
        
        # Her ürün için en iyi teklif sayısı
        vendor_wins = {}
        for row in comparison_result.comparison_rows:
            if row.en_iyi_teklif_firma:
                vendor_wins[row.en_iyi_teklif_firma] = vendor_wins.get(row.en_iyi_teklif_firma, 0) + 1
        
        # En çok kazanan tedarikçi
        most_wins_vendor = max(vendor_wins, key=vendor_wins.get) if vendor_wins else None
        
        return {
            'total_items': total_items,
            'total_vendors': total_vendors,
            'best_overall_vendor': comparison_result.best_overall_vendor,
            'best_overall_total': comparison_result.best_overall_total,
            'vendor_wins': vendor_wins,
            'most_wins_vendor': most_wins_vendor,
            'membership_tier': self.config.membership_tier
        }

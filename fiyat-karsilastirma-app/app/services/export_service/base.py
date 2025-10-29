"""
Base export service class for dual export architecture
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime
import os

from ...domain.models import ComparisonResult, Vendor, ComparisonRow


class BaseExportService(ABC):
    """Export servisleri için base class"""
    
    def __init__(self, comparison_result: ComparisonResult):
        self.comparison_result = comparison_result
        self.config = comparison_result.config
        self.export_settings = comparison_result.export_settings
    
    @abstractmethod
    def export_to_excel(self, output_path: str) -> str:
        """Excel dosyası oluştur"""
        pass
    
    @abstractmethod
    def export_to_csv(self, output_path: str) -> str:
        """CSV dosyası oluştur"""
        pass
    
    def _get_timestamped_filename(self, extension: str) -> str:
        """Tarih damgalı dosya adı oluştur"""
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
        return f"{self.export_settings.filename_prefix}_{timestamp}.{extension}"
    
    def _get_all_vendors(self) -> List[Vendor]:
        """Tüm tedarikçileri getir"""
        vendors = []
        vendor_names = set()
        
        for row in self.comparison_result.comparison_rows:
            for vendor_name in row.vendor_offers.keys():
                if vendor_name not in vendor_names:
                    vendor_names.add(vendor_name)
                    # Mock vendor oluştur (gerçek uygulamada repo'dan gelecek)
                    vendors.append(Vendor(vendor_name, f"VENDOR_{len(vendors)+1}"))
        
        return vendors
    
    def _get_filtered_vendors(self) -> List[Vendor]:
        """Üyelik kurallarına göre filtrelenmiş tedarikçileri getir"""
        all_vendors = self._get_all_vendors()
        
        if self.config.membership_tier == "standard":
            # Standard: sadece ilk 3 tedarikçi
            return all_vendors[:self.config.max_vendors_standard]
        else:
            # Premium: tüm tedarikçiler
            return all_vendors
    
    def _get_vendor_groups_for_export(self) -> List[List[Vendor]]:
        """Export için tedarikçi gruplarını oluştur"""
        filtered_vendors = self._get_filtered_vendors()
        
        if self.config.membership_tier == "standard":
            # Standard: sadece ilk grup
            return [filtered_vendors]
        
        # Premium: 5'li gruplar
        groups = []
        for i in range(0, len(filtered_vendors), self.config.max_vendors_per_sheet):
            groups.append(filtered_vendors[i:i + self.config.max_vendors_per_sheet])
        
        return groups
    
    def _get_best_overall_vendor(self) -> tuple[Optional[str], Optional[float]]:
        """Genel en iyi tedarikçiyi bul"""
        vendor_totals = {}
        
        for row in self.comparison_result.comparison_rows:
            for vendor_name, offer in row.vendor_offers.items():
                if vendor_name not in vendor_totals:
                    vendor_totals[vendor_name] = 0
                vendor_totals[vendor_name] += offer.toplam_tl
        
        if not vendor_totals:
            return None, None
        
        best_vendor = min(vendor_totals, key=vendor_totals.get)
        best_total = vendor_totals[best_vendor]
        
        return best_vendor, best_total
    
    def _validate_output_path(self, output_path: str) -> str:
        """Output path'i validate et"""
        if not os.path.exists(output_path):
            raise FileNotFoundError(f"Output dizini bulunamadı: {output_path}")
        
        if not os.path.isdir(output_path):
            raise NotADirectoryError(f"Output path bir dizin değil: {output_path}")
        
        return output_path
    
    def _get_sheet_name_for_vendor_group(self, vendor_group: List[Vendor], group_index: int) -> str:
        """Vendor grubu için sheet adı oluştur"""
        if len(vendor_group) == 1:
            return vendor_group[0].firma_adi[:31]  # Excel sheet name limit
        
        start_num = group_index * self.config.max_vendors_per_sheet + 1
        end_num = start_num + len(vendor_group) - 1
        return f"Vendors {start_num}-{end_num}"
    
    def _prepare_csv_data(self) -> List[Dict[str, Any]]:
        """CSV verisini hazırla"""
        csv_data = []
        all_vendors = self._get_filtered_vendors()
        
        for row_data in self.comparison_result.comparison_rows:
            csv_row = {
                'NO': row_data.no,
                'HİZMETİN ADI': row_data.hizmet_adi,
                'MİKTAR': row_data.miktar,
                'BİRİM': row_data.birim,
                'ÜRÜN KODU': row_data.urun_kodu,
                'EN İYİ TEKLİF FİRMA': row_data.en_iyi_teklif_firma,
                'EN İYİ TEKLİF TOPLAM': row_data.en_iyi_teklif_toplam
            }
            
            # Her tedarikçi için bilgiler
            for vendor in all_vendors:
                offer = row_data.vendor_offers.get(vendor.firma_adi)
                if offer:
                    csv_row.update({
                        f'{vendor.firma_adi}_BİRİM_FİYAT': offer.birim_fiyat,
                        f'{vendor.firma_adi}_TOPLAM': offer.toplam,
                        f'{vendor.firma_adi}_TOPLAM_TL': offer.toplam_tl,
                        f'{vendor.firma_adi}_PARA_BİRİMİ': offer.para_birimi,
                        f'{vendor.firma_adi}_ÖDEME_ŞEKLİ': offer.odeme_sekli,
                        f'{vendor.firma_adi}_TESLİM_SÜRESİ': offer.teslim_suresi,
                        f'{vendor.firma_adi}_TESLİM_ŞEKLİ': offer.teslim_sekli,
                        f'{vendor.firma_adi}_NOTLAR': offer.notlar
                    })
                else:
                    csv_row.update({
                        f'{vendor.firma_adi}_BİRİM_FİYAT': None,
                        f'{vendor.firma_adi}_TOPLAM': None,
                        f'{vendor.firma_adi}_TOPLAM_TL': None,
                        f'{vendor.firma_adi}_PARA_BİRİMİ': None,
                        f'{vendor.firma_adi}_ÖDEME_ŞEKLİ': None,
                        f'{vendor.firma_adi}_TESLİM_SÜRESİ': None,
                        f'{vendor.firma_adi}_TESLİM_ŞEKLİ': None,
                        f'{vendor.firma_adi}_NOTLAR': None
                    })
            
            csv_data.append(csv_row)
        
        return csv_data

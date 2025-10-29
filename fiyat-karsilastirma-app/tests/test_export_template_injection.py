"""
Test template injection export service
"""
import pytest
import sys
import os
import tempfile
import shutil

# App modülünü path'e ekle
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from app.services.export_service.template_injection import TemplateInjectionExportService
from app.services.export_service.template_mapping import TEMPLATE_MAPPING, get_vendor_column_mapping
from app.domain.models import (
    ComparisonResult, ComparisonRow, Offer, Vendor, 
    Config, ExportSettings
)


class TestTemplateInjectionExportService:
    """TemplateInjectionExportService testleri"""
    
    def setup_method(self):
        """Her test öncesi çalışır"""
        self.temp_dir = tempfile.mkdtemp()
        
        # Test verileri
        self.config = Config(membership_tier="premium")
        
        vendors = [
            Vendor("Vendor A", "VENDOR001"),
            Vendor("Vendor B", "VENDOR002"),
            Vendor("Vendor C", "VENDOR003")
        ]
        
        comparison_rows = [
            ComparisonRow(
                no=1,
                hizmet_adi="Test Item 1",
                miktar=2.0,
                birim="adet",
                urun_kodu="ITEM001",
                vendor_offers={
                    "Vendor A": Offer("ITEM001", "Vendor A", "VENDOR001", 100.0, "TL", 200.0, 200.0),
                    "Vendor B": Offer("ITEM001", "Vendor B", "VENDOR002", 90.0, "TL", 180.0, 180.0)
                },
                en_iyi_teklif_firma="Vendor B",
                en_iyi_teklif_toplam=180.0
            ),
            ComparisonRow(
                no=2,
                hizmet_adi="Test Item 2",
                miktar=3.0,
                birim="adet",
                urun_kodu="ITEM002",
                vendor_offers={
                    "Vendor A": Offer("ITEM002", "Vendor A", "VENDOR001", 50.0, "TL", 150.0, 150.0),
                    "Vendor C": Offer("ITEM002", "Vendor C", "VENDOR003", 45.0, "TL", 135.0, 135.0)
                },
                en_iyi_teklif_firma="Vendor C",
                en_iyi_teklif_toplam=135.0
            )
        ]
        
        self.comparison_result = ComparisonResult(
            total_items=2,
            total_vendors=3,
            best_overall_vendor="Vendor B",
            best_overall_total=315.0,
            comparison_rows=comparison_rows,
            export_settings=ExportSettings(),
            config=self.config
        )
    
    def teardown_method(self):
        """Her test sonrası çalışır"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_template_mapping_constants(self):
        """Template mapping sabitlerini test et"""
        assert TEMPLATE_MAPPING["header_row"] == 7
        assert TEMPLATE_MAPPING["data_start_row"] == 9
        assert TEMPLATE_MAPPING["columns"]["no"] == "A"
        assert TEMPLATE_MAPPING["columns"]["hizmet_adi"] == "B"
        assert TEMPLATE_MAPPING["columns"]["miktar"] == "C"
        assert TEMPLATE_MAPPING["columns"]["birim"] == "D"
        
        # Vendor kolonları
        assert len(TEMPLATE_MAPPING["columns"]["vendor"]) == 5
        
        # İlk vendor kolonları
        vendor1 = TEMPLATE_MAPPING["columns"]["vendor"][0]
        assert vendor1["birim_fiyat"] == "F"
        assert vendor1["toplam"] == "G"
        assert vendor1["toplam_tl"] == "H"
    
    def test_get_vendor_column_mapping(self):
        """Vendor kolon mapping fonksiyonunu test et"""
        # İlk vendor
        mapping = get_vendor_column_mapping(0)
        assert mapping["birim_fiyat"] == "F"
        assert mapping["toplam"] == "G"
        assert mapping["toplam_tl"] == "H"
        
        # İkinci vendor
        mapping = get_vendor_column_mapping(1)
        assert mapping["birim_fiyat"] == "I"
        assert mapping["toplam"] == "J"
        assert mapping["toplam_tl"] == "K"
        
        # Geçersiz index
        with pytest.raises(ValueError):
            get_vendor_column_mapping(10)
    
    def test_template_validation_missing_file(self):
        """Template dosyası eksik olduğunda hata testi"""
        service = TemplateInjectionExportService(self.comparison_result)
        
        # Template dosyası olmadığında hata vermeli
        assert not service._validate_template_exists()
        
        # Export denendiğinde hata vermeli
        with pytest.raises(FileNotFoundError) as exc_info:
            service.export_to_excel(self.temp_dir)
        
        assert "Şablon dosyası eksik" in str(exc_info.value)
    
    def test_csv_export_without_template(self):
        """Template olmadan CSV export testi"""
        service = TemplateInjectionExportService(self.comparison_result)
        
        # CSV export template gerektirmez
        result_path = service.export_to_csv(self.temp_dir)
        
        assert os.path.exists(result_path)
        assert result_path.endswith('.csv')
        
        # CSV içeriği kontrolü
        with open(result_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
            assert 'NO' in content
            assert 'HİZMETİN ADI' in content
            assert 'Test Item 1' in content
    
    def test_standard_membership_vendor_limit(self):
        """Standard üyelik tedarikçi sınırı testi"""
        # Standard üyelik config'i
        self.config.membership_tier = "standard"
        self.config.max_vendors_standard = 3
        
        service = TemplateInjectionExportService(self.comparison_result)
        
        # Sadece ilk 3 tedarikçi filtrelenmeli
        filtered_vendors = service._get_filtered_vendors()
        assert len(filtered_vendors) <= 3
        
        # Vendor grupları
        vendor_groups = service._get_vendor_groups_for_export()
        assert len(vendor_groups) == 1  # Standard'da sadece bir grup
        assert len(vendor_groups[0]) <= 3
    
    def test_premium_membership_vendor_groups(self):
        """Premium üyelik tedarikçi grupları testi"""
        # Premium üyelik config'i
        self.config.membership_tier = "premium"
        self.config.max_vendors_per_sheet = 5
        
        service = TemplateInjectionExportService(self.comparison_result)
        
        # Tüm tedarikçiler filtrelenmeli
        filtered_vendors = service._get_filtered_vendors()
        assert len(filtered_vendors) >= 3
        
        # Vendor grupları
        vendor_groups = service._get_vendor_groups_for_export()
        assert len(vendor_groups) >= 1
        
        # Her grup maksimum 5 tedarikçi içermeli
        for group in vendor_groups:
            assert len(group) <= 5
    
    def test_best_overall_vendor_calculation(self):
        """En iyi tedarikçi hesaplama testi"""
        service = TemplateInjectionExportService(self.comparison_result)
        
        best_vendor, best_total = service._get_best_overall_vendor()
        
        # Vendor B en iyi olmalı (180 + 0 = 180 TL)
        # Vendor A: 200 + 150 = 350 TL
        # Vendor C: 0 + 135 = 135 TL
        assert best_vendor == "Vendor C"
        assert best_total == 135.0
    
    def test_get_template_info(self):
        """Template bilgilerini getirme testi"""
        service = TemplateInjectionExportService(self.comparison_result)
        
        template_info = service.get_template_info()
        
        assert "template_path" in template_info
        assert "template_exists" in template_info
        assert "mapping" in template_info
        assert "max_vendors_per_sheet" in template_info
        assert "supported_export_modes" in template_info
        
        assert template_info["max_vendors_per_sheet"] == 5
        assert "template_injection" in template_info["supported_export_modes"]
    
    def test_empty_comparison_result(self):
        """Boş karşılaştırma sonucu testi"""
        empty_result = ComparisonResult(
            total_items=0,
            total_vendors=0,
            best_overall_vendor=None,
            best_overall_total=None,
            comparison_rows=[],
            export_settings=ExportSettings(),
            config=self.config
        )
        
        service = TemplateInjectionExportService(empty_result)
        
        # CSV export
        csv_path = service.export_to_csv(self.temp_dir)
        assert os.path.exists(csv_path)
        
        # CSV içeriği sadece header olmalı
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            lines = f.readlines()
            assert len(lines) == 1  # Sadece header


if __name__ == "__main__":
    pytest.main([__file__])

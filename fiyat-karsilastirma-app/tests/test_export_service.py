"""
Test export service
"""
import pytest
import sys
import os
import tempfile
import shutil

# App modülünü path'e ekle
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from app.services.export_service import ExportService
from app.domain.models import (
    ComparisonResult, ComparisonRow, Offer, Vendor, 
    Config, ExportSettings
)


class TestExportService:
    """ExportService testleri"""
    
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
        
        self.export_service = ExportService(self.comparison_result)
    
    def teardown_method(self):
        """Her test sonrası çalışır"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_export_to_excel(self):
        """Excel export testi"""
        result_path = self.export_service.export_to_excel(self.temp_dir)
        
        assert os.path.exists(result_path)
        assert result_path.endswith('.xlsx')
        
        # Dosya boyutu kontrolü
        assert os.path.getsize(result_path) > 0
    
    def test_export_to_csv(self):
        """CSV export testi"""
        result_path = self.export_service.export_to_csv(self.temp_dir)
        
        assert os.path.exists(result_path)
        assert result_path.endswith('.csv')
        
        # CSV içeriği kontrolü
        with open(result_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
            assert 'NO' in content
            assert 'HİZMETİN ADI' in content
            assert 'Test Item 1' in content
            assert 'Test Item 2' in content
    
    def test_get_vendor_groups_standard(self):
        """Standard üyelik vendor grupları testi"""
        self.config.membership_tier = "standard"
        self.config.max_vendors_standard = 2
        
        groups = self.export_service._get_vendor_groups()
        assert len(groups) == 1
        assert len(groups[0]) <= 2
    
    def test_get_vendor_groups_premium(self):
        """Premium üyelik vendor grupları testi"""
        self.config.membership_tier = "premium"
        self.config.max_vendors_per_sheet = 2
        
        groups = self.export_service._get_vendor_groups()
        assert len(groups) >= 1
        for group in groups:
            assert len(group) <= 2
    
    def test_get_sheet_name_single_vendor(self):
        """Tek vendor sheet adı testi"""
        vendors = [Vendor("Test Vendor", "VENDOR001")]
        sheet_name = self.export_service._get_sheet_name(vendors, 0)
        assert sheet_name == "Test Vendor"
    
    def test_get_sheet_name_multiple_vendors(self):
        """Çoklu vendor sheet adı testi"""
        vendors = [
            Vendor("Vendor A", "VENDOR001"),
            Vendor("Vendor B", "VENDOR002")
        ]
        sheet_name = self.export_service._get_sheet_name(vendors, 0)
        assert sheet_name == "Vendors 1-2"
    
    def test_prepare_csv_data(self):
        """CSV veri hazırlama testi"""
        csv_data = self.export_service._prepare_csv_data()
        
        assert len(csv_data) == 2  # 2 satır
        
        # İlk satır kontrolü
        first_row = csv_data[0]
        assert first_row['NO'] == 1
        assert first_row['HİZMETİN ADI'] == "Test Item 1"
        assert first_row['MİKTAR'] == 2.0
        assert first_row['BİRİM'] == "adet"
        assert first_row['ÜRÜN KODU'] == "ITEM001"
        assert first_row['EN İYİ TEKLİF FİRMA'] == "Vendor B"
        assert first_row['EN İYİ TEKLİF TOPLAM'] == 180.0
        
        # Vendor kolonları kontrolü
        assert 'Vendor A_BİRİM_FİYAT' in first_row
        assert 'Vendor A_TOPLAM' in first_row
        assert 'Vendor A_TOPLAM_TL' in first_row
        assert first_row['Vendor A_BİRİM_FİYAT'] == 100.0
        assert first_row['Vendor A_TOPLAM'] == 200.0
        assert first_row['Vendor A_TOPLAM_TL'] == 200.0
    
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
        
        empty_export_service = ExportService(empty_result)
        
        # Excel export
        excel_path = empty_export_service.export_to_excel(self.temp_dir)
        assert os.path.exists(excel_path)
        
        # CSV export
        csv_path = empty_export_service.export_to_csv(self.temp_dir)
        assert os.path.exists(csv_path)
        
        # CSV içeriği sadece header olmalı
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            lines = f.readlines()
            assert len(lines) == 1  # Sadece header


if __name__ == "__main__":
    pytest.main([__file__])

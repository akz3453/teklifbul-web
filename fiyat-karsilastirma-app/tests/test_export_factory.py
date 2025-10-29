"""
Test export service factory
"""
import pytest
import sys
import os

# App modülünü path'e ekle
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from app.services.export_service import ExportServiceFactory, ExportService
from app.domain.models import (
    ComparisonResult, ComparisonRow, Offer, Vendor, 
    Config, ExportSettings
)


class TestExportServiceFactory:
    """ExportServiceFactory testleri"""
    
    def setup_method(self):
        """Her test öncesi çalışır"""
        # Test verileri
        self.config = Config(membership_tier="premium")
        
        comparison_rows = [
            ComparisonRow(
                no=1,
                hizmet_adi="Test Item 1",
                miktar=2.0,
                birim="adet",
                urun_kodu="ITEM001",
                vendor_offers={
                    "Vendor A": Offer("ITEM001", "Vendor A", "VENDOR001", 100.0, "TL", 200.0, 200.0)
                },
                en_iyi_teklif_firma="Vendor A",
                en_iyi_teklif_toplam=200.0
            )
        ]
        
        self.comparison_result = ComparisonResult(
            total_items=1,
            total_vendors=1,
            best_overall_vendor="Vendor A",
            best_overall_total=200.0,
            comparison_rows=comparison_rows,
            export_settings=ExportSettings(),
            config=self.config
        )
    
    def test_get_available_export_modes(self):
        """Mevcut export modlarını getirme testi"""
        modes = ExportServiceFactory.get_available_export_modes()
        
        assert "programmatic" in modes
        assert "template_injection" in modes
        
        # Programmatic mode bilgileri
        programmatic = modes["programmatic"]
        assert programmatic["name"] == "Programatik"
        assert "xlsxwriter" in programmatic["description"]
        assert "kenarlık" in programmatic["features"][0].lower()
        
        # Template injection mode bilgileri
        template = modes["template_injection"]
        assert template["name"] == "Şablona Bas"
        assert "openpyxl" in template["library"]
        assert template["requires_template"] is True
    
    def test_validate_export_mode(self):
        """Export mode validasyonu testi"""
        # Geçerli modlar
        assert ExportServiceFactory.validate_export_mode("programmatic") is True
        assert ExportServiceFactory.validate_export_mode("template_injection") is True
        
        # Geçersiz modlar
        assert ExportServiceFactory.validate_export_mode("invalid_mode") is False
        assert ExportServiceFactory.validate_export_mode("") is False
        assert ExportServiceFactory.validate_export_mode(None) is False
    
    def test_create_programmatic_export_service(self):
        """Programmatic export service oluşturma testi"""
        service = ExportServiceFactory.create_export_service(
            self.comparison_result, "programmatic"
        )
        
        assert service is not None
        assert hasattr(service, 'export_to_excel')
        assert hasattr(service, 'export_to_csv')
        assert hasattr(service, '_get_filtered_vendors')
    
    def test_create_template_injection_export_service(self):
        """Template injection export service oluşturma testi"""
        service = ExportServiceFactory.create_export_service(
            self.comparison_result, "template_injection"
        )
        
        assert service is not None
        assert hasattr(service, 'export_to_excel')
        assert hasattr(service, 'export_to_csv')
        assert hasattr(service, '_validate_template_exists')
    
    def test_create_invalid_export_service(self):
        """Geçersiz export service oluşturma testi"""
        with pytest.raises(ValueError) as exc_info:
            ExportServiceFactory.create_export_service(
                self.comparison_result, "invalid_mode"
            )
        
        assert "Desteklenmeyen export mode" in str(exc_info.value)


class TestExportService:
    """ExportService (main service) testleri"""
    
    def setup_method(self):
        """Her test öncesi çalışır"""
        # Test verileri
        self.config = Config(membership_tier="standard")
        
        comparison_rows = [
            ComparisonRow(
                no=1,
                hizmet_adi="Test Item 1",
                miktar=2.0,
                birim="adet",
                urun_kodu="ITEM001",
                vendor_offers={
                    "Vendor A": Offer("ITEM001", "Vendor A", "VENDOR001", 100.0, "TL", 200.0, 200.0)
                },
                en_iyi_teklif_firma="Vendor A",
                en_iyi_teklif_toplam=200.0
            )
        ]
        
        self.comparison_result = ComparisonResult(
            total_items=1,
            total_vendors=1,
            best_overall_vendor="Vendor A",
            best_overall_total=200.0,
            comparison_rows=comparison_rows,
            export_settings=ExportSettings(),
            config=self.config
        )
    
    def test_export_service_initialization(self):
        """ExportService başlatma testi"""
        # Programmatic mode
        service = ExportService(self.comparison_result, "programmatic")
        assert service.export_mode == "programmatic"
        assert service.service is not None
        
        # Template injection mode
        service = ExportService(self.comparison_result, "template_injection")
        assert service.export_mode == "template_injection"
        assert service.service is not None
    
    def test_export_service_default_mode(self):
        """ExportService varsayılan mode testi"""
        service = ExportService(self.comparison_result)
        assert service.export_mode == "programmatic"  # Default mode
    
    def test_get_export_info(self):
        """Export bilgilerini getirme testi"""
        # Programmatic mode
        service = ExportService(self.comparison_result, "programmatic")
        info = service.get_export_info()
        
        assert "export_type" in info or "export_mode" in info
        
        # Template injection mode
        service = ExportService(self.comparison_result, "template_injection")
        info = service.get_export_info()
        
        assert "template_path" in info or "export_mode" in info
    
    def test_validate_export_requirements_programmatic(self):
        """Programmatic export gereksinimleri validasyonu"""
        service = ExportService(self.comparison_result, "programmatic")
        validation = service.validate_export_requirements()
        
        assert validation["valid"] is True
        assert validation["export_mode"] == "programmatic"
        assert len(validation["errors"]) == 0
    
    def test_validate_export_requirements_template_injection(self):
        """Template injection export gereksinimleri validasyonu"""
        service = ExportService(self.comparison_result, "template_injection")
        validation = service.validate_export_requirements()
        
        # Template dosyası olmadığı için valid olmamalı
        assert validation["valid"] is False
        assert validation["export_mode"] == "template_injection"
        assert len(validation["errors"]) > 0
        assert any("Şablon dosyası eksik" in error for error in validation["errors"])
    
    def test_validate_export_requirements_standard_membership(self):
        """Standard üyelik gereksinimleri validasyonu"""
        # Çok tedarikçili test verisi
        self.config.membership_tier = "standard"
        self.config.max_vendors_standard = 2
        
        # 3 tedarikçi ekle
        comparison_rows = [
            ComparisonRow(
                no=1,
                hizmet_adi="Test Item 1",
                miktar=2.0,
                birim="adet",
                urun_kodu="ITEM001",
                vendor_offers={
                    "Vendor A": Offer("ITEM001", "Vendor A", "VENDOR001", 100.0, "TL", 200.0, 200.0),
                    "Vendor B": Offer("ITEM001", "Vendor B", "VENDOR002", 90.0, "TL", 180.0, 180.0),
                    "Vendor C": Offer("ITEM001", "Vendor C", "VENDOR003", 80.0, "TL", 160.0, 160.0)
                },
                en_iyi_teklif_firma="Vendor C",
                en_iyi_teklif_toplam=160.0
            )
        ]
        
        comparison_result = ComparisonResult(
            total_items=1,
            total_vendors=3,
            best_overall_vendor="Vendor C",
            best_overall_total=160.0,
            comparison_rows=comparison_rows,
            export_settings=ExportSettings(),
            config=self.config
        )
        
        service = ExportService(comparison_result, "programmatic")
        validation = service.validate_export_requirements()
        
        assert validation["valid"] is True
        assert len(validation["warnings"]) > 0
        assert any("Standard üyelik" in warning for warning in validation["warnings"])
        assert any("Sadece ilk 2 tedarikçi" in warning for warning in validation["warnings"])


if __name__ == "__main__":
    pytest.main([__file__])

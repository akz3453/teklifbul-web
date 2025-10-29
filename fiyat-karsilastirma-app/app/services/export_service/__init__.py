"""
Export service factory and main export service
"""
from typing import Dict, Any, Optional
from .base import BaseExportService
from .programmatic import ProgrammaticExportService
from .template_injection import TemplateInjectionExportService
from ..match_service import MatchService
from ...domain.models import ComparisonResult, Config


class ExportServiceFactory:
    """Export service factory"""
    
    @staticmethod
    def create_export_service(
        comparison_result: ComparisonResult, 
        export_mode: str = "programmatic"
    ) -> BaseExportService:
        """Export service oluştur"""
        if export_mode == "template_injection":
            return TemplateInjectionExportService(comparison_result)
        elif export_mode == "programmatic":
            return ProgrammaticExportService(comparison_result)
        else:
            raise ValueError(f"Desteklenmeyen export mode: {export_mode}")
    
    @staticmethod
    def get_available_export_modes() -> Dict[str, Dict[str, Any]]:
        """Mevcut export modlarını getir"""
        return {
            "programmatic": {
                "name": "Programatik",
                "description": "xlsxwriter ile programatik Excel oluşturma",
                "features": ["Kenarlık", "Merge hücreler", "Gri şeritler", "İmza alanları"],
                "library": "xlsxwriter"
            },
            "template_injection": {
                "name": "Şablona Bas",
                "description": "TEKLİF MUKAYESE FORMU.xlsx şablonuna veri enjeksiyonu",
                "features": ["Şablon korunur", "Sadece veri yazılır", "Profesyonel format"],
                "library": "openpyxl",
                "requires_template": True
            }
        }
    
    @staticmethod
    def validate_export_mode(export_mode: str) -> bool:
        """Export mode'un geçerli olup olmadığını kontrol et"""
        available_modes = ExportServiceFactory.get_available_export_modes()
        return export_mode in available_modes


class ExportService:
    """Ana export service - factory pattern kullanır"""
    
    def __init__(self, comparison_result: ComparisonResult, export_mode: str = "programmatic"):
        self.comparison_result = comparison_result
        self.export_mode = export_mode
        self.service = ExportServiceFactory.create_export_service(comparison_result, export_mode)
    
    def export_to_excel(self, output_path: str) -> str:
        """Excel export"""
        return self.service.export_to_excel(output_path)
    
    def export_to_csv(self, output_path: str) -> str:
        """CSV export"""
        return self.service.export_to_csv(output_path)
    
    def get_export_info(self) -> Dict[str, Any]:
        """Export bilgilerini getir"""
        if hasattr(self.service, 'get_export_info'):
            return self.service.get_export_info()
        elif hasattr(self.service, 'get_template_info'):
            return self.service.get_template_info()
        else:
            return {
                "export_mode": self.export_mode,
                "service_type": type(self.service).__name__
            }
    
    def validate_export_requirements(self) -> Dict[str, Any]:
        """Export gereksinimlerini validate et"""
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "export_mode": self.export_mode
        }
        
        # Template injection için template kontrolü
        if self.export_mode == "template_injection":
            if hasattr(self.service, '_validate_template_exists'):
                if not self.service._validate_template_exists():
                    validation_result["valid"] = False
                    validation_result["errors"].append(
                        f"Şablon dosyası eksik: {self.service.template_path}"
                    )
        
        # Üyelik kuralları kontrolü
        if self.comparison_result.config.membership_tier == "standard":
            all_vendors = self.service._get_all_vendors()
            if len(all_vendors) > self.comparison_result.config.max_vendors_standard:
                validation_result["warnings"].append(
                    f"Standard üyelik: Sadece ilk {self.comparison_result.config.max_vendors_standard} tedarikçi gösterilecek"
                )
        
        return validation_result


# Backward compatibility için eski ExportService'i export et
__all__ = ['ExportService', 'ExportServiceFactory', 'ProgrammaticExportService', 'TemplateInjectionExportService']

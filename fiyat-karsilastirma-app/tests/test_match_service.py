"""
Test match service
"""
import pytest
import sys
import os

# App modülünü path'e ekle
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from app.services.match_service import MatchService
from app.domain.models import Item, Offer, Vendor, Config


class TestMatchService:
    """MatchService testleri"""
    
    def setup_method(self):
        """Her test öncesi çalışır"""
        self.config = Config(membership_tier="premium")
        self.match_service = MatchService(self.config)
    
    def test_convert_currency(self):
        """Para birimi dönüşümü testi"""
        # TL to USD
        result = self.match_service.convert_currency(34.50, "TL", "USD")
        assert abs(result - 1.0) < 0.01
        
        # USD to TL
        result = self.match_service.convert_currency(1.0, "USD", "TL")
        assert abs(result - 34.50) < 0.01
        
        # Same currency
        result = self.match_service.convert_currency(100.0, "TL", "TL")
        assert result == 100.0
    
    def test_calculate_total_with_kdv(self):
        """KDV hesaplama testi"""
        result = self.match_service.calculate_total_with_kdv(100.0, 18.0)
        assert result == 118.0
        
        result = self.match_service.calculate_total_with_kdv(100.0, 0.0)
        assert result == 100.0
    
    def test_match_items_with_offers(self):
        """Ürün-teklif eşleştirme testi"""
        # Test verileri
        items = [
            Item("ITEM001", "Test Item 1", 2, "adet"),
            Item("ITEM002", "Test Item 2", 3, "adet")
        ]
        
        vendors = [
            Vendor("Vendor A", "VENDOR001"),
            Vendor("Vendor B", "VENDOR002")
        ]
        
        offers = [
            Offer("ITEM001", "Vendor A", "VENDOR001", 100.0, "TL", 200.0, 200.0),
            Offer("ITEM001", "Vendor B", "VENDOR002", 90.0, "TL", 180.0, 180.0),
            Offer("ITEM002", "Vendor A", "VENDOR001", 50.0, "TL", 150.0, 150.0),
            Offer("ITEM002", "Vendor B", "VENDOR002", 60.0, "TL", 180.0, 180.0)
        ]
        
        # Eşleştirme yap
        result = self.match_service.match_items_with_offers(items, offers, vendors)
        
        # Kontrol et
        assert result.total_items == 2
        assert result.total_vendors == 2
        assert len(result.comparison_rows) == 2
        
        # En iyi teklif kontrolü
        assert result.best_overall_vendor == "Vendor B"
        assert result.best_overall_total == 360.0  # 180 + 180
    
    def test_standard_membership_limit(self):
        """Standard üyelik sınırı testi"""
        self.config.membership_tier = "standard"
        self.config.max_vendors_standard = 2
        self.match_service = MatchService(self.config)
        
        items = [Item("ITEM001", "Test Item", 1, "adet")]
        vendors = [
            Vendor("Vendor A", "VENDOR001"),
            Vendor("Vendor B", "VENDOR002"),
            Vendor("Vendor C", "VENDOR003")
        ]
        offers = [
            Offer("ITEM001", "Vendor A", "VENDOR001", 100.0, "TL", 100.0, 100.0),
            Offer("ITEM001", "Vendor B", "VENDOR002", 90.0, "TL", 90.0, 90.0),
            Offer("ITEM001", "Vendor C", "VENDOR003", 80.0, "TL", 80.0, 80.0)
        ]
        
        result = self.match_service.match_items_with_offers(items, offers, vendors)
        
        # Sadece ilk 2 vendor görünmeli
        assert result.total_vendors == 2
        
        # Vendor C'nin teklifi görünmemeli
        comparison_row = result.comparison_rows[0]
        assert "Vendor C" not in comparison_row.vendor_offers
    
    def test_get_vendor_groups_for_export(self):
        """Vendor grupları testi"""
        vendors = [
            Vendor("Vendor A", "VENDOR001"),
            Vendor("Vendor B", "VENDOR002"),
            Vendor("Vendor C", "VENDOR003"),
            Vendor("Vendor D", "VENDOR004"),
            Vendor("Vendor E", "VENDOR005"),
            Vendor("Vendor F", "VENDOR006")
        ]
        
        # Premium üyelik
        self.config.membership_tier = "premium"
        self.config.max_vendors_per_sheet = 5
        self.match_service = MatchService(self.config)
        
        groups = self.match_service.get_vendor_groups_for_export(vendors)
        assert len(groups) == 2
        assert len(groups[0]) == 5
        assert len(groups[1]) == 1
        
        # Standard üyelik
        self.config.membership_tier = "standard"
        self.config.max_vendors_standard = 3
        self.match_service = MatchService(self.config)
        
        groups = self.match_service.get_vendor_groups_for_export(vendors)
        assert len(groups) == 1
        assert len(groups[0]) == 3
    
    def test_validate_offers(self):
        """Teklif validasyonu testi"""
        valid_offers = [
            Offer("ITEM001", "Vendor A", "VENDOR001", 100.0, "TL", 200.0, 200.0),
            Offer("ITEM002", "Vendor B", "VENDOR002", 50.0, "USD", 150.0, 5175.0)
        ]
        
        errors = self.match_service.validate_offers(valid_offers)
        assert len(errors) == 0
        
        # Geçersiz teklifler
        invalid_offers = [
            Offer("ITEM001", "Vendor A", "VENDOR001", -10.0, "TL", 200.0, 200.0),  # Negatif fiyat
            Offer("ITEM002", "Vendor B", "VENDOR002", 50.0, "INVALID", 150.0, 150.0)  # Geçersiz para birimi
        ]
        
        errors = self.match_service.validate_offers(invalid_offers)
        assert len(errors) == 2
    
    def test_get_summary_statistics(self):
        """Özet istatistikler testi"""
        # Mock comparison result oluştur
        from app.domain.models import ComparisonResult, ComparisonRow, ExportSettings
        
        comparison_rows = [
            ComparisonRow(1, "Item 1", 1, "adet", "ITEM001", {"Vendor A": None}, "Vendor A", 100.0),
            ComparisonRow(2, "Item 2", 1, "adet", "ITEM002", {"Vendor A": None}, "Vendor A", 200.0)
        ]
        
        comparison_result = ComparisonResult(
            total_items=2,
            total_vendors=1,
            best_overall_vendor="Vendor A",
            best_overall_total=300.0,
            comparison_rows=comparison_rows,
            export_settings=ExportSettings(),
            config=self.config
        )
        
        stats = self.match_service.get_summary_statistics(comparison_result)
        
        assert stats['total_items'] == 2
        assert stats['total_vendors'] == 1
        assert stats['best_overall_vendor'] == "Vendor A"
        assert stats['best_overall_total'] == 300.0
        assert stats['membership_tier'] == "premium"


if __name__ == "__main__":
    pytest.main([__file__])

"""
Test mapping service
"""
import pytest
import pandas as pd
import os
import sys

# App modülünü path'e ekle
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from app.services.mapping import MappingService


class TestMappingService:
    """MappingService testleri"""
    
    def setup_method(self):
        """Her test öncesi çalışır"""
        self.mapping_service = MappingService()
    
    def test_normalize_vendor_data(self):
        """Vendor veri normalizasyonu testi"""
        # Test verisi
        df = pd.DataFrame({
            'ÜRÜN KODU': ['ITEM001', 'ITEM002'],
            'TEKLİF FİYATI': [100.0, 200.0],
            'PARA BİRİMİ': ['TL', 'USD'],
            'TEKLİF TARİHİ': ['2024-01-01', '2024-01-02']
        })
        
        # Normalize et
        normalized_df = self.mapping_service.normalize_vendor_data(df)
        
        # Kontrol et
        assert 'urun_kodu' in normalized_df.columns
        assert 'birim_fiyat' in normalized_df.columns
        assert 'para_birimi' in normalized_df.columns
        assert 'teklif_tarihi' in normalized_df.columns
    
    def test_get_match_key(self):
        """Match key testi"""
        match_key = self.mapping_service.get_match_key()
        assert match_key == "urun_kodu"
    
    def test_validate_mapping(self):
        """Mapping validasyonu testi"""
        # Geçerli veri
        df = pd.DataFrame({
            'urun_kodu': ['ITEM001', 'ITEM002'],
            'birim_fiyat': [100.0, 200.0],
            'para_birimi': ['TL', 'USD']
        })
        
        result = self.mapping_service.validate_mapping(df)
        assert result['valid'] is True
        assert len(result['errors']) == 0
    
    def test_validate_mapping_invalid(self):
        """Geçersiz mapping validasyonu testi"""
        # Geçersiz veri
        df = pd.DataFrame({
            'wrong_column': ['ITEM001', 'ITEM002'],
            'price': [100.0, 200.0]
        })
        
        result = self.mapping_service.validate_mapping(df)
        assert result['valid'] is True  # Boş değil
        assert len(result['warnings']) > 0
    
    def test_create_sample_mapping(self):
        """Örnek mapping oluşturma testi"""
        df = pd.DataFrame({
            'ÜRÜN KODU': ['ITEM001', 'ITEM002'],
            'FİYAT': [100.0, 200.0],
            'PARA BİRİMİ': ['TL', 'USD'],
            'TARİH': ['2024-01-01', '2024-01-02']
        })
        
        sample_mapping = self.mapping_service.create_sample_mapping(df)
        
        assert 'ÜRÜN KODU' in sample_mapping
        assert sample_mapping['ÜRÜN KODU'] == 'urun_kodu'
        assert 'FİYAT' in sample_mapping
        assert sample_mapping['FİYAT'] == 'birim_fiyat'
    
    def test_empty_dataframe(self):
        """Boş DataFrame testi"""
        df = pd.DataFrame()
        
        normalized_df = self.mapping_service.normalize_vendor_data(df)
        assert normalized_df.empty
        
        result = self.mapping_service.validate_mapping(df)
        assert result['valid'] is False
        assert 'DataFrame boş' in result['errors']


if __name__ == "__main__":
    pytest.main([__file__])

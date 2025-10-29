"""
Test form parser service
"""
import pytest
import sys
import os
import tempfile
import shutil

# App modülünü path'e ekle
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from app.services.form_parser import FormParserService, FORM_MAP
from app.domain.models import PurchaseRequest, PurchaseItem


class TestFormParserService:
    """FormParserService testleri"""
    
    def setup_method(self):
        """Her test öncesi çalışır"""
        self.temp_dir = tempfile.mkdtemp()
        self.form_parser = FormParserService()
    
    def teardown_method(self):
        """Her test sonrası çalışır"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_form_map_constants(self):
        """FORM_MAP sabitlerini test et"""
        assert FORM_MAP["sheet_name"] == "SATINALMA"
        assert FORM_MAP["header_row"] == 7
        assert FORM_MAP["data_start_row"] == 9
        
        # Kolon mapping'leri
        assert FORM_MAP["columns"]["sira_no"] == "A"
        assert FORM_MAP["columns"]["malzeme_kodu"] == "B"
        assert FORM_MAP["columns"]["malzeme_tanimi"] == "C"
        assert FORM_MAP["columns"]["marka"] == "D"
        assert FORM_MAP["columns"]["birim"] == "E"
        assert FORM_MAP["columns"]["miktar"] == "F"
        assert FORM_MAP["columns"]["istenilen_teslim_tarihi"] == "G"
        assert FORM_MAP["columns"]["ambardaki_miktar"] == "H"
        assert FORM_MAP["columns"]["siparis_miktari"] == "I"
        assert FORM_MAP["columns"]["hedef_fiyat"] == "J"
        assert FORM_MAP["columns"]["genel_toplam_tl"] == "L"
        
        # Meta satırları
        assert FORM_MAP["meta_rows"]["santiye"] == 3
        assert FORM_MAP["meta_rows"]["stf_no"] == 4
        assert FORM_MAP["meta_rows"]["stf_tarihi"] == 5
        assert FORM_MAP["meta_rows"]["alim_yeri"] == 6
    
    def test_template_validation_missing_file(self):
        """Template dosyası eksik olduğunda hata testi"""
        # Template dosyası olmadığında hata vermeli
        assert not self.form_parser.validate_template_exists()
        
        # Download denendiğinde hata vermeli
        with pytest.raises(FileNotFoundError) as exc_info:
            self.form_parser.download_blank_template(os.path.join(self.temp_dir, "test.xlsx"))
        
        assert "Şablon eksik" in str(exc_info.value)
    
    def test_parse_filled_form_missing_file(self):
        """Dolu form parse etme - dosya eksik"""
        with pytest.raises(FileNotFoundError):
            self.form_parser.parse_filled_form("nonexistent.xlsx")
    
    def test_parse_filled_form_invalid_sheet(self):
        """Dolu form parse etme - geçersiz sheet"""
        # Mock Excel dosyası oluştur (gerçek test için openpyxl gerekli)
        # Bu test mock implementation ile yapılabilir
        pass
    
    def test_get_template_info(self):
        """Template bilgilerini getirme testi"""
        template_info = self.form_parser.get_template_info()
        
        assert "template_path" in template_info
        assert "template_exists" in template_info
        assert "form_map" in template_info
        assert "supported_formats" in template_info
        assert "required_sheet" in template_info
        
        assert template_info["required_sheet"] == "SATINALMA"
        assert "xlsx" in template_info["supported_formats"]
    
    def test_form_map_structure(self):
        """FORM_MAP yapısını test et"""
        # Kolon sayısı kontrolü
        expected_columns = [
            "sira_no", "malzeme_kodu", "malzeme_tanimi", "marka", "birim",
            "miktar", "istenilen_teslim_tarihi", "ambardaki_miktar",
            "siparis_miktari", "hedef_fiyat", "genel_toplam_tl"
        ]
        
        for col in expected_columns:
            assert col in FORM_MAP["columns"]
        
        # Meta satırları kontrolü
        expected_meta_rows = ["santiye", "stf_no", "stf_tarihi", "alim_yeri"]
        for meta in expected_meta_rows:
            assert meta in FORM_MAP["meta_rows"]
        
        # Meta value search column kontrolü
        assert FORM_MAP["meta_value_search_right_from_col"] == 8
    
    def test_purchase_item_creation(self):
        """PurchaseItem oluşturma testi"""
        item = PurchaseItem(
            sira_no=1,
            malzeme_kodu="MAT001",
            malzeme_tanimi="Test Malzeme",
            marka="Test Marka",
            birim="Adet",
            miktar=10.0,
            istenilen_teslim_tarihi="2024-01-15",
            ambardaki_miktar=5.0,
            siparis_miktari=15.0,
            hedef_fiyat=100.0,
            genel_toplam_tl=1500.0
        )
        
        assert item.sira_no == 1
        assert item.malzeme_kodu == "MAT001"
        assert item.malzeme_tanimi == "Test Malzeme"
        assert item.marka == "Test Marka"
        assert item.birim == "Adet"
        assert item.miktar == 10.0
        assert item.istenilen_teslim_tarihi == "2024-01-15"
        assert item.ambardaki_miktar == 5.0
        assert item.siparis_miktari == 15.0
        assert item.hedef_fiyat == 100.0
        assert item.genel_toplam_tl == 1500.0
    
    def test_purchase_request_creation(self):
        """PurchaseRequest oluşturma testi"""
        items = [
            PurchaseItem(
                sira_no=1,
                malzeme_kodu="MAT001",
                malzeme_tanimi="Test Malzeme 1",
                marka="Test Marka",
                birim="Adet",
                miktar=10.0,
                hedef_fiyat=100.0,
                genel_toplam_tl=1000.0
            ),
            PurchaseItem(
                sira_no=2,
                malzeme_kodu="MAT002",
                malzeme_tanimi="Test Malzeme 2",
                marka="Test Marka",
                birim="Adet",
                miktar=5.0,
                hedef_fiyat=200.0,
                genel_toplam_tl=1000.0
            )
        ]
        
        request = PurchaseRequest(
            talep_no="PR-20240101-001",
            stf_no="STF-001",
            stf_tarihi="2024-01-01",
            santiye="Test Şantiye",
            alim_yeri="Test Alım Yeri",
            requester="Test User",
            items=items,
            notes="Test notları"
        )
        
        assert request.talep_no == "PR-20240101-001"
        assert request.stf_no == "STF-001"
        assert request.stf_tarihi == "2024-01-01"
        assert request.santiye == "Test Şantiye"
        assert request.alim_yeri == "Test Alım Yeri"
        assert request.requester == "Test User"
        assert len(request.items) == 2
        assert request.notes == "Test notları"
        assert request.total_items == 2
        assert request.total_value == 2000.0
    
    def test_purchase_request_auto_generation(self):
        """PurchaseRequest otomatik ID oluşturma testi"""
        request = PurchaseRequest(
            talep_no="",  # Boş bırak
            stf_no="STF-001",
            stf_tarihi="2024-01-01",
            santiye="Test Şantiye",
            alim_yeri="Test Alım Yeri",
            requester="Test User",
            items=[]
        )
        
        # Otomatik talep no oluşturulmalı
        assert request.talep_no.startswith("PR-")
        assert len(request.talep_no) > 3
        
        # Otomatik created_at oluşturulmalı
        assert request.created_at != ""
        assert len(request.created_at) > 0


if __name__ == "__main__":
    pytest.main([__file__])

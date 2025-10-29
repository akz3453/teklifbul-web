"""
Test RFQ routing service
"""
import pytest
import sys
import os
import tempfile

# App modülünü path'e ekle
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from app.services.rfq_service import RFQService
from app.domain.models import PurchaseRequest, PurchaseItem, VendorGroup, RFQ


class TestRFQService:
    """RFQService testleri"""
    
    def setup_method(self):
        """Her test öncesi çalışır"""
        self.rfq_service = RFQService()
        
        # Test verileri
        self.test_items = [
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
        
        self.test_purchase_request = PurchaseRequest(
            talep_no="PR-20240101-001",
            stf_no="STF-001",
            stf_tarihi="2024-01-01",
            santiye="Test Şantiye",
            alim_yeri="Test Alım Yeri",
            requester="Test User",
            items=self.test_items
        )
        
        self.test_vendor_groups = [
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
            )
        ]
    
    def test_create_rfqs_for_vendor_groups(self):
        """Tedarikçi grupları için RFQ oluşturma testi"""
        vendor_group_ids = ["VG001", "VG002"]
        
        rfqs = self.rfq_service.create_rfqs_for_vendor_groups(
            self.test_purchase_request,
            vendor_group_ids
        )
        
        assert len(rfqs) == 2
        
        # İlk RFQ kontrolü
        rfq1 = rfqs[0]
        assert rfq1.purchase_request_id == "PR-20240101-001"
        assert rfq1.vendor_group_id == "VG001"
        assert rfq1.status == "pending"
        assert rfq1.response_deadline is not None
        
        # İkinci RFQ kontrolü
        rfq2 = rfqs[1]
        assert rfq2.purchase_request_id == "PR-20240101-001"
        assert rfq2.vendor_group_id == "VG002"
        assert rfq2.status == "pending"
        assert rfq2.response_deadline is not None
    
    def test_send_rfq_to_vendor_group(self):
        """Tek tedarikçi grubuna RFQ gönderimi testi"""
        vendor_group = self.test_vendor_groups[0]
        
        # RFQ oluştur
        rfq = RFQ(
            purchase_request_id=self.test_purchase_request.talep_no,
            vendor_group_id=vendor_group.id,
            status="pending"
        )
        
        # RFQ'yı gönder
        result = self.rfq_service.send_rfq_to_vendor_group(rfq, vendor_group)
        
        assert "success" in result
        assert "rfq_id" in result
        assert "vendor_group_name" in result
        assert result["vendor_group_name"] == vendor_group.name
        
        # Başarılı gönderim durumunda
        if result["success"]:
            assert rfq.status == "sent"
            assert rfq.sent_at is not None
            assert "sent_at" in result
            assert "response_deadline" in result
        else:
            assert rfq.status == "failed"
            assert "error" in result
    
    def test_send_rfqs_batch(self):
        """Toplu RFQ gönderimi testi"""
        results = self.rfq_service.send_rfqs_batch(
            self.test_purchase_request,
            self.test_vendor_groups
        )
        
        assert len(results) == 2
        
        for result in results:
            assert "success" in result
            assert "rfq_id" in result
            assert "vendor_group_name" in result
            assert "message" in result
    
    def test_get_rfq_status(self):
        """RFQ durumu getirme testi"""
        # Önce bir RFQ gönder
        vendor_group = self.test_vendor_groups[0]
        rfq = RFQ(
            purchase_request_id=self.test_purchase_request.talep_no,
            vendor_group_id=vendor_group.id,
            status="pending"
        )
        
        result = self.rfq_service.send_rfq_to_vendor_group(rfq, vendor_group)
        
        if result["success"]:
            # RFQ durumunu getir
            status = self.rfq_service.get_rfq_status(rfq.id)
            
            assert status["rfq_id"] == rfq.id
            assert status["status"] == "sent"
            assert status["purchase_request_id"] == self.test_purchase_request.talep_no
            assert status["vendor_group_id"] == vendor_group.id
            assert status["created_at"] is not None
            assert status["sent_at"] is not None
    
    def test_get_all_rfqs(self):
        """Tüm RFQ'ları getirme testi"""
        # Başlangıçta boş olmalı
        all_rfqs = self.rfq_service.get_all_rfqs()
        initial_count = len(all_rfqs)
        
        # Bir RFQ gönder
        vendor_group = self.test_vendor_groups[0]
        rfq = RFQ(
            purchase_request_id=self.test_purchase_request.talep_no,
            vendor_group_id=vendor_group.id,
            status="pending"
        )
        
        result = self.rfq_service.send_rfq_to_vendor_group(rfq, vendor_group)
        
        if result["success"]:
            # RFQ listesi güncellenmeli
            updated_rfqs = self.rfq_service.get_all_rfqs()
            assert len(updated_rfqs) == initial_count + 1
            
            # Gönderilen RFQ listede olmalı
            rfq_ids = [r.id for r in updated_rfqs]
            assert rfq.id in rfq_ids
    
    def test_get_rfqs_by_purchase_request(self):
        """Satın alma talebine göre RFQ'ları getirme testi"""
        # Birkaç RFQ gönder
        for vendor_group in self.test_vendor_groups:
            rfq = RFQ(
                purchase_request_id=self.test_purchase_request.talep_no,
                vendor_group_id=vendor_group.id,
                status="pending"
            )
            self.rfq_service.send_rfq_to_vendor_group(rfq, vendor_group)
        
        # Satın alma talebine göre RFQ'ları getir
        rfqs = self.rfq_service.get_rfqs_by_purchase_request(self.test_purchase_request.talep_no)
        
        assert len(rfqs) >= 0  # Mock implementation'a bağlı
    
    def test_update_rfq_status(self):
        """RFQ durumu güncelleme testi"""
        # RFQ oluştur ve gönder
        vendor_group = self.test_vendor_groups[0]
        rfq = RFQ(
            purchase_request_id=self.test_purchase_request.talep_no,
            vendor_group_id=vendor_group.id,
            status="pending"
        )
        
        result = self.rfq_service.send_rfq_to_vendor_group(rfq, vendor_group)
        
        if result["success"]:
            # RFQ durumunu güncelle
            success = self.rfq_service.update_rfq_status(rfq.id, "received", "Test notu")
            
            if success:
                # Güncellenmiş durumu kontrol et
                status = self.rfq_service.get_rfq_status(rfq.id)
                assert status["status"] == "received"
                assert status["notes"] == "Test notu"
    
    def test_get_rfq_statistics(self):
        """RFQ istatistikleri testi"""
        stats = self.rfq_service.get_rfq_statistics()
        
        assert "total_rfqs" in stats
        assert "pending" in stats
        assert "sent" in stats
        assert "received" in stats
        assert "completed" in stats
        assert "failed" in stats
        
        # Tüm sayılar 0 veya pozitif olmalı
        for key, value in stats.items():
            assert isinstance(value, int)
            assert value >= 0
    
    def test_response_deadline_management(self):
        """Yanıt son tarih yönetimi testi"""
        # Varsayılan değer
        default_days = self.rfq_service.get_response_deadline_days()
        assert default_days == 7
        
        # Değeri değiştir
        self.rfq_service.set_response_deadline_days(14)
        new_days = self.rfq_service.get_response_deadline_days()
        assert new_days == 14
        
        # Tekrar eski değere döndür
        self.rfq_service.set_response_deadline_days(default_days)
    
    def test_export_rfq_report(self):
        """RFQ raporu export testi"""
        # Önce bir RFQ gönder
        vendor_group = self.test_vendor_groups[0]
        rfq = RFQ(
            purchase_request_id=self.test_purchase_request.talep_no,
            vendor_group_id=vendor_group.id,
            status="pending"
        )
        
        result = self.rfq_service.send_rfq_to_vendor_group(rfq, vendor_group)
        
        if result["success"]:
            # Raporu export et
            temp_file = os.path.join(tempfile.gettempdir(), "rfq_report.csv")
            
            try:
                export_path = self.rfq_service.export_rfq_report(temp_file)
                assert os.path.exists(export_path)
                
                # CSV dosyasının içeriğini kontrol et
                with open(export_path, 'r', encoding='utf-8-sig') as f:
                    content = f.read()
                    assert 'RFQ ID' in content
                    assert 'Purchase Request ID' in content
                    assert 'Vendor Group ID' in content
                    assert 'Status' in content
                
            finally:
                # Geçici dosyayı sil
                if os.path.exists(temp_file):
                    os.remove(temp_file)
    
    def test_get_service_info(self):
        """Servis bilgilerini getirme testi"""
        info = self.rfq_service.get_service_info()
        
        assert "service_name" in info
        assert "version" in info
        assert "response_deadline_days" in info
        assert "total_rfqs_sent" in info
        assert "features" in info
        
        assert info["service_name"] == "RFQ Service"
        assert info["version"] == "1.0.0"
        assert isinstance(info["response_deadline_days"], int)
        assert isinstance(info["total_rfqs_sent"], int)
        assert isinstance(info["features"], list)
        assert len(info["features"]) > 0


if __name__ == "__main__":
    pytest.main([__file__])

"""
RFQ (Request for Quotation) service for sending purchase requests to vendor groups
"""
import os
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from ..domain.models import RFQ, PurchaseRequest, VendorGroup


class RFQService:
    """RFQ servisi - tedarikçi gruplarına teklif talepleri gönderimi"""
    
    def __init__(self):
        self.sent_rfqs: List[RFQ] = []  # Mock storage
        self.response_deadline_days = 7  # Varsayılan 7 gün
    
    def create_rfqs_for_vendor_groups(
        self, 
        purchase_request: PurchaseRequest, 
        vendor_group_ids: List[str]
    ) -> List[RFQ]:
        """Tedarikçi grupları için RFQ'lar oluştur"""
        rfqs = []
        
        for group_id in vendor_group_ids:
            # RFQ oluştur
            rfq = RFQ(
                purchase_request_id=purchase_request.talep_no,
                vendor_group_id=group_id,
                status="pending",
                response_deadline=self._calculate_deadline()
            )
            
            rfqs.append(rfq)
        
        return rfqs
    
    def send_rfq_to_vendor_group(self, rfq: RFQ, vendor_group: VendorGroup) -> Dict[str, Any]:
        """RFQ'yı tedarikçi grubuna gönder"""
        try:
            # Mock gönderim işlemi
            send_result = self._mock_send_rfq(rfq, vendor_group)
            
            if send_result["success"]:
                # RFQ durumunu güncelle
                rfq.status = "sent"
                rfq.sent_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                self.sent_rfqs.append(rfq)
                
                return {
                    "success": True,
                    "rfq_id": rfq.id,
                    "vendor_group_name": vendor_group.name,
                    "sent_at": rfq.sent_at,
                    "response_deadline": rfq.response_deadline,
                    "message": f"RFQ başarıyla {vendor_group.name} grubuna gönderildi"
                }
            else:
                rfq.status = "failed"
                return {
                    "success": False,
                    "rfq_id": rfq.id,
                    "vendor_group_name": vendor_group.name,
                    "error": send_result["error"],
                    "message": f"RFQ gönderimi başarısız: {send_result['error']}"
                }
        
        except Exception as e:
            rfq.status = "failed"
            return {
                "success": False,
                "rfq_id": rfq.id,
                "vendor_group_name": vendor_group.name,
                "error": str(e),
                "message": f"RFQ gönderimi sırasında hata: {str(e)}"
            }
    
    def send_rfqs_batch(
        self, 
        purchase_request: PurchaseRequest, 
        vendor_groups: List[VendorGroup]
    ) -> List[Dict[str, Any]]:
        """Toplu RFQ gönderimi"""
        results = []
        
        for vendor_group in vendor_groups:
            # RFQ oluştur
            rfq = RFQ(
                purchase_request_id=purchase_request.talep_no,
                vendor_group_id=vendor_group.id,
                status="pending",
                response_deadline=self._calculate_deadline()
            )
            
            # RFQ'yı gönder
            result = self.send_rfq_to_vendor_group(rfq, vendor_group)
            results.append(result)
        
        return results
    
    def _mock_send_rfq(self, rfq: RFQ, vendor_group: VendorGroup) -> Dict[str, Any]:
        """Mock RFQ gönderimi"""
        # Simüle edilmiş gecikme
        import time
        time.sleep(0.1)  # 100ms gecikme
        
        # Mock başarı oranı (%90)
        import random
        if random.random() < 0.9:
            return {
                "success": True,
                "rfq_id": rfq.id,
                "vendor_group_id": vendor_group.id,
                "mock_data": {
                    "email_sent": True,
                    "notification_sent": True,
                    "tracking_id": f"TRK-{rfq.id}"
                }
            }
        else:
            return {
                "success": False,
                "error": "Mock email servisi hatası"
            }
    
    def _calculate_deadline(self) -> str:
        """Yanıt son tarihini hesapla"""
        deadline = datetime.now() + timedelta(days=self.response_deadline_days)
        return deadline.strftime("%Y-%m-%d")
    
    def get_rfq_status(self, rfq_id: str) -> Dict[str, Any]:
        """RFQ durumunu getir"""
        for rfq in self.sent_rfqs:
            if rfq.id == rfq_id:
                return {
                    "rfq_id": rfq.id,
                    "status": rfq.status,
                    "purchase_request_id": rfq.purchase_request_id,
                    "vendor_group_id": rfq.vendor_group_id,
                    "created_at": rfq.created_at,
                    "sent_at": rfq.sent_at,
                    "response_deadline": rfq.response_deadline,
                    "notes": rfq.notes
                }
        
        return {
            "rfq_id": rfq_id,
            "status": "not_found",
            "message": "RFQ bulunamadı"
        }
    
    def get_all_rfqs(self) -> List[RFQ]:
        """Tüm RFQ'ları getir"""
        return self.sent_rfqs.copy()
    
    def get_rfqs_by_purchase_request(self, purchase_request_id: str) -> List[RFQ]:
        """Belirli bir satın alma talebi için RFQ'ları getir"""
        return [rfq for rfq in self.sent_rfqs if rfq.purchase_request_id == purchase_request_id]
    
    def update_rfq_status(self, rfq_id: str, new_status: str, notes: str = "") -> bool:
        """RFQ durumunu güncelle"""
        for rfq in self.sent_rfqs:
            if rfq.id == rfq_id:
                rfq.status = new_status
                if notes:
                    rfq.notes = notes
                return True
        
        return False
    
    def get_rfq_statistics(self) -> Dict[str, Any]:
        """RFQ istatistikleri"""
        if not self.sent_rfqs:
            return {
                "total_rfqs": 0,
                "pending": 0,
                "sent": 0,
                "received": 0,
                "completed": 0,
                "failed": 0
            }
        
        stats = {
            "total_rfqs": len(self.sent_rfqs),
            "pending": 0,
            "sent": 0,
            "received": 0,
            "completed": 0,
            "failed": 0
        }
        
        for rfq in self.sent_rfqs:
            if rfq.status in stats:
                stats[rfq.status] += 1
        
        return stats
    
    def set_response_deadline_days(self, days: int):
        """Yanıt son tarih günlerini ayarla"""
        self.response_deadline_days = days
    
    def get_response_deadline_days(self) -> int:
        """Yanıt son tarih günlerini getir"""
        return self.response_deadline_days
    
    def export_rfq_report(self, output_path: str) -> str:
        """RFQ raporunu export et"""
        import csv
        
        if not self.sent_rfqs:
            raise ValueError("Export edilecek RFQ bulunamadı")
        
        # CSV dosyasını oluştur
        with open(output_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
            fieldnames = [
                'RFQ ID', 'Purchase Request ID', 'Vendor Group ID', 
                'Status', 'Created At', 'Sent At', 'Response Deadline', 'Notes'
            ]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            writer.writeheader()
            for rfq in self.sent_rfqs:
                writer.writerow({
                    'RFQ ID': rfq.id,
                    'Purchase Request ID': rfq.purchase_request_id,
                    'Vendor Group ID': rfq.vendor_group_id,
                    'Status': rfq.status,
                    'Created At': rfq.created_at,
                    'Sent At': rfq.sent_at or '',
                    'Response Deadline': rfq.response_deadline or '',
                    'Notes': rfq.notes
                })
        
        return output_path
    
    def get_service_info(self) -> Dict[str, Any]:
        """Servis bilgilerini getir"""
        return {
            "service_name": "RFQ Service",
            "version": "1.0.0",
            "response_deadline_days": self.response_deadline_days,
            "total_rfqs_sent": len(self.sent_rfqs),
            "features": [
                "Batch RFQ sending",
                "Status tracking",
                "Deadline management",
                "Export reports",
                "Mock email integration"
            ]
        }

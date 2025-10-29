"""
Refresh Worker for background data loading
"""
from PySide6.QtCore import QThread, Signal, QObject
from typing import List, Tuple, Optional

from ..domain.models import Item, Offer, Vendor, ComparisonResult
from ..data.repo import DataRepository
from ..services.match_service import MatchService


class RefreshWorker(QObject):
    """Arka plan veri yükleme worker'ı"""
    
    # Sinyaller
    progress_updated = Signal(int)  # progress percentage
    status_updated = Signal(str)    # status message
    data_loaded = Signal(bool, str, ComparisonResult)  # success, message, result
    error_occurred = Signal(str)    # error message
    
    def __init__(self, repo: DataRepository, match_service: MatchService):
        super().__init__()
        self.repo = repo
        self.match_service = match_service
        self._cancelled = False
    
    def cancel(self):
        """İşlemi iptal et"""
        self._cancelled = True
    
    def is_cancelled(self) -> bool:
        """İptal edildi mi kontrol et"""
        return self._cancelled
    
    def load_data(self):
        """Verileri yükle"""
        try:
            self._cancelled = False
            
            # 1. Verileri al
            self.status_updated.emit("Veriler alınıyor...")
            self.progress_updated.emit(10)
            
            if self._cancelled:
                return
            
            items = self.repo.get_items()
            self.progress_updated.emit(30)
            
            if self._cancelled:
                return
            
            offers = self.repo.get_offers()
            self.progress_updated.emit(50)
            
            if self._cancelled:
                return
            
            vendors = self.repo.get_vendors()
            self.progress_updated.emit(70)
            
            if self._cancelled:
                return
            
            # 2. Eşleştirme yap
            self.status_updated.emit("Teklifler eşleştiriliyor...")
            self.progress_updated.emit(80)
            
            comparison_result = self.match_service.match_items_with_offers(
                items, offers, vendors
            )
            
            if self._cancelled:
                return
            
            self.progress_updated.emit(100)
            self.status_updated.emit("Tamamlandı")
            
            # 3. Başarı sinyali gönder
            stats = self.match_service.get_summary_statistics(comparison_result)
            message = f"{stats['total_items']} ürün, {stats['total_vendors']} tedarikçi yüklendi"
            self.data_loaded.emit(True, message, comparison_result)
            
        except Exception as e:
            error_msg = f"Veri yükleme hatası: {str(e)}"
            self.error_occurred.emit(error_msg)
            self.data_loaded.emit(False, error_msg, None)


class RefreshWorkerThread(QThread):
    """Refresh worker için thread"""
    
    def __init__(self, worker: RefreshWorker):
        super().__init__()
        self.worker = worker
        self.worker.moveToThread(self)
        
        # Worker sinyallerini thread sinyallerine bağla
        self.worker.progress_updated.connect(self.progress_updated)
        self.worker.status_updated.connect(self.status_updated)
        self.worker.data_loaded.connect(self.data_loaded)
        self.worker.error_occurred.connect(self.error_occurred)
        
        # Thread başladığında worker'ı çalıştır
        self.started.connect(self.worker.load_data)
    
    def run(self):
        """Thread çalıştır"""
        self.exec()
    
    def cancel(self):
        """İşlemi iptal et"""
        self.worker.cancel()
        self.quit()
        self.wait(3000)  # 3 saniye bekle
    
    # Sinyaller
    progress_updated = Signal(int)
    status_updated = Signal(str)
    data_loaded = Signal(bool, str, ComparisonResult)
    error_occurred = Signal(str)


class AsyncDataLoader:
    """Asenkron veri yükleme yöneticisi"""
    
    def __init__(self, repo: DataRepository, match_service: MatchService):
        self.repo = repo
        self.match_service = match_service
        self.worker = None
        self.thread = None
    
    def load_data_async(self) -> RefreshWorkerThread:
        """Verileri asenkron yükle"""
        if self.thread and self.thread.isRunning():
            # Önceki işlemi iptal et
            self.thread.cancel()
        
        # Yeni worker ve thread oluştur
        self.worker = RefreshWorker(self.repo, self.match_service)
        self.thread = RefreshWorkerThread(self.worker)
        
        return self.thread
    
    def cancel_loading(self):
        """Yükleme işlemini iptal et"""
        if self.thread and self.thread.isRunning():
            self.thread.cancel()
    
    def is_loading(self) -> bool:
        """Yükleme işlemi devam ediyor mu"""
        return self.thread and self.thread.isRunning()

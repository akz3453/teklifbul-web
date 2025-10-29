"""
Main Window for Fiyat Karşılaştırma Tablosu
"""
import os
import sys
from PySide6.QtWidgets import (
    QMainWindow, QMessageBox, QFileDialog, QProgressDialog, 
    QApplication, QDialog
)
from PySide6.QtCore import Qt, QThread, Signal, QTimer
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtUiTools import QUiLoader

from ..data.repo import DataRepository
from ..services.match_service import MatchService
from ..services.export_service import ExportService, ExportServiceFactory
from .compare_view import CompareView
from .purchase_tab import PurchaseTab


class MainWindow(QMainWindow):
    """Ana pencere sınıfı"""
    
    def __init__(self):
        super().__init__()
        
        # Veri katmanları
        self.repo = DataRepository()
        self.config = self.repo.get_config()
        self.match_service = MatchService(self.config)
        
        # UI bileşenleri
        self.compare_view = None
        self.progress_dialog = None
        
        # Setup UI
        self.setup_ui()
        self.setup_connections()
        self.setup_status_bar()
        
        # İlk veri yükleme
        QTimer.singleShot(100, self.load_data)
    
    def setup_ui(self):
        """UI'yi kur"""
        # UI dosyasını yükle
        ui_file_path = os.path.join(os.path.dirname(__file__), "main_window.ui")
        loader = QUiLoader()
        
        try:
            ui_file = open(ui_file_path, 'r', encoding='utf-8')
            self.ui = loader.load(ui_file, self)
            ui_file.close()
            
            # CompareView'ı oluştur ve yerleştir
            # Tab widget oluştur
            from PySide6.QtWidgets import QTabWidget
            self.tab_widget = QTabWidget()
            
            # Compare tab
            self.compare_view = CompareView(self.repo, self.match_service, self)
            self.tab_widget.addTab(self.compare_view, "Fiyat Karşılaştırma")
            
            # Purchase tab
            self.purchase_tab = PurchaseTab(self.repo, self)
            self.tab_widget.addTab(self.purchase_tab, "Satın Alma Talepleri")
            
            self.ui.verticalLayout.addWidget(self.tab_widget)
            
        except Exception as e:
            QMessageBox.critical(self, "Hata", f"UI dosyası yüklenemedi: {str(e)}")
            sys.exit(1)
    
    def setup_connections(self):
        """Sinyal bağlantılarını kur"""
        # Menu actions
        self.ui.actionYenile.triggered.connect(self.refresh_data)
        self.ui.actionExcelExport.triggered.connect(self.export_excel)
        self.ui.actionCSVExport.triggered.connect(self.export_csv)
        self.ui.actionCikis.triggered.connect(self.close)
        self.ui.actionVendorSettings.triggered.connect(self.show_vendor_settings)
        self.ui.actionConfigSettings.triggered.connect(self.show_config_settings)
        self.ui.actionHakkinda.triggered.connect(self.show_about)
        
        # CompareView sinyalleri
        if self.compare_view:
            self.compare_view.data_loaded.connect(self.on_data_loaded)
            self.compare_view.export_requested.connect(self.on_export_requested)
            self.compare_view.error_occurred.connect(self.on_error_occurred)
        
        # PurchaseTab sinyalleri
        if self.purchase_tab:
            self.purchase_tab.request_created.connect(self.on_request_created)
            self.purchase_tab.rfq_sent.connect(self.on_rfq_sent)
            self.purchase_tab.error_occurred.connect(self.on_error_occurred)
            self.purchase_tab.status_changed.connect(self.on_status_changed)
    
    def setup_status_bar(self):
        """Status bar'ı kur"""
        self.statusBar().showMessage("Hazır")
        
        # Üyelik tipi göstergesi
        membership_text = f"Üyelik: {self.config.membership_tier.title()}"
        from PySide6.QtWidgets import QLabel
        membership_label = QLabel(membership_text)
        membership_label.setStyleSheet("QLabel { color: #666; font-size: 10px; }")
        self.statusBar().addPermanentWidget(membership_label)
    
    def load_data(self):
        """Verileri yükle"""
        if self.compare_view:
            self.compare_view.load_data()
    
    def refresh_data(self):
        """Verileri yenile"""
        self.statusBar().showMessage("Veriler yenileniyor...")
        self.load_data()
    
    def export_excel(self):
        """Excel export"""
        if not self.compare_view or not self.compare_view.comparison_result:
            QMessageBox.warning(self, "Uyarı", "Export için veri bulunamadı!")
            return
        
        # Dosya seç dialog
        filename, _ = QFileDialog.getSaveFileName(
            self, 
            "Excel Dosyasını Kaydet",
            f"mukayese_{self.get_timestamp()}.xlsx",
            "Excel Dosyaları (*.xlsx)"
        )
        
        if filename:
            self.perform_export(filename, "excel")
    
    def export_csv(self):
        """CSV export"""
        if not self.compare_view or not self.compare_view.comparison_result:
            QMessageBox.warning(self, "Uyarı", "Export için veri bulunamadı!")
            return
        
        # Dosya seç dialog
        filename, _ = QFileDialog.getSaveFileName(
            self, 
            "CSV Dosyasını Kaydet",
            f"mukayese_{self.get_timestamp()}.csv",
            "CSV Dosyaları (*.csv)"
        )
        
        if filename:
            self.perform_export(filename, "csv")
    
    def perform_export(self, filename: str, export_type: str):
        """Export işlemini gerçekleştir"""
        try:
            self.statusBar().showMessage(f"{export_type.upper()} export yapılıyor...")
            
            # Export mode'u al
            export_mode = self.compare_view.get_export_mode()
            
            # Export service oluştur
            export_service = ExportService(self.compare_view.comparison_result, export_mode)
            
            # Export gereksinimlerini validate et
            validation = export_service.validate_export_requirements()
            if not validation["valid"]:
                error_msg = "\n".join(validation["errors"])
                QMessageBox.critical(self, "Export Hatası", f"Export gereksinimleri karşılanamadı:\n{error_msg}")
                return
            
            # Warning'leri göster
            if validation["warnings"]:
                warning_msg = "\n".join(validation["warnings"])
                QMessageBox.warning(self, "Export Uyarısı", f"Uyarılar:\n{warning_msg}")
            
            if export_type == "excel":
                result_path = export_service.export_to_excel(os.path.dirname(filename))
            else:
                result_path = export_service.export_to_csv(os.path.dirname(filename))
            
            self.statusBar().showMessage(f"Export tamamlandı: {result_path}")
            QMessageBox.information(
                self, 
                "Başarılı", 
                f"{export_type.upper()} dosyası başarıyla oluşturuldu:\n{result_path}"
            )
            
        except Exception as e:
            QMessageBox.critical(
                self, 
                "Export Hatası", 
                f"Export sırasında hata oluştu:\n{str(e)}"
            )
            self.statusBar().showMessage("Export başarısız")
    
    def show_vendor_settings(self):
        """Tedarikçi ayarları dialog'unu göster"""
        from .vendor_settings_dialog import VendorSettingsDialog
        
        dialog = VendorSettingsDialog(self.repo, self)
        if dialog.exec() == QDialog.Accepted:
            # Ayarlar güncellendi, verileri yenile
            self.refresh_data()
    
    def show_config_settings(self):
        """Konfigürasyon ayarları dialog'unu göster"""
        from .config_settings_dialog import ConfigSettingsDialog
        
        dialog = ConfigSettingsDialog(self.repo, self)
        if dialog.exec() == QDialog.Accepted:
            # Konfigürasyon güncellendi, servisleri yeniden oluştur
            self.config = self.repo.get_config()
            self.match_service = MatchService(self.config)
            if self.compare_view:
                self.compare_view.match_service = self.match_service
            self.refresh_data()
    
    def show_about(self):
        """Hakkında dialog'unu göster"""
        QMessageBox.about(
            self,
            "Hakkında",
            "Fiyat Karşılaştırma Tablosu v1.0\n\n"
            "Teklifbul tarafından geliştirilmiştir.\n"
            "Ürün tekliflerini karşılaştırır ve Excel/CSV export sağlar.\n\n"
            "Özellikler:\n"
            "- Üyelik tipi desteği (Standard/Premium)\n"
            "- Dinamik tedarikçi kolonları\n"
            "- Excel şablonu ile uyumlu export\n"
            "- Çok sayfa/sheet desteği\n"
            "- Teknik değerlendirme otomasyonu"
        )
    
    # PurchaseTab signal handlers
    def on_request_created(self, talep_no: str):
        """Talep oluşturulduğunda"""
        self.statusBar().showMessage(f"Talep oluşturuldu: {talep_no}")
    
    def on_rfq_sent(self, results: list):
        """RFQ gönderildiğinde"""
        success_count = sum(1 for r in results if r["success"])
        total_count = len(results)
        self.statusBar().showMessage(f"{success_count}/{total_count} RFQ gönderildi")
    
    def on_status_changed(self, message: str):
        """Durum değiştiğinde"""
        self.statusBar().showMessage(message)
    
    def on_data_loaded(self, success: bool, message: str):
        """Veri yükleme sonucu"""
        if success:
            self.statusBar().showMessage(f"Veriler yüklendi: {message}")
        else:
            self.statusBar().showMessage(f"Veri yükleme hatası: {message}")
            QMessageBox.warning(self, "Veri Yükleme Hatası", message)
    
    def on_export_requested(self, export_type: str):
        """Export isteği"""
        if export_type == "excel":
            self.export_excel()
        elif export_type == "csv":
            self.export_csv()
    
    def on_error_occurred(self, error_message: str):
        """Hata oluştu"""
        self.statusBar().showMessage(f"Hata: {error_message}")
        QMessageBox.critical(self, "Hata", error_message)
    
    def get_timestamp(self) -> str:
        """Timestamp oluştur"""
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d_%H%M")
    
    def closeEvent(self, event):
        """Pencere kapanırken"""
        reply = QMessageBox.question(
            self,
            "Çıkış",
            "Uygulamadan çıkmak istediğinizden emin misiniz?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            event.accept()
        else:
            event.ignore()



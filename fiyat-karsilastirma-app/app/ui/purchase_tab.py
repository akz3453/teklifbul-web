"""
Purchase Tab UI for satın alma talep formu operations
"""
import os
import sys
from typing import List, Dict, Any, Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox, QPushButton, 
    QTableView, QLabel, QListWidget, QProgressBar, QMessageBox,
    QFileDialog, QProgressDialog, QHeaderView, QAbstractItemView
)
from PySide6.QtCore import Qt, Signal, QAbstractTableModel, QModelIndex, QThread, QTimer
from PySide6.QtGui import QFont, QColor, QPalette
from PySide6.QtUiTools import QUiLoader

from ..domain.models import PurchaseRequest, PurchaseItem, VendorGroup, RFQ
from ..data.repo import DataRepository
from ..services.form_parser import FormParserService
from ..services.rfq_service import RFQService


class PurchaseItemsTableModel(QAbstractTableModel):
    """Satın alma kalemleri için tablo modeli"""
    
    def __init__(self, items: List[PurchaseItem], parent=None):
        super().__init__(parent)
        self._items = items
        self._headers = [
            'Sıra No', 'Malzeme Kodu', 'Malzeme Tanımı', 'Marka', 
            'Birim', 'Miktar', 'Teslim Tarihi', 'Ambardaki Miktar',
            'Sipariş Miktarı', 'Hedef Fiyat', 'Genel Toplam TL'
        ]
    
    def rowCount(self, parent=QModelIndex()) -> int:
        return len(self._items)
    
    def columnCount(self, parent=QModelIndex()) -> int:
        return len(self._headers)
    
    def headerData(self, section: int, orientation: Qt.Orientation, role: int = Qt.DisplayRole):
        if role == Qt.DisplayRole and orientation == Qt.Horizontal:
            return self._headers[section]
        return None
    
    def data(self, index: QModelIndex, role: int = Qt.DisplayRole):
        if not index.isValid():
            return None
        
        if role == Qt.DisplayRole:
            item = self._items[index.row()]
            col = index.column()
            
            if col == 0: return item.sira_no
            elif col == 1: return item.malzeme_kodu
            elif col == 2: return item.malzeme_tanimi
            elif col == 3: return item.marka
            elif col == 4: return item.birim
            elif col == 5: return item.miktar
            elif col == 6: return item.istenilen_teslim_tarihi or ""
            elif col == 7: return item.ambardaki_miktar or ""
            elif col == 8: return item.siparis_miktari or ""
            elif col == 9: return item.hedef_fiyat or ""
            elif col == 10: return item.genel_toplam_tl or ""
        
        elif role == Qt.TextAlignmentRole:
            if index.column() in [0, 5, 7, 8, 9, 10]:  # Numeric columns
                return Qt.AlignRight | Qt.AlignVCenter
            return Qt.AlignLeft | Qt.AlignVCenter
        
        elif role == Qt.BackgroundRole:
            if index.column() in [9, 10]:  # Price columns
                return QColor(240, 248, 255)  # Light blue
        
        return None
    
    def update_items(self, items: List[PurchaseItem]):
        """Kalemleri güncelle"""
        self.beginResetModel()
        self._items = items
        self.endResetModel()


class PurchaseTab(QWidget):
    """Satın alma talep formu sekmesi"""
    
    # Sinyaller
    request_created = Signal(str)  # talep_no
    rfq_sent = Signal(list)  # rfq_results
    error_occurred = Signal(str)  # error_message
    status_changed = Signal(str)  # status_message
    
    def __init__(self, repo: DataRepository, parent=None):
        super().__init__(parent)
        
        self.repo = repo
        self.form_parser = FormParserService()
        self.rfq_service = RFQService()
        self.current_purchase_request: Optional[PurchaseRequest] = None
        self.vendor_groups: List[VendorGroup] = []
        
        self.setup_ui()
        self.setup_connections()
        self.load_vendor_groups()
    
    def setup_ui(self):
        """UI'yi kur"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        
        # Template işlemleri
        self.setup_template_section(layout)
        
        # Önizleme
        self.setup_preview_section(layout)
        
        # Tedarikçi grupları
        self.setup_vendor_groups_section(layout)
        
        # İşlemler
        self.setup_actions_section(layout)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
    
    def setup_template_section(self, layout: QVBoxLayout):
        """Template işlemleri bölümü"""
        template_group = QGroupBox("Talep Formu İşlemleri")
        template_layout = QHBoxLayout(template_group)
        
        # Boş şablonu indir
        self.download_template_btn = QPushButton("Boş Şablonu İndir")
        self.download_template_btn.setToolTip("Boş Excel şablonunu indirin")
        template_layout.addWidget(self.download_template_btn)
        
        # Dolu formu yükle
        self.upload_form_btn = QPushButton("Dolu Formu Yükle")
        self.upload_form_btn.setToolTip("Doldurulmuş Excel formunu yükleyin")
        template_layout.addWidget(self.upload_form_btn)
        
        template_layout.addStretch()
        layout.addWidget(template_group)
    
    def setup_preview_section(self, layout: QVBoxLayout):
        """Önizleme bölümü"""
        self.preview_group = QGroupBox("Talep Önizleme")
        self.preview_group.setEnabled(False)
        preview_layout = QVBoxLayout(self.preview_group)
        
        # Talep bilgileri
        self.request_info_label = QLabel("Talep Bilgileri:")
        preview_layout.addWidget(self.request_info_label)
        
        # Kalemler tablosu
        self.items_table = QTableView()
        self.items_table.setAlternatingRowColors(True)
        self.items_table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.items_table.horizontalHeader().setStretchLastSection(True)
        self.items_table.verticalHeader().setVisible(False)
        
        preview_layout.addWidget(self.items_table)
        layout.addWidget(self.preview_group)
    
    def setup_vendor_groups_section(self, layout: QVBoxLayout):
        """Tedarikçi grupları bölümü"""
        self.vendor_group = QGroupBox("Tedarikçi Grupları")
        self.vendor_group.setEnabled(False)
        vendor_layout = QVBoxLayout(self.vendor_group)
        
        # Tedarikçi grupları listesi
        self.vendor_groups_list = QListWidget()
        self.vendor_groups_list.setSelectionMode(QAbstractItemView.MultiSelection)
        self.vendor_groups_list.setToolTip("RFQ gönderilecek tedarikçi gruplarını seçin")
        
        vendor_layout.addWidget(self.vendor_groups_list)
        layout.addWidget(self.vendor_group)
    
    def setup_actions_section(self, layout: QVBoxLayout):
        """İşlemler bölümü"""
        self.actions_group = QGroupBox("İşlemler")
        self.actions_group.setEnabled(False)
        actions_layout = QHBoxLayout(self.actions_group)
        
        # Önizle & Oluştur
        self.preview_create_btn = QPushButton("Önizle & Oluştur")
        self.preview_create_btn.setToolTip("Talep önizlemesini göster ve oluştur")
        actions_layout.addWidget(self.preview_create_btn)
        
        # Tedarikçi gruplarına gönder
        self.send_to_vendors_btn = QPushButton("Tedarikçi Gruplarına Gönder")
        self.send_to_vendors_btn.setToolTip("Seçili tedarikçi gruplarına RFQ gönder")
        actions_layout.addWidget(self.send_to_vendors_btn)
        
        actions_layout.addStretch()
        layout.addWidget(self.actions_group)
    
    def setup_connections(self):
        """Sinyal bağlantılarını kur"""
        self.download_template_btn.clicked.connect(self.download_blank_template)
        self.upload_form_btn.clicked.connect(self.upload_filled_form)
        self.preview_create_btn.clicked.connect(self.preview_and_create_request)
        self.send_to_vendors_btn.clicked.connect(self.send_to_vendor_groups)
    
    def load_vendor_groups(self):
        """Tedarikçi gruplarını yükle"""
        try:
            self.vendor_groups = self.repo.list_vendor_groups()
            
            # List widget'ı güncelle
            self.vendor_groups_list.clear()
            for group in self.vendor_groups:
                item_text = f"{group.name} ({len(group.vendor_ids)} tedarikçi)"
                self.vendor_groups_list.addItem(item_text)
            
            self.status_changed.emit(f"{len(self.vendor_groups)} tedarikçi grubu yüklendi")
            
        except Exception as e:
            self.error_occurred.emit(f"Tedarikçi grupları yüklenemedi: {str(e)}")
    
    def download_blank_template(self):
        """Boş şablonu indir"""
        try:
            # Template dosyasının varlığını kontrol et
            if not self.form_parser.validate_template_exists():
                QMessageBox.critical(
                    self,
                    "Şablon Hatası",
                    f"Şablon eksik: {self.form_parser.template_path}\n"
                    f"Lütfen 'satın alma talep formu.xlsx' dosyasını assets/ klasörüne koyun."
                )
                return
            
            # Dosya kaydetme dialog'u
            file_path, _ = QFileDialog.getSaveFileName(
                self,
                "Boş Şablonu Kaydet",
                "satın alma talep formu.xlsx",
                "Excel Dosyaları (*.xlsx)"
            )
            
            if file_path:
                self.progress_bar.setVisible(True)
                self.progress_bar.setRange(0, 0)  # Indeterminate progress
                
                # Template'i kopyala
                result_path = self.form_parser.download_blank_template(file_path)
                
                self.progress_bar.setVisible(False)
                
                QMessageBox.information(
                    self,
                    "Başarılı",
                    f"Boş şablon başarıyla kaydedildi:\n{result_path}"
                )
                
                self.status_changed.emit("Boş şablon indirildi")
        
        except Exception as e:
            self.progress_bar.setVisible(False)
            self.error_occurred.emit(f"Şablon indirilemedi: {str(e)}")
    
    def upload_filled_form(self):
        """Dolu formu yükle"""
        try:
            # Dosya seçme dialog'u
            file_path, _ = QFileDialog.getOpenFileName(
                self,
                "Dolu Formu Seç",
                "",
                "Excel Dosyaları (*.xlsx)"
            )
            
            if file_path:
                self.progress_bar.setVisible(True)
                self.progress_bar.setRange(0, 0)
                
                # Formu parse et
                purchase_request = self.form_parser.parse_filled_form(file_path)
                self.current_purchase_request = purchase_request
                
                # Önizleme bölümünü aktif et
                self.preview_group.setEnabled(True)
                self.vendor_group.setEnabled(True)
                self.actions_group.setEnabled(True)
                
                # Talep bilgilerini göster
                self.update_request_info_display()
                
                # Kalemler tablosunu güncelle
                self.update_items_table()
                
                self.progress_bar.setVisible(False)
                
                self.status_changed.emit(
                    f"Form yüklendi: {purchase_request.total_items} kalem, "
                    f"Toplam: {purchase_request.total_value:,.2f} TL"
                )
        
        except Exception as e:
            self.progress_bar.setVisible(False)
            self.error_occurred.emit(f"Form yüklenemedi: {str(e)}")
    
    def update_request_info_display(self):
        """Talep bilgileri görüntüsünü güncelle"""
        if not self.current_purchase_request:
            return
        
        pr = self.current_purchase_request
        info_text = (
            f"Talep No: {pr.talep_no} | "
            f"STF No: {pr.stf_no} | "
            f"Şantiye: {pr.santiye} | "
            f"Alım Yeri: {pr.alim_yeri} | "
            f"Talep Eden: {pr.requester}"
        )
        self.request_info_label.setText(info_text)
    
    def update_items_table(self):
        """Kalemler tablosunu güncelle"""
        if not self.current_purchase_request:
            return
        
        # Model oluştur
        model = PurchaseItemsTableModel(self.current_purchase_request.items)
        self.items_table.setModel(model)
        
        # Kolon genişliklerini ayarla
        header = self.items_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeToContents)  # Sıra No
        header.setSectionResizeMode(1, QHeaderView.ResizeToContents)  # Malzeme Kodu
        header.setSectionResizeMode(2, QHeaderView.Stretch)  # Malzeme Tanımı
        header.setSectionResizeMode(3, QHeaderView.ResizeToContents)  # Marka
        header.setSectionResizeMode(4, QHeaderView.ResizeToContents)  # Birim
        header.setSectionResizeMode(5, QHeaderView.ResizeToContents)  # Miktar
        header.setSectionResizeMode(6, QHeaderView.ResizeToContents)  # Teslim Tarihi
        header.setSectionResizeMode(7, QHeaderView.ResizeToContents)  # Ambardaki Miktar
        header.setSectionResizeMode(8, QHeaderView.ResizeToContents)  # Sipariş Miktarı
        header.setSectionResizeMode(9, QHeaderView.ResizeToContents)  # Hedef Fiyat
        header.setSectionResizeMode(10, QHeaderView.ResizeToContents)  # Genel Toplam TL
    
    def preview_and_create_request(self):
        """Önizle ve talep oluştur"""
        if not self.current_purchase_request:
            return
        
        try:
            # Talep oluştur
            talep_no = self.repo.create_purchase_request(self.current_purchase_request)
            
            # Durumu güncelle
            self.repo.update_purchase_request_status(talep_no, "created")
            
            self.request_created.emit(talep_no)
            self.status_changed.emit(f"Talep oluşturuldu: {talep_no}")
            
            QMessageBox.information(
                self,
                "Başarılı",
                f"Satın alma talebi başarıyla oluşturuldu:\n\n"
                f"Talep No: {talep_no}\n"
                f"Kalem Sayısı: {self.current_purchase_request.total_items}\n"
                f"Toplam Değer: {self.current_purchase_request.total_value:,.2f} TL"
            )
        
        except Exception as e:
            self.error_occurred.emit(f"Talep oluşturulamadı: {str(e)}")
    
    def send_to_vendor_groups(self):
        """Seçili tedarikçi gruplarına gönder"""
        if not self.current_purchase_request:
            return
        
        # Seçili tedarikçi gruplarını al
        selected_items = self.vendor_groups_list.selectedItems()
        if not selected_items:
            QMessageBox.warning(
                self,
                "Uyarı",
                "Lütfen en az bir tedarikçi grubu seçin."
            )
            return
        
        try:
            # Seçili grupları al
            selected_groups = []
            for i, item in enumerate(selected_items):
                if i < len(self.vendor_groups):
                    selected_groups.append(self.vendor_groups[i])
            
            # Progress dialog
            progress_dialog = QProgressDialog(
                "RFQ'lar gönderiliyor...",
                "İptal",
                0,
                len(selected_groups),
                self
            )
            progress_dialog.setWindowModality(Qt.WindowModal)
            progress_dialog.show()
            
            # RFQ'ları gönder
            results = []
            for i, group in enumerate(selected_groups):
                if progress_dialog.wasCanceled():
                    break
                
                progress_dialog.setLabelText(f"Gönderiliyor: {group.name}")
                progress_dialog.setValue(i)
                
                # RFQ oluştur ve gönder
                rfq_results = self.rfq_service.send_rfqs_batch(
                    self.current_purchase_request,
                    [group]
                )
                results.extend(rfq_results)
            
            progress_dialog.setValue(len(selected_groups))
            progress_dialog.close()
            
            # Sonuçları göster
            self.show_rfq_results(results)
            
            self.rfq_sent.emit(results)
            
        except Exception as e:
            self.error_occurred.emit(f"RFQ gönderimi başarısız: {str(e)}")
    
    def show_rfq_results(self, results: List[Dict[str, Any]]):
        """RFQ sonuçlarını göster"""
        success_count = sum(1 for r in results if r["success"])
        total_count = len(results)
        
        message = f"RFQ Gönderim Sonuçları:\n\n"
        message += f"Başarılı: {success_count}/{total_count}\n\n"
        
        for result in results:
            status = "✅" if result["success"] else "❌"
            message += f"{status} {result['vendor_group_name']}\n"
            if not result["success"]:
                message += f"   Hata: {result['error']}\n"
        
        QMessageBox.information(self, "RFQ Gönderim Sonuçları", message)
        
        # Talep durumunu güncelle
        if success_count > 0 and self.current_purchase_request:
            self.repo.update_purchase_request_status(
                self.current_purchase_request.talep_no, 
                "sent"
            )
            self.status_changed.emit(f"{success_count} RFQ başarıyla gönderildi")
    
    def get_current_purchase_request(self) -> Optional[PurchaseRequest]:
        """Mevcut satın alma talebini getir"""
        return self.current_purchase_request
    
    def clear_current_request(self):
        """Mevcut talebi temizle"""
        self.current_purchase_request = None
        self.preview_group.setEnabled(False)
        self.vendor_group.setEnabled(False)
        self.actions_group.setEnabled(False)
        self.request_info_label.setText("Talep Bilgileri:")
        self.items_table.setModel(None)

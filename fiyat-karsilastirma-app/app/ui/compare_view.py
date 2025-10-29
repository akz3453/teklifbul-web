"""
Compare View for displaying comparison table with dynamic columns
"""
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableView, QToolBar, 
    QPushButton, QLabel, QLineEdit, QComboBox, QGroupBox,
    QHeaderView, QAbstractItemView, QMessageBox, QProgressBar
)
from PySide6.QtCore import Qt, Signal, QAbstractTableModel, QModelIndex, QVariant
from PySide6.QtGui import QFont, QColor, QPalette
from typing import List, Dict, Any, Optional

from ..domain.models import ComparisonResult, ComparisonRow, Offer
from ..data.repo import DataRepository
from ..services.match_service import MatchService
from ..services.export_service import ExportService, ExportServiceFactory


class ComparisonTableModel(QAbstractTableModel):
    """Karşılaştırma tablosu için model"""
    
    def __init__(self, comparison_result: Optional[ComparisonResult] = None):
        super().__init__()
        self.comparison_result = comparison_result
        self.vendor_names = []
        self.column_headers = []
        self.column_types = []  # 'basic', 'vendor_price', 'vendor_total', 'vendor_total_tl'
        
        if comparison_result:
            self._setup_columns()
    
    def _setup_columns(self):
        """Kolonları kur"""
        if not self.comparison_result:
            return
        
        # Temel kolonlar
        self.column_headers = ['NO', 'HİZMETİN ADI', 'MİKTAR', 'BİRİM']
        self.column_types = ['basic', 'basic', 'basic', 'basic']
        
        # Vendor kolonları
        vendor_names = set()
        for row in self.comparison_result.comparison_rows:
            vendor_names.update(row.vendor_offers.keys())
        
        self.vendor_names = sorted(list(vendor_names))
        
        # Her vendor için 3 kolon ekle
        for vendor_name in self.vendor_names:
            self.column_headers.extend([
                f'{vendor_name}\nBİRİM FİYAT',
                f'{vendor_name}\nTOPLAM',
                f'{vendor_name}\nTOPLAM (TL)'
            ])
            self.column_types.extend(['vendor_price', 'vendor_total', 'vendor_total_tl'])
    
    def set_comparison_result(self, comparison_result: ComparisonResult):
        """Karşılaştırma sonucunu ayarla"""
        self.comparison_result = comparison_result
        self._setup_columns()
        self.modelReset.emit()
    
    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:
        """Satır sayısı"""
        if not self.comparison_result:
            return 0
        return len(self.comparison_result.comparison_rows)
    
    def columnCount(self, parent: QModelIndex = QModelIndex()) -> int:
        """Kolon sayısı"""
        return len(self.column_headers)
    
    def headerData(self, section: int, orientation: Qt.Orientation, role: int = Qt.DisplayRole):
        """Header verisi"""
        if role == Qt.DisplayRole:
            if orientation == Qt.Horizontal:
                if section < len(self.column_headers):
                    return self.column_headers[section]
        return QVariant()
    
    def data(self, index: QModelIndex, role: int = Qt.DisplayRole):
        """Veri"""
        if not index.isValid() or not self.comparison_result:
            return QVariant()
        
        row = index.row()
        col = index.column()
        
        if row >= len(self.comparison_result.comparison_rows):
            return QVariant()
        
        comparison_row = self.comparison_result.comparison_rows[row]
        
        if role == Qt.DisplayRole:
            return self._get_display_data(comparison_row, col)
        elif role == Qt.TextAlignmentRole:
            return self._get_alignment(col)
        elif role == Qt.BackgroundRole:
            return self._get_background_color(comparison_row, col)
        elif role == Qt.FontRole:
            return self._get_font(comparison_row, col)
        
        return QVariant()
    
    def _get_display_data(self, comparison_row: ComparisonRow, col: int):
        """Görüntüleme verisi"""
        if col < 4:  # Temel kolonlar
            if col == 0:
                return comparison_row.no
            elif col == 1:
                return comparison_row.hizmet_adi
            elif col == 2:
                return f"{comparison_row.miktar:.2f}"
            elif col == 3:
                return comparison_row.birim
        else:
            # Vendor kolonları
            vendor_index = (col - 4) // 3
            if vendor_index < len(self.vendor_names):
                vendor_name = self.vendor_names[vendor_index]
                offer = comparison_row.vendor_offers.get(vendor_name)
                
                if offer:
                    sub_col = (col - 4) % 3
                    if sub_col == 0:  # BİRİM FİYAT
                        return f"{offer.birim_fiyat:,.2f}"
                    elif sub_col == 1:  # TOPLAM
                        return f"{offer.toplam:,.2f}"
                    elif sub_col == 2:  # TOPLAM (TL)
                        return f"{offer.toplam_tl:,.2f}"
        
        return ""
    
    def _get_alignment(self, col: int):
        """Hizalama"""
        if col < 4:  # Temel kolonlar
            if col == 0:  # NO
                return Qt.AlignCenter
            elif col == 1:  # HİZMETİN ADI
                return Qt.AlignLeft | Qt.AlignVCenter
            else:  # MİKTAR, BİRİM
                return Qt.AlignCenter
        else:
            # Vendor kolonları (sayısal)
            return Qt.AlignRight | Qt.AlignVCenter
    
    def _get_background_color(self, comparison_row: ComparisonRow, col: int):
        """Arka plan rengi"""
        # En iyi teklif vurgulaması
        if col >= 4 and comparison_row.en_iyi_teklif_firma:
            vendor_index = (col - 4) // 3
            if vendor_index < len(self.vendor_names):
                vendor_name = self.vendor_names[vendor_index]
                if vendor_name == comparison_row.en_iyi_teklif_firma:
                    return QColor(200, 255, 200)  # Açık yeşil
        
        return QVariant()
    
    def _get_font(self, comparison_row: ComparisonRow, col: int):
        """Font"""
        # En iyi teklif için kalın font
        if col >= 4 and comparison_row.en_iyi_teklif_firma:
            vendor_index = (col - 4) // 3
            if vendor_index < len(self.vendor_names):
                vendor_name = self.vendor_names[vendor_index]
                if vendor_name == comparison_row.en_iyi_teklif_firma:
                    font = QFont()
                    font.setBold(True)
                    return font
        
        return QVariant()


class CompareView(QWidget):
    """Karşılaştırma görünümü"""
    
    # Sinyaller
    data_loaded = Signal(bool, str)  # success, message
    export_requested = Signal(str)   # export_type
    error_occurred = Signal(str)     # error_message
    
    def __init__(self, repo: DataRepository, match_service: MatchService, parent=None):
        super().__init__(parent)
        
        self.repo = repo
        self.match_service = match_service
        self.comparison_result = None
        self.export_mode = "programmatic"  # Default export mode
        
        self.setup_ui()
        self.setup_connections()
    
    def setup_ui(self):
        """UI'yi kur"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(5)
        
        # Toolbar
        self.setup_toolbar(layout)
        
        # Stats panel
        self.setup_stats_panel(layout)
        
        # Table
        self.setup_table(layout)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
    
    def setup_toolbar(self, layout: QVBoxLayout):
        """Toolbar'ı kur"""
        toolbar = QToolBar()
        toolbar.setToolButtonStyle(Qt.ToolButtonTextBesideIcon)
        
        # Yenile butonu
        self.refresh_btn = QPushButton("Yenile")
        self.refresh_btn.setToolTip("Verileri yenile (Ctrl+R)")
        toolbar.addWidget(self.refresh_btn)
        
        toolbar.addSeparator()
        
        # Excel export butonu
        self.excel_btn = QPushButton("Excel İndir")
        self.excel_btn.setToolTip("Excel formatında dışa aktar (Ctrl+E)")
        toolbar.addWidget(self.excel_btn)
        
        # CSV export butonu
        self.csv_btn = QPushButton("CSV İndir")
        self.csv_btn.setToolTip("CSV formatında dışa aktar")
        toolbar.addWidget(self.csv_btn)
        
        toolbar.addSeparator()
        
        # Vendor ayarları butonu
        self.vendor_settings_btn = QPushButton("Tedarikçi Ayarları")
        self.vendor_settings_btn.setToolTip("Tedarikçi isimlerini düzenle")
        toolbar.addWidget(self.vendor_settings_btn)
        
        toolbar.addSeparator()
        
        # Export mode seçimi
        self.export_mode_label = QLabel("Export Modu:")
        toolbar.addWidget(self.export_mode_label)
        
        self.export_mode_combo = QComboBox()
        self.export_mode_combo.setToolTip("Excel export modunu seçin")
        self._populate_export_modes()
        toolbar.addWidget(self.export_mode_combo)
        
        layout.addWidget(toolbar)
    
    def setup_stats_panel(self, layout: QVBoxLayout):
        """İstatistik panelini kur"""
        stats_group = QGroupBox("İstatistikler")
        stats_layout = QHBoxLayout(stats_group)
        
        # Toplam ürün sayısı
        self.total_items_label = QLabel("Toplam Ürün: 0")
        stats_layout.addWidget(self.total_items_label)
        
        # Toplam tedarikçi sayısı
        self.total_vendors_label = QLabel("Toplam Tedarikçi: 0")
        stats_layout.addWidget(self.total_vendors_label)
        
        # En iyi tedarikçi
        self.best_vendor_label = QLabel("En İyi Tedarikçi: -")
        stats_layout.addWidget(self.best_vendor_label)
        
        # Üyelik tipi
        self.membership_label = QLabel("Üyelik: -")
        stats_layout.addWidget(self.membership_label)
        
        stats_layout.addStretch()
        layout.addWidget(stats_group)
    
    def setup_table(self, layout: QVBoxLayout):
        """Tabloyu kur"""
        # Table view
        self.table_view = QTableView()
        self.table_view.setAlternatingRowColors(True)
        self.table_view.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table_view.setSelectionMode(QAbstractItemView.SingleSelection)
        self.table_view.setSortingEnabled(True)
        
        # Horizontal scroll
        self.table_view.setHorizontalScrollMode(QAbstractItemView.ScrollPerPixel)
        
        # Model
        self.table_model = ComparisonTableModel()
        self.table_view.setModel(self.table_model)
        
        # Header ayarları
        header = self.table_view.horizontalHeader()
        header.setStretchLastSection(False)
        header.setSectionResizeMode(0, QHeaderView.Fixed)  # NO
        header.setSectionResizeMode(1, QHeaderView.Stretch)  # HİZMETİN ADI
        header.setSectionResizeMode(2, QHeaderView.Fixed)  # MİKTAR
        header.setSectionResizeMode(3, QHeaderView.Fixed)  # BİRİM
        
        # Vendor kolonları için sabit genişlik
        for i in range(4, header.count()):
            header.setSectionResizeMode(i, QHeaderView.Fixed)
            header.resizeSection(i, 120)
        
        layout.addWidget(self.table_view)
    
    def setup_connections(self):
        """Sinyal bağlantılarını kur"""
        self.refresh_btn.clicked.connect(self.load_data)
        self.excel_btn.clicked.connect(lambda: self.export_requested.emit("excel"))
        self.csv_btn.clicked.connect(lambda: self.export_requested.emit("csv"))
        self.vendor_settings_btn.clicked.connect(self.show_vendor_settings)
        self.export_mode_combo.currentTextChanged.connect(self.on_export_mode_changed)
    
    def load_data(self):
        """Verileri yükle"""
        try:
            self.progress_bar.setVisible(True)
            self.progress_bar.setRange(0, 0)  # Indeterminate
            
            # Verileri al
            items = self.repo.get_items()
            offers = self.repo.get_offers()
            vendors = self.repo.get_vendors()
            
            self.progress_bar.setRange(0, 100)
            self.progress_bar.setValue(25)
            
            # Eşleştirme yap
            self.comparison_result = self.match_service.match_items_with_offers(
                items, offers, vendors
            )
            
            self.progress_bar.setValue(75)
            
            # Model'i güncelle
            self.table_model.set_comparison_result(self.comparison_result)
            
            self.progress_bar.setValue(100)
            
            # İstatistikleri güncelle
            self.update_stats()
            
            self.progress_bar.setVisible(False)
            
            # Başarı sinyali
            stats = self.match_service.get_summary_statistics(self.comparison_result)
            message = f"{stats['total_items']} ürün, {stats['total_vendors']} tedarikçi"
            self.data_loaded.emit(True, message)
            
        except Exception as e:
            self.progress_bar.setVisible(False)
            error_msg = f"Veri yükleme hatası: {str(e)}"
            self.data_loaded.emit(False, error_msg)
            self.error_occurred.emit(error_msg)
    
    def update_stats(self):
        """İstatistikleri güncelle"""
        if not self.comparison_result:
            return
        
        stats = self.match_service.get_summary_statistics(self.comparison_result)
        
        self.total_items_label.setText(f"Toplam Ürün: {stats['total_items']}")
        self.total_vendors_label.setText(f"Toplam Tedarikçi: {stats['total_vendors']}")
        
        if stats['best_overall_vendor']:
            self.best_vendor_label.setText(
                f"En İyi Tedarikçi: {stats['best_overall_vendor']} "
                f"({stats['best_overall_total']:,.2f} TL)"
            )
        else:
            self.best_vendor_label.setText("En İyi Tedarikçi: -")
        
        self.membership_label.setText(f"Üyelik: {stats['membership_tier'].title()}")
    
    def show_vendor_settings(self):
        """Tedarikçi ayarları dialog'unu göster"""
        # Bu metod main_window'dan çağrılacak
        pass
    
    def get_comparison_result(self) -> Optional[ComparisonResult]:
        """Karşılaştırma sonucunu getir"""
        return self.comparison_result
    
    def refresh_data(self):
        """Verileri yenile"""
        self.load_data()
    
    def _populate_export_modes(self):
        """Export modlarını combo box'a ekle"""
        export_modes = ExportServiceFactory.get_available_export_modes()
        
        for mode_key, mode_info in export_modes.items():
            display_name = mode_info["name"]
            self.export_mode_combo.addItem(display_name, mode_key)
        
        # Default mode'u seç
        self.export_mode_combo.setCurrentText("Programatik")
    
    def on_export_mode_changed(self, display_name: str):
        """Export mode değiştiğinde"""
        # Display name'den mode key'i bul
        export_modes = ExportServiceFactory.get_available_export_modes()
        for mode_key, mode_info in export_modes.items():
            if mode_info["name"] == display_name:
                self.export_mode = mode_key
                break
        
        # Template injection için template kontrolü
        if self.export_mode == "template_injection":
            try:
                # Geçici export service oluştur ve template'i kontrol et
                if self.comparison_result:
                    temp_service = ExportServiceFactory.create_export_service(
                        self.comparison_result, "template_injection"
                    )
                    if hasattr(temp_service, '_validate_template_exists'):
                        if not temp_service._validate_template_exists():
                            self.error_occurred.emit(
                                f"Şablon dosyası eksik: {temp_service.template_path}\n"
                                f"Lütfen TEKLİF MUKAYESE FORMU.xlsx dosyasını assets/ klasörüne koyun."
                            )
                            # Programmatic mode'a geri dön
                            self.export_mode = "programmatic"
                            self.export_mode_combo.setCurrentText("Programatik")
            except Exception as e:
                self.error_occurred.emit(f"Export mode değiştirilemedi: {str(e)}")
                self.export_mode = "programmatic"
                self.export_mode_combo.setCurrentText("Programatik")
    
    def get_export_mode(self) -> str:
        """Mevcut export mode'u getir"""
        return self.export_mode

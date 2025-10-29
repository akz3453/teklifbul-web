"""
Main entry point for Fiyat Karşılaştırma Tablosu
"""
import sys
import os
from PySide6.QtWidgets import QApplication, QMessageBox
from PySide6.QtCore import Qt
from PySide6.QtGui import QIcon

# App modülünü path'e ekle
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from app.ui.main_window import MainWindow


def main():
    """Ana fonksiyon"""
    # QApplication oluştur
    app = QApplication(sys.argv)
    app.setApplicationName("Fiyat Karşılaştırma Tablosu")
    app.setApplicationVersion("1.0.0")
    app.setOrganizationName("Teklifbul")
    
    # Yüksek DPI desteği
    app.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    app.setAttribute(Qt.AA_UseHighDpiPixmaps, True)
    
    try:
        # Ana pencereyi oluştur ve göster
        main_window = MainWindow()
        main_window.show()
        
        # Uygulamayı çalıştır
        return app.exec()
        
    except Exception as e:
        QMessageBox.critical(
            None, 
            "Kritik Hata", 
            f"Uygulama başlatılamadı:\n{str(e)}"
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())

"""
Export service for Excel and CSV export with template formatting
DEPRECATED: Use export_service/__init__.py instead
"""
import warnings

warnings.warn(
    "export_service.py is deprecated. Use export_service/__init__.py instead.",
    DeprecationWarning,
    stacklevel=2
)

# Backward compatibility için yeni export service'i import et
from .export_service import ExportService, ExportServiceFactory

# Eski class'ları yeni factory'den al
__all__ = ['ExportService', 'ExportServiceFactory']


class ExportService:
    """Excel ve CSV export servisi"""
    
    def __init__(self, comparison_result: ComparisonResult):
        self.comparison_result = comparison_result
        self.config = comparison_result.config
        self.export_settings = comparison_result.export_settings
    
    def export_to_excel(self, output_path: str) -> str:
        """Excel dosyası oluştur"""
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
        filename = f"{self.export_settings.filename_prefix}_{timestamp}.xlsx"
        full_path = os.path.join(output_path, filename)
        
        # Vendor gruplarını oluştur
        vendor_groups = self._get_vendor_groups()
        
        # Excel dosyasını oluştur
        workbook = xlsxwriter.Workbook(full_path)
        
        # Her vendor grubu için sheet oluştur
        for i, vendor_group in enumerate(vendor_groups):
            sheet_name = self._get_sheet_name(vendor_group, i)
            self._create_sheet(workbook, sheet_name, vendor_group)
        
        workbook.close()
        return full_path
    
    def export_to_csv(self, output_path: str) -> str:
        """CSV dosyası oluştur"""
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
        filename = f"{self.export_settings.filename_prefix}_{timestamp}.csv"
        full_path = os.path.join(output_path, filename)
        
        # CSV verisini hazırla
        csv_data = self._prepare_csv_data()
        
        # CSV dosyasını yaz
        with open(full_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
            if csv_data:
                writer = csv.DictWriter(csvfile, fieldnames=csv_data[0].keys())
                writer.writeheader()
                writer.writerows(csv_data)
        
        return full_path
    
    def _get_vendor_groups(self) -> List[List[Vendor]]:
        """Tedarikçi gruplarını oluştur"""
        all_vendors = self._get_all_vendors()
        
        if self.config.membership_tier == "standard":
            # Standard: sadece ilk grup
            return [all_vendors[:self.config.max_vendors_standard]]
        
        # Premium: 5'li gruplar
        groups = []
        for i in range(0, len(all_vendors), self.config.max_vendors_per_sheet):
            groups.append(all_vendors[i:i + self.config.max_vendors_per_sheet])
        
        return groups
    
    def _get_all_vendors(self) -> List[Vendor]:
        """Tüm tedarikçileri getir"""
        vendors = []
        vendor_names = set()
        
        for row in self.comparison_result.comparison_rows:
            for vendor_name in row.vendor_offers.keys():
                if vendor_name not in vendor_names:
                    vendor_names.add(vendor_name)
                    # Mock vendor oluştur (gerçek uygulamada repo'dan gelecek)
                    vendors.append(Vendor(vendor_name, f"VENDOR_{len(vendors)+1}"))
        
        return vendors
    
    def _get_sheet_name(self, vendor_group: List[Vendor], group_index: int) -> str:
        """Sheet adını oluştur"""
        if len(vendor_group) == 1:
            return vendor_group[0].firma_adi[:31]  # Excel sheet name limit
        
        start_num = group_index * self.config.max_vendors_per_sheet + 1
        end_num = start_num + len(vendor_group) - 1
        return f"Vendors {start_num}-{end_num}"
    
    def _create_sheet(self, workbook: xlsxwriter.Workbook, sheet_name: str, vendors: List[Vendor]):
        """Excel sheet'i oluştur"""
        worksheet = workbook.add_worksheet(sheet_name)
        
        # Formatlar
        formats = self._create_formats(workbook)
        
        # Başlık satırı
        self._write_header(worksheet, formats, vendors)
        
        # Ana başlık
        self._write_main_title(worksheet, formats)
        
        # Doküman bilgileri
        self._write_document_info(worksheet, formats)
        
        # Tablo başlıkları
        self._write_table_headers(worksheet, formats, vendors)
        
        # Veri satırları
        self._write_data_rows(worksheet, formats, vendors)
        
        # İmza alanları
        self._write_signature_areas(worksheet, formats, vendors)
        
        # Teknik değerlendirme
        self._write_technical_evaluation(worksheet, formats)
        
        # Kolon genişliklerini ayarla
        self._adjust_column_widths(worksheet, vendors)
    
    def _create_formats(self, workbook: xlsxwriter.Workbook) -> Dict[str, Any]:
        """Excel formatlarını oluştur"""
        return {
            'title': workbook.add_format({
                'bold': True,
                'font_size': 16,
                'align': 'center',
                'valign': 'vcenter',
                'border': 1
            }),
            'header': workbook.add_format({
                'bold': True,
                'align': 'center',
                'valign': 'vcenter',
                'border': 1,
                'bg_color': '#D9D9D9'
            }),
            'vendor_header': workbook.add_format({
                'bold': True,
                'align': 'center',
                'valign': 'vcenter',
                'border': 1,
                'bg_color': '#D9D9D9',
                'rotation': 90
            }),
            'data': workbook.add_format({
                'align': 'center',
                'valign': 'vcenter',
                'border': 1
            }),
            'number': workbook.add_format({
                'align': 'right',
                'valign': 'vcenter',
                'border': 1,
                'num_format': '#,##0.00'
            }),
            'signature': workbook.add_format({
                'align': 'center',
                'valign': 'vcenter',
                'border': 1
            })
        }
    
    def _write_header(self, worksheet: xlsxwriter.Worksheet, formats: Dict, vendors: List[Vendor]):
        """Başlık satırını yaz"""
        # Ana başlık için merge
        total_cols = 4 + len(vendors) * 3  # NO, HİZMET, MİKTAR, BİRİM + (firma * 3)
        worksheet.merge_range(0, 0, 0, total_cols - 1, 
                             'FİYAT KARŞILAŞTIRMA TABLOSU', 
                             formats['title'])
    
    def _write_main_title(self, worksheet: xlsxwriter.Worksheet, formats: Dict):
        """Ana başlığı yaz"""
        # Bu zaten _write_header'da yapıldı
        pass
    
    def _write_document_info(self, worksheet: xlsxwriter.Worksheet, formats: Dict):
        """Doküman bilgilerini yaz"""
        total_cols = 4 + len(self._get_all_vendors()) * 3
        
        # Doküman No
        worksheet.write(1, total_cols - 4, 'Doküman No:', formats['data'])
        worksheet.write(1, total_cols - 3, 'MUK-2024-001', formats['data'])
        
        # Sayfa No
        worksheet.write(2, total_cols - 4, 'Sayfa No:', formats['data'])
        worksheet.write(2, total_cols - 3, '1/1', formats['data'])
        
        # Rev. Tarihi
        worksheet.write(3, total_cols - 4, 'Rev. Tarihi:', formats['data'])
        worksheet.write(3, total_cols - 3, datetime.now().strftime('%d.%m.%Y'), formats['data'])
        
        # Rev. No
        worksheet.write(4, total_cols - 4, 'Rev. No:', formats['data'])
        worksheet.write(4, total_cols - 3, '00', formats['data'])
    
    def _write_table_headers(self, worksheet: xlsxwriter.Worksheet, formats: Dict, vendors: List[Vendor]):
        """Tablo başlıklarını yaz"""
        row = 6
        
        # İlk satır: Ana başlıklar
        headers = ['NO', 'HİZMETİN ADI', 'MİKTAR', 'BİRİM']
        for vendor in vendors:
            headers.extend([vendor.firma_adi, '', ''])
        
        for col, header in enumerate(headers):
            worksheet.write(row, col, header, formats['header'])
        
        # İkinci satır: Alt başlıklar
        row += 1
        sub_headers = ['', '', '', '']
        for vendor in vendors:
            sub_headers.extend(['BİRİM FİYAT', 'TOPLAM', 'TOPLAM (TL)'])
        
        for col, header in enumerate(sub_headers):
            worksheet.write(row, col, header, formats['header'])
        
        # Üçüncü satır: Ek bilgiler
        row += 1
        extra_headers = ['', '', '', '']
        for vendor in vendors:
            extra_headers.extend(['ÖDEME/TESLİM/NOT', '', ''])
        
        for col, header in enumerate(extra_headers):
            worksheet.write(row, col, header, formats['header'])
    
    def _write_data_rows(self, worksheet: xlsxwriter.Worksheet, formats: Dict, vendors: List[Vendor]):
        """Veri satırlarını yaz"""
        start_row = 9
        
        for i, row_data in enumerate(self.comparison_result.comparison_rows):
            row = start_row + i
            
            # Temel bilgiler
            worksheet.write(row, 0, row_data.no, formats['data'])
            worksheet.write(row, 1, row_data.hizmet_adi, formats['data'])
            worksheet.write(row, 2, row_data.miktar, formats['number'])
            worksheet.write(row, 3, row_data.birim, formats['data'])
            
            # Her tedarikçi için bilgiler
            col = 4
            for vendor in vendors:
                offer = row_data.vendor_offers.get(vendor.firma_adi)
                if offer:
                    worksheet.write(row, col, offer.birim_fiyat, formats['number'])
                    worksheet.write(row, col + 1, offer.toplam, formats['number'])
                    worksheet.write(row, col + 2, offer.toplam_tl, formats['number'])
                    
                    # Ek bilgiler (ödeme/teslim/not)
                    extra_info = []
                    if offer.odeme_sekli:
                        extra_info.append(f"Ödeme: {offer.odeme_sekli}")
                    if offer.teslim_suresi:
                        extra_info.append(f"Teslim: {offer.teslim_suresi}")
                    if offer.notlar:
                        extra_info.append(f"Not: {offer.notlar}")
                    
                    worksheet.write(row, col + 3, ' / '.join(extra_info), formats['data'])
                else:
                    # Teklif yoksa boş
                    for j in range(4):
                        worksheet.write(row, col + j, '', formats['data'])
                
                col += 4
    
    def _write_signature_areas(self, worksheet: xlsxwriter.Worksheet, formats: Dict, vendors: List[Vendor]):
        """İmza alanlarını yaz"""
        data_rows = len(self.comparison_result.comparison_rows)
        start_row = 9 + data_rows + 2
        
        signature_areas = [
            'HAZIRLAYAN',
            'SATIN ALMA MÜDÜRÜ',
            'GENEL MÜDÜR YARDIMCISI',
            'GENEL MÜDÜR',
            'YÖNETİM KURULU BAŞKANI'
        ]
        
        for i, area in enumerate(signature_areas):
            row = start_row + i
            worksheet.write(row, 0, area, formats['signature'])
            worksheet.merge_range(row, 1, row, 2, '', formats['signature'])
            worksheet.merge_range(row, 3, row, 4, '', formats['signature'])
            worksheet.merge_range(row, 5, row, 6, '', formats['signature'])
    
    def _write_technical_evaluation(self, worksheet: xlsxwriter.Worksheet, formats: Dict):
        """Teknik değerlendirme alanını yaz"""
        data_rows = len(self.comparison_result.comparison_rows)
        start_row = 9 + data_rows + 8
        
        # En iyi tedarikçi bilgisi
        best_vendor = self.comparison_result.best_overall_vendor
        best_total = self.comparison_result.best_overall_total
        
        if best_vendor and best_total:
            evaluation_text = f"Teknik Değerlendirme sonucunda en uygun bulunan firma: {best_vendor} (Toplam: {best_total:,.2f} TL)"
        else:
            evaluation_text = "Teknik Değerlendirme sonucunda en uygun bulunan firma: Değerlendirme yapılamadı"
        
        worksheet.merge_range(start_row, 0, start_row, 10, evaluation_text, formats['data'])
    
    def _adjust_column_widths(self, worksheet: xlsxwriter.Worksheet, vendors: List[Vendor]):
        """Kolon genişliklerini ayarla"""
        # NO
        worksheet.set_column(0, 0, 5)
        # HİZMETİN ADI
        worksheet.set_column(1, 1, 30)
        # MİKTAR
        worksheet.set_column(2, 2, 10)
        # BİRİM
        worksheet.set_column(3, 3, 8)
        
        # Her tedarikçi için 4 kolon
        col = 4
        for vendor in vendors:
            worksheet.set_column(col, col, 15)      # BİRİM FİYAT
            worksheet.set_column(col + 1, col + 1, 15)  # TOPLAM
            worksheet.set_column(col + 2, col + 2, 15)  # TOPLAM (TL)
            worksheet.set_column(col + 3, col + 3, 20)  # ÖDEME/TESLİM/NOT
            col += 4
    
    def _prepare_csv_data(self) -> List[Dict[str, Any]]:
        """CSV verisini hazırla"""
        csv_data = []
        all_vendors = self._get_all_vendors()
        
        for row_data in self.comparison_result.comparison_rows:
            csv_row = {
                'NO': row_data.no,
                'HİZMETİN ADI': row_data.hizmet_adi,
                'MİKTAR': row_data.miktar,
                'BİRİM': row_data.birim,
                'ÜRÜN KODU': row_data.urun_kodu,
                'EN İYİ TEKLİF FİRMA': row_data.en_iyi_teklif_firma,
                'EN İYİ TEKLİF TOPLAM': row_data.en_iyi_teklif_toplam
            }
            
            # Her tedarikçi için bilgiler
            for vendor in all_vendors:
                offer = row_data.vendor_offers.get(vendor.firma_adi)
                if offer:
                    csv_row.update({
                        f'{vendor.firma_adi}_BİRİM_FİYAT': offer.birim_fiyat,
                        f'{vendor.firma_adi}_TOPLAM': offer.toplam,
                        f'{vendor.firma_adi}_TOPLAM_TL': offer.toplam_tl,
                        f'{vendor.firma_adi}_PARA_BİRİMİ': offer.para_birimi,
                        f'{vendor.firma_adi}_ÖDEME_ŞEKLİ': offer.odeme_sekli,
                        f'{vendor.firma_adi}_TESLİM_SÜRESİ': offer.teslim_suresi,
                        f'{vendor.firma_adi}_TESLİM_ŞEKLİ': offer.teslim_sekli,
                        f'{vendor.firma_adi}_NOTLAR': offer.notlar
                    })
                else:
                    csv_row.update({
                        f'{vendor.firma_adi}_BİRİM_FİYAT': None,
                        f'{vendor.firma_adi}_TOPLAM': None,
                        f'{vendor.firma_adi}_TOPLAM_TL': None,
                        f'{vendor.firma_adi}_PARA_BİRİMİ': None,
                        f'{vendor.firma_adi}_ÖDEME_ŞEKLİ': None,
                        f'{vendor.firma_adi}_TESLİM_SÜRESİ': None,
                        f'{vendor.firma_adi}_TESLİM_ŞEKLİ': None,
                        f'{vendor.firma_adi}_NOTLAR': None
                    })
            
            csv_data.append(csv_row)
        
        return csv_data

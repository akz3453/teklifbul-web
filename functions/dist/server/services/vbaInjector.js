/**
 * VBA Injector Service
 * Excel dosyasına VBA kodu ekler
 * Teklifbul Rule v1.2.8 - Akıllı Ödeme Planı Sistemi
 */
import JSZip from 'jszip';
import { logger } from '../../src/shared/log/logger.js';
/**
 * Excel dosyasına VBA kodu ekle
 * @param excelBuffer - Excel dosyası buffer'ı
 * @param worksheetName - VBA kodunun ekleneceği worksheet adı
 * @returns VBA eklenmiş Excel buffer'ı
 */
export async function injectVBA(excelBuffer, worksheetName = 'Teklif') {
    logger.group('VBA Kodu Ekleme');
    try {
        // Buffer'ı ArrayBuffer'a dönüştür
        const arrayBuffer = excelBuffer instanceof Buffer
            ? excelBuffer.buffer.slice(excelBuffer.byteOffset, excelBuffer.byteOffset + excelBuffer.byteLength)
            : excelBuffer;
        // Excel dosyasını ZIP olarak aç
        const zip = await JSZip.loadAsync(arrayBuffer);
        // VBA kodunu oluştur - Akıllı Ödeme Planı Sistemi
        const vbaCode = `Attribute VB_Name = "${worksheetName}"
Private Sub Worksheet_Change(ByVal Target As Range)
    If Target.Address = "$M$3" Then
        Application.EnableEvents = False
        
        Range("N3:P3").ClearContents
        Range("N3:P3").Interior.ColorIndex = xlNone
        Range("N3:P3").Locked = False
        
        Select Case Target.Value
            Case "Peşin"
                With Range("N3").Validation
                    .Delete
                    .Add Type:=xlValidateList, Formula1:="Escrow,Teslim & Onay,Ön Ödeme"
                End With
                Range("N3").Interior.Color = RGB(220, 230, 241)
                
            Case "Kredi Kartı"
                Range("N3").Value = "Taksit Sayısı"
                With Range("O3").Validation
                    .Delete
                    .Add Type:=xlValidateList, Formula1:="1,2,3,4,6,9,12"
                End With
                Range("N3:O3").Interior.Color = RGB(255, 253, 220)
                
            Case "Açık Hesap"
                Range("N3").Value = "Vade Gün Sayısı"
                With Range("O3").Validation
                    .Delete
                    .Add Type:=xlValidateList, Formula1:="15,30,45,60,90,120"
                End With
                Range("O3").Value = 30  'varsayılan
                Range("N3:O3").Interior.Color = RGB(220, 240, 220)
                
            Case "Evrak (çek/senet)"
                Range("N3").Value = "Çek Tutarı"
                Range("O3").Value = "Vade Tarihi"
                Range("N3").NumberFormat = "#,##0.00 ""₺"""
                Range("O3").NumberFormat = "dd.mm.yyyy"
                Range("N3:O3").Interior.Color = RGB(255, 230, 230)
                
            Case Else
                Range("N3:P3").Interior.Color = RGB(240, 240, 240)
        End Select
        
        Application.EnableEvents = True
    End If
End Sub`;
        // Not: Excel'in VBA proje formatı çok karmaşık olduğu için
        // VBA kodunu bir referans dosyası olarak ekliyoruz
        // Gerçek VBA ekleme için Excel'in COM API'si veya özel bir kütüphane gerekir
        // VBA kodunu bir text dosyası olarak ekle (kullanıcı için referans)
        zip.file('VBA_CODE_REFERENCE.txt', `VBA KODU - ${worksheetName} Sayfasına Ekleyin\n\n` +
            `1. Excel'de Alt+F11 ile VBA editörünü açın\n` +
            `2. Sol tarafta "${worksheetName}" sayfasını bulun\n` +
            `3. Sağ tarafta kod penceresine aşağıdaki kodu yapıştırın:\n\n` +
            vbaCode);
        // Excel dosyasını yeniden oluştur
        const newBuffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
        logger.info('VBA kodu referans dosyası olarak eklendi', { worksheetName });
        logger.end();
        return newBuffer;
    }
    catch (error) {
        logger.error('VBA kodu eklenirken hata oluştu', error);
        logger.end();
        // Hata durumunda orijinal buffer'ı döndür
        return excelBuffer instanceof Buffer ? excelBuffer : Buffer.from(excelBuffer);
    }
}

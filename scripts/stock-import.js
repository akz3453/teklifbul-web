import { db, auth, requireAuth } from '/firebase.js';
import { normalizeTRLower, tokenizeForIndex, normalizeTR } from '/scripts/lib/tr-utils.js';
import { collection, addDoc, getDocs, getDoc, query, where, updateDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { toast } from '../src/shared/ui/toast.js';
import { MESSAGES } from '../src/shared/constants/messages.js';
import { logger } from '../src/shared/log/logger.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, requirePerm, getStockPerms } from '../assets/js/state/permissions.js';

// Teklifbul Rule v1.0 - Security: xlsx paketi güvenlik notu
// xlsx paketinde bilinen bazı security advisory'ler mevcuttur (Prototype Pollution, ReDoS).
// Risk azaltma önlemleri:
// - Dosya boyutu limiti: 5 MB
// - Satır/sütun limiti: 10.000 satır, 50 sütun
// - Try/catch ile güvenli hata yönetimi
// - Input validation ve sanitization
// İleride alternatif kütüphaneye veya server-side işleme modeline geçiş değerlendirilebilir.

// Teklifbul Rule v1.0 - Security: Excel işleme limitleri
const EXCEL_LIMITS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5 MB
  MAX_ROWS: 10000,
  MAX_COLUMNS: 50
};

const qs = s => document.querySelector(s);

const state = {
  rows: [],
  validRows: 0,
  invalidRows: 0,
  stats: { new: 0, updated: 0, error: 0 }
};

const STOCK_PERMS = getStockPerms();

// Permission Pilot - Stok İçe Aktar (URL guard)
(async () => {
  try {
    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx || !ctx.companyId) {
      logger.warn('Stock import: company context alınamadı, sayfa başlatılmıyor', { ctx });
      toast.error(
        (MESSAGES.ERROR_COMPANY_ID_REQUIRED || 'Şirket bilgisi doğrulanamadı') +
          '. Stok içe aktarma ekranı yüklenemedi.'
      );
      return;
    }

    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) {
      logger.warn('Stock import: initPermissions sonuç vermedi, sayfa başlatılmıyor');
      return;
    }

    // Genel stok görüntüleme izni
    if (STOCK_PERMS.view && !can(STOCK_PERMS.view)) {
      const msg =
        MESSAGES.ERROR_PERMISSION_STOCK_VIEW ||
        MESSAGES.ERROR_PERMISSION_DENIED ||
        'Stok modülünü görüntüleme yetkiniz yok.';
      toast.error(msg);
      logger.warn('Stock import: view yetkisi yok, URL guard tetiklendi', {
        permKey: STOCK_PERMS.view,
        companyId: permState.companyId,
        roleKey: permState.roleKey
      });
      window.location.href = '/inventory-index.html';
      return;
    }

    // İçe aktarma izni yoksa ekranı kilitle
    if (STOCK_PERMS.import && !can(STOCK_PERMS.import)) {
      const msg =
        MESSAGES.ERROR_PERMISSION_STOCK_IMPORT ||
        'Stok kartı içe aktarma yetkiniz yok.';
      toast.error(msg);
      logger.warn('Stock import: import yetkisi yok, ekran kilitlendi', {
        permKey: STOCK_PERMS.import,
        companyId: permState.companyId,
        roleKey: permState.roleKey
      });

      const importBtn = document.getElementById('btnImport');
      const fileInput = document.getElementById('stockFile');
      if (importBtn) {
        importBtn.disabled = true;
        importBtn.title = msg;
      }
      if (fileInput) {
        fileInput.disabled = true;
        fileInput.title = msg;
      }
    }
  } catch (error) {
    logger.error('Stock import permission init error', error);
    toast.error(
      (MESSAGES.ERROR_STOCK_IMPORT_LOAD || 'Stok içe aktarma ekranı yüklenirken hata oluştu') +
        ': ' +
        (error.message || error)
    );
  }
})();

const HEADMAP = {
  'sira': 'rowNumber', 'sıra': 'rowNumber', 'row': 'rowNumber',
  'stok kodu': 'sku', 'stok kodu': 'sku', 'sku': 'sku', 'kod': 'sku',
  'ürün adı': 'name', 'urun adi': 'name', 'ad': 'name', 'ürün adı': 'name',
  'barkod': 'barcode', 'barcode': 'barcode', 'barkod kodu': 'barcode', // Teklifbul Rule v1.0 - Barkod alanı
  'marka': 'brand', 'brand': 'brand',
  'model': 'model',
  'birim': 'unit', 'unit': 'unit',
  'kdv orani': 'vatRate', 'kdv oranı': 'vatRate', 'kdv': 'vatRate',
  'alim fiyati': 'lastPurchasePrice', 'alım fiyatı': 'lastPurchasePrice',
  'satis fiyati': 'salePrice', 'satış fiyatı': 'salePrice',
  'ozel kod 1': 'customCode1', 'özel kod 1': 'customCode1',
  'ozel kod 2': 'customCode2', 'özel kod 2': 'customCode2',
  'ozel kod 3': 'customCode3', 'özel kod 3': 'customCode3',
  'depo kodu': 'warehouseCode', 'depo kodu': 'warehouseCode', 'warehouse code': 'warehouseCode',
  'maksimum yerlesim kapasitesi': 'maxCapacity', 'max capacity': 'maxCapacity', 'maksimum kapasite': 'maxCapacity',
  'minimum stok seviyesi': 'minStockLevel', 'min stock level': 'minStockLevel', 'minimum stok': 'minStockLevel',
  'kayit tarihi': 'createdAt', 'kayıt tarihi': 'createdAt', 'created at': 'createdAt',
  'son guncelleme tarihi': 'updatedAt', 'son güncelleme tarihi': 'updatedAt', 'updated at': 'updatedAt'
};

function mapHeaders(headers) {
  return headers.map(h => {
    const normalized = normalizeTR(h).toLowerCase();
    return HEADMAP[normalized] || null;
  });
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function validateRow(row) {
  const errors = [];
  if (!row.sku) errors.push('SKU eksik');
  if (!row.name) errors.push('Ürün adı eksik');
  if (row.sku && row.sku.length > 50) errors.push('SKU çok uzun');
  
  if (row.vatRate !== undefined && (row.vatRate < 0 || row.vatRate > 100)) {
    errors.push('KDV oranı 0-100 arası olmalı');
  }
  
  // Teklifbul Rule v1.0 - Depo kodu validasyonu (opsiyonel ama varsa kontrol et)
  if (row.warehouseCode && String(row.warehouseCode).trim().length > 20) {
    errors.push('Depo kodu çok uzun (max 20 karakter)');
  }
  
  row._errors = errors;
  row._isValid = errors.length === 0;
  return row._isValid;
}

function renderPreview() {
  const tbody = qs('#previewTable tbody');
  const table = qs('#previewTable');
  tbody.innerHTML = '';
  
  if (!state.rows.length) {
    qs('#previewInfo').textContent = 'Henüz dosya seçilmedi.';
    table.style.display = 'none';
    return;
  }
  
  table.style.display = 'table';
  state.rows.forEach(r => {
    const tr = document.createElement('tr');
    const badge = r._isValid ? 'b-valid' : 'b-invalid';
    const badgeText = r._isValid ? '✅ Geçerli' : `❌ ${r._errors.join(', ')}`;
    
    tr.innerHTML = `
      <td>${r.sku || ''}</td>
      <td>${r.name || ''}</td>
      <td style="font-family:monospace;font-size:12px">${r.barcode || '-'}</td>
      <td>${r.brand || ''}</td>
      <td>${r.model || ''}</td>
      <td>${r.unit || ''}</td>
      <td>${r.vatRate || 0}</td>
      <td>${r.lastPurchasePrice || 0}</td>
      <td>${r.salePrice || ''}</td>
      <td>${r.warehouseCode || '-'}</td>
      <td><span class="badge ${badge}">${badgeText}</span></td>
    `;
    tbody.appendChild(tr);
  });
  
  qs('#previewInfo').textContent = `Toplam ${state.rows.length} satır bulundu.`;
}

function renderStats() {
  const div = qs('#statsInfo');
  if (!state.rows.length) {
    div.textContent = 'Henüz dosya yüklenmedi.';
    return;
  }
  
  div.innerHTML = `
    <strong>Özet:</strong><br>
    Geçerli: <strong>${state.validRows}</strong> | Geçersiz: <strong>${state.invalidRows}</strong><br>
    Yeni: ${state.stats.new} | Güncellenen: ${state.stats.updated} | Hata: ${state.stats.error}
  `;
}

async function processFile(file) {
  // Teklifbul Rule v1.0 - Security: Dosya boyutu kontrolü
  if (file.size > EXCEL_LIMITS.MAX_FILE_SIZE) {
    alert(`Dosya çok büyük! Maksimum boyut: ${EXCEL_LIMITS.MAX_FILE_SIZE / 1024 / 1024} MB`);
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      // Teklifbul Rule v1.0 - Security: ArrayBuffer boyutu kontrolü
      const arrayBuffer = e.target.result;
      if (arrayBuffer.byteLength > EXCEL_LIMITS.MAX_FILE_SIZE) {
        alert(`Dosya çok büyük! Maksimum boyut: ${EXCEL_LIMITS.MAX_FILE_SIZE / 1024 / 1024} MB`);
        return;
      }
      
      const data = new Uint8Array(arrayBuffer);
      
      // Teklifbul Rule v1.0 - Security: xlsx.read işlemini try/catch ile sar
      let workbook;
      try {
        workbook = XLSX.read(data, { type: 'array' });
      } catch (parseError) {
        console.error('Excel parse error:', parseError);
        alert('Yüklediğiniz Excel dosyası işlenemedi. Lütfen formatını veya boyutunu kontrol edin.');
        return;
      }
      
      // Teklifbul Rule v1.0 - Security: Sheet sayısı kontrolü
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        alert('Excel dosyasında geçerli bir sayfa bulunamadı.');
        return;
      }
      
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // Teklifbul Rule v1.0 - Security: Satır/sütun limiti kontrolü
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      const rowCount = range.e.r - range.s.r + 1;
      const colCount = range.e.c - range.s.c + 1;
      
      if (rowCount > EXCEL_LIMITS.MAX_ROWS) {
        alert(`Excel dosyası çok fazla satır içeriyor. Maksimum satır: ${EXCEL_LIMITS.MAX_ROWS}`);
        return;
      }
      
      if (colCount > EXCEL_LIMITS.MAX_COLUMNS) {
        alert(`Excel dosyası çok fazla sütun içeriyor. Maksimum sütun: ${EXCEL_LIMITS.MAX_COLUMNS}`);
        return;
      }
      
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      if (json.length < 2) {
        alert('Dosya çok kısa! En az 1 veri satırı olmalı.');
        return;
      }
      
      const headers = json[0];
      const mappedHeaders = mapHeaders(headers);
      
      state.rows = json.slice(1).map((row, idx) => {
        const obj = { _rowIndex: idx + 2 };
        mappedHeaders.forEach((key, i) => {
          if (key && row[i] !== undefined) {
            if (key.includes('Price') || key.includes('Rate') || key === 'maxCapacity' || key === 'minStockLevel') {
              obj[key] = toNumber(row[i]);
            } else if (key === 'createdAt' || key === 'updatedAt') {
              // Tarih alanları için özel işleme
              const dateValue = row[i];
              if (dateValue) {
                if (dateValue instanceof Date) {
                  obj[key] = dateValue;
                } else {
                  const parsed = new Date(dateValue);
                  obj[key] = isNaN(parsed.getTime()) ? null : parsed;
                }
              }
            } else {
              obj[key] = String(row[i]).trim();
            }
          }
        });
        return obj;
      }).filter(r => r.sku || r.name);
      
      state.rows.forEach(validateRow);
      state.validRows = state.rows.filter(r => r._isValid).length;
      state.invalidRows = state.rows.length - state.validRows;
      
      renderPreview();
      renderStats();
      qs('#btnImport').disabled = state.validRows === 0;
      
    } catch (error) {
      // Teklifbul Rule v1.0 - Security: Kullanıcıya teknik detay göstermeden güvenli hata mesajı
      console.error('File parse error:', error);
      alert('Yüklediğiniz Excel dosyası işlenemedi. Lütfen formatını veya boyutunu kontrol edin.');
      alert('Dosya okunamadı: ' + error.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function performImport() {
  const user = await requireAuth();
  const validRows = state.rows.filter(r => r._isValid);
  
  if (!validRows.length) {
    alert('İçe aktarılacak geçerli satır yok!');
    return;
  }
  
  if (!confirm(`${validRows.length} kayıt içe aktarılacak. Devam edilsin mi?`)) {
    return;
  }
  
  // Permission Write Guard - Teklifbul Rule v1.0
  const importKey = STOCK_PERMS.import;
  if (importKey) {
    const ok = await requirePerm(importKey, {
      toastMessage:
        MESSAGES.ERROR_PERMISSION_STOCK_IMPORT ||
        'Stok kartı içe aktarma yetkiniz yok.'
    });
    if (!ok) {
      logger.warn('Stock import: requirePerm(import) sonucu yetkisiz, işlem iptal', {
        permKey: importKey,
        uid: user.uid
      });
      return;
    }
  }

  qs('#btnImport').disabled = true;
  qs('#btnImport').textContent = 'İçe aktarılıyor...';
  
  state.stats = { new: 0, updated: 0, error: 0 };

  // Teklifbul Rule v1.0 - Şirket bağlamı (companyId her satırda gerekli)
  let companyId = null;
  try {
    const ctx = await requireCompanyContext({ redirectOnPending: false });
    companyId = ctx?.companyId || null;
  } catch (ctxErr) {
    logger.warn('Stock import: company context alınamadı', ctxErr);
  }
  if (!companyId) {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    companyId =
      userData.companyId ||
      userData.activeCompanyId ||
      (Array.isArray(userData.companies) && userData.companies[0]) ||
      null;
  }
  if (!companyId) {
    toast.error(
      (MESSAGES.ERROR_COMPANY_ID_REQUIRED || 'Şirket bilgisi doğrulanamadı') +
        '. İçe aktarma iptal edildi.'
    );
    qs('#btnImport').disabled = false;
    qs('#btnImport').textContent = 'İçe Aktar';
    return;
  }
  
  for (const row of validRows) {
    try {
      const existingQuery = query(
        collection(db, 'stocks'),
        where('companyId', '==', companyId),
        where('sku', '==', row.sku)
      );
      const existingSnap = await getDocs(existingQuery);
      
      // Teklifbul Rule v1.0 - Depo kodunu kontrol et ve doğrula
      let warehouseCode = null;
      let warehouseId = null;
      if (row.warehouseCode) {
        const warehouseCodeStr = String(row.warehouseCode).trim();
        if (warehouseCodeStr) {
          if (companyId) {
            const warehouseQuery = query(
              collection(db, 'stock_locations'),
              where('companyId', '==', companyId),
              where('warehouseCode', '==', warehouseCodeStr),
              where('type', '==', 'warehouse'),
              where('isActive', '==', true)
            );
            const warehouseSnap = await getDocs(warehouseQuery);
            
            if (!warehouseSnap.empty) {
              const warehouseDoc = warehouseSnap.docs[0];
              warehouseCode = warehouseCodeStr;
              warehouseId = warehouseDoc.id;
            } else {
              console.warn(`Depo kodu bulunamadı: ${warehouseCodeStr} (SKU: ${row.sku})`);
            }
          }
        }
      }
      
      // Teklifbul Rule v1.0 - Stok kartı veri yapısı
      const stockData = {
        sku: row.sku,
        name: row.name,
        brand: row.brand || '',
        model: row.model || '',
        unit: (() => {
          const u = String(row.unit || 'ADT').trim().toUpperCase();
          return u === 'ADET' ? 'ADT' : (u || 'ADT');
        })(),
        barcode: row.barcode ? row.barcode.toString().trim() : null, // Teklifbul Rule v1.0 - Barkod alanı
        vatRate: row.vatRate || 0,
        lastPurchasePrice: row.lastPurchasePrice || 0,
        avgCost: 0,
        salePrice: row.salePrice || 0,
        customCodes: {
          code1: row.customCode1 || '',
          code2: row.customCode2 || '',
          code3: row.customCode3 || ''
        },
        warehouseCode: warehouseCode || null,
        warehouseId: warehouseId || null,
        maxCapacity: row.maxCapacity ? toNumber(row.maxCapacity) : null,
        minStockLevel: row.minStockLevel ? toNumber(row.minStockLevel) : null,
        name_norm: normalizeTRLower(row.name),
        sku_norm: normalizeTRLower(row.sku),
        search_keywords: tokenizeForIndex(row.name),
        companyId: companyId || null, // Teklifbul Rule v1.0 - CompanyId ekleniyor
        updatedAt: serverTimestamp()
      };
      
      // Tarih alanlarını işle (eğer Excel'den geliyorsa)
      if (row.createdAt) {
        try {
          const date = new Date(row.createdAt);
          if (!isNaN(date.getTime())) {
            stockData.createdAt = date;
          }
        } catch (e) {
          // Tarih parse edilemezse yok say
        }
      }
      
      if (existingSnap.size > 0) {
        const docId = existingSnap.docs[0].id;
        await updateDoc(doc(db, 'stocks', docId), stockData);
        state.stats.updated++;
      } else {
        stockData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'stocks'), stockData);
        state.stats.new++;
      }
    } catch (error) {
      console.error('Import error for row:', row, error);
      state.stats.error++;
    }
  }
  
  renderStats();
  alert(`İçe aktarma tamamlandı!\nYeni: ${state.stats.new}\nGüncellenen: ${state.stats.updated}\nHata: ${state.stats.error}`);
  
  qs('#btnImport').textContent = 'İçe Aktar';
  qs('#btnImport').disabled = false;
}

// Excel şablonu oluştur ve indir
async function downloadTemplate() {
  // Teklifbul Rule v1.0 - Excel şablonu oluşturma (ExcelJS ile stil desteği)
  try {
    // ExcelJS yüklenmiş mi kontrol et
    if (typeof ExcelJS === 'undefined') {
      console.warn('ExcelJS yüklenmedi, XLSX.js fallback kullanılıyor');
      downloadTemplateXLSX();
      return;
    }

    const headers = [
      'SIRA',
      'STOK KODU',
      'ÜRÜN ADI',
      'BARKOD',
      'MARKA',
      'MODEL',
      'BİRİM',
      'KDV ORANI',
      'ALIM FİYATI',
      'SATIŞ FİYATI',
      'ÖZEL KOD 1',
      'ÖZEL KOD 2',
      'ÖZEL KOD 3',
      'DEPO KODU',
      'MAKSİMUM YERLEŞİM KAPASİTESİ',
      'MİNİMUM STOK SEVİYESİ',
      'KAYIT TARİHİ',
      'SON GÜNCELLEME TARİHİ'
    ];

    // ExcelJS ile workbook oluştur
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stok Kartları');

    // Sütun genişliklerini ayarla
    worksheet.columns = [
      { width: 8 },   // Sıra
      { width: 15 },  // Stok Kodu
      { width: 30 },  // Ürün Adı
      { width: 18 },  // Barkod
      { width: 15 },  // Marka
      { width: 15 },  // Model
      { width: 10 },  // Birim
      { width: 12 },  // KDV Oranı
      { width: 15 },  // Alım Fiyatı
      { width: 15 },  // Satış Fiyatı
      { width: 15 },  // Özel Kod 1
      { width: 15 },  // Özel Kod 2
      { width: 15 },  // Özel Kod 3
      { width: 15 },  // Depo Kodu
      { width: 25 },  // Maksimum Yerleşim Kapasitesi
      { width: 22 },  // Minimum Stok Seviyesi
      { width: 15 },  // Kayıt Tarihi
      { width: 20 }   // Son Güncelleme Tarihi
    ];

    // Başlık satırını ekle ve formatla
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true, size: 11 };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    headerRow.height = 20;

    // Başlık satırındaki tüm hücrelere kenarlık ekle
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Teklifbul Rule v1.0 - Mevcut depo kodlarını al ve dropdown için hazırla
    const user = await requireAuth();
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    const companyId = userData.companyId;
    
    let warehouseCodes = [];
    if (companyId) {
      try {
        const warehousesQuery = query(
          collection(db, 'stock_locations'),
          where('companyId', '==', companyId),
          where('type', '==', 'warehouse'),
          where('isActive', '==', true)
        );
        const warehousesSnap = await getDocs(warehousesQuery);
        warehousesSnap.forEach(doc => {
          const data = doc.data();
          if (data.warehouseCode) {
            warehouseCodes.push(data.warehouseCode);
          }
        });
      } catch (err) {
        console.warn('Depo kodları yüklenemedi', err);
      }
    }
    
    // Örnek veri satırı ekle
    const exampleRow = [
      1,
      'STK-001',
      'ÖRNEK ÜRÜN',
      '8690000000000',
      'ÖRNEK MARKA',
      'MODEL-001',
      'ADT',
      20,
      100.00,
      120.00,
      'KOD1',
      'KOD2',
      'KOD3',
      warehouseCodes.length > 0 ? warehouseCodes[0] : 'DEPO-001',
      1000,
      50,
      '',
      ''
    ];
    const dataRow = worksheet.addRow(exampleRow);
    
    // Veri satırındaki tüm hücrelere kenarlık ekle
    dataRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    
    // Teklifbul Rule v1.0 - Depo Kodu sütununa data validation (dropdown) ekle
    if (warehouseCodes.length > 0) {
      const depoKoduColumn = worksheet.getColumn(14); // N sütunu (Depo Kodu)
      depoKoduColumn.eachCell((cell, rowNumber) => {
        if (rowNumber > 1) { // Başlık satırı hariç
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${warehouseCodes.join(',')}"`]
          };
        }
      });
    }

    // Freeze panes ayarla (1. satırı dondur)
    worksheet.views = [
      {
        state: 'frozen',
        ySplit: 1,
        topLeftCell: 'A2',
        activeCell: 'A2'
      }
    ];

    // Dosyayı indir
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Stok_Karti_Sablonu_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    toast.success('Excel şablonu indirildi');
  } catch (error) {
    logger.error('Şablon oluşturma hatası', error);
    toast.error('Şablon oluşturulurken hata oluştu: ' + error.message);
  }
}

// Fallback: XLSX.js ile basit şablon (stil desteği olmadan)
async function downloadTemplateXLSX() {
  const headers = [
    'SIRA',
    'STOK KODU',
    'ÜRÜN ADI',
    'BARKOD',
    'MARKA',
    'MODEL',
    'BİRİM',
    'KDV ORANI',
    'ALIM FİYATI',
    'SATIŞ FİYATI',
    'ÖZEL KOD 1',
    'ÖZEL KOD 2',
    'ÖZEL KOD 3',
    'DEPO KODU',
    'MAKSİMUM YERLEŞİM KAPASİTESİ',
    'MİNİMUM STOK SEVİYESİ',
    'KAYIT TARİHİ',
    'SON GÜNCELLEME TARİHİ'
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  
  ws['!cols'] = [
    { wch: 8 }, { wch: 15 }, { wch: 30 }, { wch: 18 }, { wch: 15 }, { wch: 15 },
    { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 22 }, { wch: 15 }, { wch: 20 }
  ];

  // Teklifbul Rule v1.0 - Mevcut depo kodlarını al
  const user = await requireAuth();
  const { getDoc, doc, query, where, getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  const userData = userDoc.exists() ? userDoc.data() : {};
  const companyId = userData.companyId;
  
  let warehouseCodes = [];
  if (companyId) {
    try {
      const warehousesQuery = query(
        collection(db, 'stock_locations'),
        where('companyId', '==', companyId),
        where('type', '==', 'warehouse'),
        where('isActive', '==', true)
      );
      const warehousesSnap = await getDocs(warehousesQuery);
      warehousesSnap.forEach(doc => {
        const data = doc.data();
        if (data.warehouseCode) {
          warehouseCodes.push(data.warehouseCode);
        }
      });
    } catch (err) {
      console.warn('Depo kodları yüklenemedi', err);
    }
  }

  const exampleRow = [1, 'STK-001', 'ÖRNEK ÜRÜN', '8690000000000', 'ÖRNEK MARKA', 'MODEL-001', 'ADT', 20, 100.00, 120.00, 'KOD1', 'KOD2', 'KOD3', warehouseCodes.length > 0 ? warehouseCodes[0] : 'DEPO-001', 1000, 50, '', ''];
  XLSX.utils.sheet_add_aoa(ws, [exampleRow], { origin: 'A2' });

  XLSX.utils.book_append_sheet(wb, ws, 'Stok Kartları');
  const fileName = `Stok_Karti_Sablonu_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
  toast.success('Excel şablonu indirildi');
}

// Event handlers
qs('#stockFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    processFile(file);
  }
});

qs('#btnImport').addEventListener('click', performImport);
qs('#btnDownloadTemplate').addEventListener('click', downloadTemplate);


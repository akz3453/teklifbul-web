import { db, auth, requireAuth } from '/firebase.js';
import { normalizeTRLower, tokenizeForIndex } from '/scripts/lib/tr-utils.js';
import { collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const qs = s => document.querySelector(s);

const state = {
  rows: [],
  validRows: 0,
  invalidRows: 0,
  stats: { new: 0, updated: 0, error: 0 }
};

const HEADMAP = {
  'stok kodu': 'sku', 'stok kodu': 'sku', 'sku': 'sku', 'kod': 'sku',
  'ürün adı': 'name', 'urun adi': 'name', 'ad': 'name', 'ürün adı': 'name',
  'marka': 'brand', 'brand': 'brand',
  'model': 'model',
  'birim': 'unit', 'unit': 'unit',
  'kdv orani': 'vatRate', 'kdv oranı': 'vatRate', 'kdv': 'vatRate',
  'alim fiyati': 'lastPurchasePrice', 'alım fiyatı': 'lastPurchasePrice',
  'satis fiyati': 'salePrice', 'satış fiyatı': 'salePrice',
  'ozel kod 1': 'customCode1', 'özel kod 1': 'customCode1',
  'ozel kod 2': 'customCode2', 'özel kod 2': 'customCode2',
  'ozel kod 3': 'customCode3', 'özel kod 3': 'customCode3'
};

function mapHeaders(headers) {
  return headers.map(h => HEADMAP[normalizeTR(h)] || null);
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
      <td>${r.brand || ''}</td>
      <td>${r.model || ''}</td>
      <td>${r.unit || ''}</td>
      <td>${r.vatRate || 0}</td>
      <td>${r.lastPurchasePrice || 0}</td>
      <td>${r.salePrice || ''}</td>
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
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
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
            if (key.includes('Price') || key.includes('Rate')) {
              obj[key] = toNumber(row[i]);
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
      console.error('File parse error:', error);
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
  
  qs('#btnImport').disabled = true;
  qs('#btnImport').textContent = 'İçe aktarılıyor...';
  
  state.stats = { new: 0, updated: 0, error: 0 };
  
  for (const row of validRows) {
    try {
      const existingQuery = query(collection(db, 'stocks'), where('sku', '==', row.sku));
      const existingSnap = await getDocs(existingQuery);
      
      const stockData = {
        sku: row.sku,
        name: row.name,
        brand: row.brand || '',
        model: row.model || '',
        unit: row.unit || 'ADT',
        vatRate: row.vatRate || 0,
        lastPurchasePrice: row.lastPurchasePrice || 0,
        avgCost: 0,
        salePrice: row.salePrice || 0,
        customCodes: {
          code1: row.customCode1 || '',
          code2: row.customCode2 || '',
          code3: row.customCode3 || ''
        },
        name_norm: normalizeTRLower(row.name),
        search_keywords: tokenizeForIndex(row.name),
        updatedAt: serverTimestamp()
      };
      
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

// Event handlers
qs('#stockFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    processFile(file);
  }
});

qs('#btnImport').addEventListener('click', performImport);


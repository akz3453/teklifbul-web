import { db, auth, requireAuth } from '/firebase.js';
import { compareInvoice } from '/scripts/invoice-compare.js';
import { collection, addDoc, getDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const qs = s => document.querySelector(s);

const state = {
  invoiceLines: [],
  expectedLines: [],
  discrepancies: []
};

async function compare() {
  const quoteId = qs('#matchedQuoteId').value.trim();
  if (!quoteId) {
    alert('Teklif ID girin!');
    return;
  }
  
  if (!state.invoiceLines.length) {
    alert('Fatura yüklenmedi!');
    return;
  }
  
  try {
    // Load expected lines from quote
    // TODO: Load from actual quote structure
    state.expectedLines = []; // Placeholder
    
    state.discrepancies = compareInvoice(state.expectedLines, state.invoiceLines);
    renderComparison();
    qs('#btnSave').disabled = false;
    
  } catch (error) {
    console.error('Compare error:', error);
    alert('Karşılaştırma hatası: ' + error.message);
  }
}

function renderComparison() {
  const table = qs('#compareTable');
  const tbody = qs('#compareTable tbody');
  const info = qs('#compareInfo');
  
  tbody.innerHTML = '';
  
  if (!state.discrepancies.length) {
    table.style.display = 'none';
    info.textContent = '✅ Hiçbir fark bulunamadı!';
    return;
  }
  
  table.style.display = 'table';
  info.textContent = `${state.discrepancies.length} fark bulundu.`;
  
  state.discrepancies.forEach(disc => {
    const tr = document.createElement('tr');
    const badge = 'b-discrepancy';
    const kindText = {
      'QTY': 'Miktar Farkı',
      'PRICE': 'Fiyat Farkı',
      'MISSING': 'Eksik Kalem',
      'UNEXPECTED': 'Beklenmeyen'
    }[disc.kind] || disc.kind;
    
    tr.innerHTML = `
      <td>${disc.lineNo}</td>
      <td>${disc.sku || '-'}</td>
      <td>${disc.name || '-'}</td>
      <td>${disc.expected}</td>
      <td>${disc.actual}</td>
      <td>${disc.kind === 'QTY' ? Math.abs(disc.expected - disc.actual) : disc.kind === 'PRICE' ? Math.abs(disc.expected - disc.actual).toFixed(2) : '-'}</td>
      <td><span class="badge ${badge}">${kindText}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

qs('#invoiceFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet);
      
      state.invoiceLines = json.map(row => ({
        sku: row['SKU'] || row['sku'] || '',
        name: row['Ürün Adı'] || row['name'] || '',
        qty: parseFloat(row['Miktar'] || row['qty'] || 0),
        unit: row['Birim'] || row['unit'] || 'ADT',
        unitPrice: parseFloat(row['Birim Fiyat'] || row['unitPrice'] || 0),
        total: parseFloat(row['Toplam'] || row['total'] || 0)
      }));
      
      alert(`${state.invoiceLines.length} satır yüklendi.`);
      
    } catch (error) {
      console.error('File parse error:', error);
      alert('Dosya okunamadı: ' + error.message);
    }
  };
  reader.readAsArrayBuffer(file);
});

qs('#btnCompare').addEventListener('click', compare);

qs('#btnSave').addEventListener('click', async () => {
  const user = await requireAuth();
  
  const invoiceNumber = qs('#invoiceNumber').value.trim();
  const quoteId = qs('#matchedQuoteId').value.trim();
  
  if (!invoiceNumber) {
    alert('Fatura numarası girin!');
    return;
  }
  
  try {
    await addDoc(collection(db, 'invoices'), {
      number: invoiceNumber,
      matchedQuoteId: quoteId,
      lines: state.invoiceLines,
      discrepancies: state.discrepancies,
      parsedFrom: 'excel',
      createdAt: serverTimestamp()
    });
    
    alert('Fatura karşılaştırması kaydedildi!');
    location.reload();
    
  } catch (error) {
    console.error('Save error:', error);
    alert('Kayıt başarısız: ' + error.message);
  }
});


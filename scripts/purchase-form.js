import { db, auth } from '/firebase.js';
import { normalizeTR, parseDateSmart } from '/scripts/lib/normalize-tr.js';
import { doc, getDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js';

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

const state = {
  rows: [],
  validation: [],
};

const HEADMAP = {
  'sıra no': 'lineNo', 'sira no': 'lineNo', 'no': 'lineNo',
  'malzeme kodu': 'sku', 'stok kodu':'sku', 'sku':'sku',
  'malzeme tanımı': 'name', 'malzeme tanimi':'name', 'urun adi':'name', 'ürün adı':'name', 'ad':'name',
  'marka/model': 'brandModel', 'marka model': 'brandModel', 'marka':'brandModel', 'model':'brandModel',
  'miktar': 'qty', 'qty':'qty',
  'birim': 'unit', 'unit':'unit',
  'ambardaki miktar': 'stockInWarehouse', 'depodaki miktar':'stockInWarehouse',
  'ürün görseli': 'imageUrl', 'urun gorseli':'imageUrl', 'gorsel':'imageUrl',
  'istenilen teslim tarihi': 'requestedDate', 'teslim tarihi':'requestedDate',
  'açıklama': 'note', 'aciklama':'note'
};

function mapHeaders(headers){
  return headers.map(h => HEADMAP[normalizeTR(h)] || null);
}

function toNumber(v){
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

function renderPreview(){
  const tbody = qs('#previewTable tbody');
  tbody.innerHTML = '';
  state.rows.forEach(r => {
    const tr = document.createElement('tr');
    const badge = r.matchStatus === 'FOUND' ? 'b-found' : r.matchStatus === 'MULTI' ? 'b-multi' : 'b-new';
    const badgeText = r.matchStatus === 'FOUND' ? '✅ Bulundu' : r.matchStatus === 'MULTI' ? '⚠️ Çok Aday' : '🆕 Yeni';
    tr.innerHTML = `
      <td>${r.lineNo ?? ''}</td>
      <td>${r.sku ?? ''}</td>
      <td>${r.name ?? ''}</td>
      <td>${r.brandModel ?? ''}</td>
      <td>${r.qty ?? ''}</td>
      <td>${r.unit ?? ''}</td>
      <td>${r.stockInWarehouse ?? ''}</td>
      <td>${r.imageUrl ?? ''}</td>
      <td>${r.requestedDate ?? ''}</td>
      <td>${r.note ?? ''}</td>
      <td><span class="badge ${badge}">${badgeText}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderValidation(){
  const ul = qs('#validationList');
  ul.innerHTML = '';
  if (!state.validation.length){
    ul.innerHTML = '<li>Hiç hata/uyarı yok.</li>';
    return;
  }
  state.validation.forEach(v => {
    const li = document.createElement('li');
    li.className = v.level === 'error' ? 'err' : 'warn';
    li.textContent = v.msg;
    ul.appendChild(li);
  });
}

async function findStocksBy(r){
  try{
    // 1) SKU ile
    if (r.sku){
      const q1 = query(collection(db,'stocks'), where('sku','==', String(r.sku)));
      const s1 = await getDocs(q1);
      if (s1.size === 1) return { status:'FOUND', sku: s1.docs[0].data().sku };
      if (s1.size > 1) return { status:'MULTI', options: s1.docs.map(d=>d.data().sku) };
    }
    // 2) name + unit startsWith
    const start = normalizeTR(r.name || '');
    if (!start) return { status:'NEW' };
    const snap = await getDocs(collection(db,'stocks'));
    const candidates = [];
    snap.forEach(d => {
      const x = d.data();
      if (normalizeTR(x.unit||'') === normalizeTR(r.unit||'') && normalizeTR(x.name||'').startsWith(start)){
        candidates.push(x);
      }
    });
    if (candidates.length === 1) return { status:'FOUND', sku: candidates[0].sku };
    if (candidates.length > 1) return { status:'MULTI', options: candidates.map(c=>c.sku) };
    return { status:'NEW' };
  }catch(e){
    console.warn('stock search failed', e); return { status:'NEW' };
  }
}

async function validateAndMatch(){
  state.validation = [];
  for (const r of state.rows){
    if (!r.name) state.validation.push({level:'error', msg:`Satır ${r.lineNo}: Malzeme Tanımı zorunlu`});
    if (!(toNumber(r.qty) > 0)) state.validation.push({level:'error', msg:`Satır ${r.lineNo}: Miktar > 0 olmalı`});
    if (!r.unit) state.validation.push({level:'error', msg:`Satır ${r.lineNo}: Birim zorunlu`});
    if (r.requestedDate){
      const iso = parseDateSmart(r.requestedDate);
      r.requestedDate = iso || r.requestedDate;
      if (!iso) state.validation.push({level:'warn', msg:`Satır ${r.lineNo}: Tarih tanınamadı, olduğu gibi kaydedilecek`});
    }
    const match = await findStocksBy(r);
    r.matchStatus = match.status;
    if (match.status === 'FOUND') r.sku = r.sku || match.sku;
    if (match.status === 'MULTI') state.validation.push({level:'warn', msg:`Satır ${r.lineNo}: Birden fazla stok adayı bulundu`});
  }
  renderPreview();
  renderValidation();
  qs('#btnCreate').disabled = state.validation.some(v=>v.level==='error');
  console.table(state.validation);
}

function parseSheet(ws){
  const aoa = XLSX.utils.sheet_to_json(ws, { header:1, raw:false });
  if (!aoa.length) return [];
  const headerRow = aoa[0];
  const map = mapHeaders(headerRow);
  const rows = [];
  for (let i=1;i<aoa.length;i++){
    const row = aoa[i];
    if (!row || row.every(c => (String(c||'').trim()===''))) continue;
    const r = {};
    map.forEach((k,idx)=>{ if(!k) return; r[k] = row[idx]; });
    r.lineNo = r.lineNo ?? i;
    if (r.qty != null) r.qty = toNumber(r.qty);
    if (r.stockInWarehouse != null) r.stockInWarehouse = toNumber(r.stockInWarehouse);
    r.unit = r.unit ? String(r.unit).trim().toLowerCase() : '';
    r.name = r.name ? String(r.name).trim() : '';
    rows.push(r);
  }
  return rows;
}

async function onFile(e){
  const f = e.target.files?.[0];
  if (!f) return;
  const data = await f.arrayBuffer();
  const wb = XLSX.read(data, { type:'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Detect SATFK template (H3 contains SATFK label, items from row 6, fixed columns)
  const h3 = ws['H3']?.v ? String(ws['H3'].v).toUpperCase() : '';
  if (h3.includes('SATFK')){
    const rows = [];
    for (let r=6; r<10000; r++){
      const name = ws[`C${r}`]?.v;
      const qty = ws[`E${r}`]?.v;
      const unit = ws[`F${r}`]?.v;
      const allEmpty = [ws[`B${r}`],name,qty,unit,ws[`I${r}`],ws[`J${r}`]].every(c=>!c || String(c.v).trim()==='');
      if (allEmpty) break;
      if (!name && !qty && !unit) continue;
      rows.push({
        lineNo: ws[`A${r}`]?.v ?? (r-5),
        sku: ws[`B${r}`]?.v ?? null,
        name: name ?? '',
        brandModel: ws[`D${r}`]?.v ?? null,
        qty: toNumber(qty),
        unit: unit ? String(unit).toLowerCase() : '',
        stockInWarehouse: toNumber(ws[`G${r}`]?.v),
        imageUrl: ws[`H${r}`]?.v ?? null,
        requestedDate: parseDateSmart(ws[`I${r}`]?.v) || ws[`I${r}`]?.v || null,
        note: ws[`J${r}`]?.v ?? null,
      });
    }
    state.rows = rows;
  } else {
    state.rows = parseSheet(ws);
  }
  qs('#previewInfo').textContent = `${state.rows.length} satır okundu.`;
  await validateAndMatch();
}

async function createRequest(){
  const user = auth.currentUser;
  if (!user) { alert('Oturum bulunamadı'); return; }
  const meta = {
    type: qs('#pfType').value || 'IMTF',
    title: qs('#pfTitle').value?.trim() || 'Satın Alma Talebi',
    locationId: qs('#pfLocation').value?.trim() || null,
    deliveryAddress: qs('#pfDelivery').value?.trim() || '',
    deliveryIsFreightIncluded: !!qs('#pfFreight').checked,
    requesterUserId: user.uid,
    requesterName: qs('#pfRequester').value?.trim() || user.displayName || user.email,
    note: qs('#pfNote').value?.trim() || '',
    createdAt: serverTimestamp(),
    status: 'DRAFT',
  };

  try{
    const reqRef = await addDoc(collection(db,'internal_requests'), meta);
    const linesCol = collection(reqRef, 'material_lines');
    for (const r of state.rows){
      const line = {
        lineNo: r.lineNo ?? 0,
        sku: r.sku || null,
        name: r.name || '',
        brandModel: r.brandModel || null,
        qty: r.qty || 0,
        unit: r.unit || '',
        warehouseQty: r.stockInWarehouse ?? null,
        imageUrl: r.imageUrl || null,
        requestedDate: r.requestedDate || null,
        note: r.note || null,
        matchStatus: r.matchStatus || 'NEW'
      };
      await addDoc(linesCol, line);
    }
    alert('Talep oluşturuldu.');
    location.href = `/pages/purchase-form-detail.html?id=${reqRef.id}`;
  }catch(e){
    console.error(e); alert('Kayıt sırasında hata: '+ e.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  qs('#pfFile').addEventListener('change', onFile);
  qs('#btnCreate').addEventListener('click', createRequest);
});



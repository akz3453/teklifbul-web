import { db, auth } from '/firebase.js';
import { normalizeTR, parseDateSmart } from '/scripts/lib/normalize-tr.js';
import { doc, getDoc, addDoc, collection, serverTimestamp, query, where, getDocs, limit, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js';
import { logger } from '/src/shared/log/logger.js';
import { toast } from '/src/shared/ui/toast.js';
import { MESSAGES } from '/src/shared/constants/messages.js';
import { resolveSharedCompanyId } from '/assets/js/utils/api-helpers.js';
import { FIRESTORE_IN_QUERY_LIMIT, PURCHASE_FORM_MAX_EXCEL_ROWS, STOCK_LIST_PAGE_SIZE, STOCK_SEARCH_QUERY_LIMIT, WRITE_BATCH_LIMIT } from '/src/shared/constants/timing.js';
import { buildQuerySearchTokens } from '/src/shared/stock-query-tokens.js';

const qs = s => document.querySelector(s);

const state = {
  rows: [],
  validation: [],
};

let matchAbortController = null;

const HEADMAP = {
  'sıra no': 'lineNo', 'sira no': 'lineNo', 'no': 'lineNo',
  'malzeme kodu': 'sku', 'stok kodu': 'sku', 'sku': 'sku',
  'malzeme tanımı': 'name', 'malzeme tanimi': 'name', 'urun adi': 'name', 'ürün adı': 'name', 'ad': 'name',
  'marka/model': 'brandModel', 'marka model': 'brandModel', 'marka': 'brandModel', 'model': 'brandModel',
  'miktar': 'qty', 'qty': 'qty',
  'birim': 'unit', 'unit': 'unit',
  'ambardaki miktar': 'stockInWarehouse', 'depodaki miktar': 'stockInWarehouse',
  'ürün görseli': 'imageUrl', 'urun gorseli': 'imageUrl', 'gorsel': 'imageUrl',
  'istenilen teslim tarihi': 'requestedDate', 'teslim tarihi': 'requestedDate',
  'açıklama': 'note', 'aciklama': 'note'
};

function mapHeaders(headers) {
  return headers.map(h => HEADMAP[normalizeTR(h)] || null);
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

function appendTextCell(tr, value) {
  const td = document.createElement('td');
  td.textContent = value == null ? '' : String(value);
  tr.appendChild(td);
}

function renderPreview() {
  const tbody = qs('#previewTable tbody');
  tbody.replaceChildren();
  state.rows.forEach(r => {
    const tr = document.createElement('tr');
    appendTextCell(tr, r.lineNo ?? '');
    appendTextCell(tr, r.sku ?? '');
    appendTextCell(tr, r.name ?? '');
    appendTextCell(tr, r.brandModel ?? '');
    appendTextCell(tr, r.qty ?? '');
    appendTextCell(tr, r.unit ?? '');
    appendTextCell(tr, r.stockInWarehouse ?? '');
    appendTextCell(tr, r.imageUrl ?? '');
    appendTextCell(tr, r.requestedDate ?? '');
    appendTextCell(tr, r.note ?? '');
    const statusTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = r.matchStatus === 'FOUND' ? 'badge b-found' : r.matchStatus === 'MULTI' ? 'badge b-multi' : 'badge b-new';
    badge.textContent = r.matchStatus === 'FOUND' ? 'Bulundu' : r.matchStatus === 'MULTI' ? 'Çok aday' : 'Yeni';
    statusTd.appendChild(badge);
    tr.appendChild(statusTd);
    tbody.appendChild(tr);
  });
}

function renderValidation() {
  const ul = qs('#validationList');
  ul.replaceChildren();
  if (!state.validation.length) {
    const li = document.createElement('li');
    li.textContent = 'Hiç hata/uyarı yok.';
    ul.appendChild(li);
    return;
  }
  state.validation.forEach(v => {
    const li = document.createElement('li');
    li.className = v.level === 'error' ? 'err' : 'warn';
    li.textContent = v.msg;
    ul.appendChild(li);
  });
}

function setProgress(visible, value, max, text) {
  const wrap = qs('#pfProgressWrap');
  const bar = qs('#pfProgress');
  const label = qs('#pfProgressText');
  if (!wrap || !bar || !label) return;
  wrap.hidden = !visible;
  bar.max = max || 100;
  bar.value = value || 0;
  label.textContent = text || '';
}

async function resolveCompanyId() {
  const user = auth.currentUser;
  if (!user) return null;
  const userSnap = await getDoc(doc(db, 'users', user.uid));
  if (!userSnap.exists()) return null;
  return resolveSharedCompanyId(userSnap.data());
}

async function loadStocksForRows(companyId, rows, signal) {
  const skus = [...new Set(rows.map((r) => String(r.sku || '').trim()).filter(Boolean))];
  const bySku = new Map();
  const catalogRows = [];
  for (let i = 0; i < skus.length; i += FIRESTORE_IN_QUERY_LIMIT) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const chunk = skus.slice(i, i + FIRESTORE_IN_QUERY_LIMIT);
    const snap = await getDocs(query(
      collection(db, 'stocks'),
      where('companyId', '==', companyId),
      where('sku', 'in', chunk)
    ));
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      catalogRows.push(data);
      const sku = String(data.sku || '').trim();
      if (!sku) return;
      const list = bySku.get(sku) || [];
      list.push(data);
      bySku.set(sku, list);
    });
  }
  return { companyId, bySku, rows: catalogRows, capped: false };
}

async function findNameCandidates(companyId, name, unit, signal) {
  const tokens = buildQuerySearchTokens(name).slice(0, 10);
  let docs = [];
  if (tokens.length > 0) {
    try {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const tokenQuery = tokens.length === 1
        ? query(
          collection(db, 'stocks'),
          where('companyId', '==', companyId),
          where('searchTokens', 'array-contains', tokens[0]),
          limit(STOCK_SEARCH_QUERY_LIMIT)
        )
        : query(
          collection(db, 'stocks'),
          where('companyId', '==', companyId),
          where('searchTokens', 'array-contains-any', tokens),
          limit(STOCK_SEARCH_QUERY_LIMIT)
        );
      const snap = await getDocs(tokenQuery);
      snap.forEach((docSnap) => docs.push(docSnap.data()));
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      logger.warn('purchase-form searchTokens başarısız, sayfa fallback', error);
    }
  }
  if (docs.length === 0) {
    const pageSnap = await getDocs(query(
      collection(db, 'stocks'),
      where('companyId', '==', companyId),
      limit(STOCK_LIST_PAGE_SIZE)
    ));
    pageSnap.forEach((docSnap) => docs.push(docSnap.data()));
  }
  const start = normalizeTR(name || '');
  const unitN = normalizeTR(unit || '');
  if (!start) return [];
  return docs.filter((x) => {
    if (unitN && normalizeTR(x.unit || '') !== unitN) return false;
    return normalizeTR(x.name || '').startsWith(start);
  });
}

function matchRowAgainstCatalog(r, catalog) {
  if (r.sku) {
    const skuHits = catalog.bySku.get(String(r.sku).trim()) || [];
    if (skuHits.length === 1) return { status: 'FOUND', sku: skuHits[0].sku };
    if (skuHits.length > 1) return { status: 'MULTI', options: skuHits.map((x) => x.sku) };
  }
  const start = normalizeTR(r.name || '');
  if (!start) return { status: 'NEW' };
  const unit = normalizeTR(r.unit || '');
  const candidates = catalog.rows.filter((x) =>
    normalizeTR(x.unit || '') === unit && normalizeTR(x.name || '').startsWith(start)
  );
  if (candidates.length === 1) return { status: 'FOUND', sku: candidates[0].sku };
  if (candidates.length > 1) return { status: 'MULTI', options: candidates.map((x) => x.sku) };
  return { status: 'NEW' };
}

async function validateAndMatch(signal) {
  logger.group('Satın alma formu eşleştirme');
  try {
    toast.info(MESSAGES.INFO_PURCHASE_FORM_MATCHING);
    const companyId = await resolveCompanyId();
    if (!companyId) {
      toast.error(MESSAGES.ERROR_PURCHASE_FORM_NO_COMPANY);
      logger.error('Purchase form: companyId yok');
      return false;
    }
    const catalog = await loadStocksForRows(companyId, state.rows, signal);

    state.validation = [];
    const total = state.rows.length;
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const r = state.rows[i];
      if (!r.name) state.validation.push({ level: 'error', msg: `Satır ${r.lineNo}: Malzeme Tanımı zorunlu` });
      if (!(toNumber(r.qty) > 0)) state.validation.push({ level: 'error', msg: `Satır ${r.lineNo}: Miktar > 0 olmalı` });
      if (!r.unit) state.validation.push({ level: 'error', msg: `Satır ${r.lineNo}: Birim zorunlu` });
      if (r.requestedDate) {
        const iso = parseDateSmart(r.requestedDate);
        r.requestedDate = iso || r.requestedDate;
        if (!iso) state.validation.push({ level: 'warn', msg: `Satır ${r.lineNo}: Tarih tanınamadı, olduğu gibi kaydedilecek` });
      }
      let match = matchRowAgainstCatalog(r, catalog);
      if (match.status === 'NEW' && r.name) {
        const candidates = await findNameCandidates(companyId, r.name, r.unit, signal);
        if (candidates.length === 1) match = { status: 'FOUND', sku: candidates[0].sku };
        else if (candidates.length > 1) match = { status: 'MULTI', options: candidates.map((x) => x.sku) };
      }
      r.matchStatus = match.status;
      if (match.status === 'FOUND') r.sku = r.sku || match.sku;
      if (match.status === 'MULTI') state.validation.push({ level: 'warn', msg: `Satır ${r.lineNo}: Birden fazla stok adayı bulundu` });
      setProgress(true, i + 1, total, `${MESSAGES.INFO_PURCHASE_FORM_MATCHING} (${i + 1}/${total})`);
    }
    renderPreview();
    renderValidation();
    qs('#btnCreate').disabled = state.validation.some(v => v.level === 'error');
    logger.info('Eşleştirme tamamlandı', { rows: total, skuLookups: catalog.rows.length });
  } catch (err) {
    if (err?.name === 'AbortError') {
      toast.info(MESSAGES.ERROR_OPERATION_CANCELLED);
      return false;
    }
    logger.error('Stok eşleştirme hatası', err);
    toast.error(`${MESSAGES.ERROR_PURCHASE_FORM_SAVE}: ${err.message || ''}`);
    return false;
  } finally {
    logger.end();
    setProgress(false, 0, 100, '');
  }
  return true;
}

function parseSheet(ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  if (!aoa.length) return [];
  const headerRow = aoa[0];
  const map = mapHeaders(headerRow);
  const rows = [];
  for (let i = 1; i < aoa.length; i++) {
    if (rows.length >= PURCHASE_FORM_MAX_EXCEL_ROWS) break;
    const row = aoa[i];
    if (!row || row.every(c => (String(c || '').trim() === ''))) continue;
    const r = {};
    map.forEach((k, idx) => { if (!k) return; r[k] = row[idx]; });
    r.lineNo = r.lineNo ?? i;
    if (r.qty != null) r.qty = toNumber(r.qty);
    if (r.stockInWarehouse != null) r.stockInWarehouse = toNumber(r.stockInWarehouse);
    r.unit = r.unit ? String(r.unit).trim().toLowerCase() : '';
    r.name = r.name ? String(r.name).trim() : '';
    rows.push(r);
  }
  return rows;
}

async function onFile(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  logger.group('Satın alma formu Excel');
  try {
    toast.info(MESSAGES.INFO_STOCK_LOADING);
    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const h3 = ws['H3']?.v ? String(ws['H3'].v).toUpperCase() : '';
    if (h3.includes('SATFK')) {
      const rows = [];
      for (let r = 6; r < 6 + PURCHASE_FORM_MAX_EXCEL_ROWS; r++) {
        const name = ws[`C${r}`]?.v;
        const qty = ws[`E${r}`]?.v;
        const unit = ws[`F${r}`]?.v;
        const allEmpty = [ws[`B${r}`], name, qty, unit, ws[`I${r}`], ws[`J${r}`]].every(c => !c || String(c.v).trim() === '');
        if (allEmpty) break;
        if (!name && !qty && !unit) continue;
        rows.push({
          lineNo: ws[`A${r}`]?.v ?? (r - 5),
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
    if (state.rows.length >= PURCHASE_FORM_MAX_EXCEL_ROWS) {
      toast.warn(MESSAGES.WARN_PURCHASE_FORM_ROW_CAP.replace('{count}', String(PURCHASE_FORM_MAX_EXCEL_ROWS)));
    }
    qs('#previewInfo').textContent = `${state.rows.length} satır okundu.`;
    if (matchAbortController) matchAbortController.abort();
    matchAbortController = new AbortController();
    const matched = await validateAndMatch(matchAbortController.signal);
    if (matched) toast.success('İşlem tamamlandı');
  } catch (err) {
    logger.error('Excel okuma hatası', err);
    toast.error(`${MESSAGES.ERROR_PURCHASE_FORM_SAVE}: ${err.message || ''}`);
  } finally {
    logger.end();
  }
}

async function createRequest() {
  const user = auth.currentUser;
  if (!user) {
    toast.error(MESSAGES.ERROR_AUTH);
    return;
  }

  const supplierEmail = qs('#pfSupplierEmail')?.value?.trim() || '';
  const shouldSendEmail = qs('#pfSendEmail')?.checked && supplierEmail;

  if (shouldSendEmail && !supplierEmail.includes('@')) {
    toast.error(MESSAGES.ERROR_EMAIL_INVALID);
    return;
  }

  logger.group('Satın alma talebi oluştur');
  try {
    const companyId = await resolveCompanyId();
    if (!companyId) {
      toast.error(MESSAGES.ERROR_PURCHASE_FORM_NO_COMPANY);
      return;
    }

    const meta = {
      type: qs('#pfType').value || 'IMTF',
      title: qs('#pfTitle').value?.trim() || 'Satın Alma Talebi',
      companyId,
      createdBy: user.uid,
      locationId: qs('#pfLocation').value?.trim() || null,
      deliveryAddress: qs('#pfDelivery').value?.trim() || '',
      deliveryIsFreightIncluded: !!qs('#pfFreight').checked,
      requesterUserId: user.uid,
      requesterName: qs('#pfRequester').value?.trim() || user.displayName || user.email,
      note: qs('#pfNote').value?.trim() || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'DRAFT',
    };

    qs('#btnCreate').disabled = true;
    qs('#btnCreate').textContent = 'Oluşturuluyor...';
    toast.info(MESSAGES.INFO_PURCHASE_FORM_SAVING);

    const reqRef = await addDoc(collection(db, 'internal_requests'), meta);
    const linesCol = collection(reqRef, 'material_lines');
    const total = state.rows.length;
    for (let i = 0; i < total; i += WRITE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      const chunk = state.rows.slice(i, i + WRITE_BATCH_LIMIT);
      for (const r of chunk) {
        batch.set(doc(linesCol), {
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
          matchStatus: r.matchStatus || 'NEW',
          createdAt: serverTimestamp()
        });
      }
      await batch.commit();
      setProgress(true, Math.min(i + chunk.length, total), total, `${MESSAGES.INFO_PURCHASE_FORM_SAVING} (${Math.min(i + chunk.length, total)}/${total})`);
    }
    setProgress(false, 0, 100, '');

    if (shouldSendEmail) {
      qs('#btnCreate').textContent = 'Mail gönderiliyor...';
      try {
        const token = await user.getIdToken();
        const emailResponse = await fetch('/api/supplier-quotes/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            requestId: reqRef.id,
            supplierEmail: supplierEmail
          })
        });
        const emailResult = await emailResponse.json();
        if (emailResult.success) {
          toast.success(MESSAGES.SUCCESS_PURCHASE_FORM_CREATED);
        } else {
          toast.error(`Talep oluşturuldu ama e-posta gönderilemedi: ${emailResult.error || 'Bilinmeyen hata'}`);
        }
      } catch (emailError) {
        logger.error('Email send error', emailError);
        toast.error('Talep oluşturuldu ama e-posta gönderilemedi. Talep detay sayfasından tekrar deneyebilirsiniz.');
      }
    } else {
      toast.success(MESSAGES.SUCCESS_PURCHASE_FORM_CREATED);
    }

    location.href = `/pages/purchase-form-detail.html?id=${reqRef.id}`;
  } catch (e) {
    logger.error('Talep kaydı hatası', e);
    toast.error(`${MESSAGES.ERROR_PURCHASE_FORM_SAVE}: ${e.message}`);
    qs('#btnCreate').disabled = false;
    qs('#btnCreate').textContent = 'Talep Oluştur';
  } finally {
    setProgress(false, 0, 100, '');
    logger.end();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  qs('#pfFile').addEventListener('change', onFile);
  qs('#btnCreate').addEventListener('click', createRequest);
  qs('#pfCancel')?.addEventListener('click', () => {
    if (matchAbortController) matchAbortController.abort();
  });
});

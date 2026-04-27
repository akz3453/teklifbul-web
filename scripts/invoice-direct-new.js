/**
 * Sıfırdan Fatura Oluşturma
 * Müşteri + kalem seçerek doğrudan fatura kesme akışı.
 * Teklifbul Rule v1.0 - Modüler, async/await, toast, structured logging.
 */

import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { db, requireAuth } from '/firebase.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { authFetch } from '/assets/js/utils/api-helpers.js';
import { toast } from '/src/shared/ui/toast.js';
import { logger } from '/src/shared/log/logger.js';
import { requireCompanyContext } from '/assets/js/state/company-context.js';

const DEFAULT_VAT_RATE = 20;

const state = {
  companyId: null,
  customerId: null,
  customers: [],
  stocks: [],
  items: []
};

const qs = (s) => document.querySelector(s);
const fmt = (n) => {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n || 0);
  } catch (_e) {
    return `${(Number(n) || 0).toFixed(2)} ₺`;
  }
};

function debounce(fn, ms = 200) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function makeItem() {
  return {
    id: `tmp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: '',
    sku: '',
    quantity: 1,
    unit: 'AD',
    unitPrice: 0,
    discount: 0,
    vatRate: DEFAULT_VAT_RATE,
    stockId: null
  };
}

function calcTotals() {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalVat = 0;
  let totalAmount = 0;

  for (const it of state.items) {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unitPrice) || 0;
    const d = Number(it.discount) || 0;
    const v = Number(it.vatRate) || 0;
    const gross = q * p;
    const disc = (gross * d) / 100;
    const net = gross - disc;
    const vat = (net * v) / 100;
    subtotal += gross;
    totalDiscount += disc;
    totalVat += vat;
    totalAmount += net + vat;
  }

  qs('#sumSubtotal').textContent = fmt(subtotal);
  qs('#sumDiscount').textContent = fmt(totalDiscount);
  qs('#sumVat').textContent = fmt(totalVat);
  qs('#sumGrand').textContent = fmt(totalAmount);
}

function renderItems() {
  const container = qs('#itemsContainer');
  container.innerHTML = '';

  state.items.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'form-row';
    row.style.padding = '8px 0';
    row.style.borderBottom = '1px solid #f3f4f6';
    row.dataset.index = String(idx);

    row.innerHTML = `
      <div class="autocomplete-wrap">
        <input type="text" class="it-name" placeholder="Ürün adı veya stok ara" value="${DOMPurify.sanitize(it.name || '')}" autocomplete="off">
        <div class="autocomplete-list it-stock-list"></div>
      </div>
      <input type="text" class="it-sku" placeholder="SKU" value="${DOMPurify.sanitize(it.sku || '')}">
      <input type="number" class="it-qty" min="0" step="0.001" value="${it.quantity}">
      <input type="text" class="it-unit" value="${DOMPurify.sanitize(it.unit || 'AD')}">
      <input type="number" class="it-price" min="0" step="0.01" value="${it.unitPrice}">
      <input type="number" class="it-disc" min="0" max="100" step="0.01" value="${it.discount}">
      <input type="number" class="it-vat" min="0" max="100" step="0.01" value="${it.vatRate}">
      <button type="button" class="btn btn-danger it-remove">Sil</button>
    `;

    row.querySelector('.it-name').addEventListener('input', (e) => {
      it.name = e.target.value;
      runStockSearch(row, it, e.target.value);
    });
    row.querySelector('.it-sku').addEventListener('input', (e) => { it.sku = e.target.value; });
    row.querySelector('.it-qty').addEventListener('input', (e) => { it.quantity = Number(e.target.value) || 0; calcTotals(); });
    row.querySelector('.it-unit').addEventListener('input', (e) => { it.unit = e.target.value; });
    row.querySelector('.it-price').addEventListener('input', (e) => { it.unitPrice = Number(e.target.value) || 0; calcTotals(); });
    row.querySelector('.it-disc').addEventListener('input', (e) => { it.discount = Number(e.target.value) || 0; calcTotals(); });
    row.querySelector('.it-vat').addEventListener('input', (e) => { it.vatRate = Number(e.target.value) || 0; calcTotals(); });
    row.querySelector('.it-remove').addEventListener('click', () => {
      state.items.splice(idx, 1);
      renderItems();
      calcTotals();
    });

    container.appendChild(row);
  });

  if (state.items.length === 0) {
    container.innerHTML = '<div style="color:#9ca3af;padding:16px;text-align:center;">Henüz kalem eklenmedi. Yukarıdaki "Kalem Ekle" butonuna tıklayın.</div>';
  }
}

const runStockSearch = debounce((row, it, term) => {
  const list = row.querySelector('.it-stock-list');
  if (!list) return;
  const t = String(term || '').trim().toLocaleLowerCase('tr');
  if (!t || t.length < 2) {
    list.style.display = 'none';
    return;
  }
  const matches = state.stocks.filter((s) => {
    const name = String(s.name || '').toLocaleLowerCase('tr');
    const sku = String(s.sku || '').toLocaleLowerCase('tr');
    return name.includes(t) || sku.includes(t);
  }).slice(0, 8);

  if (matches.length === 0) {
    list.style.display = 'none';
    return;
  }

  list.innerHTML = matches.map((s) => `
    <div class="autocomplete-item" data-id="${DOMPurify.sanitize(s.id)}">
      <strong>${DOMPurify.sanitize(s.name || '')}</strong>
      <small>${DOMPurify.sanitize(s.sku || '')} · ${fmt(s.salePrice || 0)} · KDV %${s.vatRate ?? DEFAULT_VAT_RATE}</small>
    </div>
  `).join('');
  list.style.display = 'block';

  list.querySelectorAll('.autocomplete-item').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const s = state.stocks.find((x) => x.id === id);
      if (!s) return;
      it.name = s.name || '';
      it.sku = s.sku || '';
      it.unit = s.unit || it.unit || 'AD';
      it.unitPrice = Number(s.salePrice || s.unitPrice || 0);
      it.vatRate = Number(s.vatRate ?? DEFAULT_VAT_RATE);
      it.stockId = s.id;
      list.style.display = 'none';
      renderItems();
      calcTotals();
    });
  });
}, 250);

async function loadCustomers() {
  try {
    const qref = query(
      collection(db, 'customers'),
      where('companyId', '==', state.companyId),
      limit(500)
    );
    const snap = await getDocs(qref);
    state.customers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    logger.info('Müşteriler yüklendi', { count: state.customers.length });
  } catch (err) {
    logger.error('Müşteri yükleme hatası', err);
    toast.error('Müşteriler yüklenemedi: ' + (err.message || ''));
  }
}

async function loadStocks() {
  try {
    const qref = query(
      collection(db, 'stocks'),
      where('companyId', '==', state.companyId),
      where('active', '==', true),
      orderBy('name'),
      limit(500)
    );
    const snap = await getDocs(qref);
    state.stocks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    logger.info('Stoklar yüklendi', { count: state.stocks.length });
  } catch (err) {
    logger.warn('Stoklar yüklenemedi (active filtresi olmayabilir)', err);
    try {
      const fallback = query(collection(db, 'stocks'), where('companyId', '==', state.companyId), limit(500));
      const snap = await getDocs(fallback);
      state.stocks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e2) {
      logger.error('Stok yedek sorgu hatası', e2);
      state.stocks = [];
    }
  }
}

function setupCustomerSearch() {
  const input = qs('#customerSearch');
  const list = qs('#customerList');
  const info = qs('#customerInfo');

  const renderList = (term) => {
    const t = String(term || '').trim().toLocaleLowerCase('tr');
    if (!t) { list.style.display = 'none'; return; }
    const matches = state.customers.filter((c) => {
      const name = String(c.name || '').toLocaleLowerCase('tr');
      const taxNo = String(c.taxNumber || '').toLocaleLowerCase('tr');
      return name.includes(t) || taxNo.includes(t);
    }).slice(0, 10);

    if (matches.length === 0) {
      list.innerHTML = '<div class="autocomplete-item" style="color:#9ca3af;">Eşleşme bulunamadı</div>';
      list.style.display = 'block';
      return;
    }

    list.innerHTML = matches.map((c) => `
      <div class="autocomplete-item" data-id="${DOMPurify.sanitize(c.id)}">
        <strong>${DOMPurify.sanitize(c.name || '-')}</strong>
        <small>${DOMPurify.sanitize(c.taxNumber || '')} ${c.email ? '· ' + DOMPurify.sanitize(c.email) : ''}</small>
      </div>
    `).join('');
    list.style.display = 'block';

    list.querySelectorAll('.autocomplete-item[data-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const c = state.customers.find((x) => x.id === id);
        if (!c) return;
        state.customerId = id;
        qs('#customerId').value = id;
        input.value = c.name || '';
        info.textContent = `VKN: ${c.taxNumber || '-'} · ${c.email || ''}`;
        list.style.display = 'none';
      });
    });
  };

  input.addEventListener('input', debounce((e) => renderList(e.target.value), 200));
  input.addEventListener('focus', () => renderList(input.value));
  document.addEventListener('click', (e) => {
    if (!list.contains(e.target) && e.target !== input) list.style.display = 'none';
  });
}

async function createInvoice() {
  if (!state.customerId) {
    toast.warn('Lütfen bir müşteri seçin');
    return;
  }
  if (state.items.length === 0) {
    toast.warn('En az bir kalem ekleyin');
    return;
  }
  for (const it of state.items) {
    if (!it.name?.trim()) {
      toast.warn('Tüm kalemler için ad zorunludur');
      return;
    }
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
      toast.warn(`Miktar geçersiz: ${it.name}`);
      return;
    }
    if (!Number.isFinite(it.unitPrice) || it.unitPrice < 0) {
      toast.warn(`Fiyat geçersiz: ${it.name}`);
      return;
    }
  }

  const btn = qs('#btnCreate');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Oluşturuluyor...';

  logger.group('Direct Invoice Create');
  try {
    const payload = {
      companyId: state.companyId,
      customerId: state.customerId,
      currency: qs('#currency').value || 'TRY',
      paymentTermsDays: Number(qs('#paymentTerms').value) || 30,
      requestId: `direct_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      items: state.items.map((it) => ({
        sku: it.sku,
        name: it.name,
        quantity: Number(it.quantity),
        unit: it.unit || 'AD',
        unitPrice: Number(it.unitPrice),
        discount: Number(it.discount) || 0,
        vatRate: Number(it.vatRate) || DEFAULT_VAT_RATE,
        stockId: it.stockId || null
      }))
    };

    logger.info('Fatura oluşturuluyor', { customer: state.customerId, items: payload.items.length });
    const res = await authFetch('/api/invoices/direct', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    logger.info('Fatura oluşturuldu', { invoiceId: data.invoiceId, number: data.number });
    toast.success(`Fatura oluşturuldu: ${data.number}`);
    setTimeout(() => {
      window.location.href = `/pages/invoice-detail.html?id=${data.invoiceId}`;
    }, 600);
  } catch (err) {
    logger.error('Fatura oluşturma hatası', err);
    toast.error('Fatura oluşturulamadı: ' + (err.message || 'Beklenmeyen hata'));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
    logger.end();
  }
}

async function init() {
  try {
    await requireAuth();
    const ctx = await requireCompanyContext({ requireActiveCompany: true });
    state.companyId = ctx?.companyId || ctx?.activeCompanyId || null;
    if (!state.companyId) {
      toast.error('Şirket bilgisi bulunamadı');
      return;
    }

    await Promise.all([loadCustomers(), loadStocks()]);
    setupCustomerSearch();

    state.items.push(makeItem());
    renderItems();
    calcTotals();

    qs('#btnAddItem').addEventListener('click', () => {
      state.items.push(makeItem());
      renderItems();
      calcTotals();
    });

    qs('#btnCreate').addEventListener('click', createInvoice);
  } catch (err) {
    logger.error('Init hatası', err);
    toast.error('Sayfa yüklenemedi: ' + (err.message || ''));
  }
}

document.addEventListener('DOMContentLoaded', init);

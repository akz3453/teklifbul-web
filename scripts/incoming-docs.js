/**
 * Incoming e-Documents - Faturalama Modülü
 * Entegratörden düşen fatura/irsaliyeleri stoklarla eşleştirir,
 * yeni ürünler için hızlı stok kartı oluşturur ve onay sonrası
 * stok hareketi üretir.
 *
 * Teklifbul Rule v1.0 - Modüler, async/await, toast bildirimleri,
 * structured logging, XSS güvenliği.
 */

import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { db, requireAuth, auth } from '/firebase.js';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  limit
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { toast } from '/src/shared/ui/toast.js';
import { logger } from '/src/shared/log/logger.js';
import { requireCompanyContext } from '/assets/js/state/company-context.js';
import { authFetch } from '/assets/js/utils/api-helpers.js';
import { loadCompanyStocksPaged } from '/assets/js/utils/stock-catalog-query.js';
import { MESSAGES } from '/src/shared/constants/messages.js';
import { STOCK_LOCATIONS_QUERY_LIMIT } from '/src/shared/constants/timing.js';

const STATUS_LABELS = {
  pending_mapping: 'Eşleşme Bekliyor',
  ready: 'Hazır',
  processed: 'İşlendi',
  failed: 'Başarısız'
};

const STATUS_CLASS = {
  pending_mapping: 'status-pending',
  ready: 'status-ready',
  processed: 'status-processed',
  failed: 'status-pending'
};

const state = {
  companyId: null,
  user: null,
  docs: [],
  currentDoc: null,
  stocks: [],
  mappings: {},
  locations: [],
  defaultLocationId: null,
  activeItemIdx: -1
};

const qs = (s) => document.querySelector(s);
const escape = (text) => DOMPurify.sanitize(String(text ?? ''));

const formatDate = (ts) => {
  if (!ts) return '-';
  let d = ts;
  if (ts && typeof ts.toDate === 'function') d = ts.toDate();
  else if (typeof ts === 'string' || typeof ts === 'number') d = new Date(ts);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('tr-TR');
};

const formatNumber = (n, digits = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return v.toFixed(digits);
};

async function init() {
  logger.group('IncomingDocs init');
  try {
    const user = await requireAuth();
    if (!user) {
      window.location.href = '/index.html';
      return;
    }
    state.user = user;

    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx?.companyId) {
      toast.error('Şirket bağlamı çözülemedi.');
      return;
    }
    state.companyId = ctx.companyId;

    setupListeners();

    await Promise.all([loadStocks(), loadMappings(), loadLocations()]);
    await loadDocs();
    logger.info('IncomingDocs hazır', { companyId: state.companyId });
  } catch (err) {
    logger.error('IncomingDocs init hatası', err);
    toast.error(`Başlatma hatası: ${err?.message || err}`);
  } finally {
    logger.end();
  }
}

function setupListeners() {
  qs('#btnSync')?.addEventListener('click', syncDocs);
  qs('#btnSaveMapping')?.addEventListener('click', saveItemMapping);
  qs('#btnProcessToStock')?.addEventListener('click', processToStock);
  qs('#btnCancelMapping')?.addEventListener('click', () => {
    qs('#itemMapModal').style.display = 'none';
  });
  qs('#btnCreateStockHere')?.addEventListener('click', openQuickStockModal);
  qs('#btnCancelQuickStock')?.addEventListener('click', () => {
    qs('#quickStockModal').style.display = 'none';
  });
  qs('#btnSaveQuickStock')?.addEventListener('click', saveQuickStock);

  qs('#stockSearch')?.addEventListener('input', (e) => {
    const term = e.target.value.toLocaleLowerCase('tr');
    const filtered = state.stocks.filter((s) => {
      const name = String(s.name || '').toLocaleLowerCase('tr');
      const sku = String(s.sku || '').toLocaleLowerCase('tr');
      return name.includes(term) || sku.includes(term);
    }).slice(0, 25);
    renderStockSelect(filtered);
  });

  qs('#stockSelect')?.addEventListener('change', (e) => {
    const stockId = e.target.value;
    const stock = state.stocks.find((s) => s.id === stockId);
    if (stock) {
      qs('#targetUnit').value = stock.unit || 'ADT';
    }
  });
}

async function loadStocks() {
  try {
    const { rows, capped } = await loadCompanyStocksPaged(db, state.companyId);
    state.stocks = rows;
    if (capped) {
      toast.warn(MESSAGES.WARN_STOCK_LIMIT_REACHED.replace('{count}', String(rows.length)));
    }
    renderStockSelect(state.stocks.slice(0, 50));
  } catch (err) {
    logger.error('Stoklar yüklenemedi', err);
    toast.error(`Stoklar yüklenemedi: ${err?.message || err}`);
  }
}

function renderStockSelect(list) {
  const sel = qs('#stockSelect');
  if (!sel) return;
  const options = list.map((s) =>
    `<option value="${escape(s.id)}">${escape(s.name)} (${escape(s.sku || 'N/A')}) [${escape(s.unit || '?')}]</option>`
  ).join('');
  sel.innerHTML = `<option value="">-- Stok Seçin --</option>${options}`;
}

async function loadLocations() {
  try {
    const q = query(
      collection(db, 'stock_locations'),
      where('companyId', '==', state.companyId),
      limit(STOCK_LOCATIONS_QUERY_LIMIT)
    );
    const snap = await getDocs(q);
    state.locations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const fallback = state.locations.find((l) => l.isDefault) || state.locations[0];
    state.defaultLocationId = fallback?.id || null;

    const sel = qs('#defaultLocationSelect');
    if (sel) {
      sel.innerHTML = state.locations.map((l) => {
        const typeLabel = l.type === 'warehouse' ? 'Depo' : (l.type || 'Lokasyon');
        return `<option value="${escape(l.id)}">${escape(l.name)} (${escape(typeLabel)})</option>`;
      }).join('');
      if (!state.locations.length) {
        sel.innerHTML = `<option value="">Lokasyon yok</option>`;
      } else if (state.defaultLocationId) {
        sel.value = state.defaultLocationId;
      }
      sel.addEventListener('change', (e) => {
        state.defaultLocationId = e.target.value || null;
      });
    }
  } catch (err) {
    logger.warn('Lokasyonlar yüklenemedi', err);
  }
}

async function loadMappings() {
  try {
    const q = query(collection(db, 'supplier_item_mappings'), where('companyId', '==', state.companyId));
    const snap = await getDocs(q);
    state.mappings = {};
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data?.supplierItemName) {
        state.mappings[data.supplierItemName] = data;
      }
    });
  } catch (err) {
    logger.warn('Eşleşmeler yüklenemedi', err);
  }
}

async function loadDocs() {
  const tbody = qs('#docsTableBody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px;">Yükleniyor...</td></tr>`;
  try {
    const q = query(collection(db, 'incoming_edocs'), where('companyId', '==', state.companyId));
    const snap = await getDocs(q);
    state.docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.docs.sort((a, b) => (b?.issueDate?.seconds || 0) - (a?.issueDate?.seconds || 0));
    renderDocsTable();
  } catch (err) {
    logger.error('Belgeler yüklenemedi', err);
    toast.error(`Belgeler yüklenemedi: ${err?.message || err}`);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:#ef4444;">Belgeler yüklenirken hata oluştu.</td></tr>`;
  }
}

function renderDocsTable() {
  const tbody = qs('#docsTableBody');
  if (!state.docs.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">Henüz belge bulunamadı. Üstteki "Yeni Belgeleri Çek" düğmesine basabilirsiniz.</td></tr>';
    return;
  }

  tbody.innerHTML = state.docs.map((d) => {
    const status = d.status || 'pending_mapping';
    const cls = STATUS_CLASS[status] || 'status-pending';
    const label = STATUS_LABELS[status] || status;
    return `
      <tr data-id="${escape(d.id)}">
        <td>${escape(formatDate(d.issueDate))}</td>
        <td><strong>${escape(d.senderTitle || '-')}</strong><br><small>${escape(d.senderVkn || '-')}</small></td>
        <td>${escape(d.type === 'invoice' ? 'Fatura' : d.type === 'despatch' ? 'İrsaliye' : (d.type || '-'))}</td>
        <td>${escape(d.documentNumber || d.ettn || d.uuid || '-')}</td>
        <td>${escape(formatNumber(d.totalAmount || 0))} ${escape(d.currency || 'TRY')}</td>
        <td><span class="status-badge ${cls}">${escape(label)}</span></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', () => openDoc(tr.getAttribute('data-id')));
  });
}

function openDoc(id) {
  state.currentDoc = state.docs.find((d) => d.id === id) || null;
  if (!state.currentDoc) return;
  renderDocDetail();
  qs('#docModal').style.display = 'flex';
}

window.closeModal = () => {
  qs('#docModal').style.display = 'none';
};

function renderDocDetail() {
  const cur = state.currentDoc;
  qs('#docInfo').innerHTML = `
    <div>
      <p><strong>Gönderici:</strong> ${escape(cur.senderTitle || '-')}</p>
      <p><strong>VKN:</strong> ${escape(cur.senderVkn || '-')}</p>
    </div>
    <div>
      <p><strong>Tarih:</strong> ${escape(formatDate(cur.issueDate))}</p>
      <p><strong>Tutar:</strong> ${escape(formatNumber(cur.totalAmount || 0))} ${escape(cur.currency || 'TRY')}</p>
    </div>
  `;

  const items = Array.isArray(cur.items) ? cur.items : [];
  const list = qs('#mappingList');
  let allMapped = true;

  list.innerHTML = items.map((item, idx) => {
    let mappedStock = null;
    let multiplier = item.conversionMultiplier || 1;

    if (item.mappedInternalStockId) {
      mappedStock = state.stocks.find((s) => s.id === item.mappedInternalStockId);
    } else if (state.mappings[item.name]) {
      const m = state.mappings[item.name];
      mappedStock = state.stocks.find((s) => s.id === m.internalStockId);
      multiplier = m.conversionMultiplier || 1;
      item.mappedInternalStockId = mappedStock?.id;
      item.conversionMultiplier = multiplier;
    }

    if (!mappedStock) allMapped = false;

    const rowClass = mappedStock ? 'item-mapped' : 'item-unmapped';
    const calculatedQty = formatNumber((item.quantity || 0) * multiplier);
    const unitPrice = item.unitPrice || 0;
    const calcUnitPrice = multiplier ? formatNumber(unitPrice / multiplier, 4) : '0';

    return `
      <div class="mapping-row ${rowClass}">
        <div>
          <strong>${escape(item.name || '-')}</strong><br>
          <small>${escape(formatNumber(item.quantity || 0))} ${escape(item.unit || '')} × ${escape(formatNumber(unitPrice, 2))} ${escape(cur.currency || 'TRY')}</small>
        </div>
        <div>${mappedStock ? escape(mappedStock.name) : '<span style="color:#ef4444">Eşlenmedi</span>'}</div>
        <div>${escape(multiplier)}</div>
        <div>${escape(calculatedQty)} ${escape(mappedStock?.unit || item.unit || '')}<br><small>Birim: ${escape(calcUnitPrice)}</small></div>
        <div>
          <button type="button" class="btn btn-secondary" data-idx="${idx}" data-action="map">Eşleştir</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('button[data-action="map"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.currentTarget.getAttribute('data-idx'));
      openItemMapModal(idx);
    });
  });

  const btnProcess = qs('#btnProcessToStock');
  btnProcess.disabled = !allMapped || state.currentDoc.status === 'processed';
  qs('#mappingSummary').textContent = state.currentDoc.status === 'processed'
    ? 'Bu belge zaten stoğa işlenmiş.'
    : (allMapped
      ? 'Tüm kalemler hazır. Stoğa kaydedebilirsiniz.'
      : 'Lütfen tüm kalemleri sistemdeki stoklarınızla eşleştirin veya yeni stok kartı oluşturun.');
}

function openItemMapModal(idx) {
  state.activeItemIdx = idx;
  const item = state.currentDoc.items[idx];
  if (!item) return;

  qs('#mapItemOriginalName').textContent = item.name || '';
  qs('#stockSearch').value = '';
  qs('#multiplier').value = item.conversionMultiplier || 1;
  qs('#targetUnit').value = '';

  renderStockSelect(state.stocks.slice(0, 50));

  if (item.mappedInternalStockId) {
    qs('#stockSelect').value = item.mappedInternalStockId;
    const s = state.stocks.find((st) => st.id === item.mappedInternalStockId);
    if (s) qs('#targetUnit').value = s.unit || 'ADT';
  }

  qs('#itemMapModal').style.display = 'flex';
}

async function saveItemMapping() {
  logger.group('Item mapping kaydediliyor');
  try {
    const stockId = qs('#stockSelect').value;
    const multiplier = parseFloat(qs('#multiplier').value) || 1;

    if (!stockId) {
      toast.warn('Lütfen bir stok seçin veya yeni stok kartı oluşturun.');
      logger.end();
      return;
    }
    if (multiplier <= 0) {
      toast.warn('Birim çarpanı 0\'dan büyük olmalıdır.');
      logger.end();
      return;
    }

    const item = state.currentDoc.items[state.activeItemIdx];
    item.mappedInternalStockId = stockId;
    item.conversionMultiplier = multiplier;

    qs('#itemMapModal').style.display = 'none';
    renderDocDetail();

    const safeKey = encodeURIComponent(item.name || '').slice(0, 80);
    await setDoc(doc(db, 'supplier_item_mappings', `${state.companyId}_${safeKey}`), {
      companyId: state.companyId,
      supplierItemName: item.name,
      internalStockId: stockId,
      conversionMultiplier: multiplier,
      updatedAt: serverTimestamp()
    });

    await updateDoc(doc(db, 'incoming_edocs', state.currentDoc.id), {
      items: state.currentDoc.items
    });

    await loadMappings();
    renderDocDetail();
    toast.success('Eşleştirme kaydedildi. Aynı isimdeki ürünler otomatik tanınacak.');
    logger.info('Eşleşme kaydedildi', { item: item.name, stockId });
  } catch (err) {
    logger.error('Eşleştirme kaydedilemedi', err);
    toast.error(`Eşleştirme hatası: ${err?.message || err}`);
  } finally {
    logger.end();
  }
}

function openQuickStockModal() {
  const item = state.currentDoc?.items?.[state.activeItemIdx];
  if (!item) {
    toast.warn('Önce bir kalem seçin.');
    return;
  }
  qs('#qsName').value = item.name || '';
  qs('#qsSku').value = '';
  qs('#qsUnit').value = item.unit || 'ADT';
  qs('#qsPrice').value = item.unitPrice || '';
  qs('#qsVat').value = item.vatRate || 20;
  qs('#quickStockModal').style.display = 'flex';
}

async function saveQuickStock() {
  logger.group('Hızlı stok kartı oluşturuluyor');
  try {
    const name = qs('#qsName').value.trim();
    let sku = qs('#qsSku').value.trim();
    const unit = qs('#qsUnit').value.trim() || 'ADT';
    const price = parseFloat(qs('#qsPrice').value) || 0;
    const vat = parseFloat(qs('#qsVat').value) || 0;

    if (!name) {
      toast.warn('Ürün adı zorunludur.');
      logger.end();
      return;
    }

    if (!sku) {
      sku = `AUTO-${Date.now().toString(36).toUpperCase()}`;
    }
    const skuNorm = sku.toUpperCase();

    const dupQ = query(
      collection(db, 'stocks'),
      where('companyId', '==', state.companyId),
      where('sku_norm', '==', skuNorm)
    );
    const dupSnap = await getDocs(dupQ);
    if (!dupSnap.empty) {
      toast.error(`Bu SKU zaten kullanılıyor: ${sku}`);
      logger.end();
      return;
    }

    const stockData = {
      companyId: state.companyId,
      name,
      sku,
      sku_norm: skuNorm,
      unit,
      lastPurchasePrice: price,
      avgCost: price,
      vatRate: vat,
      quantity: 0,
      hasExpiry: false,
      stockTrackingType: 'standard',
      createdAt: serverTimestamp(),
      createdBy: state.user.uid,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid,
      source: 'incoming_edoc'
    };

    const ref = await addDoc(collection(db, 'stocks'), stockData);
    state.stocks.push({ id: ref.id, ...stockData });
    renderStockSelect(state.stocks.slice(-50));

    qs('#stockSelect').value = ref.id;
    qs('#targetUnit').value = unit;
    qs('#multiplier').value = 1;

    qs('#quickStockModal').style.display = 'none';
    toast.success(`Stok kartı oluşturuldu: ${name}`);
    logger.info('Hızlı stok oluşturuldu', { stockId: ref.id, name, sku });
  } catch (err) {
    logger.error('Hızlı stok oluşturulamadı', err);
    toast.error(`Stok oluşturulamadı: ${err?.message || err}`);
  } finally {
    logger.end();
  }
}

async function processToStock() {
  if (!state.currentDoc) return;
  const ok = window.confirm('Seçilen ürünler belirtilen miktarlarda stoklarınıza eklenecek. Onaylıyor musunuz?');
  if (!ok) return;

  logger.group('Stok hareketleri işleniyor (server)');
  const btn = qs('#btnProcessToStock');
  try {
    btn.disabled = true;
    btn.textContent = 'Kaydediliyor...';
    toast.info('Stoklar güncelleniyor, lütfen bekleyin...');

    const items = state.currentDoc.items || [];
    const unmapped = items.filter((it) => !it.mappedInternalStockId);
    if (unmapped.length > 0) {
      throw new Error(`${unmapped.length} kalem hâlâ eşlenmedi: ${unmapped.map((u) => u.name).join(', ')}`);
    }

    const locationId = state.defaultLocationId || 'DEFAULT';

    const res = await authFetch(`/api/incoming-docs/${encodeURIComponent(state.currentDoc.id)}/process-to-stock`, {
      method: 'POST',
      body: JSON.stringify({
        companyId: state.companyId,
        locationId
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data?.error || `İstek başarısız (${res.status})`);
    }

    toast.success(`${data.processed || 0} kalem stoğa kaydedildi.`);
    logger.info('Stok hareketleri kaydedildi (server)', {
      docId: state.currentDoc.id,
      processed: data.processed,
      movementIds: data.movementIds
    });
    qs('#docModal').style.display = 'none';
    await Promise.all([loadStocks(), loadDocs()]);
  } catch (err) {
    logger.error('Stoğa işlenirken hata', err);
    toast.error(`Hata oluştu: ${err?.message || err}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '📦 Stoğa Kaydet';
    logger.end();
  }
}

async function syncDocs() {
  logger.group('Yeni belgeler çekiliyor');
  const btn = qs('#btnSync');
  try {
    btn.disabled = true;
    btn.textContent = 'Çekiliyor...';
    toast.info('Entegratörden yeni belgeler çekiliyor...');

    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch(`/api/efatura/check-incoming?companyId=${encodeURIComponent(state.companyId)}`, {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok === false) {
      throw new Error(data?.error || `İstek başarısız (${res.status})`);
    }

    const count = data.processedCount ?? data.count ?? 0;
    toast.success(`${count} yeni belge havuzuna eklendi.`);
    await loadDocs();
  } catch (err) {
    logger.error('Sync hatası', err);
    toast.error(`Entegratör bağlantı hatası: ${err?.message || err}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Yeni Belgeleri Çek';
    logger.end();
  }
}

init();

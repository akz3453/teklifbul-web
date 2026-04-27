/**
 * Delivery Notes List - Faturalama Modülü
 * Şirketin oluşturduğu e-irsaliyelerin listelenmesi.
 * Teklifbul Rule v1.0 - Modüler, async/await, toast bildirimleri.
 */

import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { db, requireAuth } from '/firebase.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { toast } from '/src/shared/ui/toast.js';
import { logger } from '/src/shared/log/logger.js';
import { requireCompanyContext } from '/assets/js/state/company-context.js';

const PAGE_SIZE = 25;

const STATUS_LABELS = {
  draft: 'Taslak',
  prepared: 'Hazır',
  sent: 'Gönderildi',
  accepted: 'Kabul',
  rejected: 'Red',
  cancelled: 'İptal'
};

const state = {
  companyId: null,
  pageStack: [],
  currentPage: 1,
  filters: {
    status: '',
    from: '',
    to: '',
    search: ''
  },
  rows: [],
  hasNext: false
};

const qs = (s) => document.querySelector(s);

const formatDate = (ts) => {
  if (!ts) return '-';
  let d = ts;
  if (ts && typeof ts.toDate === 'function') d = ts.toDate();
  else if (typeof ts === 'string' || typeof ts === 'number') d = new Date(ts);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short' }).format(d);
};

const escape = (text) => DOMPurify.sanitize(String(text ?? ''));

function statusBadge(status) {
  const cls = `status-${status || 'draft'}`;
  const label = STATUS_LABELS[status] || status || '—';
  return `<span class="status-badge ${cls}">${escape(label)}</span>`;
}

function renderRows() {
  const tbody = qs('#deliveryNotesTableBody');
  if (!state.rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Kayıt bulunamadı.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.rows.map((row) => {
    const buyer = row?.snapshot?.buyer?.title || '-';
    const items = Array.isArray(row?.snapshot?.items) ? row.snapshot.items.length : 0;
    const issued = row?.snapshot?.dates?.issued || row?.createdAt;
    return `
      <tr data-id="${escape(row.id)}">
        <td><strong>${escape(row.number || '—')}</strong></td>
        <td>${escape(buyer)}</td>
        <td>${escape(items)} kalem</td>
        <td>${statusBadge(row.status)}</td>
        <td>${escape(formatDate(issued))}</td>
        <td>
          <a class="btn btn-secondary" href="/pages/delivery-note-detail.html?id=${encodeURIComponent(row.id)}">Görüntüle</a>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', (ev) => {
      if (ev.target.closest('a,button')) return;
      const id = tr.getAttribute('data-id');
      if (id) window.location.href = `/pages/delivery-note-detail.html?id=${encodeURIComponent(id)}`;
    });
  });
}

function applyClientSearch(rows, search) {
  if (!search) return rows;
  const s = search.trim().toLocaleLowerCase('tr');
  if (!s) return rows;
  return rows.filter((row) => {
    const number = String(row.number || '').toLocaleLowerCase('tr');
    const buyer = String(row?.snapshot?.buyer?.title || '').toLocaleLowerCase('tr');
    const vkn = String(row?.snapshot?.buyer?.vkn || '').toLocaleLowerCase('tr');
    return number.includes(s) || buyer.includes(s) || vkn.includes(s);
  });
}

function applyDateFilter(rows, fromStr, toStr) {
  const from = fromStr ? new Date(fromStr) : null;
  const to = toStr ? new Date(toStr) : null;
  if (to) to.setHours(23, 59, 59, 999);
  if (!from && !to) return rows;
  return rows.filter((row) => {
    const ts = row?.snapshot?.dates?.issued || row?.createdAt;
    let d = ts;
    if (ts && typeof ts.toDate === 'function') d = ts.toDate();
    else if (typeof ts === 'string' || typeof ts === 'number') d = new Date(ts);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

async function loadPage({ direction = 'first' } = {}) {
  if (!state.companyId) return;
  logger.group('Delivery notes listesi yükleniyor');
  try {
    const tbody = qs('#deliveryNotesTableBody');
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Yükleniyor...</td></tr>`;

    const constraints = [
      where('companyId', '==', state.companyId),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE + 1)
    ];

    if (state.filters.status) {
      constraints.unshift(where('status', '==', state.filters.status));
    }

    if (direction === 'next' && state.pageStack.length > 0) {
      const cursor = state.pageStack[state.pageStack.length - 1];
      constraints.push(startAfter(cursor));
    } else if (direction === 'first') {
      state.pageStack = [];
      state.currentPage = 1;
    } else if (direction === 'prev') {
      state.pageStack.pop();
      const cursor = state.pageStack[state.pageStack.length - 1];
      if (cursor) constraints.push(startAfter(cursor));
      state.currentPage = Math.max(1, state.currentPage - 1);
    }

    const q = query(collection(db, 'delivery_notes'), ...constraints);
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    state.hasNext = docs.length > PAGE_SIZE;
    const pageDocs = docs.slice(0, PAGE_SIZE);

    let filtered = applyDateFilter(pageDocs, state.filters.from, state.filters.to);
    filtered = applyClientSearch(filtered, state.filters.search);

    state.rows = filtered;

    if (direction === 'next' && pageDocs.length > 0) {
      state.pageStack.push(snap.docs[pageDocs.length - 1]);
      state.currentPage += 1;
    } else if (direction === 'first' && pageDocs.length > 0) {
      state.pageStack = [snap.docs[pageDocs.length - 1]];
    }

    renderRows();
    qs('#summary').textContent =
      `Sayfa ${state.currentPage} • ${state.rows.length} kayıt gösteriliyor`;
    qs('#pageInfo').textContent = `Sayfa ${state.currentPage}`;
    qs('#prevPage').disabled = state.currentPage <= 1;
    qs('#nextPage').disabled = !state.hasNext;
    logger.info('Delivery notes listesi yüklendi', { count: state.rows.length });
  } catch (err) {
    logger.error('Delivery notes listesi yükleme hatası', err);
    if (String(err?.code) === 'failed-precondition') {
      toast.error('Listeleme için Firestore index eksik olabilir.');
    } else {
      toast.error(`İrsaliyeler yüklenemedi: ${err?.message || err}`);
    }
    qs('#deliveryNotesTableBody').innerHTML =
      `<tr><td colspan="6" class="empty-state">Yüklenirken hata oluştu.</td></tr>`;
  } finally {
    logger.end();
  }
}

function readFiltersFromForm() {
  state.filters.status = qs('#filterStatus').value || '';
  state.filters.from = qs('#filterFrom').value || '';
  state.filters.to = qs('#filterTo').value || '';
  state.filters.search = qs('#filterSearch').value || '';
}

function setupListeners() {
  qs('#btnApplyFilter').addEventListener('click', () => {
    readFiltersFromForm();
    loadPage({ direction: 'first' });
  });
  qs('#btnResetFilter').addEventListener('click', () => {
    qs('#filterStatus').value = '';
    qs('#filterFrom').value = '';
    qs('#filterTo').value = '';
    qs('#filterSearch').value = '';
    readFiltersFromForm();
    loadPage({ direction: 'first' });
  });
  qs('#prevPage').addEventListener('click', () => loadPage({ direction: 'prev' }));
  qs('#nextPage').addEventListener('click', () => loadPage({ direction: 'next' }));
  qs('#filterSearch').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      readFiltersFromForm();
      loadPage({ direction: 'first' });
    }
  });
}

(async () => {
  try {
    const user = await requireAuth();
    if (!user) {
      window.location.href = '/index.html';
      return;
    }
    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx?.companyId) {
      toast.error('Şirket bağlamı çözülemedi.');
      return;
    }
    state.companyId = ctx.companyId;
    setupListeners();
    await loadPage({ direction: 'first' });
  } catch (err) {
    logger.error('Delivery notes list init hatası', err);
    toast.error(`Başlatma hatası: ${err?.message || err}`);
  }
})();

/**
 * Stock Groups (Özel Kod Yönetimi) - Teklifbul Rule v1.0
 */
import { db, auth, requireAuth } from '/firebase.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp, limit, arrayUnion, arrayRemove, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { toast } from '../src/shared/ui/toast.js';
import { logger } from '../src/shared/log/logger.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, getStockPerms } from '../assets/js/state/permissions.js';
import { loadCompanyStocksPaged } from '../assets/js/utils/stock-catalog-query.js';
import { MESSAGES } from '../src/shared/constants/messages.js';

const qs = s => document.querySelector(s);
const STOCK_PERMS = getStockPerms();

const state = {
  companyId: null,
  groups: [],
  allStocks: [],
  editGroupId: null,
  modalGroupId: null,
  selectedProductIds: new Set(),
  lastFilteredProductIds: []
};

// ── Helpers ──
function escapeHtml(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function normalizeKey(v) { return String(v || '').trim().toLocaleLowerCase('tr-TR'); }

// Teklifbul Rule v1.0 - Firma bazlı otomatik grup kodu/adı üretimi
function getNextGroupSequence() {
  const used = new Set();

  state.groups.forEach((g) => {
    const codeMatch = String(g.code || '').match(/^OK-(\d{3})$/i);
    const nameMatch = String(g.name || '').match(/^Özel Kod\s+(\d+)$/i);

    if (codeMatch) used.add(Number(codeMatch[1]));
    if (nameMatch) used.add(Number(nameMatch[1]));
  });

  let seq = 1;
  while (used.has(seq)) seq += 1;
  return seq;
}

function buildAutoGroupValues(seq) {
  return {
    code: `OK-${String(seq).padStart(3, '0')}`,
    name: `Özel Kod ${seq}`
  };
}

function applyAutoGroupDefaults() {
  if (state.editGroupId) return;
  const codeEl = qs('#inputCode');
  const nameEl = qs('#inputName');
  if (!codeEl || !nameEl) return;
  const next = buildAutoGroupValues(getNextGroupSequence());
  codeEl.value = next.code;
  nameEl.value = next.name;
}

// ── Load Groups ──
async function loadGroups() {
  try {
    const snap = await getDocs(query(
      collection(db, 'stockGroups'),
      where('companyId', '==', state.companyId),
      limit(500)
    ));
    state.groups = [];
    snap.forEach(d => state.groups.push({ id: d.id, ...d.data() }));
    state.groups.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    renderGroups();
    applyAutoGroupDefaults();
  } catch (e) {
    logger.error('Load groups error', e);
    toast.error('Gruplar yüklenemedi: ' + e.message);
  }
}

// ── Render Groups ──
function renderGroups() {
  const grid = qs('#groupsGrid');
  if (!state.groups.length) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;grid-column:1/-1">Henüz grup oluşturulmamış.</div>';
    return;
  }
  grid.innerHTML = state.groups.map(g => {
    const count = (g.productIds || []).length;
    return `
      <div class="group-card" data-id="${g.id}">
        <div class="group-card-header">
          <div>
            <span class="group-card-code">${escapeHtml(g.code)}</span>
            <h4 class="group-card-title" style="margin-top:8px">${escapeHtml(g.name)}</h4>
            <p class="group-card-desc">${escapeHtml(g.description || '—')}</p>
          </div>
        </div>
        <div class="group-card-count">📦 ${count} ürün</div>
        <div class="group-card-actions">
          <button class="btn-add" data-action="add-products" data-id="${g.id}">➕ Ürün Ekle</button>
          <button data-action="view-products" data-id="${g.id}">📋 Ürünler</button>
          <button data-action="edit-group" data-id="${g.id}">✏️ Düzenle</button>
          <button class="btn-del" data-action="delete-group" data-id="${g.id}">🗑️</button>
        </div>
      </div>`;
  }).join('');

  // Event delegation
  grid.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'add-products') openProductModal(id);
      else if (action === 'view-products') showGroupProducts(id);
      else if (action === 'edit-group') startEditGroup(id);
      else if (action === 'delete-group') deleteGroup(id);
    });
  });
}

// ── Create / Update Group ──
async function saveGroup() {
  const code = qs('#inputCode').value.trim();
  const name = qs('#inputName').value.trim();
  const desc = qs('#inputDesc').value.trim();

  if (!can(STOCK_PERMS.groups?.edit)) { toast.error('Grup düzenleme yetkiniz yok.'); return; }
  if (!code || !name) { toast.error('Grup kodu ve adı zorunludur.'); return; }

  try {
    if (state.editGroupId) {
      const duplicateCode = state.groups.find(
        g => g.id !== state.editGroupId && normalizeKey(g.code) === normalizeKey(code)
      );
      if (duplicateCode) { toast.error('Bu grup kodu zaten mevcut!'); return; }

      const duplicateName = state.groups.find(
        g => g.id !== state.editGroupId && normalizeKey(g.name) === normalizeKey(name)
      );
      if (duplicateName) { toast.error('Bu grup adı zaten mevcut!'); return; }

      await updateDoc(doc(db, 'stockGroups', state.editGroupId), {
        code, name, 
        description: desc || null, 
        companyId: state.companyId,
        updatedAt: serverTimestamp()
      });
      toast.success('Grup güncellendi.');
      cancelEdit();
    } else {
      // Firma içinde kod/ad tekrarı engelle
      const duplicateCode = state.groups.find(g => normalizeKey(g.code) === normalizeKey(code));
      if (duplicateCode) { toast.error('Bu grup kodu zaten mevcut!'); return; }

      const duplicateName = state.groups.find(g => normalizeKey(g.name) === normalizeKey(name));
      if (duplicateName) { toast.error('Bu grup adı zaten mevcut!'); return; }

      await addDoc(collection(db, 'stockGroups'), {
        code, name, description: desc || null,
        productIds: [], companyId: state.companyId,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      toast.success('Grup oluşturuldu.');
      qs('#inputCode').value = '';
      qs('#inputName').value = '';
      qs('#inputDesc').value = '';
    }
    await loadGroups();
  } catch (e) {
    logger.error('Save group error', e);
    toast.error('Kayıt hatası: ' + e.message);
  }
}

function startEditGroup(id) {
  const g = state.groups.find(x => x.id === id);
  if (!g) return;
  state.editGroupId = id;
  qs('#inputCode').value = g.code || '';
  qs('#inputName').value = g.name || '';
  qs('#inputDesc').value = g.description || '';
  qs('#formCardTitle').textContent = '✏️ Grubu Düzenle';
  qs('#btnCancelEdit').style.display = 'inline-block';
  qs('#inputCode').focus();
}

function cancelEdit() {
  state.editGroupId = null;
  applyAutoGroupDefaults();
  qs('#inputDesc').value = '';
  qs('#formCardTitle').textContent = '➕ Yeni Grup Oluştur';
  qs('#btnCancelEdit').style.display = 'none';
}

async function deleteGroup(id) {
  const g = state.groups.find(x => x.id === id);
  if (!confirm(`"${g?.name}" grubu silinecek. Devam?`)) return;
  try {
    await deleteDoc(doc(db, 'stockGroups', id));
    toast.success('Grup silindi.');
    qs('#groupDetail').style.display = 'none';
    await loadGroups();
  } catch (e) {
    logger.error('Delete group error', e);
    toast.error('Silme hatası: ' + e.message);
  }
}

// ── Load All Stocks (for modal) ──
async function loadAllStocks() {
  if (state.allStocks.length > 0) return;
  try {
    const { rows, capped } = await loadCompanyStocksPaged(db, state.companyId);
    state.allStocks = rows;
    if (capped) {
      toast.warn(MESSAGES.WARN_STOCK_LIMIT_REACHED.replace('{count}', String(rows.length)));
    }
    state.allStocks.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } catch (e) {
    logger.error('Load stocks error', e);
  }
}

// ── Product Modal ──
async function openProductModal(groupId) {
  state.modalGroupId = groupId;
  state.selectedProductIds = new Set();
  const g = state.groups.find(x => x.id === groupId);

  qs('#modalTitle').textContent = `"${g?.name || ''}" grubuna ürün ekle`;
  qs('#modalSearch').value = '';

  await loadAllStocks();
  renderProductList('');

  qs('#productModal').classList.add('active');
  qs('#modalSearch').focus();
}

function renderProductList(searchQuery) {
  const group = state.groups.find(x => x.id === state.modalGroupId);
  const existingIds = new Set(group?.productIds || []);
  const q = searchQuery.toLowerCase();

  let filtered = state.allStocks.filter(s => !existingIds.has(s.id));
  if (q) {
    filtered = filtered.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.sku || '').toLowerCase().includes(q) ||
      (s.brand || '').toLowerCase().includes(q)
    );
  }

  state.lastFilteredProductIds = filtered.slice(0, 200).map(s => s.id);

  const list = qs('#productList');
  if (!filtered.length) {
    state.lastFilteredProductIds = [];
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">Ürün bulunamadı</div>';
    updateSelectedCount();
    return;
  }

  list.innerHTML = filtered.slice(0, 200).map(s => `
    <label class="product-item">
      <input type="checkbox" value="${s.id}" ${state.selectedProductIds.has(s.id) ? 'checked' : ''} />
      <div class="product-item-info">
        <div class="product-item-name">${escapeHtml(s.name)}</div>
        <div class="product-item-sku">${escapeHtml(s.sku)} ${s.brand ? '• ' + escapeHtml(s.brand) : ''}</div>
      </div>
    </label>
  `).join('');

  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.selectedProductIds.add(cb.value);
      else state.selectedProductIds.delete(cb.value);
      updateSelectedCount();
    });
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  qs('#selectedCount').textContent = `${state.selectedProductIds.size} ürün seçildi`;
}

function selectFilteredProducts() {
  if (!state.lastFilteredProductIds.length) {
    toast.info('Seçilecek ürün bulunamadı.');
    return;
  }
  state.lastFilteredProductIds.forEach((id) => state.selectedProductIds.add(id));
  renderProductList(qs('#modalSearch')?.value?.trim() || '');
  toast.success(`${state.lastFilteredProductIds.length} ürün seçildi.`);
}

function clearSelectedProducts() {
  if (!state.selectedProductIds.size) {
    toast.info('Temizlenecek seçim yok.');
    return;
  }
  state.selectedProductIds.clear();
  renderProductList(qs('#modalSearch')?.value?.trim() || '');
  toast.success('Seçim temizlendi.');
}

async function addSelectedProducts() {
  if (!can(STOCK_PERMS.groups?.edit)) { toast.error('Ürün ekleme yetkiniz yok.'); return; }
  if (!state.selectedProductIds.size) { toast.error('Ürün seçiniz.'); return; }
  try {
    const groupRef = doc(db, 'stockGroups', state.modalGroupId);
    const ids = Array.from(state.selectedProductIds);

    // Use arrayUnion for duplicate-safe add
    await updateDoc(groupRef, {
      productIds: arrayUnion(...ids),
      updatedAt: serverTimestamp()
    });

    // Update stocks' groupIds
    for (const stockId of ids) {
      try {
        await updateDoc(doc(db, 'stocks', stockId), {
          groupIds: arrayUnion(state.modalGroupId)
        });
      } catch (e) { /* ignore individual errors */ }
    }

    toast.success(`${ids.length} ürün gruba eklendi.`);
    closeModal();
    await loadGroups();
  } catch (e) {
    logger.error('Add products error', e);
    toast.error('Ürün ekleme hatası: ' + e.message);
  }
}

function closeModal() {
  qs('#productModal').classList.remove('active');
  state.modalGroupId = null;
  state.selectedProductIds = new Set();
  state.lastFilteredProductIds = [];
}

// ── Group Products Detail ──
async function showGroupProducts(groupId) {
  const g = state.groups.find(x => x.id === groupId);
  if (!g) return;

  qs('#detailTitle').textContent = `📋 ${g.name} — Gruptaki Ürünler (${(g.productIds || []).length})`;
  qs('#groupDetail').style.display = 'block';

  const tbody = qs('#groupProductsBody');
  const pIds = g.productIds || [];

  if (!pIds.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#6b7280">Bu grupta ürün yok</td></tr>';
    return;
  }

  await loadAllStocks();

  const rows = pIds.map(pid => {
    const s = state.allStocks.find(x => x.id === pid);
    if (!s) return `<tr><td colspan="4" style="color:#9ca3af">${pid} (bulunamadı)</td><td style="text-align:center"><button class="btn-remove-product" data-group="${groupId}" data-stock="${pid}">Kaldır</button></td></tr>`;
    return `<tr>
      <td style="font-family:monospace;font-size:12px">${escapeHtml(s.sku)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.brand || '—')}</td>
      <td>${escapeHtml(s.unit || 'ADT')}</td>
      <td style="text-align:center"><button class="btn-remove-product" data-group="${groupId}" data-stock="${pid}">Kaldır</button></td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rows;

  tbody.querySelectorAll('.btn-remove-product').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gId = btn.dataset.group;
      const sId = btn.dataset.stock;
      if (!confirm('Bu ürünü gruptan kaldırmak istediğinize emin misiniz?')) return;
      try {
        await updateDoc(doc(db, 'stockGroups', gId), {
          productIds: arrayRemove(sId), updatedAt: serverTimestamp()
        });
        try {
          await updateDoc(doc(db, 'stocks', sId), { groupIds: arrayRemove(gId) });
        } catch (e) { /* ignore */ }
        toast.success('Ürün gruptan kaldırıldı.');
        await loadGroups();
        showGroupProducts(gId);
      } catch (e) {
        toast.error('Kaldırma hatası: ' + e.message);
      }
    });
  });

  // Scroll to detail
  qs('#groupDetail').scrollIntoView({ behavior: 'smooth' });
}

// ── Init ──
(async () => {
  try {
    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx?.companyId) { toast.error('Şirket bilgisi doğrulanamadı.'); return; }
    state.companyId = ctx.companyId;

    await initPermissions({ redirectOnPending: true });
    if (!can(STOCK_PERMS.groups?.view)) {
      toast.error('Özel kod yönetimini görüntüleme yetkiniz yok.');
      window.location.href = '/inventory-index.html';
      return;
    }

    await loadGroups();

    // Events
    qs('#btnSaveGroup').addEventListener('click', saveGroup);
    qs('#btnCancelEdit').addEventListener('click', cancelEdit);
    qs('#btnCloseModal').addEventListener('click', closeModal);
    qs('#btnAddSelected').addEventListener('click', addSelectedProducts);
    qs('#btnSelectFiltered').addEventListener('click', selectFilteredProducts);
    qs('#btnClearSelected').addEventListener('click', clearSelectedProducts);
    qs('#btnCloseDetail').addEventListener('click', () => qs('#groupDetail').style.display = 'none');
    qs('#modalSearch').addEventListener('input', e => renderProductList(e.target.value.trim()));
    qs('#productModal').addEventListener('click', e => { if (e.target === qs('#productModal')) closeModal(); });

  } catch (e) {
    logger.error('Stock groups init error', e);
    toast.error('Sayfa yüklenirken hata: ' + e.message);
  }
})();

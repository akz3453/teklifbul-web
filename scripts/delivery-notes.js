/**
 * Delivery Notes Management - Satış Modülü Faz 4
 * İrsaliye CRUD, kısmi teslimat logic, deliveredQuantity güncelleme
 * Teklifbul Rule v1.0 - Modüler, DRY, async/await, toast notifications
 */

import { db, requireAuth } from '/firebase.js';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { toast } from '../src/shared/ui/toast.js';
import { logger } from '../src/shared/log/logger.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, getSalesPerms } from '../assets/js/state/permissions.js';
import { authFetch } from '../assets/js/utils/api-helpers.js';
import { state } from './sales.js';

const qs = (s) => document.querySelector(s);
const qsa = (s) => document.querySelectorAll(s);

const SALES_PERMS = getSalesPerms();

let currentSale = null;

function renderNoSaleState(message, options = {}) {
  const form = qs('#deliveryNoteForm');
  if (!form) return;

  const {
    title = 'Satış seçilmedi',
    primaryHref = '/pages/sales.html',
    primaryText = 'Satış Listesine Git',
    secondaryHref = '/pages/delivery-direct-new.html',
    secondaryText = 'Sıfırdan İrsaliye Oluştur'
  } = options;

  form.innerHTML = `
    <div class="card" style="margin-top: 8px;">
      <h2 style="margin-top:0;">${escapeHtml(title)}</h2>
      <p class="muted" style="margin-bottom:16px;">${escapeHtml(message)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a href="${escapeHtml(primaryHref)}" class="btn btn-primary">${escapeHtml(primaryText)}</a>
        <a href="${escapeHtml(secondaryHref)}" class="btn btn-secondary">${escapeHtml(secondaryText)}</a>
      </div>
    </div>
  `;
}

// Initialize
(async () => {
  try {
    const user = await requireAuth();
    if (!user) {
      window.location.href = '/index.html';
      return;
    }

    const companyContext = await requireCompanyContext({ redirectOnPending: true });
    if (!companyContext || !companyContext.companyId) {
      logger.warn('Delivery notes: company context alınamadı');
      return;
    }

    // Permission kontrolü
    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) {
      logger.warn('Delivery notes: initPermissions sonuç vermedi');
      return;
    }

    if (SALES_PERMS.createDeliveryNote && !can(SALES_PERMS.createDeliveryNote)) {
      toast.error('İrsaliye oluşturma yetkiniz yok.');
      window.location.href = '/pages/sales.html';
      return;
    }

    // URL'den saleId al
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId');

    if (!saleId) {
      toast.info('Satış seçmeden açtınız. Satıştan irsaliye için önce bir satış seçin.');
      renderNoSaleState(
        'Bu sayfa satış bazlı irsaliye oluşturur. Devam etmek için bir satış seçin veya sıfırdan irsaliye oluşturun.',
        {
          title: 'Satış bilgisi bulunamadı',
          primaryHref: '/pages/sales.html',
          primaryText: 'Satışlardan Seç',
          secondaryHref: '/pages/delivery-direct-new.html',
          secondaryText: 'Sıfırdan İrsaliye'
        }
      );
      return;
    }

    // Satışı yükle
    await loadSale(saleId);
    setupEventListeners();
  } catch (error) {
    logger.error('Delivery notes initialization error', error);
    toast.error(`Başlatma hatası: ${error.message}`);
  }
})();

/**
 * Satışı yükle
 */
async function loadSale(saleId) {
  try {
    logger.group('Satış Yükleniyor');

    const saleDoc = await getDoc(doc(db, 'sales', saleId));
    if (!saleDoc.exists()) {
      toast.warn('Satış bulunamadı veya silinmiş olabilir.');
      renderNoSaleState(
        'İrsaliye oluşturmak istediğiniz satış bulunamadı. Farklı bir satış seçebilir veya sıfırdan irsaliye oluşturabilirsiniz.',
        {
          title: 'Satış bulunamadı',
          primaryHref: '/pages/sales.html',
          primaryText: 'Satış Listesine Dön',
          secondaryHref: '/pages/delivery-direct-new.html',
          secondaryText: 'Sıfırdan İrsaliye'
        }
      );
      return;
    }

    currentSale = { id: saleDoc.id, ...saleDoc.data() };

    // Company kontrolü
    if (currentSale.companyId !== state.companyId) {
      toast.error('Yetkisiz erişim');
      window.location.href = '/pages/sales.html';
      return;
    }

    // Status kontrolü (approved olmalı)
    if (currentSale.status !== 'approved') {
      toast.error(`İrsaliye oluşturulamaz. Satış durumu: ${currentSale.status}`);
      window.location.href = `/pages/sale-detail.html?id=${saleId}`;
      return;
    }

    // Form'u doldur
    document.getElementById('saleId').value = saleId;
    document.getElementById('saleNumber').textContent = currentSale.saleNumber || '';
    document.getElementById('customerName').textContent = currentSale.customerName || '';
    document.getElementById('saleStatus').textContent = currentSale.status || '';

    // Kalemleri render et
    renderDeliveryItems(currentSale.items || []);

    logger.info('Satış yüklendi', { saleId, itemsCount: currentSale.items?.length || 0 });
    logger.end();
  } catch (error) {
    logger.error('Satış yüklenirken hata', error);
    toast.error(`Satış yüklenirken hata: ${error.message}`);
  }
}

/**
 * Teslimat kalemlerini render et
 */
function renderDeliveryItems(items) {
  const tbody = document.getElementById('deliveryItemsTableBody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:40px;color:#6b7280">
          Kalem bulunamadı
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items
    .map((item) => {
      const deliveredQty = item.deliveredQuantity || 0;
      const remainingQty = item.remainingQuantity || item.quantity;
      const maxDelivery = remainingQty;

      return `
    <tr data-item-id="${item.id}">
      <td>${escapeHtml(item.sku || '')}</td>
      <td>${escapeHtml(item.name || '')}</td>
      <td>${item.quantity || 0}</td>
      <td>${deliveredQty}</td>
      <td>
        <strong>${remainingQty}</strong>
        <span class="remaining-qty">(kalan)</span>
      </td>
      <td>
        <input type="number" 
          class="delivery-quantity-input" 
          data-item-id="${item.id}"
          min="0" 
          max="${maxDelivery}" 
          step="0.01" 
          value="${maxDelivery}"
          placeholder="0" />
      </td>
      <td>${escapeHtml(item.unit || '')}</td>
    </tr>
  `;
    })
    .join('');

  // Event listener'ları ekle
  document.querySelectorAll('.delivery-quantity-input').forEach((input) => {
    input.addEventListener('change', () => {
      const itemId = input.getAttribute('data-item-id');
      const value = parseFloat(input.value) || 0;
      const max = parseFloat(input.getAttribute('max')) || 0;

      if (value > max) {
        toast.warn(`Maksimum teslim miktarı: ${max}`);
        input.value = max;
      }

      if (value < 0) {
        input.value = 0;
      }
    });
  });
}

/**
 * Event listener'ları kur
 */
function setupEventListeners() {
  document.getElementById('btnCreateDeliveryNote')?.addEventListener('click', async () => {
    await createDeliveryNote();
  });
}

/**
 * İrsaliye oluştur
 */
async function createDeliveryNote() {
  try {
    if (!currentSale) {
      toast.error('Satış bilgisi yüklenemedi');
      return;
    }

    logger.group('İrsaliye Oluşturuluyor');

    // Teslim edilecek kalemleri topla
    const deliveryItems = [];
    document.querySelectorAll('.delivery-quantity-input').forEach((input) => {
      const itemId = input.getAttribute('data-item-id');
      const quantity = parseFloat(input.value) || 0;

      if (quantity > 0) {
        deliveryItems.push({
          saleItemId: itemId,
          quantity: quantity
        });
      }
    });

    if (deliveryItems.length === 0) {
      toast.error('Lütfen en az bir kalem için teslim miktarı girin');
      return;
    }

    // Validasyon: Tüm miktarlar kalan miktarı aşmamalı
    for (const di of deliveryItems) {
      const item = currentSale.items.find((i) => i.id === di.saleItemId);
      if (!item) continue;

      const remainingQty = item.remainingQuantity || item.quantity;
      if (di.quantity > remainingQty) {
        toast.error(`Kalem ${item.sku} için teslim miktarı kalan miktarı aşıyor (${di.quantity} > ${remainingQty})`);
        return;
      }
    }

    const deliveryAddress = document.getElementById('deliveryAddress')?.value.trim() || null;

    // API çağrısı
    const response = await authFetch('/api/delivery-notes', {
      method: 'POST',
      body: JSON.stringify({
        saleId: currentSale.id,
        companyId: state.companyId,
        items: deliveryItems,
        deliveryAddress: deliveryAddress
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'İrsaliye oluşturulamadı');
    }

    toast.success('İrsaliye oluşturuldu');
    logger.info('İrsaliye oluşturuldu', {
      deliveryNoteId: result.deliveryNoteId,
      saleId: currentSale.id
    });
    logger.end();

    // Satış detay sayfasına yönlendir
    setTimeout(() => {
      window.location.href = `/pages/sale-detail.html?id=${currentSale.id}`;
    }, 1000);
  } catch (error) {
    logger.error('İrsaliye oluşturma hatası', error);
    toast.error(`Hata: ${error.message}`);
    logger.end();
  }
}

/**
 * Helper fonksiyonlar
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

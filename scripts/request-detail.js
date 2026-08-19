import { db, auth, requireAuth } from '/firebase.js';
import { createNotification } from '/scripts/inventory-notifications.js';
import { logger } from '/src/shared/log/logger.js';
import { toast } from '/src/shared/ui/toast.js';
import { authFetch } from '../assets/js/utils/api-helpers.js';
import { MESSAGES } from '/src/shared/constants/messages.js';
import { appendTextCell, setTableEmpty } from '/assets/js/utils/safe-table.js';
import { doc, getDoc, getDocs, collection, updateDoc, addDoc, query, where, serverTimestamp, limit } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const qs = s => document.querySelector(s);

const urlParams = new URLSearchParams(window.location.search);
const requestId = urlParams.get('id');

if (!requestId) {
  alert('Geçersiz istek ID!');
  location.href = '/';
}

const state = {
  request: null,
  lines: [],
  locations: [],
  companyId: null,
  user: null,
  userRole: null
};

// Teklifbul Rule v1.0 - Satın alma rolleri
const PURCHASING_ROLES = [
  'buyer:satinalma_uzman_yardimcisi',
  'buyer:satinalma_uzmani',
  'buyer:satinalma_yetkilisi',
  'buyer:satinalma_muduru',
  'buyer:genel_mudur_yardimcisi',
  'buyer:genel_mudur',
  'buyer:ceo',
  'buyer:yonetim_kurulu_uyesi',
  'buyer:yonetim_kurulu_baskani',
  'buyer:isveren'
];

async function patchRequestStatus(status, extra = {}) {
  const res = await authFetch(`/api/internal-requests/${encodeURIComponent(requestId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || MESSAGES.ERROR_OPERATION_FAILED);
  }
  return data;
}

async function loadRequest() {
  try {
    logger.group('Talep detayı yükleniyor');
    const user = await requireAuth();
    state.user = user;
    
    // Get user's companyId and role
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    state.companyId = userData.companyId;
    state.userRole = userData.companyRoleKey || userData.companyRole || '';
    logger.info('Kullanıcı bilgileri yüklendi', { companyId: state.companyId, role: state.userRole });
    
    const requestDoc = await getDoc(doc(db, 'internal_requests', requestId));
    if (!requestDoc.exists()) {
      alert('Talep bulunamadı!');
      location.href = '/';
      return;
    }
    
    state.request = { id: requestDoc.id, ...requestDoc.data() };
    
    // Load lines
    const linesSnap = await getDocs(collection(db, `internal_requests/${requestId}/material_lines`));
    state.lines = [];
    linesSnap.forEach(lineDoc => {
      state.lines.push({ id: lineDoc.id, ...lineDoc.data() });
    });
    
    // Load locations
    const locsSnap = await getDocs(collection(db, 'stock_locations'));
    state.locations = [];
    locsSnap.forEach(loc => {
      state.locations.push({ id: loc.id, ...loc.data() });
    });
    
    renderRequest();
    renderLines();
    renderActions();
    logger.end();
    
  } catch (error) {
    logger.error('Talep yükleme hatası', error);
    toast.error('Yükleme hatası: ' + error.message);
  }
}

function renderRequest() {
  const req = state.request;
  if (!req) return;
  
  const location = state.locations.find(l => l.id === req.locationId);
  
  qs('#reqTitle').textContent = req.title || '-';
  qs('#reqType').textContent = req.type || '-';
  qs('#reqRequester').textContent = req.requesterName || '-';
  qs('#reqLocation').textContent = location ? `${location.name} (${location.type})` : '-';
  const statusEl = qs('#reqStatus');
  statusEl.textContent = '';
  const statusSpan = document.createElement('span');
  const statusKey = String(req.status || 'DRAFT').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  statusSpan.className = `badge b-${statusKey}`;
  statusSpan.textContent = req.status || '-';
  statusEl.appendChild(statusSpan);
  qs('#reqCreated').textContent = req.createdAt ? new Date(req.createdAt.toDate()).toLocaleString('tr-TR') : '-';
  qs('#reqDelivery').textContent = req.deliveryAddress || '-';
  qs('#reqFreight').textContent = req.deliveryIsFreightIncluded ? 'Evet' : 'Hayır';
}

function renderLines() {
  const tbody = qs('#linesTable tbody');
  if (!state.lines.length) {
    setTableEmpty(tbody, 8, 'Satır bulunamadı.');
    return;
  }

  tbody.textContent = '';
  state.lines.forEach((line) => {
    const tr = document.createElement('tr');
    const badge = line.matchStatus === 'FOUND' ? 'b-found' : line.matchStatus === 'MULTI' ? 'b-multi' : 'b-new';
    const badgeText = line.matchStatus === 'FOUND' ? '✅ Bulundu' : line.matchStatus === 'MULTI' ? '⚠️ Çok' : '🆕 Yeni';
    appendTextCell(tr, line.lineNo);
    appendTextCell(tr, line.sku);
    appendTextCell(tr, line.name);
    appendTextCell(tr, line.brandModel);
    appendTextCell(tr, line.qty);
    appendTextCell(tr, line.unit);
    appendTextCell(tr, line.requestedDate || '-');
    const badgeTd = document.createElement('td');
    const badgeSpan = document.createElement('span');
    badgeSpan.className = `badge ${badge}`;
    badgeSpan.textContent = badgeText;
    badgeTd.appendChild(badgeSpan);
    tr.appendChild(badgeTd);
    tbody.appendChild(tr);
  });
}

function renderActions() {
  const user = auth.currentUser;
  const req = state.request;
  
  if (!user || !req) return;
  
  // Teklifbul Rule v1.0 - Rol kontrolü: Satın alma rolleri veya admin
  const hasPurchasingRole = PURCHASING_ROLES.includes(state.userRole);
  const isAdmin = state.userRole === 'admin' || state.userRole?.includes('admin');
  const canApprove = hasPurchasingRole || isAdmin;
  
  if (req.status === 'SENT' && canApprove) {
    qs('#actionsCard').style.display = 'block';
  } else {
    qs('#actionsCard').style.display = 'none';
  }
}

qs('#btnToPurchasing').addEventListener('click', async () => {
  if (!confirm('Bu talep satın alma sürecine gönderilecek. Devam edilsin mi?')) {
    return;
  }
  
  try {
    logger.group('Talep satın alma sürecine gönderiliyor');
    
    // Teklifbul Rule v1.0 - Talep durumunu güncelle ve satın alma sürecine gönder
    await patchRequestStatus('APPROVED', { forwardedToPurchasing: true });
    
    // Satın alma kullanıcılarına bildirim gönder
    try {
      const purchasingUsersQuery = query(
        collection(db, 'users'),
        where('companyId', '==', state.companyId),
        where('companyRoleKey', 'in', PURCHASING_ROLES)
      );
      const purchasingUsersSnap = await getDocs(purchasingUsersQuery);
      
      const notificationPromises = [];
      purchasingUsersSnap.forEach(userDoc => {
        notificationPromises.push(
          createNotification({
            userId: userDoc.id,
            type: 'request_forwarded_to_purchasing',
            title: 'Yeni Satın Alma Talebi',
            message: `${state.request.title} başlıklı talep satın alma sürecine gönderildi.`,
            data: {
              requestId,
              requestTitle: state.request.title,
              forwardedBy: state.user.displayName || state.user.email,
              actionUrl: `/pages/request-detail.html?id=${requestId}`
            },
            actionUrl: `/pages/request-detail.html?id=${requestId}`
          })
        );
      });
      
      await Promise.all(notificationPromises);
      logger.info('Satın alma kullanıcılarına bildirim gönderildi', { count: purchasingUsersSnap.size });
    } catch (notifError) {
      logger.warn('Bildirim gönderme hatası', notifError);
      // Bildirim hatası işlemi durdurmaz
    }
    
    logger.info('Talep satın alma sürecine gönderildi', { requestId });
    logger.end();
    toast.success('Talep satın alma sürecine gönderildi!');
    location.reload();
    
  } catch (error) {
    logger.error('Satın alma sürecine gönderme hatası', error);
    logger.end();
    toast.error('İşlem başarısız: ' + error.message);
  }
});

qs('#btnApprove').addEventListener('click', async () => {
  if (!confirm('Talep onaylanacak ve malzeme transferi yapılacak. Devam edilsin mi?')) {
    return;
  }
  
  try {
    logger.group('ŞMTF Onay İşlemi');
    
    // Talep durumunu güncelle
    await patchRequestStatus('APPROVED');
    
    // Her satır için stok kontrolü ve transfer işlemi
    const transferResults = [];
    const missingItems = [];
    
    for (const line of state.lines) {
      if (!line.sku || !line.qty || line.qty <= 0) {
        continue; // SKU veya miktar yoksa atla
      }
      
      try {
        // Stok kartını bul
        const stockDoc = await getDoc(doc(db, 'companies', state.companyId, 'inventory', line.sku));
        if (!stockDoc.exists()) {
          missingItems.push({
            sku: line.sku,
            name: line.name,
            qty: line.qty,
            unit: line.unit
          });
          continue;
        }
        
        const stockData = stockDoc.data();
        
        // Depo lokasyonunu bul (varsayılan depo veya ilk lokasyon)
        const locationsQuery = query(
          collection(db, 'stock_locations'),
          where('companyId', '==', state.companyId),
          where('type', '==', 'WAREHOUSE')
        );
        const locationsSnap = await getDocs(locationsQuery);
        
        if (locationsSnap.empty) {
          logger.warn('Depo lokasyonu bulunamadı', { sku: line.sku });
          missingItems.push({
            sku: line.sku,
            name: line.name,
            qty: line.qty,
            unit: line.unit,
            reason: 'Depo lokasyonu bulunamadı'
          });
          continue;
        }
        
        const warehouseLocation = locationsSnap.docs[0];
        const warehouseLocationId = warehouseLocation.id;
        const warehouseLocationData = warehouseLocation.data();
        
        // Stok bakiyesini kontrol et
        const balanceDocId = `${state.companyId}_${line.sku}_${warehouseLocationId}`;
        const balanceDoc = await getDoc(doc(db, 'stock_balances', balanceDocId));
        const balanceData = balanceDoc.exists() ? balanceDoc.data() : null;
        const availableQty = balanceData?.quantity || 0;
        
        if (availableQty < line.qty) {
          // Eksik malzeme
          missingItems.push({
            sku: line.sku,
            name: line.name,
            requestedQty: line.qty,
            availableQty: availableQty,
            unit: line.unit,
            reason: 'Yetersiz stok'
          });
          
          // Mevcut stok varsa transfer et
          if (availableQty > 0) {
            await createTransferMovement(line, stockData, warehouseLocationId, warehouseLocationData, availableQty);
            transferResults.push({
              sku: line.sku,
              name: line.name,
              transferredQty: availableQty,
              requestedQty: line.qty,
              status: 'partial'
            });
          }
        } else {
          // Yeterli stok var, transfer et
          await createTransferMovement(line, stockData, warehouseLocationId, warehouseLocationData, line.qty);
          transferResults.push({
            sku: line.sku,
            name: line.name,
            transferredQty: line.qty,
            requestedQty: line.qty,
            status: 'complete'
          });
        }
        
      } catch (error) {
        console.error('Satır işleme hatası', { line, error });
        missingItems.push({
          sku: line.sku,
          name: line.name,
          qty: line.qty,
          unit: line.unit,
          reason: error.message
        });
      }
    }
    
    // Eksik malzeme varsa yeni iç talep oluştur
    if (missingItems.length > 0) {
      await createInternalRequestForMissingItems(missingItems);
    }
    
    // Bildirim gönder
    if (state.request.requesterUserId) {
      await createNotification({
        userId: state.request.requesterUserId,
        type: 'request_approved',
        title: 'ŞMTF Talebi Onaylandı',
        message: `${state.request.title} başlıklı talebiniz onaylandı ve malzeme transferi yapıldı.`,
        data: {
          requestId,
          requestTitle: state.request.title,
          transferResults,
          missingItems,
          actionUrl: `/pages/request-detail.html?id=${requestId}`
        },
        actionUrl: `/pages/request-detail.html?id=${requestId}`
      });
    }
    
    logger.info('Onay işlemi tamamlandı', { transferResults, missingItems });
    logger.end();
    
    toast.success(`Talep onaylandı! Transfer edilen: ${transferResults.length} satır, Eksik malzeme: ${missingItems.length} satır`);
    location.reload();
    
  } catch (error) {
    logger.error('Onay hatası', error);
    logger.end();
    toast.error('İşlem başarısız: ' + error.message);
  }
});

/**
 * Transfer hareketi oluştur (API)
 * Teklifbul Rule v1.0 - Stok transfer kaydı
 */
async function createTransferMovement(line, stockData, fromLocationId, fromLocationData, qty) {
  try {
    const toLocationId = state.request.siteId ? `site_${state.request.siteId}` : null;

    let stockId = line.sku;
    try {
      const stockQuery = query(
        collection(db, 'stocks'),
        where('companyId', '==', state.companyId),
        where('sku', '==', line.sku),
        limit(1)
      );
      const stockSnap = await getDocs(stockQuery);
      if (!stockSnap.empty) {
        stockId = stockSnap.docs[0].id;
      }
    } catch (_) {
      // company inventory modelinde stockId = sku olabilir
    }

    toast.info('Yükleniyor...');
    const response = await authFetch('/api/stock-movements', {
      method: 'POST',
      body: JSON.stringify({
        type: 'TRANSFER',
        stockId,
        sku: line.sku,
        stockName: line.name || stockData.productName || '',
        unit: line.unit || stockData.unit || 'ADT',
        locationId: fromLocationId,
        siteId: state.request.siteId || null,
        toLocationId,
        qty,
        ref: {
          kind: 'INTERNAL_REQUEST',
          id: requestId,
          lineId: line.id,
        },
        toSiteName: state.request.siteName || null,
        createdByName: state.user.displayName || state.user.email || null,
        confirmNegative: false,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || result.message || 'Transfer kaydedilemedi');
    }

    logger.info('Transfer hareketi oluşturuldu', {
      sku: line.sku,
      fromLocationId,
      toLocationId,
      qty,
      movementId: result.movementId,
    });
  } catch (error) {
    logger.error('Transfer hareketi oluşturma hatası', error);
    throw error;
  }
}

/**
 * Eksik malzeme için yeni iç talep oluştur
 * Teklifbul Rule v1.0 - Otomatik iç talep
 */
async function createInternalRequestForMissingItems(missingItems) {
  try {
    if (missingItems.length === 0) return;
    
    const internalRequestData = {
      type: 'IMTF',
      title: `Eksik Malzeme Talebi - ${state.request.title}`,
      companyId: state.companyId,
      createdBy: state.user.uid,
      requesterUserId: state.user.uid,
      requesterName: state.user.displayName || state.user.email,
      parentRequestId: requestId,
      parentRequestTitle: state.request.title,
      description: `ŞMTF talebi (${state.request.title}) için eksik malzemeler.`,
      createdAt: serverTimestamp(),
      status: 'DRAFT'
    };
    
    const internalRequestRef = await addDoc(collection(db, 'internal_requests'), internalRequestData);
    
    // Malzeme satırlarını ekle
    for (const item of missingItems) {
      await addDoc(collection(db, 'internal_requests', internalRequestRef.id, 'material_lines'), {
        lineNo: missingItems.indexOf(item) + 1,
        sku: item.sku || '',
        name: item.name || '',
        qty: item.requestedQty || item.qty || 0,
        unit: item.unit || 'ADT',
        matchStatus: 'NEW',
        reason: item.reason || 'Eksik malzeme',
        createdAt: serverTimestamp()
      });
    }
    
    logger.info('Eksik malzeme için iç talep oluşturuldu', {
      requestId: internalRequestRef.id,
      missingItemsCount: missingItems.length
    });
    
  } catch (error) {
    logger.error('Eksik malzeme iç talep oluşturma hatası', error);
  }
}

qs('#btnReject').addEventListener('click', async () => {
  const reason = prompt('Red sebebi:');
  if (!reason) return;
  
  try {
    await patchRequestStatus('REJECTED', { rejectionReason: reason });
    
    toast.success('Talep reddedildi!');
    location.reload();
    
  } catch (error) {
    logger.error('Red hatası', error);
    toast.error('İşlem başarısız: ' + error.message);
  }
});

// Initialize
(async () => {
  try {
    await requireAuth();
    await loadRequest();
  } catch (error) {
    logger.error('Talep detay sayfası başlatma hatası', error);
    toast.error('Sayfa yüklenirken hata oluştu');
  }
})();


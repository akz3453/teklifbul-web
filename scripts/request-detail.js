import { db, auth, requireAuth } from '/firebase.js';
import { createNotification } from '/scripts/inventory-notifications.js';
import { logger } from '/src/shared/log/logger.js';
import { toast } from '/src/shared/ui/toast.js';
import { doc, getDoc, getDocs, collection, updateDoc, addDoc, setDoc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

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
  qs('#reqStatus').innerHTML = `<span class="badge b-${req.status?.toLowerCase()}">${req.status || '-'}</span>`;
  qs('#reqCreated').textContent = req.createdAt ? new Date(req.createdAt.toDate()).toLocaleString('tr-TR') : '-';
  qs('#reqDelivery').textContent = req.deliveryAddress || '-';
  qs('#reqFreight').textContent = req.deliveryIsFreightIncluded ? 'Evet' : 'Hayır';
}

function renderLines() {
  const tbody = qs('#linesTable tbody');
  tbody.innerHTML = '';
  
  if (!state.lines.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#6b7280">Satır bulunamadı.</td></tr>';
    return;
  }
  
  state.lines.forEach(line => {
    const tr = document.createElement('tr');
    const badge = line.matchStatus === 'FOUND' ? 'b-found' : line.matchStatus === 'MULTI' ? 'b-multi' : 'b-new';
    const badgeText = line.matchStatus === 'FOUND' ? '✅ Bulundu' : line.matchStatus === 'MULTI' ? '⚠️ Çok' : '🆕 Yeni';
    
    tr.innerHTML = `
      <td>${line.lineNo}</td>
      <td>${line.sku}</td>
      <td>${line.name}</td>
      <td>${line.brandModel}</td>
      <td>${line.qty}</td>
      <td>${line.unit}</td>
      <td>${line.requestedDate || '-'}</td>
      <td><span class="badge ${badge}">${badgeText}</span></td>
    `;
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
    await updateDoc(doc(db, 'internal_requests', requestId), {
      status: 'APPROVED',
      approvedAt: serverTimestamp(),
      forwardedToPurchasing: true,
      forwardedAt: serverTimestamp(),
      forwardedBy: state.user.uid,
      forwardedByName: state.user.displayName || state.user.email
    });
    
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
    await updateDoc(doc(db, 'internal_requests', requestId), {
      status: 'APPROVED',
      approvedAt: serverTimestamp(),
      approvedBy: state.user.uid,
      approvedByName: state.user.displayName || state.user.email
    });
    
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
 * Transfer hareketi oluştur
 * Teklifbul Rule v1.0 - Stok transfer kaydı
 */
async function createTransferMovement(line, stockData, fromLocationId, fromLocationData, qty) {
  try {
    // Hedef lokasyon (şantiye)
    const toLocationId = state.request.siteId ? `site_${state.request.siteId}` : null;
    
    // Stok bakiyesinden ortalama maliyet al
    const balanceDocId = `${state.companyId}_${line.sku}_${fromLocationId}`;
    const balanceDoc = await getDoc(doc(db, 'stock_balances', balanceDocId));
    const balanceData = balanceDoc.exists() ? balanceDoc.data() : null;
    const avgCost = balanceData?.avgCost || stockData.avgCost || 0;
    
    // OUT movement (depodan çıkış)
    const outMovementRef = await addDoc(collection(db, 'stock_movements'), {
      stockId: line.sku,
      sku: line.sku,
      locationId: fromLocationId,
      siteId: state.request.siteId,
      toLocationId: toLocationId,
      type: 'TRANSFER',
      qty: qty,
      unit: line.unit || stockData.unit || 'ADT',
      unitCost: avgCost,
      totalCost: avgCost * qty,
      ref: {
        kind: 'INTERNAL_REQUEST',
        id: requestId,
        lineId: line.id
      },
      stockName: line.name || stockData.productName || '',
      toSiteName: state.request.siteName || '',
      createdBy: state.user.uid,
      companyId: state.companyId,
      createdAt: serverTimestamp()
    });
    
    // Stok bakiyelerini güncelle (kaynak ve hedef)
    await updateStockBalancesForTransfer({
      companyId: state.companyId,
      sku: line.sku,
      fromLocationId,
      toLocationId,
      qty,
      avgCost,
      movementId: outMovementRef.id
    });
    
    logger.info('Transfer hareketi oluşturuldu', {
      sku: line.sku,
      fromLocationId,
      toLocationId,
      qty
    });
    
  } catch (error) {
    logger.error('Transfer hareketi oluşturma hatası', error);
    throw error;
  }
}

/**
 * Stok bakiyelerini güncelle (transfer için)
 * Teklifbul Rule v1.0 - Çift güncelleme (kaynak ve hedef)
 */
async function updateStockBalancesForTransfer({ companyId, sku, fromLocationId, toLocationId, qty, avgCost, movementId }) {
  try {
    // Kaynak lokasyon balance'ı (çıkış)
    const fromBalanceId = `${companyId}_${sku}_${fromLocationId}`;
    const fromBalanceRef = doc(db, 'stock_balances', fromBalanceId);
    const fromBalanceDoc = await getDoc(fromBalanceRef);
    const fromBalance = fromBalanceDoc.exists() ? fromBalanceDoc.data() : null;
    
    const newFromQty = Math.max(0, (fromBalance?.quantity || 0) - qty);
    
    if (fromBalance) {
      await updateDoc(fromBalanceRef, {
        quantity: newFromQty,
        lastUpdated: serverTimestamp(),
        lastMovementId: movementId
      });
    }
    
    // Hedef lokasyon balance'ı (giriş)
    if (toLocationId) {
      const toBalanceId = `${companyId}_${sku}_${toLocationId}`;
      const toBalanceRef = doc(db, 'stock_balances', toBalanceId);
      const toBalanceDoc = await getDoc(toBalanceRef);
      const toBalance = toBalanceDoc.exists() ? toBalanceDoc.data() : null;
      
      const oldToQty = toBalance?.quantity || 0;
      const oldToAvg = toBalance?.avgCost || 0;
      const newToQty = oldToQty + qty;
      
      // Ağırlıklı ortalama maliyet hesapla
      const newToAvg = oldToQty > 0 
        ? ((oldToQty * oldToAvg) + (qty * avgCost)) / newToQty
        : avgCost;
      
      if (toBalance) {
        await updateDoc(toBalanceRef, {
          quantity: newToQty,
          avgCost: newToAvg,
          lastUpdated: serverTimestamp(),
          lastMovementId: movementId
        });
      } else {
        await setDoc(toBalanceRef, {
          companyId,
          sku,
          locationId: toLocationId,
          stockId: sku,
          quantity: newToQty,
          avgCost: newToAvg,
          lastUpdated: serverTimestamp(),
          lastMovementId: movementId
        });
      }
    }
    
  } catch (error) {
    logger.error('Stok bakiyesi güncelleme hatası', error);
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
    await updateDoc(doc(db, 'internal_requests', requestId), {
      status: 'REJECTED',
      rejectedAt: serverTimestamp(),
      rejectionReason: reason
    });
    
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


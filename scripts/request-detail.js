import { db, auth, requireAuth } from '/firebase.js';
import { doc, getDoc, getDocs, collection, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

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
  locations: []
};

async function loadRequest() {
  try {
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
    
  } catch (error) {
    console.error('Load error:', error);
    alert('Yükleme hatası: ' + error.message);
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
  
  // Show actions for purchasing role or admin
  // TODO: check user role
  if (req.status === 'SENT') {
    qs('#actionsCard').style.display = 'block';
  }
}

qs('#btnToPurchasing').addEventListener('click', async () => {
  if (!confirm('Bu talep satın alma sürecine gönderilecek. Devam edilsin mi?')) {
    return;
  }
  
  try {
    await updateDoc(doc(db, 'internal_requests', requestId), {
      status: 'APPROVED',
      approvedAt: serverTimestamp()
    });
    
    // TODO: Forward to purchasing
    alert('Talep satın alma sürecine gönderildi!');
    location.reload();
    
  } catch (error) {
    console.error('Approve error:', error);
    alert('İşlem başarısız: ' + error.message);
  }
});

qs('#btnApprove').addEventListener('click', async () => {
  if (!confirm('Talep onaylanacak. Devam edilsin mi?')) {
    return;
  }
  
  try {
    await updateDoc(doc(db, 'internal_requests', requestId), {
      status: 'APPROVED',
      approvedAt: serverTimestamp()
    });
    
    alert('Talep onaylandı!');
    location.reload();
    
  } catch (error) {
    console.error('Approve error:', error);
    alert('İşlem başarısız: ' + error.message);
  }
});

qs('#btnReject').addEventListener('click', async () => {
  const reason = prompt('Red sebebi:');
  if (!reason) return;
  
  try {
    await updateDoc(doc(db, 'internal_requests', requestId), {
      status: 'REJECTED',
      rejectedAt: serverTimestamp(),
      rejectionReason: reason
    });
    
    alert('Talep reddedildi!');
    location.reload();
    
  } catch (error) {
    console.error('Reject error:', error);
    alert('İşlem başarısız: ' + error.message);
  }
});

// Initialize
await requireAuth();
loadRequest();


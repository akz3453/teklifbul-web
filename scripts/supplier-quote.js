// Teklifbul Rule v1.0 - Supplier Quote Form (Public - No Auth Required)
// Token-based quote submission system

const API_BASE = '/api/supplier-quotes';

// State
let requestData = null;
let tokenData = null;
let itemPrices = [];

// Helper functions
const qs = (sel) => document.querySelector(sel);
const formatCurrency = (val) => {
    return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: 2
    }).format(val || 0);
};

// Get token from URL
function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('token');
    const storageKey = 'tb_supplier_quote_token';
    if (fromUrl) {
        try {
            sessionStorage.setItem(storageKey, fromUrl);
        } catch {
            /* ignore */
        }
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('token');
            window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
        } catch {
            /* ignore */
        }
        return fromUrl;
    }
    try {
        return sessionStorage.getItem(storageKey);
    } catch {
        return null;
    }
}

// Show/hide states
function showState(stateId) {
    ['loadingState', 'errorState', 'successState', 'mainContent'].forEach(id => {
        const el = qs('#' + id);
        if (el) el.style.display = id === stateId ? 'block' : 'none';
    });
}

function showError(title, message) {
    qs('#errorTitle').textContent = title;
    qs('#errorMessage').textContent = message;
    showState('errorState');
}

// Load request data
async function loadRequest() {
    const token = getTokenFromUrl();

    if (!token) {
        showError('Geçersiz Link', 'Bu link geçersiz veya eksik. Lütfen e-postadaki linke tıklayın.');
        return;
    }

    try {
        showState('loadingState');

        const response = await fetch(`${API_BASE}/request/${token}`);
        const result = await response.json();

        if (!result.success) {
            if (result.error?.includes('süresi dolmuş') || result.error?.includes('expired')) {
                showError('Link Süresi Dolmuş', 'Bu teklif linkinin süresi dolmuş. Lütfen talep sahibi firmadan yeni bir link isteyin.');
            } else {
                showError('Link Geçersiz', result.error || 'Bu link geçersiz veya bulunamadı.');
            }
            return;
        }

        requestData = result.request;
        tokenData = { expiresAt: result.expiresAt };

        renderRequest();
        showState('mainContent');

    } catch (error) {
        console.error('Load request error:', error);
        showError('Bağlantı Hatası', 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.');
    }
}

// Render request data
function renderRequest() {
    if (!requestData) return;

    // Header
    qs('#requestTitle').textContent = requestData.title || 'Satın Alma Talebi';

    // Info
    qs('#requestNumber').textContent = requestData.requestNumber || '-';
    qs('#companyName').textContent = requestData.companyName || '-';
    qs('#requesterName').textContent = requestData.requesterName || '-';
    qs('#deliveryLocation').textContent = requestData.deliveryAddress || requestData.location || '-';

    // Expiry alert
    if (tokenData?.expiresAt) {
        const expiresAt = new Date(tokenData.expiresAt);
        const now = new Date();
        const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
        qs('#expiryDays').textContent = daysLeft > 0 ? daysLeft : 1;
    }

    // Items table
    const tbody = qs('#itemsBody');
    if (!requestData.items || requestData.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: #64748b;">Talep kalemi bulunamadı.</td></tr>';
        return;
    }

    itemPrices = requestData.items.map(() => 0);

    tbody.innerHTML = requestData.items.map((item, index) => `
    <tr data-index="${index}">
      <td>${item.no || index + 1}</td>
      <td>
        <div style="font-weight: 500;">${escapeHtml(item.name || '-')}</div>
        ${item.sku ? `<div style="font-size: 12px; color: #64748b;">SKU: ${escapeHtml(item.sku)}</div>` : ''}
      </td>
      <td>${escapeHtml(item.brand || '-')}</td>
      <td style="font-weight: 600;">${item.quantity || 0}</td>
      <td>${escapeHtml(item.unit || 'Adet')}</td>
      <td>
        <input 
          type="number" 
          class="price-input" 
          data-index="${index}" 
          data-qty="${item.quantity || 0}"
          placeholder="0.00" 
          min="0" 
          step="0.01"
          oninput="updateItemTotal(${index})"
        />
      </td>
      <td>
        <span id="itemTotal-${index}" style="font-weight: 600;">0,00 ₺</span>
      </td>
    </tr>
  `).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Update item total when price changes
window.updateItemTotal = function (index) {
    const input = qs(`.price-input[data-index="${index}"]`);
    const qty = parseFloat(input.dataset.qty) || 0;
    const price = parseFloat(input.value) || 0;
    const total = qty * price;

    itemPrices[index] = total;

    qs(`#itemTotal-${index}`).textContent = formatCurrency(total);
    updateGrandTotal();
};

// Update grand total
function updateGrandTotal() {
    const subtotal = itemPrices.reduce((sum, val) => sum + val, 0);
    qs('#subtotal').textContent = formatCurrency(subtotal);
    qs('#grandTotal').textContent = formatCurrency(subtotal);
}

// Validate form
function validateForm() {
    const errors = [];

    // Check required fields
    const companyName = qs('#supplierCompany').value.trim();
    const contactName = qs('#supplierContact').value.trim();
    const email = qs('#supplierEmail').value.trim();
    const phone = qs('#supplierPhone').value.trim();

    if (!companyName) errors.push('Firma adı gerekli');
    if (!contactName) errors.push('Yetkili adı gerekli');
    if (!email) errors.push('E-posta gerekli');
    if (email && !email.includes('@')) errors.push('Geçerli bir e-posta adresi girin');
    if (!phone) errors.push('Telefon gerekli');

    // Check if at least one price is entered
    const hasAnyPrice = itemPrices.some(p => p > 0);
    if (!hasAnyPrice) errors.push('En az bir ürün için fiyat girin');

    return errors;
}

// Submit quote
window.submitQuote = async function () {
    const errors = validateForm();

    if (errors.length > 0) {
        alert('Lütfen aşağıdaki hataları düzeltin:\n\n• ' + errors.join('\n• '));
        return;
    }

    const token = getTokenFromUrl();
    if (!token) {
        alert('Geçersiz token. Lütfen sayfayı yenileyin.');
        return;
    }

    const submitBtn = qs('#submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '⏳ Gönderiliyor...';

    try {
        // Build items with prices
        const items = requestData.items.map((item, index) => {
            const input = qs(`.price-input[data-index="${index}"]`);
            const unitPrice = parseFloat(input.value) || 0;
            const quantity = parseFloat(item.quantity) || 0;

            return {
                productName: item.name || '',
                quantity: quantity,
                unit: item.unit || 'Adet',
                unitPrice: unitPrice,
                totalPrice: unitPrice * quantity
            };
        }).filter(item => item.unitPrice > 0); // Only include items with prices

        const grandTotal = itemPrices.reduce((sum, val) => sum + val, 0);

        const payload = {
            supplier: {
                email: qs('#supplierEmail').value.trim(),
                companyName: qs('#supplierCompany').value.trim(),
                contactName: qs('#supplierContact').value.trim(),
                phone: qs('#supplierPhone').value.trim()
            },
            items: items,
            summary: {
                totalPrice: grandTotal,
                currency: 'TRY',
                validDays: parseInt(qs('#validDays').value) || 15,
                deliveryDays: parseInt(qs('#deliveryDays').value) || 7,
                includesShipping: qs('#includesShipping').checked
            },
            notes: qs('#notes').value.trim()
        };

        const response = await fetch(`${API_BASE}/submit/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Teklif gönderilemedi');
        }

        showState('successState');

    } catch (error) {
        console.error('Submit quote error:', error);
        alert('Teklif gönderilemedi: ' + (error.message || 'Bilinmeyen hata'));
        submitBtn.disabled = false;
        submitBtn.innerHTML = '✅ Teklifi Gönder';
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', loadRequest);

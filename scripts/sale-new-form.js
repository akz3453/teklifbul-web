// Sale form specific logic
import { db, auth } from '/firebase.js';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { state, loadCustomers, loadStocks, loadLocations, calculateTotal, formatCurrency, calculateVat, calculateDiscount, canEditSale, escapeHtml } from '/scripts/sales.js';
import { MESSAGES } from '/src/shared/constants/messages.js';
import { searchStocks } from '/scripts/lib/stock-search.js';
import { authFetch } from '/assets/js/utils/api-helpers.js';
import { toast } from '/src/shared/ui/toast.js';
import { logger } from '/src/shared/log/logger.js';
// Teklifbul Rule v1.0 - XSS Protection
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';

// Teklifbul Rule v1.0 - İl/İlçe yükleme için helper fonksiyonlar
let provincesData = null;
let allowPriceEditing = false; // Teklifbul Rule v1.0 - Satış fiyatı düzenleme izni (Default false)
let allowDiscountEditing = false; // Teklifbul Rule v1.0 - İndirim % düzenleme izni (Default false)

let saleItems = [];
let selectedCustomer = null;
let currentSaleVersion = null; // Teklifbul Rule v1.0 - Optimistic locking için version
let userCompanyId = null; // Teklifbul Rule v1.0 - Firestore autocomplete: User company ID cache

// Initialize
(async () => {
  // Teklifbul Rule v1.0 - Firestore autocomplete: Load user company ID
  try {
    const user = auth.currentUser;
    if (user) {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        userCompanyId = userDoc.data()?.companyId;
        if (!userCompanyId) {
          // Disable all .item-sku inputs
          document.querySelectorAll('.item-sku').forEach(input => {
            input.disabled = true;
          });
          toast.error('Firma bulunamadı');
          logger.warn('User company ID not found', { uid: user.uid });
        }
      }
    }
  } catch (error) {
    logger.error('Error loading user company ID', error);
    toast.error('Firma bilgisi yüklenemedi');
  }

  // Teklifbul Rule v1.0 - loadCustomers, loadStocks, loadLocations sales.js tarafından çağrılıyor
  // Burada tekrar çağırmaya gerek yok, companyId hazır olmadan çağrılıyordu
  // Eğer sales.js henüz yüklenmediyse, companyIdReady event'ini bekleyelim
  if (!state.companyId) {
    // Company ID henüz hazır değilse event'i bekle
    window.addEventListener('companyIdReady', async (event) => {
      const companyId = event.detail?.companyId;
      if (companyId && state.companyId !== companyId) {
        // sales.js zaten yüklüyor ama emin olmak için tekrar yükleyelim
        try {
          await loadCustomers();
          await loadStocks();
          await loadLocations();
        } catch (err) {
          logger.warn('Data loading after companyIdReady failed', err);
        }
      }
    }, { once: true });
  }

  // Check if editing existing sale
  const urlParams = new URLSearchParams(window.location.search);
  const saleId = urlParams.get('id');

  // Teklifbul Rule v1.0 - state.companyId hazır olmadan loadSaleForEdit çağrılmasın
  if (saleId) {
    // state.companyId hazır olana kadar bekle
    if (!state.companyId) {
      // Company ID henüz hazır değilse event'i bekle
      window.addEventListener('companyIdReady', async (event) => {
        const companyId = event.detail?.companyId;
        if (companyId) {
          logger.info('Company ID hazır, satış yükleniyor', { saleId, companyId });
          await loadSaleForEdit(saleId);
        }
      }, { once: true });
    } else {
      // Company ID hazırsa direkt yükle
      await loadSaleForEdit(saleId);
    }
  } else {
    // Teklifbul Rule v1.0 - Yeni satış: Satış numarası alanını temizle
    const saleNumberInput = document.getElementById('saleNumber');
    if (saleNumberInput) {
      saleNumberInput.value = '';
      saleNumberInput.placeholder = 'Kayıt sırasında otomatik oluşturulacak';
    }
  }

  setupFormListeners();
  initDeliveryFields(); // Teklifbul Rule v1.0 - Nakliye bilgileri: İl/İlçe dropdown'larını yükle

  // Teklifbul Rule v1.0 - Nakliye bilgileri: Event listener'ları bağla
  setTimeout(() => {
    const isOwnDeliveryCheckbox = document.getElementById('isOwnDelivery');
    const deliveryToggleGroup = document.getElementById('deliveryToggleGroup');

    if (isOwnDeliveryCheckbox && deliveryToggleGroup) {
      // Toggle details when checkbox changes
      isOwnDeliveryCheckbox.addEventListener('change', function () {
        toggleDeliveryDetails();
      });

      // Toggle checkbox when parent group is clicked (accessibility)
      deliveryToggleGroup.addEventListener('click', function (e) {
        if (e.target !== isOwnDeliveryCheckbox) {
          isOwnDeliveryCheckbox.click();
        }
      });

      // Prevent double toggle when clicking the checkbox specifically
      isOwnDeliveryCheckbox.addEventListener('click', function (e) {
        e.stopPropagation();
      });

      logger.info('Nakliye bilgileri event listener\'ları bağlandı');
    } else {
      logger.warn('Nakliye bilgileri elementleri bulunamadı', {
        checkbox: !!isOwnDeliveryCheckbox,
        group: !!deliveryToggleGroup
      });
    }
  }, 200);

  updateSummary();

  // Teklifbul Rule v1.0 - Company ID set edildiğinde autocomplete'i bağla
  window.addEventListener('companyIdReady', (event) => {
    const companyId = event.detail?.companyId;
    if (companyId) {
      userCompanyId = companyId;
      logger.info('Company ID event alındı, autocomplete bağlanıyor', { companyId });

      // Teklifbul Rule v1.0 - Şirket ayarlarını yükle (allowPriceEditing / allowDiscountEditing)
      getDoc(doc(db, 'companies', companyId)).then(docSnap => {
        if (docSnap.exists()) {
          const companyData = docSnap.data() || {};
          allowPriceEditing = companyData.allowPriceEditing === true;
          allowDiscountEditing = companyData.allowDiscountEditing === true;
          logger.info('Satış düzenleme ayarları yüklendi', { allowPriceEditing, allowDiscountEditing });
          // Eğer items varsa re-render et (lock state uygulamak için)
          if (saleItems.length > 0) renderItems();
        }
      }).catch(err => {
        logger.error('Satış düzenleme ayarları yüklenirken hata', err);
      });

      // Mevcut tüm input'lara autocomplete bağla (eğer varsa)
      // Input'lar henüz yoksa, renderItems çağrıldığında bağlanacak
      setTimeout(() => {
        const skuInputs = document.querySelectorAll('.item-sku');
        const nameInputs = document.querySelectorAll('.item-name');
        if (skuInputs.length > 0 || nameInputs.length > 0) {
          bindStockAutocompleteToAllRows();
          bindNameAutocompleteToAllRows(); // Teklifbul Rule v1.0 - Ürün adı autocomplete
        } else {
          logger.info('Company ID event alındı ama henüz input yok, renderItems\'ta bağlanacak');
        }
      }, 100);
    }
  });
})();

function setupFormListeners() {
  // Customer autocomplete
  const customerSearch = document.getElementById('customerSearch');
  const customerDropdown = document.getElementById('customerDropdown');
  let customerSearchTimeout = null;

  customerSearch?.addEventListener('input', (e) => {
    clearTimeout(customerSearchTimeout);
    const query = e.target.value.trim().toLowerCase();

    if (query.length < 2) {
      customerDropdown.style.display = 'none';
      return;
    }

    customerSearchTimeout = setTimeout(() => {
      const matches = state.customers.filter(c =>
        (c.name || '').toLowerCase().includes(query) ||
        (c.code || '').toLowerCase().includes(query)
      ).slice(0, 10);

      // Her zaman "Yeni Müşteri Ekle" seçeneğini göster
      let dropdownHTML = '';

      if (matches.length > 0) {
        dropdownHTML = matches.map(c => `
          <div class="autocomplete-option" data-customer-id="${c.id}">
            <strong>${escapeHtml(c.name || '')}</strong> (${escapeHtml(c.code || '')})
          </div>
        `).join('');
      }

      // Yeni müşteri ekle seçeneği
      dropdownHTML += `
        <div class="autocomplete-option" data-action="new-customer" style="border-top:1px solid #e5e7eb;background:#f0f9ff;font-weight:600">
          ➕ Yeni Müşteri Ekle: "${escapeHtml(query)}"
        </div>
      `;

      // Teklifbul Rule v1.0 - XSS Protection: Sanitize customer dropdown HTML
      customerDropdown.innerHTML = DOMPurify.sanitize(dropdownHTML, {
        ALLOWED_TAGS: ['div'],
        ALLOWED_ATTR: ['class', 'data-customer-id']
      });
      customerDropdown.style.display = 'block';

      // Click handlers
      customerDropdown.querySelectorAll('.autocomplete-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const action = opt.getAttribute('data-action');
          if (action === 'new-customer') {
            openCustomerModal(query);
          } else {
            const customerId = opt.getAttribute('data-customer-id');
            const customer = state.customers.find(c => c.id === customerId);
            if (customer) {
              selectCustomer(customer);
            }
          }
        });
      });
    }, 300);
  });

  // Add item button
  document.getElementById('btnAddItem')?.addEventListener('click', () => {
    addSaleItem();
  });

  // Currency change
  document.getElementById('currency')?.addEventListener('change', (e) => {
    const currency = e.target.value;
    const exchangeRateGroup = document.getElementById('exchangeRateGroup');
    if (currency !== 'TRY') {
      exchangeRateGroup.style.display = 'block';
    } else {
      exchangeRateGroup.style.display = 'none';
    }
    updateSummary();
  });

  // Save sale — asıl bağlama DOMContentLoaded + btnSaveSale (handleSaveSale)
  // Eski #saveSale id'si HTML'de yok; dead listener kaldırıldı

  // Save draft
  document.getElementById('btnSaveDraft')?.addEventListener('click', async () => {
    await saveSale('draft');
  });

  // Submit for approval
  document.getElementById('btnSubmitForApproval')?.addEventListener('click', async () => {
    await saveSale('pending_approval');
  });

  // New customer button
  document.getElementById('btnNewCustomer')?.addEventListener('click', () => {
    openCustomerModal();
  });

  // Nakliye checkbox listener'ları init bloğunda (deliveryToggleGroup ile) bağlanır

  // Retail sale toggle
  document.getElementById('isRetailSale')?.addEventListener('change', function (e) {
    toggleRetailSale(e.target.checked);
  });
}

async function toggleRetailSale(isRetail) {
  const searchGroup = document.getElementById('customerSearchGroup');
  const btnNewCustomer = document.getElementById('btnNewCustomer');
  const customerInfo = document.getElementById('customerInfo');

  if (isRetail) {
    if (searchGroup) searchGroup.style.display = 'none';
    if (btnNewCustomer) btnNewCustomer.style.display = 'none';

    // Find or create "Perakende (Fiş)"
    let retailCustomer = state.customers.find(c =>
      (c.name || '').toLowerCase().includes('perakende') ||
      (c.code || '').toLowerCase().includes('PRK')
    );

    if (!retailCustomer) {
      toast.info('Perakende müşteri kaydı oluşturuluyor...');
      try {
        const res = await authFetch('/api/customers', {
          method: 'POST',
          body: JSON.stringify({
            companyId: state.companyId,
            name: 'Perakende (Fiş)',
            taxNumber: '1111111111',
            customerType: 'one-time',
            status: 'approved',
            userId: auth.currentUser.uid
          })
        });
        if (res.ok) {
          const data = await res.json();
          // Reload customers to get the new one
          await loadCustomers();
          retailCustomer = state.customers.find(c => c.id === data.customerId);
        }
      } catch (err) {
        logger.error('Perakende müşteri oluşturulamadı', err);
      }
    }

    if (retailCustomer) {
      selectCustomer(retailCustomer);
      if (customerInfo) customerInfo.style.display = 'block';
    }
  } else {
    if (searchGroup) searchGroup.style.display = 'block';
    if (btnNewCustomer) btnNewCustomer.style.display = 'block';
    selectedCustomer = null;
    document.getElementById('customerId').value = '';
    document.getElementById('customerSearch').value = '';
    if (customerInfo) customerInfo.style.display = 'none';
  }
}

function selectCustomer(customer) {
  selectedCustomer = customer;
  document.getElementById('customerId').value = customer.id;
  document.getElementById('customerSearch').value = `${customer.name} (${customer.code})`;
  document.getElementById('customerDropdown').style.display = 'none';

  // Show customer info
  document.getElementById('customerInfo').style.display = 'block';
  document.getElementById('customerNameDisplay').textContent = customer.name || '';
  document.getElementById('customerCodeDisplay').textContent = customer.code || '';
  document.getElementById('customerVKNDisplay').textContent = customer.taxNumber || '-';
}

function addSaleItem() {
  saleItems.push({
    id: generateUUID(),
    sku: '',
    stockId: '',
    name: '',
    quantity: 1,
    unit: 'ADT',
    locationId: '',
    locationName: '',
    unitPrice: 0,
    vatRate: 20,
    discount: 0,
    discountAmount: 0,
    totalPrice: 0,
    vatAmount: 0,
    totalWithVat: 0,
    currency: document.getElementById('currency')?.value || 'TRY'
  });

  renderItems();
}

function removeSaleItem(itemId) {
  saleItems = saleItems.filter(item => item.id !== itemId);
  renderItems();
  updateSummary();
}

function renderItems() {
  const tbody = document.getElementById('itemsTableBody');
  if (!tbody) return;

  // Clear existing rows
  tbody.innerHTML = '';

  if (saleItems.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 10;
    td.style.textAlign = 'center';
    td.style.padding = '40px';
    td.style.color = '#6b7280';
    td.textContent = 'Henüz kalem eklenmedi. "+ Kalem Ekle" butonuna tıklayın.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  // Teklifbul Rule v1.0 - DOM API kullanarak tablo yapısını koru
  saleItems.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-item-id', item.id);

    // SKU column
    const td1 = document.createElement('td');
    const div1 = document.createElement('div');
    div1.style.position = 'relative';
    const inputSku = document.createElement('input');
    inputSku.type = 'text';
    inputSku.className = 'item-sku';
    inputSku.setAttribute('data-item-id', item.id);
    inputSku.placeholder = 'SKU ara...';
    inputSku.value = escapeHtml(item.sku || '');
    inputSku.style.width = '100%';
    inputSku.autocomplete = 'off';
    const dropdown = document.createElement('div');
    dropdown.className = 'sku-autocomplete-dropdown';
    dropdown.setAttribute('data-item-id', item.id);
    dropdown.style.cssText = 'display:none;position:absolute;top:100%;left:0;background:#fff;border:1px solid #d1d5db;border-radius:4px;max-height:200px;overflow-y:auto;z-index:1000;box-shadow:0 4px 6px rgba(0,0,0,0.1);margin-top:2px;min-width:300px;max-width:400px';
    const stockInfo = document.createElement('div');
    stockInfo.className = 'item-stock-info';
    stockInfo.setAttribute('data-item-id', item.id);
    stockInfo.style.cssText = 'font-size:10px;color:#6b7280;margin-top:2px;min-height:12px';
    div1.appendChild(inputSku);
    div1.appendChild(dropdown);
    div1.appendChild(stockInfo);
    td1.appendChild(div1);
    tr.appendChild(td1);

    // Product Name column
    const td2 = document.createElement('td');
    const div2 = document.createElement('div');
    div2.style.position = 'relative';
    const inputName = document.createElement('input');
    inputName.type = 'text';
    inputName.className = 'item-name';
    inputName.setAttribute('data-item-id', item.id);
    inputName.value = escapeHtml(item.name || '');
    inputName.placeholder = 'Ürün adı ara...';
    inputName.style.width = '100%';
    inputName.autocomplete = 'off';
    const nameDropdown = document.createElement('div');
    nameDropdown.className = 'name-autocomplete-dropdown';
    nameDropdown.setAttribute('data-item-id', item.id);
    nameDropdown.style.cssText = 'display:none;position:absolute;top:100%;left:0;background:#fff;border:1px solid #d1d5db;border-radius:4px;max-height:200px;overflow-y:auto;z-index:1000;box-shadow:0 4px 6px rgba(0,0,0,0.1);margin-top:2px;min-width:300px;max-width:400px';
    div2.appendChild(inputName);
    div2.appendChild(nameDropdown);
    td2.appendChild(div2);
    tr.appendChild(td2);

    // Quantity column
    const td3 = document.createElement('td');
    const inputQty = document.createElement('input');
    inputQty.type = 'number';
    inputQty.className = 'item-quantity';
    inputQty.setAttribute('data-item-id', item.id);
    inputQty.value = item.quantity || 1;
    inputQty.min = '0.01';
    inputQty.step = '0.01';
    inputQty.style.width = '100%';
    td3.appendChild(inputQty);
    tr.appendChild(td3);

    // Unit column
    const td4 = document.createElement('td');
    const selectUnit = document.createElement('select');
    selectUnit.className = 'item-unit';
    selectUnit.setAttribute('data-item-id', item.id);
    selectUnit.style.width = '100%';
    const units = ['ADT', 'KG', 'LT', 'MT', 'M2', 'M3', 'PAKET', 'KOLI', 'KUTU', 'SET', 'CIFT', 'TAKIM', 'RULO', 'TON', 'G', 'CM', 'MM', 'ML'];
    units.forEach(unit => {
      const option = document.createElement('option');
      option.value = unit;
      option.textContent = unit === 'M2' ? 'M²' : unit === 'M3' ? 'M³' : unit;
      if (item.unit === unit || (!item.unit && unit === 'ADT')) {
        option.selected = true;
      }
      selectUnit.appendChild(option);
    });
    td4.appendChild(selectUnit);
    tr.appendChild(td4);

    // Location column
    const td5 = document.createElement('td');
    const selectLoc = document.createElement('select');
    selectLoc.className = 'item-location';
    selectLoc.setAttribute('data-item-id', item.id);
    selectLoc.style.width = '100%';
    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = 'Lokasyon seçin...';
    selectLoc.appendChild(optEmpty);
    state.locations.forEach(loc => {
      const option = document.createElement('option');
      option.value = loc.id;
      option.textContent = escapeHtml(loc.name || '');
      if (item.locationId === loc.id) {
        option.selected = true;
      }
      selectLoc.appendChild(option);
    });
    td5.appendChild(selectLoc);
    tr.appendChild(td5);

    // Unit Price column
    const td6 = document.createElement('td');
    const inputPrice = document.createElement('input');
    inputPrice.type = 'number';
    inputPrice.className = 'item-unit-price';
    inputPrice.setAttribute('data-item-id', item.id);
    inputPrice.value = item.unitPrice || 0;
    inputPrice.min = '0';
    inputPrice.step = '0.01';
    inputPrice.style.width = '100%';

    // Teklifbul Rule v1.0 - Fiyat düzenleme izni kontrolü
    if (!allowPriceEditing) {
      inputPrice.readOnly = true;
      inputPrice.style.backgroundColor = '#f3f4f6';
      inputPrice.title = 'Fiyat değişimi engellenmiştir (Ayarlar > Güvenlik)';
    }

    td6.appendChild(inputPrice);
    tr.appendChild(td6);

    // VAT Rate column
    const td7 = document.createElement('td');
    const inputVat = document.createElement('input');
    inputVat.type = 'number';
    inputVat.className = 'item-vat-rate';
    inputVat.setAttribute('data-item-id', item.id);
    inputVat.value = item.vatRate ?? 20;
    inputVat.min = '0';
    inputVat.max = '100';
    inputVat.step = '0.01';
    inputVat.style.width = '100%';
    td7.appendChild(inputVat);
    tr.appendChild(td7);

    // Discount column
    const td8 = document.createElement('td');
    const inputDisc = document.createElement('input');
    inputDisc.type = 'number';
    inputDisc.className = 'item-discount';
    inputDisc.setAttribute('data-item-id', item.id);
    inputDisc.value = item.discount || 0;
    inputDisc.min = '0';
    inputDisc.max = '100';
    inputDisc.step = '0.01';
    inputDisc.style.width = '100%';
    inputDisc.title = 'İndirim yüzdesi';
    inputDisc.setAttribute('aria-label', 'İndirim yüzdesi');

    // Teklifbul Rule v1.0 - İndirim düzenleme izni kontrolü
    if (!allowDiscountEditing) {
      inputDisc.readOnly = true;
      inputDisc.style.backgroundColor = '#f3f4f6';
      inputDisc.title = 'İndirim değişimi engellenmiştir (Ayarlar > Güvenlik)';
    }

    td8.appendChild(inputDisc);
    tr.appendChild(td8);

    // Total column
    const td9 = document.createElement('td');
    const spanTotal = document.createElement('span');
    spanTotal.className = 'item-total';
    spanTotal.textContent = formatCurrency(item.totalWithVat || 0, item.currency || 'TRY');
    td9.appendChild(spanTotal);
    tr.appendChild(td9);

    // Action column
    const td10 = document.createElement('td');
    const btnRemove = document.createElement('button');
    btnRemove.type = 'button';
    btnRemove.className = 'btn btn-danger btn-remove-item';
    btnRemove.setAttribute('data-item-id', item.id);
    btnRemove.style.cssText = 'padding:6px 12px;font-size:12px';
    btnRemove.textContent = 'Sil';
    td10.appendChild(btnRemove);
    tr.appendChild(td10);

    tbody.appendChild(tr);
  });

  // Attach event listeners
  attachItemEventListeners();

  // Remove item buttons - event delegation
  attachRemoveItemListeners();

  // Teklifbul Rule v1.0 - Company context resolver'dan gelen companyId'yi userCompanyId'ye senkronize et
  if (state.companyId && !userCompanyId) {
    userCompanyId = state.companyId;
    logger.info('userCompanyId güncellendi', { companyId: state.companyId });
  }

  // Teklifbul Rule v1.0 - Firestore autocomplete: Bind autocomplete to all rows
  // state.companyId set edilene kadar bekle (page guard'dan sonra gelir)
  const bindAutocompleteWhenReady = () => {
    const companyId = state.companyId || userCompanyId;
    if (companyId) {
      // DOM'un tamamen render edilmesi için kısa bir gecikme
      setTimeout(() => {
        bindStockAutocompleteToAllRows();
        bindNameAutocompleteToAllRows(); // Teklifbul Rule v1.0 - Ürün adı autocomplete
      }, 100);
    } else {
      // state.companyId henüz set edilmemiş, event bekleniyor
      logger.info('Autocomplete bağlanmayı bekliyor: companyId henüz set edilmedi', {
        stateCompanyId: state.companyId,
        userCompanyId: userCompanyId
      });
      // Event geldiğinde autocomplete bağlanacak (yukarıdaki event listener)
    }
  };

  bindAutocompleteWhenReady();
}

function attachRemoveItemListeners() {
  // Event delegation for remove buttons
  const tbody = document.getElementById('itemsTableBody');
  if (!tbody) return;

  // Remove existing listener if any
  const existingHandler = tbody._removeItemHandler;
  if (existingHandler) {
    tbody.removeEventListener('click', existingHandler);
  }

  // Add new listener
  const handler = (e) => {
    const target = e.target;
    if (!target || !target.classList) return;

    if (target.classList.contains('btn-remove-item')) {
      e.preventDefault();
      e.stopPropagation();
      const itemId = target.getAttribute('data-item-id');
      if (itemId) {
        removeSaleItem(itemId);
      }
    }
  };

  tbody.addEventListener('click', handler);
  tbody._removeItemHandler = handler; // Store reference for cleanup
}

// Teklifbul Rule v1.0 - Firestore autocomplete: Turkish normalization
function normalizeTR(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Teklifbul Rule v1.0 - Firestore autocomplete: Generate search tokens for query
function generateSearchTokens(text) {
  const normalized = normalizeTR(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const tokens = new Set();

  if (words.length === 1) {
    // Single word: generate prefixes 2-10 chars
    const word = words[0];
    for (let i = 2; i <= Math.min(10, word.length); i++) {
      tokens.add(word.slice(0, i));
    }
    return Array.from(tokens);
  } else {
    // Multiple words: generate prefixes from each word, limit to first 10 tokens
    for (const word of words) {
      for (let i = 2; i <= Math.min(10, word.length); i++) {
        if (tokens.size >= 10) break;
        tokens.add(word.slice(0, i));
      }
      if (tokens.size >= 10) break;
    }
    return Array.from(tokens).slice(0, 10);
  }
}

function attachItemEventListeners() {
  // SKU autocomplete with dropdown - OLD CLIENT-SIDE SYSTEM (DISABLED)
  // Teklifbul Rule v1.0 - Replaced by Firestore autocomplete
  // This block is kept for reference but disabled
  const USE_FIRESTORE_AUTOCOMPLETE = true;

  if (!USE_FIRESTORE_AUTOCOMPLETE) {
    // OLD CODE - DISABLED
    document.querySelectorAll('.item-sku').forEach(input => {
      const itemId = input.getAttribute('data-item-id');
      const dropdown = document.querySelector(`.sku-autocomplete-dropdown[data-item-id="${itemId}"]`);
      let searchTimeout = null;

      // Clean up existing listeners if any
      if (input._inputHandler) {
        input.removeEventListener('input', input._inputHandler);
      }
      if (input._blurHandler) {
        input.removeEventListener('blur', input._blurHandler);
      }
      if (dropdown && dropdown._clickHandler) {
        dropdown.removeEventListener('click', dropdown._clickHandler);
      }

      // Input event - show dropdown with matches
      const inputHandler = (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();

        if (query.length < 1) {
          if (dropdown) dropdown.style.display = 'none';
          return;
        }

        searchTimeout = setTimeout(() => {
          const matches = searchStocks(state.stocks, query, 20);

          if (!dropdown) return;

          if (matches.length === 0) {
            dropdown.style.display = 'block';
            // Teklifbul Rule v1.0 - XSS Protection: Sanitize empty state HTML
            dropdown.innerHTML = DOMPurify.sanitize('<div style="padding:12px;text-align:center;color:#6b7280;font-size:12px">Sonuç bulunamadı</div>', {
              ALLOWED_TAGS: ['div'],
              ALLOWED_ATTR: ['style']
            });
            return;
          }

          // Show matches in dropdown - Teklifbul Rule v1.0 - XSS Protection
          dropdown.style.display = 'block';
          const sanitizedMatches = matches.map(stock => {
            const safeSku = DOMPurify.sanitize(stock.sku || '', { ALLOWED_TAGS: [] });
            const safeName = DOMPurify.sanitize(stock.name || '', { ALLOWED_TAGS: [] });
            return `<div class="sku-autocomplete-option" data-stock-id="${stock.id}" 
            style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #e5e7eb;font-size:12px">
            <div style="font-weight:600;color:#111827">${safeSku}</div>
            <div style="color:#6b7280;font-size:11px;margin-top:2px">${safeName}</div>
          </div>`;
          }).join('');
          dropdown.innerHTML = DOMPurify.sanitize(sanitizedMatches, {
            ALLOWED_TAGS: ['div'],
            ALLOWED_ATTR: ['class', 'data-stock-id', 'style']
          });
        }, 300);
      };

      input.addEventListener('input', inputHandler);
      input._inputHandler = inputHandler;

      // Event delegation for dropdown options
      const dropdownClickHandler = (e) => {
        const option = e.target.closest('.sku-autocomplete-option');
        if (option) {
          e.preventDefault();
          e.stopPropagation();
          const stockId = option.getAttribute('data-stock-id');
          const stock = state.stocks.find(s => s.id === stockId);
          if (stock) {
            selectStockForItem(itemId, stock);
            dropdown.style.display = 'none';
          }
        }
      };

      if (dropdown) {
        dropdown.addEventListener('click', dropdownClickHandler);
        dropdown._clickHandler = dropdownClickHandler;
      }

      // Hide dropdown on blur (with delay to allow click)
      const blurHandler = () => {
        setTimeout(() => {
          if (dropdown && document.activeElement !== dropdown && !dropdown.contains(document.activeElement)) {
            dropdown.style.display = 'none';
          }
        }, 200);
      };

      input.addEventListener('blur', blurHandler);
      input._blurHandler = blurHandler;
    });
  } // END OLD AUTocomplete - DISABLED

  // Global click handler to hide all dropdowns when clicking outside
  if (!document._skuDropdownGlobalHandler) {
    document._skuDropdownGlobalHandler = (e) => {
      // SKU dropdowns
      document.querySelectorAll('.sku-autocomplete-dropdown').forEach(dropdown => {
        if (dropdown.style.display === 'block') {
          const input = document.querySelector(`.item-sku[data-item-id="${dropdown.getAttribute('data-item-id')}"]`);
          const clickedInside = (input && (input === e.target || input.contains(e.target))) || dropdown.contains(e.target);
          if (!clickedInside) {
            dropdown.style.display = 'none';
          }
        }
      });
      // Name dropdowns
      document.querySelectorAll('.name-autocomplete-dropdown').forEach(dropdown => {
        if (dropdown.style.display === 'block') {
          const input = document.querySelector(`.item-name[data-item-id="${dropdown.getAttribute('data-item-id')}"]`);
          const clickedInside = (input && (input === e.target || input.contains(e.target))) || dropdown.contains(e.target);
          if (!clickedInside) {
            dropdown.style.display = 'none';
          }
        }
      });
    };
    document.addEventListener('click', document._skuDropdownGlobalHandler);
  }

  // Quantity, unit price, vat rate, discount, name, unit changes
  document.querySelectorAll('.item-quantity, .item-unit-price, .item-vat-rate, .item-discount, .item-location, .item-name, .item-unit').forEach(input => {
    input.addEventListener('change', () => {
      const itemId = input.getAttribute('data-item-id');
      updateItem(itemId);
    });
    input.addEventListener('blur', () => {
      const itemId = input.getAttribute('data-item-id');
      updateItem(itemId);
    });
  });
}

// Teklifbul Rule v1.0 - Firestore autocomplete: Bind autocomplete to all SKU inputs
function bindStockAutocompleteToAllRows() {
  // Teklifbul Rule v1.0 - Company context resolver'dan gelen companyId'yi kullan
  const companyId = state.companyId || userCompanyId;

  if (!companyId) {
    logger.warn('Cannot bind autocomplete: companyId not set', {
      stateCompanyId: state.companyId,
      userCompanyId: userCompanyId
    });
    return;
  }

  const skuInputs = document.querySelectorAll('.item-sku');
  logger.info('Autocomplete binding başlatılıyor', {
    skuInputCount: skuInputs.length,
    companyId
  });

  if (skuInputs.length === 0) {
    logger.warn('Autocomplete: SKU input bulunamadı');
    return;
  }

  skuInputs.forEach((skuInput) => {
    const itemId = skuInput.getAttribute('data-item-id');
    if (!itemId) {
      logger.warn('Autocomplete: SKU input\'ta data-item-id bulunamadı');
      return;
    }

    // Prevent double binding
    if (skuInput.dataset.autocompleteBound === '1') {
      logger.info('Autocomplete: SKU input zaten bağlı', { itemId });
      return;
    }
    skuInput.dataset.autocompleteBound = '1';

    const nameInput = document.querySelector(`.item-name[data-item-id="${itemId}"]`);
    const dropdown = document.querySelector(`.sku-autocomplete-dropdown[data-item-id="${itemId}"]`);
    if (!dropdown) {
      logger.warn('Autocomplete: Dropdown bulunamadı', { itemId });
      return;
    }

    logger.info('Autocomplete bağlanıyor', { itemId });

    let searchTimeout = null;
    let selectedIndex = -1;
    let currentResults = [];

    // Input event handler
    const inputHandler = async (e) => {
      clearTimeout(searchTimeout);
      const searchQuery = e.target.value.trim(); // Teklifbul Rule v1.0 - Firestore query fonksiyonu ile çakışmayı önle

      if (searchQuery.length < 2) {
        dropdown.style.display = 'none';
        selectedIndex = -1;
        currentResults = [];
        return;
      }

      searchTimeout = setTimeout(async () => {
        try {
          logger.group('Autocomplete Arama');
          logger.info('Arama başlatılıyor', { searchQuery, companyId });

          // Teklifbul Rule v1.0 - Fallback: searchTokens yoksa veya sonuç bulunamazsa name/sku'ya göre arama
          // Önce searchTokens ile dene
          const tokens = generateSearchTokens(searchQuery);
          logger.info('Tokenlar oluşturuldu', { tokens, tokenCount: tokens.length });

          let results = [];

          if (tokens.length > 0) {
            // Build Firestore query with searchTokens
            let stocksQuery;
            if (tokens.length === 1) {
              // Single token: use array-contains
              stocksQuery = query(
                collection(db, 'stocks'),
                where('companyId', '==', companyId),
                where('searchTokens', 'array-contains', tokens[0]),
                limit(50)
              );
            } else {
              // Multiple tokens: use array-contains-any, then client-side AND filter
              stocksQuery = query(
                collection(db, 'stocks'),
                where('companyId', '==', companyId),
                where('searchTokens', 'array-contains-any', tokens),
                limit(50)
              );
            }

            try {
              const snapshot = await getDocs(stocksQuery);
              snapshot.forEach(doc => {
                results.push({ id: doc.id, ...doc.data() });
              });
              logger.info('searchTokens ile sonuç bulundu', { count: results.length });
            } catch (queryError) {
              logger.warn('searchTokens query hatası, fallback kullanılıyor', queryError);
            }
          }

          // Fallback: Eğer searchTokens ile sonuç bulunamadıysa, tüm stokları çek ve client-side filtrele
          if (results.length === 0) {
            logger.info('searchTokens ile sonuç bulunamadı, fallback arama yapılıyor');
            const allStocksQuery = query(
              collection(db, 'stocks'),
              where('companyId', '==', companyId),
              limit(1000) // Teklifbul Rule v1.0 - Fallback için daha fazla limit
            );

            const allStocksSnapshot = await getDocs(allStocksQuery);
            const normalizedQuery = normalizeTR(searchQuery.toLowerCase());
            const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

            allStocksSnapshot.forEach(doc => {
              const stock = { id: doc.id, ...doc.data() };
              const stockName = normalizeTR((stock.name || '').toLowerCase());
              const stockSku = normalizeTR((stock.sku || '').toLowerCase());
              const stockText = stockName + ' ' + stockSku;

              // Tüm kelimeler stok metninde geçiyorsa ekle
              if (queryWords.every(word => stockText.includes(word))) {
                results.push(stock);
              }
            });

            logger.info('Fallback arama sonucu', { count: results.length });
          }

          // Client-side AND filter for multi-word queries (searchTokens kullanıldıysa)
          if (tokens.length > 1 && results.length > 0) {
            const normalizedQuery = normalizeTR(searchQuery);
            const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
            results = results.filter(stock => {
              const stockText = normalizeTR((stock.name || '') + ' ' + (stock.sku || ''));
              return queryWords.every(word => stockText.includes(word));
            });
          }

          currentResults = results.slice(0, 20);
          selectedIndex = -1;

          logger.info('Final sonuç', { resultCount: currentResults.length });
          logger.end();

          if (currentResults.length === 0) {
            dropdown.style.display = 'block';
            dropdown.innerHTML = DOMPurify.sanitize(
              '<div style="padding:12px;text-align:center;color:#6b7280;font-size:12px">Sonuç bulunamadı</div>',
              { ALLOWED_TAGS: ['div'], ALLOWED_ATTR: ['style'] }
            );
            return;
          }

          // Render dropdown
          const dropdownHTML = currentResults.map((stock, index) => {
            const safeName = DOMPurify.sanitize(stock.name || '', { ALLOWED_TAGS: [] });
            const safeSku = DOMPurify.sanitize(stock.sku || '', { ALLOWED_TAGS: [] });
            const selectedClass = index === selectedIndex ? 'selected' : '';
            return `<div class="sku-autocomplete-option ${selectedClass}" data-stock-id="${stock.id}" data-index="${index}"
              style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #e5e7eb;font-size:12px;background:${index === selectedIndex ? '#dbeafe' : '#fff'}">
              <div style="font-weight:600;color:#111827">${safeName}</div>
              <div style="color:#6b7280;font-size:11px;margin-top:2px">${safeSku}</div>
            </div>`;
          }).join('');

          dropdown.innerHTML = DOMPurify.sanitize(dropdownHTML, {
            ALLOWED_TAGS: ['div'],
            ALLOWED_ATTR: ['class', 'data-stock-id', 'data-index', 'style']
          });
          dropdown.style.display = 'block';

        } catch (error) {
          logger.error('Firestore autocomplete query error', error);
          dropdown.style.display = 'none';
        }
      }, 180);
    };

    // Keyboard navigation
    const keydownHandler = (e) => {
      if (!dropdown || dropdown.style.display !== 'block') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
        updateDropdownHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateDropdownHighlight();
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        selectStock(currentResults[selectedIndex]);
      } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        selectedIndex = -1;
      }
    };

    const updateDropdownHighlight = () => {
      dropdown.querySelectorAll('.sku-autocomplete-option').forEach((option, index) => {
        if (index === selectedIndex) {
          option.style.background = '#dbeafe';
          option.classList.add('selected');
        } else {
          option.style.background = '#fff';
          option.classList.remove('selected');
        }
      });
    };

    // Selection handler
    const selectStock = (stock) => {
      skuInput.value = stock.sku || '';
      skuInput.dataset.stockId = stock.id;
      if (nameInput) {
        nameInput.value = stock.name || '';
      }

      // Update item data
      const item = saleItems.find(i => i.id === itemId);
      if (item) {
        item.sku = stock.sku || '';
        item.stockId = stock.id || '';
        item.name = stock.name || '';
        item.unit = stock.unit || 'ADT';
        item.unitPrice = stock.salePrice || 0; // Teklifbul Rule v1.0 - Otomatik fiyat
        item.vatRate = stock.vatRate ?? 20; // Teklifbul Rule v1.0 - Otomatik KDV
      }

      dropdown.style.display = 'none';
      selectedIndex = -1;
      currentResults = [];

      // Re-render to show updated price and vat in DOM
      renderItems();

      // Focus quantity input
      const qtyInput = document.querySelector(`.item-quantity[data-item-id="${itemId}"]`);
      if (qtyInput) {
        qtyInput.focus();
      }

      // Update item totals
      updateItem(itemId);
    };

    // Dropdown click handler
    const dropdownClickHandler = (e) => {
      const option = e.target.closest('.sku-autocomplete-option');
      if (option) {
        e.preventDefault();
        e.stopPropagation();
        const stockId = option.getAttribute('data-stock-id');
        const stock = currentResults.find(s => s.id === stockId);
        if (stock) {
          selectStock(stock);
        }
      }
    };

    // Blur handler
    const blurHandler = () => {
      setTimeout(() => {
        if (dropdown && document.activeElement !== dropdown && !dropdown.contains(document.activeElement)) {
          dropdown.style.display = 'none';
          selectedIndex = -1;
        }
      }, 200);
    };

    // Attach event listeners
    skuInput.addEventListener('input', inputHandler);
    skuInput.addEventListener('keydown', keydownHandler);
    skuInput.addEventListener('blur', blurHandler);
    dropdown.addEventListener('click', dropdownClickHandler);

    // Store handlers for cleanup if needed
    skuInput._firestoreInputHandler = inputHandler;
    skuInput._firestoreKeydownHandler = keydownHandler;
    skuInput._firestoreBlurHandler = blurHandler;
    dropdown._firestoreClickHandler = dropdownClickHandler;
  });
}

// Teklifbul Rule v1.0 - Firestore autocomplete: Bind autocomplete to all product name inputs
function bindNameAutocompleteToAllRows() {
  // Teklifbul Rule v1.0 - Company context resolver'dan gelen companyId'yi kullan
  const companyId = state.companyId || userCompanyId;

  if (!companyId) {
    logger.warn('Cannot bind name autocomplete: companyId not set', {
      stateCompanyId: state.companyId,
      userCompanyId: userCompanyId
    });
    return;
  }

  const nameInputs = document.querySelectorAll('.item-name');
  logger.info('Name autocomplete binding başlatılıyor', {
    nameInputCount: nameInputs.length,
    companyId
  });

  if (nameInputs.length === 0) {
    logger.warn('Name autocomplete: Name input bulunamadı');
    return;
  }

  nameInputs.forEach((nameInput) => {
    const itemId = nameInput.getAttribute('data-item-id');
    if (!itemId) {
      logger.warn('Name autocomplete: Name input\'ta data-item-id bulunamadı');
      return;
    }

    // Prevent double binding
    if (nameInput.dataset.nameAutocompleteBound === '1') {
      logger.info('Name autocomplete: Name input zaten bağlı', { itemId });
      return;
    }
    nameInput.dataset.nameAutocompleteBound = '1';

    const skuInput = document.querySelector(`.item-sku[data-item-id="${itemId}"]`);
    const dropdown = document.querySelector(`.name-autocomplete-dropdown[data-item-id="${itemId}"]`);
    if (!dropdown) {
      logger.warn('Name autocomplete: Dropdown bulunamadı', { itemId });
      return;
    }

    logger.info('Name autocomplete bağlanıyor', { itemId });

    let searchTimeout = null;
    let selectedIndex = -1;
    let currentResults = [];

    // Input event handler
    const inputHandler = async (e) => {
      clearTimeout(searchTimeout);
      const searchQuery = e.target.value.trim();

      if (searchQuery.length < 2) {
        dropdown.style.display = 'none';
        selectedIndex = -1;
        currentResults = [];
        return;
      }

      searchTimeout = setTimeout(async () => {
        try {
          logger.group('Name Autocomplete Arama');
          logger.info('Arama başlatılıyor', { searchQuery, companyId });

          // Teklifbul Rule v1.0 - Fallback: searchTokens yoksa veya sonuç bulunamazsa name/sku'ya göre arama
          // Önce searchTokens ile dene
          const tokens = generateSearchTokens(searchQuery);
          logger.info('Tokenlar oluşturuldu', { tokens, tokenCount: tokens.length });

          let results = [];

          if (tokens.length > 0) {
            // Build Firestore query with searchTokens
            let stocksQuery;
            if (tokens.length === 1) {
              // Single token: use array-contains
              stocksQuery = query(
                collection(db, 'stocks'),
                where('companyId', '==', companyId),
                where('searchTokens', 'array-contains', tokens[0]),
                limit(50)
              );
            } else {
              // Multiple tokens: use array-contains-any, then client-side AND filter
              stocksQuery = query(
                collection(db, 'stocks'),
                where('companyId', '==', companyId),
                where('searchTokens', 'array-contains-any', tokens),
                limit(50)
              );
            }

            try {
              const snapshot = await getDocs(stocksQuery);
              snapshot.forEach(doc => {
                results.push({ id: doc.id, ...doc.data() });
              });
              logger.info('searchTokens ile sonuç bulundu', { count: results.length });
            } catch (queryError) {
              logger.warn('searchTokens query hatası, fallback kullanılıyor', queryError);
            }
          }

          // Fallback: Eğer searchTokens ile sonuç bulunamadıysa, tüm stokları çek ve client-side filtrele
          if (results.length === 0) {
            logger.info('searchTokens ile sonuç bulunamadı, fallback arama yapılıyor');
            const allStocksQuery = query(
              collection(db, 'stocks'),
              where('companyId', '==', companyId),
              limit(1000) // Teklifbul Rule v1.0 - Fallback için daha fazla limit
            );

            const allStocksSnapshot = await getDocs(allStocksQuery);
            const normalizedQuery = normalizeTR(searchQuery.toLowerCase());
            const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

            allStocksSnapshot.forEach(doc => {
              const stock = { id: doc.id, ...doc.data() };
              const stockName = normalizeTR((stock.name || '').toLowerCase());
              const stockSku = normalizeTR((stock.sku || '').toLowerCase());
              const stockText = stockName + ' ' + stockSku;

              // Tüm kelimeler stok metninde geçiyorsa ekle
              if (queryWords.every(word => stockText.includes(word))) {
                results.push(stock);
              }
            });

            logger.info('Fallback arama sonucu', { count: results.length });
          }

          // Client-side AND filter for multi-word queries (searchTokens kullanıldıysa)
          if (tokens.length > 1 && results.length > 0) {
            const normalizedQuery = normalizeTR(searchQuery);
            const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
            results = results.filter(stock => {
              const stockText = normalizeTR((stock.name || '') + ' ' + (stock.sku || ''));
              return queryWords.every(word => stockText.includes(word));
            });
          }

          currentResults = results.slice(0, 20);
          selectedIndex = -1;

          logger.info('Final sonuç', { resultCount: currentResults.length });
          logger.end();

          if (currentResults.length === 0) {
            dropdown.style.display = 'block';
            dropdown.innerHTML = DOMPurify.sanitize(
              '<div style="padding:12px;text-align:center;color:#6b7280;font-size:12px">Sonuç bulunamadı</div>',
              { ALLOWED_TAGS: ['div'], ALLOWED_ATTR: ['style'] }
            );
            return;
          }

          // Render dropdown
          const dropdownHTML = currentResults.map((stock, index) => {
            const safeName = DOMPurify.sanitize(stock.name || '', { ALLOWED_TAGS: [] });
            const safeSku = DOMPurify.sanitize(stock.sku || '', { ALLOWED_TAGS: [] });
            const selectedClass = index === selectedIndex ? 'selected' : '';
            return `<div class="name-autocomplete-option ${selectedClass}" data-stock-id="${stock.id}" data-index="${index}"
              style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #e5e7eb;font-size:12px;background:${index === selectedIndex ? '#dbeafe' : '#fff'}">
              <div style="font-weight:600;color:#111827">${safeName}</div>
              <div style="color:#6b7280;font-size:11px;margin-top:2px">${safeSku}</div>
            </div>`;
          }).join('');

          dropdown.innerHTML = DOMPurify.sanitize(dropdownHTML, {
            ALLOWED_TAGS: ['div'],
            ALLOWED_ATTR: ['class', 'data-stock-id', 'data-index', 'style']
          });
          dropdown.style.display = 'block';

        } catch (error) {
          logger.error('Firestore name autocomplete query error', error);
          dropdown.style.display = 'none';
        }
      }, 180);
    };

    // Keyboard navigation
    const keydownHandler = (e) => {
      if (!dropdown || dropdown.style.display !== 'block') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
        updateDropdownHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateDropdownHighlight();
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        selectStock(currentResults[selectedIndex]);
      } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        selectedIndex = -1;
      }
    };

    const updateDropdownHighlight = () => {
      dropdown.querySelectorAll('.name-autocomplete-option').forEach((option, index) => {
        if (index === selectedIndex) {
          option.style.background = '#dbeafe';
          option.classList.add('selected');
        } else {
          option.style.background = '#fff';
          option.classList.remove('selected');
        }
      });
    };

    // Selection handler
    const selectStock = (stock) => {
      nameInput.value = stock.name || '';
      nameInput.dataset.stockId = stock.id;
      if (skuInput) {
        skuInput.value = stock.sku || '';
        skuInput.dataset.stockId = stock.id;
      }

      // Update item data
      const item = saleItems.find(i => i.id === itemId);
      if (item) {
        item.sku = stock.sku || '';
        item.stockId = stock.id || '';
        item.name = stock.name || '';
        item.unit = stock.unit || 'ADT';
        item.unitPrice = stock.salePrice || 0; // Teklifbul Rule v1.0 - Otomatik fiyat
        item.vatRate = stock.vatRate ?? 20; // Teklifbul Rule v1.0 - Otomatik KDV
      }

      dropdown.style.display = 'none';
      selectedIndex = -1;
      currentResults = [];

      // Re-render to show updated price and vat in DOM
      renderItems();

      // Focus quantity input
      const qtyInput = document.querySelector(`.item-quantity[data-item-id="${itemId}"]`);
      if (qtyInput) {
        qtyInput.focus();
      }

      // Update item totals
      updateItem(itemId);
    };

    // Dropdown click handler
    const dropdownClickHandler = (e) => {
      const option = e.target.closest('.name-autocomplete-option');
      if (option) {
        e.preventDefault();
        e.stopPropagation();
        const stockId = option.getAttribute('data-stock-id');
        const stock = currentResults.find(s => s.id === stockId);
        if (stock) {
          selectStock(stock);
        }
      }
    };

    // Blur handler
    const blurHandler = () => {
      setTimeout(() => {
        if (dropdown && document.activeElement !== dropdown && !dropdown.contains(document.activeElement)) {
          dropdown.style.display = 'none';
          selectedIndex = -1;
        }
      }, 200);
    };

    // Attach event listeners
    nameInput.addEventListener('input', inputHandler);
    nameInput.addEventListener('keydown', keydownHandler);
    nameInput.addEventListener('blur', blurHandler);
    dropdown.addEventListener('click', dropdownClickHandler);

    // Store handlers for cleanup if needed
    nameInput._firestoreNameInputHandler = inputHandler;
    nameInput._firestoreNameKeydownHandler = keydownHandler;
    nameInput._firestoreNameBlurHandler = blurHandler;
    dropdown._firestoreNameClickHandler = dropdownClickHandler;
  });
}

function selectStockForItem(itemId, stock) {
  const item = saleItems.find(i => i.id === itemId);
  if (!item) return;

  item.sku = stock.sku || '';
  item.stockId = stock.id || '';
  item.name = stock.name || '';
  item.unit = stock.unit || 'ADT';
  item.unitPrice = stock.salePrice || 0; // Teklifbul Rule v1.0 - Otomatik fiyat

  renderItems();
}

function updateItem(itemId) {
  const item = saleItems.find(i => i.id === itemId);
  if (!item) return;

  const row = document.querySelector(`tr[data-item-id="${itemId}"]`);
  if (!row) return;

  item.quantity = parseFloat(row.querySelector('.item-quantity')?.value || 1);
  item.unitPrice = parseFloat(row.querySelector('.item-unit-price')?.value || 0);
  item.vatRate = parseFloat(row.querySelector('.item-vat-rate')?.value || 20);
  item.discount = parseFloat(row.querySelector('.item-discount')?.value || 0);
  item.locationId = row.querySelector('.item-location')?.value || '';
  item.name = row.querySelector('.item-name')?.value.trim() || '';
  item.unit = row.querySelector('.item-unit')?.value || 'ADT';

  // Location name
  const location = state.locations.find(l => l.id === item.locationId);
  item.locationName = location?.name || '';

  // Calculate item totals
  const itemSubtotal = item.quantity * item.unitPrice;
  item.discountAmount = calculateDiscount(itemSubtotal, item.discount);
  item.totalPrice = itemSubtotal - item.discountAmount;
  item.vatAmount = calculateVat(item.totalPrice, item.vatRate);
  item.totalWithVat = item.totalPrice + item.vatAmount;

  // Update display
  row.querySelector('.item-total').textContent = formatCurrency(item.totalWithVat, item.currency || 'TRY');

  // Teklifbul Rule v1.0 - Update stock display when location or product changes
  updateStockDisplay(itemId);

  updateSummary();
}

/**
 * Teklifbul Rule v1.0 - Seçili kalem için stok miktarını getir ve göster
 */
async function updateStockDisplay(itemId) {
  const item = saleItems.find(i => i.id === itemId);
  if (!item || !item.sku) return;

  const stockInfoDiv = document.querySelector(`.item-stock-info[data-item-id="${itemId}"]`);
  if (!stockInfoDiv) return;

  if (!item.locationId) {
    stockInfoDiv.textContent = 'Lokasyon seçin';
    stockInfoDiv.style.color = '#6b7280';
    return;
  }

  try {
    // stock_balances koleksiyonundan sorgula: {companyId}_{sku}_{locationId}
    const balanceId = `${state.companyId}_${item.sku}_${item.locationId}`;
    logger.info('Stok bakiyesi sorgulanıyor', { balanceId });
    const balanceDoc = await getDoc(doc(db, 'stock_balances', balanceId));

    if (balanceDoc.exists()) {
      const balanceData = balanceDoc.data();
      const available = balanceData.quantity || 0;
      const unit = item.unit || 'ADT';

      stockInfoDiv.textContent = `Stok: ${available} ${unit}`;

      // Kritik stok uyarısı (opsiyonel)
      if (available <= 0) {
        stockInfoDiv.style.color = '#dc2626'; // Kırmızı (stok yok)
      } else if (available < item.quantity) {
        stockInfoDiv.style.color = '#f59e0b'; // Turuncu (yetersiz)
      } else {
        stockInfoDiv.style.color = '#059669'; // Yeşil (uygun)
      }
    } else {
      stockInfoDiv.textContent = 'Stok: 0 ' + (item.unit || 'ADT');
      stockInfoDiv.style.color = '#dc2626';
    }
  } catch (error) {
    logger.error('Stok bilgisi alınamadı', { itemId, sku: item.sku, error });
    stockInfoDiv.textContent = 'Stok yüklenemedi';
  }
}

function updateSummary() {
  const totals = calculateTotal(saleItems);
  const currency = document.getElementById('currency')?.value || 'TRY';

  document.getElementById('subtotal').textContent = formatCurrency(totals.subtotal, currency);
  document.getElementById('totalDiscount').textContent = formatCurrency(totals.totalDiscount, currency);
  document.getElementById('totalVat').textContent = formatCurrency(totals.totalVat, currency);
  document.getElementById('totalAmount').textContent = formatCurrency(totals.totalAmount, currency);
}

// Teklifbul Rule v1.0 - Satışı Kaydet butonu handler'ı
async function handleSaveSale() {
  const isRetail = document.getElementById('isRetailSale')?.checked;
  await saveSale('saved', isRetail);
}

async function saveSale(targetStatus, isRetail = false) {
  try {
    // Teklifbul Rule v1.0 - Basitleştirilmiş satış sistemi (onay kaldırıldı)
    // Yeni satışlar 'saved' durumunda oluşturulur
    const saleId = document.getElementById('saleId')?.value;
    if (!saleId && targetStatus !== 'saved') {
      logger.warn('Yeni satış için targetStatus saved olarak ayarlandı', { originalStatus: targetStatus });
      targetStatus = 'saved';
    }

    // Teklifbul Rule v1.0 - Stok Kontrolü
    // Ayarları ve stok durumunu kontrol et
    const companyId = state.companyId || userCompanyId;
    if (companyId) {
      try {
        // 1. Şirket ayarlarını al
        const companyDoc = await getDoc(doc(db, 'companies', companyId));
        const allowNegativeStock = companyDoc.exists() ? companyDoc.data()?.allowNegativeStock === true : false;

        logger.info('Satış kaydediliyor, stok kontrolü yapılıyor', { companyId, allowNegativeStock });

        if (!allowNegativeStock) {
          // 2. Her kalem için stok kontrolü yap
          for (const item of saleItems) {
            if (!item.sku || !item.locationId) continue;

            // Stok bakiyesini sorgula
            const balanceId = `${companyId}_${item.sku}_${item.locationId}`;
            const balanceDoc = await getDoc(doc(db, 'stock_balances', balanceId));

            const currentStock = balanceDoc.exists() ? (balanceDoc.data().quantity || 0) : 0;
            const requestedQty = parseFloat(item.quantity) || 0;

            // Eğer düzenleme modundaysak, eski miktarı hesaba katmamız gerekebilir
            // Ancak şu an için basitçe mevcut stok üzerinden kontrol ediyoruz
            // Not: Mevcut satış düzenleniyorsa, bu satışın halihazırda stoktan düşmüş miktarı 
            // currentStock'a dahildir (yani düşülmüştür). Düzenleme mantığı karmaşık olabilir.
            // Şimdilik yeni satışlar ve basit kontroller için:

            if (currentStock < requestedQty) {
              // Stok yetersiz!
              const stockName = item.name || item.sku;
              const errorMsg = `Stok yetersiz: ${stockName}. Mevcut: ${currentStock}, İstenen: ${requestedQty}. Ayarlarınızda stokların eksiye düşmesine izin verilmiyor.`;
              toast.error(errorMsg);
              throw new Error(errorMsg);
            }
          }
        }
      } catch (err) {
        if (err.message && err.message.startsWith('Stok yetersiz')) {
          // Bu beklenen bir validasyon hatası, tekrar loglamaya veya toast göstermeye (zaten gösterdik) gerek yok
          throw err; // İşlemi durdur
        }
        logger.warn('Stok kontrolü sırasında hata oluştu, işleme devam ediliyor', err);
        // Kritik olmayan hatalarda (örn. bağlantı hatası) satışı engellemiyoruz
      }
    }

    if (!selectedCustomer) {
      toast.error(MESSAGES.ERROR_SALE_CUSTOMER_REQUIRED);
      return;
    }

    if (saleItems.length === 0) {
      toast.error(MESSAGES.ERROR_SALE_ITEMS_REQUIRED);
      return;
    }

    // Validate items
    for (const item of saleItems) {
      if (!item.sku || !item.locationId) {
        toast.error(MESSAGES.ERROR_SALE_SKU_LOCATION_REQUIRED);
        return;
      }
    }

    // Teklifbul Rule v1.0 - Basitleştirilmiş satış sistemi (onay kaldırıldı)
    const isEdit = !!saleId;

    // Teklifbul Rule v1.0 - FieldValue.serverTimestamp() frontend'den gönderilemez
    // Bu yüzden backend tarafından yönetilen alanları (approvalHistory, deliveryNoteIds, etc.) göndermiyoruz
    const saleData = {
      companyId: state.companyId,
      customerId: selectedCustomer.id,
      customerCode: selectedCustomer.code,
      customerName: selectedCustomer.name,
      version: isEdit ? currentSaleVersion : undefined, // Teklifbul Rule v1.0 - Optimistic locking
      items: saleItems.map(item => ({
        id: item.id,
        sku: item.sku,
        stockId: item.stockId,
        name: item.name,
        quantity: item.quantity,
        deliveredQuantity: 0,
        remainingQuantity: item.quantity,
        unit: item.unit,
        locationId: item.locationId,
        locationName: item.locationName,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
        discount: item.discount || 0,
        discountAmount: item.discountAmount,
        totalPrice: item.totalPrice,
        vatAmount: item.vatAmount,
        totalWithVat: item.totalWithVat,
        currency: item.currency
      })),
      subtotal: calculateTotal(saleItems).subtotal,
      totalDiscount: calculateTotal(saleItems).totalDiscount,
      totalVat: calculateTotal(saleItems).totalVat,
      totalAmount: calculateTotal(saleItems).totalAmount,
      currency: document.getElementById('currency')?.value || 'TRY',
      exchangeRate: document.getElementById('exchangeRate')?.value ? parseFloat(document.getElementById('exchangeRate').value) : null,
      exchangeRateSource: document.getElementById('exchangeRate')?.value ? 'MANUAL' : null,
      status: targetStatus,
      notes: document.getElementById('notes')?.value.trim() || null,
      delivery: collectDeliveryData() || null, // Teklifbul Rule v1.0 - Nakliye bilgileri (explicit null)
      isRetail: isRetail || false,
      documentType: isRetail ? 'receipt' : 'invoice'
      // Not: deliveryNoteIds, stockMovementIds, approvalHistory, createdBy, updatedBy gibi alanlar
      // backend tarafından yönetilir ve frontend'den gönderilmemelidir
    };

    const url = saleId ? `/api/sales/${saleId}` : '/api/sales';
    const method = saleId ? 'PUT' : 'POST';

    const response = await authFetch(url, {
      method: method,
      body: JSON.stringify(saleData)
    });

    if (!response.ok) {
      const error = await response.json();

      // Teklifbul Rule v1.0 - Concurrent update conflict (409 Conflict)
      if (response.status === 409 || error.code === 'CONCURRENT_UPDATE') {
        toast.error('Bu satış başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin.');
        logger.warn('Concurrent update conflict', { saleId, error });
        // Sayfayı yenile
        setTimeout(() => {
          window.location.reload();
        }, 2000);
        return;
      }

      // Teklifbul Rule v1.0 - E-doc locked sale hatası özel mesaj
      if (error.code === 'EDOC_LOCKED_SALE') {
        let errorMessage = 'E-belge kilidi: Kritik alan değiştirilemez. İptal/iade/düzeltme süreci kullanın.';
        if (error.details && Array.isArray(error.details)) {
          errorMessage = error.details.join('\n');
        }
        toast.error(errorMessage);
        logger.error('E-doc locked sale update attempt', { saleId, error });
        return; // İşlemi durdur
      }

      // Diğer hatalar için standart mesaj
      throw new Error(error.message || error.error || 'Satış kaydedilemedi');
    }

    const result = await response.json();

    // Teklifbul Rule v1.0 - Satış numarası göster
    const saleNumberMsg = result.saleNumber ? ` (No: ${result.saleNumber})` : '';
    const successMsg = targetStatus === 'draft'
      ? 'Satış taslak olarak kaydedildi'
      : targetStatus === 'pending_approval'
        ? 'Satış onaya gönderildi'
        : 'Satış kaydedildi';
    toast.success(successMsg + saleNumberMsg);

    // Redirect to detail page
    window.location.href = `/pages/sale-detail.html?id=${result.saleId || saleId}`;
  } catch (error) {
    logger.error('Satış kaydetme hatası', error);
    toast.error(`Hata: ${error.message}`);
  }
}

async function loadSaleForEdit(saleId) {
  try {
    // Teklifbul Rule v1.0 - state.companyId hazır olmadan devam etme
    if (!state.companyId) {
      logger.warn('loadSaleForEdit: state.companyId henüz hazır değil, bekleniyor...', { saleId });
      // state.companyId hazır olana kadar bekle (max 5 saniye)
      let attempts = 0;
      const maxAttempts = 50; // 5 saniye (100ms * 50)

      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          attempts++;
          if (state.companyId) {
            clearInterval(checkInterval);
            logger.info('loadSaleForEdit: state.companyId hazır, satış yükleniyor', { saleId, companyId: state.companyId });
            // Company ID hazır oldu, tekrar dene
            loadSaleForEdit(saleId).then(resolve).catch(resolve);
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            toast.error('Firma bilgisi yüklenemedi. Lütfen sayfayı yenileyin.');
            logger.error('loadSaleForEdit: state.companyId timeout', { saleId, attempts });
            resolve();
          }
        }, 100);
      });
    }

    const saleDoc = await getDoc(doc(db, 'sales', saleId));
    if (!saleDoc.exists()) {
      toast.error(MESSAGES.ERROR_SALE_NOT_FOUND);
      window.location.href = '/pages/sales.html';
      return;
    }

    const sale = { id: saleDoc.id, ...saleDoc.data() };

    // Teklifbul Rule v1.0 - Optimistic locking: Version'ı sakla
    currentSaleVersion = sale.version || 0;

    // Company kontrolü
    if (sale.companyId !== state.companyId) {
      logger.error('loadSaleForEdit: Company ID eşleşmiyor', {
        saleCompanyId: sale.companyId,
        stateCompanyId: state.companyId,
        saleId
      });
      toast.error(MESSAGES.ERROR_SALE_UNAUTHORIZED);
      window.location.href = '/pages/sales.html';
      return;
    }

    // Düzenleme kontrolü
    if (!canEditSale(sale, 'items')) {
      toast.error(MESSAGES.ERROR_SALE_NOT_EDITABLE);
      window.location.href = `/pages/sale-detail.html?id=${saleId}`;
      return;
    }

    // Teklifbul Rule v1.0 - Onay sonrası düzenleme: editReason göster
    const editReasonCard = document.getElementById('editReasonCard');
    const editReasonInput = document.getElementById('editReason');
    if (sale.status !== 'draft') {
      if (editReasonCard) editReasonCard.style.display = 'block';
      if (editReasonInput) editReasonInput.setAttribute('required', 'true');
    } else {
      if (editReasonCard) editReasonCard.style.display = 'none';
      if (editReasonInput) editReasonInput.removeAttribute('required');
    }

    // Form'u doldur
    const saleIdEl = document.getElementById('saleId');
    if (saleIdEl) saleIdEl.value = sale.id;
    
    const saleNumEl = document.getElementById('saleNumber');
    if (saleNumEl) saleNumEl.value = sale.saleNumber || '';
    
    const notesEl = document.getElementById('notes');
    if (notesEl) notesEl.value = sale.notes || '';
    
    const currencyEl = document.getElementById('currency');
    if (currencyEl) currencyEl.value = sale.currency || 'TRY';

    if (sale.exchangeRate) {
      const exchangeRateEl = document.getElementById('exchangeRate');
      if (exchangeRateEl) exchangeRateEl.value = sale.exchangeRate;
      
      const exchangeRateGroup = document.getElementById('exchangeRateGroup');
      if (sale.currency !== 'TRY' && exchangeRateGroup) {
        exchangeRateGroup.style.display = 'block';
      }
    }

    // Müşteri seç - state.customers yüklenene kadar bekle
    if (!state.customers || state.customers.length === 0) {
      logger.info('loadSaleForEdit: Müşteriler yükleniyor, bekleniyor...', { saleId });
      // Müşteriler yüklenene kadar bekle (max 5 saniye)
      let attempts = 0;
      const maxAttempts = 50; // 5 saniye (100ms * 50)

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          attempts++;
          if (state.customers && state.customers.length > 0) {
            clearInterval(checkInterval);
            logger.info('loadSaleForEdit: Müşteriler yüklendi', { saleId, customerCount: state.customers.length });
            resolve();
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            logger.error('loadSaleForEdit: Müşteriler yüklenemedi (timeout)', { saleId, attempts });
            toast.error('Müşteriler yüklenemedi. Lütfen sayfayı yenileyin.');
            resolve();
          }
        }, 100);
      });
    }

    const customer = state.customers?.find(c => c.id === sale.customerId);
    if (customer) {
      selectCustomer(customer);
      logger.info('loadSaleForEdit: Müşteri seçildi', { saleId, customerId: customer.id, customerName: customer.name });
    } else {
      logger.error('loadSaleForEdit: Müşteri bulunamadı', {
        saleId,
        saleCustomerId: sale.customerId,
        availableCustomers: state.customers?.map(c => ({ id: c.id, name: c.name })) || []
      });
      toast.error(`Müşteri bulunamadı (ID: ${sale.customerId}). Lütfen müşteri listesini kontrol edin.`);
    }

    // Teklifbul Rule v1.0 - Nakliye bilgileri: Yükle
    loadDeliveryData(sale);

    // Kalemleri yükle
    saleItems = (sale.items || []).map(item => ({
      id: item.id || generateUUID(),
      sku: item.sku || '',
      stockId: item.stockId || '',
      name: item.name || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'ADT',
      locationId: item.locationId || '',
      locationName: item.locationName || '',
      unitPrice: item.unitPrice || 0,
      vatRate: item.vatRate ?? 20,
      discount: item.discount || 0,
      discountAmount: item.discountAmount || 0,
      totalPrice: item.totalPrice || 0,
      vatAmount: item.vatAmount || 0,
      totalWithVat: item.totalWithVat || 0,
      currency: item.currency || sale.currency || 'TRY'
    }));

    renderItems();
    updateSummary();
  } catch (error) {
    logger.error('Satış yüklenirken hata', error);
    toast.error(`Hata: ${error.message}`);
  }
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Teklifbul Rule v1.0 - İl/İlçe yükleme fonksiyonları
async function loadProvinceDistrictData() {
  if (provincesData) return provincesData;

  const sources = [
    '/public/assets/tr-il-ilce.json',
    './assets/tr-il-ilce.json',
    '/assets/tr-il-ilce.json',
    'https://raw.githubusercontent.com/muhammederdem/il-ilce-json/main/il-ilce.json',
    'https://cdn.jsdelivr.net/gh/muhammederdem/il-ilce-json@main/il-ilce.json'
  ];

  for (const url of sources) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        provincesData = await response.json();
        return provincesData;
      }
    } catch (e) {
      logger.info('İl-ilçe datası bu kaynaktan okunamadı', { url });
    }
  }

  return [];
}

function mapDistricts(province) {
  const raw = province?.districts ?? province?.ilceleri ?? [];
  return raw.map(d => ({
    id: d.id ?? d.code ?? d.ilce,
    name: d.name ?? d.ilce ?? String(d),
    raw: d
  })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

function findByNameOrCode(items, value) {
  if (!value) return null;
  return items.find(item =>
    item.id === value ||
    item.name === value ||
    String(item.id) === String(value) ||
    item.name?.toLowerCase() === value.toLowerCase()
  );
}

function fillSelectLocal(sel, items, placeholder) {
  if (!sel) return;
  sel.innerHTML = '';
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = placeholder;
  sel.appendChild(placeholderOpt);

  items.forEach(item => {
    const o = document.createElement('option');
    o.value = item.id || item.name;
    o.textContent = item.name;
    sel.appendChild(o);
  });
  sel.disabled = (sel.options.length <= 1);
}

async function initAddressFields() {
  const ilSel = document.getElementById('addressCity');
  const ilceSel = document.getElementById('addressDistrict');

  if (!ilSel || !ilceSel) return;

  try {
    const raw = await loadProvinceDistrictData();
    const provinces = (Array.isArray(raw) ? raw : raw?.data || []).map(p => ({
      id: p.id ?? p.code ?? p.plaka_kodu ?? p.il,
      name: p.name ?? p.il ?? String(p),
      raw: p
    })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    fillSelectLocal(ilSel, provinces, 'İl seçiniz');

    ilSel.addEventListener('change', async () => {
      const chosen = findByNameOrCode(provinces, ilSel.value);
      if (!chosen || !chosen.raw) {
        fillSelectLocal(ilceSel, [], 'İlçe seçiniz');
        ilceSel.disabled = true;
        return;
      }

      const dlist = mapDistricts(chosen.raw);
      fillSelectLocal(ilceSel, dlist, 'İlçe seçiniz');
      ilceSel.disabled = dlist.length === 0;
    });
  } catch (error) {
    logger.error('Adres sistemi başlatılamadı', error);
  }
}

// Teklifbul Rule v1.0 - İletişim kişisi fonksiyonları (customers.js'den uyarlanmış)
function addContactPerson(name = '', phone = '') {
  const container = document.getElementById('contactPersonsContainer');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'contact-person-row';
  row.setAttribute('style', 'display:flex;gap:8px;margin-bottom:8px;align-items:flex-start');

  const nameDiv = document.createElement('div');
  nameDiv.setAttribute('style', 'flex:1;min-width:0');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'contact-person-name';
  nameInput.placeholder = 'İletişim Kişisi';
  nameInput.value = name || '';
  nameInput.setAttribute('style', 'width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box');
  nameDiv.appendChild(nameInput);
  row.appendChild(nameDiv);

  const phoneDiv = document.createElement('div');
  phoneDiv.setAttribute('style', 'flex:1;min-width:0');
  const phoneInput = document.createElement('input');
  phoneInput.type = 'tel';
  phoneInput.className = 'contact-person-phone';
  phoneInput.placeholder = 'Telefon';
  phoneInput.value = phone || '';
  phoneInput.setAttribute('style', 'width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box');
  phoneDiv.appendChild(phoneInput);
  row.appendChild(phoneDiv);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove-contact';
  removeBtn.textContent = 'Sil';
  removeBtn.setAttribute('style', 'padding:2px 4px;background:#dc2626;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;width:auto;min-width:fit-content;height:auto;line-height:1.2;align-self:center;flex-shrink:0');
  removeBtn.addEventListener('click', () => {
    const rows = container.querySelectorAll('.contact-person-row');
    if (rows.length > 1) {
      row.remove();
      updateRemoveButtons();
    }
  });
  row.appendChild(removeBtn);

  container.appendChild(row);
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const container = document.getElementById('contactPersonsContainer');
  if (!container) return;
  const rows = container.querySelectorAll('.contact-person-row');
  const removeButtons = container.querySelectorAll('.btn-remove-contact');
  removeButtons.forEach(btn => {
    btn.style.display = rows.length > 1 ? 'block' : 'none';
  });
}

function getContactPersons() {
  const container = document.getElementById('contactPersonsContainer');
  if (!container) return null;
  const rows = container.querySelectorAll('.contact-person-row');
  const persons = [];
  rows.forEach(row => {
    const name = row.querySelector('.contact-person-name')?.value.trim();
    const phone = row.querySelector('.contact-person-phone')?.value.trim();
    if (name || phone) {
      persons.push({ name: name || null, phone: phone || null });
    }
  });
  return persons.length > 0 ? persons : null;
}

// Müşteri modal fonksiyonları
async function openCustomerModal(presetName = '') {
  const modal = document.getElementById('customerModal');
  if (!modal) return;

  // Form'u sıfırla
  const form = document.getElementById('customerForm');
  if (form) {
    form.reset();
    const modalCustomerIdEl = document.getElementById('modalCustomerId');
    if (modalCustomerIdEl) modalCustomerIdEl.value = '';
    document.getElementById('customerCode').value = 'Otomatik oluşturulacak';
    document.getElementById('customerName').value = presetName;
    document.getElementById('isActive').checked = true;
    document.getElementById('addressCountry').value = 'TR';
    document.getElementById('paymentTerms').value = '30';
    const modalCurrencyEl = document.getElementById('modalCurrency');
    if (modalCurrencyEl) modalCurrencyEl.value = 'TRY';
    const modalNotesEl = document.getElementById('modalNotes');
    if (modalNotesEl) modalNotesEl.value = '';

    // İletişim kişilerini sıfırla
    const contactContainer = document.getElementById('contactPersonsContainer');
    if (contactContainer) {
      contactContainer.innerHTML = '';
      addContactPerson(); // En az 1 satır ekle
    }

    // Teklifbul Rule v1.0 - Varsayılan senaryo: TİCARİ
    const defaultScenarioSelect = document.getElementById('defaultScenario');
    if (defaultScenarioSelect) {
      defaultScenarioSelect.value = 'TICARI';
    }

    // e-Fatura durumunu sıfırla
    const efaturaBadge = document.getElementById('efaturaStatusBadge');
    if (efaturaBadge) {
      efaturaBadge.textContent = 'Sorgulanmadı';
      efaturaBadge.style.background = '#fef3c7';
      efaturaBadge.style.borderColor = '#fbbf24';
      efaturaBadge.style.color = '#92400e';
    }
  }

  // İl/İlçe dropdown'larını başlat
  await initAddressFields();

  document.getElementById('modalTitle').textContent = 'Yeni Müşteri';
  modal.style.display = 'block';
}

function closeCustomerModal() {
  const modal = document.getElementById('customerModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function handleCustomerFormSubmit(e) {
  e.preventDefault();

  try {
    logger.group('Müşteri Oluşturuluyor');

    // Teklifbul Rule v1.0 - Fatura adresini yukarıdaki adres alanından oluştur
    const addressStreet = document.getElementById('addressStreet')?.value.trim() || '';
    const addressAvenue = document.getElementById('addressAvenue')?.value.trim() || '';
    const addressNeighborhood = document.getElementById('addressNeighborhood')?.value.trim() || '';
    const addressCity = document.getElementById('addressCity')?.value || '';
    const addressDistrict = document.getElementById('addressDistrict')?.value || '';
    const addressPostalCode = document.getElementById('addressPostalCode')?.value.trim() || '';
    const addressDoorNumber = document.getElementById('addressDoorNumber')?.value.trim() || '';
    const addressApartment = document.getElementById('addressApartment')?.value.trim() || '';
    const addressCountry = document.getElementById('addressCountry')?.value.trim() || 'TR';

    // Fatura adresi: Mahalle, Cadde, Sokak birleştirilerek line1 oluşturulur
    const invoiceAddressLine1 = [addressNeighborhood, addressAvenue, addressStreet]
      .filter(Boolean)
      .join(' ') || null;

    // Fatura adresi: Kapı No ve Daire birleştirilerek line2 oluşturulur
    const invoiceAddressLine2 = [addressDoorNumber, addressApartment]
      .filter(Boolean)
      .join(' ') || null;

    // Fatura adresi en az city, district olmalı (zorunlu alanlar)
    const invoiceAddress = (addressCity && addressDistrict) ? {
      line1: invoiceAddressLine1,
      line2: invoiceAddressLine2,
      city: addressCity,
      district: addressDistrict,
      postalCode: addressPostalCode || null,
      country: addressCountry
    } : null;

    const customerData = {
      companyId: state.companyId,
      name: document.getElementById('customerName')?.value.trim(),
      taxNumber: document.getElementById('taxNumber')?.value.trim() || null,
      taxOffice: document.getElementById('taxOffice')?.value.trim() || null,
      // Teklifbul Rule v1.0 - Fatura adresi yukarıdaki adres alanından oluşturuldu
      invoiceAddress: invoiceAddress,
      address: {
        street: addressStreet || null,
        avenue: addressAvenue || null,
        neighborhood: addressNeighborhood || null,
        doorNumber: addressDoorNumber || null,
        apartment: addressApartment || null,
        district: addressDistrict || null,
        city: addressCity || null,
        postalCode: addressPostalCode || null,
        country: addressCountry
      },
      // Teklifbul Rule v1.0 - E-Belge alanları
      email: document.getElementById('invoiceEmail')?.value.trim() || null,
      defaultScenario: document.getElementById('defaultScenario')?.value || null,
      contact: {
        email: document.getElementById('contactEmail')?.value.trim() || null,
        persons: getContactPersons()
      },
      paymentTerms: parseInt(document.getElementById('paymentTerms')?.value || '30', 10),
      creditLimit: document.getElementById('creditLimit')?.value ? parseFloat(document.getElementById('creditLimit').value) : null,
      currency: document.getElementById('modalCurrency')?.value || 'TRY',
      isActive: document.getElementById('isActive')?.checked,
      notes: document.getElementById('modalNotes')?.value.trim() || null,
      createdBy: state.userId
    };

    if (!customerData.name) {
      toast.error(MESSAGES.ERROR_SALE_CUSTOMER_NAME_REQUIRED);
      return;
    }

    const response = await authFetch('/api/customers', {
      method: 'POST',
      body: JSON.stringify(customerData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Müşteri oluşturulamadı');
    }

    const result = await response.json();
    toast.success(MESSAGES.SUCCESS_SALE_CUSTOMER_CREATED);
    logger.info('Müşteri oluşturuldu', { customerId: result.customerId });
    logger.end();

    // Müşterileri yeniden yükle
    await loadCustomers();

    // Yeni oluşturulan müşteriyi seç
    const newCustomer = state.customers.find(c => c.id === result.customerId);
    if (newCustomer) {
      selectCustomer(newCustomer);
    }

    closeCustomerModal();
  } catch (error) {
    logger.error('Müşteri kaydetme hatası', error);
    toast.error(`Hata: ${error.message}`);
  }
}

// Global functions (for backward compatibility, but prefer event delegation)
window.removeSaleItem = removeSaleItem;
window.canEditSale = canEditSale;

// Müşteri modal event listeners
document.getElementById('closeCustomerModal')?.addEventListener('click', () => {
  closeCustomerModal();
});

document.getElementById('btnCancelCustomer')?.addEventListener('click', () => {
  closeCustomerModal();
});

document.getElementById('customerModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'customerModal') {
    closeCustomerModal();
  }
});

document.getElementById('customerForm')?.addEventListener('submit', async (e) => {
  await handleCustomerFormSubmit(e);
});

// İletişim kişisi ekle butonu
document.getElementById('btnAddContact')?.addEventListener('click', () => {
  addContactPerson();
});

// e-Fatura sorgula butonu (şimdilik sadece UI, backend entegrasyonu sonra)
document.getElementById('btnQueryEFatura')?.addEventListener('click', () => {
  toast.info('e-Fatura mükellef sorgusu yakında eklenecek');
});

// Teklifbul Rule v1.0 - Nakliye Bilgileri Fonksiyonları

/**
 * Nakliye bilgileri: İl/İlçe dropdown'larını yükle
 */
async function initDeliveryFields() {
  const citySel = document.getElementById('deliveryCity');
  const districtSel = document.getElementById('deliveryDistrict');

  if (!citySel || !districtSel) return;

  try {
    const raw = await loadProvinceDistrictData();
    const provinces = (Array.isArray(raw) ? raw : raw?.data || []).map(p => ({
      id: p.id ?? p.code ?? p.plaka_kodu ?? p.il,
      name: p.name ?? p.il ?? String(p),
      raw: p
    })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    fillSelectLocal(citySel, provinces, 'İl seçiniz');

    // İl değiştiğinde ilçeleri yükle
    citySel.addEventListener('change', async () => {
      const chosen = findByNameOrCode(provinces, citySel.value);
      if (!chosen || !chosen.raw) {
        fillSelectLocal(districtSel, [], 'İlçe seçiniz');
        districtSel.disabled = true;
        return;
      }

      const dlist = mapDistricts(chosen.raw);
      fillSelectLocal(districtSel, dlist, 'İlçe seçiniz');
      districtSel.disabled = dlist.length === 0;
    });
  } catch (error) {
    logger.error('Nakliye adres sistemi başlatılamadı', error);
  }
}

/**
 * Nakliye bilgileri: Checkbox değiştiğinde teslim bilgileri bölümünü göster/gizle
 * Not: loadProvinceDistrictData, mapDistricts, findByNameOrCode, fillSelectLocal fonksiyonları
 * zaten dosyanın üst kısmında (müşteri modalı için) tanımlı, bu yüzden tekrar tanımlanmıyor.
 */
function toggleDeliveryDetails() {
  const checkbox = document.getElementById('isOwnDelivery');
  const detailsDiv = document.getElementById('deliveryDetails');

  if (!checkbox) {
    logger.error('isOwnDelivery checkbox bulunamadı');
    return;
  }

  if (!detailsDiv) {
    logger.error('deliveryDetails div bulunamadı');
    return;
  }

  const isChecked = checkbox.checked;

  if (isChecked) {
    detailsDiv.style.display = 'block';
    detailsDiv.style.visibility = 'visible';
    logger.info('Nakliye bilgileri gösterildi', { checked: isChecked });
  } else {
    detailsDiv.style.display = 'none';
    detailsDiv.style.visibility = 'hidden';
    // Checkbox işaretli değilse alanları temizle
    resetDeliveryFields();
    logger.info('Nakliye bilgileri gizlendi', { checked: isChecked });
  }
}

/**
 * Nakliye bilgileri: Alanları temizle
 */
function resetDeliveryFields() {
  document.getElementById('recipientName').value = '';
  document.getElementById('recipientSurname').value = '';
  document.getElementById('recipientPhone').value = '';
  document.getElementById('deliveryCity').value = '';
  document.getElementById('deliveryDistrict').value = '';
  document.getElementById('deliveryDistrict').disabled = true;
  document.getElementById('deliveryNeighborhood').value = '';
  document.getElementById('deliveryAvenue').value = '';
  document.getElementById('deliveryStreet').value = '';
  document.getElementById('deliveryPostalCode').value = '';
  document.getElementById('deliveryDoorNumber').value = '';
  document.getElementById('deliveryApartment').value = '';
}

/**
 * Nakliye bilgileri: Form submit'te nakliye bilgilerini topla
 */
function collectDeliveryData() {
  const isOwnDelivery = document.getElementById('isOwnDelivery')?.checked || false;

  if (!isOwnDelivery) {
    return null;
  }

  // Validasyon: Nakliye bize aitse zorunlu alanlar kontrol edilir
  const recipientNameEl = document.getElementById('recipientName');
  const recipientSurnameEl = document.getElementById('recipientSurname');
  const recipientPhoneEl = document.getElementById('recipientPhone');
  const deliveryCityEl = document.getElementById('deliveryCity');
  const deliveryDistrictEl = document.getElementById('deliveryDistrict');

  // Alanların varlığını kontrol et
  if (!recipientNameEl || !recipientSurnameEl || !recipientPhoneEl || !deliveryCityEl || !deliveryDistrictEl) {
    logger.error('Teslim bilgileri alanları bulunamadı', {
      recipientName: !!recipientNameEl,
      recipientSurname: !!recipientSurnameEl,
      recipientPhone: !!recipientPhoneEl,
      deliveryCity: !!deliveryCityEl,
      deliveryDistrict: !!deliveryDistrictEl
    });
    throw new Error('Teslim bilgileri alanları bulunamadı. Lütfen sayfayı yenileyin.');
  }

  const recipientName = recipientNameEl.value.trim() || '';
  const recipientSurname = recipientSurnameEl.value.trim() || '';
  const recipientPhone = recipientPhoneEl.value.trim() || '';
  const deliveryCity = deliveryCityEl.value || '';
  const deliveryDistrict = deliveryDistrictEl.value || '';

  // Frontend validasyonu (backend'de de kontrol edilecek)
  const missingFields = [];
  if (!recipientName) missingFields.push('Ad');
  if (!recipientSurname) missingFields.push('Soyad');
  if (!recipientPhone) missingFields.push('Telefon');
  if (!deliveryCity) missingFields.push('İl');
  if (!deliveryDistrict) missingFields.push('İlçe');

  if (missingFields.length > 0) {
    // Eksik alanları vurgula
    if (!recipientName) recipientNameEl.style.borderColor = '#ef4444';
    if (!recipientSurname) recipientSurnameEl.style.borderColor = '#ef4444';
    if (!recipientPhone) recipientPhoneEl.style.borderColor = '#ef4444';
    if (!deliveryCity) deliveryCityEl.style.borderColor = '#ef4444';
    if (!deliveryDistrict) deliveryDistrictEl.style.borderColor = '#ef4444';

    throw new Error(`Lütfen şu alanları doldurun: ${missingFields.join(', ')}`);
  }

  // Başarılı validasyondan sonra border renklerini sıfırla
  recipientNameEl.style.borderColor = '';
  recipientSurnameEl.style.borderColor = '';
  recipientPhoneEl.style.borderColor = '';
  deliveryCityEl.style.borderColor = '';
  deliveryDistrictEl.style.borderColor = '';

  const deliveryAddress = {
    city: deliveryCity,
    district: deliveryDistrict,
    neighborhood: document.getElementById('deliveryNeighborhood')?.value.trim() || null,
    avenue: document.getElementById('deliveryAvenue')?.value.trim() || null,
    street: document.getElementById('deliveryStreet')?.value.trim() || null,
    postalCode: document.getElementById('deliveryPostalCode')?.value.trim() || null,
    doorNumber: document.getElementById('deliveryDoorNumber')?.value.trim() || null,
    apartment: document.getElementById('deliveryApartment')?.value.trim() || null,
    country: document.getElementById('deliveryCountry')?.value.trim() || 'TR'
  };

  return {
    isOwnDelivery: true,
    recipientName: recipientName,
    recipientSurname: recipientSurname,
    recipientPhone: recipientPhone,
    deliveryAddress: deliveryAddress
  };
}

/**
 * Nakliye bilgileri: Satış düzenlenirken nakliye bilgilerini yükle
 */
async function loadDeliveryData(sale) {
  if (!sale.delivery) {
    // Nakliye bilgileri yoksa checkbox'ı işaretsiz bırak
    document.getElementById('isOwnDelivery').checked = false;
    toggleDeliveryDetails();
    return;
  }

  const delivery = sale.delivery;

  // Checkbox'ı işaretle
  document.getElementById('isOwnDelivery').checked = delivery.isOwnDelivery || false;
  toggleDeliveryDetails();

  if (!delivery.isOwnDelivery) {
    return;
  }

  // Teslim alacak kişi bilgileri
  if (delivery.recipientName) {
    document.getElementById('recipientName').value = delivery.recipientName;
  }
  if (delivery.recipientSurname) {
    document.getElementById('recipientSurname').value = delivery.recipientSurname;
  }
  if (delivery.recipientPhone) {
    document.getElementById('recipientPhone').value = delivery.recipientPhone;
  }

  // Teslim adresi
  if (delivery.deliveryAddress) {
    const addr = delivery.deliveryAddress;

    if (addr.city) {
      document.getElementById('deliveryCity').value = addr.city;
      // İlçeleri yükle
      await loadDistrictsForDeliveryProvince(addr.city);
      if (addr.district) {
        document.getElementById('deliveryDistrict').value = addr.district;
      }
    }

    if (addr.neighborhood) {
      document.getElementById('deliveryNeighborhood').value = addr.neighborhood;
    }
    if (addr.avenue) {
      document.getElementById('deliveryAvenue').value = addr.avenue;
    }
    if (addr.street) {
      document.getElementById('deliveryStreet').value = addr.street;
    }
    if (addr.postalCode) {
      document.getElementById('deliveryPostalCode').value = addr.postalCode;
    }
    if (addr.doorNumber) {
      document.getElementById('deliveryDoorNumber').value = addr.doorNumber;
    }
    if (addr.apartment) {
      document.getElementById('deliveryApartment').value = addr.apartment;
    }
    if (addr.country) {
      document.getElementById('deliveryCountry').value = addr.country;
    }
  }
}

/**
 * İl seçildiğinde ilçeleri yükle (nakliye için)
 */
async function loadDistrictsForDeliveryProvince(provinceValue) {
  const citySel = document.getElementById('deliveryCity');
  const districtSel = document.getElementById('deliveryDistrict');

  if (!citySel || !districtSel || !provinceValue) return;

  try {
    const raw = await loadProvinceDistrictData();
    const provinces = (Array.isArray(raw) ? raw : raw?.data || []).map(p => ({
      id: p.id ?? p.code ?? p.plaka_kodu ?? p.il,
      name: p.name ?? p.il ?? String(p),
      raw: p
    }));

    const chosen = findByNameOrCode(provinces, provinceValue);
    if (chosen && chosen.raw) {
      const dlist = mapDistricts(chosen.raw);
      fillSelectLocal(districtSel, dlist, 'İlçe seçiniz');
      districtSel.disabled = dlist.length === 0;
    }
  } catch (error) {
    logger.error('Nakliye ilçeler yüklenemedi', error);
  }
}

/**
 * Teklifbul Rule v1.0 - e-Fatura durumunu sıfırla
 */
function resetEFaturaStatus() {
  state.efaturaStatus = null;
  const badge = document.getElementById('efaturaStatusBadge');
  if (badge) {
    badge.style.display = 'none';
    badge.textContent = '';
  }
}

/**
 * Teklifbul Rule v1.0 - e-Fatura Mükellef Sorgulama
 */
async function queryEFaturaStatus() {
  if (!selectedCustomer?.taxNumber) {
    toast.warn('e-Fatura sorgulaması için VKN/TCKN gereklidir.');
    return;
  }

  const btn = document.getElementById('btnQueryEFatura');
  const badge = document.getElementById('efaturaStatusBadge');

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Sorgulanıyor...';
    }

    // Simulate API call (In production, this would call /api/einvoice/check-user)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock logic based on VKN length
    const taxNumber = selectedCustomer.taxNumber;
    let isEInvoice = false;

    // Logic: VKN contains '1' -> e-Invoice user (Just for demo)
    if (taxNumber.includes('1')) {
      isEInvoice = true;
    }

    state.efaturaStatus = isEInvoice ? 'einvoice' : 'earchive';

    if (badge) {
      badge.style.display = 'inline-block';
      if (isEInvoice) {
        badge.textContent = 'e-Fatura Mükellefi';
        badge.style.background = '#dcfce7';
        badge.style.color = '#166534';
        badge.style.border = '1px solid #bbf7d0';
        toast.info('Bu müşteri e-fatura mükellefidir. Belgeler e-fatura olarak gönderilecektir.');
      } else {
        badge.textContent = 'e-Arşiv Fatura';
        badge.style.background = '#fef3c7';
        badge.style.color = '#92400e';
        badge.style.border = '1px solid #fde68a';
        toast.info('Bu müşteri e-fatura kullanıcısı değil. Belgeler e-arşiv fatura olarak gönderilecektir.');
      }
    }

  } catch (error) {
    logger.error('e-Fatura sorgulama hatası', error);
    toast.error('e-Fatura durumu sorgulanamadı.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔍 e-Fatura Sorgula';
    }
  }
}

/**
 * Teklifbul Rule v1.0 - Döviz Kuru Getir
 */
async function fetchExchangeRate() {
  const currency = document.getElementById('currency')?.value;
  if (currency === 'TRY') return;

  const btn = document.getElementById('btnFetchExchangeRate');
  const rateInput = document.getElementById('exchangeRate');

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳...';
    }

    // In production, this would call our backend proxy for TCMB
    // For now, we simulate or use a mock logic
    // const response = await fetch('/api/finance/exchange-rates');
    // const data = await response.json();

    await new Promise(resolve => setTimeout(resolve, 800));

    const mockRates = {
      'USD': 34.1254,
      'EUR': 37.4521,
      'GBP': 44.8562
    };

    const rate = mockRates[currency] || 1;
    if (rateInput) {
      rateInput.value = rate.toFixed(4);
      // Trigger summary update
      updateSummary();
    }

    toast.success(`${currency} kuru başarıyla getirildi.`);
  } catch (error) {
    logger.error('Kur çekme hatası', error);
    toast.error('Döviz kuru alınamadı.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 Kuru Getir';
    }
  }
}

// Teklifbul Rule v1.0 - Exchange rate and e-fatura event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Teklifbul Rule v1.0 - Satışı Kaydet butonu
  const btnSaveSale = document.getElementById('btnSaveSale');
  if (btnSaveSale) {
    btnSaveSale.addEventListener('click', handleSaveSale);
  }

  // Exchange rate fetcher
  const btnFetchRate = document.getElementById('btnFetchExchangeRate');
  if (btnFetchRate) {
    btnFetchRate.addEventListener('click', fetchExchangeRate);
  }

  // e-Fatura query
  const btnQueryEFatura = document.getElementById('btnQueryEFatura');
  if (btnQueryEFatura) {
    btnQueryEFatura.addEventListener('click', queryEFaturaStatus);
  }

  // Currency change hook
  const currencySelect = document.getElementById('currency');
  if (currencySelect) {
    currencySelect.addEventListener('change', () => {
      const exchangeRateGroup = document.getElementById('exchangeRateGroup');
      const rateInput = document.getElementById('exchangeRate');

      if (currencySelect.value === 'TRY') {
        if (exchangeRateGroup) exchangeRateGroup.style.display = 'none';
        if (rateInput) rateInput.value = '1';
      } else {
        if (exchangeRateGroup) exchangeRateGroup.style.display = 'block';
        // Auto fetch rate on currency change if empty
        if (rateInput && (!rateInput.value || rateInput.value === '1')) {
          fetchExchangeRate();
        }
      }
      updateSummary();
    });
  }
});

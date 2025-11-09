// RFQ Bid Form UI Component
import { createRFQBid, validateBidData, calculateBidTotal } from '../services/rfq-bids.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';

export class RFQBidForm {
  constructor(containerId, demandData, itemsData) {
    this.container = document.getElementById(containerId);
    this.demandData = demandData;
    this.itemsData = itemsData;
    this.bidData = {
      demandId: demandData.id,
      currency: 'TRY',
      validityDays: 30,
      incoterm: 'DAP',
      warrantyMonths: 12,
      paymentPlan: '30-days',
      deliveryAddress: '',
      notes: '',
      items: []
    };
    this.attachments = [];
    
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
    this.loadDeliveryAddress();
  }

  render() {
    this.container.innerHTML = `
      <div class="rfq-bid-form">
        <!-- Commercial Terms Panel -->
        <div class="commercial-terms-panel">
          <h4>💼 Genel Ticari Şartlar</h4>
          <div class="terms-grid">
            <div class="form-group">
              <label for="bid-currency">Para Birimi *</label>
              <select id="bid-currency" required>
                <option value="TRY">Türk Lirası (₺)</option>
                <option value="USD">Amerikan Doları ($)</option>
                <option value="EUR">Euro (€)</option>
                <option value="GBP">İngiliz Sterlini (£)</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="bid-validity">Geçerlilik Süresi (Gün) *</label>
              <input type="number" id="bid-validity" min="1" max="365" value="30" required>
            </div>
            
            <div class="form-group">
              <label for="bid-incoterm">Teslim Şekli *</label>
              <select id="bid-incoterm" required>
                <option value="EXW">EXW - Fabrikadan Teslim</option>
                <option value="FCA">FCA - Taşıyıcıya Teslim</option>
                <option value="CPT">CPT - Navlun Ödenmiş Teslim</option>
                <option value="CIP">CIP - Navlun ve Sigorta Ödenmiş Teslim</option>
                <option value="DAP" selected>DAP - Teslim Yerinde Teslim</option>
                <option value="DPU">DPU - Teslim Yerinde Boşaltılmış Teslim</option>
                <option value="DDP">DDP - Gümrük Vergileri Dahil Teslim</option>
                <option value="FOB">FOB - Gemi Üzerinde Teslim</option>
                <option value="CIF">CIF - Maliyet, Sigorta ve Navlun</option>
                <option value="DAP-Şantiye">DAP - Şantiye Teslim</option>
                <option value="Depo-Teslim">Depo Teslim</option>
                <option value="Liman-Teslim">Liman Teslim</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="bid-warranty">Garanti Süresi (Ay)</label>
              <input type="number" id="bid-warranty" min="0" max="60" value="12">
            </div>
            
            <div class="form-group">
              <label for="bid-payment">Ödeme Planı</label>
              <select id="bid-payment" onchange="togglePaymentCustom()">
                <option value="advance">Peşin</option>
                <option value="30-days" selected>30 Gün Vadeli</option>
                <option value="60-days">60 Gün Vadeli</option>
                <option value="90-days">90 Gün Vadeli</option>
                <option value="custom">Özel Plan</option>
              </select>
              <input type="text" id="bid-payment-custom" placeholder="Özel ödeme planınızı yazın..." style="display: none; margin-top: 8px;">
            </div>
            
            <div class="form-group full-width">
              <label for="bid-delivery">Teslimat Adresi *</label>
              <textarea id="bid-delivery" rows="2" required placeholder="Teslimat adresini giriniz..."></textarea>
            </div>
            
            <div class="form-group full-width">
              <label for="bid-notes">Genel Notlar</label>
              <textarea id="bid-notes" rows="3" placeholder="Teklifinizle ilgili özel şartlar, açıklamalar..."></textarea>
            </div>
          </div>
        </div>
        
        <!-- Item Matrix -->
        <div class="item-matrix-section">
          <h4>📊 Ürün Kalemleri Teklifi</h4>
          <div class="item-matrix-container">
            ${this.renderItemMatrix()}
          </div>
        </div>
        
        <!-- Attachments -->
        <div class="bid-attachments">
          <h4>📎 Ekler</h4>
          <div id="bid-file-list" class="file-list"></div>
          <input type="file" id="bid-file-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png">
          <button id="bid-upload-btn" class="btn btn-primary">📎 Dosya Ekle</button>
        </div>
        
        <!-- Submit Button -->
        <div class="submit-section">
          <button id="submit-bid-btn" class="btn btn-success">📤 Teklifi Gönder</button>
        </div>
      </div>
    `;
  }

  renderItemMatrix() {
    if (!this.itemsData || this.itemsData.length === 0) {
      return '<p class="no-items">Bu talep için ürün bilgisi bulunamadı.</p>';
    }

    return `
      <div class="item-matrix-table">
        <div class="matrix-header">
          <div class="col-item">Talep Edilen Ürün</div>
          <div class="col-qty">Miktar</div>
          <div class="col-unit">Birim</div>
          <div class="col-compliance">Uygunluk</div>
          <div class="col-price">Birim Fiyat (Net)</div>
          <div class="col-total">Toplam (TL)</div>
          <div class="col-brand">Marka/Model</div>
          <div class="col-leadtime">Teslim Süresi</div>
          <div class="col-minqty">Min. Sipariş</div>
          <div class="col-partial">Kısmi İzin</div>
          <div class="col-origin">Menşei</div>
          <div class="col-comments">Açıklama</div>
        </div>
        ${this.itemsData.map((item, index) => this.renderItemRow(item, index)).join('')}
      </div>
    `;
  }

  renderItemRow(item, index) {
    const demandQty = item.quantity || item.qty || 1;
    const demandUnit = item.unit || item.uom || 'adet';
    // All available units from demand-new.html unitList
    const allUnits = [
      'adet', 'paket', 'kutu', 'koli', 'set', 'çift', 'parça', 'takım', 'çarşaf', 'düzine', 'gros',
      'kg', 'g', 'ton',
      'metre', 'm', 'cm', 'mm',
      'metrekare', 'm²', 'metrekup', 'm³',
      'litre', 'lt', 'ml',
      'rulo', 'sac', 'tabaka', 'sheet', 'kangal', 'varil', 'kova', 'bidon', 'kase', 'torba', 'palet', 'rol', 'top', 'yumak', 'diğer'
    ];
    
    return `
      <div class="matrix-row" data-item-index="${index}">
        <div class="col-item">
          <div class="item-info">
            <div class="item-name" style="font-size:13px; font-weight:600; color:#111827;">${item.description || item.name || 'Ürün Açıklaması'}</div>
            <div class="item-sku" style="font-size:11px; color:#64748b;">${item.sku || '-'}</div>
            <div class="item-alt" style="margin-top:6px;">
              <input type="text" class="item-alt-desc" placeholder="Teklif edilen alternatif tanım (opsiyonel)" style="width:100%; font-size:12px;">
            </div>
          </div>
        </div>
        <div class="col-qty">
          <input type="number" class="item-qty" value="${demandQty}" min="0" step="0.01">
        </div>
        <div class="col-unit">
          <select class="item-unit" data-item-index="${index}">
            ${demandUnit && !allUnits.includes(demandUnit.toLowerCase()) ? `<option value="${demandUnit}" selected>${demandUnit.charAt(0).toUpperCase() + demandUnit.slice(1)} (Talep)</option>` : ''}
            ${allUnits.map(u => `<option value="${u}" ${demandUnit && demandUnit.toLowerCase() === u.toLowerCase() ? 'selected' : ''}>${u.charAt(0).toUpperCase() + u.slice(1)}</option>`).join('')}
          </select>
          ${demandUnit ? `<div style="font-size:11px;color:#059669;margin-top:2px;">Talep: ${demandUnit}</div>` : ''}
        </div>
        <div class="col-compliance">
          <select class="item-compliance" required>
            <option value="">Seçiniz</option>
            <option value="match">✅ Uygun</option>
            <option value="alt">🔄 Alternatif</option>
            <option value="no-bid">❌ Teklif Yok</option>
          </select>
        </div>
        <div class="col-price">
          <input type="number" class="item-price" min="0" step="0.01" placeholder="0.00">
        </div>
        <div class="col-total">
          <span class="item-total">0,00</span>
        </div>
        <div class="col-brand">
          <input type="text" class="item-brand" placeholder="Marka/Model">
        </div>
        <div class="col-leadtime">
          <input type="number" class="item-leadtime" min="1" max="365" placeholder="Gün">
        </div>
        <div class="col-minqty">
          <input type="number" class="item-minqty" min="0" step="0.01" placeholder="Min. miktar">
        </div>
        <div class="col-partial">
          <select class="item-partial">
            <option value="yes">Evet</option>
            <option value="no" selected>Hayır</option>
          </select>
        </div>
        <div class="col-origin">
          <input type="text" class="item-origin" placeholder="Menşei">
        </div>
        <div class="col-comments">
          <textarea class="item-comments" rows="3" placeholder="Ürün hakkında detaylı açıklama..."></textarea>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Commercial terms change
    this.container.addEventListener('change', (e) => {
      if (e.target.id.startsWith('bid-')) {
        this.updateCommercialTerms();
      }
    });

    // Payment plan custom toggle
    window.togglePaymentCustom = () => {
      const paymentSelect = this.container.querySelector('#bid-payment');
      const customInput = this.container.querySelector('#bid-payment-custom');
      
      if (paymentSelect.value === 'custom') {
        customInput.style.display = 'block';
        customInput.required = true;
      } else {
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
      }
    };

    // Item matrix changes
    this.container.addEventListener('input', (e) => {
      const cls = e.target.classList;
      if (
        cls.contains('item-qty') ||
        cls.contains('item-price') ||
        cls.contains('item-compliance') ||
        cls.contains('item-brand') ||
        cls.contains('item-leadtime') ||
        cls.contains('item-minqty') ||
        cls.contains('item-partial') ||
        cls.contains('item-origin') ||
        cls.contains('item-comments') ||
        cls.contains('item-alt-desc')
      ) {
        if (cls.contains('item-qty') || cls.contains('item-price')) this.updateRowTotal(e.target.closest('.matrix-row'));
        this.updateItemData();
      }
    });

    // File upload
    const fileInput = this.container.querySelector('#bid-file-input');
    const uploadBtn = this.container.querySelector('#bid-upload-btn');
    
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
      this.handleFileUpload(e.target.files);
    });

    // Submit bid
    const submitBtn = this.container.querySelector('#submit-bid-btn');
    submitBtn.addEventListener('click', () => {
      this.submitBid();
    });
  }

  updateCommercialTerms() {
    this.bidData.currency = this.container.querySelector('#bid-currency').value;
    this.bidData.validityDays = parseInt(this.container.querySelector('#bid-validity').value);
    this.bidData.incoterm = this.container.querySelector('#bid-incoterm').value;
    this.bidData.warrantyMonths = parseInt(this.container.querySelector('#bid-warranty').value);
    this.bidData.paymentPlan = this.container.querySelector('#bid-payment').value;
    this.bidData.deliveryAddress = this.container.querySelector('#bid-delivery').value;
    this.bidData.notes = this.container.querySelector('#bid-notes').value;
  }

  updateItemData() {
    this.bidData.items = [];
    
    const rows = this.container.querySelectorAll('.matrix-row');
    rows.forEach((row, index) => {
      const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
      const compliance = row.querySelector('.item-compliance').value;
      const price = parseFloat(row.querySelector('.item-price').value) || 0;
      const unit = row.querySelector('.item-unit').value || '';
      const brand = row.querySelector('.item-brand').value;
      const leadTime = parseInt(row.querySelector('.item-leadtime').value) || 0;
      const minQty = parseFloat(row.querySelector('.item-minqty').value) || 0;
      const partialAllowed = row.querySelector('.item-partial').value === 'yes';
      const origin = row.querySelector('.item-origin').value;
      const comments = row.querySelector('.item-comments').value;
      const altDesc = row.querySelector('.item-alt-desc')?.value || '';
      const totalPrice = qty * price;
      
      this.bidData.items.push({
        demandItemId: this.itemsData[index].id || `item_${index}`,
        compliance: compliance,
        quantity: qty,
        unit: unit,
        unitPrice: price,
        totalPrice: totalPrice,
        netPrice: compliance === 'match' ? price : null,
        brand: brand,
        model: brand, // Same as brand for now
        leadTimeDays: leadTime,
        minOrderQty: minQty,
        partialAllowed: partialAllowed,
        origin: origin,
        comments: comments,
        offeredDescription: altDesc
      });
    });
  }

  updateRowTotal(rowEl) {
    if (!rowEl) return;
    const qty = parseFloat(rowEl.querySelector('.item-qty')?.value || '0') || 0;
    const price = parseFloat(rowEl.querySelector('.item-price')?.value || '0') || 0;
    const totalEl = rowEl.querySelector('.item-total');
    if (totalEl) {
      const total = qty * price;
      totalEl.textContent = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(total);
    }
  }

  loadDeliveryAddress() {
    // Pre-fill delivery address from demand if available
    if (this.demandData.deliveryAddress) {
      this.container.querySelector('#bid-delivery').value = this.demandData.deliveryAddress;
      this.bidData.deliveryAddress = this.demandData.deliveryAddress;
    }
  }

  handleFileUpload(files) {
    Array.from(files).forEach(file => {
      this.attachments.push({
        name: file.name,
        size: file.size,
        type: file.type,
        file: file
      });
    });
    
    this.updateFileList();
  }

  updateFileList() {
    const fileList = this.container.querySelector('#bid-file-list');
    fileList.innerHTML = this.attachments.map((file, index) => `
      <div class="file-item">
        <span class="file-name">${file.name}</span>
        <span class="file-size">(${(file.size / 1024).toFixed(1)} KB)</span>
        <button class="remove-file" data-index="${index}">❌</button>
      </div>
    `).join('');
    
    // Bind remove file events
    fileList.querySelectorAll('.remove-file').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.attachments.splice(index, 1);
        this.updateFileList();
      });
    });
  }

  async submitBid() {
    try {
      // Update data
      this.updateCommercialTerms();
      this.updateItemData();
      // Auto-detect differences vs demand and append to notes
      const diffs = [];
      this.itemsData.forEach((dItem, i) => {
        const bItem = this.bidData.items[i] || {};
        const dQty = parseFloat(dItem.quantity || dItem.qty || 0) || 0;
        const dUnit = dItem.unit || dItem.uom || '';
        const dDesc = dItem.description || dItem.name || '';
        if (bItem.quantity != null && (Number(bItem.quantity) !== Number(dQty))) {
          diffs.push(`Kalem ${i+1}: Miktar değişikliği – talep ${dQty} ${dUnit || ''}, teklif ${bItem.quantity} ${bItem.unit || ''}`);
        }
        if ((bItem.unit || '') && dUnit && (String(bItem.unit).toLowerCase() !== String(dUnit).toLowerCase())) {
          diffs.push(`Kalem ${i+1}: Birim değişikliği – talep ${dUnit}, teklif ${bItem.unit}`);
        }
        if ((bItem.offeredDescription || '').trim() && (bItem.offeredDescription || '').trim() !== (dDesc || '').trim()) {
          diffs.push(`Kalem ${i+1}: Tanım farklı – talep "${dDesc}", teklif "${bItem.offeredDescription}"`);
        }
        if ((bItem.brand || '').trim()) {
          const dBrand = dItem.brand || dItem.model || '';
          if (dBrand && (bItem.brand.trim().toLowerCase() !== String(dBrand).trim().toLowerCase())) {
            diffs.push(`Kalem ${i+1}: Marka/Model farklı – talep "${dBrand}", teklif "${bItem.brand}"`);
          } else if (!dBrand) {
            diffs.push(`Kalem ${i+1}: Marka/Model – "${bItem.brand}"`);
          }
        }
      });
      if (diffs.length) {
        const sysNote = `Sistem Notu – Tespit edilen farklar:\n- ${diffs.join('\n- ')}`;
        const notesNow = (this.container.querySelector('#bid-notes').value || '').trim();
        const combined = notesNow ? `${notesNow}\n\n${sysNote}` : sysNote;
        this.container.querySelector('#bid-notes').value = combined;
        this.bidData.notes = combined;
      }
      
      // Validate
      const validation = validateBidData(this.bidData);
      if (!validation.isValid) {
        alert('Lütfen aşağıdaki hataları düzeltin:\n' + validation.errors.join('\n'));
        return;
      }
      
      // Calculate total
      const total = calculateBidTotal(this.bidData.items, this.bidData.currency);
      
      // Confirm submission
      const confirmMsg = `Teklif Toplamı: ${total.formatted}\n\nTeklifi göndermek istediğinizden emin misiniz?`;
      if (!confirm(confirmMsg)) return;
      
      // Submit
      const bidId = await createRFQBid(this.bidData);
      
      alert('✅ Teklifiniz başarıyla gönderildi!');
      
      // Reset form
      this.resetForm();
      
      return bidId;
      
    } catch (error) {
      logger.error('Error submitting bid', error);
      alert('❌ Teklif gönderilirken hata oluştu: ' + error.message);
    }
  }

  resetForm() {
    // Reset commercial terms
    this.container.querySelector('#bid-currency').value = 'TRY';
    this.container.querySelector('#bid-validity').value = '30';
    this.container.querySelector('#bid-incoterm').value = 'DAP';
    this.container.querySelector('#bid-warranty').value = '12';
    this.container.querySelector('#bid-payment').value = '30-days';
    this.container.querySelector('#bid-delivery').value = '';
    this.container.querySelector('#bid-notes').value = '';
    
    // Reset item matrix
    this.container.querySelectorAll('.item-compliance').forEach(select => select.value = '');
    this.container.querySelectorAll('.item-price').forEach(input => input.value = '');
    this.container.querySelectorAll('.item-brand').forEach(input => input.value = '');
    this.container.querySelectorAll('.item-leadtime').forEach(input => input.value = '');
    this.container.querySelectorAll('.item-minqty').forEach(input => input.value = '');
    this.container.querySelectorAll('.item-partial').forEach(select => select.value = 'no');
    this.container.querySelectorAll('.item-origin').forEach(input => input.value = '');
    this.container.querySelectorAll('.item-comments').forEach(textarea => textarea.value = '');
    
    // Reset attachments
    this.attachments = [];
    this.updateFileList();
    
    // Reset data
    this.bidData = {
      demandId: this.demandData.id,
      currency: 'TRY',
      validityDays: 30,
      incoterm: 'DAP',
      warrantyMonths: 12,
      paymentPlan: '30-days',
      deliveryAddress: '',
      notes: '',
      items: []
    };
  }
}

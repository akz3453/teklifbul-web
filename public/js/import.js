const $ = s => document.querySelector(s);
const file = $('#file');
const btnPreview = $('#btnPreview');
const preview = $('#preview');
const demandBox = $('#demandBox');
const itemsTable = $('#itemsTable');
const meta = $('#meta');
const btnCommit = $('#btnCommit');
const sendNow = $('#sendNow');
const result = $('#result');
const resultBox = $('#resultBox');

let LAST = null;

btnPreview?.addEventListener('click', async () => {
  if (!file.files[0]) { alert('Dosya seçin'); return; }
  
  // Loading state
  btnPreview.disabled = true;
  btnPreview.textContent = 'Yükleniyor...';
  
  try {
    const fd = new FormData(); 
    fd.append('file', file.files[0]);
    
    console.log('[Import] Sending file:', file.files[0].name, file.files[0].size, 'bytes');
    
    const r = await fetch('/api/import/preview', { 
      method: 'POST', 
      body: fd 
      // NO Content-Type header! Let browser set multipart/form-data with boundary
    });
    
    let j;
    try { 
      j = await r.json(); 
    } catch(e) { 
      j = null; 
      console.error('[Import] JSON parse error:', e);
    }
    
    if (!r.ok) {
      const errorMsg = j?.details || j?.error || 'Önizleme hatası';
      const errorCode = j?.error || 'unknown_error';
      console.error('[Import] Error:', errorCode, j);
      alert(`❌ Hata: ${errorMsg}\n\nKod: ${errorCode}`);
      return;
    }
    
    console.log('[Import] Success:', j);
    LAST = j;
    preview.style.display = '';
    meta.innerHTML = `profil: <b>${j.profileHint}</b> • başlık satırı: <b>${j.headerRow}</b> • güven: <b class="${j.confidence>=80?'ok':j.confidence>=60?'warn':'err'}">${j.confidence}%</b>`;
    demandBox.textContent = JSON.stringify(j.demand, null, 2);

    // Teklifbul Rule v1.0 - Kategori öneri sistemi entegrasyonu
    itemsTable.innerHTML = '';
    const head = itemsTable.createTHead(); const hr = head.insertRow();
    ['Satır #', 'Ürün Adı', 'Kategori Önerileri', 'Miktar', 'Birim', 'Fiyat', 'KDV', 'Para Birimi', 'Teslim Tarihi', 'Not'].forEach(h=>{
      const th = document.createElement('th'); th.textContent = h; hr.appendChild(th);
    });
    const tb = itemsTable.createTBody();
    (j.items || []).forEach((it, idx) => {
      const tr = tb.insertRow();
      
      // Satır numarası
      const tdNum = tr.insertCell();
      tdNum.textContent = (idx + 1).toString();
      
      // Ürün adı
      const tdName = tr.insertCell();
      tdName.textContent = it.itemName ?? '';
      
      // Kategori önerileri
      const tdCategory = tr.insertCell();
      if (it.categorySuggestions && it.categorySuggestions.length > 0) {
        const categoryDiv = document.createElement('div');
        categoryDiv.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
        
        // Önerileri göster
        it.categorySuggestions.slice(0, 3).forEach((sug: any, sugIdx: number) => {
          const scorePercent = Math.round((sug.score || 0) * 100);
          const isHighConfidence = sug.score >= 0.70;
          const badgeColor = isHighConfidence ? '#10b981' : '#f59e0b';
          
          const sugDiv = document.createElement('div');
          sugDiv.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 8px;
            background: ${isHighConfidence ? '#ecfdf5' : '#fffbeb'};
            border-radius: 4px;
            border-left: 3px solid ${badgeColor};
            font-size: 12px;
          `;
          
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = sug.name;
          checkbox.dataset.categoryId = sug.category_id;
          checkbox.dataset.score = sug.score;
          if (isHighConfidence && sugIdx === 0) {
            checkbox.checked = true; // Yüksek güvenilirlikte otomatik seç
          }
          
          const label = document.createElement('label');
          label.style.cssText = 'flex: 1; cursor: pointer;';
          label.appendChild(checkbox);
          label.appendChild(document.createTextNode(` ${sug.name} (${scorePercent}%)`));
          
          if (sug.reasons && sug.reasons.length > 0) {
            const reasonsSpan = document.createElement('span');
            reasonsSpan.style.cssText = 'font-size: 10px; color: #6b7280; margin-left: 8px;';
            reasonsSpan.textContent = `[${sug.reasons.slice(0, 2).join(', ')}]`;
            label.appendChild(reasonsSpan);
          }
          
          sugDiv.appendChild(label);
          categoryDiv.appendChild(sugDiv);
        });
        
        // "Otomatik uygula ≥0.70" butonu
        if (it.suggestedCategory) {
          const autoBtn = document.createElement('button');
          autoBtn.type = 'button';
          autoBtn.textContent = `✅ ${it.suggestedCategory} (Otomatik Seç)`;
          autoBtn.style.cssText = `
            margin-top: 4px;
            padding: 4px 8px;
            background: #10b981;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
          `;
          autoBtn.addEventListener('click', () => {
            categoryDiv.querySelectorAll('input[type="checkbox"]').forEach((cb: HTMLInputElement) => {
              cb.checked = cb.value === it.suggestedCategory;
            });
          });
          categoryDiv.insertBefore(autoBtn, categoryDiv.firstChild);
        }
        
        tdCategory.appendChild(categoryDiv);
      } else {
        tdCategory.textContent = 'Öneri yok';
        tdCategory.style.color = '#9ca3af';
        tdCategory.style.fontStyle = 'italic';
      }
      
      // Diğer alanlar
      ['qty','unit','unitPriceExcl','vatPct','currency','deliveryDate','note'].forEach(k=>{
        const td = tr.insertCell();
        td.textContent = it[k] ?? '';
      });
    });
    
  } finally {
    btnPreview.disabled = false;
    btnPreview.textContent = 'Önizleme';
  }
});

btnCommit?.addEventListener('click', async () => {
  if (!LAST) { alert('Önce önizleme yapın'); return; }
  
  // Teklifbul Rule v1.0 - Seçili kategorileri topla
  const itemsWithCategories = LAST.items.map((item: any, idx: number) => {
    const row = itemsTable.querySelectorAll('tbody tr')[idx];
    if (!row) return item;
    
    const categoryCell = row.cells[2]; // Kategori sütunu
    const selectedCategories: string[] = [];
    categoryCell.querySelectorAll('input[type="checkbox"]:checked').forEach((cb: HTMLInputElement) => {
      if (cb.value) selectedCategories.push(cb.value);
    });
    
    return {
      ...item,
      selectedCategories // Seçilen kategoriler
    };
  });
  
  const payload = { 
    demand: LAST.demand, 
    items: itemsWithCategories, 
    options: { sendNow: sendNow.checked } 
  };
  
  const r = await fetch('/api/import/commit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok) { alert(j.error || 'Commit hatası'); return; }
  result.style.display = ''; resultBox.textContent = JSON.stringify(j, null, 2);
});



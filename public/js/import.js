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

    itemsTable.innerHTML = '';
    const head = itemsTable.createTHead(); const hr = head.insertRow();
    ['itemName','qty','unit','unitPriceExcl','vatPct','currency','deliveryDate','note'].forEach(h=>{
      const th = document.createElement('th'); th.textContent = h; hr.appendChild(th);
    });
    const tb = itemsTable.createTBody();
    (j.items || []).slice(0,5).forEach(it=>{
      const tr = tb.insertRow();
      ['itemName','qty','unit','unitPriceExcl','vatPct','currency','deliveryDate','note'].forEach(k=>{
        const td = tr.insertCell(); td.textContent = it[k] ?? '';
      });
    });
    
  } finally {
    btnPreview.disabled = false;
    btnPreview.textContent = 'Önizleme';
  }
});

btnCommit?.addEventListener('click', async () => {
  if (!LAST) { alert('Önce önizleme yapın'); return; }
  const payload = { demand: LAST.demand, items: LAST.items, options: { sendNow: sendNow.checked } };
  const r = await fetch('/api/import/commit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok) { alert(j.error || 'Commit hatası'); return; }
  result.style.display = ''; resultBox.textContent = JSON.stringify(j, null, 2);
});



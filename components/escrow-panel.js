// Escrow Panel (vanilla JS)
// Usage: initEscrowPanel({ mount: '#escrow-root', role: 'buyer'|'seller', demandId, bidId })

export function initEscrowPanel({ mount, role = 'buyer', demandId = null, bidId = null } = {}){
  const container = typeof mount === 'string' ? document.querySelector(mount) : mount;
  if (!container) return;

  let state = { id: null, status: 'created', audit: [] };

  container.innerHTML = `
    <div class="escrow-panel" style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;">Escrow (Blokeli Ödeme)</h3>
        <span id="escrowStatus" class="badge" style="background:#f3f4f6;padding:4px 8px;border-radius:12px;">created</span>
      </div>
      <div id="escrowInfo" style="font-size:13px;color:#374151;margin:8px 0 12px 0;">
        Alıcı ödemeyi Teklifbul’un noter onaylı hesabına yatırır; teslim onayıyla satıcıya aktarılır.
      </div>
      <div id="escrowActions" style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;"></div>
      <div style="margin-top:12px;">
        <h4 style="margin:0 0 8px 0;font-size:14px;">Kayıtlar</h4>
        <div id="escrowLog" style="font-family:monospace;font-size:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px;max-height:220px;overflow:auto;">—</div>
      </div>
    </div>
  `;

  const statusEl = container.querySelector('#escrowStatus');
  const actionsEl = container.querySelector('#escrowActions');
  const logEl = container.querySelector('#escrowLog');

  function setStatus(s){ state.status = s; statusEl.textContent = s; }
  function pushLog(action, meta){
    const entry = { at: new Date().toISOString(), by: role, action, meta: meta||{} };
    state.audit.push(entry);
    logEl.textContent = state.audit.map(e => `${e.at} | ${e.by} | ${e.action} ${JSON.stringify(e.meta)}`).join('\n');
  }
  function btn(label, handler){ const b = document.createElement('button'); b.textContent = label; b.className = 'btn btn-secondary'; b.style.cssText = 'padding:6px 10px;'; b.onclick = handler; return b; }

  async function apiPost(path, body){
    const res = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async function apiGet(path){ const r = await fetch(path); if (!r.ok) throw new Error(await r.text()); return r.json(); }

  async function refresh(){
    actionsEl.innerHTML = '';
    if (!state.id) {
      actionsEl.appendChild(btn('Referans Oluştur', async ()=>{
        const r = await apiPost('/api/escrow/create', { demandId, bidId });
        state.id = r.id; setStatus(r.status); pushLog('create', { id: r.id });
        refresh();
      }));
      return;
    }
    // Common actions
    actionsEl.appendChild(btn('Durumu Getir', async ()=>{ const r = await apiGet(`/api/escrow/${state.id}`); setStatus(r.status); pushLog('get', {}); }));

    switch(state.status){
      case 'awaiting_funds':
        actionsEl.appendChild(btn('Dekont Yükle', async ()=>{ const r = await apiPost('/api/escrow/upload-proof', { id: state.id, url: 'mock://proof' }); pushLog('upload-proof', {}); }));
        actionsEl.appendChild(btn('Banka Onayı (Webhook)', async ()=>{ const r = await apiPost('/api/escrow/webhook/bank', { id: state.id }); setStatus(r.status); pushLog('bank-ok', {}); }));
        break;
      case 'in_escrow':
        if (role === 'seller') actionsEl.appendChild(btn('Sevk Evrakı Yükle', async ()=>{ const r = await apiPost('/api/escrow/ship-docs', { id: state.id, url: 'mock://shipment' }); setStatus(r.status); pushLog('ship-docs', {}); }));
        break;
      case 'shipped':
        if (role === 'buyer') actionsEl.appendChild(btn('Teslimi Onayla', async ()=>{ const r = await apiPost('/api/escrow/approve-delivery', { id: state.id }); setStatus(r.status); pushLog('approve-delivery', {}); }));
        actionsEl.appendChild(btn('Uyuşmazlık Aç', async ()=>{ const r = await apiPost('/api/escrow/dispute', { id: state.id, reason: 'mock' }); setStatus(r.status); pushLog('dispute', {}); }));
        break;
      default:
        // released | dispute | created
        break;
    }
  }

  // Bootstrap
  refresh();
  return { get id(){ return state.id; }, get status(){ return state.status; }, refresh };
}



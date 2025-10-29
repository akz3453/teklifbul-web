// Payment Module (vanilla JS, single-file)
// Initializes itself when a section with id "payment-section" exists.

(function(){
  const api = { init, setTotals, setRole, getPayload };
  let bound = false;
  let state = {
    role: 'buyer',
    paymentType: null,
    totalIncl: 0,
    pesinModel: null,
    prepaymentRate: 30,
    installments: 1,
    financeRate: 0,
    ccCampaign: '',
    invoiceDate: '',
    netDays: 15,
    checks: []
  };

  const DEFAULT_FINANCE_BY_PLAN = { single: 0, '6': 3, '9': 5 };

  function $(sel){ return document.querySelector(sel); }
  function show(el, flag){ if (el) el.classList.toggle('hidden', !flag); }
  function toNumber(val){ const n = Number(val); return Number.isFinite(n) ? n : 0; }

  function calcFinance({ totalIncl, financeRate, installments = 1 }){
    const baseAmt = totalIncl;
    const financeAmt = baseAmt * (financeRate/100);
    const grandIncl = totalIncl + financeAmt;
    const monthly = installments > 1 ? grandIncl / installments : grandIncl;
    return { baseAmt, financeAmt, grandIncl, monthly };
  }
  function addBusinessDaysFromInvoice(invoiceDateStr, netDays){
    if (!invoiceDateStr) return { due:null, label:'—' };
    const d = new Date(invoiceDateStr + 'T00:00:00');
    d.setDate(d.getDate() + netDays);
    const dow = d.getDay();
    if (dow === 0) d.setDate(d.getDate() + 1);
    if (dow === 6) d.setDate(d.getDate() + 2);
    const label = d.toLocaleDateString('tr-TR', { weekday:'long', year:'numeric', month:'2-digit', day:'2-digit' });
    return { due:d, label };
  }
  function updatePesinUI(model){ show($('#prepayment-config'), model === 'onodeme'); show($('#escrow-info'), model === 'escrow'); }

  function bind(){
    const root = $('#payment-section'); if (!root) return;
    bound = true;
    root.querySelectorAll('input[name="paymentType"]').forEach(r => r.addEventListener('change', e => { state.paymentType = e.target.value; refresh(); }));
    root.querySelectorAll('input[name="pesinModel"]').forEach(r => r.addEventListener('change', e => { state.pesinModel = e.target.value; updatePesinUI(state.pesinModel); refresh(); }));
    $('#prepaymentRate')?.addEventListener('input', e => { state.prepaymentRate = toNumber(e.target.value); refresh(); });
    $('#installments')?.addEventListener('input', e => { state.installments = Math.max(1, toNumber(e.target.value)); refresh(); });
    $('#ccCampaign')?.addEventListener('input', e => { state.ccCampaign = e.target.value; });
    $('#financeRate')?.addEventListener('input', e => { state.financeRate = toNumber(e.target.value); refresh(); });
    $('#invoiceDate')?.addEventListener('change', e => { state.invoiceDate = e.target.value; refresh(); });
    $('#netDays')?.addEventListener('change', e => { state.netDays = toNumber(e.target.value); refresh(); });
    $('#netDaysCustom')?.addEventListener('input', e => { const v = toNumber(e.target.value); if (v>0) { state.netDays = v; const sel = $('#netDays'); if (sel) sel.value = ''; } refresh(); });
    $('#btnAddCheck')?.addEventListener('click', () => { state.checks.push({ amount: 0, days: 30 }); renderChecks(); refresh(); });
    const checksBody = document.getElementById('checksBody');
    checksBody?.addEventListener('input', (e) => {
      const row = /** @type {HTMLElement} */(e.target).closest('[data-idx]'); if (!row) return;
      const idx = Number(row.getAttribute('data-idx'));
      if (/** @type {HTMLElement} */(e.target).classList.contains('chk-amount')) state.checks[idx].amount = toNumber(/** @type {HTMLInputElement} */(e.target).value);
      if (/** @type {HTMLElement} */(e.target).classList.contains('chk-days')) state.checks[idx].days = toNumber(/** @type {HTMLInputElement} */(e.target).value);
      refresh();
    });
    checksBody?.addEventListener('click', (e) => {
      const btn = /** @type {HTMLElement} */(e.target).closest('.chk-del'); if (!btn) return;
      const row = /** @type {HTMLElement} */(btn).closest('[data-idx]'); if (!row) return;
      const idx = Number(row.getAttribute('data-idx'));
      state.checks.splice(idx, 1);
      renderChecks();
      refresh();
    });
    $('#savePayment')?.addEventListener('click', onSave);
    // Payment cards (Peşin modelleri)
    const cards = root.querySelectorAll('.payment-card');
    cards.forEach((card)=>{
      card.addEventListener('click', ()=>{
        const model = card.getAttribute('data-model');
        const input = root.querySelector(`input[name="pesinModel"][value="${model}"]`);
        if (input) { input.checked = true; }
        state.pesinModel = model;
        updatePesinUI(state.pesinModel);
        refresh();
      });
    });
  }

  function renderChecks(){
    const host = document.getElementById('checksBody'); if (!host) return;
    host.innerHTML = '';
    state.checks.forEach((c, i) => {
      const row = document.createElement('div');
      row.setAttribute('data-idx', String(i));
      row.style.cssText = 'display:grid; grid-template-columns: 1fr 140px 60px; gap:8px; align-items:center; margin-bottom:6px;';
      row.innerHTML = `
        <input class="chk-amount" inputmode="decimal" placeholder="Tutar (₺)" value="${c.amount || ''}" style="padding:6px;border:1px solid #d1d5db;border-radius:6px;" />
        <input class="chk-days" type="number" min="1" placeholder="Gün" value="${c.days || 30}" style="padding:6px;border:1px solid #d1d5db;border-radius:6px;" />
        <button type="button" class="btn btn-secondary chk-del" style="padding:6px 10px;">Sil</button>
      `;
      host.appendChild(row);
    });
  }

  function refresh(){
    const root = $('#payment-section'); if (!root) return;
    show($('#pesin-group'), state.paymentType === 'pesin');
    show($('#kk-group'), state.paymentType === 'krediKarti');
    show($('#ah-group'), state.paymentType === 'acikHesap');
    show($('#evrak-group'), state.paymentType === 'evrak');
    if (state.paymentType === 'pesin') updatePesinUI(state.pesinModel);
    // highlight selected card
    const cards = root.querySelectorAll('.payment-card');
    cards.forEach((c)=>{ c.classList.toggle('selected', c.getAttribute('data-model') === state.pesinModel); });
    if (state.paymentType === 'krediKarti'){
      const installments = Math.max(1, state.installments);
      const fin = calcFinance({ totalIncl: state.totalIncl, financeRate: state.financeRate, installments });
      if ($('#ccBaseIncl')) $('#ccBaseIncl').textContent = state.totalIncl.toFixed(2) + ' ₺';
      if ($('#ccFinanceAmt')) $('#ccFinanceAmt').textContent = fin.financeAmt.toFixed(2) + ' ₺';
      if ($('#ccTotalIncl')) $('#ccTotalIncl').textContent = fin.grandIncl.toFixed(2) + ' ₺';
      if ($('#ccMonthly')) $('#ccMonthly').textContent = installments > 1 ? (fin.monthly.toFixed(2) + ' ₺ x ' + installments) : '—';
    } else {
      if ($('#ccBaseIncl')) $('#ccBaseIncl').textContent = '—';
      if ($('#ccFinanceAmt')) $('#ccFinanceAmt').textContent = '—';
      if ($('#ccTotalIncl')) $('#ccTotalIncl').textContent = '—';
      if ($('#ccMonthly')) $('#ccMonthly').textContent = '—';
    }
    if (state.paymentType === 'acikHesap') { const res = addBusinessDaysFromInvoice(state.invoiceDate, state.netDays); if ($('#dueDateHuman')) $('#dueDateHuman').textContent = res.label; } else { if ($('#dueDateHuman')) $('#dueDateHuman').textContent = '—'; }
    if ($('#summary')) $('#summary').innerHTML = renderSummary({ state });
  }

  function renderSummary({ state }){
    const rows = [];
    rows.push(`<div><b>Ödeme Tipi:</b> ${state.paymentType ?? '—'}</div>`);
    rows.push(`<div><b>KDV Dahil Toplam:</b> ${state.totalIncl.toFixed(2)} ₺</div>`);
    if (state.paymentType === 'pesin') { rows.push(`<div><b>Peşin Model:</b> ${state.pesinModel ?? '—'}</div>`); if (state.pesinModel === 'onodeme') rows.push(`<div><b>Ön ödeme oranı:</b> %${state.prepaymentRate}</div>`); }
    if (state.paymentType === 'krediKarti') { rows.push(`<div><b>Taksit:</b> ${Math.max(1,state.installments)} | <b>Vade Farkı:</b> %${state.financeRate} | <b>Kampanya:</b> ${state.ccCampaign||'—'}</div>`); }
    if (state.paymentType === 'acikHesap') { const label = ($('#dueDateHuman')?.textContent)||'—'; rows.push(`<div><b>Fatura Tarihi:</b> ${state.invoiceDate || '—'} | <b>Vade:</b> +${state.netDays} gün → <b>Son Ödeme:</b> ${label}</div>`); }
    if (state.paymentType === 'evrak') { rows.push(`<div><b>Çek Sayısı:</b> ${state.checks.length} | <b>Toplam:</b> ${state.checks.reduce((s,c)=>s+Number(c.amount||0),0).toFixed(2)} ₺</div>`); }
    return rows.join('');
  }

  function onSave(){
    const payload = getPayload();
    const evt = new CustomEvent('payment:save', { detail: payload });
    document.dispatchEvent(evt);
    alert('Ödeme tercihleri kaydedildi.');
  }

  function init(){ if (document.getElementById('payment-section') && !bound){ bind(); refresh(); } }
  function setTotals({ totalIncl }){ if (typeof totalIncl === 'number') state.totalIncl = totalIncl; refresh(); }
  function setRole(role){ if (role) state.role = role; refresh(); }
  function getPayload(){
    return {
      role: state.role,
      paymentType: state.paymentType,
      totals: { incl: state.totalIncl },
      pesin: state.paymentType === 'pesin' ? { model: state.pesinModel, prepaymentRate: state.pesinModel==='onodeme' ? state.prepaymentRate : null } : null,
      krediKarti: state.paymentType === 'krediKarti' ? { installments: Math.max(1,state.installments), financeRate: state.financeRate, campaign: state.ccCampaign } : null,
      acikHesap: state.paymentType === 'acikHesap' ? { invoiceDate: state.invoiceDate, netDays: state.netDays } : null,
      evrak: state.paymentType === 'evrak' ? { checks: state.checks } : null
    };
  }

  // Auto-init on load
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.paymentModule = api;
})();



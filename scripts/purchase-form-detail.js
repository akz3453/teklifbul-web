import { db } from '/firebase.js';
import { doc, getDoc, updateDoc, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js';

const qs = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const id = params.get('id');

/** Teklifbul Rule v1.0 — XSS escape */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function load(){
  if (!id){ qs('#summary').textContent = 'Geçersiz id'; return; }
  const ref = doc(db,'internal_requests', id);
  const snap = await getDoc(ref);
  if (!snap.exists()){ qs('#summary').textContent='Kayıt bulunamadı'; return; }
  const d = snap.data();
  qs('#summary').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><strong>Başlık:</strong> ${escapeHtml(d.title || '-')}</div>
      <div><strong>Tür:</strong> ${escapeHtml(d.type)}</div>
      <div><strong>Durum:</strong> ${escapeHtml(d.status)}</div>
      <div><strong>Adres:</strong> ${escapeHtml(d.deliveryAddress || '-')}</div>
    </div>
  `;
  const tbody = qs('#linesTable tbody');
  tbody.innerHTML = '';
  const ls = await getDocs(collection(ref,'material_lines'));
  ls.forEach(x => {
    const r = x.data();
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(r.lineNo||'')}</td><td>${escapeHtml(r.sku||'')}</td><td>${escapeHtml(r.name||'')}</td><td>${escapeHtml(r.brandModel||'')}</td><td>${escapeHtml(r.qty||'')}</td><td>${escapeHtml(r.unit||'')}</td><td>${escapeHtml(r.matchStatus||'')}</td>`;
    tbody.appendChild(tr);
  });
}

async function send(){
  const ref = doc(db,'internal_requests', id);
  await updateDoc(ref, { status:'SENT' });
  alert('Talep Satın Almaya gönderildi.');
  await load();
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  qs('#btnSend').addEventListener('click', send);
});



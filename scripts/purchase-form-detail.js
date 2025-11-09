import { db } from '/firebase.js';
import { doc, getDoc, updateDoc, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js';

const qs = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const id = params.get('id');

async function load(){
  if (!id){ qs('#summary').textContent = 'Geçersiz id'; return; }
  const ref = doc(db,'internal_requests', id);
  const snap = await getDoc(ref);
  if (!snap.exists()){ qs('#summary').textContent='Kayıt bulunamadı'; return; }
  const d = snap.data();
  qs('#summary').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><strong>Başlık:</strong> ${d.title || '-'}</div>
      <div><strong>Tür:</strong> ${d.type}</div>
      <div><strong>Durum:</strong> ${d.status}</div>
      <div><strong>Adres:</strong> ${d.deliveryAddress || '-'}</div>
    </div>
  `;
  const tbody = qs('#linesTable tbody');
  tbody.innerHTML = '';
  const ls = await getDocs(collection(ref,'material_lines'));
  ls.forEach(x => {
    const r = x.data();
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.lineNo||''}</td><td>${r.sku||''}</td><td>${r.name||''}</td><td>${r.brandModel||''}</td><td>${r.qty||''}</td><td>${r.unit||''}</td><td>${r.matchStatus||''}</td>`;
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



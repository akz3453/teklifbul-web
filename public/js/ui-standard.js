// Otomatik sınıflandırma ve başlık standardizasyonu
(() => {
  const EDITABLE_HINT_KEYS = [
    'Teklif Edilen','İskontolar','KDV','Ödeme','Teslim','Kalite','Sertifika',
    'Birim Fiyat','Para Birimi','Açıklama','Ürün Görseli','Vade','Taksit','Kur','FX','Ön Ödeme'
  ];
  const STATIC_HINT_KEYS = ['Talep Bilgisi','Talep Detayı','Talep Kalemi','Ürün İsmi','Sıra No','Miktar','Birim','Toplam','Hedef'];

  const q = (sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const matchText = (el,keys)=>keys.some(k => (el.textContent||'').toLowerCase().includes(k.toLowerCase()));
  const findContainer = el =>
    el.closest('.item-card,.card,.section-box,.panel,.box,section,.group,.wrapper,.container') || el.parentElement;

  // Sayfa başlıklarını kurumsal .section-header formatına dönüştür
  function upgradeSectionHeaders(){
    q('h1,h2,h3').forEach(h=>{
      const t=(h.textContent||'').trim();
      if(!t) return;
      if(/^📋|^📦|^📝|^📊|Genel Teklif Bilgileri|Kendi Teklifin|Talep Bilgisi|Fiyat Karşılaştırma/i.test(t)){
        if(h.classList.contains('section-header')) return;
        const container = findContainer(h);
        const wrap=document.createElement('div'); wrap.className='section-header';
        const arr = Array.from(t);
        const first = arr[0] || '•';
        const rest = (arr.slice(1).join('')).trim() || t;
        const icon=document.createElement('span'); icon.className='icon'; icon.textContent=first;
        const label=document.createElement('span'); label.textContent=rest;
        wrap.append(icon,label); h.replaceWith(wrap);
        // Force static styling for specific headings
        if(/Taslak Talepler/i.test(rest)){
          wrap.classList.add('force-static');
          if(container){ container.classList.add('block--static'); container.classList.remove('block--editable'); }
        }
      }
    });
  }

  // Tablo başlık/altlık sınıfları
  function tagTables(){
    q('table thead').forEach(t=>t.classList.add('table-head'));
    q('table tbody tr').forEach(r=>r.classList.add('table-row'));
    q('table tfoot').forEach(f=>f.classList.add('table-foot'));
  }

  // Ürün kalemi tipindeki blokları kart ve info-block yap
  function tagItemBlocks(){
    q('.rfq-item-block,.demand-item,.item,.item-block').forEach(el=>el.classList.add('item-card'));
    q('.iskonto,.discount,.payment,.fx,.delivery,.cert,.quality').forEach(el=>el.classList.add('info-block'));
  }

  // Editable vs static otomatik tespiti
  function classifyBlocks(){
    // Manuel override: data-block / data-readonly
    q('[data-block]').forEach(el=>{
      const type=(el.getAttribute('data-block')||'').toLowerCase();
      el.classList.add(type==='editable' ? 'block--editable' : 'block--static');
    });
    q('[data-readonly="true"]').forEach(el=>el.classList.add('is-readonly'));

    // Başlıklara göre ipucu
    q('h2,h3,h4,.block-title,.section-title').forEach(h=>{
      const box=findContainer(h); if(!box) return;
      if(box.matches('[data-block]')) return; // manuel ise dokunma
      if(matchText(h,EDITABLE_HINT_KEYS)) box.classList.add('block--editable');
      if(matchText(h,STATIC_HINT_KEYS))   box.classList.add('block--static');
      if(box.classList.contains('block--editable')){
        h.classList.add('heading--editable');
      }else if(box.classList.contains('block--static')){
        h.classList.add('heading--static');
      }
    });

    // Form elemanı içeriyorsa ve disabled değilse editable say
    q('.card,.item-card,.section-box,.panel,.box,section').forEach(box=>{
      if(box.matches('[data-block]')) return; // manuel ise atla
      const inputs=q('input,select,textarea,[contenteditable="true"]',box);
      const hasActive = inputs.some(i=>!(i.disabled||i.readOnly||i.getAttribute('aria-disabled')==='true'));
      if(hasActive){ box.classList.add('block--editable'); q('h2,h3,h4,.block-title,.section-title',box).forEach(h=>h.classList.add('heading--editable')); }
      else { box.classList.add('block--static'); q('h2,h3,h4,.block-title,.section-title',box).forEach(h=>h.classList.add('heading--static')); }
    });

    // Role tabanlı readonly: data-required-role ile
    const currentRole=window.CURRENT_ROLE||'buyer';
    q('[data-required-role]').forEach(box=>{
      const need=box.getAttribute('data-required-role');
      if(need && need!==currentRole){ box.classList.add('is-readonly'); }
    });
  }

  function init(){ upgradeSectionHeaders(); tagTables(); tagItemBlocks(); classifyBlocks(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();



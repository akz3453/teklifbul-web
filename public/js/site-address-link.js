// public/js/site-address-link.js
// Talep ekranında Şantiye seçimini Alım Yeri ve Teslimat adresine bağlar.

import { slugTR } from '/utils/slug-tr.js';

const qs  = s => document.querySelector(s);

export function initSiteAddressLink() {
  const ids = {
    selSite:           '#delivery_saved_site', // Şantiye select
    chkNakliye:        '#chk_nakliye_dahil',   // Nakliye dahil checkbox
    selAlimIl:         '#alim_il',             // Alım yeri il (select veya input)
    invIl:             '#inv_il',
    invIlce:           '#inv_ilce',
    invMahalle:        '#inv_mahalle',
    invCadde:          '#inv_cadde',
    invSokak:          '#inv_sokak',
    invKapi:           '#inv_kapi',
    invDaire:          '#inv_daire',
    invPosta:          '#inv_postakodu'
  };

  const el = Object.fromEntries(Object.entries(ids).map(([k, sel]) => [k, qs(sel)]));

  if (!el.selSite) {
    console.warn('[site-address-link] Şantiye select bulunamadı:', ids.selSite);
    return;
  }

  let savedSites = [];
  // Dışarıdan (Ayarlar yükleyince) şantiye set edebilmek için global hook
  window.__setSavedSites = (arr) => { savedSites = Array.isArray(arr) ? arr : []; populateSiteSelect(); };

  function populateSiteSelect() {
    const cur = el.selSite.value;
    el.selSite.innerHTML = '<option value="">Şantiye seçiniz</option>';
    savedSites.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id || slugTR(s.title || s.fullAddress || 'SITE');
      opt.textContent = s.title || s.fullAddress || s.id;
      el.selSite.appendChild(opt);
    });
    if (cur) el.selSite.value = cur;
  }

  function getSiteById(id) { return savedSites.find(s => (s.id || slugTR(s.title || s.fullAddress || 'SITE')) === id); }
  function setDisabled(nodes, on) { nodes.filter(Boolean).forEach(n => n.disabled = !!on); }

  function fillProcurementProvince(site) {
    if (!site || !el.selAlimIl) return;
    el.selAlimIl.value = site.provinceId || slugTR(site.provinceName || '');
    el.selAlimIl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillDeliveryFromSite(site) {
    if (!site) return;
    if (el.invIl)      el.invIl.value      = site.provinceName ?? '';
    if (el.invIlce)    el.invIlce.value    = site.districtName ?? '';
    if (el.invMahalle) el.invMahalle.value = site.neighborhoodName ?? '';
    if (el.invCadde)   el.invCadde.value   = site.street ?? '';
    if (el.invSokak)   el.invSokak.value   = site.street2 ?? '';
    if (el.invKapi)    el.invKapi.value    = site.buildingNo ?? '';
    if (el.invDaire)   el.invDaire.value   = site.apartment ?? '';
    if (el.invPosta)   el.invPosta.value   = site.postalCode ?? '';
  }

  function lockDeliveryFields(lock) {
    setDisabled([
      el.invIl, el.invIlce, el.invMahalle, el.invCadde,
      el.invSokak, el.invKapi, el.invDaire, el.invPosta
    ], lock);
  }

  function onSiteChange() {
    const site = getSiteById(el.selSite.value);
    if (!site) {
      if (el.chkNakliye) el.chkNakliye.checked = false;
      lockDeliveryFields(false);
      return;
    }
    fillProcurementProvince(site);
    if (el.chkNakliye?.checked) {
      fillDeliveryFromSite(site);
      lockDeliveryFields(true);
    }
  }

  function onNakliyeToggle() {
    const site = getSiteById(el.selSite.value);
    if (el.chkNakliye.checked) {
      if (!site) {
        alert('Nakliye dahil için önce bir şantiye seçiniz.');
        el.chkNakliye.checked = false;
        return;
      }
      fillDeliveryFromSite(site);
      lockDeliveryFields(true);
    } else {
      lockDeliveryFields(false);
    }
  }

  el.selSite.addEventListener('change', onSiteChange);
  el.chkNakliye?.addEventListener('change', onNakliyeToggle);

  if (Array.isArray(window.__initialSavedSites) && window.__initialSavedSites.length) {
    savedSites = window.__initialSavedSites;
    populateSiteSelect();
  }
}



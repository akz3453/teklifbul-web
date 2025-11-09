// Teklifbul Rule v1.0 - Ana adres önizleme canlı güncelleme
import type { Address } from '../types/address.js';
import { updatePreview } from '../utils/address.js';

export const initMainAddressPreview = (): void => {
  const elDisplay = document.getElementById('mainAddressDisplay') as HTMLElement;
  const sokak = document.getElementById('mainAddr_sokak_manual') as HTMLInputElement;
  const cadde = document.getElementById('mainAddr_cadde') as HTMLInputElement;
  const kapi = document.getElementById('mainAddr_kapi') as HTMLInputElement;
  const daire = document.getElementById('mainAddr_daire') as HTMLInputElement;
  const ilce = document.getElementById('mainAddr_ilce') as HTMLSelectElement;
  const il = document.getElementById('mainAddr_il') as HTMLSelectElement;
  const postakodu = document.getElementById('mainAddr_postakodu') as HTMLInputElement;

  if (!elDisplay) return;

  const state: Partial<Address> = {};

  const pickTextOrValue = (sel: HTMLSelectElement | null): string => {
    if (!sel) return '';
    if (sel.options && typeof sel.selectedIndex === 'number') {
      return sel.options[sel.selectedIndex]?.text || sel.value || '';
    }
    return String(sel || '');
  };

  const apply = (): void => {
    state.sokak = sokak?.value?.trim() || '';
    state.cadde = cadde?.value?.trim() || '';
    state.kapiNo = kapi?.value?.trim() || '';
    state.daire = daire?.value?.trim() || '';
    state.ilce = pickTextOrValue(ilce);
    state.il = pickTextOrValue(il);
    state.postaKodu = postakodu?.value?.trim() || '';
    state.ulke = 'Türkiye';

    updatePreview(elDisplay, state);
    document.dispatchEvent(new CustomEvent('address:main:changed', { detail: state }));
  };

  [sokak, cadde, kapi, daire, postakodu].forEach(i => i?.addEventListener('input', apply));
  [ilce, il].forEach(i => i?.addEventListener('change', apply));
  apply(); // ilk çizim
};


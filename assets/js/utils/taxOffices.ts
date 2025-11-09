// Teklifbul Rule v1.0 - Vergi dairesi utilities
import type { TaxOffice } from '../types/taxOffice.js';
import { trNorm } from './stringNorm.js';

export const MANUAL_TOKEN = 'custom';

const guessScope = (name: string): 'district' | 'citywide' | 'nationwide' => {
  const n = trNorm(name);
  if (n.includes('büyük mükellef')) return 'nationwide';
  if (n.includes('kurumlar')) return 'citywide';
  return 'district';
};

export const normalizeOffices = (list: Array<string | TaxOffice>, city?: string): TaxOffice[] =>
  list.map((o) => {
    if (typeof o === 'string') return { name: o, city, scope: guessScope(o) };
    return { scope: o.scope ?? guessScope(o.name), ...o };
  });

export const splitByScope = (
  offices: TaxOffice[],
  params: { city?: string; district?: string }
): { districtList: TaxOffice[]; citywideList: TaxOffice[]; nationwideList: TaxOffice[] } => {
  const { city, district } = params;

  const inCity = offices.filter(o => !city || !o.city || trNorm(o.city) === trNorm(city));

  const districtList = district
    ? inCity.filter(o =>
        o.scope === 'district' &&
        (
          (o.district && trNorm(o.district) === trNorm(district)) ||
          trNorm(o.name).includes(trNorm(district))
        )
      )
    : [];

  const citywideList = inCity.filter(o => o.scope === 'citywide');
  const nationwideList = inCity.filter(o => o.scope === 'nationwide');

  return { districtList, citywideList, nationwideList };
};

export const renderTaxSelect = (
  selectEl: HTMLSelectElement,
  inputEl: HTMLInputElement,
  lists: { districtList: TaxOffice[]; citywideList: TaxOffice[]; nationwideList: TaxOffice[] },
  currentValue = ''
): void => {
  const makeOpt = (name: string): HTMLOptionElement => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    return opt;
  };

  selectEl.innerHTML = '';
  selectEl.appendChild(new Option('Vergi dairesi seçin', ''));
  selectEl.appendChild(new Option('Elle yaz', MANUAL_TOKEN));

  const addGroup = (label: string, arr: TaxOffice[]): void => {
    if (!arr?.length) return;
    const og = document.createElement('optgroup');
    og.label = label;
    arr.forEach(o => og.appendChild(makeOpt(o.name)));
    selectEl.appendChild(og);
  };

  addGroup('İlçene Uygun', lists.districtList);
  addGroup('İstanbul Genelinde Geçerli', lists.citywideList);
  addGroup('Özel/Kapsamlı', lists.nationwideList);

  if (currentValue) {
    const has = Array.from(selectEl.options).some(o => o.value === currentValue);
    if (has) selectEl.value = currentValue;
    inputEl.value = currentValue; // listede olmasa da seçim kaybolmasın
  }
};

export const bindTaxSelect = (selectEl: HTMLSelectElement, inputEl: HTMLInputElement): void => {
  selectEl.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const v = target.value;
    if (!v || v === MANUAL_TOKEN) {
      inputEl.removeAttribute('disabled');
      if (v === MANUAL_TOKEN) inputEl.value = '';
      inputEl.placeholder = 'Vergi dairesi adını elle yazın';
      inputEl.focus();
    } else {
      inputEl.value = v;
      inputEl.setAttribute('disabled', 'disabled');
      inputEl.placeholder = 'Seçilen vergi dairesi';
    }
  });
};


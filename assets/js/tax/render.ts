import { MANUAL_TOKEN } from './taxService';
import { TaxOffice } from '../types/taxOffice';

export function renderTaxSelect(
  selectEl: HTMLSelectElement,
  inputEl: HTMLInputElement,
  lists: { districtList: TaxOffice[]; citywideList: TaxOffice[]; nationwideList: TaxOffice[] },
  currentName = ''
) {
  const { districtList, citywideList, nationwideList } = lists;
  const makeOpt = (o: TaxOffice) => {
    const opt = document.createElement('option');
    opt.value = o.id;       // ID değerini taşı!
    opt.textContent = o.name;
    return opt;
  };

  selectEl.innerHTML = '';
  selectEl.appendChild(new Option('Vergi dairesi seçin', ''));
  selectEl.appendChild(new Option('Elle yaz', MANUAL_TOKEN));

  const addGroup = (label: string, arr: TaxOffice[]) => {
    if (!arr?.length) return;
    const og = document.createElement('optgroup');
    og.label = label;
    arr.forEach(o => og.appendChild(makeOpt(o)));
    selectEl.appendChild(og);
  };

  addGroup('İlçene Uygun', districtList);
  addGroup('İl Genelinde Geçerli', citywideList);
  addGroup('Özel/Kapsamlı', nationwideList);

  // Önceki seçimi KORU: listede olmasa bile metin input'ta sakla
  if (currentName) inputEl.value = currentName;
}


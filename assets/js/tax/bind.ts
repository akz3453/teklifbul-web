import { MANUAL_TOKEN } from './taxService';

export function bindTaxSelect(
  selectEl: HTMLSelectElement,
  inputEl: HTMLInputElement,
  idToName: (id: string) => string | undefined
) {
  selectEl.addEventListener('change', (e: any) => {
    const v = e.target.value as string;
    if (!v || v === MANUAL_TOKEN) {
      inputEl.removeAttribute('disabled');
      if (v === MANUAL_TOKEN) inputEl.value = '';
      inputEl.placeholder = 'Vergi dairesi adını elle yazın';
      inputEl.focus();
    } else {
      const name = idToName(v) || '';
      inputEl.value = name;
      inputEl.setAttribute('disabled', 'disabled');
      inputEl.placeholder = 'Seçilen vergi dairesi';
    }
  });
}


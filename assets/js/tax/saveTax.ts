import { MANUAL_TOKEN } from './taxService';

export function readTaxSelection(sel: HTMLSelectElement, input: HTMLInputElement) {
  const id   = sel.value && sel.value !== MANUAL_TOKEN ? sel.value : null;
  const name = (input.value || '').trim();
  return { taxOfficeId: id, taxOfficeName: name };
}


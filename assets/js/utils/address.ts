// Teklifbul Rule v1.0 - Adres compose ve preview utilities
import type { Address } from '../types/address.js';
import { trNorm } from './stringNorm.js';

export const composeAddress = (a: Partial<Address>): string => {
  const parts = [
    a.sokak && (/(sokak|cadde)$/i.test(a.sokak) ? a.sokak : `${a.sokak} Sokak`),
    a.cadde && (/(cadde)$/i.test(a.cadde) ? a.cadde : `${a.cadde} Cadde`),
    a.kapiNo && `Kapı No: ${a.kapiNo}`,
    a.daire && `Daire: ${a.daire}`,
    a.ilce,
    a.il,
    a.postaKodu && a.postaKodu,
    a.ulke || 'Türkiye',
  ].filter(Boolean) as string[];

  return parts.join(' - ');
};

export const updatePreview = (displayEl: HTMLElement | null, addr: Partial<Address>): void => {
  if (!displayEl) return;
  displayEl.textContent = composeAddress(addr);
};


/**
 * Manual Theme Toggle System - Sağlam Sürüm
 * Allows users to manually switch between light and dark themes
 * with persistent storage across pages
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';

document.addEventListener('DOMContentLoaded', function () {
  const STORAGE_KEY = 'tb_theme'; // 'dark' | 'light' | null
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');

  function apply(mode) {
    root.classList.toggle('force-dark', mode === 'dark');
    if (btn) btn.textContent = mode === 'dark' ? '☀️ Açık' : '🌙 Koyu';
  }

  function preferred() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  let mode = preferred();
  apply(mode);

  if (btn) {
    btn.addEventListener('click', () => {
      mode = root.classList.contains('force-dark') ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, mode);
      apply(mode);
    });
  }

  // Kullanıcı manuel seçim yapmadıysa, sistem teması değişince senkronize et
  const mql = matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener?.('change', e => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      apply(e.matches ? 'dark' : 'light');
    }
  });

  logger.info('Theme system initialized', { mode });
});

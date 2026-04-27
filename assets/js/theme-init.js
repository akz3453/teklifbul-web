/**
 * Teklifbul Rule v1.0 - Tema standardı: tb_theme key, FOUC önleme
 * Bu script sayfa render edilmeden önce çalışmalı (head içinde)
 */
(function() {
  const STORAGE_KEY = 'tb_theme';
  const root = document.documentElement;
  const saved = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldBeDark = saved === 'dark' || (!saved && prefersDark);
  if (shouldBeDark) {
    root.classList.add('force-dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('force-dark');
    root.removeAttribute('data-theme');
  }
})();

/**
 * Teklifbul Common Layout
 * Handles shared header/footer functionality
 */

import { setLanguage, t } from './i18n.js';
import { logger } from '../../src/shared/log/logger.js';
import { openCookieSettings } from './cookieConsent.js';

/**
 * Initialize header functionality
 */
function initHeader() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  
  // Hamburger menu toggle
  // Teklifbul Rule v1.0 - Touch event desteği eklendi (mobil uyumluluk)
  if (hamburger && mobileMenu) {
    // Click ve touch event'leri için handler
    const toggleMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = mobileMenu.classList.contains('open');
      mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('active');
      // Teklifbul Rule v1.0 - Debug log (geliştirme için)
      logger.info('Hamburger menu toggled', { state: !isOpen ? 'opened' : 'closed' });
    };
    
    // Click event (desktop ve mobil)
    hamburger.addEventListener('click', toggleMenu, { passive: false });
    
    // Touch event (mobil - click'ten önce tetiklenir)
    hamburger.addEventListener('touchstart', (e) => {
      // Touch başladığında prevent default yapma, sadece işaretle
      hamburger.dataset.touching = 'true';
    }, { passive: true });
    
    hamburger.addEventListener('touchend', (e) => {
      // Eğer touch event varsa, click event'ini engelle
      if (hamburger.dataset.touching === 'true') {
        e.preventDefault();
        e.stopPropagation();
        toggleMenu(e);
        hamburger.dataset.touching = 'false';
      }
    }, { passive: false });
    
    // Close mobile menu when clicking outside
    // Teklifbul Rule v1.0 - Hamburger butonuna tıklamayı engellememeli
    const closeMenuOnOutsideClick = (e) => {
      // Hamburger butonuna veya içindeki span'lara tıklanmışsa, kapatma
      if (hamburger.contains(e.target) || hamburger === e.target) {
        return;
      }
      // Mobile menu içine tıklanmışsa, kapatma
      if (mobileMenu.contains(e.target)) {
        return;
      }
      // Dışarıya tıklanmışsa, menüyü kapat
      if (mobileMenu.classList.contains('open')) {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('active');
      }
    };
    
    // Event listener'ları ekle (capture phase'de değil, bubble phase'de)
    document.addEventListener('click', closeMenuOnOutsideClick, false);
    document.addEventListener('touchend', closeMenuOnOutsideClick, false);
    
    // Mobile menu link'lerine tıklandığında menüyü kapat
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('active');
      });
    });
  } else {
    // Teklifbul Rule v1.0 - Debug: Elementler bulunamadı
    logger.warn('Hamburger menu elements not found', { hamburger, mobileMenu });
  }
  
  // Language switch - use event delegation to handle dynamically added buttons
  document.addEventListener('click', (e) => {
    if (e.target.matches('.lang-switch button[data-lang]')) {
      e.preventDefault();
      e.stopPropagation();
      const lang = e.target.dataset.lang;
      if (lang) {
        logger.info('Language switch clicked', { lang });
        setLanguage(lang);
      }
    }
  });
  
  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const headerHeight = document.querySelector('.site-header')?.offsetHeight || 80;
        const targetPosition = target.offsetTop - headerHeight;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
        
        // Close mobile menu if open
        if (mobileMenu) {
          mobileMenu.classList.remove('open');
          hamburger?.classList.remove('active');
        }
      }
    });
  });
}

/**
 * Initialize footer functionality
 */
function initFooter() {
  const footerBottom = document.querySelector('.footer-bottom') || document.querySelector('.site-footer');
  if (!footerBottom) return;
  if (document.getElementById('footer-cookie-settings-btn')) return;

  const cookieBtn = document.createElement('button');
  cookieBtn.id = 'footer-cookie-settings-btn';
  cookieBtn.type = 'button';
  cookieBtn.className = 'btn btn-outline btn-sm';
  cookieBtn.textContent = 'Cerez Ayarlari';
  cookieBtn.setAttribute('aria-label', 'Cerez ayarlarini ac');
  cookieBtn.setAttribute('title', 'Cerez ayarlarini ac');

  cookieBtn.addEventListener('click', () => {
    openCookieSettings();
  });

  footerBottom.appendChild(cookieBtn);
}

/**
 * Initialize common layout
 */
export function initCommonLayout() {
  initHeader();
  initFooter();
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCommonLayout);
} else {
  initCommonLayout();
}

// Listen for i18n updates
document.addEventListener('i18n-update', () => {
  // Re-apply translations if needed
  const event = new CustomEvent('i18n-apply');
  document.dispatchEvent(event);
});


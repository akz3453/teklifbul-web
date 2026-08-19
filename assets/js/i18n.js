/**
 * Nefisoft i18n System
 * Multi-language support for TR and EN
 */

import { logger } from '../../src/shared/log/logger.js';

const translations = {
  tr: {
    // Navigation
    'nav.sts': 'Nefisoft ve STS NEDİR',
    'nav.features': 'Özellikler',
    'nav.why': 'Neden NEFISOFT',
    'nav.premium': 'Premium Üyelik',
    'nav.forum': 'Forum',
    'nav.references': 'Referanslar',
    'nav.contact': 'İletişim',

    // Buttons
    'btn.tryFree': 'Ücretsiz Dene',
    'btn.login': 'Giriş Yap',
    'btn.seeFeatures': 'Özellikleri Gör',
    'btn.getPremium': 'Premium teklif al',

    // Hero
    'hero.title': 'Nefisoft ile tedarik, teklif ve stok yönetimi tek ekranda.',
    'hero.subtitle': 'İnşaat ve peyzaj sektörüne özel; tedarikçileri, alıcıları ve stokları tek platformda buluşturun (Teklifbul modülü dahil).',
    'hero.feature1': 'Çoklu firma ve çoklu depo desteği',
    'hero.feature2': 'Tedarikçilerden teklif toplama ve akıllı karşılaştırma',
    'hero.feature3': 'Onay akışları ve dokümantasyon yönetimi',
    'hero.feature4': 'Yapay zekâ destekli satın alma analizleri',

    // Features
    'features.title': 'Nefisoft ile neler yapabilirsiniz?',
    'features.subtitle': 'Tedarik, teklif (Teklifbul), satış ve stok süreçlerinizi uçtan uca yönetin.',
    'feature1.title': 'Tedarik ve teklif yönetimi',
    'feature1.desc': 'Talep oluşturun, tedarikçilerden teklif toplayın ve tek ekranda karşılaştırın.',
    'feature2.title': 'Stok ve depo takibi',
    'feature2.desc': 'Çoklu depo, minimum stok, kritik stok seviyelerini anlık izleyin.',
    'feature3.title': 'Kullanıcı ve rol yönetimi',
    'feature3.desc': 'Satın almacı, yönetici, depo sorumlusu gibi rolleri ayrı yetkilendirin.',
    'feature4.title': 'Hızlı iş akışları',
    'feature4.desc': 'Onay akışları, hatırlatmalar ve bildirimlerle süreci hızlandırın.',
    'feature5.title': 'Raporlama ve analiz',
    'feature5.desc': 'Maliyet, tedarikçi performansı ve stok hareketlerini analiz edin.',
    'feature6.title': 'Yapay zekâ satın alma asistanı',
    'feature6.desc': 'Teklifleri ve stok verilerini analiz ederek karar desteği sağlayan akıllı asistan.',

    // Link Payment
    'linkPayment.title': 'Tek linkle teklif ve ödeme',
    'linkPayment.subtitle': 'Teklif onayı ve tahsilat sürecini tek bir linke sığdırın.',
    'linkPayment.feature1': 'Tedarikçi veya alıcıya SMS / e-posta ile link gönderin.',
    'linkPayment.feature2': 'Teklif onayı ve ödeme aynı ekranda gerçekleşsin.',
    'linkPayment.feature3': 'Farklı ödeme yöntemleri ve para birimleri ile çalışmaya hazır altyapı.',
    'linkPayment.feature4': 'Geciken tahsilatları azaltın, nakit akışınızı hızlandırın.',

    // Premium
    'premium.title': 'Premium Hesap',
    'premium.subtitle': 'Büyüyen işletmeler için gelişmiş teklif ve stok yönetimi.',
    'premium.standard_title': 'Standart',
    'premium.standard_price': 'Ücretsiz',
    'premium.standard_desc1': 'Sınırlı özellikler',
    'premium.standard_desc2': 'Temel teklif yönetimi',
    'premium.standard_desc3': 'Standart destek',
    'premium.premium_title': 'Premium',
    'premium.monthly': 'Aylık: 400 TL + KDV',
    'premium.yearly': 'Yıllık: 4.400 TL + KDV (avantajlı fiyat)',
    'premium.benefit1': 'Sınırsız teklif, sipariş ve stok kaydı',
    'premium.benefit2': 'Sınırsız depo ve ürün',
    'premium.benefit3': 'Gelişmiş rapor ve panolar',
    'premium.benefit4': 'Çoklu kullanıcı ve rol bazlı yetki yönetimi',
    'premium.benefit5': 'Yapay zekâ destekli satın alma asistanı',
    'premium.benefit6': 'Öncelikli destek ve eğitim',

    // References
    'references.title': 'Referanslarımız',
    'references.subtitle': 'Bize güvenen işletmeler',

    // Forum Teaser
    'forumTeaser.title': 'Forum',
    'forumTeaser.text': 'Kullanıcılarımız tedarik, stok yönetimi ve bölgesel konularda konu açabilir, tecrübelerini paylaşabilir ve sorular sorabilir.',

    // AI Section
    'aiSection.title': 'Yapay zekâ satın alma asistanınız',
    'aiSection.subtitle': 'Nefisoft, teklif ve stok verilerinizi analiz ederek size karar desteği sağlar.',
    'aiSection.point1': 'Teklifleri otomatik kıyaslar, en avantajlı tedarikçiyi öne çıkarır.',
    'aiSection.point2': 'Minimum stok seviyelerinize göre sizi önceden uyarır.',
    'aiSection.point3': 'Geçmiş alışlarınızı inceleyerek tasarruf fırsatlarını önerir.',

    // Footer
    'footer.address': 'Çengeldere Mahallesi Çavuşbaşı Cumhuriyet Caddesi No:186, Beykoz / İstanbul',
    'footer.email': 'akyildizfaruk@gmail.com',
    'footer.phone': '0532 345 92 53',
    'footer.downloadApp': 'Mobil uygulama',
    'footer.downloadGoogle': 'Google Play — Yakında',
    'footer.downloadApple': 'App Store — Yakında',
    'footer.legal': 'Hukuki metinler',

    // Cookie Banner
    'cookie.text': 'Sitemizde deneyiminizi iyileştirmek ve hizmetlerimizi geliştirmek için çerezler kullanıyoruz. Tercihlerinizi aşağıdan yönetebilirsiniz.',
    'cookie.accept': 'Kabul Et',
    'cookie.reject': 'Reddet',
    'cookie.settings': 'Ayarlar',
    'cookie.preferences': 'Çerez Tercihleri',
    'cookie.preferences.desc': 'Hangi çerezlerin kullanılacağını seçebilirsiniz.',
    'cookie.necessary': 'Zorunlu',
    'cookie.necessary.desc': 'Sitenin çalışması için gereklidir.',
    'cookie.functional': 'İşlevsel',
    'cookie.functional.desc': 'Dil gibi tercihlerinizi hatırlar.',
    'cookie.analytics': 'Analiz',
    'cookie.analytics.desc': 'Sitenin nasıl kullanıldığını analiz etmemizi sağlar.',
    'cookie.marketing': 'Pazarlama',
    'cookie.marketing.desc': 'Size özel kampanyalar sunmamızı sağlar.',
    'cookie.save': 'Tercihleri Kaydet',

    // Chat
    'chat.title': 'Nefisoft Asistanı',
    'chat.placeholder': 'Mesajınızı yazın...',
    'chat.send': 'Gönder',
    'chat.welcome': 'Merhaba, Nefisoft yapay zekâ asistanıyım. Talep, teklif (Teklifbul), satış veya stokla ilgili nasıl yardımcı olabilirim?',
    'chat.response': '', // Artık kullanılmıyor - backend'den geliyor

    // Login
    'login.title': 'Giriş Yap',
    'login.subtitle': 'Hesabınıza giriş yaparak devam edin',
    'login.email': 'E-posta',
    'login.password': 'Şifre',
    'login.remember': 'Beni hatırla',
    'login.forgot': 'Şifremi Unuttum',
    'login.resendVerification': 'Mail gelmedi mi? Tekrar gönder',
    'login.google': 'Google ile Giriş',
    'login.noAccount': 'Hesabın yok mu?',
    'login.signup': 'Hesap oluştur',

    // Signup
    'signup.title': 'Ücretsiz Dene',
    'signup.subtitle': 'Hesabınızı oluşturun ve Nefisoft\'u keşfedin',
    'signup.company': 'Şirket Adı',
    'signup.name': 'İsim Soyisim',
    'signup.email': 'E-posta',
    'signup.phone': 'Telefon',
    'signup.password': 'Şifre',
    'signup.passwordConfirm': 'Şifre Tekrar',
    'signup.kvkk': 'KVKK ve Gizlilik Politikasını okudum, kabul ediyorum.',
    'signup.submit': 'Ücretsiz dene / Kayıt ol',
    'signup.hasAccount': 'Zaten hesabın var mı?',
    'signup.login': 'Giriş yap',

    // Contact
    'contact.title': 'İletişim',
    'contact.subtitle': 'Bizimle iletişime geçin',
    'contact.name': 'İsim Soyisim',
    'contact.company': 'Şirket Adı',
    'contact.email': 'E-posta',
    'contact.phone': 'Telefon',
    'contact.message': 'Mesaj / Talep',
    'contact.submit': 'Gönder',
    'contact.success': 'Mesajınız başarıyla gönderildi! En kısa sürede size dönüş yapacağız.',

    // Forum
    'forum.title': 'Forum',
    'forum.subtitle': 'Tecrübelerinizi paylaşın, sorularınızı sorun',
    'forum.categories': 'Kategoriler',
    'forum.regions': 'Bölgeler',
    'forum.trade': 'Ticaret',
    'forum.tech': 'Teknoloji',
    'forum.games': 'Oyun',
    'forum.politics': 'Siyaset',
    'forum.sports': 'Spor',
    'forum.news': 'Haber',
    'forum.newTopic': 'Yeni konu aç',
    'forum.topicTitle': 'Başlık',
    'forum.topicCategory': 'Kategori seçimi',
    'forum.topicContent': 'Mesaj içeriği',
    'forum.topicNote': 'Kullanıcılar yeni konu açabilir ancak konular yönetici onayı sonrası yayımlanacaktır.',

    // Legal
    'legal.draft': 'Bu metin taslak olup, şirket kurulumu sonrası güncellenecektir.'
  },

  en: {
    // Navigation
    'nav.sts': 'What is Nefisoft and STS',
    'nav.premium': 'Premium Membership',
    'nav.forum': 'Forum',
    'nav.references': 'References',
    'nav.contact': 'Contact',

    // Buttons
    'btn.tryFree': 'Start Free Trial',
    'btn.login': 'Log In',
    'btn.seeFeatures': 'See Features',
    'btn.getPremium': 'Get Premium Offer',

    // Hero
    'hero.title': 'Manage procurement, quotations and inventory from a single screen.',
    'hero.subtitle': 'Designed for construction and landscaping: connect suppliers, buyers and inventory on one platform (including Teklifbul module).',
    'hero.feature1': 'Multi-company and multi-warehouse support',
    'hero.feature2': 'Collect and intelligently compare supplier quotations',
    'hero.feature3': 'Approval workflows and documentation management',
    'hero.feature4': 'AI-powered purchasing and cost analysis',

    // Features
    'features.title': 'What can you do with Nefisoft?',
    'features.subtitle': 'Manage your procurement (Teklifbul), quotations, sales and stock processes end-to-end.',
    'feature1.title': 'Procurement and quotation management',
    'feature1.desc': 'Create requests, collect quotations and compare them on a single screen.',
    'feature2.title': 'Inventory and warehouse tracking',
    'feature2.desc': 'Monitor multi-warehouse stock, minimum and critical levels in real time.',
    'feature3.title': 'User and role management',
    'feature3.desc': 'Define roles such as purchaser, manager and warehouse officer.',
    'feature4.title': 'Fast workflows',
    'feature4.desc': 'Speed up the process with approvals, reminders and notifications.',
    'feature5.title': 'Reporting and analytics',
    'feature5.desc': 'Analyze costs, supplier performance and stock movements.',
    'feature6.title': 'AI purchasing assistant',
    'feature6.desc': 'An intelligent assistant that analyzes quotations and stock data for decision support.',

    // Link Payment
    'linkPayment.title': 'One link for quotation and payment',
    'linkPayment.subtitle': 'Combine quotation approval and payment in a single link.',
    'linkPayment.feature1': 'Send the link to suppliers or customers via SMS or e-mail.',
    'linkPayment.feature2': 'Approval and payment happen on the same screen.',
    'linkPayment.feature3': 'Ready for multiple payment methods and currencies.',
    'linkPayment.feature4': 'Reduce late collections and accelerate your cash flow.',

    // Premium
    'premium.title': 'Premium Account',
    'premium.subtitle': 'Advanced quotation and inventory management for growing businesses.',
    'premium.standard_title': 'Standard',
    'premium.standard_price': 'Free',
    'premium.standard_desc1': 'Limited features',
    'premium.standard_desc2': 'Basic quotation management',
    'premium.standard_desc3': 'Standard support',
    'premium.premium_title': 'Premium',
    'premium.monthly': 'Monthly: 400 TL + VAT',
    'premium.yearly': 'Yearly: 4,400 TL + VAT (discounted)',
    'premium.benefit1': 'Unlimited quotations, orders and stock records',
    'premium.benefit2': 'Unlimited warehouses and items',
    'premium.benefit3': 'Advanced reports and dashboards',
    'premium.benefit4': 'Multi-user and role-based access control',
    'premium.benefit5': 'AI-powered purchasing assistant',
    'premium.benefit6': 'Priority support and onboarding',

    // References
    'references.title': 'Our References',
    'references.subtitle': 'Businesses that trust us',

    // Forum Teaser
    'forumTeaser.title': 'Forum',
    'forumTeaser.text': 'Our users can open topics about procurement, stock management and regional issues, share their experience and ask questions.',

    // AI Section
    'aiSection.title': 'Your AI purchasing assistant',
    'aiSection.subtitle': 'Nefisoft analyzes your quotations and inventory data to support your decisions.',
    'aiSection.point1': 'Automatically compares quotations and highlights the best suppliers.',
    'aiSection.point2': 'Warns you in advance based on minimum stock levels.',
    'aiSection.point3': 'Analyzes past purchases to suggest savings opportunities.',

    // Footer
    'footer.address': 'Çengeldere Mahallesi Çavuşbaşı Cumhuriyet Caddesi No:186, Beykoz / İstanbul',
    'footer.email': 'akyildizfaruk@gmail.com',
    'footer.phone': '0532 345 92 53',
    'footer.downloadApp': 'Mobile app',
    'footer.downloadGoogle': 'Google Play — Coming soon',
    'footer.downloadApple': 'App Store — Coming soon',
    'footer.legal': 'Legal Documents',

    // Cookie Banner
    'cookie.text': 'We use cookies to improve your experience and our services. You can manage your preferences below.',
    'cookie.accept': 'Accept',
    'cookie.reject': 'Reject',
    'cookie.settings': 'Settings',
    'cookie.preferences': 'Cookie Preferences',
    'cookie.preferences.desc': 'You can choose which cookies to use.',
    'cookie.necessary': 'Necessary',
    'cookie.necessary.desc': 'Required for the site to function.',
    'cookie.functional': 'Functional',
    'cookie.functional.desc': 'Remembers choices like language.',
    'cookie.analytics': 'Analytics',
    'cookie.analytics.desc': 'Helps us analyze how the site is used.',
    'cookie.marketing': 'Marketing',
    'cookie.marketing.desc': 'Allows us to offer you personalized campaigns.',
    'cookie.save': 'Save Preferences',

    // Chat
    'chat.title': 'Nefisoft Assistant',
    'chat.placeholder': 'Type your message...',
    'chat.send': 'Send',
    'chat.welcome': 'Hello! I am your Nefisoft AI assistant. How can I help you with procurement, quotations (Teklifbul), sales or inventory?',
    'chat.response': '', // No longer used - comes from backend

    // Login
    'login.title': 'Login',
    'login.subtitle': 'Continue by logging into your account',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.remember': 'Remember me',
    'login.forgot': 'Forgot Password',
    'login.resendVerification': 'Didn’t get the email? Send again',
    'login.google': 'Login with Google',
    'login.noAccount': "Don't have an account?",
    'login.signup': 'Sign up',

    // Signup
    'signup.title': 'Try Free',
    'signup.subtitle': 'Create your account and discover Nefisoft',
    'signup.company': 'Company Name',
    'signup.name': 'Full Name',
    'signup.email': 'Email',
    'signup.phone': 'Phone',
    'signup.password': 'Password',
    'signup.passwordConfirm': 'Confirm Password',
    'signup.kvkk': 'I have read and accept the KVKK and Privacy Policy.',
    'signup.submit': 'Try Free / Sign Up',
    'signup.hasAccount': 'Already have an account?',
    'signup.login': 'Login',

    // Contact
    'contact.title': 'Contact',
    'contact.subtitle': 'Get in touch with us',
    'contact.name': 'Full Name',
    'contact.company': 'Company Name',
    'contact.email': 'Email',
    'contact.phone': 'Phone',
    'contact.message': 'Message / Request',
    'contact.submit': 'Send',
    'contact.success': 'Your message has been sent successfully! We will get back to you as soon as possible.',

    // Forum
    'forum.title': 'Forum',
    'forum.subtitle': 'Share your experiences, ask your questions',
    'forum.categories': 'Categories',
    'forum.regions': 'Regions',
    'forum.trade': 'Trade',
    'forum.tech': 'Technology',
    'forum.games': 'Games',
    'forum.politics': 'Politics',
    'forum.sports': 'Sports',
    'forum.news': 'News',
    'forum.newTopic': 'Create New Topic',
    'forum.topicTitle': 'Title',
    'forum.topicCategory': 'Select Category',
    'forum.topicContent': 'Message Content',
    'forum.topicNote': 'Users can create new topics, but topics will be published after admin approval.',

    // Legal
    'legal.draft': 'This text is a draft and will be updated after company establishment.'
  }
};

let currentLang = 'tr';
const missingKeys = new Set(); // Track missing keys to avoid duplicate warnings

/**
 * Get translation for a key
 * @param {string} key - Translation key (e.g., 'nav.features' or 'nav.sts')
 * @returns {string} Translated text or empty string if not found
 */
export function t(key) {
  if (!key) return '';

  // First, try direct flat key lookup (e.g., 'nav.sts')
  const currentLangTranslations = translations[currentLang];
  if (currentLangTranslations && currentLangTranslations[key] !== undefined) {
    return currentLangTranslations[key];
  }

  // If not found and not Turkish, try Turkish as fallback
  if (currentLang !== 'tr' && translations.tr && translations.tr[key] !== undefined) {
    return translations.tr[key];
  }

  // If still not found, try nested structure (for backward compatibility)
  const keys = key.split('.');
  let value = currentLangTranslations;

  for (const k of keys) {
    if (value && typeof value === 'object' && value[k] !== undefined) {
      value = value[k];
    } else {
      // Try Turkish fallback with nested structure
      if (currentLang !== 'tr') {
        let fallbackValue = translations.tr;
        for (const fk of keys) {
          if (fallbackValue && typeof fallbackValue === 'object' && fallbackValue[fk] !== undefined) {
            fallbackValue = fallbackValue[fk];
          } else {
            // Only warn once per missing key to reduce console noise (development only)
            if (!missingKeys.has(key) && import.meta.env.DEV) {
              missingKeys.add(key);
              logger.warn(`Translation missing for key: ${key}`);
            }
            return ''; // Return empty string instead of key
          }
        }
        return fallbackValue || '';
      }
      // Only warn once per missing key to reduce console noise (development only)
      if (!missingKeys.has(key) && import.meta.env.DEV) {
        missingKeys.add(key);
        logger.warn(`Translation missing for key: ${key}`);
      }
      return ''; // Return empty string instead of key
    }
  }

  return value || '';
}

/**
 * Apply translations to all elements with data-i18n attribute
 */
function applyTranslations() {
  const elements = document.querySelectorAll('[data-i18n]');
  // Teklifbul Rule v1.0 - Log seviyesini azalt (sadece development modunda veya ilk yüklemede)
  if (import.meta.env.DEV && elements.length > 0) {
    logger.info(`Applying translations to ${elements.length} elements`);
  }

  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (!key) return;

    const translation = t(key);

    // Never show the key to the user
    if (!translation) {
      // Sadece gerçekten eksik çeviriler için uyarı göster (development only)
      if (!missingKeys.has(key) && import.meta.env.DEV) {
        missingKeys.add(key);
        logger.warn(`No translation found for key: ${key}`);
      }
      // Leave element empty or use fallback
      return;
    }

    if (element.tagName === 'INPUT' && element.type === 'submit') {
      element.value = translation;
    } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.placeholder = translation;
    } else {
      // Use textContent to avoid XSS, but preserve HTML structure if needed
      element.textContent = translation;
    }
  });

  // Teklifbul Rule v1.0 - Sadece development modunda detaylı log
  if (import.meta.env.DEV && elements.length > 0) {
    logger.info(`Translations applied (language: ${currentLang})`);
  }
}

/**
 * Initialize i18n system
 * @param {string} defaultLang - Default language ('tr' or 'en')
 */
export function initI18n(defaultLang = 'tr') {
  const savedLang = localStorage.getItem('lang');
  currentLang = savedLang || defaultLang;

  // Set HTML lang attribute
  document.documentElement.lang = currentLang;

  // Apply translations
  applyTranslations();

  // Update language switch buttons
  updateLanguageButtons();
}

/**
 * Update language switch button states
 */
function updateLanguageButtons() {
  document.querySelectorAll('.lang-switch button').forEach(btn => {
    if (btn.dataset.lang === currentLang) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Set language and apply translations
 * @param {string} lang - Language code ('tr' or 'en')
 */
export function setLanguage(lang) {
  if (!translations[lang]) {
    logger.warn('Language not found', { lang });
    return;
  }

  // Teklifbul Rule v1.0 - Sadece development modunda log
  if (import.meta.env.DEV) {
    logger.info('Setting language', { lang });
  }
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;

  // Apply translations immediately
  applyTranslations();

  // Update language switch buttons
  updateLanguageButtons();

  // Dispatch custom event for other modules that might need to react
  document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initI18n('tr'));
} else {
  initI18n('tr');
}

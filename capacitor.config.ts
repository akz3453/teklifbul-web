// Teklifbul Rule v1.0 — Capacitor native app config (Google Play / App Store)
// Mimari kararı (Faz 4): canlı Hosting URL WebView'da açılır (NATIVE_SHELL_MODE=live-url).
// dist yalnızca offline fallback + native asset; iş mantığı firebase hosting deploy ile güncellenir.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nefisoft.app',
  appName: 'NEFISOFT',
  webDir: 'dist',
  // Canlı siteyi WebView içinde açar: web deploy sonrası mağaza güncellemesi gerekmez.
  // Mağaza incelemesi için splash + native plugin'ler (push, status bar) zorunlu.
  server: {
    // Teklifbul Rule v1.0 — Native ilk ekran: giriş (web marketing / kalır)
    url: 'https://teklifbul.web.app/login.html?n=20260815',
    cleartext: false,
    allowNavigation: [
      'teklifbul.web.app',
      'www.teklifbul.web.app',
      'teklifbul.firebaseapp.com',
      'nefisoft.com',
      'www.nefisoft.com',
      'nefisoft.com.tr',
      'www.nefisoft.com.tr',
      'accounts.google.com',
      'accounts.youtube.com',
      'www.googleapis.com',
      'apis.google.com',
      'oauth2.googleapis.com',
      'www.gstatic.com',
      'ssl.gstatic.com',
      'fonts.gstatic.com',
      'www.recaptcha.net',
      'www.google.com',
      'nominatim.openstreetmap.org',
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#ffffff',
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#ffffff',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#2563EB',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

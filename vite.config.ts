// Teklifbul Rule v1.0
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nefisoftSeoPlugin } from './src/seo/vite-plugin-seo'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const THEME_INIT_CACHE_BUST = 'v20260815'

/** HTML'de doğrudan <script src="/assets/js/..."> ile referans verilen, bundle dışı dosyalar */
function copyRawAssetsJs() {
  return {
    name: 'copy-raw-assets-js',
    transformIndexHtml(html) {
      return html.replaceAll(
        '/assets/js/theme-init.js',
        `/assets/js/theme-init.${THEME_INIT_CACHE_BUST}.js`
      )
    },
    closeBundle() {
      const distRoot = path.join(projectRoot, 'dist')
      const copies = [
        ['assets/js/theme-init.js', 'assets/js/theme-init.js'],
        ['assets/js/theme-init.js', `assets/js/theme-init.${THEME_INIT_CACHE_BUST}.js`],
        ['assets/css/main.css', 'assets/css/main.css'],
        ['assets/css/layout.css', 'assets/css/layout.css'],
        ['utils.css', 'utils.css'],
        ['utils.css', 'assets/css/utils.css'],
        ['css/ui-standard.css', 'css/ui-standard.css'],
        ['public/css/ui-standard.css', 'css/ui-standard.css'],
      ]
      const cssDir = path.join(projectRoot, 'assets/css')
      if (fs.existsSync(cssDir)) {
        for (const name of fs.readdirSync(cssDir)) {
          if (!name.endsWith('.css')) continue
          copies.push([`assets/css/${name}`, `assets/css/${name}`])
        }
      }
      const seen = new Set()
      for (const [srcRel, destRel] of copies) {
        if (seen.has(destRel)) continue
        seen.add(destRel)
        const src = path.join(projectRoot, srcRel)
        if (!fs.existsSync(src)) continue
        const dest = path.join(distRoot, destRel)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(src, dest)
      }
    }
  }
}

// https://vite.dev/config/
function collectLegalHtmlInputs(): Record<string, string> {
  const legalDir = path.join(projectRoot, 'legal')
  if (!fs.existsSync(legalDir)) return {}
  const input: Record<string, string> = {}
  for (const fileName of fs.readdirSync(legalDir)) {
    if (!fileName.endsWith('.html')) continue
    input[`legal-${fileName.replace(/\.html$/, '')}`] = path.join('legal', fileName)
  }
  return input
}

export default defineConfig({
  plugins: [copyRawAssetsJs(), nefisoftSeoPlugin(projectRoot)],
  // No React plugin - this is a vanilla HTML/JS project
  // Vite has built-in HTML support, no plugin needed
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false, // Production'da sourcemap kapalı (performans)
    minify: 'esbuild', // Daha hızlı minify
    chunkSizeWarningLimit: 500, // Chunk boyutu uyarısı limiti (1000'den 500'e düşürüldü)
    rollupOptions: {
      // Teklifbul Rule v1.0 - Test/debug dosyalarını prod build'den hariç tut
      // Exclude Sentry node packages from browser build
      external: (id) => {
        if (id.includes('@sentry/node') || id.includes('@sentry/node-core')) {
          return true;
        }
        return false;
      },
      output: {
        // Optimized manual chunks — yalnızca kök firebase.js; 'firebase' substring TDZ döngüsü yaratır
        manualChunks: (id) => {
          const normalized = String(id).replace(/\\/g, '/');
          if (normalized.endsWith('/firebase.js')) {
            return 'app-firebase';
          }
          if (id.includes('node_modules')) {
            if (id.includes('dompurify')) return 'vendor-ui';
            if (id.includes('date-fns') || id.includes('dayjs')) return 'vendor-utils';
          }
          if (id.includes('/src/shared/')) return 'shared-core';
          if (id.includes('category') || id.includes('categories')) return 'shared-categories';
        }
      },
      input: {
        main: 'index.html',
        login: 'login.html',
        dashboard: 'dashboard.html',
        settings: 'settings.html',
        demands: 'demands.html',
        'demand-detail': 'demand-detail.html',
        'demand-new': 'demand-new.html',
        'internal-demands': 'internal-demands.html',
        'internal-demand-new': 'internal-demand-new.html',
        'internal-demand-detail': 'internal-demand-detail.html',
        'company-profile': 'company-profile.html',
        'role-select': 'role-select.html',
        'bids': 'bids.html',
        'bid-detail': 'bid-detail.html',
        'bid-upload': 'bid-upload.html',
        'bids-incoming': 'bids-incoming.html',
        'bids-outgoing': 'bids-outgoing.html',
        'main-demands': 'main-demands.html',
        'revision-request': 'revision-request.html',
        'register-buyer': 'register-buyer.html',
        'signup': 'signup.html',
        'company-invite': 'company-invite.html',
        'company-join': 'company-join.html',
        'company-join-waiting': 'company-join-waiting.html',
        'role-permissions-management': 'role-permissions-management.html',
        'inventory-index': 'inventory-index.html',
        'interim-payments': 'interim-payments.html',
        'interim-payment-edit': 'interim-payment-edit.html',
        'interim-payment-suggestions': 'interim-payment-suggestions.html',
        'forum': 'forum.html',
        'contact': 'contact.html',
        ...collectLegalHtmlInputs(),
        // Inventory pages
        'purchase-form': 'pages/purchase-form.html',
        'stock-movements': 'pages/stock-movements.html',
        'purchase-form-detail': 'pages/purchase-form-detail.html',
        'price-update': 'pages/price-update.html',
        'stock-import': 'pages/stock-import.html',
        'invoice-import': 'pages/invoice-import.html',
        'request-site': 'pages/request-site.html',
        'reports': 'pages/reports.html',
        'request-detail': 'pages/request-detail.html',
        'stock-list': 'pages/stock-list.html',
        'stock-new': 'pages/stock-new.html',
        'stock-count': 'pages/stock-count.html',
        'stock-count-detail': 'pages/stock-count-detail.html',
        'stock-groups': 'pages/stock-groups.html',
        'sku-merge': 'pages/sku-merge.html',
        'sales-reports': 'pages/sales-reports.html',
        'contracts': 'contracts.html',
        'contract-edit': 'contract-edit.html',
        'contract-detail': 'contract-detail.html',
        // Sales module pages
        'sales': 'pages/sales.html',
        'sale-new': 'pages/sale-new.html',
        'sale-detail': 'pages/sale-detail.html',
        'customers': 'pages/customers.html',
        'customer-detail': 'pages/customer-detail.html',
        'invoice-new': 'pages/invoice-new.html',
        'invoice-detail': 'pages/invoice-detail.html',
        invoices: 'pages/invoices.html',
        'delivery-note-new': 'pages/delivery-note-new.html',
        notifications: 'pages/notifications.html',
        'submit-bid': 'submit-bid.html',
        'request-list': 'pages/request-list.html',
        // Admin pages
        'admin-dashboard': 'pages/admin/dashboard.html',
        'admin-ai-catalog': 'pages/admin/ai-catalog.html',
        'admin-premium-control': 'pages/admin/premium-control.html',
        'admin-subscription-monitor': 'pages/admin/subscription-monitor.html',
        'admin-migration-dashboard': 'pages/admin/migration-dashboard.html'
      }
    }
  },
  publicDir: 'public',
  // Teklifbul Rule v1.0 - HTML dosyaları Vite tarafından otomatik olarak işlenir, assetsInclude'a eklemek gerekmez
  // assetsInclude kaldırıldı - JS dosyaları modül olarak işlenmeli, statik asset değil
  server: {
    host: '0.0.0.0', // Teklifbul Rule v1.0 - Network'ten erişilebilir (mobil test için)
    port: 5173,
    open: true,
    headers: {
      // Teklifbul Rule v1.0 - CSP: Firebase Auth ve Google API'leri için gerekli domain'ler
      // script-src-elem: Dynamic script loading için (Google API'leri)
      // Not: Google login için auth domain (teklifbul.firebaseapp.com) iframe içinde açılabildiğinden frame-src listesine eklendi.
      'Content-Security-Policy': "default-src 'self'; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://www.google.com https://www.recaptcha.net https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com; script-src-elem 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com https://www.google.com https://www.recaptcha.net https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://cdn.jsdelivr.net; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://cdn.jsdelivr.net; frame-src 'self' https://accounts.google.com https://www.google.com https://www.recaptcha.net https://teklifbul.firebaseapp.com https://*.firebaseapp.com; connect-src 'self' wss://localhost:5173 ws://localhost:5173 http://localhost:5174 https://apis.google.com https://www.googleapis.com https://*.googleapis.com https://*.google.com https://*.firebaseio.com https://*.firebaseapp.com https://www.gstatic.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://nominatim.openstreetmap.org https://us-central1-teklifbul.cloudfunctions.net https://*.cloudfunctions.net https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com; img-src 'self' data: blob: https:; object-src 'none'; base-uri 'self'; form-action 'self';",
      // Teklifbul Rule v1.0 - COOP header kaldırıldı: Firebase popup'ı window.closed kontrolü yapamıyordu
      // COOP header'ı popup'ın çalışmasını engelliyor, bu yüzden kaldırıldı
      // 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        secure: false
      },
      // Teklifbul Rule v1.0 — Observability (authFetch dışındaki göreli istekler için)
      '/health': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        secure: false
      },
      '/metrics': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        secure: false
      }
    },
    hmr: {
      overlay: false,  // Disable error overlay to see actual console errors
      // Teklifbul Rule v1.0 - WebSocket bağlantısı için host ve port ayarları
      host: 'localhost',
      port: 5173,
      clientPort: 5173,
      protocol: 'ws',
      // WebSocket bağlantı hatalarını azaltmak için retry mekanizması
      timeout: 30000 // 30 saniye timeout
    },
    // Teklifbul Rule v1.2.12 - Test klasöründeki HTML dosyalarını doğru şekilde serve et
    fs: {
      allow: ['..']
    }
  },
  optimizeDeps: {
    include: [
      './src/shared/log/logger.js',
      './src/shared/ui/toast.js',
      './src/shared/constants/messages.js',
      './src/shared/constants/colors.js',
      './src/shared/constants/timing.js',
      './src/shared/constants/ui.js',
      './src/shared/ui/confirm-modal.js',
      './assets/js/ui/errors.js',
      './src/categories/category-service.js',
      './src/matching/match-service.js',
      './categories.js',
      './firebase.js',
      './assets/js/i18n.js',
      './assets/js/cookieConsent.js',
      './assets/js/commonLayout.js',
      './assets/js/chatWidget.js',
      './assets/js/pwa-install.js'
    ],
    exclude: []
  },
  // Fix HTML file parsing - ensure Vite handles HTML files correctly
  esbuild: {
    target: 'esnext',
    // Teklifbul Rule v1.0 - JS parse hatalarını önlemek için
    legalComments: 'none',
    charset: 'utf8',
    // Teklifbul Rule v1.0 - HTML'den çıkarılan script'leri doğru parse et
    keepNames: true
  },
  // Optimize handling of JS modules
  resolve: {
    alias: {
      '@': '/src',
      '@utils': '/utils'
    },
    // Teklifbul Rule v1.0 - JS dosya uzantılarını doğru işle
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']
  },
  // Exclude problematic JS files from strict parsing
  ssr: {
    noExternal: []
  },
  // Teklifbul Rule v1.0 - HTML dosyalarındaki script'leri doğru işle
  // Vite'ın HTML içindeki JS'leri parse ederken hata vermemesi için
  define: {
    'import.meta.env.DEV': JSON.stringify(process.env.NODE_ENV !== 'production'),
    // Teklifbul Rule v1.0 - Production build'de bos = same-origin; client resolveApiBaseUrl localhost'u yok sayar
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5174')
    )
  },
  // Teklifbul Rule v1.0 - JS parse hatalarını daha iyi yönet
  logLevel: 'info',
  clearScreen: false
})
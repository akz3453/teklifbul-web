// Teklifbul Rule v1.0
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // No React plugin - this is a vanilla HTML/JS project
  plugins: [],
  build: {
    outDir: 'dist',
    sourcemap: false, // Production'da sourcemap kapalı (performans)
    minify: 'esbuild', // Daha hızlı minify
    chunkSizeWarningLimit: 1000, // Chunk boyutu uyarısı limiti
    rollupOptions: {
      // Teklifbul Rule v1.0 - Test/debug dosyalarını prod build'den hariç tut
      input: {
        main: 'index.html',
        login: 'index.html', // index.html login sayfası
        dashboard: 'dashboard.html',
        settings: 'settings.html',
        demands: 'demands.html',
        'demand-detail': 'demand-detail.html',
        'demand-new': 'demand-new.html',
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
        'add-satfk': 'add-satfk.html',
        // Inventory pages
        'purchase-form': 'pages/purchase-form.html',
        'stock-movements': 'pages/stock-movements.html',
        'purchase-form-detail': 'pages/purchase-form-detail.html',
        'price-update': 'pages/price-update.html',
        'stock-import': 'pages/stock-import.html',
        'invoice-import': 'pages/invoice-import.html',
        'request-site': 'pages/request-site.html',
        'reports': 'pages/reports.html',
        'request-detail': 'pages/request-detail.html'
      }
    }
  },
  publicDir: 'public',
  // Teklifbul Rule v1.0 - Test klasörünü exclude et
  assetsInclude: ['**/*.html'],
  server: {
    port: 5173,
    open: true,
    headers: {
      'Content-Security-Policy': "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.gstatic.com https://cdnjs.cloudflare.com https://maps.googleapis.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com;"
    },
    proxy: {
      '/api': 'http://localhost:5174'
    },
    hmr: {
      overlay: false  // Disable error overlay to see actual console errors
    }
  },
  optimizeDeps: {
    include: []
  },
  // Fix HTML file parsing - ensure Vite handles HTML files correctly
  esbuild: {
    target: 'esnext'
  },
  // Optimize handling of JS modules
  resolve: {
    alias: {
      '@': '/src',
      '@utils': '/utils'
    }
  },
  // Exclude problematic JS files from strict parsing
  ssr: {
    noExternal: []
  }
})

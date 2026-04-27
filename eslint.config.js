import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import html from 'eslint-plugin-html'

export default [
  // Teklifbul Rule v1.1 - Ignore patterns
  // NOT: Flat config'de ignore desenleri leading slash ile baslayamaz; globs cwd-relative.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'public/vendor/**',
      'public/libs/**',
      '**/vendor/**',
      '**/jspdf.umd.min.js',
      '**/xlsx.full.min.js',
      '**/openstreetmap-helper.js',
      // Alt-uygulama kendi tooling'i ile lint edilir; ana repo build'inde dis tutulur.
      'teklifbul-compare-app/**',
      // Large generated or data folders that produce noise during lint
      'public/assets/**',
      'seed/**',
      'test-fixtures/**',
      // Build outputs
      'functions/dist/**',
      'functions/lib/**',
      'functions/excel-export/lib/**',
    ],
  },

  // HTML files configuration
  {
    files: ['**/*.html'],
    plugins: {
      html: html,
    },
    // HTML processor is handled by the plugin automatically
  },

  // TypeScript recommended configs
  ...tseslint.configs.recommended,
  // TypeScript frontend dosyaları
  {
    files: ['src/**/*.{ts,tsx}'],
    ...js.configs.recommended,
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.app.json',
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      // Teklifbul Rule v1.1 - Console logging kontrolü (sıkılaştırıldı)
      'no-console': 'error', // Hiçbir console metoduna izin verilmez
      // Teklifbul Rule v1.1 - Alert kullanımı yasak (toast kullanılmalı)
      // Not: confirm() ve prompt() kullanıcı etkileşimli olduğu için dosya bazında exception eklenebilir
      'no-alert': 'error',
      // TypeScript unused vars
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Undefined variables
      'no-undef': 'off',
      // Strict mode uyumluluğu
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Teklifbul Rule v1.1 - Promise handling kontrolü
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  // Logger modülü için exception (logger.ts içinde console kullanımı normal)
  {
    files: ['src/shared/log/logger.ts'],
    rules: {
      'no-console': 'off', // Logger modülü console kullanabilir
    },
  },
  // JavaScript frontend dosyaları
  {
    files: ['src/**/*.{js,jsx}', 'assets/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-console': ['error', {
        allow: ['groupCollapsed', 'groupEnd', 'info', 'warn', 'error']
      }],
      // Teklifbul Rule v1.1 - Alert kullanımı yasak
      // Not: confirm() ve prompt() için dosya bazında exception eklenebilir
      'no-alert': 'error',
      'no-undef': 'error',
    },
  },
  // Legacy JS files under src (frontend legacy scripts that use globals directly)
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Many legacy src/*.js files rely on global browser or firebase variables;
      // silence no-undef for these legacy JS files so we can focus on TS/runtime fixes.
      'no-undef': 'off',
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
      '@typescript-eslint/no-require-imports': 'off', // Legacy JS dosyalarında require() kullanımına izin ver
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Node.js ortamı (server dosyaları)
  {
    files: ['server/**/*.{ts,js}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      // Teklifbul Rule v1.1 - Server dosyalarında console.log kullanılabilir (CLI çıktısı için)
      'no-console': ['error', {
        allow: ['groupCollapsed', 'groupEnd', 'info', 'warn', 'error', 'log']
      }],
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Teklifbul Rule v1.0 - Server tarafında any kullanımı warn (frontend src/ ile tutarlılık)
      // TECH_DEBT: Mevcut any'ler kademeli olarak proper type'lara dönüştürülecek.
      '@typescript-eslint/no-explicit-any': 'warn',
      // ts-ignore yerine ts-expect-error tercih edilmeli ama mevcut kullanımları bloklamamak için warn
      '@typescript-eslint/ban-ts-comment': ['warn', {
        'ts-ignore': 'allow-with-description',
        'ts-expect-error': 'allow-with-description',
      }],
    },
  },
  // Functions kod tabanı (server-side benzer kurallar)
  {
    files: ['functions/src/**/*.{ts,js}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
  // Functions and legacy scripts (allow require(), relax some rules)
  {
    files: ['functions/**/*.{js,ts}', 'public/**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'script',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
      // Keep console off for these legacy/function/public script files (Phase A)
      'no-console': 'off',
      // Teklifbul Rule v1.1 - Alert kullanımı yasak
      // Not: confirm() ve prompt() için dosya bazında exception eklenebilir
      'no-alert': 'off',
    },
  },
  // Lightweight overrides for public and assets folders to reduce noise
  {
    files: ['public/**/*', 'assets/**/*', 'pages/**/*', 'seed/**', 'test-fixtures/**'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Silence noisy rules in large legacy/data folders during Phase A
      'no-console': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      // Teklifbul Rule v1.1: alert/confirm/prompt yasak ama legacy assets/'da
      // dosya bazinda exception kabul edilir; toast-based modale dönüsüm devam eden iste.
      'no-alert': 'warn',
      // Legacy code occasionally aliases this; not blocking
      '@typescript-eslint/no-this-alias': 'warn',
    },
  },
  // Script dosyaları (browser ve Node.js globals)
  {
    files: ['scripts/**/*.{ts,js}', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'warn',
      '@typescript-eslint/no-require-imports': 'off', // Script dosyalarında require() kullanımına izin ver
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Teklifbul Rule v1.0 - Migration/operasyon scriptleri tek seferlik calisir;
      // any kullanimina izin verilir, kademeli olarak proper type'lara donusturulecek.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': ['warn', {
        'ts-ignore': 'allow-with-description',
        'ts-expect-error': 'allow-with-description',
      }],
    },
  },
  // Jest/Vitest test dosyaları (test/ ve tests/)
  {
    files: ['test/**/*.{ts,js}', 'tests/**/*.{ts,js}', '**/*.test.{ts,js}', '**/*.spec.{ts,js}', 'src/__tests__/**/*.{ts,js}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Test dosyalarinda mock/stub icin any pragmatik kullanilir
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Root-level legacy CommonJS/JS dosyalari (HTML'lerden direkt import edilen
  // global script'ler ve tek-seferlik migration utility'leri)
  {
    files: [
      '*.js',
      '*.cjs',
      'approveCompanyJoinRequest.js',
      'validateCompanyCodeFunction.js',
      'signup_with_company_code.js',
      'test_company_join_flow.js',
      'migrate.js',
      'migrate_fix_company_join.js',
      'loadActiveCompanyUsers_safe.js',
      'category-rules.js',
      'categories.js',
      'firebase.js',
      'header.js',
      'get-coordinates.js',
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-alert': 'warn',
    },
  },
]

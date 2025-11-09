import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default [
  // Teklifbul Rule v1.1 - Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.html',
      '**/vendor/**',
      '**/jspdf.umd.min.js',
      '**/xlsx.full.min.js',
      '**/openstreetmap-helper.js',
      '**/teklifbul-compare-app/**',
      // Large generated or data folders that produce noise during lint
      'public/assets/**',
      'seed/**',
      'test-fixtures/**',
    ],
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
      // Teklifbul Rule v1.1 - Console logging kontrolü
      'no-console': ['error', { 
        allow: ['groupCollapsed', 'groupEnd', 'info', 'warn', 'error'] 
      }],
      // TypeScript unused vars
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Undefined variables
      'no-undef': 'off',
      // Strict mode uyumluluğu
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
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
      'no-console': ['error', { 
        allow: ['groupCollapsed', 'groupEnd', 'info', 'warn', 'error'] 
      }],
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
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
    },
  },
  // Lightweight overrides for public and assets folders to reduce noise
  {
    files: ['public/**/*', 'assets/**/*', 'seed/**', 'test-fixtures/**'],
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
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
  // Jest test dosyaları
  {
    files: ['test/**/*.{ts,js}', '**/*.test.{ts,js}', '**/*.spec.{ts,js}', 'src/__tests__/**/*.{ts,js}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        ...globals.jest,
      },
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
    },
  },
]

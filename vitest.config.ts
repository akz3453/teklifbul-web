import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/__tests__/**/*.test.ts', '__tests__/**/*.test.ts', 'tests/**/*.test.{js,ts}'],
    exclude: [
      'node_modules',
      'dist',
      'teklifbul-compare-app',
      // Rules tests are intended to run via "npm run test:rules" (Firestore emulator exec)
      'tests/rules.test.js',
      'tests/mobile-rules.test.js',
      'tests/permission_fix.test.js',
      'tests/tenant-isolation.rules.test.js',
      'tests/payment-requests.rules.test.js',
      'tests/storage.rules.test.js'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        'teklifbul-compare-app/',
      ],
    },
  },
});


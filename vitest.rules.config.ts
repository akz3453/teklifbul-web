import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    include: [
      'tests/rules.test.js',
      'tests/mobile-rules.test.js',
      'tests/permission_fix.test.js',
      'tests/tenant-isolation.rules.test.js',
      'tests/payment-requests.rules.test.js',
      'tests/storage.rules.test.js',
    ],
  },
});

import { defineConfig } from 'vitest/config';

// Separate config so `npm test` (unit tests) doesn't accidentally call AWS.
// Integration tests need ADMIN_API_BASE + COGNITO_USER_POOL_ID + COGNITO_CLIENT_ID
// env vars and AWS credentials. Run via `make test-integration ENV=dev`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

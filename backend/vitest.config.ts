import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // One in-memory MongoDB per file; files run one at a time to keep it light.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-that-is-long-enough-for-tests',
      UPLOAD_DIR: path.join(os.tmpdir(), `einvoice-test-uploads-${process.pid}`),
      ADMIN_EMAIL: 'admin@test.example',
      ADMIN_PASSWORD: 'TestPassword123!',
      PUBLIC_BASE_URL: 'http://localhost:5173',
    },
  },
});

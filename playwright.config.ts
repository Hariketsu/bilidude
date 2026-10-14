import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

// Run `pnpm build` first (`pnpm test:e2e` does both); tests load .output/chrome-mv3.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // One browser profile per test, but real pages and APIs: keep the load modest.
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure' },
});

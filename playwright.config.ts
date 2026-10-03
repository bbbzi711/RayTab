import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  outputDir: './artifacts/playwright/results',
  reporter: [['list'], ['html', { outputFolder: './artifacts/playwright/report', open: 'never' }]],
  use: {
    headless: true,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 8_000,
  },
  projects: [{ name: 'chromium-extension', use: { browserName: 'chromium' } }],
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://127.0.0.1:4000/api/v1/health',
      env: { DB_ALTER: 'false' },
      timeout: 180_000,
      reuseExistingServer: true,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev:frontend',
      url: 'http://localhost:5173',
      timeout: 60_000,
      reuseExistingServer: true,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});

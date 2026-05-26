import { defineConfig, devices } from '@playwright/test';

const devServerCommand = `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} run dev`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*smoke\.spec\.ts/,
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? [['dot'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: devServerCommand,
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

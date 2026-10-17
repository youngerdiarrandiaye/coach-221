import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://127.0.0.1:4200',
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})

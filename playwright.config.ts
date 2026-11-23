import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.TEST_URL || 'http://localhost:3000',
    launchOptions: {
      ...(process.platform === 'win32'
        ? { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' }
        : {}),
    },
    viewport: { width: 1440, height: 1100 },
  },
  reporter: 'list',
});

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
    // The cookie banner is covered by its own checks; other tests start with a choice made.
    storageState: {
      cookies: [
        {
          name: 'fitura-cookies',
          value: 'necessary',
          domain: new URL(process.env.TEST_URL || 'http://localhost:3000').hostname,
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
  },
  reporter: 'list',
});

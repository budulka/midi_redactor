import { defineConfig, devices } from '@playwright/test';

/** Optional path to an installed Chromium-based browser, for when the downloaded one cannot start. */
const chromiumPath = process.env.E2E_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required'],
          ...(chromiumPath ? { executablePath: chromiumPath } : {}),
        },
      },
    },
  ],
  webServer: [
    {
      command: 'uv run uvicorn app.main:app --port 8000',
      cwd: '../backend',
      url: 'http://localhost:8000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});

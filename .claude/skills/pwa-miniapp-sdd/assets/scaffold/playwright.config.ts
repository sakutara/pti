import { defineConfig, devices } from '@playwright/test'

const base = process.env.BASE_PATH ?? '/__REPO__/'

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:4173${base}` },
  // e2e runs against the production build so the real service worker is active.
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
})

import { defineConfig, devices } from '@playwright/test'

const base = process.env.BASE_PATH ?? '/'
// Second build: the Gmail flow with a fake OAuth client id, into its own outDir that publish-docs never copies.
const GMAIL_PORT = 4174
const GMAIL_OUT = 'dist-gmail-e2e'
const FAKE_CLIENT_ID = 'fake-client-id.apps.example.invalid'

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:4173${base}` },
  // e2e runs against the production build so the real service worker is active.
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      port: 4173,
      reuseExistingServer: true,
    },
    {
      command: `PTI_OUT_DIR=${GMAIL_OUT} VITE_GOOGLE_CLIENT_ID=${FAKE_CLIENT_ID} npx vite build && PTI_OUT_DIR=${GMAIL_OUT} npx vite preview --port ${GMAIL_PORT} --strictPort`,
      port: GMAIL_PORT,
      reuseExistingServer: true,
    },
  ],
  projects: [
    { name: 'mobile', testIgnore: /gmail\.spec\.ts/, use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } },
    { name: 'desktop', testIgnore: /gmail\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    {
      name: 'gmail',
      testMatch: /gmail\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: `http://localhost:${GMAIL_PORT}${base}` },
    },
  ],
})

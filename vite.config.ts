/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served at https://pti.fiddle.vn/ (GitHub Pages custom domain, public/CNAME). Override with BASE_PATH.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  // The Gmail e2e build writes elsewhere (PTI_OUT_DIR) so that dist/, the one publish-docs copies, never holds it.
  build: { outDir: process.env.PTI_OUT_DIR ?? 'dist' },
  plugins: [
    preact(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'PTI Claim',
        short_name: 'PTI Claim',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0f172a',
        icons: [
          // Generated from public/favicon.svg by @vite-pwa/assets-generator (see scaffold.sh)
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        // Static pages and data files are served from precache, never replaced by the app shell.
        // OCR model (ort wasm, ~100 MB) is served from public/ocr/ and cached on demand, never precached.
        navigateFallbackDenylist: [/^\/about\//, /^\/privacy\//, /^\/data\//, /^\/ocr\//],
        // mjs: the pdf.js worker (~1.4 MB, under workbox's 2 MiB default) must be precached to read e-invoices offline.
        // pdf, ttf: the blank claim form and the Noto Sans fonts are read by src/lib/claim-form-pdf.ts, also offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,json,mjs,pdf,ttf}'],
        globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js', 'ocr/**'],
        // The OCR model is fetched by the worker from our own /ocr/ path. CacheFirst into the 'ocr-model' cache (the same
        // cache src/data/ocr-model.ts fills) lets reading work offline after the one-time download.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-model',
              cacheableResponse: { statuses: [200] },
              // Stored files match whatever Vary says (the dev server sends Vary: Origin; the worker's CORS import
              // rewrites the entry with that header), so an offline read still finds the model.
              matchOptions: { ignoreVary: true },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
})

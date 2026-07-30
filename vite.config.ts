import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

const BASE = '/CodeScanner/'
const src = (p: string) => fileURLToPath(new URL(`src/${p}`, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: BASE,

  plugins: [
    react(),

    // Installable + offline. This is what makes the app usable with no network:
    // Workbox precaches the bundle AND the ~900 KB zxing wasm, so after one
    // visit over https the scanner runs from cache.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['Favicon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Code Scanner',
        short_name: 'DM Scan',
        description: 'Continuous Data Matrix and QR reader for the rear camera.',
        id: BASE,
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0B0E11',
        theme_color: '#0B0E11',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],

  // Aliases: these must mirror the "paths" block in tsconfig.app.json exactly,
  // matching case included, or Vite and tsc disagree.
  resolve: {
    alias: {
      '@components': src('components'),
      '@lib': src('lib'),
    },
  },
})

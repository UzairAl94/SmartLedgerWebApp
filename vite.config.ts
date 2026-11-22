import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The PWA plugin registers its service worker in every HTML entry. The desktop
// client is served over plain HTTP from the phone, where service workers are
// unavailable, so drop the tag from the emitted desktop.html only.
const stripServiceWorkerFromDesktop = (): Plugin => ({
  name: 'strip-sw-from-desktop',
  enforce: 'post',
  closeBundle() {
    const file = resolve(__dirname, 'dist/desktop.html')
    try {
      const html = readFileSync(file, 'utf8')
      const next = html.replace(/\s*<script[^>]*registerSW\.js[^>]*><\/script>/g, '')
      if (next !== html) writeFileSync(file, next)
    } catch {
      // Only present when the desktop entry was built.
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    stripServiceWorkerFromDesktop(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifestFilename: 'manifest.json',
      manifest: {
        name: 'Smart Ledger',
        short_name: 'SmartLedger',
        description: 'Personal Finance & Expense Tracker',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      // Main entry is the mobile app; desktop.html is the wide-screen client
      // served by the phone's local API server at /desktop.html.
      input: {
        main: 'index.html',
        desktop: 'desktop.html',
      },
    },
  },
})

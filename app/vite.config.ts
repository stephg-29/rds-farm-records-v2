import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app that opens with no signal: the app itself is saved on
    // the phone. Records sync separately (src/lib/sync.ts).
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Farm Records',
        short_name: 'Farm Records',
        description: 'Farm records, stock and map for your property. Works with no signal.',
        lang: 'en-AU',
        theme_color: '#414b3b',
        background_color: '#f8eeed',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Each farm's connection details: always fresh, last copy when offline.
        globIgnores: ['config.js', 'config.example.js'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.endsWith('/config.js'), handler: 'NetworkFirst', options: { cacheName: 'farm-config', networkTimeoutSeconds: 4 } },
          { urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com', handler: 'StaleWhileRevalidate', options: { cacheName: 'google-fonts-css' } },
          { urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com', handler: 'CacheFirst', options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 } } },
          // Map imagery is NOT saved for offline use until the imagery licence
          // allows it (see the handover, item 22c).
        ],
      },
    }),
  ],
})

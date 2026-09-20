import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { VitePWA } from 'vite-plugin-pwa'
import { POSTER_CACHE, isPosterRequest } from './src/lib/cacheRules.js'

// Which build is this? Shown in small grey type at the bottom of the
// collection, and the answer to a question that has now cost two rounds of
// testing: "is the page on my phone the new one?" A phone holds on to a page
// for a long time, and nothing else on screen distinguishes one build from
// the next. It is the short commit id plus the date, and nothing else — it
// names a version, never a person or a film.
function buildStamp() {
  try {
    const commit = execSync('git rev-parse --short HEAD').toString().trim()
    return `${commit} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  } catch {
    return 'dev'
  }
}

// base must match the GitHub Pages path: staciatucker-arch.github.io/the-shelf/
// Getting this wrong is the classic "blank page after deploy" cause, because
// every asset URL is resolved against it.
export default defineConfig({
  base: '/the-shelf/',
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp()) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' — never swap the running app out from under someone
      // mid-edit. The banner asks; the person decides. This is what replaces
      // the old hard-refresh ritual.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'The Shelf',
        short_name: 'The Shelf',
        description: 'Our home media collection',
        theme_color: '#1b1b1f',
        background_color: '#1b1b1f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/the-shelf/',
        scope: '/the-shelf/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Posters live on other origins (GitHub Pages and Supabase Storage).
        // Cache them at runtime so a revisited shelf loads instantly, but
        // never precache them — that would download the whole collection on
        // first open.
        //
        // ONLY posters. Until 2026-09-19 this matched every supabase.co
        // request, so the collection itself and sign-in were cached too, and
        // the app could open on last time's collection (review A1). The rule
        // and its tests live in src/lib/cacheRules.js. It is passed by name,
        // not wrapped, because it is copied into sw.js as text.
        runtimeCaching: [
          {
            urlPattern: isPosterRequest,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: POSTER_CACHE,
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
})

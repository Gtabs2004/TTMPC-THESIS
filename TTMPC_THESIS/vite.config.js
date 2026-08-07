import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA config — installable member portal only. Manifest advertises the app
    // as member-focused (start_url = /memberlogin) but does NOT restrict which
    // routes exist. Access control is still enforced by Supabase auth.
    // The service worker caches the app shell so the UI opens instantly on
    // repeat visits and works offline; data still requires network.
    VitePWA({
      registerType: 'autoUpdate',
      // Files in /public/ that should be included in the precache.
      // (icons + favicon so the installed app has them offline)
      includeAssets: [
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
        'apple-touch-icon.png',
        'img/ttmpc logo.png',
      ],
      manifest: {
        name: 'TTMPC Member Portal',
        short_name: 'TTMPC',
        description: 'Tubungan Teachers Multi-Purpose Cooperative — Member Portal',
        theme_color: '#1D6021',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/memberlogin',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-shell precache. Data fetches to Supabase/Railway are NOT cached
        // (would cause stale-data confusion). Only static assets + navigation
        // routes fall back to a cached shell when offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Skip the huge marketing landing image — it's only used on the public
        // marketing page which the PWA doesn't need offline, and it pushes
        // Workbox past its default 2 MB per-file precache limit.
        globIgnores: [
          '**/img/landing page.png',
          '**/img/landing-page.png',
          '**/assets/img/landing-page.png',
        ],
        // Bump per-file cache ceiling so the main JS bundle (~2.7 MB — recharts
        // + pdf-lib + jspdf are the heavy hitters) can still be precached for
        // instant offline shell load. Splitting is a Phase-2 optimization.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        // Don't try to precache the Railway backend origin.
        navigateFallbackDenylist: [/^\/api\//],
        // Runtime cache for images (member avatars, etc.) — network-first so
        // fresh data wins, cache is fallback.
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ttmpc-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        // Enable service worker in dev so you can test install prompts on
        // localhost during development (Chrome allows install from localhost).
        enabled: true,
        type: 'module',
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
        }
      }
    }
  }
})

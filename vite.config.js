import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Use our custom SW so we can merge push notifications + workbox caching
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',

      // Output to /sw.js — same path the push notification hook already registers
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        // Precache everything in dist except source maps
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webp,glb,usdz}'],
        globIgnores: ['**/*.map'],
      },

      registerType: 'prompt', // Ask user before activating a new SW version

      manifest: {
        name: 'hungriAR',
        short_name: 'hungriAR',
        description: 'Restaurant Management · QR Ordering · AR Dish Preview',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        display: 'standalone',
        // Installed restaurant devices open straight into the admin area:
        // ProtectedRoute shows a spinner while the session restores, then the
        // dashboard (or role-based panel). The public "/" landing page is for
        // the website only — the installed app never routes through it.
        start_url: '/admin',
        scope: '/',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-64x64.png',             sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png',           sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',           sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      devOptions: {
        enabled: true,   // test service worker in dev mode
        type: 'module',
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into long-cacheable chunks so a
        // small app change doesn't force users to re-download React/Supabase.
        // Heavy, route-only libs (recharts, model-viewer, qr-code-styling) are
        // already isolated by React.lazy + dynamic import, so they don't need
        // manual chunks here.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          motion: ['framer-motion'],
        },
      },
    },
  },
})

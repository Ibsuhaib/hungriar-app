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
        name: 'HungriAR',
        short_name: 'HungriAR',
        description: 'AR-powered restaurant ordering',
        theme_color: '#d3552f',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        icons: [
          { src: '/icon-72.png',  sizes: '72x72',   type: 'image/png' },
          { src: '/icon-96.png',  sizes: '96x96',   type: 'image/png' },
          { src: '/icon-128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
  },
})

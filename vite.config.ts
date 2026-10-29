import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_PORT = Number(process.env.PORT ?? 4300);

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: {
    host: true,
    port: 5300,
    proxy: { '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true } },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dev Tools 2.0',
        short_name: 'DT 2.0',
        description: 'Your personal life OS — tasks, notes, money, drops, habits.',
        theme_color: '#0b0c10',
        background_color: '#0b0c10',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the home-screen icon (Android & iOS 17+ installed PWAs).
        shortcuts: [
          { name: 'Log food', short_name: 'Food', url: '/?quick=food', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Water +1', short_name: 'Water', url: '/?quick=water', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Start a run', short_name: 'Run', url: '/sport?start=run', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'New task', short_name: 'Task', url: '/?quick=task', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
        // Android: "Share → Dev Tools" sends links, text and files straight to Drop.
        share_target: {
          action: '/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'file', accept: ['*/*'] }] },
        },
      },
      workbox: {
        // Push + notification-click handlers (web/public/push-sw.js) layered onto the generated SW.
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/share/],
        runtimeCaching: [
          {
            // Show last-known data when the laptop is unreachable.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && url.pathname !== '/api/events',
            handler: 'NetworkFirst',
            method: 'GET',
            options: { cacheName: 'api', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/gymlog/', // debe coincidir con el nombre del repositorio
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'GymLog · Bitácora de entrenamiento',
        short_name: 'GymLog',
        lang: 'es',
        display: 'standalone',
        start_url: '.',
        theme_color: '#09090b',
        background_color: '#09090b',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
});

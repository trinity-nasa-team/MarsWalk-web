import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api va al backend (repo MarsWalk-v3, uvicorn en :8000; otro destino con API_PROXY_TARGET).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:8000',
      // Servicio local de rocas (MarsWalk-v3/scripts/rock_service.py; otro destino con ROCKS_PROXY_TARGET).
      '/rocks': { target: process.env.ROCKS_PROXY_TARGET || 'http://127.0.0.1:8765', rewrite: (p) => p.replace(/^\/rocks/, ''), timeout: 0, proxyTimeout: 0 },
    },
  },
  // MapLibre 6 carga su worker por URL relativa: no se pre-empaqueta.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
  test: { environment: 'jsdom', include: ['tests/**/*.test.{js,jsx}'] },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api va al backend (repo MarsWalk-v2, uvicorn en :8000; otro destino con API_PROXY_TARGET).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { '/api': process.env.API_PROXY_TARGET || 'http://localhost:8000' } },
  // MapLibre 6 carga su worker por URL relativa: no se pre-empaqueta.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2500 },
  worker: { format: 'es' },
  test: { environment: 'jsdom', include: ['tests/**/*.test.{js,jsx}'] },
});

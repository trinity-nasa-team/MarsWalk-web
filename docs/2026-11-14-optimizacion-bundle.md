# 2026-11-14 — Optimización del bundle

**Qué se hizo**
- `src/App.jsx`: las 7 vistas se cargan con `lazy` + `Suspense` (fallback `null`).
- `vite.config.js`: `chunkSizeWarningLimit` 2500 → 1200.
- Resultado: bundle inicial 2 037 kB (557 kB gzip) → 285 kB (92 kB gzip). `three` (552 kB) y `maplibre-gl` (MapView, 1 119 kB) se descargan solo al entrar a la vista que los usa.
- Verificación: `pnpm test` 29/29 y `pnpm build` OK. Sin prueba manual en navegador.

**Pendiente**
- Indicador de carga en lugar del fallback `null` si se nota el parpadeo al cambiar de vista.
- `VITE_NASA_API_KEY` (`src/lib/radiation.js`) contradice "nada secreto en `VITE_*`"; hoy usa `DEMO_KEY`. Si hay llave real, pasarla por proxy en el backend.

**Decisiones**
- Code-splitting por vista (no `manualChunks`): cambio mínimo, sin tocar componentes.

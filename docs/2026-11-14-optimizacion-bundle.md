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

## Ajuste: URLs del backend en dominio separado (misma fecha)

**Qué se hizo**
- `src/lib/api.js`: nuevo `apiUrl(u)` que antepone `VITE_API_URL` a las rutas `/api/...` que devuelve el backend. `marsPois` ahora usa `request('/mars/pois')` (antes `fetch('/api/mars/pois')` fijo).
- `MapView.jsx` (imágenes de capas y chunks HiRISE) y `Viewfinder.jsx` (overview del ortomosaico) usan `apiUrl`.
- Sin esto, con front y back en proyectos de Vercel distintos, esas imágenes y los POIs globales pedían al dominio del front (404).
- `tests/api.test.js`: 2 pruebas de `apiUrl`. Total 32/32, build OK.
- CORS verificado contra el backend (TestClient): GET, imagen PNG y preflight POST devuelven `access-control-allow-origin` para el origen configurado; un origen no listado no lo recibe.

**Pendiente**
- Vercel: crear el proyecto de MarsWalk-web con `VITE_API_URL=https://<backend>.vercel.app/api` y añadir su dominio a `CORS_ORIGINS` del backend.

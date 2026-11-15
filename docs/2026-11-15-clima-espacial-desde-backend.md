# 2026-11-15 — DONKI (clima espacial) desde el backend

## Qué cambió
- **Origen de los datos:** `lib/radiation.js` ahora llama a `api.spaceWeather()`, es decir `GET /api/mars/space-weather` del backend (MarsWalk-v2#9).
  - Antes consultaba `api.nasa.gov/DONKI` con `DEMO_KEY`, que daba 429 por IP en el wifi compartido.
  - Ya no queda ninguna clave en el bundle.
- **Panel de radiación (`Gauges.jsx`):**
  - Muestra "NASA DONKI: N SEP en 72 h (cerca de la Tierra)". Si el backend usa su copia de respaldo, dice "copia del <fecha>".
  - Línea nueva: "Última CME con llegada a Marte: <fecha> (modelada, WSA-ENLIL) · N en 30 días". Es un dato real de NASA sobre Marte, pero **modelado**, y así se etiqueta.
- **`.env.example`:** se quita `VITE_NASA_API_KEY`.

## Verificación
- `pnpm test` 32/32 y `pnpm build` OK.
- En local, con el backend de la rama: el HUD muestra "0 SEP in 72 h (near Earth)" y "Latest CME reaching Mars: 2026-11-13, glancing blow (modelled, WSA-ENLIL) · 10 in 30 days", sin errores de red.

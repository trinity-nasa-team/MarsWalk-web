# 2026-11-06 — 013 Marswalk: interfaces (spec + maqueta funcional en React)

## Qué se hizo
- Spec `spec/features/013-marswalk-interfaces/` (spec, plan, tasks) a partir de *Trinity-Propuesta-Resumen.pdf*
  y tres referencias: ETH Zürich Space (ambiente), RS69 Rogue Signal (colores de órbitas), Claude on Mars
  (pantallas, visor del robot, estilo, superficie). Tokens sacados del CSS/JS publicado de cada sitio.
- App nueva `marswalk/` (Vite 8 + React 19, **pnpm**), cuatro vistas:
  - `#plan`: capas reales de la API, 22 sitios de muestras de Perseverance, radio de regreso a pie de 10 km
    (DRA 5.0), recorrido real de Perseverance, ruta A* con métricas, perfil y explicaciones.
  - `#habitat`: mapa en vivo, visor del robot en 3D sobre el DEM real (three.js, ×3 vertical, declarado),
    telemetría, aprobación de ruta, bitácora, pausa/velocidad, «reportar peligro».
  - `#hud`: tablet con mapa que sigue al astronauta (track-up), alertas por color y voz (Web Speech),
    alcance de regreso, botones ≥ 44 px.
  - `#earth`: cola «guarda y reenvía» con retraso 4–22 min, «dato de hace N min», esquema orbital.
- Ciclo completo verificado en Chromium contra la API real: robot detecta (arena blanda simulada, 300 m) →
  `POST /route` con `obstacles` → ruta corregida pendiente en HUD → hábitat aprueba → la Tierra la recibe tarde.
- Sincronización entre pestañas del mismo navegador con `BroadcastChannel` (la pestaña que inicia la EVA es líder).

## Decisiones
- Sin Open MCT (decisión del usuario). React con pnpm (npm no se usa).
- Fuentes: Michroma + Eudoxus Sans (ETH, OFL; Eudoxus verificada en github.com/stijndevries/Eudoxus-Sans),
  JetBrains Mono (Claude on Mars). Las fuentes de Anthropic son propietarias y no se usan.
- Colores con significado (paletas de RS69): azul = ruta con datos orbitales, ámbar = suelo/robot/ruta
  corregida, violeta = Tierra. Base negra y grises de Claude on Mars; fondos azul profundo de ETH.
- Capa de transitabilidad apagada por defecto (se prende en «Capas»): domina el relieve en grises.
- Hábitat por defecto = primer waypoint del recorrido real de Perseverance (sitio de aterrizaje).
- Supuestos marcados en pantalla: marcha 3 km/h; O₂ y punto de no retorno «modelo pendiente · propuesta».
- Desviación declarada: la marquesina va a 40 s en vez de los 12 s de Claude on Mars (el texto es más largo).
- MapLibre 6: worker empaquetado con `?worker&url` + `setWorkerUrl`, y excluido de `optimizeDeps`.

## Verificación
- Vitest 17/17 (geo, simulación del ciclo, cola con retraso, i18n). Build OK. Ciclo E2E manual con Playwright
  en dev y preview de producción sin errores de consola.

## Pendiente
- Specs de backend: modelo metabólico Pandolf/Santee (O₂), punto de no retorno, puente MQTT/WebSocket para
  sincronizar tablet y laptop en dispositivos distintos, DONKI.
- Servir `marswalk/dist` desde FastAPI (hoy solo sirve `frontend/dist`).
- E2E automatizado del ciclo dentro de `marswalk/` (hoy el script vive fuera del repo).

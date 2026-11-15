# 2026-11-15 — Congelamiento al entrar a Habitat/HUD: un solo mapa para toda la app

## Diagnóstico (perfil de CPU con Playwright + CDP, build de producción local)
Repro: Plan → 2 paradas → Calcular → Iniciar EVA → alternar Habitat / Plan / HUD / Habitat.

| Versión | Bloqueo del hilo principal | Dónde se iba el tiempo |
|---|---|---|
| `main` (e91f53d) | 24 s y 26 s en cada vuelta a Habitat/HUD | `texSubImage2D` 28 s (subir imágenes a la GPU) + `getUniformBlockIndex` 23 s (enlazar shaders), todo dentro de `map._render` de MapLibre |
| + capas apagadas con `visibility: none` | 20 s | quedaba la compilación de shaders (`getProgramParameter` 20 s) |
| sin el visor 3D (prueba A/B) | 31 s | descarta three.js como causa |
| **+ mapa único** | **ninguno** (0 tareas largas > 50 ms en 25 s) | — |

Causa: cada vista montaba un `maplibregl.Map` nuevo, es decir un contexto WebGL nuevo. Eso obligaba a recompilar todos
los shaders y volver a subir las imágenes (ortomosaico HiRISE, pendiente, arena…). En GPUs integradas (Intel UHD 630,
ANGLE/Metal) esto bloqueaba el hilo 20–60 s. Además, las capas "apagadas" solo tenían opacidad 0, así que MapLibre las
cargaba y subía igual.

## Qué cambió (`src/components/MapView.jsx`)
1. **Mapa único por región:** se crea una vez y su contenedor (`.map-gl`) se mueve a la vista que lo monta. Al desmontar
   se quitan los marcadores y el popup, pero el mapa no se destruye. Al volver, encuadre inicial igual que un mapa nuevo
   (región completa, norte arriba). Si dos vistas lo piden a la vez, la segunda crea uno propio (comportamiento anterior).
2. **Capas apagadas con `visibility: 'none'`** (tras el desvanecimiento de 0.6 s): no se descargan ni se suben a la GPU.
3. `map.isEasing()` → `map.isMoving()` en el seguimiento del HUD (lanzaba `TypeError` al montar el HUD con el mapa ya cargado).

## Verificación
- `pnpm test` 32/32, `pnpm build` OK.
- Perfil antes/después con el script de Playwright descrito arriba; capturas de Habitat, HUD, Plan y Compare tras alternar.

## Pendiente
- Probar en la laptop y la tablet del pitch.
- Las listas de la fase 1 siguen igual (persistencia de la EVA, tablet, DONKI).

# 2026-11-14 — Fase 1: bugs de runtime del frontend (marswalk/)

Va sobre la rama `fix/fase0-higiene` (PR #4). Origen: auditoría de código de `marswalk/src` hecha por dos revisores en paralelo. Cada hallazgo se verificó leyendo el código.

## Qué se corrigió

| # | Sev. | Archivo | Bug | Arreglo |
|---|---|---|---|---|
| 1 | Alta | `state/store.jsx` | Si se iniciaba o reiniciaba la EVA desde una pestaña que no es la líder, `EVA_START` llegaba sin `tabId`: `leader` quedaba `undefined` y la EVA se congelaba en todas las pestañas | La líder agrega su `tabId` al reenviar `EVA_START` |
| 2 | Alta | `lib/sim.js` | `RESET` regresaba `seq` a 0, así que los ids de petición se repetían entre EVAs. Resultado: reruta ignorada (astronauta en "hold" para siempre) o una respuesta tardía de la EVA anterior aplicada a la nueva | `RESET` conserva `seq` (con prueba de regresión) |
| 3 | Alta | `state/store.jsx` | El reloj iba al 50% o menos con la pestaña líder en segundo plano, porque el navegador frena `setInterval` y `dt` se recortaba a 0.5 s | Se consume el `dt` real en sub-ticks de ≤0.5 s (tope de 60 s) |
| 4 | Alta | `components/Viewfinder.jsx` | Fuga de memoria de GPU: los overlays se reconstruían 10 veces por segundo sin liberar geometría ni material | Se liberan al reconstruir, y la clave redondea la cabeza de la ruta (~100 m) |
| 5 | Media | `views/PlanView.jsx` | Si se editaba el plan durante "Calcular", se guardaban tramos que ya no correspondían a las paradas | Se descarta el resultado si cambió la clave del plan |
| 6 | Media | `lib/marsTiles.js`, `lib/tileWorker.js` | Los tiles que ya no se veían se seguían procesando en los workers, lo que hacía lento el zoom y el paneo | Se usa el `abortController` de MapLibre 6 y el worker cancela con `AbortSignal` |
| 7 | Media | `Viewfinder.jsx`, `HeroScene.jsx` | Contextos WebGL acumulados al navegar; terminaba en "Too many active WebGL contexts" y mapa en negro | `renderer.forceContextLoss()` y limpieza de `el._cleanup` |
| 8 | Media | `main.jsx`, `store.jsx` | No había ErrorBoundary (pantalla en blanco ante un error de render) y una promesa sin `catch` dejaba la EVA en "hold" | `components/ErrorBoundary.jsx` y `.catch` que despacha `ROUTE_RESULT` con error |
| 9 | Media | `lib/marsTilesCore.js` | Un fallo de red momentáneo dejaba un hueco en el mosaico toda la sesión | No se cachean resultados nulos |
| 10 | Media | `lib/findings.js` | Con localStorage lleno se borraban las fotos más recientes (la lista va de nueva a vieja) | Se conservan las 3 más recientes |
| 11 | Baja | `store.jsx` | Con `regions` vacío la carga se quedaba en "loading" para siempre | Pasa al estado `error` |
| 12 | Baja | `views/HudView.jsx` | `pending_kind` siempre `null`; distancia robot–astronauta ~2% baja en E–O | `'reroute'` y `haversine` |
| 13 | Baja | `components/Orbits.jsx` | Con un canvas < 72 px el radio salía negativo, `arc()` lanzaba y el diagrama se congelaba | `unit ≥ 1` |
| 14 | Baja | `components/Starfield.jsx` | Con "reducir movimiento" el fondo quedaba sin estrellas | Sigue esperando hasta poder dibujar el primer cuadro |
| 15 | Baja | `components/HabitatChat.jsx` | El dictado por voz enviaba la telemetría vieja | `sendRef` con el `send` más reciente |

## Verificación
- `pnpm test`: 30/30 (29 previas + 1 de regresión de `RESET`).
- `pnpm build`: OK.
- Falta: prueba manual en el navegador con dos pestañas (líder en segundo plano, reiniciar desde la otra) y navegar varias veces entre Inicio y Hábitat.

## Pendiente (no se tocó)
- `CompareView.run()` sin try/catch ni cancelación al desmontar.
- `PointInfo` vuelve a pedir datos cuando llegan los POIs globales (dependencia de `region` completo).
- `findings.js`: `subscribe` se recrea en cada render.
- `t` se recrea en cada tick, lo que recalcula los `useMemo` que dependen de él.
- Modales sin Escape ni foco atrapado; "Eliminar" en Hallazgos sin confirmación.
- `lib/modelShot.js` y `lib/gltf.js` no se usan (código muerto; no se borran sin confirmar).
- Starfield no redibuja en `resize` con "reducir movimiento".
- Lo pendiente de la fase 0: persistencia de la EVA, tablet, DONKI, foto del robot.

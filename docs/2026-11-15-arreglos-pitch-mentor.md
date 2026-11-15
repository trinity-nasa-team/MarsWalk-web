# 2026-11-15 — Arreglos antes del pitch (notas del mentor y juez en vivo)

Origen: `12-evaluacion-mentor/00-PLAN-UNIFICADO-PITCH.md` (archivo del equipo). A2 (quitar la autoaprobación del HUD) y el
cambio de foto del robot se descartaron por decisión de Paul. A7 (opacidad de la arena) queda pendiente de su visto bueno.

| # | Cambio | Dónde |
|---|---|---|
| A1 | Un solo peligro por EVA: si el operador lo reporta a mano (robot físico), ya no cae el automático después. Antes la EVA quedaba en espera indefinida | `lib/sim.js` (+ prueba) |
| A3 | Tarjeta de aprobación: "Costo del desvío: +N m · +N min a 3 km/h · O₂ estimado del tramo nuevo: N L (modelo metabólico)". Responde al "chequeo costo-beneficio" | `HabitatView.jsx`, `routeFromApi` guarda `est_time_h` |
| A4 | Etiquetas: "Duración de la EVA (ida y regreso, 3 km/h)" vs "Tiempo de ida"; "Elev. mín/máx" en el perfil; "Ruta actual (restante)" tras una ruta corregida | `i18n.js`, `Profile.jsx`, `HabitatView.jsx` |
| A5 | Ayuda del HUD cerrada por defecto (no tapa mapa ni estado) | `HudView.jsx` |
| A6 | History sigue con el A* legado (el genético solo existe ahí; con v4 el "mismo orden" daba 8.18 km contra 5.19 km del genético: peor contradicción). Ahora lo dice en pantalla | `CompareView.jsx`, `i18n.js` |
| A8 | Explicaciones del planificador v4 traducidas (es/en), sin duplicados entre tramos; "celda más empinada 20.7° con bloqueo 20°" se explica: es una parada o el hábitat | `lib/explain.js` (+ pruebas) |

## Verificación
- `pnpm test` 41/41 y `pnpm build` OK.
- En el navegador, con la API de producción (Playwright, ES):
  - **Explicaciones:** salen en español, sin duplicados, y explican el 20.7°.
  - **Tarjeta de aprobación:** "+225 m · +5 min a 3 km/h · O₂ 121 L".
  - **Peligros:** no cae un segundo peligro en 60 s.
  - **HUD:** la ayuda arranca cerrada.
  - **Congelamiento:** ninguno al alternar vistas (tarea máx. 0.24 s).

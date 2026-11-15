# MarsWalk — Web (frontend)

Frontend de MarsWalk. El backend vive en `trinity-nasa-team/MarsWalk-v3`; las convenciones del proyecto
(coordenadas, unidades, fuentes, "No hagas") están en su `CLAUDE.md` y aplican aquí también.

## Comandos
- `pnpm install` · `pnpm dev` (5174, proxy `/api` → :8000) · `pnpm test` · `pnpm build`
- Usar **pnpm**, no npm. Pruebas en un solo proceso (`vitest run --no-file-parallelism`).

## Convenciones
- JS ES2022, `camelCase`, un archivo por componente.
- Toda llamada al backend pasa por `src/lib/api.js` (nunca lanza; devuelve `{ ok, data | error }`).
- La URL de la API sale de `VITE_API_URL` (vacío → `/api`). Nada secreto en variables `VITE_*`.
- Coordenadas `[lon, lat]`, lon −180..180 Este, datum Mars 2000 (R = 3 396 190 m); usar `lib/geo.js`.
- Texto de la API o del LLM se muestra como texto, nunca con `dangerouslySetInnerHTML`.
- No citar cifras o datos en la UI sin fuente verificada; lo simulado se etiqueta como SIMULADO.

## Flujo
- Cambios que toquen más de 2 archivos: plan primero y OK del usuario.
- Al cerrar una tarea relevante, nota en `docs/` (fecha, qué se hizo, pendiente, decisiones).

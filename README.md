# ANDAR — Web

**ANDAR** · *Astronaut Navigation & Data-Assisted Routing* · Safe walks on Mars, with a rover one step ahead. Team Trinity.

Interfaz de ANDAR (NASA Space Apps 2026, reto *Interplanetary Survival Guide: Martian Map*): planificación de EVA
en el cráter Jezero, HUD del astronauta, hábitat, enlace con la Tierra y comparación con el recorrido de Perseverance.

- **Stack:** React 19 · Vite 8 · MapLibre GL 6 · three.js · Vitest
- **Backend (API):** repo [`trinity-nasa-team/MarsWalk-v3`](https://github.com/trinity-nasa-team/MarsWalk-v3) (FastAPI + planificador), desplegado en `https://marswalk-v3.vercel.app/api`. `MarsWalk-v2` quedó deprecated el 2026-11-15.

Este repo salió de `MarsWalk-v2/marswalk/` el 2026-11-14 con su historial (`git subtree split`).

## Desarrollo local

Requisitos: Node ≥ 22.12 y **pnpm** (no npm).

```bash
pnpm install
# 1) Levanta el backend en otra terminal (repo MarsWalk-v3): uvicorn marsmap.api.main:app --app-dir src --env-file .env
# 2) Levanta la web:
pnpm dev          # http://localhost:5174 — /api va por proxy a http://localhost:8000
```

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo (puerto 5174, proxy `/api` → `API_PROXY_TARGET` o `:8000`) |
| `pnpm test` | Pruebas unitarias (Vitest, un solo proceso) |
| `pnpm build` | Build de producción en `dist/` |
| `pnpm preview` | Sirve `dist/` para probar el build |

Vistas: `#home`, `#plan`, `#habitat`, `#hud`, `#earth`, `#compare`, `#findings`.

## Variables de entorno

Ver [`.env.example`](.env.example). La importante en producción es `VITE_API_URL` (URL pública del backend terminada
en `/api`). Toda variable `VITE_*` queda **pública** en el bundle: nunca pongas secretos ahí (la clave de Groq vive
solo en el backend).

## Despliegue (Vercel)

1. Importa este repo como proyecto nuevo en Vercel (detecta Vite; `vercel.json` ya fija pnpm y `dist/`).
2. Agrega `VITE_API_URL=https://<proyecto-backend>.vercel.app/api`.
3. En el proyecto del backend agrega el dominio de este frontend a `CORS_ORIGINS`.

## Estructura

- `src/views/` — una vista por pantalla · `src/components/` — UI reutilizable · `src/lib/` — lógica pura
  (simulación, geo, tiles de Marte, i18n) · `src/state/` — estado global y sincronización entre pestañas
- `tests/` — Vitest · `docs/` — notas de diseño y sesiones del frontend

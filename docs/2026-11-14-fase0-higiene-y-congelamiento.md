# 2026-11-14 — Fase 0 (higiene) y congelamiento del HUD

Origen: revisión del frontend (juez en vivo + auditoría de código), `trinity-nasa/11-revision-frontend/00-PLAN-UNIFICADO.md`.

## Qué se hizo
- **Cifras verificadas:**
  - regreso a pie de emergencia ~15 km (NASA DRA 5.0 §2.1), antes 10 km; EVA planeada de 2–5 km;
  - retraso Tierra–Marte de 4–24 min (NASA Goddard), antes 22.
- **Etiquetas honestas:**
  - "Habitat · LIVE" → "SIMULATED";
  - la cámara del robot es un render simulado, no una foto;
  - "≤ 2 h (NASA OCHMO)" → "(regla de la demo)", porque no había fuente verificada.
- **Compare:** se quitó el "% más corta que el recorrido real" (el plan prohíbe comparaciones de eficiencia con NASA); ahora explica que la distancia del plan y el odómetro no son comparables. "odómetro NASA/JPL" traducido.
- **Chat del hábitat:** sin clave de IA, responde con un resumen local de la telemetría en vez del error "GROQ_API_KEY missing".
- **Error de API:** mensaje neutro, sin el comando `uvicorn`.
- **Congelamiento del HUD (1–5 min):** `MapView` registraba un listener `marswalk:ready` por tick mientras cargaba y lanzaba un `easeTo` por tick. Ahora:
  - un solo listener;
  - ≤ 4 actualizaciones por segundo;
  - nada si el movimiento es < ~1 m;
  - sin pisar una animación en curso.

## Pendiente
- Persistir la EVA (sessionStorage) y pasar el liderazgo en `pagehide`.
- Layout para tablet.
- DONKI cacheado en el backend.
- Foto real del robot de ejemplo (hoy se usa la de Perseverance).
- Astronauta del home sin crédito.

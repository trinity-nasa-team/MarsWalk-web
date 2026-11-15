# 2026-11-15 — EVA en pareja: aviso de "sin rescate" y señal de radio en el plan

## Qué se ve
- **Paso 04 del plan, "Pareja de astronautas":**
  - peso y O₂ de A y B (por defecto 80 kg y 70 kg, 380 L cada uno);
  - casilla "Evitar zonas sin señal del hábitat", activa por defecto.
- **Al calcular la ruta**, además de los tramos se llama a `api.crewCheck` (`/eva/crew-check`, solo en Jezero).
  Aparece **"Seguridad de la pareja"** con:
  - **✓** si el otro puede traer de vuelta al lesionado desde cualquier punto;
  - **⚠** "Desde los X km de recorrido, si a uno de los dos le pasa algo ya no alcanzan a volver… (entre la parada
    N y la N+1)", con la sugerencia de buscar una misión más segura;
  - **⛔** si aun sin incidentes falta O₂ para volver;
  - O₂ usado y % al volver de cada astronauta, y % de la ruta sin señal.
- **En el mapa:**
  - punto rojo parpadeante donde se pierde el rescate;
  - línea naranja punteada en los tramos sin señal.
- **"Iniciar EVA" con ⚠ o ⛔:** se muestra el aviso arriba del botón y se pide confirmación antes de salir.
- **Rutas:** los tramos (y el replaneo durante la EVA) mandan `habitat` y `avoid_no_signal` a `replan-leg`.

## Código
- **`src/lib/crew.js`** (puro, con pruebas en `tests/crew.test.js`):
  - pareja por defecto y limpieza de valores;
  - veredicto y textos;
  - líneas sin señal y marcador para `MapView` (`extraLines` / `extraMarkers`).
- **`sim.js`:** el plan guarda `crew`, `avoidNoSignal` y `crewCheck`. `PLAN_SET` borra `crewCheck` (hay que
  recalcular) y `PLAN_LEGS` lo guarda.
- **Otros archivos:** `api.js`, `PlanView.jsx`, `store.jsx`, `i18n.js` (ES/EN) y `app.css` (`.marker-norescue`,
  `.crew-row`).

## Requiere
El backend con `/eva/crew-check` (MarsWalk-v2, rama `feat/eva-pareja`). Si no está, el plan se calcula igual: se
muestra el error de la revisión y no hay aviso.

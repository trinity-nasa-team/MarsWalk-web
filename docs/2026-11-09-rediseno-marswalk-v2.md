# 2026-11-09 — Marswalk: rediseño visual, menú único, 3D y sensor de radiación/UV

## Qué se hizo
- **Menú único**: el Inicio es el menú (4 módulos con ícono: Rutas, Hallazgos, EVA, Historia). Dentro de cada
  módulo, riel lateral con los mismos íconos. EVA agrupa Hábitat · HUD astronauta · Enlace Tierra en pestañas.
- **Inicio 3D** (`components/HeroScene.jsx`, three.js): Marte con textura Viking MDIM 2.1 (NASA/JPL/USGS), inclinación
  axial 25.19°, atmósfera, Fobos y Deimos (proporción real de periodos 7.66 h / 30.35 h; tamaños y órbitas no a escala),
  estrellas que titilan, polvo, estrellas fugaces, grano y viñeta. Astronauta 3D: traje planetario Mark III (NASA).
  Textura progresiva (1K → 4K). Datos de Marte en pie de página: sol 24 h 39 min 35 s, g 3.71 m/s², Jezero 45 km.
- **Hallazgos** (`views/FindingsView.jsx`, `lib/findings.js`): galería de fotos/notas/peligros/muestras/errores,
  en localStorage. «Capturar imagen» en Rutas y en EVA (foto del mapa + notas).
- **Estado robot/astronauta** (`lib/vitals.js`, `components/Gauges.jsx`): batería, O₂, energía del traje, alertas.
- **Sensor de radiación y UV del robot** (`lib/radiation.js`): dosis base Curiosity RAD 0.21 mGy/día (Hassler et al.
  2014); tormenta de referencia 20-may-2024, 8,100 µGy (NASA/JPL); alerta «terminar EVA en ≤ 2 h» (NASA OCHMO);
  UV-B+C 13.2 W/m² y UV-A 41.5 W/m² con Sol en el cénit, τ = 0.1 (Cockell et al. 2000, modelo); atenuación por polvo
  −90 % de τ≈1 a τ≈8.5 (REMS, 2018). Consulta en vivo a NASA DONKI (SEP, 72 h) con respaldo si no responde.
- **EVA**: panel derecho con pestañas grandes (Estado, Cámara, Tramo, Acciones, Bitácora); se abre «Acciones» sola
  cuando el robot propone una ruta. Controles de pausa/velocidad sobre el mapa.
- **Rutas**: panel de capas plegable, agrupado (Imagen, Terreno para caminar, Ciencia, Referencias) con ayuda por capa.
- **Comparar**: KPIs, barras (distancia, tiempo, pendiente) y flujo del orden de visita; tabla técnica en desplegable.
- **HUD**: tarjeta «Qué hacer ahora» por estado, medidores y lectura de radiación/UV.

## Decisiones
- Los modelos GLB de NASA usan Draco: decodificador servido desde `marswalk/public/draco/` (copiado de
  `three/examples/jsm/libs/draco/gltf`). Sin dependencias nuevas.
- Supuestos marcados en la UI: O₂ 8 h, traje 10 h, robot 25 km; variación diaria de dosis ±2.5 %; tormenta repartida
  en 24 h; τ = 0.5; equinoccio; EVA desde las 09:00 LMST. No se muestra «índice UV» (no hay uno publicado para Marte).
- DONKI usa `VITE_NASA_API_KEY` o `DEMO_KEY`. Para producción: clave propia detrás del backend (no en el frontend).

## Pendiente
- Confirmar licencia y crédito exacto de `astronaut.glb`, `astronaut-alt.glb` y `perseverance.glb` (origen: recursos
  3D de NASA; falta registrar la URL de cada uno) y de `mars-texture.jpg`.
- Mapa de relieve MOLA (`mars-bump.jpg`) no se descargó completo.
- En Edge sin interfaz (capturas automáticas) el decodificador Draco no termina con el ciclo de render activo; hay que
  validar el astronauta 3D en un navegador normal.
- `astronaut.jpg`, `mars-globe.jpg` ya no se usan en el Inicio (quedan como respaldo de las fichas).
- Commit y PR de la rama `feat/rediseno-frontend` (pendiente de visto bueno del usuario).

## Actualización (misma fecha, tarde)
- Fichas de astronauta y robot: franja compacta con el render 3D centrado (como la pista de la EVA).
- Lecturas del traje (simuladas, umbrales reales NASA-STD-3001 Vol 2 Rev F): presión 29.6 kPa ±1.72 (V2 11007),
  CO₂ inspirado con tramos 4/7/10/15 mmHg (Tabla 11.3-1), metabolismo ≈800 BTU/h promedio, 1600 alto (Gernhardt, NASA).
- Simulaciones en el estado de la EVA (`eva.sims`, se registran en bitácora y se sincronizan entre pestañas):
  tormenta solar (ref. 20-may-2024), tormenta de polvo regional (τ → 4; vientos ≤ ~97 km/h, aire ~1 % de la Tierra;
  NASA «Fact and Fiction of Martian Dust Storms») y remolino de polvo (Jezero ≥ 4 por sol; el de 30-ago-2023 ~60 m de
  ancho, ~2 km de alto, ~19 km/h — NASA/JPL). Cada una con animación sobre el mapa.
- Bitácora: ahora registra O₂, energía del traje, batería del robot (40 % y 20 %) y CO₂ (4 y 7 mmHg).
- Inicio: astronauta Mark III girado 180° (el modelo mira hacia −Z); marcador de Jezero en el globo 3D en
  18.4° N, 77.5° E (textura Viking −180…180 verificada con el Monte Olimpo en u≈0.127).
- Pendiente: frecuencia cardiaca (NASA la monitorea, pero no hay rango numérico confirmado: no se muestra).

## Actualización (noche)
- Inicio: astronauta 2D estático (foto real recortada del prototipo xEMU, NASA/Joel Kowsky, NHQ201910150005, 15-oct-2019)
  en lugar del modelo 3D; gradación y luz cálida en CSS. La imagen de Interstellar del usuario no se usa (derechos de autor).
- Marte: el lienzo aparece completo con fundido cuando carga la textura ligera (tope de 2.5 s); se quitó el GLB del preload.
- EVA: botón ↻ para reiniciar la EVA con la misma ruta.

## Actualización 2026-11-11 — astronauta interactivo y tema claro
- Inicio: astronauta flotante (`FloatingAstronaut.jsx`, `public/img/astronaut-float.webp`, 57 KB) con paralaje al
  puntero (rAF solo mientras se mueve), deriva en CSS y voltereta al tocarlo (WAAPI). Respeta «reducir movimiento».
  La imagen del usuario traía el tablero de transparencia «pintado» (RGB): se recortó con script por celdas.
- Tema claro/oscuro: botón ☀/☾ en la barra superior, `lib/theme.js`, guarda en localStorage, `?theme=light|dark` en la
  URL; por defecto oscuro. Claro = paleta «cielo marciano de día» (arena, texto café, acentos ámbar oscuros) vía tokens
  + overrides de paneles translúcidos. Sin estrellas en claro.
- Pendiente: confirmar licencia/origen de la imagen del astronauta (parece banco de imágenes tipo Freepik; no es NASA).
  Revisar en navegador real las vistas EVA/HUD/Comparar en modo claro. Bordes del recorte con restos mínimos.

## Actualización 2026-11-11 (b) — Marte inequívoco y fichas estandarizadas
- Globo del Inicio: se quitaron las líneas de órbita (parecían anillos), el contraluz azul y el halo grande (parecía
  gigante gaseoso). Queda limbo de polvo delgado y cálido; Fobos y Deimos siguen orbitando sin línea.
- Rendimiento: DPR ≤ 1.5, esfera 96 segmentos, 1400 estrellas, 320 motas, sin `mars-bump.jpg` (no existía: 404),
  render en pausa fuera de vista o con la pestaña oculta.
- Fichas robot/astronauta: ya no renderizan los GLB (Perseverance 5 MB + Draco, causa de la lentitud). Usan miniaturas
  `thumb-rover.webp` / `thumb-astronaut.webp` (256×256, sujeto centrado, misma gradación y viñeta; 14–18 KB) de las fotos
  NASA ya existentes. `lib/modelShot.js` quedó sin uso (no se borró; pendiente confirmar).
- (c) Miniatura del astronauta: figura recortada de la foto STS-41B (sin el negro del espacio ni la Tierra) sobre el
  paisaje rocoso de Marte (`mars-landscape.jpg`) con sombra, misma gradación que la del robot. Es una composición
  ilustrativa (la foto real es en órbita terrestre). Subtítulos de las fichas corregidos: ya no dicen «Modelo 3D».

## Actualización 2026-11-11 (d) — HUD explicado, fichas, animaciones y estética
- HUD: tarjeta «Visor del astronauta» arriba a la izquierda con explicación, leyenda de símbolos (tú, robot, hábitat,
  parada, ruta, peligro) y botones «Avisos por voz: sí/no» y «Centrar en mí» (ya no se enciman con «Qué hacer ahora»).
  La ayuda se puede ocultar y se recuerda (`marswalk.hudHelp`).
- Fichas: astronauta como recorte transparente sobre el paisaje de la franja (sin cuadro ni corte); robot con borde
  difuminado; sin el subtítulo «Imagen de referencia» (queda como tooltip); nombre completo en 11 px.
- Animaciones: fuera el grano animado con blend, el anillo punteado girando, los backdrop-filter sobre WebGL y el blend
  multiply del polvo; remolino con transform (antes `left`), tormenta solar con opacity (antes box-shadow); Starfield no
  dibuja en el Inicio ni en tema claro; Órbitas a 30 fps y en pausa con la pestaña oculta.
- Estética: menos brillos y sombras de texto; hover de módulos sobrio.
- Pendiente: validar el HUD con una EVA activa en navegador real; una pasada de diseño más profunda (tipografía, retícula,
  densidad) requiere plan aparte.

## 2026-11-12 — 018: IA del Hábitat en el HUD (Groq)
- Backend: `POST /api/habitat/chat` (`routers/habitat.py`). Prompt de sistema del usuario (IA del Hábitat/Centro de
  Control, 2–3 oraciones) + bloque de telemetría simulada (O₂, traje, batería del robot, distancias, pendiente,
  peligros, solicitud pendiente, tormenta solar) + idioma. Validación Pydantic (mensaje ≤ 400, historial ≤ 8),
  límite 12/min por IP (`CHAT_RATE_LIMIT_PER_MINUTE`), errores como `ErrorOut`; sin clave → 503
  `assistant_unavailable`. La clave solo en el backend (`GROQ_API_KEY`, `.env` local ignorado por git).
- Groq: API compatible con OpenAI por `urllib` (sin dependencias nuevas). Hallazgos: Cloudflare devuelve 403 sin
  `User-Agent` propio; los modelos Llama ya no están en esta cuenta → por defecto `openai/gpt-oss-120b`
  (disponibles: allam-2-7b, gpt-oss-120b/20b, qwen3.8-27b). Prueba real OK (~600 tokens por turno).
- Frontend: `HabitatChat.jsx` dentro de la tarjeta «Visor del astronauta» del HUD: chips rápidos, historial corto
  (6 turnos), estados de carga/error, i18n es/en. `api.habitatChat`.
- Arranque: `uvicorn marsmap.api.main:app --app-dir src --env-file .env` (requiere `python-dotenv`, agregado a pyproject el 2026-11-12).
- Pruebas: `tests/api/test_habitat.py` (4, con modelo fingido). Pendiente: rotar la clave que se pegó en el chat;
  decidir si el chat también va en la pestaña Hábitat; streaming no implementado (respuestas cortas, no hace falta).

## 2026-11-12 (b) — Autorizar por voz desde el HUD y mapa sin cuadros negros
- HUD: botón 🎤 en el chat (Web Speech API, Chrome/Edge; se oculta si no hay soporte). «Autorizo / apruebo / confirmo
  la nueva ruta» se resuelve en local (dispatch `APPROVE`, sin pasar por la IA); con «no/cancela/rechaza» no autoriza.
  Lo demás va a la IA del Hábitat. Con «Avisos por voz: sí», el hábitat responde hablando. Botón visible
  «Autorizar nueva ruta» en «Qué hacer ahora» cuando hay ruta pendiente. Chip rápido 3 = «Autorizo la nueva ruta».
- Mapa: fondo `#4a3328` (antes negro), capa base `g-base` z ≤ 4 que cubre al instante, opacidad inicial correcta (antes
  arrancaba en 0 y se fundía desde negro), `raster-fade-duration` 0 en la imagen principal y `fadeDuration` 120 ms.
- Nota: el reconocimiento de voz de Chrome/Edge procesa el audio en servidores del navegador (Google/Microsoft).
- Pendiente: reiniciar backend con `--env-file .env` (el que corría era anterior: `/api/habitat/chat` daba 405);
  rotar la clave de Groq.
- 2026-11-12 (c): backend reiniciado con la clave; chat verificado en vivo. `python-dotenv` instalado en `.venv` y
  agregado a `pyproject.toml`. Verificado: la clave no está en ningún archivo del repo ni en el historial de git, y
  `.env` no está rastreado. Clave rotada por el usuario el 2026-11-12; backend reiniciado con `--env-file .env` y chat verificado.
- 2026-11-12 (d): `iniciar.bat` en la raíz: compila y arranca todo (API + web + .env) y abre el navegador.

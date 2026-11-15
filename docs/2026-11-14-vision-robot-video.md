# 2026-11-14 — Visión del robot en video (AI4Mars ↔ S5Mars)

> **Cambio (misma fecha):** a pedido del usuario se quitó la pestaña aparte "Visión IA" (y el video de recorrido).
> La segmentación ahora corre **en tiempo real sobre la cámara del robot** (Hábitat → Cámara, NAVCAM · SCOUT-1):
> panel con Apagada / AI4Mars / S5Mars, opacidad, leyenda en vivo y "Reportar al robot". Hook `useSegmentation`.
> **Resultado medido sobre el render 3D (no es foto):** AI4Mars ≈ 100 % "arena", S5Mars ≈ 81 % "arena" → la
> segmentación no es significativa sobre el render; el aviso de peligro salta siempre. Se etiqueta como demostrativo.
> **Versión final (misma fecha):** la cámara del robot muestra por defecto la **foto real de Perseverance más
> cercana** a su posición (55 fotos de la Hazcam frontal a lo largo del recorrido real, soles 13–1349, a ≤10 km del
> aterrizaje, `public/img/robotcam/`, generadas con `MarsWalk-v2/scripts/fetch_robot_photos.py`), con transición al
> cambiar y barrido de escaneo al segmentar. La IA **solo corre sobre fotos reales**; en "Render 3D" se apaga (sobre
> el render gris todo salía "arena"). Ej. medido: S5Mars sobre sol 13 → roca madre 67 %, roca suelta 26 %, suelo 4 %.
> **Feed de video (misma fecha):** la cámara reproduce como video la secuencia real de la Hazcam de Perseverance
> (106 cuadros, 2 por sol, puntos cada ≥120 m, `public/img/robotfeed/`): arranca en el cuadro más cercano al robot y
> avanza uno cada 60 m que camina (acercamiento + fundido; en pausa si la simulación se pausa). La IA predice sobre el
> feed en bucle (AI4Mars ≈ 2.2 cuadros/s, S5Mars ≈ 0.7). Modelo en **lista desplegable** con mIoU e IoU de arena, y
> tarjeta comparativa (mIoU, exactitud, IoU arena, clases, ms en vivo) con la recomendación: AI4Mars para arena,
> S5Mars para detalle. Métricas de cada informe en su propio test: comparación orientativa.
> Lo de abajo describe la primera versión (pestaña aparte) y queda como historial.

## Qué se hizo
- Pestaña **Hábitat → Visión IA**: segmentación de terreno **cuadro por cuadro sobre video**, en el navegador
  (onnxruntime-web 1.30.0, WASM, dentro de un Web Worker). Cambio de modelo en vivo sin detener el video.
- Fuentes: recorrido armado con 8 fotos reales de la Hazcam frontal de Perseverance (soles 106–353,
  NASA/JPL-Caltech; `public/img/vision/jezero_hazcam_recorrido.mp4`, 20 s, **no es un video continuo**), video o
  foto propia, o cámara del equipo. Nada sale del equipo.
- Si la IA ve arena/rocas/hoyos por encima del umbral, botón **"Reportar al robot"** → `ROBOT_DETECT` (desvío).

## Modelos (`public/models/vision/`, generados con `MarsWalk-v2/scripts/export_vision_onnx.py`)
| Modelo | Entrada | Clases | ONNX | Fidelidad vs PyTorch* | mIoU (informe) |
|---|---|---|---|---|---|
| AI4Mars (DeepLabV3+ resnet34) | gris 384 px, contraste p1–p99 | 5 | int8 QDQ, 22.7 MB | 98.8 % píxeles | 0.81 (test_min3) |
| S5Mars (DeepLabV3+ resnet50) | RGB 512 px | 9 | pesos fp16 + cálculo fp32, 53.4 MB | 99.9 % píxeles | 0.78 (test) |

\* Sobre 16 cuadros de las fotos de Hazcam (las mismas usadas para calibrar int8): mide fidelidad de la conversión,
no exactitud. S5Mars en int8 daba 93 % → se usó fp16 de pesos. onnxruntime-web (WASM) = onnxruntime Python al 100 %.

## Verificación
- `pnpm test` 39/39 (preprocesamiento JS idéntico a numpy con fixtures generados por el script de exportación).
- `pnpm build` OK. Prueba en Chrome real (headless): video en vivo con ambos modelos, cambio en caliente y reporte.
  Velocidad medida (dev, 1 hilo): AI4Mars ≈ 2 cuadros/s (~460 ms), S5Mars ≈ 0.6 cuadros/s (~1.5 s).

## Limitaciones / pendiente
- Entrenados con fotos de Curiosity y rovers anteriores, no de Perseverance/Jezero: dominio distinto (lente gran
  angular de la Hazcam). Ej.: S5Mars marca parte del horizonte como "hoyo" (falso positivo).
- Primera carga: 23–53 MB por modelo (luego caché del navegador). Sin COOP/COEP no hay hilos de WASM; con esos
  encabezados en Vercel podría ir 2–4× más rápido.
- El checkpoint resnet34 de S5Mars no se incluyó (sin informe de métricas).

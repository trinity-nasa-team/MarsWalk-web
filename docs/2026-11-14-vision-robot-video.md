# 2026-11-14 — Visión del robot en video (AI4Mars ↔ S5Mars)

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

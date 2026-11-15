# 2026-11-14 — Cámara en vivo del robot con segmentación semántica en tiempo real

## Qué es
Hábitat → **Cámara → "Cámara en vivo"**: se conecta la cámara montada en el robot (USB, webcam o celular) o un
video, y la IA segmenta el terreno **cuadro por cuadro sobre el video en vivo**, como un detector tipo YOLO pero por
píxel: máscara de colores, rótulos por región (clase + %), leyenda, alerta de peligro y botón "Reportar al robot"
(`ROBOT_DETECT`). "Simulada (render 3D)" conserva la cámara anterior de la simulación (sin IA: los modelos no
reconocen el render gris).

## Tres vistas en Hábitat → Cámara
1. **Cámara en vivo**: la cámara del robot (USB/webcam/celular) o un video.
2. **Recorrido por Marte**: 93 fotos REALES de la Hazcam frontal de Perseverance (NASA/JPL-Caltech) en el orden de su
   recorrido por Jezero, ligadas a lo que camina el robot (un cuadro cada 60 m, con acercamiento y fundido); la misma
   IA en tiempo real encima. No es video continuo (son fotos sueltas).
3. **Simulada (render 3D)**: la cámara anterior de la simulación, sin IA.

## Estandarización de la imagen (interruptor, activado)
Corrige el balance de blancos (gray-world) y estira la luminancia p1–p99 con el mismo factor en los 3 canales antes de
la IA, para que cambios de cámara, luz o exposición afecten menos. Medido como **estabilidad** de la predicción ante
brillo ×0.6/×1.5, gamma 0.6/1.8, tinte rojo/azul, contraste ×0.6, ruido y desenfoque (14 fotos, calidad Rápida; es
consistencia, NO exactitud): S5Mars 0.63 (sin nada) → 0.83 (balance de blancos) → **0.86** (+ estirado); AI4Mars 0.92
con o sin (ya estira el contraste de cada foto como en su entrenamiento). Replicado en `export_vision_onnx.py` con
prueba de paridad JS↔numpy. Lo que NO arregla: un dominio muy distinto (otra óptica, otro terreno) pide reentrenar.

## Cómo logra tiempo real (todo en el navegador, el video no sale del equipo)
- **Grupo de Web Workers** (hasta 4, uno por cada 4 hilos lógicos) que procesan cuadros alternos en paralelo; los
  cuadros se toman al momento de enviarlos y se descartan si todos están ocupados (siempre se procesa lo más reciente).
- **Modelos de tamaño dinámico** (`scripts/export_vision_onnx.py`, múltiplos de 16): calidad **Rápida / Normal / Alta**
  = 50 / 75 / 100 % de la resolución nativa.
- **Suavizado temporal** (media móvil exponencial de las probabilidades) contra el parpadeo y **umbral de confianza**
  (60 % por defecto): lo dudoso no se pinta y se reporta como "Sin clasificar".
- Peligros confirmados solo si aparecen en ≥ 4 de los últimos 6 cuadros.

## Medido (Chrome en la laptop de desarrollo, 32 hilos, video de 640×480)
| Modelo / calidad | Resolución IA | Cuadros/s | Latencia |
|---|---|---|---|
| AI4Mars Rápida | 192 px | ~30 | ~125 ms |
| AI4Mars Normal | 288 px | ~15 | ~280 ms |
| AI4Mars Alta | 384 px | ~8–9 | ~510 ms |
| S5Mars Rápida | 256 px | ~8–10 | ~435 ms |
Probado con una cámara falsa de Chrome alimentada con fotos reales de Perseverance. **No probado con el robot ni con
una cámara física.** Otras máquinas darán otras cifras.

## Calidad: límites conocidos
- Entrenados con rovers de la NASA (AI4Mars: Curiosity y anteriores; S5Mars: Curiosity), no con la cámara del robot ni
  con Jezero: **con otra cámara u otro terreno pueden fallar**. A calidad Rápida, la coincidencia de píxeles con la
  predicción de resolución nativa es ~76–78 % (informativo).
- S5Mars es de color natural; se aplica balance de blancos en la entrada. Sobre fotos de la Hazcam deja casi todo sin
  clasificar con umbral 60 % (preferible a pintar ruido).
- Si el robot trae su propia cámara, lo correcto es **ajustar (fine-tune) con imágenes de su cámara y su terreno**.

## Notas técnicas
- `onnxruntime-web` 1.30.0 (solo WASM, 1 hilo por worker). WebGPU se probó: en una GPU integrada Intel solo mejora a
  S5Mars (655 vs 1583 ms) y no a AI4Mars; WASM multihilo no ayudó. Se descartaron.
- La cámara del navegador exige https o localhost.
- Modelos en `public/models/vision/` (AI4Mars int8 22.7 MB, S5Mars pesos fp16 53.4 MB), generados con
  `MarsWalk-v2/scripts/export_vision_onnx.py`.

## Historial de esta sesión
Primero se probó segmentar fotos de Perseverance como "feed" simulado; se descartó porque el usuario necesita una
cámara real en el robot.

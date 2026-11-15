# 2026-11-14 — Cámara del robot: en vivo, recorrido por Marte y simulada

## Estado: SIN modelo de visión instalado
Se probaron AI4Mars y S5Mars (DeepLabV3+, entrenados con fotos de Curiosity y rovers anteriores) y el equipo los
**descartó por mala calidad**: sobre una cámara web pintaban techos y paredes como "arena" con 95 %+ de confianza (sin
una clase "no terreno" no saben decir "esto no es terreno") y sobre fotos de la Hazcam de Perseverance dejaban casi
todo sin clasificar. Se quitaron del repo (siguen en el historial de git, commits `7d389b7`…`fb012f6`).
La infraestructura quedó lista para un modelo mejor.

## Tres vistas en Hábitat → Cámara
1. **Cámara en vivo**: cámara USB/webcam/celular o un video (lista de cámaras, pausa, pantalla completa). Sin modelo,
   solo se ve el video.
2. **Recorrido por Marte**: 93 fotos REALES de la Hazcam frontal de Perseverance (NASA/JPL-Caltech) en el orden de su
   recorrido por Jezero, ligadas a lo que camina el robot (un cuadro cada 60 m, con acercamiento y fundido). Son fotos
   sueltas, no video continuo. Se regeneran con `MarsWalk-v2/scripts/fetch_robot_photos.py`.
3. **Simulada (render 3D)**: la cámara anterior de la simulación.

## Cómo enchufar un modelo (cuando haya uno bueno)
Si hay modelos instalados, aparecen solos el selector, calidad, umbral, rótulos por región (con confianza), leyenda,
alerta de peligro, reporte al robot y la tarjeta de métricas.
1. Copiar `<id>.onnx` y `<id>.json` a `public/models/vision/` y agregar el id a `public/models/vision/index.json`:
   `{"models": ["mi_modelo"]}`.
2. El `.onnx`: entrada `input` 1×3×H×W (H y W dinámicos, múltiplos de 16), salida `logits` 1×C×H×W.
3. El `.json` (ejemplo): `file`, `name`, `size` (lado nativo), `input` {`kind`: "rgb"|"gray", `contrast_stretch`,
   `mean`, `std`, `white_balance`, `standardize`}, `classes`, `classes_en`, `colors` ([r,g,b] por clase),
   `ignore_in_share` (clases que no son terreno), `hazards` ({clase: fracción mínima}), `metrics` (`test_miou`,
   `acc`, `cpu_ms_ref`, …), `summary`, `limitations`.
4. **Recomendado:** incluir una clase "no terreno" (para que no pinte personas ni techos) y entrenar/ajustar con
   imágenes de la cámara y el terreno del robot. Un modelo sin eso volverá a fallar igual.

## Lo que se conserva (genérico, probado)
- Grupo de Web Workers en paralelo (onnxruntime-web 1.30.0, WASM) con cuadros alternos, tamaño dinámico (calidad
  Rápida/Normal/Alta), suavizado temporal, umbral de confianza, balance de blancos + estirado de exposición opcionales.
  Con los modelos descartados se midieron ~30 cuadros/s (calidad Rápida, 192 px, laptop de 32 hilos) cuando la máquina
  estaba libre, y ~5 cuando algo competía por CPU.
- Pruebas: preprocesamiento JS ↔ numpy con fixtures (`tests/fixtures_vision.json`), posproceso, rótulos, feed.
- `MarsWalk-v2/scripts/export_vision_onnx.py` (PR #8) exportaba AI4Mars y S5Mars; sirve de plantilla para otro modelo.

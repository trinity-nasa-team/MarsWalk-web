# 2026-11-15 · IA de rocas sobre la cámara del robot

**Qué se hizo**
- `src/components/RockAI.jsx`: capa que se monta sobre el canvas de `RobotCamera` (no toca su lógica) y pinta las rocas encima. Botón «IA rocas» en la cámara: apagada → servicio → navegador.
- **Servicio** (`MarsWalk-v3/scripts/rock_service.py`): Grounding DINO + SAM + U-Net AI4Mars en la GPU del equipo. Preciso; ~1–2 s por cuadro en modo rápido (estimado). El visor lo llama por `/rocks` (proxy de Vite → `127.0.0.1:8765`; otro destino con `ROCKS_PROXY_TARGET`). No corre en el navegador ni en la Raspberry.
- **Navegador**: RockSeg v2 (U-Net MobileNetV2, 26 MB, onnxruntime-web WASM en Web Workers). Rápido pero experimental. Archivos en `public/models/vision/` (`rockseg.onnx`, `rockseg.json`, `index.json`).
- `src/lib/vision.js` y `visionWorker.js`: preprocesado, posproceso y pool de workers (entrada fija 320×480, salida remuestreada a máscara cuadrada).

**Cómo usarlo**
1. `pnpm install` · `pnpm dev`.
2. (Solo modo servicio) en `MarsWalk-v3`: instalar `scripts/requirements-rocks.txt` y `python scripts/rock_service.py` (la primera vez baja ~3.5 GB de Hugging Face).
3. Con la cámara en vivo, pulsar «IA rocas».

**Verificado:** 75 pruebas unitarias y `pnpm build`.
**No verificado:** con la cámara real conectada (la cámara estaba desconectada al cerrar esto). Revisar el alineado del overlay en HUD (`pip`) y hábitat (`full`).

**Limitaciones**
- RockSeg se entrenó con rocas lunares sintéticas y se reajustó con cuadros de una escena de oficina. Contra el pipeline en fotos de Marte: precisión 0.23, recall 0.46. En interiores o con otras vistas puede marcar equipo, sombras y partes del robot como roca. Umbral por defecto 0.85 (supuesto).
- El servicio y sus modelos (Grounding DINO, SAM) tienen licencias propias: revisar antes de uso comercial.
- Esto **no** alimenta al planificador: el contrato 02b (§3, §3.3) espera un GeoTIFF orbital (Dani) o un reporte `camera_ai` por MQTT con confianza ≥ 0.7. Pendiente decidir con Paul y Josué.

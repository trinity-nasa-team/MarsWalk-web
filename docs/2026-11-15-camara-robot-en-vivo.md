# 2026-11-15 — Cámara REAL del robot en vivo (Raspberry Pi)

## Qué se hizo
- **Fuente:** Raspberry Pi (Debian 13, aarch64) con cámara USB HBV HD y **µStreamer 5.4** (`/stream` MJPEG,
  `/snapshot`, `/state`). Configuración elegida por medición: **320×240 a 15 FPS** (la cámara no entrega más de
  ~15 FPS reales con poca luz; pedir 30 empeoraba las pausas). CORS abierto (`--allow-origin=*`): el stream es público.
- **Publicación:** Cloudflare Quick Tunnel en **HTTP/2** desde la Raspberry (sin cuenta ni dominio). La URL
  `*.trycloudflare.com` **cambia en cada reinicio** del túnel o de la Raspberry.
- **Arranque automático:** `~/marswalk-cam.sh` en `@reboot` del crontab de la Raspberry (µStreamer + túneles, sin
  duplicar procesos). Probado reiniciando: todo vuelve solo en ~20 s; solo cambia la URL.
- **Web:**
  - `src/lib/camera.js`: URL (`VITE_CAMERA_URL` o `?cam=` en el enlace; `?cam=off` la apaga), estado de µStreamer,
    parser MJPEG incremental y **búfer de suavizado** (600 ms) que reproduce a ritmo fijo.
  - `src/components/RobotCamera.jsx`: canvas con rotación (la cámara está montada de lado; se recuerda por
    visitante), "sin señal" con reconexión automática y respaldo a `<img>` si el navegador no puede leer el stream.
  - **HUD del astronauta:** ventana junto a "Qué hacer ahora" (abajo a la izquierda), con Agrandar/Reducir.
  - **Hábitat → Cámara:** selector *En vivo (real)* / *Simulada (3D)*; abre en vivo si hay cámara.
  - Etiquetada como **REAL** y "Prototipo del robot en la Tierra… No es una imagen de Marte".

## Mediciones (local vs túnel, mismos cuadros)
- Local: ~15 FPS, sin pausas > 200 ms. Túnel: mismos FPS promedio pero **a ráfagas** (pausas de ~0.5 s) y
  +0.3 a +0.7 s de retraso. HTTP/2 fue más estable que QUIC. El búfer de la web absorbe las ráfagas.
- Conexión de la Raspberry: hotspot de un celular (señal 92 %, subida 15–22 Mbit/s, ping 42 ms). Cada espectador
  usa ~1.3 Mbit/s → ~10–15 espectadores simultáneos.

## Decisiones
- No se usó `camara.flotaya.com.mx`: esa zona está *pendiente* en la cuenta de Cloudflare a la que tenemos acceso
  (los nameservers activos son de otra cuenta). Cambiar nameservers podría tumbar el sitio de FlotaYa.
- No se tocó `carmesiservices.com` (dominios en uso). Se descartó por ahora un relay propio en AWS.
- Retraso de ~0.6 s a cambio de fluidez: aceptable para una demo.

## Pendiente
- URL fija para la cámara (para que reiniciar no obligue a actualizar `VITE_CAMERA_URL`).
- Tras cada reinicio: URL nueva con
  `grep -o "https://[a-z0-9-]*\.trycloudflare\.com" ~/logs/cam-quick-h2.log | tail -1` en la Raspberry, y
  actualizar `VITE_CAMERA_URL` en Vercel (o usar `?cam=` mientras tanto).
- Visión con IA sobre los cuadros (ya se leen por `fetch` con CORS); falta un modelo con clase "no terreno".

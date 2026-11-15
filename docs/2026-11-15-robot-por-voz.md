# 2026-11-15 — Mover el robot REAL por voz y botones desde el HUD

## Qué se hizo
- **Raspberry:** `~/robot_server.py` (Python estándar + gpiozero). L298N, 4 motores (2 por lado en paralelo):
  izquierdos IN1=17, IN2=27, ENA=22; derechos IN3=23, IN4=24, ENB=25. El motor izquierdo va cableado al revés
  (`LEFT_INVERTED = True`) y el sentido de giro se corrigió con `TURN_SIGN = -1`.
  - Órdenes físicas: `forward`, `backward`, `left`, `right`, `stop`. Cada una es un **pulso** (0.6 s) y se detiene sola;
    máximo ~3 órdenes por segundo; `stop` siempre pasa. Escucha solo en `127.0.0.1:8090`.
  - Publicado por el **mismo túnel de la cámara**: `quick.yml` manda `/robot/*` al servidor y lo demás a µStreamer.
  - En el arranque automático (`~/marswalk-cam.sh`).
  - Probado en el robot: avanzar, retroceder, girar izquierda y derecha correctos.
- **Web:** `src/lib/robot.js` (reconocimiento de órdenes por reglas, sin IA; envío al túnel; estado compartido).
  - Chat del HUD: «gira a la izquierda», «avanza», «retrocede», «alto» (y en inglés) mueven el robot; las preguntas
    no lo mueven. Responde y lo dice en voz alta si las alertas de voz están activas.
  - (Los botones bajo la cámara se probaron y se quitaron: la tarjeta queda solo con video.)
  - El visor del HUD ya no crece encima de la cámara (el chat hace scroll por dentro).

## Decisiones
- Sin PIN: cualquiera que abra la web puede mover el robot (parte de la demo); seguro por los pulsos cortos y el tope.
- El robot SOLO obedece órdenes explícitas (voz, texto, botones). La ruta simulada de la EVA nunca lo mueve: el espacio de la demo es reducido.
- Las órdenes se dan por el chat del HUD (voz o texto). Se quitaron los botones de la tarjeta de la cámara a pedido del equipo.
- Sin backend en medio: el endpoint público del backend no daría más protección que la propia Raspberry.

## Pendiente
- URL fija del túnel (si la Raspberry se reinicia cambia la URL de cámara y control).

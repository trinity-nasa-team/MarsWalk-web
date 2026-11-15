# 2026-11-15 — El robot real recorre la ruta de la EVA a escala (cuadro de 2×2 m)

## Qué se hizo
- **Rutas:** casilla «Move the real robot with the EVA (2×2 m square)» con mini-diagrama de la ruta a escala,
  la escala (p. ej. 1 km de Marte = 181 cm) y dónde colocar el robot (esquina inferior izquierda, centro a
  ~20 cm de cada borde, mirando ↑).
- `src/lib/robotPath.js` (con pruebas): pasa la ruta a metros, la **gira y escala** para que toda quepa saliendo
  de la esquina (margen de seguridad) y calcula el siguiente movimiento (giro en sitio + avance).
- `src/components/RealRobotFollower.jsx`: con la EVA en curso apunta ~12 cm por delante del marcador del robot de
  la simulación y mantiene ~0.8 s de tramos en cola; la Raspberry encadena los tramos rectos (avance continuo).
  Pausa → espera; reruteo → sigue la ruta nueva; ↻ → pide regresar el robot a la esquina («Robot in the corner»).
  STOP flotante siempre visible.
- **Raspberry** (`~/robot_server.py`, fuera de este repo): `POST /robot/move`, pose estimada en el cuadro (rechaza
  lo que saldría con 409), `pose/reset`, `test`, `calibrate`. Calibración (`~/robot_cal.json`): avance 40 cm/s
  (órdenes, 70 %), giro 195 °/s, avance en modo ruta 27.5 cm/s (45 %).

## Decisiones
- El robot sigue la ruta SOLO con START y la casilla activada (antes: la ruta nunca lo movía).
- Sin sensores: el recorrido es por tiempo; al terminar no vuelve al punto exacto (error acumulado, normal en la
  demo). Mejora futura: IMU (MPU-6050) y/o encoders.
- Mejor simulación: ×120 (≈17 cm/s, cercano a la velocidad del robot); ×30/×60 tienen pausas.

## Pendiente
- Si la Raspberry se reinicia cambia la URL del túnel: actualizar `VITE_CAMERA_URL` (Vercel y `.env.local`).

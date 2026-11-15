// Lleva el rover REAL por la ruta de la EVA a escala (cuadro de 2×2 m), al ritmo de la simulación.
// Solo actúa si el usuario activó "Move real robot" en Rutas y la EVA está en curso. Apunta un poco por DELANTE
// del marcador del robot en la simulación y mantiene ~0.8 s de tramos en cola: la Raspberry encadena los tramos
// rectos sin apagar los motores (avance continuo) y solo frena para girar. Pausa → espera; reruteo → sigue la
// ruta nueva; fin de la EVA → se detiene.
// Muestra un STOP flotante mientras está activo.
import { useEffect, useRef, useState } from 'react';
import { pointAt } from '../lib/geo.js';
import { ROBOT_LEAD_M } from '../lib/sim.js';
import { useStore } from '../state/store.jsx';
import { getFollow, onFollow, robotCommand, robotMove, robotPoseReset, robotState, setFollow } from '../lib/robot.js';
import { SQUARE, clampToSquare, nextMove, planToSquare } from '../lib/robotPath.js';

const TICK_MS = 150;
const QUEUE_AHEAD_MS = 800; // cuánto movimiento tener siempre en cola
const LOOKAHEAD_ROBOT_M = 0.12; // apuntar 12 cm (en el cuadro) por delante del marcador
const STEP = { minStep: 0.05, maxStep: 0.15, deadband: 12 };

export default function RealRobotFollower() {
  const { state, t } = useStore();
  const [follow, setF] = useState(null);
  useEffect(() => onFollow(setF), []);
  const live = useRef({ state: null });
  const readyRef = useRef(false); // pose inicial confirmada (robot en la esquina)
  const resetRef = useRef(null); // el efecto expone cómo reiniciar su pose local
  live.current.state = state;

  const enabled = !!follow?.enabled;
  const evaKey = state.phase === 'eva' ? `${state.plan.habitat}|${state.plan.legs?.length}` : null;

  useEffect(() => {
    if (!enabled || !evaKey) return undefined;
    let alive = true;
    readyRef.current = false;
    let lastSim = live.current.state.simTime_s ?? 0;
    let queueEnd = 0; // cuándo termina (estimado) lo que ya está en la cola del robot
    let retryAt = 0;
    let sending = false;
    let moves = 0;
    let pose = { x: SQUARE.start_m, y: SQUARE.start_m, heading_deg: 90 };
    let cal = { fwd_cm_s: 40, turn_deg_s: 195, route_fwd_cm_s: 18 };
    const s0 = live.current.state;
    const plan = planToSquare(s0.plan.habitat, s0.plan.legs || []);
    const lookaheadMars = LOOKAHEAD_ROBOT_M / plan.scale;
    setFollow({ status: 'starting', error: null, plan, pose, moves: 0 });

    (async () => {
      const st = await robotState();
      if (st.ok && st.data?.calibration) cal = { ...cal, ...st.data.calibration };
      const r = await robotPoseReset();
      if (!alive) return;
      readyRef.current = r.ok;
      setFollow(r.ok ? { status: 'following', pose } : { status: 'error', error: r.error });
    })();
    // Tras "Robot en la esquina ✓": pose local de vuelta al inicio y cola vacía
    resetRef.current = () => {
      pose = { x: SQUARE.start_m, y: SQUARE.start_m, heading_deg: 90 };
      queueEnd = 0;
      retryAt = 0;
    };

    const tick = setInterval(async () => {
      const s = live.current.state;
      const now = performance.now();
      // ↻ (reiniciar la EVA con la misma ruta): el tiempo de simulación vuelve a 0 → el robot espera a que lo
      // regresen a la esquina y se confirme con el botón.
      const simT = s.simTime_s ?? 0;
      if (simT + 1 < lastSim && readyRef.current) {
        readyRef.current = false;
        robotCommand('stop');
        setFollow({ status: 'reposition', error: null });
      }
      lastSim = simT;
      if (!alive || !readyRef.current || sending || now < retryAt) return;
      if (s.phase !== 'eva' || s.eva?.state === 'done') {
        if (getFollow().status !== 'done') setFollow({ status: 'done' });
        return;
      }
      if (!s.running) return; // simulación en pausa: el robot termina su cola y espera
      if (queueEnd - now > QUEUE_AHEAD_MS) return; // ya tiene suficiente movimiento en cola
      const { coords, cum } = s.eva.route;
      const p = pointAt(coords, cum, s.eva.progress_m + ROBOT_LEAD_M + lookaheadMars);
      if (!p?.pos) return;
      const m = nextMove(pose, clampToSquare(plan.toSquare(p.pos)), STEP); // nunca pedir salir del cuadro
      if (!m) return;
      sending = true;
      const r = await robotMove(m.turn_deg, m.drive_m);
      sending = false;
      if (!alive) return;
      if (r.ok) {
        pose = { x: m.end[0], y: m.end[1], heading_deg: m.heading_deg };
        const secs = (m.turn_deg ? Math.abs(m.turn_deg) / cal.turn_deg_s + 0.08 : 0) + (m.drive_m * 100) / cal.route_fwd_cm_s;
        queueEnd = Math.max(queueEnd, performance.now()) + secs * 1000;
        moves += 1;
        setFollow({ status: 'following', pose, error: null, moves });
      } else if (r.error === 'too_fast') {
        retryAt = performance.now() + 300; // cola llena: esperar
      } else {
        retryAt = performance.now() + 2000; // fuera del cuadro, robot caído o pose perdida: reintenta luego
        setFollow({ status: 'error', error: r.error });
      }
    }, TICK_MS);

    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, [enabled, evaKey]);

  if (!enabled || state.phase !== 'eva') return null;
  return (
    <div className="real-robot-stop" role="region" aria-label={t('rr.title')}>
      <span className="caption">
        {t('rr.title')} · {follow?.status === 'error' ? `✗ ${follow.error}` : t(`rr.st.${follow?.status || 'off'}`)}
      </span>
      {follow?.status === 'reposition' && (
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const r = await robotPoseReset();
            if (!r.ok) return setFollow({ status: 'error', error: r.error });
            resetRef.current?.();
            readyRef.current = true;
            setFollow({ status: 'following', error: null });
          }}
        >
          ✓ {t('rr.ready')}
        </button>
      )}
      <button
        type="button"
        className="btn danger"
        onClick={() => {
          robotCommand('stop');
          setFollow({ enabled: false, status: 'stopped' });
        }}
      >
        ■ {t('rr.stop')}
      </button>
    </div>
  );
}

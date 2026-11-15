// Panel en Rutas: activar "Move real robot" y ver la ruta a escala dentro del cuadro de 2×2 m,
// con dónde y hacia dónde colocar el robot (esquina inferior izquierda, mirando al frente ↑).
import { useEffect, useMemo, useState } from 'react';
import { onFollow, robotAvailable, setFollow } from '../lib/robot.js';
import { SQUARE, planToSquare } from '../lib/robotPath.js';

export default function RealRobotPanel({ t, habitat, legs }) {
  const [follow, setF] = useState(null);
  useEffect(() => onFollow(setF), []);
  const plan = useMemo(() => (habitat && legs?.length ? planToSquare(habitat, legs) : null), [habitat, legs]);
  if (!robotAvailable()) return null;

  const px = (m) => (m / SQUARE.size_m) * 100; // metros → % del dibujo
  const pts = plan ? plan.path.map(([x, y]) => `${px(x)},${100 - px(y)}`).join(' ') : '';
  return (
    <div className="real-robot-panel">
      <label className="rr-toggle">
        <input type="checkbox" checked={!!follow?.enabled} onChange={(e) => setFollow({ enabled: e.target.checked, status: 'armed' })} />
        <span>{t('rr.toggle')}</span>
      </label>
      {follow?.enabled && plan && (
        <div className="rr-body">
          <svg viewBox="0 0 100 100" className="rr-square" role="img" aria-label={t('rr.diagram')}>
            <rect x="0.5" y="0.5" width="99" height="99" className="rr-frame" />
            <polyline points={pts} className="rr-path" />
            <circle cx={px(SQUARE.start_m)} cy={100 - px(SQUARE.start_m)} r="3" className="rr-start" />
            <path
              d={`M ${px(SQUARE.start_m)} ${100 - px(SQUARE.start_m) - 4} l -3 5 h 6 z`}
              className="rr-start"
              transform={`translate(0 -5)`}
            />
          </svg>
          <ul className="rr-facts">
            <li>{t('rr.scale', { cm: (plan.scale * 1000 * 100).toFixed(0) })}</li>
            <li>{t('rr.length', { m: plan.length_m.toFixed(1) })}</li>
            <li>{t('rr.place')}</li>
            <li>{t('rr.pace')}</li>
          </ul>
        </div>
      )}
    </div>
  );
}

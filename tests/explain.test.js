import { describe, expect, it } from 'vitest';
import { explainList } from '../src/lib/explain.js';

const t = (k, p = {}) => `${k}|${Object.entries(p).map(([a, b]) => `${a}=${b}`).join(',')}`;

describe('explainList (explicaciones del planificador v4 → i18n)', () => {
  it('traduce umbrales, arena y pendiente', () => {
    const out = explainList(
      [
        'Astronaut thresholds: risk from 10°, blocked from 20° (fine slope = max of CTX 20 m and HiRISE 5 m p95).',
        '278 m over sand (penalized): no sand-free alternative was cheaper.',
        'Steepest cell 14.2° (risk zone): walk slowly.',
      ],
      t,
    );
    expect(out[0]).toBe('exp.thresholds|who=exp.who.astronaut|,risk=10,blocked=20');
    expect(out[1]).toBe('exp.sand|m=278');
    expect(out[2]).toBe('exp.steep|deg=14.2');
  });
  it('si la celda más empinada supera el bloqueo, es un extremo del tramo', () => {
    const out = explainList(['Astronaut thresholds: risk from 10°, blocked from 20° (x).', 'Steepest cell 20.7° (risk zone): walk slowly.'], t);
    expect(out[1]).toBe('exp.steepEnd|deg=20.7');
  });
  it('deja intactas las frases que no reconoce (A* legado)', () => {
    expect(explainList(['Sigue casi la línea recta: 1.2 km.'], t)).toEqual(['Sigue casi la línea recta: 1.2 km.']);
  });
});

describe('explainList: varios tramos', () => {
  it('no repite frases idénticas', () => {
    const leg = ['Avoids all mapped sand (HiRISE texture layer and scout-verified hazards).'];
    expect(explainList([...leg, ...leg], (k) => k)).toEqual(['exp.noSand']);
  });
});

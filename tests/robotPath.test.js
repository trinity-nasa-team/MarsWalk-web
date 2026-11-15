import { describe, expect, it } from 'vitest';
import { SQUARE, clampToSquare, fitRoute, insideSquare, nextMove, planToSquare, toXY } from '../src/lib/robotPath.js';

const HAB = [77.4509, 18.4446];
// Ruta de ejemplo (~1.3 km al SO y regreso), con una curva
const leg1 = { coords: [HAB, [77.448, 18.441], [77.443, 18.434]] };
const leg2 = { coords: [[77.443, 18.434], [77.4413, 18.4326]] };

describe('ruta a escala en el cuadro de 2×2 m', () => {
  it('pasa coordenadas a metros locales', () => {
    const [[x0, y0], [x1, y1]] = toXY([HAB, [HAB[0], HAB[1] + 0.001]], HAB);
    expect(x0).toBeCloseTo(0);
    expect(y0).toBeCloseTo(0);
    expect(x1).toBeCloseTo(0, 3);
    expect(y1).toBeCloseTo(59.3, 0); // 0.001° de latitud en Marte ≈ 59 m
  });

  it('toda la ruta cabe en el cuadro desde la esquina y el inicio queda en la esquina', () => {
    const plan = planToSquare(HAB, [leg1, leg2]);
    expect(plan.scale).toBeGreaterThan(0);
    for (const p of plan.path) expect(insideSquare(p), String(p)).toBe(true);
    expect(plan.toSquare(HAB)).toEqual([SQUARE.start_m, SQUARE.start_m]);
    expect(plan.length_m).toBeGreaterThan(1); // recorrido de metros, no centímetros
  });

  it('una ruta que rodea el inicio también cabe (con escala mucho menor)', () => {
    const around = [[100, 0], [0, 100], [-100, 0], [0, -100]];
    const fit = fitRoute(around);
    const t = (fit.theta_deg * Math.PI) / 180;
    for (const [x, y] of around) {
      const rx = x * Math.cos(t) - y * Math.sin(t);
      const ry = x * Math.sin(t) + y * Math.cos(t);
      expect(insideSquare([SQUARE.start_m + rx * fit.scale, SQUARE.start_m + ry * fit.scale])).toBe(true);
    }
    const oneSided = fitRoute([[0, 50], [0, 100]]); // ruta toda hacia un lado: aprovecha casi todo el cuadro
    expect(oneSided.scale).toBeGreaterThan(fit.scale * 5);
  });
});

describe('siguiente movimiento hacia el objetivo', () => {
  const pose = { x: 0.2, y: 0.2, heading_deg: 90 };

  it('no se mueve si ya está cerca', () => {
    expect(nextMove(pose, [0.22, 0.23])).toBeNull();
  });

  it('avanza recto si el objetivo está al frente (giro chico se omite)', () => {
    const m = nextMove(pose, [0.21, 0.5]);
    expect(m.turn_deg).toBe(0);
    expect(m.drive_m).toBeCloseTo(0.3, 2);
    expect(m.end[1]).toBeCloseTo(0.5, 2);
  });

  it('gira a la derecha (negativo) hacia un objetivo a la derecha y limita el tramo', () => {
    const m = nextMove(pose, [1.2, 0.2]);
    expect(m.turn_deg).toBe(-90);
    expect(m.drive_m).toBe(0.3);
    expect(m.heading_deg).toBe(0);
  });

  it('elige el giro corto (nunca más de 180°)', () => {
    const m = nextMove({ x: 1, y: 1, heading_deg: 170 }, [1.2, 0.98]);
    expect(Math.abs(m.turn_deg)).toBeLessThanOrEqual(180);
  });
});

describe('objetivo acotado al cuadro', () => {
  it('un punto fuera (regreso o desvío) se lleva al borde interior y el paso queda dentro', () => {
    const [cx, cy] = clampToSquare([-0.4, 2.6]);
    expect(cx).toBeCloseTo(0.1);
    expect(cy).toBeCloseTo(1.9);
    expect(clampToSquare([1, 1])).toEqual([1, 1]);
    const m = nextMove({ x: 0.15, y: 1.8, heading_deg: 90 }, clampToSquare([-1, 3]));
    expect(m === null || insideSquare(m.end)).toBe(true);
  });
});

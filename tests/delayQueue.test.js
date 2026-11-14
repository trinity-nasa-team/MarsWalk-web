import { describe, expect, it } from 'vitest';
import { partitionEarth, separationAngle } from '../src/lib/delayQueue.js';

describe('cola con retraso a la Tierra', () => {
  it('separa en tránsito y recibido', () => {
    const ev = [{ id: 1, t_s: 0 }, { id: 2, t_s: 600 }];
    const { inTransit, received } = partitionEarth(ev, 14 * 60 + 60, 14);
    expect(received.map((e) => e.id)).toEqual([1]);
    expect(received[0].age_min).toBeCloseTo(15, 6);
    expect(inTransit[0].eta_min).toBeCloseTo(9, 6);
  });
  it('el esquema da conjunción y oposición en los extremos', () => {
    expect(separationAngle(4.36)).toBeLessThan(0.05);
    expect(separationAngle(21)).toBeGreaterThan(Math.PI - 0.1);
  });
});

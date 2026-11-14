import { describe, expect, it } from 'vitest';
import { combineLegs } from '../src/lib/legs.js';

const leg = (coords, d, slope, risk) => ({
  coords,
  total: d,
  distance_m: d,
  max_slope_deg: slope,
  elevation_gain_m: 10,
  pct_risk_cells: risk,
  profile: [{ d_m: 0, elev_m: 0 }, { d_m: d, elev_m: 5 }],
  explanations: [`${d}`],
});

describe('combineLegs', () => {
  it('suma tramos sin duplicar el punto de unión y desplaza el perfil', () => {
    const c = combineLegs([leg([[0, 0], [1, 0]], 1000, 3, 0), leg([[1, 0], [2, 0]], 3000, 7, 4)]);
    expect(c.coords).toEqual([[0, 0], [1, 0], [2, 0]]);
    expect(c.distance_m).toBe(4000);
    expect(c.max_slope_deg).toBe(7);
    expect(c.pct_risk_cells).toBeCloseTo(3, 6);
    expect(c.profile.map((p) => p.d_m)).toEqual([0, 1000, 1000, 4000]);
    expect(c.elevation_gain_m).toBe(20);
  });
  it('sin tramos devuelve null', () => expect(combineLegs([])).toBeNull());
});

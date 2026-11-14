import { describe, expect, it } from 'vitest';
import { bearing, circle, cumulative, destination, haversine, MARS_RADIUS_M, pointAt, profileAt } from '../src/lib/geo.js';

describe('geo en Marte', () => {
  it('usa el radio Mars 2000', () => expect(MARS_RADIUS_M).toBe(3_396_190));
  it('1° de latitud ≈ 59.27 km', () => {
    expect(haversine([77.5, 18], [77.5, 19])).toBeCloseTo((Math.PI / 180) * 3_396_190, 0);
  });
  it('destination y bearing son inversos', () => {
    const p = [77.45, 18.44];
    const q = destination(p, 60, 2500);
    expect(haversine(p, q)).toBeCloseTo(2500, 3);
    expect(bearing(p, q)).toBeCloseTo(60, 3);
  });
  it('pointAt interpola y recorta', () => {
    const c = [[77.4, 18.4], [77.41, 18.4], [77.41, 18.41]];
    const cum = cumulative(c);
    expect(pointAt(c, cum, -5).pos).toEqual(c[0]);
    expect(pointAt(c, cum, 1e9).pos).toEqual(c[2]);
    const mid = pointAt(c, cum, cum[1] / 2);
    expect(mid.pos[0]).toBeCloseTo(77.405, 6);
    expect(mid.bearing).toBeCloseTo(90, 0);
  });
  it('circle cierra el anillo al radio pedido', () => {
    const ring = circle([77.45, 18.44], 10_000, 16);
    expect(ring[0][0]).toBeCloseTo(ring[16][0], 9);
    for (const p of ring) expect(haversine([77.45, 18.44], p)).toBeCloseTo(10_000, 0);
  });
  it('profileAt da elevación y pendiente', () => {
    const r = profileAt([{ d_m: 0, elev_m: 0 }, { d_m: 100, elev_m: 100 }], 50);
    expect(r.elev_m).toBe(50);
    expect(r.slope_deg).toBeCloseTo(45, 6);
  });
});

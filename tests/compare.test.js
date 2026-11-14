import { describe, expect, it } from 'vitest';
import { missionLegs, pickFullMission, realLegs, realOrder, sum, waypointFor } from '../src/lib/compare.js';

const pts = [
  [77.45, 18.44, 13, 0],
  [77.44, 18.44, 50, 1000],
  [77.43, 18.45, 90, 2500],
  [77.44, 18.44, 120, 4200], // vuelve a pasar cerca del punto 2 más tarde
  [77.42, 18.46, 200, 6000],
];
const S = (id, lon, lat, sol) => ({ id, name: id, pos: [lon, lat], sol: String(sol) });

describe('comparar con Perseverance', () => {
  it('ordena las muestras por sol (con soles dobles «194 & 196»)', () => {
    expect(realOrder([S('b', 0, 0, 90), S('a', 0, 0, 13), S('c', 0, 0, '194 & 196')]).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
  it('usa solo waypoints con sol ≤ el de la muestra', () => {
    expect(waypointFor(pts, [77.44, 18.44], 60).idx).toBe(1);
    expect(waypointFor(pts, [77.44, 18.44], 130).idx).toBe(1); // el más cercano, no el más tardío
  });
  it('distancia real por odómetro y trazo entre muestras', () => {
    const ord = realOrder([S('x', 77.45, 18.44, 13), S('y', 77.43, 18.45, 95), S('z', 77.42, 18.46, 210)]);
    const { legs } = realLegs(ord, pts);
    expect(legs.map((l) => l.distance_m)).toEqual([2500, 3500]);
    expect(legs[1].coords).toHaveLength(3);
    expect(sum(legs)).toBe(6000);
  });
  it('elige la misión que visita todas las muestras y mide solo la ida', () => {
    const leg = (from, to, d) => ({ from, to, distance_m: d, max_slope_deg: 3, risk_m: 0, coordinates: [] });
    const front = [
      { sequence: ['b'], legs: [leg('H', 'b', 100), leg('b', 'H', 100)] },
      { sequence: ['b', 'c'], legs: [leg('H', 'b', 500), leg('b', 'c', 500), leg('c', 'H', 9000)] },
      { sequence: ['c', 'b'], legs: [leg('H', 'c', 300), leg('c', 'b', 300), leg('b', 'H', 50)] },
    ];
    const best = pickFullMission(front, ['b', 'c']);
    expect(best.mission.sequence).toEqual(['c', 'b']);
    expect(best.oneWay).toBe(600);
    expect(missionLegs(best.mission)).toHaveLength(2);
    expect(pickFullMission(front, ['b', 'c', 'd'])).toBeNull();
  });
});

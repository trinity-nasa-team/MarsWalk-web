import { describe, expect, it } from 'vitest';
import { destination } from '../src/lib/geo.js';
import { canDetect, initialState, positions, reducer, routeFromApi } from '../src/lib/sim.js';

const H = [77.45, 18.44];
function apiRoute(from, brg, km) {
  const coords = [from];
  for (let i = 1; i <= km * 10; i++) coords.push(destination(from, brg, i * 100));
  return { geometry: { coordinates: coords }, distance_m: km * 1000, profile: [{ d_m: 0, elev_m: -2500 }, { d_m: km * 1000, elev_m: -2450 }], explanations: [] };
}
function planned() {
  let s = initialState();
  const goal = destination(H, 90, 4000);
  s = reducer(s, { type: 'PLAN_SET', patch: { habitat: H, stops: [{ id: 'g', name: 'Meta', pos: goal }] } });
  s = reducer(s, { type: 'PLAN_LEGS', legs: [routeFromApi(apiRoute(H, 90, 4))] });
  return reducer(s, { type: 'EVA_START', tabId: 'A' });
}
function plannedTwo() {
  let s = initialState();
  const p1 = destination(H, 90, 2000);
  const p2 = destination(p1, 0, 2000);
  s = reducer(s, {
    type: 'PLAN_SET',
    patch: { habitat: H, stops: [{ id: 'a', name: 'A', pos: p1 }, { id: 'b', name: 'B', pos: p2 }] },
  });
  s = reducer(s, { type: 'PLAN_LEGS', legs: [routeFromApi(apiRoute(H, 90, 2)), routeFromApi(apiRoute(p1, 0, 2))] });
  return reducer(s, { type: 'EVA_START', tabId: 'A' });
}
const run = (s, sec) => {
  for (let i = 0; i < sec * 10; i++) s = reducer(s, { type: 'TICK', dt: 0.1 });
  return s;
};

describe('ciclo de la EVA', () => {
  it('arranca con evento y líder', () => {
    const s = planned();
    expect(s.phase).toBe('eva');
    expect(s.leader).toBe('A');
    expect(s.events[0].kind).toBe('start');
  });

  it('camina a 3 km/h en tiempo de misión', () => {
    const s = run(planned(), 10); // 10 s reales × 60 = 600 s = 500 m
    expect(s.eva.progress_m).toBeCloseTo(500, 0);
    expect(s.simTime_s).toBeCloseTo(600, 3);
  });

  it('el robot reporta solo, se detiene, se recalcula y el hábitat aprueba', () => {
    let s = run(planned(), 60);
    expect(s.eva.state).toBe('hold');
    expect(s.eva.hazards).toHaveLength(1);
    const req = s.eva.request;
    expect(req.kind).toBe('reroute');
    expect(req.hazards[0].radius_m).toBe(300);
    const from = positions(s.eva).astro.pos;
    const alt = routeFromApi(apiRoute(from, 80, 3));
    s = reducer(s, { type: 'ROUTE_RESULT', requestId: req.id, route: alt });
    expect(s.eva.pending).not.toBeNull();
    const walked = s.eva.walked_m;
    s = run(s, 5);
    expect(s.eva.walked_m).toBe(walked); // en espera no avanza
    s = reducer(s, { type: 'APPROVE' });
    expect(s.eva.route.origin).toBe('ground');
    expect(s.eva.state).toBe('walk');
    expect(s.events.map((e) => e.kind)).toEqual(['start', 'hazard', 'reroute', 'approved']);
    expect(s.events[0].params).toMatchObject({ name: 'Meta', total: 1 });
  });

  it('un resultado viejo se ignora', () => {
    const s = run(planned(), 60);
    expect(reducer(s, { type: 'ROUTE_RESULT', requestId: -1, route: null })).toBe(s);
  });

  it('al llegar pide la ruta de regreso y termina en el hábitat', () => {
    let s = planned();
    s = { ...s, eva: { ...s.eva, autoHazardDone: true } };
    s = run(s, 90);
    expect(s.eva.state).toBe('atGoal');
    expect(s.eva.request.kind).toBe('return');
    s = reducer(s, { type: 'ROUTE_RESULT', requestId: s.eva.request.id, route: routeFromApi(apiRoute(s.plan.stops[0].pos, 270, 4)) });
    expect(s.eva.leg).toBe('back');
    s = run(s, 90);
    expect(s.eva.state).toBe('done');
    expect(s.running).toBe(false);
  });

  it('no se puede reportar peligro cerca del destino', () => {
    let s = planned();
    s = { ...s, eva: { ...s.eva, autoHazardDone: true, progress_m: 3500 } };
    expect(canDetect(s)).toBe(false);
  });

  it('varias paradas: sin peligros usa el tramo del plan; con peligros recalcula el siguiente', () => {
    let s = plannedTwo();
    s = { ...s, eva: { ...s.eva, autoHazardDone: true } };
    s = run(s, 45); // 2 km a 50 m/s reales
    expect(s.eva.legIndex).toBe(1);
    expect(s.eva.route).toBe(s.plan.legs[1]);
    expect(s.events.map((e) => e.kind)).toEqual(['start', 'arrived', 'next']);
    expect(s.events[1].params).toMatchObject({ name: 'A', n: 1, total: 2 });

    let h = plannedTwo();
    h = { ...h, eva: { ...h.eva, autoHazardDone: true, hazards: [{ id: 'hz1', pos: [0, 0], radius_m: 300 }] } };
    h = run(h, 45);
    expect(h.eva.state).toBe('atGoal');
    expect(h.eva.request.kind).toBe('next');
    const alt = routeFromApi(apiRoute(h.plan.stops[0].pos, 10, 2.2));
    h = reducer(h, { type: 'ROUTE_RESULT', requestId: h.eva.request.id, route: alt });
    expect(h.eva.legIndex).toBe(1);
    expect(h.eva.route.origin).toBe('ground');
    h = run(h, 50);
    expect(h.eva.request.kind).toBe('return');
  });
});

describe('RESET entre EVAs (regresión)', () => {
  it('no reinicia seq: los ids de petición no se repiten entre EVAs', () => {
    let s = run(planned(), 30);
    const seqBefore = s.seq;
    expect(seqBefore).toBeGreaterThan(0);
    s = reducer(s, { type: 'RESET' });
    expect(s.seq).toBe(seqBefore);
    expect(s.phase).toBe('plan');
  });
});

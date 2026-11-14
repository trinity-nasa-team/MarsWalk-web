// Simulación de la EVA como reducer puro (determinista, sin red). Las llamadas a la API las hace el
// controlador: el reducer solo declara `eva.request` y recibe `ROUTE_RESULT`.
import { cumulative, haversine, pointAt } from './geo.js';
import { ASTRO_O2_H, co2At, ROBOT_RANGE_KM, SUIT_PWR_H } from './vitals.js';

/** Simulaciones de entorno que el hábitat puede disparar. Duración en tiempo de misión. */
export const SIMS = { sep: { dur_s: 24 * 3600 }, dust: { dur_s: 6 * 3600 }, devil: { dur_s: 15 * 60 } };

/** Umbrales que se registran en la bitácora (una vez cada uno). */
const VITAL_STEPS = [
  { key: 'o2', at: 40, sev: 'warn' },
  { key: 'o2', at: 20, sev: 'alert' },
  { key: 'suit', at: 40, sev: 'warn' },
  { key: 'suit', at: 20, sev: 'alert' },
  { key: 'bat', at: 40, sev: 'warn' },
  { key: 'bat', at: 20, sev: 'alert' },
  { key: 'co2', at: 4, sev: 'warn', up: true },
  { key: 'co2', at: 7, sev: 'alert', up: true },
];

function checkVitals(state) {
  const eva = state.eva;
  const h = state.simTime_s / 3600;
  const val = {
    o2: 100 - (100 * h) / ASTRO_O2_H,
    suit: 100 - (100 * h) / SUIT_PWR_H,
    bat: 100 - (100 * (eva.walked_m / 1000)) / ROBOT_RANGE_KM - 2 * eva.hazards.length,
    co2: co2At(h),
  };
  let next = state;
  for (const s of VITAL_STEPS) {
    const id = `${s.key}${s.at}`;
    const crossed = s.up ? val[s.key] >= s.at : val[s.key] <= s.at;
    if (crossed && !(next.eva.warned || {})[id]) {
      next = { ...next, eva: { ...next.eva, warned: { ...(next.eva.warned || {}), [id]: true } } };
      next = addEvent(next, `vital_${s.key}`, s.sev, { pct: s.at });
    }
  }
  // Fin automático de las simulaciones de entorno.
  for (const k of Object.keys(SIMS)) {
    const sim = next.eva.sims?.[k];
    if (sim && next.simTime_s - sim.start_s >= SIMS[k].dur_s) {
      next = { ...next, eva: { ...next.eva, sims: { ...next.eva.sims, [k]: null } } };
      next = addEvent(next, `sim_${k}_off`, 'info', {});
    }
  }
  return next;
}

/** Regreso a pie de EMERGENCIA de ~15 km — NASA DRA 5.0 §2.1 (NASA-SP-2009-566, p. 6). Una EVA planeada es de 2–5 km. */
export const WALKBACK_M = 15_000;
/** Velocidad de marcha: SUPUESTO DE DEMO (no hay modelo metabólico todavía). */
export const WALK_KMH = 3;
const WALK_MS = (WALK_KMH * 1000) / 3600;
/** El robot explorador va por delante del astronauta sobre la ruta. */
export const ROBOT_LEAD_M = 300;
/** Peligro simulado que el robot «ve» y la órbita no: círculo bloqueado. */
export const HAZARD_RADIUS_M = 300;
const HAZARD_AHEAD_M = 120;
/** Distancia mínima entre el peligro y el destino del tramo (para que A* pueda llegar). */
const HAZARD_MIN_TO_GOAL_M = HAZARD_RADIUS_M + 350;
/** El robot reporta solo, una vez, al pasar este porcentaje del tramo de ida. */
const AUTO_HAZARD_AT = 0.45;

export function routeFromApi(r) {
  const coords = r.geometry.coordinates;
  const cum = cumulative(coords);
  return {
    coords,
    cum,
    total: cum[cum.length - 1],
    distance_m: r.distance_m,
    max_slope_deg: r.max_slope_deg,
    mean_slope_deg: r.mean_slope_deg,
    elevation_gain_m: r.elevation_gain_m,
    pct_risk_cells: r.pct_risk_cells,
    profile: r.profile || [],
    explanations: r.explanations || [],
    origin: 'orbit', // azul: calculada solo con datos orbitales
    // Planificador v4 (Jezero): procedencia por tramo, metros sobre arena y energía/O2 del astronauta.
    planner: r.planner || 'legacy',
    segments: r.segments || [],
    sand_m: r.sand_m ?? null,
    energy_wh: r.energy_wh ?? null,
    o2_l: r.o2_l ?? null,
  };
}

export function initialState() {
  return {
    phase: 'plan', // plan | eva
    leader: null,
    // stops: paradas en orden [{id, name, pos}] · legs: una ruta A* por tramo (hábitat → P1 → P2 …)
    plan: { habitat: null, stops: [], preset: 'safe', legs: null, regionId: 'jezero', regionBbox: null },
    eva: null,
    events: [],
    seq: 0,
    simTime_s: 0,
    running: false,
    timeScale: 60,
    earthDelay_min: 14,
  };
}

function addEvent(state, kind, sev, params = {}) {
  const seq = state.seq + 1;
  return { ...state, seq, events: [...state.events, { id: seq, t_s: state.simTime_s, kind, sev, params }] };
}

/** Posición del astronauta y del robot en la EVA actual. */
export function positions(eva) {
  if (!eva || !eva.route) return null;
  const { coords, cum, total } = eva.route;
  const astro = pointAt(coords, cum, eva.progress_m);
  const robotD = Math.min(total, eva.progress_m + ROBOT_LEAD_M);
  const robot = pointAt(coords, cum, robotD);
  return { astro, robot, robotD, remaining_m: total - eva.progress_m };
}

export const MAX_STOPS = 8;

export function legTarget(state) {
  const { eva, plan } = state;
  return eva.leg === 'out' ? plan.stops[eva.legIndex].pos : plan.habitat;
}

/** Nombre de la parada actual (o null en el regreso). */
export function currentStop(state) {
  const { eva, plan } = state;
  return eva && eva.leg === 'out' ? plan.stops[eva.legIndex] : null;
}

/** ¿Puede el robot reportar un peligro ahora? (caminando y lejos del destino del tramo). */
export function canDetect(state) {
  const eva = state.eva;
  if (state.phase !== 'eva' || !eva || eva.state !== 'walk') return false;
  const p = positions(eva);
  return eva.route.total - (p.robotD + HAZARD_AHEAD_M) >= HAZARD_MIN_TO_GOAL_M;
}

function detectHazard(state, auto) {
  if (!canDetect(state)) return state;
  const eva = state.eva;
  const p = positions(eva);
  const at = pointAt(eva.route.coords, eva.route.cum, p.robotD + HAZARD_AHEAD_M);
  const hazard = {
    id: `hz${eva.hazards.length + 1}`,
    pos: at.pos,
    radius_m: HAZARD_RADIUS_M,
    kind: 'soft_sand',
    t_s: state.simTime_s,
  };
  const hazards = [...eva.hazards, hazard];
  const reqId = state.seq + 1;
  let next = {
    ...state,
    eva: {
      ...eva,
      hazards,
      state: 'hold',
      autoHazardDone: eva.autoHazardDone || auto,
      request: { id: reqId, kind: 'reroute', from: p.astro.pos, to: legTarget(state), hazards },
    },
  };
  next = addEvent(next, 'hazard', 'warn', {
    hazard: hazard.id,
    ahead_m: Math.round(ROBOT_LEAD_M + HAZARD_AHEAD_M),
    radius_m: HAZARD_RADIUS_M,
    auto,
  });
  return next;
}

function tick(state, dt) {
  if (!state.running || state.phase !== 'eva') return state;
  const dtSim = dt * state.timeScale;
  let next = { ...state, simTime_s: state.simTime_s + dtSim };
  next = checkVitals(next);
  const eva = next.eva;
  if (eva.state !== 'walk') return next;

  const total = eva.route.total;
  const progress = Math.min(total, eva.progress_m + WALK_MS * dtSim);
  next = { ...next, eva: { ...eva, progress_m: progress, walked_m: eva.walked_m + (progress - eva.progress_m) } };

  // Aviso de walkback: el astronauta pasa el 90% del radio de regreso a pie.
  const astro = positions(next.eva).astro.pos;
  if (!next.eva.warnedWalkback && haversine(astro, next.plan.habitat) > 0.9 * WALKBACK_M) {
    next = addEvent({ ...next, eva: { ...next.eva, warnedWalkback: true } }, 'walkback', 'alert', {
      limit_km: WALKBACK_M / 1000,
    });
  }

  // El robot reporta solo una vez en la ida (la demo del ciclo).
  if (
    next.eva.leg === 'out' &&
    !next.eva.autoHazardDone &&
    positions(next.eva).robotD >= AUTO_HAZARD_AT * total &&
    canDetect(next)
  ) {
    return detectHazard(next, true);
  }

  if (progress >= total) {
    if (next.eva.leg === 'out') {
      const { stops, legs } = next.plan;
      const i = next.eva.legIndex;
      next = addEvent(next, 'arrived', 'ok', { name: stops[i].name, n: i + 1, total: stops.length });
      const hazards = next.eva.hazards;
      if (i < stops.length - 1) {
        // Siguiente parada: si el robot vio peligros, el tramo se recalcula con ellos; si no, el del plan.
        if (hazards.length) {
          return {
            ...next,
            eva: {
              ...next.eva,
              state: 'atGoal',
              request: { id: next.seq + 1, kind: 'next', from: stops[i].pos, to: stops[i + 1].pos, hazards },
            },
          };
        }
        next = {
          ...next,
          eva: { ...next.eva, legIndex: i + 1, route: legs[i + 1], progress_m: 0, autoHazardDone: next.eva.autoHazardDone },
        };
        return addEvent(next, 'next', 'info', { name: stops[i + 1].name, n: i + 2, total: stops.length });
      }
      return {
        ...next,
        eva: {
          ...next.eva,
          state: 'atGoal',
          request: { id: next.seq + 1, kind: 'return', from: stops[i].pos, to: next.plan.habitat, hazards },
        },
      };
    }
    next = addEvent({ ...next, running: false, eva: { ...next.eva, state: 'done' } }, 'done', 'ok', {
      walked_m: Math.round(next.eva.walked_m),
    });
  }
  return next;
}

export function reducer(state, action) {
  switch (action.type) {
    case 'SNAPSHOT':
      return action.state;
    case 'PLAN_SET': {
      if (state.phase !== 'plan') return state;
      const plan = { ...state.plan, ...action.patch, legs: null };
      return { ...state, plan };
    }
    case 'PLAN_LEGS':
      if (state.phase !== 'plan') return state;
      return { ...state, plan: { ...state.plan, legs: action.legs } };
    case 'EVA_START': {
      const { legs, stops } = state.plan;
      if (state.phase !== 'plan' || !legs || !stops.length || legs.length !== stops.length) return state;
      const next = {
        ...state,
        phase: 'eva',
        leader: action.tabId,
        running: true,
        simTime_s: 0,
        events: [],
        eva: {
          leg: 'out',
          legIndex: 0,
          state: 'walk',
          route: legs[0],
          progress_m: 0,
          walked_m: 0,
          hazards: [],
          pending: null,
          request: null,
          autoHazardDone: false,
          warnedWalkback: false,
          warned: {},
          sims: { sep: null, dust: null, devil: null },
        },
      };
      return addEvent(next, 'start', 'info', { name: stops[0].name, total: stops.length });
    }
    case 'TOGGLE_RUN':
      if (state.phase !== 'eva' || state.eva.state === 'done') return state;
      return { ...state, running: !state.running };
    case 'SET_SCALE':
      return { ...state, timeScale: action.timeScale };
    case 'SET_DELAY':
      return { ...state, earthDelay_min: action.min };
    case 'TICK':
      return tick(state, action.dt);
    case 'ROBOT_DETECT':
      return detectHazard(state, false);
    case 'ROUTE_RESULT': {
      const eva = state.eva;
      if (!eva || !eva.request || eva.request.id !== action.requestId) return state;
      const kind = eva.request.kind;
      if (kind === 'reroute') {
        if (action.route) {
          const next = { ...state, eva: { ...eva, request: null, pending: action.route } };
          return addEvent(next, 'reroute', 'warn', {
            old_m: Math.round(eva.route.total - eva.progress_m),
            new_m: Math.round(action.route.total),
          });
        }
        // Sin ruta alrededor del peligro: regreso al hábitat.
        const reqId = state.seq + 1;
        const from = positions(eva).astro.pos;
        const next = addEvent(state, 'noroute', 'alert', { reason: action.reason || '' });
        return {
          ...next,
          eva: { ...eva, leg: 'back', request: { id: reqId, kind: 'return', from, to: state.plan.habitat, hazards: eva.hazards } },
        };
      }
      if (kind === 'next') {
        if (action.route) {
          const i = eva.legIndex + 1;
          const next = {
            ...state,
            eva: { ...eva, legIndex: i, state: 'walk', route: { ...action.route, origin: 'ground' }, progress_m: 0, request: null },
          };
          const stops = state.plan.stops;
          return addEvent(next, 'next', 'info', { name: stops[i].name, n: i + 1, total: stops.length });
        }
        const reqId = state.seq + 1;
        const next = addEvent(state, 'noroute', 'alert', { reason: action.reason || '' });
        return {
          ...next,
          eva: { ...eva, leg: 'back', request: { id: reqId, kind: 'return', from: eva.request.from, to: state.plan.habitat, hazards: eva.hazards } },
        };
      }
      if (action.route) {
        const next = {
          ...state,
          eva: {
            ...eva,
            leg: 'back',
            state: 'walk',
            route: { ...action.route, origin: eva.hazards.length ? 'ground' : 'orbit' },
            progress_m: 0,
            request: null,
            pending: null,
          },
        };
        return addEvent(next, 'return', 'info', { distance_m: Math.round(action.route.total) });
      }
      return addEvent({ ...state, eva: { ...eva, request: null } }, 'noreturn', 'alert', { reason: action.reason || '' });
    }
    case 'SIM_TOGGLE': {
      const eva = state.eva;
      if (state.phase !== 'eva' || !eva || !SIMS[action.kind]) return state;
      const on = !eva.sims?.[action.kind];
      const next = {
        ...state,
        eva: { ...eva, sims: { ...(eva.sims || {}), [action.kind]: on ? { start_s: state.simTime_s } : null } },
      };
      return addEvent(next, `sim_${action.kind}_${on ? 'on' : 'off'}`, on ? 'alert' : 'info', {});
    }
    case 'APPROVE': {
      const eva = state.eva;
      if (!eva || !eva.pending) return state;
      const next = {
        ...state,
        eva: { ...eva, route: { ...eva.pending, origin: 'ground' }, pending: null, progress_m: 0, state: 'walk' },
      };
      return addEvent(next, 'approved', 'ok', {});
    }
    case 'RESET':
      return {
        ...initialState(),
        leader: state.leader,
        plan: state.plan,
        timeScale: state.timeScale,
        earthDelay_min: state.earthDelay_min,
      };
    default:
      return state;
  }
}

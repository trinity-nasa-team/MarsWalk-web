// «Comparar con Perseverance» (016): orden real (por sol) y distancia por odómetro del recorrido real
// (NASA/JPL waypoints: [lon, lat, sol, odómetro_m]) contra el orden del NSGA-II con A* por tramo.
import { haversine } from './geo.js';

/** Sol de una muestra; algunos sitios tienen dos («194 & 196»): se usa el primero. */
export const solOf = (s) => parseInt(String(s.sol), 10);

/** Muestras ordenadas como las tomó Perseverance (por sol). */
export function realOrder(samples) {
  return [...samples].sort((a, b) => solOf(a) - solOf(b) || a.name.localeCompare(b.name));
}

/** Índice del waypoint real más cercano a `pos` con sol ≤ `sol` (cuando el rover ya pudo estar ahí). */
export function waypointFor(points, pos, sol) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p[2] > sol) break; // puntos ordenados por sol
    const d = haversine(pos, [p[0], p[1]]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best < 0 ? { idx: 0, offset_m: haversine(pos, [points[0][0], points[0][1]]) } : { idx: best, offset_m: bestD };
}

/** Tramos reales entre muestras consecutivas: distancia por odómetro y trazo del recorrido. */
export function realLegs(ordered, points) {
  const wps = ordered.map((s) => waypointFor(points, s.pos, solOf(s)));
  const legs = [];
  for (let i = 1; i < ordered.length; i++) {
    const a = wps[i - 1].idx;
    const b = Math.max(a, wps[i].idx);
    legs.push({
      from: ordered[i - 1].id,
      to: ordered[i].id,
      distance_m: Math.max(0, points[b][3] - points[a][3]),
      coords: points.slice(a, b + 1).map((p) => [p[0], p[1]]),
      sols: [points[a][2], points[b][2]],
    });
  }
  return { legs, offsets_m: wps.map((w) => w.offset_m) };
}

/**
 * De las misiones del frente de Pareto, la que visita TODAS las muestras pedidas con menor distancia de ida
 * (sin el último tramo de regreso al punto de inicio). null si ninguna las visita todas.
 */
export function pickFullMission(front, ids) {
  const want = new Set(ids);
  let best = null;
  for (const m of front) {
    if (m.sequence.length !== want.size || !m.sequence.every((id) => want.has(id))) continue;
    const oneWay = m.legs.slice(0, m.sequence.length).reduce((s, l) => s + l.distance_m, 0);
    if (!best || oneWay < best.oneWay) best = { mission: m, oneWay };
  }
  return best;
}

/** Tramos de ida de la misión (descarta el regreso al inicio). */
export function missionLegs(mission) {
  return mission.legs.slice(0, mission.sequence.length).map((l) => ({
    from: l.from,
    to: l.to,
    distance_m: l.distance_m,
    max_slope_deg: l.max_slope_deg,
    risk_m: l.risk_m,
    coords: l.coordinates,
  }));
}

export const sum = (legs) => legs.reduce((s, l) => s + l.distance_m, 0);

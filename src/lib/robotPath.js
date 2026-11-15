// Ruta de la EVA a ESCALA para el rover real dentro de un cuadro de 2×2 m (lógica pura, sin red).
// - Coordenadas del cuadro en metros: origen en la esquina inferior izquierda, +x a la derecha, +y al frente.
// - El robot arranca SIEMPRE en esa esquina: su centro a START_M de cada pared, mirando +y (90°).
// - La ruta se gira y se escala para que TODA quepa (con margen de seguridad); nunca se sale del cuadro.
// - Sin sensores: el robot se mueve por tiempo (calibración en la Raspberry), así que hay algo de error acumulado.
import { MARS_RADIUS_M } from './geo.js';

export const SQUARE = { size_m: 2, start_m: 0.2, edge_m: 0.05, safety: 0.9 };

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** [lon, lat] → metros locales [este, norte] respecto a `origin` (equirectangular; error mínimo a escala de km). */
export function toXY(coords, origin) {
  const k = rad(1) * MARS_RADIUS_M;
  const c = Math.cos(rad(origin[1]));
  return coords.map(([lon, lat]) => [(lon - origin[0]) * k * c, (lat - origin[1]) * k]);
}

const rotate = ([x, y], t) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];

/**
 * Mejor rotación y escala para que todos los puntos (metros, con el inicio en [0,0]) quepan en el cuadro
 * saliendo de la esquina. Devuelve { theta_deg, scale } (scale = metros del robot por metro de Marte).
 */
export function fitRoute(points, sq = SQUARE) {
  const room = { pos: sq.size_m - sq.edge_m - sq.start_m, neg: sq.start_m - sq.edge_m };
  let best = { theta_deg: 0, scale: 0 };
  for (let d = 0; d < 360; d += 2) {
    const t = rad(d);
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const p of points) {
      const [x, y] = rotate(p, t);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const lim = (v, r) => (Math.abs(v) < 1e-9 ? Infinity : r / Math.abs(v));
    const s = Math.min(lim(maxX, room.pos), lim(minX, room.neg), lim(maxY, room.pos), lim(minY, room.neg)) * sq.safety;
    if (Number.isFinite(s) && s > best.scale) best = { theta_deg: d, scale: s };
  }
  return best;
}

/**
 * Plan a escala de una EVA: `legs` (tramos con coords [lon,lat]) y `habitat` [lon,lat] = inicio.
 * Devuelve { toSquare(lonlat) → [x,y] en el cuadro, scale, theta_deg, path: [[x,y]…], length_m }.
 */
export function planToSquare(habitat, legs, sq = SQUARE) {
  const all = [habitat, ...legs.flatMap((l) => l.coords || [])];
  const fit = fitRoute(toXY(all, habitat), sq);
  const t = rad(fit.theta_deg);
  const toSquare = (lonlat) => {
    const [x, y] = rotate(toXY([lonlat], habitat)[0], t);
    return [sq.start_m + x * fit.scale, sq.start_m + y * fit.scale];
  };
  const path = [...legs.flatMap((l) => l.coords || []), habitat].map(toSquare);
  let length_m = 0;
  for (let i = 1; i < path.length; i++) length_m += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return { toSquare, scale: fit.scale, theta_deg: fit.theta_deg, path, length_m };
}

export const insideSquare = ([x, y], sq = SQUARE) =>
  x >= sq.edge_m && x <= sq.size_m - sq.edge_m && y >= sq.edge_m && y <= sq.size_m - sq.edge_m;

/**
 * Siguiente movimiento para acercar el robot (pose {x, y, heading_deg}) al punto objetivo del cuadro.
 * null si ya está cerca. Giros chicos se omiten (zona muerta) para no "temblar".
 */
export function nextMove(pose, target, { minStep = 0.06, maxStep = 0.3, deadband = 10 } = {}) {
  const dx = target[0] - pose.x;
  const dy = target[1] - pose.y;
  const d = Math.hypot(dx, dy);
  if (d < minStep) return null;
  let turn = deg(Math.atan2(dy, dx)) - pose.heading_deg;
  turn = ((((turn + 180) % 360) + 360) % 360) - 180; // (-180, 180]
  if (Math.abs(turn) < deadband) turn = 0;
  const heading = pose.heading_deg + turn;
  const drive = Math.min(d, maxStep);
  const end = [pose.x + drive * Math.cos(rad(heading)), pose.y + drive * Math.sin(rad(heading))];
  return { turn_deg: Math.round(turn * 10) / 10, drive_m: Math.round(drive * 1000) / 1000, end, heading_deg: ((heading % 360) + 360) % 360 };
}

/**
 * Acota un objetivo al interior del cuadro (a `pad` m de los bordes). La ruta de regreso y los desvíos por peligros
 * se calculan durante la EVA y pueden salirse de la escala calculada al inicio: el robot sigue por el borde en vez de
 * pedir un paso que la Raspberry rechazaría (409) y quedarse quieto.
 */
export function clampToSquare([x, y], pad = 0.1, sq = SQUARE) {
  const lo = sq.edge_m + pad - 0.05;
  const hi = sq.size_m - lo;
  return [Math.min(hi, Math.max(lo, x)), Math.min(hi, Math.max(lo, y))];
}

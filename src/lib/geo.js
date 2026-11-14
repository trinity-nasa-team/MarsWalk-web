// Geometría sobre Marte. Puntos como [lon, lat] en grados (lon −180..180 E, planetocéntrica).
// Radio del datum Mars 2000 (el mismo que usa el backend).
export const MARS_RADIUS_M = 3_396_190;

const RAD = Math.PI / 180;

/** Distancia de gran círculo en metros entre dos puntos [lon, lat]. */
export function haversine(a, b) {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de a hacia b, en grados 0–360 (0 = norte, 90 = este). */
export function bearing(a, b) {
  const φ1 = a[1] * RAD;
  const φ2 = b[1] * RAD;
  const Δλ = (b[0] - a[0]) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

/** Punto a `dist_m` de `p` con rumbo `brg` grados. */
export function destination(p, brg, dist_m) {
  const δ = dist_m / MARS_RADIUS_M;
  const θ = brg * RAD;
  const φ1 = p[1] * RAD;
  const λ1 = p[0] * RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [λ2 / RAD, φ2 / RAD];
}

/** Distancias acumuladas (m) a lo largo de una polilínea. */
export function cumulative(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  return cum;
}

/** Posición y rumbo a `d` metros sobre la polilínea (se recorta a [0, total]). */
export function pointAt(coords, cum, d) {
  if (coords.length === 0) return null;
  if (coords.length === 1) return { pos: coords[0], bearing: 0, idx: 0 };
  const total = cum[cum.length - 1];
  const x = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < x) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (x - cum[i - 1]) / seg;
  const a = coords[i - 1];
  const b = coords[i];
  return { pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearing: bearing(a, b), idx: i };
}

/** Tramo de la polilínea desde `d` metros hasta el final. */
export function sliceFrom(coords, cum, d) {
  const p = pointAt(coords, cum, d);
  if (!p) return [];
  return [p.pos, ...coords.slice(p.idx)];
}

/** Tramo de la polilínea desde el inicio hasta `d` metros. */
export function sliceTo(coords, cum, d) {
  const p = pointAt(coords, cum, d);
  if (!p) return [];
  return [...coords.slice(0, p.idx), p.pos];
}

/** Anillo (polígono GeoJSON) de radio `radius_m` alrededor de `center`. */
export function circle(center, radius_m, steps = 96) {
  const ring = [];
  for (let i = 0; i <= steps; i++) ring.push(destination(center, (360 * i) / steps, radius_m));
  return ring;
}

/** Interpola un perfil [{d_m, elev_m}] en `d`; devuelve { elev_m, slope_deg } o null. */
export function profileAt(profile, d) {
  if (!profile || profile.length < 2) return null;
  let i = 1;
  while (i < profile.length - 1 && profile[i].d_m < d) i++;
  const a = profile[i - 1];
  const b = profile[i];
  const span = b.d_m - a.d_m || 1;
  const t = Math.max(0, Math.min(1, (d - a.d_m) / span));
  const elev_m = a.elev_m + (b.elev_m - a.elev_m) * t;
  const slope_deg = Math.abs(Math.atan2(b.elev_m - a.elev_m, span)) / RAD;
  return { elev_m, slope_deg };
}

export function formatKm(m) {
  if (m == null || !Number.isFinite(m)) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export function formatClock(s) {
  const t = Math.max(0, Math.floor(s));
  const h = String(Math.floor(t / 3600)).padStart(2, '0');
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const sec = String(t % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

export function cardinal(deg, lang = 'es') {
  const names =
    lang === 'en' ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] : ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return names[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

// Cola «guarda y reenvía» hacia la Tierra (imita DTN). Todo en tiempo de misión (s).
// Tiempo luz Tierra–Marte (solo ida): ~4 a ~24 min según la distancia entre planetas (NASA Goddard).
export const EARTH_DELAY_MIN = 4;
export const EARTH_DELAY_MAX = 24;

/** Separa los eventos en «en tránsito» y «recibidos» para un retraso dado (min). */
export function partitionEarth(events, now_s, delay_min) {
  const delay_s = delay_min * 60;
  const inTransit = [];
  const received = [];
  for (const e of events) {
    const arrive_s = e.t_s + delay_s;
    if (arrive_s > now_s) {
      inTransit.push({ ...e, eta_min: (arrive_s - now_s) / 60, progress: (now_s - e.t_s) / delay_s });
    } else {
      received.push({ ...e, age_min: (now_s - e.t_s) / 60 });
    }
  }
  inTransit.sort((a, b) => a.eta_min - b.eta_min);
  received.sort((a, b) => b.t_s - a.t_s);
  return { inTransit, received };
}

/** Esquema con órbitas circulares (Tierra 1 UA, Marte 1.524 UA): ángulo entre planetas para un retraso. */
export const AU_LIGHT_S = 499.005;
export const MARS_ORBIT_AU = 1.524;

export function separationAngle(delay_min) {
  const d = (delay_min * 60) / AU_LIGHT_S;
  const r = MARS_ORBIT_AU;
  const c = (1 + r * r - d * d) / (2 * r);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

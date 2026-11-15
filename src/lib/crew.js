// EVA en pareja (planificador/eva_pareja.py vía /eva/crew-check): veredicto para el plan, líneas sin señal y el
// punto desde el que ya no hay rescate. Funciones puras (sin React) para poder probarlas.

/** Pareja por defecto: dos astronautas con el tanque del traje EMU (~380 L de O₂). */
export const DEFAULT_CREW = [
  { mass_kg: 80, o2_l: 380 },
  { mass_kg: 70, o2_l: 380 },
];

/** Color de los tramos sin señal del hábitat en el mapa. */
export const NO_SIGNAL_COLOR = '#ff8a3d';

/** Limita un astronauta a valores válidos para la API (peso 40–150 kg, O₂ 50–2000 L). */
export function cleanMember(m) {
  const n = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  return { mass_kg: n(m?.mass_kg, 40, 150, 75), o2_l: n(m?.o2_l, 50, 2000, 380) };
}

/**
 * Qué decirle al equipo: `level` (ok | warn | alert) y la clave de i18n con sus parámetros.
 *  - no_return: aun sin incidentes, a alguno no le alcanza el O₂ para volver.
 *  - no_rescue: si a uno de los dos le pasa algo después de cierto punto, ya no alcanzan a volver.
 *  - ok: el otro lo puede traer de vuelta desde cualquier punto.
 */
export function crewVerdict(check, nStops) {
  if (!check) return null;
  const r = check.rescue || {};
  const leg = r.no_rescue_leg;
  const where = leg == null ? '' : leg > nStops ? 'back' : leg === 1 ? 'first' : 'between';
  const params = {
    km: r.distance_to_no_rescue_m != null ? (r.distance_to_no_rescue_m / 1000).toFixed(1) : '—',
    from: Math.max(1, (leg ?? 1) - 1),
    to: leg ?? 1,
    l: Math.round(r.min_margin_l ?? 0),
  };
  if (check.status === 'no_return') return { level: 'alert', key: 'crew.noReturn', where, params };
  if (check.status === 'no_rescue') return { level: 'warn', key: 'crew.noRescue', where, params };
  return { level: 'ok', key: 'crew.ok', where, params };
}

/** Tramos sin señal como líneas para el mapa (extraLines de MapView). */
export function noSignalLines(check) {
  const coords = check?.geometry?.coordinates;
  if (!coords) return [];
  return (check.signal?.no_signal_segments || [])
    .map((s, i) => ({ id: `ns${i}`, coords: coords.slice(Math.max(0, s.from - 1), s.to + 2), color: NO_SIGNAL_COLOR, width: 4, dash: true }))
    .filter((l) => l.coords.length > 1);
}

/** Marcador del punto sin rescate (extraMarkers de MapView), o ninguno. */
export function noRescueMarkers(check) {
  const pos = check?.rescue?.no_rescue_pos;
  return pos ? [{ id: 'norescue', pos, cls: 'marker-norescue' }] : [];
}

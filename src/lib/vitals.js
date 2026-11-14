// Estado del robot y del astronauta. SUPUESTOS DE DEMO (no hay modelo metabólico ni de batería verificado):
// se derivan de la distancia caminada y del tiempo de misión, sin tocar el reducer.
import { haversine } from './geo.js';
import { WALK_KMH } from './sim.js';

/** Autonomía supuesta del traje (O₂). SUPUESTO de demo. */
export const ASTRO_O2_H = 8;
/** Autonomía supuesta de la batería del traje. SUPUESTO de demo. */
export const SUIT_PWR_H = 10;
/** Alcance supuesto de la batería del robot. SUPUESTO de demo. */
export const ROBOT_RANGE_KM = 25;
/** Costo supuesto (en %) de cada maniobra de detección de peligro. */
const HAZARD_COST_PCT = 2;

// Lecturas del traje que NASA-STD-3001 Vol 2 Rev F exige monitorear (V2 11034–11038): presión, ppCO₂, metabolismo.
/** Presión nominal del traje EMU/xEVA: 29.6 kPa (4.3 psid). Tolerancia ±1.72 kPa (V2 11007). */
export const SUIT_KPA = 29.6;
export const SUIT_KPA_TOL = 1.72;
/** CO₂ inspirado (Tabla 11.3-1): ≤4.0 mmHg sin límite; >4.0 → 8 h/día; >7.0 → 2.5 h; >10.0 → 1 h; >15.0 nunca. */
export const CO2_STEPS = [4, 7, 10, 15];
/** Metabolismo en EVA (Gernhardt, NASA): ~800 BTU/h promedio ISS, alto 1600, picos Apollo 2200. */
export const MET_NOMINAL_BTU = 800;
export const MET_HIGH_BTU = 1600;
const BTU_TO_W = 0.29307;

/** CO₂ inspirado SIMULADO: sube lento con las horas (SUPUESTO de demo, no hay modelo del depurador). */
export const co2At = (hours) => 1.0 + 0.35 * hours;

export const levelOf = (pct) => (pct < 20 ? 'alert' : pct < 40 ? 'warn' : 'ok');
const clamp = (v) => Math.max(0, Math.min(100, v));

/** Estado en vivo durante la EVA (state.phase === 'eva'). */
export function liveVitals(state, slope_deg = 0) {
  const eva = state.eva;
  if (state.phase !== 'eva' || !eva) return null;
  const hours = state.simTime_s / 3600;
  const robotBat = clamp(100 - (100 * (eva.walked_m / 1000)) / ROBOT_RANGE_KM - HAZARD_COST_PCT * eva.hazards.length);
  const o2 = clamp(100 - (100 * hours) / ASTRO_O2_H);
  const suit = clamp(100 - (100 * hours) / SUIT_PWR_H);
  const robotAlerts = [];
  if (robotBat < 20) robotAlerts.push({ sev: 'alert', key: 'vit.robotBatCrit' });
  else if (robotBat < 40) robotAlerts.push({ sev: 'warn', key: 'vit.robotBatLow' });
  if (eva.state === 'hold') robotAlerts.push({ sev: 'warn', key: 'vit.robotHazard' });
  if (eva.pending) robotAlerts.push({ sev: 'warn', key: 'vit.robotPending' });
  if (eva.sims?.dust) robotAlerts.push({ sev: 'warn', key: 'vit.robotDust' });
  if (eva.sims?.devil) robotAlerts.push({ sev: 'warn', key: 'vit.robotDevil' });
  if (eva.hazards.length && eva.state !== 'hold') robotAlerts.push({ sev: 'ok', key: 'vit.robotAvoided', n: eva.hazards.length });
  // Lecturas del traje (SIMULADAS con valores nominales y umbrales de NASA).
  const co2 = co2At(hours);
  const kPa = SUIT_KPA + Math.sin(state.simTime_s / 900) * 0.15;
  const moving = state.running && eva.state === 'walk';
  const slope = Math.abs(slope_deg || 0);
  // SUPUESTO: 800 BTU/h caminando + 40 BTU/h por grado de pendiente; 500 BTU/h detenido.
  const btu = moving ? Math.min(MET_HIGH_BTU, MET_NOMINAL_BTU + 40 * slope) : 500;
  const co2Level = co2 > 10 ? 'alert' : co2 > 7 ? 'alert' : co2 > 4 ? 'warn' : 'ok';
  const astroAlerts = [];
  if (co2 > 7) astroAlerts.push({ sev: 'alert', key: 'vit.co2Crit' });
  else if (co2 > 4) astroAlerts.push({ sev: 'warn', key: 'vit.co2Low' });
  if (Math.abs(kPa - SUIT_KPA) > SUIT_KPA_TOL) astroAlerts.push({ sev: 'alert', key: 'vit.pressure' });
  if (o2 < 20) astroAlerts.push({ sev: 'alert', key: 'vit.o2Crit' });
  else if (o2 < 40) astroAlerts.push({ sev: 'warn', key: 'vit.o2Low' });
  if (eva.warnedWalkback) astroAlerts.push({ sev: 'warn', key: 'vit.walkback' });
  return {
    robot: {
      battery: robotBat,
      mode: eva.state === 'hold' ? 'hold' : eva.state === 'done' ? 'idle' : 'scout',
      level: levelOf(robotBat),
      alerts: robotAlerts,
    },
    astro: {
      o2,
      suit,
      level: co2 > 7 ? 'alert' : co2 > 4 && levelOf(Math.min(o2, suit)) === 'ok' ? 'warn' : levelOf(Math.min(o2, suit)),
      moving,
      alerts: astroAlerts,
      suit_kPa: kPa,
      co2_mmHg: co2,
      co2Level,
      met_btu: btu,
      met_W: btu * BTU_TO_W,
      metLevel: btu >= MET_HIGH_BTU ? 'alert' : btu > 1100 ? 'warn' : 'ok',
    },
  };
}

/** Proyección antes de salir: distancia del plan + regreso en línea recta (estimación). */
export function projected(plan, summary) {
  if (!summary || !plan.stops.length) return null;
  const last = plan.stops[plan.stops.length - 1].pos;
  const total_m = summary.distance_m + haversine(last, plan.habitat);
  const hours = total_m / 1000 / WALK_KMH;
  const o2 = clamp(100 - (100 * hours) / ASTRO_O2_H);
  const suit = clamp(100 - (100 * hours) / SUIT_PWR_H);
  const robotBat = clamp(100 - (100 * (total_m / 1000)) / ROBOT_RANGE_KM);
  return { total_m, hours, o2, suit, robotBat, level: levelOf(Math.min(o2, suit, robotBat)) };
}

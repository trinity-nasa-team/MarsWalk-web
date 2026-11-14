// Sensor de radiación y UV del robot explorador. Valores SIMULADOS con base en mediciones publicadas:
//  · Dosis base en superficie (Curiosity RAD, Gale): 0.21 ± 0.04 mGy/día absorbida, 0.64 ± 0.12 mSv/día equivalente
//    — Hassler et al. 2014, Science, doi:10.1126/science.1244797.
//  · Variación diaria: la columna atmosférica cambia >10 % por sol y la dosis va en sentido contrario
//    (Rafkin et al. 2014, JGR, doi:10.1002/2013JE004525). La amplitud ±2.5 % aquí es SUPUESTO.
//  · Tormenta solar de referencia: 20 may 2024, 8,100 µGy para un astronauta junto a Curiosity, «como 30 radiografías
//    de tórax» (NASA/JPL). Repartirla en 24 h es SUPUESTO.
//  · Acción ante tormenta: terminar la EVA en ≤ 2 h (NASA OCHMO, Radiation Protection technical brief).
//  · UV con Sol en el cénit, τ = 0.1: UV-B+C 13.2 W/m², UV-A 41.5 W/m² (Tierra: 1.86 y 52.81) — Cockell et al. 2000,
//    Icarus 146, Tabla I (modelo). Atenuación por polvo: −90 % de τ≈1 a τ≈8.5 (REMS, tormenta global 2018).
import { useEffect, useSyncExternalStore } from 'react';

export const RAD_BASE_uGy_DAY = 210;
export const RAD_BASE_uSv_DAY = 640;
const DIURNAL_AMP = 0.025; // SUPUESTO
export const SEP_REF_uGy = 8100;
const SEP_HOURS = 24; // SUPUESTO
const XRAY_uGy = SEP_REF_uGy / 30; // equivalencia que usa NASA para el evento de 2024
export const UV_BC_ZENITH = 13.2;
export const UV_A_ZENITH = 41.5;
export const UV_BC_EARTH = 1.86;
const K_DUST = Math.log(10) / 7.5; // de −90 % entre τ 1 y 8.5
export const TAU = 0.5; // SUPUESTO: día claro (rango 0.1–1.0, Cockell 2000)
export const TAU_STORM = 4; // SUPUESTO dentro del rango de tormentas: local ≈2, severa ≈6 (Cockell 2000)
const LAT = 18.4; // Jezero
const EVA_START_LMST = 9; // SUPUESTO: la EVA sale a las 09:00 hora solar local
const SOL_H = 24.6597;

// ---- Consulta a NASA DONKI (la tormenta solar simulada vive en el estado de la EVA: eva.sims.sep) ----
const sep = null;
let donki = { status: 'idle', events: [] };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const snap = () => ({ sep, donki });
let cached = snap();
const getSnap = () => cached;
const update = () => {
  cached = snap();
  emit();
};


function fetchDonki() {
  if (donki.status !== 'idle') return;
  donki = { status: 'loading', events: [] };
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 86400e3);
  const d = (x) => x.toISOString().slice(0, 10);
  const key = import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY';
  fetch(`https://api.nasa.gov/DONKI/SEP?startDate=${d(start)}&endDate=${d(end)}&api_key=${key}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((list) => {
      donki = { status: 'ok', events: Array.isArray(list) ? list.map((e) => ({ id: e.sepID, time: e.eventTime })) : [] };
      update();
    })
    .catch(() => {
      donki = { status: 'down', events: [] };
      update();
    });
}

export function useSpaceWeather() {
  useEffect(fetchDonki, []);
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    getSnap,
  );
}

// ---- Modelo ----
function sunCosZenith(lmst) {
  // Equinoccio (declinación 0) — SUPUESTO simplificador.
  const h = ((lmst - 12) * 15 * Math.PI) / 180;
  return Math.max(0, Math.cos((LAT * Math.PI) / 180) * Math.cos(h));
}

export function radiationAt(simTime_s, sepState, tau = TAU) {
  const hours = simTime_s / 3600;
  const lmst = (EVA_START_LMST + hours) % SOL_H;
  const diurnal = 1 + DIURNAL_AMP * Math.cos(((lmst - 4) / SOL_H) * 2 * Math.PI); // máx. de dosis ≈ mín. de presión
  const baseRate = (RAD_BASE_uGy_DAY / 24) * diurnal;
  const sepOn = sepState && hours >= sepState.start_s / 3600 && hours - sepState.start_s / 3600 < SEP_HOURS;
  const sepRate = sepOn ? SEP_REF_uGy / SEP_HOURS : 0;
  const sepHours = sepState ? Math.max(0, Math.min(SEP_HOURS, hours - sepState.start_s / 3600)) : 0;
  const evaDose = (RAD_BASE_uGy_DAY / 24) * hours + (SEP_REF_uGy / SEP_HOURS) * sepHours;
  const cz = sunCosZenith(lmst);
  const dust = Math.exp(-K_DUST * (tau - 0.1));
  const uvBC = UV_BC_ZENITH * cz * dust;
  const uvA = UV_A_ZENITH * cz * dust;
  return { lmst, rate: baseRate + sepRate, sepOn, evaDose, uvBC, uvA, tau };
}

/** Lectura para la UI (null si no hay EVA). */
export function useRadiation(state) {
  const { donki: dk } = useSpaceWeather();
  if (state.phase !== 'eva' || !state.eva) return null;
  const sims = state.eva.sims || {};
  const r = radiationAt(state.simTime_s, sims.sep, sims.dust ? TAU_STORM : TAU);
  const alerts = [];
  if (r.sepOn) alerts.push({ sev: 'alert', key: 'rad.sepAlert' });
  if (sims.dust) alerts.push({ sev: 'warn', key: 'rad.dustAlert' });
  if (dk.status === 'ok' && dk.events.length) alerts.push({ sev: 'warn', key: 'rad.donkiSep', params: { date: dk.events[dk.events.length - 1].time?.slice(0, 10) } });
  const ratio = r.uvBC / UV_BC_EARTH;
  return {
    rate_uGy_h: r.rate,
    evaDose_uGy: r.evaDose,
    xrays: r.evaDose / XRAY_uGy,
    dosePct: Math.min(100, (r.evaDose / SEP_REF_uGy) * 100),
    doseLevel: r.sepOn ? 'alert' : r.evaDose > 1000 ? 'warn' : 'ok',
    level: r.sepOn ? 'alert' : 'ok',
    sep: r.sepOn,
    uvBC: r.uvBC,
    uvA: r.uvA,
    uvRatio: ratio,
    uvPct: Math.min(100, (r.uvBC / UV_BC_ZENITH) * 100),
    lmst: r.lmst,
    tau: r.tau,
    donki: dk,
    alerts,
  };
}

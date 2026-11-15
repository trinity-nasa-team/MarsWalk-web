// Todo Marte en vivo: los mosaicos globales de NASA/USGS están en una malla geográfica (lon/lat, origen
// −180°, 90°) y MapLibre dibuja en Web Mercator. Este módulo registra el protocolo `mars://capa/z/x/y`:
// para cada tile Mercator pide al servidor los tiles geográficos que lo cubren, los reproyecta fila por fila
// y devuelve la imagen. Nada se guarda en disco; el navegador solo cachea lo que se ve.
//
// Fuentes (verificadas 2026-11-06, CORS abierto):
//  - CTX global ~5 m/px (Caltech Murray Lab, servido por Esri astro.arcgis.com, tiles de 512 px).
//  - Viking MDIM 2.1 color global (NASA Mars Trek, 232 m/px, hasta z = 7).
//  - MOLA relieve sombreado a color (Trek, 463 m/px), THEMIS IR nocturno (Trek, 100 m/px).
//  - Mapa geológico global USGS SIM 3292 (Tanaka et al. 2014, Trek ArcGIS).
import {
  DETAIL_GAIN,
  getTile,
  injectDetail,
  LAYER_INFO,
  mercatorBounds,
  pickLevel,
  rowLatitude,
  SOURCES,
  tileDeg,
} from './marsTilesCore.js';

export { DETAIL_GAIN, injectDetail, LAYER_INFO, mercatorBounds, pickLevel, rowLatitude, SOURCES, tileDeg };

let registered = false;
let pool = [];
let nextWorker = 0;
let seq = 0;
const pending = new Map();

function startPool() {
  const n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  pool = Array.from({ length: n }, () => {
    const w = new Worker(new URL('./tileWorker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (p) {
        pending.delete(data.id);
        p(data.buffer);
      }
    };
    return w;
  });
}

const EMPTY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
).buffer;

/** Registra `mars://` en MapLibre (una vez). El trabajo pesado va a un pool de Web Workers. */
export function registerMarsProtocol(maplibregl) {
  if (registered) return;
  registered = true;
  startPool();
  maplibregl.addProtocol('mars', (params, abortController) => {
    const m = params.url.match(/^mars:\/\/(\w+)\/(\d+)\/(\d+)\/(\d+)/);
    if (!m) return Promise.reject(new Error('bad mars url'));
    const [, layer, z, x, y] = m;
    const id = ++seq;
    const w = pool[nextWorker++ % pool.length];
    return new Promise((resolve) => {
      pending.set(id, (buffer) => resolve({ data: buffer ? buffer : EMPTY_PNG.slice(0) }));
      w.postMessage({ id, layer, z: +z, x: +x, y: +y });
      // Zoom/paneo rápido: el worker deja de procesar tiles que ya no se ven.
      abortController?.signal.addEventListener('abort', () => {
        pending.delete(id);
        w.postMessage({ cancel: id });
        resolve({ data: EMPTY_PNG.slice(0) });
      });
    });
  });
}

/** Valor del píxel (0–255, gris) de una fuente en lon/lat; null si no hay dato. */
export async function samplePixel(srcKey, lon, lat, level) {
  const src = SOURCES[srcKey];
  const L = Math.min(level ?? src.maxZ, src.maxZ);
  const td = tileDeg(L);
  const c = Math.floor((lon + 180) / td);
  const r = Math.floor((90 - lat) / td);
  const img = await getTile(src, L, r, c);
  if (!img) return null;
  const cv = new OffscreenCanvas(1, 1);
  const ctx = cv.getContext('2d');
  const px = ((lon + 180 - c * td) / td) * src.px;
  const py = ((90 - r * td - lat) / td) * src.px;
  ctx.drawImage(img, px, py, 1, 1, 0, 0, 1, 1);
  const [R, G, B, A] = ctx.getImageData(0, 0, 1, 1).data;
  return A < 8 ? null : Math.round(0.299 * R + 0.587 * G + 0.114 * B);
}

/** Unidad geológica (USGS SIM 3292) en un punto, consultada en vivo. */
export async function queryGeology(lon, lat) {
  const url =
    'https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/0/query' +
    `?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=104905&spatialRel=esriSpatialRelIntersects` +
    '&outFields=Unit,UnitDesc&returnGeometry=false&f=json';
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const a = d.features?.[0]?.attributes;
    return a ? { unit: a.Unit, desc: a.UnitDesc } : null;
  } catch {
    return null;
  }
}

/**
 * Lectura cualitativa del THEMIS nocturno (brillo relativo 0–255 del mosaico, no temperatura absoluta):
 * de noche la roca y lo consolidado guardan calor (más brillante); el polvo y la arena fina se enfrían rápido.
 */
export function surfaceFromThemis(v) {
  if (v == null) return null;
  if (v >= 160) return 'rock';
  if (v <= 90) return 'fines';
  return 'mixed';
}

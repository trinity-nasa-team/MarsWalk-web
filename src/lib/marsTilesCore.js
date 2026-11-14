// Núcleo de «todo Marte en vivo» (016/017): fuentes, reproyección EQ → Web Mercator e inyección de detalle.
// Lo usan el Web Worker de tiles (trabajo pesado fuera del hilo de la interfaz) y el hilo principal
// (muestreo de un píxel para la ficha). Sin DOM: solo fetch, createImageBitmap y OffscreenCanvas.
export const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ';

export const SOURCES = {
  ctx: {
    url: (z, r, c) => `https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/${z}/${r}/${c}`,
    px: 512,
    maxZ: 12,
  },
  viking: { url: (z, r, c) => `${TREK}/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/${z}/${r}/${c}.jpg`, px: 256, maxZ: 7 },
  mola: { url: (z, r, c) => `${TREK}/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/${z}/${r}/${c}.jpg`, px: 256, maxZ: 7 },
  themis: {
    url: (z, r, c) => `${TREK}/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018/1.0.0/default/default028mm/${z}/${r}/${c}.png`,
    px: 256,
    maxZ: 9,
  },
  geology: {
    url: (z, r, c) =>
      `https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/WMTS/tile/1.0.0/SIM3292_Global_Geology/default/default028mm/${z}/${r}/${c}.png`,
    px: 256,
    maxZ: 11,
  },
};

export const LAYER_INFO = {
  color: { source: 'CTX global ~5 m (Caltech/Murray Lab, Esri) + color Viking MDIM 2.1 (NASA)', note: 'color aproximado' },
  mola: { source: 'MGS MOLA relieve sombreado a color, 463 m/px (NASA Mars Trek)' },
  themis: { source: 'Mars Odyssey THEMIS IR nocturno, 100 m/px (NASA Mars Trek)' },
  geology: { source: 'USGS SIM 3292, mapa geológico global 1:20 M (Tanaka et al. 2014)' },
};

/** Grados por tile del nivel z (igual para Trek de 256 px y Esri de 512 px). */
export const tileDeg = (z) => 180 / 2 ** z;

/** Nivel de la fuente con resolución suficiente para `degPerPx` (sin pasar su máximo). */
export function pickLevel(src, degPerPx) {
  for (let z = 0; z <= src.maxZ; z++) if (tileDeg(z) / src.px <= degPerPx) return z;
  return src.maxZ;
}

/** Límites lon/lat de un tile Web Mercator. */
export function mercatorBounds(z, x, y) {
  const n = 2 ** z;
  const lon0 = (x / n) * 360 - 180;
  const lon1 = ((x + 1) / n) * 360 - 180;
  const lat = (yy) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return { lon0, lon1, latTop: lat(y), latBottom: lat(y + 1) };
}

/** Latitud del centro de la fila j (de `size` filas) de un tile Mercator. */
export function rowLatitude(z, y, j, size) {
  const n = 2 ** z;
  const yy = y + (j + 0.5) / size;
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
}

// ---- Caché de tiles fuente (promesas de ImageBitmap; null = sin dato) ---------------------------
const cache = new Map();
const MAX_CACHE = 600;

export function getTile(src, z, r, c) {
  const n = 2 ** z;
  if (r < 0 || r >= n) return Promise.resolve(null);
  const cc = ((c % (2 * n)) + 2 * n) % (2 * n); // la longitud da la vuelta
  const key = `${src.url(z, r, cc)}`;
  if (cache.has(key)) return cache.get(key);
  const p = fetch(key)
    .then((res) => (res.ok ? res.blob() : null))
    .then((b) => (b ? createImageBitmap(b) : null))
    .catch(() => null);
  cache.set(key, p);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return p;
}

/** Dibuja la fuente reproyectada en un canvas de `size`×`size` para el tile Mercator z/x/y. */
async function renderSource(src, z, x, y, size, signal) {
  const b = mercatorBounds(z, x, y);
  const degPx = (b.lon1 - b.lon0) / size;
  const L = pickLevel(src, degPx);
  const td = tileDeg(L);
  const c0 = Math.floor((b.lon0 + 180) / td);
  const c1 = Math.floor((b.lon1 + 180 - 1e-9) / td);
  const r0 = Math.floor((90 - b.latTop) / td);
  const r1 = Math.floor((90 - b.latBottom - 1e-9) / td);
  const tiles = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tiles.push([r, c, getTile(src, L, r, c)]);
  const imgs = await Promise.all(tiles.map((t) => t[2]));
  if (signal?.aborted || imgs.every((i) => !i)) return null;
  const stitch = new OffscreenCanvas((c1 - c0 + 1) * src.px, (r1 - r0 + 1) * src.px);
  const sctx = stitch.getContext('2d');
  tiles.forEach(([r, c], i) => imgs[i] && sctx.drawImage(imgs[i], (c - c0) * src.px, (r - r0) * src.px, src.px, src.px));
  const out = new OffscreenCanvas(size, size);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const pxPerDeg = src.px / td;
  const sx = (b.lon0 + 180 - c0 * td) * pxPerDeg;
  const sw = (b.lon1 - b.lon0) * pxPerDeg;
  const top = 90 - r0 * td;
  const syTop = (top - b.latTop) * pxPerDeg;
  const syBot = (top - b.latBottom) * pxPerDeg;
  // ¿Basta un solo dibujado? Si la latitud del centro del tile se aparta < 0,5 px de la interpolación
  // lineal (de cerca casi siempre), se evita la reproyección fila por fila (256 dibujados).
  const mid = (top - rowLatitude(z, y, size / 2 - 0.5, size)) * pxPerDeg;
  if (Math.abs(mid - (syTop + syBot) / 2) * (size / Math.max(1, syBot - syTop)) < 0.5) {
    ctx.drawImage(stitch, sx, syTop, sw, syBot - syTop, 0, 0, size, size);
    return out;
  }
  for (let j = 0; j < size; j++) {
    const sy = (top - rowLatitude(z, y, j, size)) * pxPerDeg;
    ctx.drawImage(stitch, sx, Math.max(0, sy - 0.5), sw, 1, 0, j, size, 1);
  }
  return out;
}

// El CTX global de Esri viene con muy poco contraste (desv. típica 4–7 niveles de 255, medido 2026-11-06).
// Inyección de detalle: brillo y color de Viking + alta frecuencia de CTX amplificada. Sin estirar por tile,
// así no aparecen costuras entre tiles.
export const DETAIL_GAIN = 5;
const BLUR_R = 6;

function boxBlur(src, size, r) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < size; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * size + Math.min(size - 1, Math.max(0, x))];
    for (let x = 0; x < size; x++) {
      tmp[y * size + x] = acc / (2 * r + 1);
      acc += src[y * size + Math.min(size - 1, x + r + 1)] - src[y * size + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(size - 1, Math.max(0, y)) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(size - 1, y + r + 1) * size + x] - tmp[Math.max(0, y - r) * size + x];
    }
  }
  return out;
}

/** Detalle de CTX (alta frecuencia) sobre el color de Viking. */
export function injectDetail(gd, cd, size, gain = DETAIL_GAIN) {
  const Y = new Float32Array(size * size);
  for (let p = 0, i = 0; p < Y.length; p++, i += 4) Y[p] = 0.299 * gd[i] + 0.587 * gd[i + 1] + 0.114 * gd[i + 2];
  const low = boxBlur(Y, size, BLUR_R);
  for (let p = 0, i = 0; p < Y.length; p++, i += 4) {
    const d = gd[i + 3] < 8 ? 0 : gain * (Y[p] - low[p]);
    gd[i] = cd[i] + d;
    gd[i + 1] = cd[i + 1] + d;
    gd[i + 2] = cd[i + 2] + d;
    gd[i + 3] = 255;
  }
  return gd;
}

function pansharpen(gray, color, size, z) {
  const g = gray.getContext('2d').getImageData(0, 0, size, size);
  const c = color.getContext('2d').getImageData(0, 0, size, size);
  injectDetail(g.data, c.data, size, z >= 12 ? 3 : DETAIL_GAIN); // de cerca, menos ganancia (menos ruido)
  gray.getContext('2d').putImageData(g, 0, 0);
  return gray;
}

export async function renderTile(layer, z, x, y, signal) {
  const size = 256;
  if (layer === 'color') {
    const [gray, color] = await Promise.all([
      z >= 6 ? renderSource(SOURCES.ctx, z, x, y, size, signal) : Promise.resolve(null),
      renderSource(SOURCES.viking, z, x, y, size, signal),
    ]);
    if (!color && !gray) return null;
    if (!gray) return color;
    if (!color) return gray;
    return pansharpen(gray, color, size, z);
  }
  return renderSource(SOURCES[layer], z, x, y, size, signal);
}


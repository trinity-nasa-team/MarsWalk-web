// Recorrido por Marte: secuencia REAL de fotos de la Hazcam frontal de Perseverance (NASA/JPL-Caltech) en el orden de su
// recorrido por Jezero (MarsWalk-v2/scripts/fetch_robot_photos.py). Se reproduce como video ligado al robot: arranca
// en la foto más cercana a su posición y avanza un cuadro cada FEED_STEP_M metros que camina, con acercamiento lento y
// fundido entre cuadros. No es video continuo: son fotos sueltas.
import { haversine } from './geo.js';

export const FEED_DIR = '/img/robotfeed';
export const FEED_W = 768;
export const FEED_H = 576;
export const FEED_STEP_M = 60; // metros que camina el robot por cuadro
const ZOOM = 0.16; // acercamiento a lo largo de un cuadro (sensación de avance)
const FADE = 0.25; // último 25 % del tramo: fundido al siguiente cuadro

let photoIndex = null;
export function loadPhotos() {
  photoIndex ??= fetch(`${FEED_DIR}/index.json`)
    .then((r) => (r.ok ? r.json() : { photos: [] }))
    .then((d) => (d.photos || []).map((p) => ({ ...p, url: `${FEED_DIR}/${p.file}` })))
    .catch(() => []);
  return photoIndex;
}

/** Foto más cercana a la posición [lon, lat]: índice, foto y distancia en metros. */
export function nearestPhoto(photos, pos) {
  let best = null;
  let bd = Infinity;
  let bi = -1;
  photos.forEach((p, i) => {
    const d = haversine(pos, [p.lon, p.lat]);
    if (d < bd) {
      bd = d;
      best = p;
      bi = i;
    }
  });
  return best ? { ...best, dist_m: bd, index: bi } : null;
}

/** Cuadro actual (con fracción t) del feed: arranca en `startIdx` y avanza con el odómetro del robot. */
export function feedPosition(startIdx, odometer_m, n) {
  if (!n) return { idx: 0, next: 0, t: 0 };
  const f = startIdx + odometer_m / FEED_STEP_M;
  const idx = Math.floor(f) % n;
  return { idx, next: (idx + 1) % n, t: f - Math.floor(f) };
}

const imgCache = new Map();
function frameImage(url) {
  if (!imgCache.has(url)) {
    const im = new Image();
    im.decoding = 'async';
    im.src = url;
    imgCache.set(url, im);
    if (imgCache.size > 40) imgCache.delete(imgCache.keys().next().value);
  }
  return imgCache.get(url);
}

/** Actualiza el odómetro del feed con la nueva posición del robot (resincroniza si hay un salto o una EVA nueva). */
export function advanceFeed(feed, photos, pos) {
  const jump = feed.last ? haversine(feed.last, pos) : Infinity;
  if (feed.start < 0 || jump > 500) {
    feed.start = nearestPhoto(photos, pos).index;
    feed.odo = 0;
  } else {
    feed.odo += jump;
  }
  feed.last = pos;
}

/** Dibuja el cuadro actual en el canvas; devuelve el índice de la foto visible. */
export function drawFeed(cv, photos, feed) {
  const { idx, next, t } = feedPosition(Math.max(0, feed.start), feed.odo, photos.length);
  const a = frameImage(photos[idx].url);
  const b = frameImage(photos[next].url);
  frameImage(photos[(next + 1) % photos.length].url); // precarga
  const ctx = cv.getContext('2d');
  const put = (im, z, alpha) => {
    if (!im.complete || !im.naturalWidth) return;
    const w = FEED_W * z;
    const h = FEED_H * z;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, (FEED_W - w) / 2, (FEED_H - h) * 0.6, w, h); // se acerca hacia el horizonte
  };
  put(a, 1 + ZOOM * t, 1);
  if (t > 1 - FADE) put(b, 1, (t - (1 - FADE)) / FADE);
  ctx.globalAlpha = 1;
  return idx;
}

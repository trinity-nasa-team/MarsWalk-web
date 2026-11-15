// Cámara REAL del prototipo del robot (Raspberry Pi + µStreamer), publicada con un túnel HTTPS.
// La URL sale de VITE_CAMERA_URL (no es secreta: el stream es público a propósito) o de `?cam=` en el enlace.
// µStreamer expone /stream (MJPEG), /snapshot (JPEG) y /state (JSON).

const ROTATE_KEY = 'marswalk.camera.rotate';
// `?cam=` solo acepta túneles de Cloudflare: así un enlace no puede poner contenido ajeno con la etiqueta REAL.
const QUERY_HOSTS = [/\.trycloudflare\.com$/i];

/**
 * Normaliza la base de la cámara: solo origen (sin ruta, query, # ni credenciales). '' si no es válida.
 * `allowHttp` solo para VITE_CAMERA_URL (desarrollo en la red local); en producción el http sería contenido mixto.
 */
export function cameraBase(raw = import.meta.env.VITE_CAMERA_URL, { allowHttp = true, hosts = null } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return '';
  }
  const okProto = u.protocol === 'https:' || (allowHttp && u.protocol === 'http:');
  if (!okProto || u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== '/')) return '';
  if (hosts && !hosts.some((re) => re.test(u.hostname))) return '';
  return u.origin;
}

/**
 * URL efectiva de la cámara: `?cam=<url>` (para cambiarla al instante cuando el túnel cambia, sin redesplegar;
 * solo https y *.trycloudflare.com) o, si no, VITE_CAMERA_URL. `?cam=off` la apaga.
 * Devuelve { base, fromQuery }.
 */
export function resolveCamera(search = typeof location !== 'undefined' ? location.search : '', env = import.meta.env.VITE_CAMERA_URL) {
  const q = new URLSearchParams(search).get('cam');
  if (q === 'off') return { base: '', fromQuery: false };
  const fromQ = cameraBase(q, { allowHttp: false, hosts: QUERY_HOSTS });
  if (fromQ) return { base: fromQ, fromQuery: true };
  return { base: cameraBase(env), fromQuery: false };
}

export const resolveCameraBase = (search, env) => resolveCamera(search, env).base;

/**
 * Lee /state de µStreamer. Nunca lanza.
 * Devuelve { ok: true, online, width, height, fps } o { ok: false, error }.
 */
export async function cameraStatus(base = resolveCameraBase(), { timeoutMs = 4000, fetchImpl = globalThis.fetch } = {}) {
  if (!base) return { ok: false, error: 'not_configured' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/state`, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const body = await res.json();
    const src = body?.result?.source;
    if (!body?.ok || !src) return { ok: false, error: 'bad_state' };
    return {
      ok: true,
      online: !!src.online,
      width: src.resolution?.width ?? null,
      height: src.resolution?.height ?? null,
      fps: body.result.stream?.queued_fps ?? src.captured_fps ?? null,
    };
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/** Rotación por defecto según cómo esté montada la cámara: VITE_CAMERA_ROTATE (0, 90, 180, 270); si no, 0. */
export function defaultRotation(raw = import.meta.env.VITE_CAMERA_ROTATE) {
  const v = Number(raw);
  return [0, 90, 180, 270].includes(v) ? v : 0;
}

/** Rotación elegida por el visitante (botón Rotar) o la de por defecto. */
export function loadRotation(fallback = defaultRotation()) {
  try {
    const raw = localStorage.getItem(ROTATE_KEY);
    const v = Number(raw);
    return raw !== null && [0, 90, 180, 270].includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveRotation(deg) {
  try {
    localStorage.setItem(ROTATE_KEY, String(deg));
  } catch {
    /* modo privado o almacenamiento bloqueado: se queda solo en memoria */
  }
}

export const nextRotation = (deg) => (deg + 90) % 360;

// ── Lectura del stream MJPEG (multipart/x-mixed-replace) ─────────────────────────────────────────────────
// µStreamer manda cada cuadro como: "--boundary\r\nContent-Type: image/jpeg\r\nContent-Length: N\r\nX-Timestamp: T\r\n\r\n<N bytes>".

const MAX_BUF = 2_000_000; // un cuadro de 320×240 pesa ~10 KB; más que esto es un stream que no es MJPEG
const MAX_HEAD = 1024;
const decoder = new TextDecoder('latin1');

function findHeaderEnd(buf, from) {
  for (let i = Math.max(0, from); i <= buf.length - 4; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) return i;
  }
  return -1;
}

/** Parser incremental: push(chunk) devuelve los cuadros completos [{ jpeg: Uint8Array, ts: number|null }]. */
export function createMjpegParser() {
  let buf = new Uint8Array(0);
  let scanFrom = 0; // dónde seguir buscando el fin de encabezado (no se re-escanea lo ya visto)
  return {
    push(chunk) {
      if (buf.length === 0) buf = chunk;
      else {
        const merged = new Uint8Array(buf.length + chunk.length);
        merged.set(buf);
        merged.set(chunk, buf.length);
        buf = merged;
      }
      const frames = [];
      for (;;) {
        const h = findHeaderEnd(buf, scanFrom - 3);
        if (h < 0) {
          scanFrom = buf.length;
          if (buf.length > MAX_HEAD && frames.length === 0 && !/content-length/i.test(decoder.decode(buf.subarray(0, MAX_HEAD)))) {
            // basura sin encabezados: se descarta y se resincroniza con lo que llegue
            buf = new Uint8Array(0);
            scanFrom = 0;
          }
          break;
        }
        const head = decoder.decode(buf.subarray(Math.max(0, h - MAX_HEAD), h));
        const len = /content-length:\s*(\d+)/i.exec(head);
        if (!len) {
          buf = buf.subarray(h + 4); // encabezado sin tamaño (p. ej. el inicio del multipart): se descarta
          scanFrom = 0;
          continue;
        }
        const n = Number(len[1]);
        if (buf.length < h + 4 + n) {
          scanFrom = h; // cuadro incompleto: esperar más datos sin volver a buscar el encabezado
          break;
        }
        const ts = /x-timestamp:\s*([\d.]+)/i.exec(head);
        frames.push({ jpeg: buf.subarray(h + 4, h + 4 + n), ts: ts ? Number(ts[1]) : null });
        buf = buf.subarray(h + 4 + n);
        scanFrom = 0;
      }
      if (buf.length > MAX_BUF) {
        buf = new Uint8Array(0);
        scanFrom = 0;
      }
      return frames;
    },
  };
}

/**
 * Búfer de suavizado guiado por el reloj de la cámara (X-Timestamp de µStreamer).
 * - Junta `delayMs` de video antes de empezar a reproducir.
 * - Muestra cada cuadro cuando le toca según su marca de tiempo: respeta el ritmo real de la cámara aunque
 *   baje de 15 FPS con poca luz (no se vacía y rellena a tirones).
 * - Si la red se adelanta y el búfer pasa de `maxDelayMs`, descarta lo viejo (no acumula retraso).
 * - Si se vacía, mantiene el último cuadro y vuelve a juntar.
 * Los cuadros sin marca de tiempo se reproducen a `fps` nominal.
 */
export function createJitterBuffer({ fps = 15, delayMs = 600, maxDelayMs = 1500 } = {}) {
  const q = []; // [{ f: cuadro, t: segundos en el reloj de la cámara }]
  const nominal = 1 / fps;
  let playing = false;
  let t0 = 0; // reloj local (ms) del ancla
  let ts0 = 0; // reloj de la cámara (s) del ancla
  let lastT = null; // último tiempo asignado (para cuadros sin marca)
  const stats = { received: 0, shown: 0, dropped: 0, stalls: 0 };
  const span = () => (q.length < 2 ? 0 : (q[q.length - 1].t - q[0].t) * 1000);
  return {
    intervalMs: Math.min(1000 / fps, 33),
    push(frame) {
      let t = frame.ts != null ? frame.ts : lastT != null ? lastT + nominal : 0;
      // Reloj de la cámara que retrocede o salta mucho (reinicio de µStreamer): se vuelve a anclar.
      if (lastT != null && (t < lastT || t - lastT > 5)) {
        q.length = 0;
        playing = false;
        if (frame.ts == null) t = 0;
      }
      lastT = t;
      q.push({ f: frame, t });
      stats.received++;
      while (q.length > 1 && span() > maxDelayMs) {
        q.shift();
        stats.dropped++;
        playing = false; // re-anclar con lo que queda
      }
    },
    /** Se llama seguido (cada intervalMs). Devuelve el cuadro a mostrar ahora o null (mantener el actual). */
    next(now = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
      if (!playing) {
        if (q.length === 0 || (span() < delayMs && q.length < Math.ceil((delayMs / 1000) * fps))) return null;
        playing = true;
        t0 = now;
        ts0 = q[0].t;
      }
      if (q.length === 0) {
        playing = false;
        stats.stalls++;
        return null;
      }
      const elapsed = (now - t0) / 1000;
      let out = null;
      while (q.length && q[0].t - ts0 <= elapsed + 1e-9) {
        if (out) stats.dropped++;
        out = q.shift().f;
      }
      if (out) stats.shown++;
      return out;
    },
    reset() {
      q.length = 0;
      playing = false;
      lastT = null;
    },
    size: () => q.length,
    stats: () => ({ ...stats }),
  };
}

// Cámara REAL del prototipo del robot (Raspberry Pi + µStreamer), publicada con un túnel HTTPS.
// La URL sale de VITE_CAMERA_URL (no es secreta: el stream es público a propósito). Vacía → sin cámara en vivo.
// µStreamer expone /stream (MJPEG), /snapshot (JPEG) y /state (JSON).

const ROTATE_KEY = 'marswalk.camera.rotate';

/** Base de la cámara sin "/" final, o '' si no está configurada. */
export function cameraBase(raw = import.meta.env.VITE_CAMERA_URL) {
  const s = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  return /^https?:\/\//.test(s) ? s : '';
}

/**
 * URL efectiva de la cámara: `?cam=<url>` en el enlace (para cambiarla al instante cuando el túnel cambia, sin
 * redesplegar) o, si no, VITE_CAMERA_URL. `?cam=off` la apaga.
 */
export function resolveCameraBase(search = typeof location !== 'undefined' ? location.search : '', env = import.meta.env.VITE_CAMERA_URL) {
  const q = new URLSearchParams(search).get('cam');
  if (q === 'off') return '';
  return cameraBase(q) || cameraBase(env);
}

export const cameraUrls = (base = resolveCameraBase()) =>
  base ? { stream: `${base}/stream`, snapshot: `${base}/snapshot`, state: `${base}/state` } : null;

/**
 * Lee /state de µStreamer. Nunca lanza.
 * Devuelve { ok: true, online, width, height, fps } o { ok: false, error }.
 * Si el túnel no manda CORS, el fetch falla aunque el video sí se vea: por eso el video no depende de esto.
 */
export async function cameraStatus(base = cameraBase(), { timeoutMs = 4000, fetchImpl = globalThis.fetch } = {}) {
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

/** Rotación guardada por el visitante (0, 90, 180, 270). La cámara del prototipo está montada de lado. */
export function loadRotation(fallback = 90) {
  try {
    const v = Number(localStorage.getItem(ROTATE_KEY));
    return [0, 90, 180, 270].includes(v) && localStorage.getItem(ROTATE_KEY) !== null ? v : fallback;
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
// µStreamer manda cada cuadro como: "--boundary\r\nContent-Type: image/jpeg\r\nContent-Length: N\r\n...\r\n\r\n<N bytes>".
// El túnel de Cloudflare entrega los cuadros a ráfagas; por eso se leen con fetch y se reproducen a ritmo
// constante desde un búfer (ver createJitterBuffer), en vez de un <img> que muestra las ráfagas tal cual.

const CRLF2 = [13, 10, 13, 10];
const decoder = new TextDecoder('latin1');

function indexOfSeq(buf, seq, from = 0) {
  outer: for (let i = from; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (buf[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}

/** Parser incremental: push(chunk) devuelve los cuadros completos [{ jpeg: Uint8Array, ts: number|null }]. */
export function createMjpegParser() {
  let buf = new Uint8Array(0);
  return {
    push(chunk) {
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf);
      merged.set(chunk, buf.length);
      buf = merged;
      const frames = [];
      for (;;) {
        const h = indexOfSeq(buf, CRLF2);
        if (h < 0) break;
        const head = decoder.decode(buf.subarray(0, h));
        const len = /content-length:\s*(\d+)/i.exec(head);
        if (!len) {
          buf = buf.subarray(h + 4); // encabezado sin tamaño (p. ej. el inicio): se descarta
          continue;
        }
        const n = Number(len[1]);
        if (buf.length < h + 4 + n) break; // cuadro incompleto: esperar más datos
        const ts = /x-timestamp:\s*([\d.]+)/i.exec(head);
        frames.push({ jpeg: buf.slice(h + 4, h + 4 + n), ts: ts ? Number(ts[1]) : null });
        buf = buf.subarray(h + 4 + n);
      }
      if (buf.length > 4_000_000) buf = new Uint8Array(0); // protección ante un stream corrupto
      return frames;
    },
  };
}

/**
 * Búfer de suavizado. Junta cuadros que llegan a ráfagas y los entrega a ritmo fijo.
 * - Espera a tener `startFrames` antes de empezar (≈ delayMs a fps).
 * - Si el búfer crece de más (la red se adelantó), descarta los viejos para no acumular retraso.
 * - Si se vacía, repite el último cuadro (no hay pantalla negra) y vuelve a juntar.
 */
export function createJitterBuffer({ fps = 15, delayMs = 600, maxDelayMs = 1500 } = {}) {
  const startFrames = Math.max(1, Math.round((delayMs / 1000) * fps));
  const maxFrames = Math.max(startFrames + 1, Math.round((maxDelayMs / 1000) * fps));
  const q = [];
  let playing = false;
  let stats = { received: 0, shown: 0, dropped: 0, stalls: 0 };
  return {
    intervalMs: 1000 / fps,
    push(frame) {
      q.push(frame);
      stats.received++;
      while (q.length > maxFrames) {
        q.shift();
        stats.dropped++;
      }
    },
    /** Se llama cada intervalMs. Devuelve el cuadro a mostrar o null (mantener el actual). */
    next() {
      if (!playing) {
        if (q.length < startFrames) return null;
        playing = true;
      }
      if (q.length === 0) {
        playing = false;
        stats.stalls++;
        return null;
      }
      stats.shown++;
      return q.shift();
    },
    size: () => q.length,
    stats: () => ({ ...stats }),
  };
}

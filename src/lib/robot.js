// Control del rover REAL (Raspberry Pi + L298N) por el mismo túnel de la cámara: POST <base>/robot/cmd.
// La Raspberry solo acepta 5 órdenes, cada una es un pulso corto (~0.6 s) y se detiene sola; limita a ~3/s.
// Nunca lanza: devuelve { ok, error }. El estado de la última orden se comparte con quien se suscriba.
import { resolveCameraBase } from './camera.js';

export const ROBOT_CMDS = ['forward', 'backward', 'left', 'right', 'stop'];

/** Hay robot si hay cámara configurada (mismo túnel). */
export const robotAvailable = (search, env) => !!resolveCameraBase(search, env);

const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Orden de voz o texto → comando del robot, o null si no es una orden.
 * Solo frases cortas e imperativas: una pregunta ("¿cuánto falta para regresar?") no mueve el robot.
 */
export function parseRobotCommand(text) {
  if (typeof text !== 'string' || text.includes('?')) return null;
  const s = norm(text);
  if (!s || s.split(' ').length > 7) return null;
  if (/^(robot )?(alto|detente|deten(lo|te)?|para(te)?|frena|stop|halt)( robot)?$/.test(s)) return 'stop';
  const turn = /\b(gira|girar|voltea|voltear|vuelta|dobla|doblar|turn|rotate|ve|vete|go|hacia|a la|to the)\b/.test(s) || s.split(' ').length <= 2;
  if (turn && /\b(izquierda|izq|left)\b/.test(s)) return 'left';
  if (turn && /\b(derecha|der|right)\b/.test(s)) return 'right';
  if (/\b(retrocede|retroceder|reversa|atras|back( up)?|backward|backwards|reverse)\b/.test(s)) return 'backward';
  if (/\b(avanza|avanzar|adelante|al frente|sigue|forward|ahead)\b/.test(s)) return 'forward';
  return null;
}

let last = null;
const listeners = new Set();
const emit = (s) => {
  last = s;
  listeners.forEach((fn) => fn(s));
};

/** Suscribirse al estado de la última orden ({ cmd, state: 'sending'|'done'|'error', error }). Devuelve cancelar. */
export function onRobotStatus(fn) {
  listeners.add(fn);
  fn(last);
  return () => listeners.delete(fn);
}

export async function robotCommand(cmd, { base = resolveCameraBase(), fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (!ROBOT_CMDS.includes(cmd)) return { ok: false, error: 'invalid_cmd' };
  if (!base) return { ok: false, error: 'not_configured' };
  emit({ cmd, state: 'sending', at: Date.now() });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let out;
  try {
    const res = await fetchImpl(`${base}/robot/cmd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd }),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    out = res.ok ? { ok: true } : { ok: false, error: res.status === 429 ? 'too_fast' : `http_${res.status}` };
  } catch (e) {
    out = { ok: false, error: e?.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
  emit({ cmd, state: out.ok ? 'done' : 'error', error: out.error ?? null, at: Date.now() });
  return out;
}

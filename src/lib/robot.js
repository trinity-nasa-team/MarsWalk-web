// Control del rover REAL (Raspberry Pi + L298N) por el mismo túnel de la cámara: POST <base>/robot/cmd.
// La Raspberry solo acepta 5 órdenes, cada una es un pulso corto (~0.6 s) y se detiene sola; limita a ~3/s.
// Nunca lanza: devuelve { ok, error }. El estado de la última orden se comparte con quien se suscriba.
import { resolveCameraBase } from './camera.js';

export const ROBOT_CMDS = ['forward', 'backward', 'left', 'right', 'stop'];

/**
 * Hay robot si hay túnel configurado (mismo de la cámara). Si la Raspberry está caída, la orden falla con aviso.
 * (El reconocimiento es estricto, así que el chat no toma frases normales como órdenes.)
 */
export const robotAvailable = (search, env) => !!resolveCameraBase(search, env);

const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¡!¿.,;:"“”«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const P = '(?:(?:oye |hey |ok |okay |por favor |please )?(?:robot )?)'; // prefijos de cortesía
const S = '(?: robot| por favor| please)?'; // sufijos de cortesía
const LEFT = '(?:izquierda|izq|left)';
const RIGHT = '(?:derecha|right)';
const TURN = '(?:gira|girar|voltea|voltear|dobla|doblar|da vuelta|da la vuelta|vuelta|turn|rotate|go|ve|vete|move|muevete)';
const TO = '(?: a| a la| hacia| hacia la| para la| to| to the)?';
const reTurn = (side) => new RegExp(`^${P}(?:${TURN}${TO} )?(?:a la |to the )?${side}${S}$`);
const reForward = new RegExp(
  `^${P}(?:avanza|avanzar|adelante|hacia adelante|sigue adelante|sigue derecho|todo derecho|ve adelante|go forward|move forward|go straight|move ahead|forward|ahead)${S}$`,
);
const reBackward = new RegExp(
  `^${P}(?:retrocede|retroceder|reversa|en reversa|hacia atras|atras|marcha atras|ve hacia atras|back up|go back|move back|go backward|move backward|backward|backwards|reverse)${S}$`,
);
const reStop = /\b(alto|detente|detenlo|deten|detener|frena|frenar|stop|halt)\b|^(para|parate|para el robot|para robot|robot para)$/;

/**
 * Orden de voz o texto → comando del robot, o null si no es una orden.
 * - "Alto" se reconoce en cualquier parte (es la orden de seguridad).
 * - El resto, solo frases cortas e imperativas completas ("gira a la izquierda", "avanza", "turn right").
 *   Así "qué hay a la izquierda", "gracias, sigue" o "what is ahead" (la voz casi nunca pone "?") no mueven el robot.
 * - Negaciones ("no gires a la izquierda") y todo lo que hable de la ruta o de autorizar se deja al hábitat.
 */
export function parseRobotCommand(text) {
  if (typeof text !== 'string') return null;
  const s = norm(text);
  if (!s || s.split(' ').length > 8) return null;
  const negated = /^(no|nunca|don ?t|do not|never)\b/.test(s);
  if (reStop.test(s)) return negated && !/\b(alto|stop|halt|frena)\b/.test(s) ? null : 'stop';
  if (negated || text.includes('?') || /\b(autoriz|aprueb|aprob|confirm|approv|authori|ruta|route)/.test(s)) return null;
  if (reTurn(LEFT).test(s)) return 'left';
  if (reTurn(RIGHT).test(s)) return 'right';
  if (reForward.test(s)) return 'forward';
  if (reBackward.test(s)) return 'backward';
  return null;
}

let last = null;
let seq = 0;
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

export async function robotCommand(cmd, { base = resolveCameraBase(), fetchImpl = globalThis.fetch, timeoutMs = 3000, heard = null } = {}) {
  if (!ROBOT_CMDS.includes(cmd)) return { ok: false, error: 'invalid_cmd' };
  if (!base) return { ok: false, error: 'not_configured' };
  const id = ++seq;
  emit({ cmd, state: 'sending', heard, at: Date.now() });
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
  if (id === seq) emit({ cmd, state: out.ok ? 'done' : 'error', error: out.error ?? null, heard, at: Date.now() }); // una orden más nueva manda
  return out;
}

import { describe, expect, it, vi } from 'vitest';
import {
  cameraBase,
  cameraStatus,
  cameraUrls,
  createJitterBuffer,
  createMjpegParser,
  nextRotation,
  resolveCameraBase,
} from '../src/lib/camera.js';

const enc = new TextEncoder();
const part = (bytes, ts = 1.5) =>
  enc.encode(`--boundarydonotcross\r\nContent-Type: image/jpeg\r\nContent-Length: ${bytes.length}\r\nX-Timestamp: ${ts}\r\n\r\n`);
const frame = (bytes, ts) => {
  const head = part(bytes, ts);
  const out = new Uint8Array(head.length + bytes.length + 2);
  out.set(head);
  out.set(bytes, head.length);
  out.set([13, 10], head.length + bytes.length);
  return out;
};

describe('URL de la cámara', () => {
  it('normaliza y rechaza valores inválidos', () => {
    expect(cameraBase('https://cam.example.com/')).toBe('https://cam.example.com');
    expect(cameraBase('  http://10.0.0.5:8080  ')).toBe('http://10.0.0.5:8080');
    expect(cameraBase('')).toBe('');
    expect(cameraBase(undefined)).toBe('');
    expect(cameraBase('javascript:alert(1)')).toBe('');
    expect(cameraBase('cam.example.com')).toBe('');
  });

  it('?cam= tiene prioridad sobre la variable y ?cam=off la apaga', () => {
    expect(resolveCameraBase('?cam=https://nueva.trycloudflare.com', 'https://vieja.example')).toBe('https://nueva.trycloudflare.com');
    expect(resolveCameraBase('', 'https://vieja.example/')).toBe('https://vieja.example');
    expect(resolveCameraBase('?cam=off', 'https://vieja.example')).toBe('');
    expect(resolveCameraBase('?cam=basura', 'https://vieja.example')).toBe('https://vieja.example');
    expect(resolveCameraBase('', '')).toBe('');
  });

  it('arma las rutas de µStreamer', () => {
    expect(cameraUrls('https://c.example')).toEqual({
      stream: 'https://c.example/stream',
      snapshot: 'https://c.example/snapshot',
      state: 'https://c.example/state',
    });
    expect(cameraUrls('')).toBeNull();
  });

  it('rota de 90 en 90', () => {
    expect([0, 90, 180, 270].map(nextRotation)).toEqual([90, 180, 270, 0]);
  });
});

describe('cameraStatus (nunca lanza)', () => {
  const ok = (body) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));

  it('lee resolución y FPS del /state de µStreamer', async () => {
    const body = { ok: true, result: { source: { online: true, resolution: { width: 320, height: 240 }, captured_fps: 14 }, stream: { queued_fps: 15 } } };
    expect(await cameraStatus('https://c.example', { fetchImpl: ok(body) })).toEqual({ ok: true, online: true, width: 320, height: 240, fps: 15 });
  });

  it('sin configurar, caída, HTTP de error o respuesta que no es el /state', async () => {
    expect(await cameraStatus('')).toEqual({ ok: false, error: 'not_configured' });
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await cameraStatus('https://c.example', { fetchImpl: down })).toEqual({ ok: false, error: 'unreachable' });
    const e502 = vi.fn(async () => ({ ok: false, status: 502 }));
    expect(await cameraStatus('https://c.example', { fetchImpl: e502 })).toEqual({ ok: false, error: 'http_502' });
    expect(await cameraStatus('https://c.example', { fetchImpl: ok({ hello: 1 }) })).toEqual({ ok: false, error: 'bad_state' });
  });
});

describe('parser MJPEG', () => {
  it('saca cuadros completos aunque lleguen partidos en trozos arbitrarios', () => {
    const a = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const b = new Uint8Array([0xff, 0xd8, 9, 0xff, 0xd9]);
    const all = new Uint8Array([...frame(a, 10.25), ...frame(b, 10.32)]);
    const p = createMjpegParser();
    const got = [];
    for (let i = 0; i < all.length; i += 3) got.push(...p.push(all.subarray(i, i + 3)));
    expect(got.map((f) => [...f.jpeg])).toEqual([[...a], [...b]]);
    expect(got.map((f) => f.ts)).toEqual([10.25, 10.32]);
  });

  it('no entrega un cuadro incompleto', () => {
    const a = new Uint8Array(50).fill(7);
    const fr = frame(a);
    const p = createMjpegParser();
    expect(p.push(fr.subarray(0, fr.length - 10))).toEqual([]);
    expect(p.push(fr.subarray(fr.length - 10)).length).toBe(1);
  });
});

describe('búfer de suavizado', () => {
  it('espera a juntar el retraso, entrega a ritmo fijo y repite si se vacía', () => {
    const jb = createJitterBuffer({ fps: 10, delayMs: 300, maxDelayMs: 1000 }); // arranca con 3 cuadros
    expect(jb.intervalMs).toBe(100);
    jb.push('a');
    jb.push('b');
    expect(jb.next()).toBeNull(); // aún no junta 3
    jb.push('c');
    expect([jb.next(), jb.next(), jb.next()]).toEqual(['a', 'b', 'c']);
    expect(jb.next()).toBeNull(); // vacío → se mantiene el último cuadro y vuelve a juntar
    expect(jb.stats().stalls).toBe(1);
  });

  it('descarta lo viejo si la red se adelanta (no acumula retraso)', () => {
    const jb = createJitterBuffer({ fps: 10, delayMs: 300, maxDelayMs: 500 }); // máximo 5 cuadros
    for (let i = 0; i < 12; i++) jb.push(i);
    expect(jb.size()).toBe(5);
    expect(jb.next()).toBe(7);
    expect(jb.stats().dropped).toBe(7);
  });
});

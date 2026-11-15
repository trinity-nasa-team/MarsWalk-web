import { describe, expect, it, vi } from 'vitest';
import {
  cameraBase,
  defaultRotation,
  cameraStatus,
  createJitterBuffer,
  createMjpegParser,
  nextRotation,
  resolveCamera,
  resolveCameraBase,
} from '../src/lib/camera.js';

const enc = new TextEncoder();
const frame = (bytes, ts = 1.5, withLen = true) => {
  const head = enc.encode(
    `--boundarydonotcross\r\nContent-Type: image/jpeg\r\n${withLen ? `Content-Length: ${bytes.length}\r\n` : ''}X-Timestamp: ${ts}\r\n\r\n`,
  );
  const out = new Uint8Array(head.length + bytes.length + 2);
  out.set(head);
  out.set(bytes, head.length);
  out.set([13, 10], head.length + bytes.length);
  return out;
};
const cat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
};

describe('URL de la cámara', () => {
  it('solo acepta un origen limpio', () => {
    expect(cameraBase('https://cam.example.com/')).toBe('https://cam.example.com');
    expect(cameraBase('HTTPS://Cam.Example.com')).toBe('https://cam.example.com');
    expect(cameraBase('  http://10.0.0.5:8080  ')).toBe('http://10.0.0.5:8080');
    for (const bad of ['', undefined, 'javascript:alert(1)', 'cam.example.com', 'https://u:p@cam.example.com', 'https://cam.example.com/x', 'https://cam.example.com/?a=1', 'https://cam.example.com/#x', 'ftp://cam.example.com']) {
      expect(cameraBase(bad), String(bad)).toBe('');
    }
  });

  it('?cam= solo acepta túneles https de Cloudflare; si no, usa la variable', () => {
    expect(resolveCamera('?cam=https://abc-def.trycloudflare.com', 'https://vieja.example')).toEqual({ base: 'https://abc-def.trycloudflare.com', fromQuery: true });
    expect(resolveCamera('', 'https://vieja.example/')).toEqual({ base: 'https://vieja.example', fromQuery: false });
    expect(resolveCameraBase('?cam=https://atacante.example', 'https://vieja.example')).toBe('https://vieja.example');
    expect(resolveCameraBase('?cam=http://abc.trycloudflare.com', '')).toBe('');
    expect(resolveCameraBase('?cam=https://abc.trycloudflare.com/accion?x=', '')).toBe('');
    expect(resolveCameraBase('?cam=https://trycloudflare.com.atacante.example', '')).toBe('');
    expect(resolveCameraBase('?cam=off', 'https://vieja.example')).toBe('');
    expect(resolveCameraBase('', '')).toBe('');
  });

  it('rota de 90 en 90 y la rotación por defecto sale de la variable', () => {
    expect([0, 90, 180, 270].map(nextRotation)).toEqual([90, 180, 270, 0]);
    expect(defaultRotation('90')).toBe(90);
    expect(defaultRotation('')).toBe(0);
    expect(defaultRotation(undefined)).toBe(0);
    expect(defaultRotation('45')).toBe(0);
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
  const a = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const b = new Uint8Array([0xff, 0xd8, 9, 0xff, 0xd9]);

  it('saca cuadros completos aunque lleguen partidos en trozos arbitrarios', () => {
    const all = cat(frame(a, 10.25), frame(b, 10.32));
    for (const step of [1, 3, 7, 50]) {
      const p = createMjpegParser();
      const got = [];
      for (let i = 0; i < all.length; i += step) got.push(...p.push(all.slice(i, i + step)));
      expect(got.map((f) => [...f.jpeg]), `step ${step}`).toEqual([[...a], [...b]]);
      expect(got.map((f) => f.ts)).toEqual([10.25, 10.32]);
    }
  });

  it('varios cuadros en un solo trozo', () => {
    const p = createMjpegParser();
    expect(p.push(cat(frame(a, 1), frame(b, 2), frame(a, 3))).map((f) => f.ts)).toEqual([1, 2, 3]);
  });

  it('no entrega un cuadro incompleto', () => {
    const big = new Uint8Array(50).fill(7);
    const fr = frame(big);
    const p = createMjpegParser();
    expect(p.push(fr.slice(0, fr.length - 10))).toEqual([]);
    expect(p.push(fr.slice(fr.length - 10)).length).toBe(1);
  });

  it('salta un encabezado sin Content-Length y basura, y se resincroniza', () => {
    const p = createMjpegParser();
    const junk = enc.encode('x'.repeat(3000));
    expect(p.push(junk)).toEqual([]);
    expect(p.push(cat(frame(a, 1, false), frame(b, 2))).map((f) => f.ts)).toEqual([2]);
  });
});

describe('búfer de suavizado (reloj de la cámara)', () => {
  const f = (ts) => ({ jpeg: null, ts });

  it('junta el retraso antes de reproducir y luego respeta el ritmo de la cámara', () => {
    const jb = createJitterBuffer({ fps: 10, delayMs: 300, maxDelayMs: 2000 });
    jb.push(f(0));
    jb.push(f(0.1));
    expect(jb.next(0)).toBeNull(); // solo 100 ms juntados
    jb.push(f(0.2));
    jb.push(f(0.3));
    expect(jb.next(1000)?.ts).toBe(0); // arranca y ancla
    expect(jb.next(1050)).toBeNull(); // aún no toca el de 0.1
    expect(jb.next(1100)?.ts).toBe(0.1);
    expect(jb.next(1300)?.ts).toBe(0.3); // si se atrasa, salta al cuadro que toca (no acumula retraso)
    expect(jb.stats().dropped).toBe(1);
  });

  it('a 5 FPS reales no se vacía cada segundo (ritmo por marca de tiempo, no por conteo)', () => {
    const jb = createJitterBuffer({ fps: 15, delayMs: 600, maxDelayMs: 3000 });
    for (const ts of [0, 0.2, 0.4, 0.6]) jb.push(f(ts)); // 5 FPS reales
    let shownAt = [];
    for (let t = 0; t <= 630; t += 33) {
      const out = jb.next(t);
      if (out) shownAt.push(out.ts);
    }
    expect(shownAt).toEqual([0, 0.2, 0.4, 0.6]);
    expect(jb.stats().stalls).toBe(0);
  });

  it('descarta lo viejo si la red se adelanta y se re-ancla si el reloj de la cámara salta', () => {
    const jb = createJitterBuffer({ fps: 10, delayMs: 300, maxDelayMs: 500 });
    for (let i = 0; i < 12; i++) jb.push(f(i * 0.1));
    expect(jb.size()).toBe(6); // 0.6..1.1 → 500 ms
    jb.push(f(0.05)); // µStreamer reiniciado: el reloj retrocede
    expect(jb.size()).toBe(1);
  });

  it('cuadros sin marca de tiempo usan el ritmo nominal', () => {
    const jb = createJitterBuffer({ fps: 10, delayMs: 200, maxDelayMs: 2000 });
    for (let i = 0; i < 3; i++) jb.push({ jpeg: null, ts: null, i });
    expect(jb.next(0)?.i).toBe(0);
    expect(jb.next(100)?.i).toBe(1);
  });
});

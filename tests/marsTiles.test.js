import { describe, expect, it } from 'vitest';
import { mercatorBounds, pickLevel, rowLatitude, SOURCES, surfaceFromThemis, tileDeg } from '../src/lib/marsTiles.js';

describe('reproyección geográfica → Web Mercator', () => {
  it('el tile 0/0/0 cubre el mundo Mercator', () => {
    const b = mercatorBounds(0, 0, 0);
    expect(b.lon0).toBe(-180);
    expect(b.lon1).toBe(180);
    expect(b.latTop).toBeCloseTo(85.0511, 3);
    expect(b.latBottom).toBeCloseTo(-85.0511, 3);
  });
  it('las filas bajan de latitud dentro del tile', () => {
    const a = rowLatitude(8, 110, 0, 256);
    const z = rowLatitude(8, 110, 255, 256);
    const b = mercatorBounds(8, 110, 110);
    expect(a).toBeGreaterThan(z);
    expect(a).toBeLessThan(mercatorBounds(8, 0, 110).latTop + 1e-9);
    expect(b.latTop).toBeGreaterThan(b.latBottom);
  });
  it('elige el nivel de la fuente sin pasar su máximo', () => {
    expect(tileDeg(0)).toBe(180);
    const fine = 1e-6;
    expect(pickLevel(SOURCES.viking, fine)).toBe(SOURCES.viking.maxZ);
    const lvl = pickLevel(SOURCES.ctx, 0.001);
    expect(tileDeg(lvl) / SOURCES.ctx.px).toBeLessThanOrEqual(0.001);
    expect(tileDeg(lvl - 1) / SOURCES.ctx.px).toBeGreaterThan(0.001);
  });
  it('lectura cualitativa del THEMIS nocturno', () => {
    expect(surfaceFromThemis(null)).toBeNull();
    expect(surfaceFromThemis(200)).toBe('rock');
    expect(surfaceFromThemis(50)).toBe('fines');
    expect(surfaceFromThemis(120)).toBe('mixed');
  });
});

describe('inyección de detalle CTX sobre Viking', () => {
  it('conserva el brillo medio de Viking y amplifica el detalle de CTX', async () => {
    const { injectDetail } = await import('../src/lib/marsTiles.js');
    const size = 32;
    const gd = new Uint8ClampedArray(size * size * 4);
    const cd = new Uint8ClampedArray(size * size * 4);
    for (let p = 0; p < size * size; p++) {
      const v = 120 + ((p % size) % 2 ? 4 : -4); // CTX casi plano con textura fina
      gd.set([v, v, v, 255], p * 4);
      cd.set([180, 110, 80, 255], p * 4); // Viking: óxido
    }
    injectDetail(gd, cd, size, 5);
    const reds = [];
    for (let p = 0; p < size * size; p++) reds.push(gd[p * 4]);
    const mean = reds.reduce((a, b) => a + b, 0) / reds.length;
    expect(mean).toBeGreaterThan(170);
    expect(mean).toBeLessThan(190);
    expect(Math.max(...reds) - Math.min(...reds)).toBeGreaterThan(30); // detalle visible
  });
});

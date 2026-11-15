import { describe, expect, it } from 'vitest';
import { preprocess, resampleProbs, sizeFor } from '../src/lib/vision.js';

describe('modelos de entrada fija (RockSeg 320×480)', () => {
  it('preprocess usa ancho×alto del modelo, no size²', () => {
    const w = 6;
    const h = 4;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(128);
    const out = preprocess(rgba, 99, { kind: 'rgb', width: w, height: h, mean: [0, 0, 0], std: [1, 1, 1] });
    expect(out.length).toBe(3 * w * h);
    expect(out[0]).toBeCloseTo(128 / 255, 5);
  });

  it('sin width/height sigue siendo cuadrado (modelos anteriores)', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    expect(preprocess(rgba, 4, { kind: 'rgb', mean: [0, 0, 0], std: [1, 1, 1] }).length).toBe(3 * 16);
  });

  it('resampleProbs: identidad cuando ya es S×S', () => {
    const p = new Float32Array(2 * 4 * 4).map((_, i) => i);
    expect(resampleProbs(p, 2, 4, 4, 4)).toBe(p);
  });

  it('resampleProbs: h×w → S×S por vecino más cercano, cada clase por separado', () => {
    // 2 clases, 2×4 (h×w): clase 0 = columna x, clase 1 = 10 + fila y
    const h = 2;
    const w = 4;
    const p = new Float32Array(2 * h * w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        p[y * w + x] = x;
        p[h * w + y * w + x] = 10 + y;
      }
    }
    const out = resampleProbs(p, 2, h, w, 2); // 2×2
    expect(Array.from(out.slice(0, 4))).toEqual([1, 3, 1, 3]); // columnas 1 y 3 (centros de los pixeles destino)
    expect(Array.from(out.slice(4))).toEqual([10, 10, 11, 11]);
  });

  it('sizeFor devuelve meta.size cuando la entrada es fija', () => {
    expect(sizeFor({ size: 320, fixed_input: true }, 'fast')).toBe(320);
    expect(sizeFor({ size: 384 }, 'fast')).toBe(192);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { argmax, classShares, colorize, hazardsFound, percentile, preprocess, VISION_MODELS } from '../src/lib/vision.js';

// Valores de referencia generados con `preprocess` de MarsWalk-v2/scripts/export_vision_onnx.py (numpy).
const FX = JSON.parse(readFileSync(resolve('tests/fixtures_vision.json'), 'utf8'));
const META = Object.fromEntries(
  VISION_MODELS.map((id) => [id, JSON.parse(readFileSync(resolve(`public/models/vision/${id}.json`), 'utf8'))]),
);
const IMAGENET = { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] };

describe('visión del robot: preprocesamiento igual al del entrenamiento', () => {
  const rgba = Uint8ClampedArray.from(FX.rgba);
  const close = (a, b) => a.forEach((v, i) => expect(v, `i=${i}`).toBeCloseTo(b[i], 3));

  it('percentil = numpy.percentile (interpolación lineal)', () => {
    const s = Float32Array.from([1, 2, 3, 4, 5]);
    expect(percentile(s, 0)).toBe(1);
    expect(percentile(s, 50)).toBe(3);
    expect(percentile(s, 99)).toBeCloseTo(4.96, 5);
  });
  it('gris con estirado p1–p99 (AI4Mars)', () => {
    close(preprocess(rgba, FX.size, { kind: 'gray', contrast_stretch: true, ...IMAGENET }), FX.gray_stretch);
  });
  it('gris sin estirado', () => {
    close(preprocess(rgba, FX.size, { kind: 'gray', contrast_stretch: false, ...IMAGENET }), FX.gray_plain);
  });
  it('RGB con balance de blancos (S5Mars sobre la Hazcam)', () => {
    close(preprocess(rgba, FX.size, { kind: 'rgb', white_balance: true, ...IMAGENET }), FX.rgb_wb);
  });
  it('RGB (S5Mars)', () => {
    close(preprocess(rgba, FX.size, { kind: 'rgb', contrast_stretch: false, ...IMAGENET }), FX.rgb);
  });
});

describe('visión del robot: posproceso', () => {
  it('argmax por píxel sobre logits N×S×S', () => {
    // 2 clases, 2×2 px: canal 0 = [5,0,0,1], canal 1 = [0,5,1,0]
    const logits = Float32Array.from([5, 0, 0, 1, 0, 5, 1, 0]);
    expect([...argmax(logits, 2, 2)]).toEqual([0, 1, 1, 0]);
  });
  it('fracciones sin fondo y peligro de arena (AI4Mars)', () => {
    const m = META.ai4mars;
    const A = m.classes.indexOf('arena');
    const F = m.classes.indexOf('fondo');
    const S = m.classes.indexOf('suelo');
    const labels = Uint8Array.from([A, A, S, S, F, F, F, F]); // 50 % arena del terreno visible
    const sh = classShares(labels, m);
    expect(sh.find((s) => s.id === 'arena').share).toBeCloseTo(0.5);
    expect(sh.find((s) => s.id === 'fondo').share).toBeNull();
    expect(hazardsFound(sh, m).map((h) => h.id)).toEqual(['arena']);
  });
  it('sin peligro si todo es suelo', () => {
    const m = META.s5mars;
    const sh = classShares(Uint8Array.from([2, 2, 2, 0]), m);
    expect(hazardsFound(sh, m)).toEqual([]);
  });
  it('colorea con la paleta del modelo', () => {
    const px = colorize(Uint8Array.from([1]), [[0, 0, 0], [10, 20, 30]]);
    expect([...px]).toEqual([10, 20, 30, 255]);
  });
  it('metadatos completos y coherentes para ambos modelos', () => {
    for (const id of VISION_MODELS) {
      const m = META[id];
      expect(m.classes.length).toBe(m.colors.length);
      expect(m.classes.length).toBe(m.classes_en.length);
      for (const h of Object.keys(m.hazards)) expect(m.classes).toContain(h);
      expect(m.dataset).toBeTruthy();
      expect(m.limitations.length).toBeGreaterThan(0);
      expect([384, 512]).toContain(m.size);
    }
  });
});



describe('rótulos por región (estilo detector)', async () => {
  const { labelRegions } = await import('../src/lib/vision.js');
  it('encuentra las regiones grandes con su centro y omite las clases ignoradas', () => {
    const m = META.ai4mars;
    const A = m.classes.indexOf('arena');
    const S = m.classes.indexOf('suelo');
    const F = m.classes.indexOf('fondo');
    const size = 8;
    const labels = new Uint8Array(size * size).fill(F);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) labels[y * size + x] = y < 4 ? A : S; // mitad izquierda
    const rs = labelRegions(labels, size, m, 8);
    expect(rs.map((r) => r.id).sort()).toEqual(['arena', 'suelo']);
    const arena = rs.find((r) => r.id === 'arena');
    expect(arena.share).toBeCloseTo(0.25);
    expect(arena.x).toBeCloseTo(0.25);
    expect(arena.y).toBeCloseTo(0.25);
  });
});

describe('umbral de confianza', async () => {
  const { argmaxConf, colorizeConf } = await import('../src/lib/vision.js');
  it('confianza = softmax de la clase ganadora y máscara transparente bajo el umbral', () => {
    // 2 clases, 2×2 px: píxel 1 dudoso (0.1 vs 0); los demás muy seguros (10 vs 0)
    const { labels, conf } = argmaxConf(Float32Array.from([10, 0.1, 10, 10, 0, 0, 0, 0]), 2, 2);
    expect([...labels]).toEqual([0, 0, 0, 0]);
    expect(conf[0]).toBe(255);
    expect(conf[1]).toBeGreaterThan(125);
    expect(conf[1]).toBeLessThan(140);
    const px = colorizeConf(labels, conf, [[9, 9, 9], [1, 1, 1]], 200, new Set(), 2);
    expect(px[3]).toBeGreaterThan(0);
    expect(px[7]).toBe(0);
  });
});

describe('cámara en vivo: suavizado, calidad y rotulado', async () => {
  const { Smoother, labelsFromProbs, sizeFor } = await import('../src/lib/vision.js');
  it('el suavizado exponencial mezcla el cuadro nuevo con el anterior', () => {
    const sm = new Smoother(0.5);
    sm.push(Float32Array.from([1, 0]));
    const out = sm.push(Float32Array.from([0, 1]));
    expect([...out]).toEqual([0.5, 0.5]);
  });
  it('alpha = 1 no suaviza y un cambio de forma reinicia', () => {
    const sm = new Smoother(1);
    sm.push(Float32Array.from([1, 0]));
    expect([...sm.push(Float32Array.from([0, 1]))]).toEqual([0, 1]);
    const sm2 = new Smoother(0.5);
    sm2.push(Float32Array.from([1, 0]));
    expect([...sm2.push(Float32Array.from([0, 1, 0, 1]))]).toEqual([0, 1, 0, 1]);
  });
  it('etiqueta y confianza salen de las probabilidades', () => {
    // 2 clases, 2×2 px (C×S×S): clase 0 gana en px 0 y 1, clase 1 en px 2 y 3
    const { labels, conf } = labelsFromProbs(Float32Array.from([0.9, 0.6, 0.2, 0.1, 0.1, 0.4, 0.8, 0.9]), 2, 2);
    expect([...labels]).toEqual([0, 0, 1, 1]);
    expect(conf[0]).toBeGreaterThanOrEqual(229); // 0.9·255 con float32
    expect(conf[1]).toBe(153);
  });
  it('calidad → tamaños múltiplos de 16 sobre el nativo', () => {
    expect(sizeFor({ size: 384 }, 'fast')).toBe(192);
    expect(sizeFor({ size: 384 }, 'normal')).toBe(288);
    expect(sizeFor({ size: 512 }, 'fast')).toBe(256);
    expect(sizeFor({ size: 512 }, 'high')).toBe(512);
  });
});

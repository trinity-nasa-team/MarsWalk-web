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

describe('cámara del robot: foto real más cercana', async () => {
  const { nearestPhoto } = await import('../src/components/Viewfinder.jsx');
  const photos = [
    { file: 'a.jpg', lon: 77.45, lat: 18.44, sol: 13 },
    { file: 'b.jpg', lon: 77.40, lat: 18.48, sol: 300 },
  ];
  it('elige la más cercana y da la distancia en metros', () => {
    const p = nearestPhoto(photos, [77.401, 18.479]);
    expect(p.file).toBe('b.jpg');
    expect(p.dist_m).toBeGreaterThan(50);
    expect(p.dist_m).toBeLessThan(200);
  });
  it('sin fotos → null', () => {
    expect(nearestPhoto([], [77.4, 18.4])).toBeNull();
  });
});

describe('feed de video del robot', async () => {
  const { feedPosition, FEED_STEP_M } = await import('../src/components/Viewfinder.jsx');
  it('avanza un cuadro cada FEED_STEP_M metros y da la fracción para el fundido', () => {
    expect(feedPosition(5, 0, 100)).toEqual({ idx: 5, next: 6, t: 0 });
    const p = feedPosition(5, FEED_STEP_M * 2.5, 100);
    expect(p.idx).toBe(7);
    expect(p.t).toBeCloseTo(0.5);
  });
  it('da la vuelta al final de la secuencia', () => {
    expect(feedPosition(99, FEED_STEP_M, 100).idx).toBe(0);
    expect(feedPosition(0, 0, 0)).toEqual({ idx: 0, next: 0, t: 0 });
  });
});

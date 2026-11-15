// Visión del robot: segmentación de terreno en el navegador (onnxruntime-web, WASM) con dos modelos que se
// pueden alternar. Los .onnx y sus metadatos los genera MarsWalk-v2/scripts/export_vision_onnx.py desde los
// checkpoints de PyTorch; el preprocesamiento replica el `to_input` de cada notebook de entrenamiento.
//  - AI4Mars (NASA/JPL, Swan et al. 2021): foto en gris, 384 px, estirado de contraste p1–p99.
//  - S5Mars (Zhang et al., IEEE TGRS 2024): foto a color, 512 px.
// Las funciones puras (preprocess, argmax, shares…) no dependen del navegador y tienen pruebas.

export const VISION_MODELS = ['ai4mars', 's5mars'];
const BASE = '/models/vision';

/** Percentil con interpolación lineal, igual que numpy.percentile (método por defecto). */
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * RGBA (S×S, de un canvas) → Float32Array 1×3×S×S normalizado como en el entrenamiento.
 * gray: luma → (opcional) estirado p1–p99 → 3 canales iguales; rgb: /255. Después, normalización ImageNet.
 */
export function preprocess(rgba, size, input) {
  const n = size * size;
  const out = new Float32Array(3 * n);
  const { mean, std } = input;
  if (input.kind === 'gray') {
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2];
    let lo = 0;
    let span = 255;
    if (input.contrast_stretch) {
      const s = Float32Array.from(g).sort();
      lo = percentile(s, 1);
      span = Math.max(percentile(s, 99) - lo, 1);
    }
    for (let i = 0; i < n; i++) {
      const v = Math.min(1, Math.max(0, (g[i] - lo) / span));
      for (let c = 0; c < 3; c++) out[c * n + i] = (v - mean[c]) / std[c];
    }
  } else {
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[4 * i + c] / 255 - mean[c]) / std[c];
    }
  }
  return out;
}

/** Logits 1×N×S×S → etiqueta por píxel (Uint8Array S×S). */
export function argmax(logits, nClasses, size) {
  const n = size * size;
  const labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bv = logits[i];
    for (let c = 1; c < nClasses; c++) {
      const v = logits[c * n + i];
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    labels[i] = best;
  }
  return labels;
}

/** Fracción de píxeles por clase, sin contar las clases que no son terreno (fondo, cielo, rover). */
export function classShares(labels, meta) {
  const counts = new Array(meta.classes.length).fill(0);
  for (const l of labels) counts[l]++;
  const ignore = new Set((meta.ignore_in_share || []).map((c) => meta.classes.indexOf(c)));
  const total = counts.reduce((s, v, i) => (ignore.has(i) ? s : s + v), 0) || 1;
  return meta.classes.map((c, i) => ({ id: c, share: ignore.has(i) ? null : counts[i] / total, px: counts[i] }));
}

/** Clases de peligro que superan su umbral (fracción del terreno visible). */
export function hazardsFound(shares, meta) {
  return Object.entries(meta.hazards || {})
    .map(([id, min]) => ({ id, min, share: shares.find((s) => s.id === id)?.share ?? 0 }))
    .filter((h) => h.share >= h.min);
}

/** Etiquetas → RGBA con la paleta del modelo (alfa 255; la opacidad se controla con CSS). */
export function colorize(labels, colors) {
  const out = new Uint8ClampedArray(labels.length * 4);
  for (let i = 0; i < labels.length; i++) {
    const c = colors[labels[i]] || [0, 0, 0];
    out[4 * i] = c[0];
    out[4 * i + 1] = c[1];
    out[4 * i + 2] = c[2];
    out[4 * i + 3] = 255;
  }
  return out;
}

// ---- Navegador: metadatos y un Web Worker que corre los modelos (ver visionWorker.js) ----
const metas = new Map();
let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./visionWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.ok) p.resolve(data);
      else p.reject(new Error(data.error));
    };
  }
  return worker;
}

function ask(msg, transfer = []) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...msg }, transfer);
  });
}

export async function loadMeta(id) {
  if (!metas.has(id)) {
    const p = fetch(`${BASE}/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`meta ${id}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => metas.delete(id));
    metas.set(id, p);
  }
  return metas.get(id);
}

/** Descarga y prepara el modelo antes del primer cuadro (la primera carga son 23–53 MB). */
export async function warmUp(id) {
  const meta = await loadMeta(id);
  await ask({ warm: true, url: `${BASE}/${meta.file}` });
  return meta;
}

let grab = null;
/** Segmenta el cuadro actual de una imagen, video o cámara (cualquier fuente que acepte drawImage). */
export async function segment(id, source) {
  const meta = await loadMeta(id);
  const S = meta.size;
  grab ??= document.createElement('canvas');
  if (grab.width !== S) {
    grab.width = S;
    grab.height = S;
  }
  const ctx = grab.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, S, S); // mismo redimensionado a S×S que el entrenamiento
  const rgba = ctx.getImageData(0, 0, S, S).data.buffer;
  const r = await ask({ url: `${BASE}/${meta.file}`, rgba, size: S, input: meta.input, nClasses: meta.classes.length }, [rgba]);
  const shares = classShares(r.labels, meta);
  return { meta, size: S, labels: r.labels, shares, hazards: hazardsFound(shares, meta), ms: r.ms };
}

/**
 * Regiones conexas grandes para rotular (estilo detector): baja las etiquetas a una rejilla `grid`×`grid`,
 * une celdas vecinas de la misma clase y devuelve hasta `max` regiones con su centro (0–1) y tamaño (fracción).
 */
export function labelRegions(labels, size, meta, grid = 48, minShare = 0.025, max = 6) {
  const g = new Uint8Array(grid * grid);
  for (let y = 0; y < grid; y++) {
    const sy = Math.min(size - 1, Math.floor(((y + 0.5) * size) / grid));
    for (let x = 0; x < grid; x++) g[y * grid + x] = labels[sy * size + Math.min(size - 1, Math.floor(((x + 0.5) * size) / grid))];
  }
  const ignore = new Set((meta.ignore_in_share || []).map((c) => meta.classes.indexOf(c)));
  const seen = new Uint8Array(grid * grid);
  const out = [];
  const stack = [];
  for (let i = 0; i < g.length; i++) {
    if (seen[i] || ignore.has(g[i])) continue;
    const c = g[i];
    let n = 0;
    let sx = 0;
    let sy = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % grid;
      const y = (j - x) / grid;
      n++;
      sx += x;
      sy += y;
      if (x > 0 && !seen[j - 1] && g[j - 1] === c) (seen[j - 1] = 1), stack.push(j - 1);
      if (x < grid - 1 && !seen[j + 1] && g[j + 1] === c) (seen[j + 1] = 1), stack.push(j + 1);
      if (y > 0 && !seen[j - grid] && g[j - grid] === c) (seen[j - grid] = 1), stack.push(j - grid);
      if (y < grid - 1 && !seen[j + grid] && g[j + grid] === c) (seen[j + grid] = 1), stack.push(j + grid);
    }
    const share = n / g.length;
    if (share >= minShare) out.push({ id: meta.classes[c], cls: c, x: (sx / n + 0.5) / grid, y: (sy / n + 0.5) / grid, share });
  }
  return out.sort((a, b) => b.share - a.share).slice(0, max);
}

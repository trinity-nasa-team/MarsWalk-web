// Visión del robot: segmentación de terreno en el navegador (onnxruntime-web, WASM) con dos modelos que se
// pueden alternar. Los .onnx y sus metadatos los genera MarsWalk-v2/scripts/export_vision_onnx.py desde los
// checkpoints de PyTorch; el preprocesamiento replica el `to_input` de cada notebook de entrenamiento.
//  - AI4Mars (NASA/JPL, Swan et al. 2021): foto en gris, 384 px, estirado de contraste p1–p99.
//  - S5Mars (Zhang et al., IEEE TGRS 2024): foto a color, 512 px.
// Las funciones puras (preprocess, argmax, shares…) no dependen del navegador y tienen pruebas.

const BASE = '/models/vision';

/** Modelos instalados: ids listados en /models/vision/index.json ({"models": ["id", …]}). Sin archivo = sin IA. */
let modelList = null;
export function loadModelList() {
  modelList ??= fetch(`${BASE}/index.json`)
    .then((r) => (r.ok ? r.json() : { models: [] }))
    .then((d) => (Array.isArray(d.models) ? d.models : []))
    .catch(() => []);
  return modelList;
}

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
  const n = input.width && input.height ? input.width * input.height : size * size; // modelos de entrada fija (p. ej. 320×480) no son cuadrados
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
    // Balance de blancos «gray-world» (sobre píxeles no oscuros): quita el tinte de la cámara. S5Mars se entrenó
    // con fotos a color natural y con el tinte amarillo de la Hazcam predice ruido.
    const gain = [1, 1, 1];
    if (input.white_balance) {
      const sum = [0, 0, 0];
      let cnt = 0;
      for (let i = 0; i < n; i++) {
        if ((rgba[4 * i] + rgba[4 * i + 1] + rgba[4 * i + 2]) / 3 > 40) {
          sum[0] += rgba[4 * i];
          sum[1] += rgba[4 * i + 1];
          sum[2] += rgba[4 * i + 2];
          cnt++;
        }
      }
      if (cnt) {
        const mu = sum.map((v) => v / cnt);
        const avg = (mu[0] + mu[1] + mu[2]) / 3;
        for (let c = 0; c < 3; c++) gain[c] = avg / Math.max(mu[c], 1);
      }
    }
    const px = new Float32Array(3 * n); // canales 0–255 ya con balance de blancos
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) px[c * n + i] = input.white_balance ? Math.floor(Math.min(255, rgba[4 * i + c] * gain[c])) : rgba[4 * i + c];
    }
    if (input.standardize) {
      // Estandariza la exposición: estira la luminancia (p1–p99) con el MISMO factor en los 3 canales (conserva el
      // color). Hace que cambios de luz, cámara o exposición afecten menos a la predicción (S5Mars: estabilidad 0.63 → 0.86).
      const L = new Float32Array(n);
      for (let i = 0; i < n; i++) L[i] = (0.299 * px[i] + 0.587 * px[n + i] + 0.114 * px[2 * n + i]) / 255;
      const sorted = Float32Array.from(L).sort();
      const lo = percentile(sorted, 1);
      const span = Math.max(percentile(sorted, 99) - lo, 1e-3);
      for (let k = 0; k < 3 * n; k++) px[k] = Math.floor(Math.min(1, Math.max(0, (px[k] / 255 - lo) / span)) * 255);
    }
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) out[c * n + i] = (px[c * n + i] / 255 - mean[c]) / std[c];
    }
  }
  return out;
}

/** Probabilidades C×h×w → C×S×S (vecino más cercano). La interfaz trabaja con máscaras cuadradas S×S y las estira sobre el video. */
export function resampleProbs(probs, C, h, w, S) {
  if (h === S && w === S) return probs;
  const out = new Float32Array(C * S * S);
  for (let y = 0; y < S; y++) {
    const sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / S));
    for (let x = 0; x < S; x++) {
      const sx = Math.min(w - 1, Math.floor(((x + 0.5) * w) / S));
      for (let c = 0; c < C; c++) out[c * S * S + y * S + x] = probs[c * h * w + sy * w + sx];
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

/** Logits → etiqueta y confianza (probabilidad softmax de la clase ganadora, 0–255) por píxel. */
export function argmaxConf(logits, nClasses, size) {
  const n = size * size;
  const labels = new Uint8Array(n);
  const conf = new Uint8Array(n);
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
    let z = 0;
    for (let c = 0; c < nClasses; c++) z += Math.exp(logits[c * n + i] - bv);
    labels[i] = best;
    conf[i] = Math.round(255 / z);
  }
  return { labels, conf };
}

/**
 * Máscara RGBA con umbral de confianza: transparente donde la IA no está segura (conf < thr255) o la clase no es
 * terreno (`ignore`); relleno suave y contorno marcado entre regiones.
 */
export function colorizeConf(labels, conf, colors, thr255, ignore, size) {
  const out = new Uint8ClampedArray(labels.length * 4);
  const shown = (i) => conf[i] >= thr255 && !ignore.has(labels[i]);
  for (let i = 0; i < labels.length; i++) {
    if (!shown(i)) continue;
    const x = i % size;
    const r = i + 1;
    const d = i + size;
    const edge = (x < size - 1 && (!shown(r) || labels[r] !== labels[i])) || (d < labels.length && (!shown(d) || labels[d] !== labels[i]));
    const c = colors[labels[i]];
    out[4 * i] = c[0];
    out[4 * i + 1] = c[1];
    out[4 * i + 2] = c[2];
    out[4 * i + 3] = edge ? 255 : 120;
  }
  return out;
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

// ---- Navegador: metadatos y un GRUPO de Web Workers que corren el modelo en paralelo (ver visionWorker.js) ----
// Un worker de WASM usa un solo hilo (~420 ms por cuadro de AI4Mars a 384 px). Para video, varios workers procesan
// cuadros alternos en paralelo: el rendimiento (cuadros/s) crece casi lineal con el número de workers.
const metas = new Map();

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

/** Calidad → lado de la imagen que ve la IA (múltiplo de 16; el modelo acepta cualquier tamaño así). */
export const QUALITIES = ['fast', 'normal', 'high'];
export function sizeFor(meta, quality) {
  if (meta.fixed_input) return meta.size; // entrada fija: la calidad no cambia el tamaño
  const f = { fast: 0.5, normal: 0.75, high: 1 }[quality] ?? 1;
  return Math.max(96, Math.round((meta.size * f) / 16) * 16);
}

/** Workers recomendados: uno por cada 4 hilos lógicos (máx. 4; la memoria es una copia del modelo por worker). */
export function defaultWorkers() {
  return Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 4)));
}

/** Probabilidades suavizadas en el tiempo (media móvil exponencial): quita el parpadeo de la máscara en video. */
export class Smoother {
  constructor(alpha = 0.6) {
    this.alpha = alpha;
    this.prev = null;
  }

  /** `probs` nuevas (C×S×S) → devuelve las suavizadas (misma forma). Si cambia la forma, reinicia. */
  push(probs) {
    if (!this.prev || this.prev.length !== probs.length || this.alpha >= 1) {
      this.prev = probs;
      return probs;
    }
    const a = this.alpha;
    const p = this.prev;
    for (let i = 0; i < probs.length; i++) p[i] = a * probs[i] + (1 - a) * p[i];
    return p;
  }

  reset() {
    this.prev = null;
  }
}

/** Probabilidades C×S×S → etiqueta por píxel y confianza 0–255 (probabilidad de la clase ganadora). */
export function labelsFromProbs(probs, nClasses, size) {
  const n = size * size;
  const labels = new Uint8Array(n);
  const conf = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bv = probs[i];
    for (let c = 1; c < nClasses; c++) {
      const v = probs[c * n + i];
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    labels[i] = best;
    conf[i] = Math.min(255, Math.round(bv * 255));
  }
  return { labels, conf };
}

/**
 * Grupo de workers para un modelo. `run(source, size)` toma el cuadro AHORA (síncrono) y lo manda a un worker libre;
 * devuelve una promesa con las probabilidades, o `null` si todos están ocupados (el llamador salta ese cuadro).
 */
export function createVisionPool(modelId, n = defaultWorkers()) {
  const workers = [];
  const pending = new Map();
  let seq = 0;
  let closed = false;
  let grab = null;
  let urlP = null;
  let metaObj = null;

  const onMessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    if (data.ok) p.resolve(data);
    else p.reject(new Error(data.error));
  };
  for (let k = 0; k < n; k++) {
    const w = new Worker(new URL('./visionWorker.js', import.meta.url), { type: 'module' });
    w.onmessage = onMessage;
    workers.push({ w, busy: false, ready: false });
  }
  const ask = (slot, msg, transfer = []) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      slot.w.postMessage({ id, ...msg }, transfer);
    });

  const ready = (async () => {
    const meta = await loadMeta(modelId);
    metaObj = meta;
    urlP = `${BASE}/${meta.file}`;
    await Promise.all(workers.map((slot) => ask(slot, { init: true, url: urlP }).then(() => (slot.ready = true))));
    return meta;
  })();

  return {
    workers: n,
    ready,
    run(source, size, override) {
      if (closed) return null;
      const slot = workers.find((x) => x.ready && !x.busy);
      if (!slot) return null;
      const fw = metaObj?.input?.width || size; // entrada fija (ancho×alto) o cuadrada S×S
      const fh = metaObj?.input?.height || size;
      grab ??= document.createElement('canvas');
      if (grab.width !== fw || grab.height !== fh) {
        grab.width = fw;
        grab.height = fh;
      }
      const ctx = grab.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(source, 0, 0, fw, fh); // mismo redimensionado que el entrenamiento
      const rgba = ctx.getImageData(0, 0, fw, fh).data.buffer;
      const t0 = performance.now();
      slot.busy = true;
      const seqNo = ++seq;
      return metas
        .get(modelId)
        .then((meta) =>
          ask(slot, { url: urlP, rgba, size, w: fw, h: fh, input: { ...meta.input, ...override }, nClasses: meta.classes.length }, [rgba]),
        )
        .then((r) => ({ probs: r.probs, size, nClasses: r.nClasses, ms: r.ms, latency: performance.now() - t0, seq: seqNo, meta: null }))
        .finally(() => {
          slot.busy = false;
        });
    },
    close() {
      closed = true;
      for (const { w } of workers) w.terminate();
      pending.clear();
    },
  };
}

/**
 * Regiones conexas grandes para rotular (estilo detector): baja las etiquetas a una rejilla `grid`×`grid`,
 * une celdas vecinas de la misma clase y devuelve hasta `max` regiones con su centro (0–1) y tamaño (fracción).
 */
export function labelRegions(labels, size, meta, grid = 48, minShare = 0.025, max = 6, conf = null) {
  const g = new Uint8Array(grid * grid);
  const gc = new Uint8Array(grid * grid); // confianza 0–255 de cada celda
  for (let y = 0; y < grid; y++) {
    const sy = Math.min(size - 1, Math.floor(((y + 0.5) * size) / grid));
    for (let x = 0; x < grid; x++) {
      const si = sy * size + Math.min(size - 1, Math.floor(((x + 0.5) * size) / grid));
      g[y * grid + x] = labels[si];
      gc[y * grid + x] = conf ? conf[si] : 255;
    }
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
    let sc = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % grid;
      const y = (j - x) / grid;
      n++;
      sx += x;
      sy += y;
      sc += gc[j];
      if (x > 0 && !seen[j - 1] && g[j - 1] === c) (seen[j - 1] = 1), stack.push(j - 1);
      if (x < grid - 1 && !seen[j + 1] && g[j + 1] === c) (seen[j + 1] = 1), stack.push(j + 1);
      if (y > 0 && !seen[j - grid] && g[j - grid] === c) (seen[j - grid] = 1), stack.push(j - grid);
      if (y < grid - 1 && !seen[j + grid] && g[j + grid] === c) (seen[j + grid] = 1), stack.push(j + grid);
    }
    const share = n / g.length;
    if (share >= minShare) out.push({ id: meta.classes[c], cls: c, x: (sx / n + 0.5) / grid, y: (sy / n + 0.5) / grid, share, conf: sc / n / 255 });
  }
  return out.sort((a, b) => b.share - a.share).slice(0, max);
}

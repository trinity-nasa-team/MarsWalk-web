// Worker de visión: preprocesa, corre el modelo ONNX (onnxruntime-web, WASM, un hilo) y devuelve las
// probabilidades por clase (softmax) de cada píxel. La interfaz crea varios workers en paralelo (ver vision.js).
import * as ortNs from 'onnxruntime-web/wasm';
import { preprocess, resampleProbs } from './vision.js';

const ort = ortNs.default ?? ortNs;
ort.env.wasm.numThreads = 1; // 1 hilo por worker; el paralelismo viene de tener varios workers
const sessions = new Map();

function session(url) {
  if (!sessions.has(url)) {
    const p = ort.InferenceSession.create(url, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    p.catch(() => sessions.delete(url)); // un fallo de red no deja el modelo roto
    sessions.set(url, p);
  }
  return sessions.get(url);
}

/** Softmax por píxel sobre logits C×S×S (in situ → Float32Array). */
function softmax(logits, C, n) {
  const out = new Float32Array(C * n);
  for (let i = 0; i < n; i++) {
    let m = logits[i];
    for (let c = 1; c < C; c++) if (logits[c * n + i] > m) m = logits[c * n + i];
    let z = 0;
    for (let c = 0; c < C; c++) {
      const e = Math.exp(logits[c * n + i] - m);
      out[c * n + i] = e;
      z += e;
    }
    for (let c = 0; c < C; c++) out[c * n + i] /= z;
  }
  return out;
}

self.onmessage = async ({ data }) => {
  const { id, url, rgba, size, input, nClasses, init, w = size, h = size } = data; // w×h = entrada del modelo; size = lado de la máscara que devuelve
  try {
    const sess = await session(url);
    if (init) return self.postMessage({ id, ok: true });
    const t0 = performance.now();
    const x = new ort.Tensor('float32', preprocess(new Uint8ClampedArray(rgba), size, { ...input, width: w, height: h }), [1, 3, h, w]);
    const out = await sess.run({ [sess.inputNames[0]]: x });
    const probs = resampleProbs(softmax(out[sess.outputNames[0]].data, nClasses, w * h), nClasses, h, w, size);
    self.postMessage({ id, ok: true, probs, nClasses, ms: Math.round(performance.now() - t0) }, [probs.buffer]);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message || e) });
  }
};

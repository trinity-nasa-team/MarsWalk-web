// Worker de visión: preprocesa, corre el modelo ONNX (onnxruntime-web, WASM) y hace argmax fuera del hilo de la
// interfaz, para que el video siga fluido mientras se segmenta cada cuadro.
import * as ortNs from 'onnxruntime-web/wasm';
import { argmax, preprocess } from './vision.js';

const ort = ortNs.default ?? ortNs;
ort.env.wasm.numThreads = 1; // sin COOP/COEP no hay hilos de WASM
const sessions = new Map();

function session(url) {
  if (!sessions.has(url)) {
    const p = ort.InferenceSession.create(url, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    p.catch(() => sessions.delete(url)); // un fallo de red no deja el modelo roto
    sessions.set(url, p);
  }
  return sessions.get(url);
}

self.onmessage = async ({ data }) => {
  const { id, url, rgba, size, input, nClasses, warm } = data;
  try {
    const sess = await session(url);
    if (warm) return self.postMessage({ id, ok: true });
    const t0 = performance.now();
    const x = new ort.Tensor('float32', preprocess(new Uint8ClampedArray(rgba), size, input), [1, 3, size, size]);
    const out = await sess.run({ [sess.inputNames[0]]: x });
    const labels = argmax(out[sess.outputNames[0]].data, nClasses, size);
    self.postMessage({ id, ok: true, labels, ms: Math.round(performance.now() - t0) }, [labels.buffer]);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message || e) });
  }
};

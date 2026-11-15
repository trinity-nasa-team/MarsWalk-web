// Web Worker de tiles (017): pide, reproyecta y combina los mosaicos de NASA/USGS fuera del hilo de la
// interfaz y devuelve la imagen ya codificada (ArrayBuffer transferible).
import { renderTile } from './marsTilesCore.js';

const running = new Map(); // id → AbortController

self.onmessage = async ({ data }) => {
  if (data.cancel) {
    running.get(data.cancel)?.abort();
    running.delete(data.cancel);
    return;
  }
  const { id, layer, z, x, y } = data;
  const ac = new AbortController();
  running.set(id, ac);
  try {
    const canvas = await renderTile(layer, z, x, y, ac.signal);
    if (ac.signal.aborted) return;
    if (!canvas) return self.postMessage({ id, buffer: null });
    const type = layer === 'color' || layer === 'mola' ? 'image/jpeg' : 'image/png';
    const buffer = await (await canvas.convertToBlob({ type, quality: 0.85 })).arrayBuffer();
    self.postMessage({ id, buffer }, [buffer]);
  } catch {
    self.postMessage({ id, buffer: null });
  } finally {
    running.delete(id);
  }
};

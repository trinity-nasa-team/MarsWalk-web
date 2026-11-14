// Web Worker de tiles (017): pide, reproyecta y combina los mosaicos de NASA/USGS fuera del hilo de la
// interfaz y devuelve la imagen ya codificada (ArrayBuffer transferible).
import { renderTile } from './marsTilesCore.js';

self.onmessage = async ({ data }) => {
  const { id, layer, z, x, y } = data;
  try {
    const canvas = await renderTile(layer, z, x, y);
    if (!canvas) return self.postMessage({ id, buffer: null });
    const type = layer === 'color' || layer === 'mola' ? 'image/jpeg' : 'image/png';
    const buffer = await (await canvas.convertToBlob({ type, quality: 0.85 })).arrayBuffer();
    self.postMessage({ id, buffer }, [buffer]);
  } catch {
    self.postMessage({ id, buffer: null });
  }
};

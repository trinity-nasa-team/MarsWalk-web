// Segmentación semántica en tiempo real de una fuente de video (canvas, <video>…): en cuanto termina un cuadro,
// toma el siguiente. Corre en el Web Worker de visión (no bloquea la interfaz). model = null la apaga.
import { useEffect, useState } from 'react';
import { segment, warmUp } from './vision.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** getSource(): canvas, <video> o <img>. Con <img>, segmenta una vez por foto. */
export function useSegmentation(getSource, model) {
  const [res, setRes] = useState(null);
  const [fps, setFps] = useState(null);
  const [status, setStatus] = useState('off'); // off | loading | live | error

  useEffect(() => {
    setRes(null);
    setFps(null);
    if (!model) {
      setStatus('off');
      return undefined;
    }
    let alive = true;
    let last = 0;
    setStatus('loading');
    (async () => {
      try {
        await warmUp(model); // primera vez: descarga 23–53 MB
      } catch {
        if (alive) setStatus('error');
        return;
      }
      let lastStill = null;
      while (alive) {
        const src = getSource();
        const isImg = src?.tagName === 'IMG';
        if (!src || document.hidden || (isImg ? !(src.complete && src.naturalWidth) : !(src.width || src.videoWidth))) {
          await sleep(200);
          continue;
        }
        // Foto fija: se segmenta una vez por foto (no cada vuelta).
        if (isImg && src.currentSrc === lastStill) {
          await sleep(250);
          continue;
        }
        lastStill = isImg ? src.currentSrc : null;
        try {
          const r = await segment(model, src);
          if (!alive) break;
          const now = performance.now();
          if (last) setFps(1000 / (now - last));
          last = now;
          setRes(r);
          setStatus('live');
        } catch (e) {
          if (!alive) break;
          console.warn('[vision]', e);
          setStatus('error');
          await sleep(1500);
        }
        await sleep(0);
      }
    })();
    return () => {
      alive = false;
    };
    // getSource se lee en cada vuelta: no reinicia el bucle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  return { res, fps, status };
}

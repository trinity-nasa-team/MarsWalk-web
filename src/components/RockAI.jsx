// Capa de IA de rocas sobre la cámara real del robot (RobotCamera). No toca su lógica: lee su canvas y pinta encima.
//  - 'service': servicio local (Grounding DINO + SAM en la GPU del equipo; MarsWalk-v3/scripts/rock_service.py). Preciso, lento.
//  - 'browser': RockSeg v2 (U-Net, onnxruntime-web). Rápido, menos preciso (experimental).
// El overlay usa las mismas dimensiones que el canvas de la cámara, así que queda alineado aunque se rote.
import { useEffect, useRef, useState } from 'react';
import { analyzeRocks, rocksHealth } from '../lib/rocks.js';
import { colorizeConf, createVisionPool, labelsFromProbs, Smoother, sizeFor } from '../lib/vision.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function RockAI({ mode, sourceRef, t }) {
  const ovRef = useRef(null);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const tRef = useRef(t); // t estable para el efecto (si cambia su identidad no se reinicia el bucle)
  tRef.current = t;

  useEffect(() => {
    setInfo(null);
    setErr('');
    const clear = () => {
      const ov = ovRef.current;
      if (ov) ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
    };
    clear();
    if (mode === 'off') return undefined;
    let alive = true;
    let pool = null;
    const ctrl = new AbortController();
    const ctxFor = (src) => {
      const ov = ovRef.current;
      if (!ov) return null;
      if (ov.width !== src.width || ov.height !== src.height) {
        ov.width = src.width;
        ov.height = src.height;
      }
      const ctx = ov.getContext('2d');
      ctx.clearRect(0, 0, ov.width, ov.height);
      return ctx;
    };
    const idle = () => {
      const src = sourceRef.current;
      return !src || !src.width || document.hidden;
    };

    const runService = async () => {
      while (alive) {
        if (idle()) {
          await sleep(200);
          continue;
        }
        try {
          await rocksHealth(ctrl.signal);
          const src = sourceRef.current;
          const r = await analyzeRocks(src, 'fast', ctrl.signal);
          if (!alive) return;
          ctxFor(src)?.drawImage(r.bitmap, 0, 0, src.width, src.height);
          r.bitmap.close?.();
          setErr('');
          setInfo({ text: tRef.current('rocks.hud', { n: r.n, s: (r.ms / 1000).toFixed(1) }) });
        } catch (e) {
          if (!alive) return;
          setErr(tRef.current('rocks.down'));
          await sleep(5000);
        }
      }
    };

    const runBrowser = async () => {
      pool = createVisionPool('rockseg');
      const meta = await pool.ready;
      const size = sizeFor(meta, 'fast');
      const hide = new Set((meta.hide || []).map((c) => meta.classes.indexOf(c)));
      const thr255 = Math.round((meta.default_thr || 0.85) * 255);
      const smoother = new Smoother(0.6);
      const tmp = document.createElement('canvas');
      tmp.width = size;
      tmp.height = size;
      let applied = -1;
      const stamps = [];
      const onResult = (r) => {
        const src = sourceRef.current;
        if (!alive || !src || r.seq < applied) return;
        applied = r.seq;
        const { labels, conf } = labelsFromProbs(smoother.push(r.probs), r.nClasses, r.size);
        tmp.getContext('2d').putImageData(new ImageData(colorizeConf(labels, conf, meta.colors, thr255, hide, r.size), r.size, r.size), 0, 0);
        ctxFor(src)?.drawImage(tmp, 0, 0, src.width, src.height);
        const now = performance.now();
        stamps.push(now);
        while (stamps[0] < now - 2000) stamps.shift();
        const fps = stamps.length > 2 ? ((stamps.length - 1) * 1000) / (now - stamps[0]) : 0;
        setInfo({ text: tRef.current('rocks.hud.browser', { fps: fps.toFixed(1) }) });
      };
      while (alive) {
        if (idle()) {
          await sleep(100);
          continue;
        }
        const p = pool.run(sourceRef.current, size);
        if (!p) {
          await sleep(2);
          continue;
        }
        p.then(onResult).catch(() => {});
        await sleep(0);
      }
    };

    (mode === 'browser' ? runBrowser() : runService()).catch((e) => alive && setErr(String(e.message || e)));
    return () => {
      alive = false;
      ctrl.abort();
      pool?.close();
      clear();
    };
  }, [mode, sourceRef]);

  return (
    <>
      <canvas ref={ovRef} className="robot-cam-media robot-cam-rocks" aria-hidden="true" />
      {mode !== 'off' && (info || err) && (
        <span className={`robot-cam-rocks-tag ${err ? 'err' : ''}`} role="status">
          {err || info.text}
        </span>
      )}
    </>
  );
}

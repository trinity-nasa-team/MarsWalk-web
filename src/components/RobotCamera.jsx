// Cámara REAL del prototipo del robot (Raspberry Pi + µStreamer) publicada con un túnel HTTPS.
// Lee el MJPEG con fetch, lo pasa por un búfer de suavizado (el túnel entrega a ráfagas) y lo dibuja en un canvas
// a ritmo constante. Si el navegador no puede leer el stream (sin CORS o sin ReadableStream) usa un <img> directo.
// Sin URL configurada no se renderiza nada.
import { useEffect, useRef, useState } from 'react';
import {
  createJitterBuffer,
  createMjpegParser,
  loadRotation,
  nextRotation,
  resolveCameraBase,
  saveRotation,
} from '../lib/camera.js';

const FPS = 15; // ritmo real de la cámara (320×240 a 15 FPS en la Raspberry)
const DELAY_MS = 600; // retraso a cambio de fluidez: absorbe las ráfagas del túnel
const NO_FRAME_MS = 5000; // sin cuadros en este tiempo → "sin señal" y reconexión
const RETRY_MS = 4000;

export default function RobotCamera({ t, variant = 'pip' }) {
  const base = useRef(resolveCameraBase()).current;
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('connecting'); // connecting | live | nosignal
  const [mode, setMode] = useState('canvas'); // canvas | img
  const [rotation, setRotation] = useState(() => loadRotation());
  const [expanded, setExpanded] = useState(false);
  const [info, setInfo] = useState(null); // { w, h, fps }
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;

  useEffect(() => {
    if (!base || mode !== 'canvas') return undefined;
    let alive = true;
    let ctrl = null;
    let retryTimer = null;
    let lastFrameAt = 0;
    let shownInWindow = 0;
    const jitter = createJitterBuffer({ fps: FPS, delayMs: DELAY_MS });

    const draw = async (frame) => {
      const cv = canvasRef.current;
      if (!cv) return;
      let bmp;
      try {
        bmp = await createImageBitmap(new Blob([frame.jpeg], { type: 'image/jpeg' }));
      } catch {
        return; // cuadro dañado: se salta
      }
      const rot = rotationRef.current;
      const side = rot === 90 || rot === 270;
      const w = side ? bmp.height : bmp.width;
      const h = side ? bmp.width : bmp.height;
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      const ctx = cv.getContext('2d');
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
      ctx.restore();
      setInfo((p) => (p && p.w === bmp.width && p.h === bmp.height ? p : { w: bmp.width, h: bmp.height, fps: p?.fps ?? null }));
      bmp.close?.();
      shownInWindow++;
    };

    const tick = setInterval(() => {
      const f = jitter.next();
      if (f) draw(f);
      if (lastFrameAt && performance.now() - lastFrameAt > NO_FRAME_MS) {
        lastFrameAt = 0;
        setStatus('nosignal');
        ctrl?.abort();
      }
    }, jitter.intervalMs);
    const fpsTimer = setInterval(() => {
      const fps = shownInWindow / 2;
      shownInWindow = 0;
      setInfo((p) => (p ? { ...p, fps } : p));
    }, 2000);

    const connect = async () => {
      if (!alive) return;
      ctrl = new AbortController();
      const parser = createMjpegParser();
      try {
        const res = await fetch(`${base}/stream`, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok || !res.body?.getReader) throw new Error(`stream_${res.status}`);
        const reader = res.body.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done || !alive) break;
          for (const fr of parser.push(value)) {
            jitter.push(fr);
            lastFrameAt = performance.now();
            setStatus((s) => (s === 'live' ? s : 'live'));
          }
        }
      } catch (e) {
        // TypeError en el primer intento = el navegador no puede leer el stream (CORS): se usa <img>.
        if (alive && e?.name === 'TypeError' && !lastFrameAt) {
          setMode('img');
          return;
        }
      }
      if (!alive) return;
      setStatus('nosignal');
      retryTimer = setTimeout(connect, RETRY_MS);
    };
    connect();

    return () => {
      alive = false;
      ctrl?.abort();
      clearTimeout(retryTimer);
      clearInterval(tick);
      clearInterval(fpsTimer);
    };
  }, [base, mode]);

  if (!base) return null;

  const rotate = () => {
    const r = nextRotation(rotation);
    setRotation(r);
    saveRotation(r);
  };

  return (
    <figure className={`robot-cam ${variant} ${expanded ? 'expanded' : ''} ${status}`} aria-label={t('cam.title')}>
      <figcaption className="robot-cam-head">
        <span className="robot-cam-title">{t('cam.title')}</span>
        <span className="tag verified">{t('cam.real')}</span>
        {status === 'live' && (
          <span className="robot-cam-live">
            <span className="blink" /> {t('cam.live')}
          </span>
        )}
      </figcaption>

      <div className="robot-cam-view">
        {mode === 'canvas' ? (
          <canvas ref={canvasRef} className="robot-cam-media" />
        ) : (
          <img
            className="robot-cam-media"
            src={`${base}/stream`}
            alt={t('cam.title')}
            style={{ transform: `rotate(${rotation}deg)` }}
            onLoad={() => setStatus('live')}
            onError={() => setStatus('nosignal')}
          />
        )}
        {status !== 'live' && (
          <div className="robot-cam-overlay" role="status">
            <b>{status === 'connecting' ? t('cam.connecting') : t('cam.nosignal')}</b>
            {status === 'nosignal' && <span>{t('cam.nosignal.help')}</span>}
          </div>
        )}
      </div>

      <div className="robot-cam-foot">
        <span className="caption robot-cam-meta">
          {info ? `${info.w}×${info.h}` : '—'}
          {info?.fps != null && mode === 'canvas' ? ` · ${info.fps.toFixed(0)} FPS` : ''}
          {mode === 'canvas' ? ` · ${t('cam.smooth', { ms: DELAY_MS })}` : ''}
        </span>
        <span className="robot-cam-btns">
          <button type="button" className="btn" onClick={rotate} title={t('cam.rotate')}>
            ⟳ {t('cam.rotate')}
          </button>
          {variant === 'pip' && (
            <button type="button" className="btn" aria-pressed={expanded} onClick={() => setExpanded((x) => !x)}>
              {expanded ? t('cam.collapse') : t('cam.expand')}
            </button>
          )}
        </span>
      </div>
      <p className="robot-cam-note">{t('cam.note')}</p>
    </figure>
  );
}

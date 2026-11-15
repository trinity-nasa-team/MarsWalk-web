// Cámara REAL del prototipo del robot (Raspberry Pi + µStreamer) publicada con un túnel HTTPS.
// Lee el MJPEG con fetch, lo pasa por un búfer de suavizado guiado por el reloj de la cámara (el túnel entrega a
// ráfagas) y lo dibuja en un canvas. Solo si el navegador no puede leer streams (sin ReadableStream) usa un <img>.
// Se pausa con la pestaña oculta (cada espectador consume ~1.3 Mbit/s de la subida del robot).
// Sin URL configurada no se renderiza nada.
import { useEffect, useRef, useState } from 'react';
import { createJitterBuffer, createMjpegParser, loadRotation, nextRotation, resolveCamera, saveRotation } from '../lib/camera.js';
import { onRobotStatus, robotCommand } from '../lib/robot.js';

const FPS = 15; // ritmo nominal de la cámara (320×240 a 15 FPS en la Raspberry)
const DELAY_MS = 600; // retraso a cambio de fluidez: absorbe las ráfagas del túnel
const NO_FRAME_MS = 6000; // sin cuadros (ni al conectar) en este tiempo → "sin señal" y reconexión
const RETRY_MS = 4000;
const canStream = typeof ReadableStream !== 'undefined' && typeof createImageBitmap === 'function';

function useVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

export default function RobotCamera({ t, variant = 'pip' }) {
  const { base, fromQuery } = useRef(resolveCamera()).current;
  const canvasRef = useRef(null);
  const lastFrame = useRef(null);
  const visible = useVisible();
  const [status, setStatus] = useState('connecting'); // connecting | live | nosignal
  const [rotation, setRotation] = useState(() => loadRotation());
  const [expanded, setExpanded] = useState(false);
  const [info, setInfo] = useState(null); // { w, h, fps }
  const [imgKey, setImgKey] = useState(0); // modo <img>: cambiarla remonta el <img> para reintentar
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;
  const drawRef = useRef(null);
  const [robot, setRobot] = useState(null); // última orden al robot
  useEffect(() => onRobotStatus(setRobot), []);

  useEffect(() => {
    if (!base || !canStream || !visible) return undefined;
    let alive = true;
    let ctrl = null;
    let retryTimer = null;
    let lastActivity = performance.now();
    let shown = 0;
    let chain = Promise.resolve(); // serializa el dibujo: los cuadros salen en orden
    const jitter = createJitterBuffer({ fps: FPS, delayMs: DELAY_MS });

    const paint = async (frame) => {
      let bmp;
      try {
        bmp = await createImageBitmap(new Blob([frame.jpeg], { type: 'image/jpeg' }));
      } catch {
        return; // cuadro dañado: se salta
      }
      const cv = canvasRef.current;
      if (!alive || !cv) {
        bmp.close?.();
        return;
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
      const bw = bmp.width;
      const bh = bmp.height;
      bmp.close?.();
      setInfo((p) => (p && p.w === bw && p.h === bh ? p : { w: bw, h: bh, fps: p?.fps ?? null }));
    };
    const draw = (frame) => {
      lastFrame.current = frame;
      chain = chain.then(() => paint(frame));
    };
    drawRef.current = draw;

    const tick = setInterval(() => {
      const f = jitter.next(performance.now());
      if (f) {
        shown++;
        draw(f);
      }
      if (performance.now() - lastActivity > NO_FRAME_MS) {
        lastActivity = performance.now();
        setStatus('nosignal');
        ctrl?.abort(); // connect() programa el reintento
      }
    }, jitter.intervalMs);
    const fpsTimer = setInterval(() => {
      const fps = shown / 2;
      shown = 0;
      setInfo((p) => (p ? { ...p, fps } : p));
    }, 2000);

    const connect = async () => {
      if (!alive) return;
      ctrl = new AbortController();
      lastActivity = performance.now(); // el vigilante cubre también la conexión inicial
      jitter.reset();
      const parser = createMjpegParser();
      try {
        const res = await fetch(`${base}/stream`, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok || !res.body?.getReader) throw new Error(`stream_${res.status}`);
        const reader = res.body.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done || !alive) break;
          const frames = parser.push(value);
          if (frames.length) {
            lastActivity = performance.now();
            for (const fr of frames) jitter.push(fr);
            setStatus('live');
          }
        }
      } catch {
        /* red caída, túnel muerto o abortado por el vigilante: se reintenta abajo */
      }
      if (!alive) return;
      setStatus('nosignal');
      retryTimer = setTimeout(connect, RETRY_MS);
    };
    connect();

    return () => {
      alive = false;
      drawRef.current = null;
      ctrl?.abort();
      clearTimeout(retryTimer);
      clearInterval(tick);
      clearInterval(fpsTimer);
    };
  }, [base, visible]);

  if (!base) return null;

  const rotate = () => {
    const r = nextRotation(rotation);
    setRotation(r);
    saveRotation(r);
    rotationRef.current = r;
    if (lastFrame.current && drawRef.current) drawRef.current(lastFrame.current); // se ve el giro aunque no lleguen cuadros
  };
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return base;
    }
  })();

  return (
    <figure className={`robot-cam ${variant} ${expanded ? 'expanded' : ''} ${status}`} aria-label={t('cam.title')}>
      <figcaption className="robot-cam-head">
        <span className="robot-cam-title">{t('cam.title')}</span>
        <span className="tag robot-cam-earth">{t('cam.earth')}</span>
        {!fromQuery && <span className="tag verified">{t('cam.real')}</span>}
        {status === 'live' && (
          <span className="robot-cam-live">
            <span className="blink" /> {t('cam.live')}
          </span>
        )}
      </figcaption>

      <div className="robot-cam-view">
        {canStream ? (
          <canvas ref={canvasRef} className="robot-cam-media" />
        ) : (
          <img
            key={imgKey}
            className="robot-cam-media"
            src={`${base}/stream?r=${imgKey}`}
            alt={t('cam.title')}
            style={{ transform: `rotate(${rotation}deg)` }}
            onLoad={() => setStatus('live')}
            onError={() => {
              setStatus('nosignal');
              setTimeout(() => setImgKey((k) => k + 1), RETRY_MS);
            }}
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
          {info?.fps != null && canStream ? ` · ${info.fps.toFixed(0)} FPS` : ''}
          {canStream ? ` · ${t('cam.smooth', { ms: DELAY_MS })}` : ''}
          {fromQuery ? ` · ${host}` : ''}
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
      <div className="robot-ctl" role="group" aria-label={t('robot.title')}>
        <span className="caption">{t('robot.title')}</span>
        <div className="robot-ctl-pad">
          {[
            ['left', '◀'],
            ['forward', '▲'],
            ['stop', '■'],
            ['backward', '▼'],
            ['right', '▶'],
          ].map(([cmd, glyph]) => (
            <button
              key={cmd}
              type="button"
              className={`btn robot-ctl-${cmd} ${robot?.cmd === cmd && robot.state === 'sending' ? 'busy' : ''}`}
              title={t(`robot.say.${cmd}`)}
              aria-label={t(`robot.say.${cmd}`)}
              onClick={() => robotCommand(cmd, { base })}
            >
              {glyph}
            </button>
          ))}
        </div>
        <span className={`caption robot-ctl-status ${robot?.state || ''}`} role="status" aria-live="polite">
          {robot?.state === 'error'
            ? `✗ ${robot.error === 'too_fast' ? t('robot.fast') : t('robot.fail')}`
            : robot?.cmd
              ? `${robot.state === 'done' ? '✓' : '…'} ${t(`robot.say.${robot.cmd}`)}`
              : t('robot.hint')}
        </span>
      </div>
      <p className="robot-cam-note">{t('cam.note')}</p>
    </figure>
  );
}

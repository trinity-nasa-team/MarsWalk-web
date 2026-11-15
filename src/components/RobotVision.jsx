// Visión del robot en video: segmenta el terreno cuadro por cuadro con el modelo elegido (AI4Mars ↔ S5Mars),
// en el navegador (Web Worker + onnxruntime-web). Fuentes: recorrido armado con fotos reales de la Hazcam de
// Perseverance, un video/foto propio o la cámara del equipo. Nada sale del equipo.
// Si la IA ve arena o rocas por encima del umbral, el hábitat puede reportarlo al robot (ROBOT_DETECT).
import { useEffect, useRef, useState } from 'react';
import { colorize, loadMeta, segment, VISION_MODELS, warmUp } from '../lib/vision.js';

const TOUR = '/img/vision/jezero_hazcam_recorrido.mp4';
const pct = (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)} %`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ready(el) {
  if (!el) return false;
  if (el.tagName === 'VIDEO') return el.readyState >= 2 && el.videoWidth > 0;
  return el.complete && el.naturalWidth > 0;
}

export default function RobotVision({ t, lang, canReport = false, onReport }) {
  const [model, setModel] = useState('ai4mars');
  const [source, setSource] = useState('tour'); // tour | camera | file
  const [file, setFile] = useState(null); // { url, isVideo, name }
  const [meta, setMeta] = useState(null);
  const [res, setRes] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | live | still | error | camError
  const [fps, setFps] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [opacity, setOpacity] = useState(0.55);
  const mediaRef = useRef(null);
  const maskRef = useRef(null);
  const streamRef = useRef(null);

  // Metadatos + precarga del modelo elegido (la primera vez se descargan 23–53 MB).
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    loadMeta(model).then((m) => alive && setMeta(m)).catch(() => alive && setMeta(null));
    warmUp(model).catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [model]);

  // Cámara del equipo: se pide permiso solo al elegir esa fuente y se libera al salir.
  useEffect(() => {
    if (source !== 'camera') return undefined;
    let alive = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((tr) => tr.stop());
        streamRef.current = s;
        if (mediaRef.current) mediaRef.current.srcObject = s;
      })
      .catch(() => alive && setStatus('camError'));
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, [source]);
  useEffect(() => () => file && URL.revokeObjectURL(file.url), [file]);

  const isStill = source === 'file' && file && !file.isVideo;

  // Bucle de segmentación: en cuanto termina un cuadro, toma el siguiente (≈ 2–6 cuadros/s según el modelo).
  useEffect(() => {
    let alive = true;
    let last = 0;
    (async () => {
      while (alive) {
        const el = mediaRef.current;
        if (!ready(el) || document.hidden || (!playing && !isStill)) {
          await sleep(150);
          continue;
        }
        try {
          const r = await segment(model, el);
          if (!alive) break;
          const now = performance.now();
          if (last) setFps(1000 / (now - last));
          last = now;
          setRes(r);
          setStatus(isStill ? 'still' : 'live');
        } catch (e) {
          if (!alive) break;
          console.warn('[vision]', e);
          setStatus('error');
          await sleep(1500);
        }
        if (isStill) break; // una foto: un solo cuadro
        await sleep(0);
      }
    })();
    return () => {
      alive = false;
    };
  }, [model, source, file, playing, isStill]);

  useEffect(() => {
    const v = mediaRef.current;
    if (v?.tagName === 'VIDEO' && source !== 'camera') (playing ? v.play() : v.pause())?.catch?.(() => {});
  }, [playing, source, file]);

  // Máscara coloreada (S×S) estirada con CSS sobre el video.
  useEffect(() => {
    const cv = maskRef.current;
    if (!cv || !res) return;
    cv.width = res.size;
    cv.height = res.size;
    cv.getContext('2d').putImageData(new ImageData(colorize(res.labels, res.meta.colors), res.size, res.size), 0, 0);
  }, [res]);

  const choose = (s) => {
    setRes(null);
    setFps(null);
    setSource(s);
    setPlaying(true);
  };
  const names = meta ? (lang === 'en' ? meta.classes_en : meta.classes.map((c) => t(`vis.class.${c}`))) : [];
  const shown = res && meta && res.meta.id === meta.id ? res : null;
  const hazardNames = shown ? shown.hazards.map((h) => names[shown.meta.classes.indexOf(h.id)]).join(', ') : '';

  let media = null;
  if (source === 'tour') media = <video ref={mediaRef} src={TOUR} muted loop playsInline autoPlay crossOrigin="anonymous" />;
  else if (source === 'camera') media = <video ref={mediaRef} muted playsInline autoPlay />;
  else if (file?.isVideo) media = <video ref={mediaRef} src={file.url} muted loop playsInline autoPlay />;
  else if (file) media = <img ref={mediaRef} src={file.url} alt={file.name} />;

  return (
    <div className="vision">
      <div className="vision-bar">
        <div className="chips" role="radiogroup" aria-label={t('vis.model')}>
          {VISION_MODELS.map((m) => (
            <button key={m} type="button" className="chip" role="radio" aria-checked={model === m} aria-pressed={model === m} onClick={() => setModel(m)}>
              {m === 'ai4mars' ? 'AI4Mars' : 'S5Mars'}
            </button>
          ))}
        </div>
        <div className="chips" role="radiogroup" aria-label={t('vis.source')}>
          <button type="button" className="chip" role="radio" aria-checked={source === 'tour'} aria-pressed={source === 'tour'} onClick={() => choose('tour')}>
            {t('vis.src.tour')}
          </button>
          <button type="button" className="chip" role="radio" aria-checked={source === 'camera'} aria-pressed={source === 'camera'} onClick={() => choose('camera')}>
            {t('vis.src.camera')}
          </button>
          <label className="chip vision-upload" aria-checked={source === 'file'} aria-pressed={source === 'file'} role="radio">
            {t('vis.src.file')}
            <input
              type="file"
              accept="video/*,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile({ url: URL.createObjectURL(f), isVideo: f.type.startsWith('video/'), name: f.name });
                  choose('file');
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div className="vision-view">
        {media || <div className="empty-mini">{t('vis.pickFile')}</div>}
        <canvas ref={maskRef} className="vision-mask" style={{ opacity: shown ? opacity : 0 }} aria-hidden="true" />
        <div className="vision-caption caption">
          <span className="blink" />
          <span style={{ color: 'var(--white)' }}>{meta?.name || '—'}</span>
          {status === 'loading' && <span>{t('vis.loading')}</span>}
          {status === 'error' && <span className="warn">{t('vis.error')}</span>}
          {status === 'camError' && <span className="warn">{t('vis.camError')}</span>}
          {status === 'live' && shown && <span>{t('vis.fps', { fps: (fps ?? 0).toFixed(1), ms: shown.ms })}</span>}
          {status === 'still' && shown && <span>{t('vis.ms', { ms: shown.ms })}</span>}
        </div>
        {!isStill && media && (
          <button type="button" className="btn vision-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t('hab.pause') : t('hab.resume')}>
            {playing ? '❚❚' : '▶'}
          </button>
        )}
      </div>

      <div className="vision-side">
        <label className="vision-opacity caption">
          {t('vis.opacity')}
          <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
        </label>

        {shown && (
          <ul className="vision-legend">
            {shown.shares.map((s, i) => (
              <li key={s.id} className={shown.hazards.some((h) => h.id === s.id) ? 'hot' : ''}>
                <i style={{ background: `rgb(${shown.meta.colors[i].join(',')})` }} />
                <span>{names[i]}</span>
                <b>{s.share == null ? '—' : pct(s.share)}</b>
              </li>
            ))}
          </ul>
        )}

        {shown &&
          (shown.hazards.length ? (
            <div className="vision-hazard">
              <p>
                <b>{t('vis.hazard')}</b> {hazardNames}
              </p>
              {onReport && (
                <button type="button" className="btn" disabled={!canReport} onClick={onReport} title={canReport ? '' : t('vis.reportOff')}>
                  {t('vis.report')}
                </button>
              )}
            </div>
          ) : (
            <p className="note">{t('vis.clear')}</p>
          ))}

        {meta && (
          <details className="vision-meta">
            <summary>{t('vis.about', { name: meta.name })}</summary>
            <p>{meta.dataset}</p>
            <p>
              {meta.arch} · {meta.size}×{meta.size} px · {meta.input.kind === 'gray' ? t('vis.gray') : t('vis.rgb')} · mIoU {meta.metrics.test_miou} ({meta.metrics.split})
            </p>
            <ul>
              {meta.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
              <li>{t('vis.notJezero')}</li>
            </ul>
          </details>
        )}
        {source === 'tour' && <p className="note vision-credit">{t('vis.tourCredit')}</p>}
      </div>
    </div>
  );
}

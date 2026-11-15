// Cámara en vivo del robot con segmentación semántica en tiempo real (como un detector tipo YOLO, pero por píxel).
// Fuente: la cámara montada en el robot (USB, webcam o celular) o un video. Todo corre en este equipo: el video no
// sale de aquí. Un grupo de Web Workers (onnxruntime-web, WASM) procesa cuadros alternos en paralelo; el video
// se ve a su velocidad nativa y la máscara se actualiza encima con suavizado temporal.
import { useEffect, useRef, useState } from 'react';
import { haversine } from '../lib/geo.js';
import { canDetect } from '../lib/sim.js';
import { advanceFeed, drawFeed, FEED_H, FEED_W, loadPhotos } from '../lib/traverseFeed.js';
import { derive } from '../state/derived.js';
import {
  classShares,
  colorizeConf,
  createVisionPool,
  hazardsFound,
  labelRegions,
  labelsFromProbs,
  loadMeta,
  QUALITIES,
  sizeFor,
  Smoother,
  VISION_MODELS,
} from '../lib/vision.js';
import { useStore } from '../state/store.jsx';
import ModelCard from './ModelCard.jsx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HAZARD_WINDOW = 6; // un peligro se confirma si aparece en ≥ 4 de los últimos 6 cuadros
const HAZARD_NEED = 4;

/** mode: 'camera' = cámara del robot (o video); 'traverse' = recorrido por Marte (fotos reales de Perseverance). */
export default function LiveCamera({ mode = 'camera' }) {
  const { t, lang, state, dispatch } = useStore();
  const videoRef = useRef(null);
  const maskRef = useRef(null);
  const stageRef = useRef(null);
  const mainRef = useRef(null);
  const [fit, setFit] = useState(null); // tamaño del video que cabe en el espacio disponible, sin deformarlo
  const streamRef = useRef(null);
  const [source, setSource] = useState('camera'); // camera | file
  const [fileUrl, setFileUrl] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [status, setStatus] = useState('idle'); // idle | starting | live | error
  const [err, setErr] = useState('');
  const [model, setModel] = useState('ai4mars');
  const [quality, setQuality] = useState('fast');
  const [thr, setThr] = useState(0.6);
  const [opacity, setOpacity] = useState(0.65);
  const [smooth, setSmooth] = useState(true);
  const [standardize, setStandardize] = useState(true);
  const [paused, setPaused] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);
  const [metas, setMetas] = useState({});
  const [view, setView] = useState(null);
  const live = useRef({});
  live.current = { thr, smooth, paused, opacity, standardize };

  // ── Recorrido por Marte: fotos reales de Perseverance ligadas a lo que camina el robot ──────────────────────
  const traverse = mode === 'traverse';
  const ratio = traverse ? FEED_W / FEED_H : aspect;
  const feedRef = useRef(null);
  const feed = useRef({ start: -1, odo: 0, last: null, idx: -1 });
  const [photos, setPhotos] = useState(null); // null = cargando
  const [frame, setFrame] = useState(null);
  const robotPos = traverse ? derive(state)?.robot?.pos : null;
  useEffect(() => {
    if (!traverse) return undefined;
    let alive = true;
    loadPhotos().then((p) => {
      if (!alive) return;
      setPhotos(p);
      if (p.length) setStatus('live');
    });
    return () => {
      alive = false;
    };
  }, [traverse]);
  useEffect(() => {
    if (traverse && photos?.length && robotPos) advanceFeed(feed.current, photos, robotPos);
  }, [traverse, photos, robotPos]);
  useEffect(() => {
    if (!traverse || !photos?.length) return undefined;
    let raf = 0;
    let lastDraw = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < 40 || document.hidden || !feedRef.current) return;
      lastDraw = now;
      const idx = drawFeed(feedRef.current, photos, feed.current);
      if (idx !== feed.current.idx) {
        feed.current.idx = idx;
        setFrame(photos[idx]);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [traverse, photos, status]);

  useEffect(() => {
    let alive = true;
    Promise.all(VISION_MODELS.map((m) => loadMeta(m).catch(() => null))).then((ms) => {
      if (alive) setMetas(Object.fromEntries(VISION_MODELS.map((m, i) => [m, ms[i]])));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Ajusta el video al espacio disponible conservando su proporción (con ventanas pequeñas o zoom alto, el CSS solo
  // lo deformaba o lo recortaba).
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return undefined;
    const calc = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw < 40 || ch < 40) return;
      const w = Math.min(cw, ch * ratio);
      setFit({ w: Math.floor(w), h: Math.floor(w / ratio) });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, status]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };
  useEffect(() => stopStream, []);
  useEffect(() => () => fileUrl && URL.revokeObjectURL(fileUrl), [fileUrl]);

  const listDevices = async () => {
    try {
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'));
    } catch {
      /* sin lista */
    }
  };

  const startCamera = async (id = '') => {
    stopStream();
    setView(null);
    setErr('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setErr(t('live.insecure'));
      return;
    }
    setStatus('starting');
    try {
      const size = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
      const s = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id }, ...size } : { facingMode: 'environment', ...size },
        audio: false,
      });
      streamRef.current = s;
      const v = videoRef.current;
      v.srcObject = s;
      await v.play();
      setSource('camera');
      setDeviceId(s.getVideoTracks()[0].getSettings().deviceId || id);
      await listDevices(); // con permiso concedido ya traen el nombre de cada cámara
      setStatus('live');
    } catch (e) {
      setStatus('error');
      setErr(e.name === 'NotAllowedError' ? t('live.denied') : e.name === 'NotFoundError' ? t('live.none') : String(e.message || e));
    }
  };

  const useFile = (f) => {
    stopStream();
    setView(null);
    const url = URL.createObjectURL(f);
    setFileUrl(url);
    setSource('file');
    setErr('');
    const v = videoRef.current;
    v.src = url;
    v.loop = true;
    v.play().catch(() => {});
    setStatus('live');
  };

  const stop = () => {
    stopStream();
    if (videoRef.current) {
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    setStatus('idle');
    setView(null);
  };

  // ── Bucle de segmentación ────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'live') return undefined;
    let alive = true;
    const pool = createVisionPool(model);
    const smoother = new Smoother(0.6);
    const hist = [];
    let applied = -1;
    const stamps = []; // cuándo llegó cada resultado (ventana de 2 s → cuadros/s reales, aunque lleguen en ráfagas)
    setView((v) => v && { ...v, loading: true });
    (async () => {
      let meta;
      try {
        meta = await pool.ready;
      } catch (e) {
        if (alive) {
          setErr(String(e.message || e));
          setStatus('error');
        }
        return;
      }
      const size = sizeFor(meta, quality);
      const ignore = new Set((meta.ignore_in_share || []).map((c) => meta.classes.indexOf(c)));
      const ig = ignore.values().next().value ?? 0;
      const onResult = (r) => {
        if (!alive || r.seq < applied) return; // un worker lento no pisa un resultado más nuevo
        applied = r.seq;
        smoother.alpha = live.current.smooth ? 0.6 : 1;
        const { labels, conf } = labelsFromProbs(smoother.push(r.probs), r.nClasses, r.size);
        const t255 = Math.round(live.current.thr * 255);
        const cv = maskRef.current;
        if (cv) {
          cv.width = r.size;
          cv.height = r.size;
          cv.getContext('2d').putImageData(new ImageData(colorizeConf(labels, conf, meta.colors, t255, ignore, r.size), r.size, r.size), 0, 0);
        }
        // Lo dudoso (conf < umbral) cuenta como «sin clasificar», no como una clase.
        const masked = new Uint8Array(labels.length);
        let terrain = 0;
        let unsure = 0;
        for (let i = 0; i < masked.length; i++) {
          const ok = conf[i] >= t255;
          masked[i] = ok ? labels[i] : ig;
          if (!ignore.has(labels[i])) {
            terrain++;
            if (!ok) unsure++;
          }
        }
        const unclassified = terrain ? unsure / terrain : 0;
        const shares = classShares(masked, meta).map((s) => (s.share == null ? s : { ...s, share: s.share * (1 - unclassified) }));
        hist.push(new Set(hazardsFound(shares, meta).map((h) => h.id)));
        if (hist.length > HAZARD_WINDOW) hist.shift();
        const hazards = Object.keys(meta.hazards || {}).filter((id) => hist.filter((h) => h.has(id)).length >= HAZARD_NEED);
        const now = performance.now();
        stamps.push(now);
        while (stamps[0] < now - 2000) stamps.shift();
        const fps = stamps.length > 2 ? ((stamps.length - 1) * 1000) / (now - stamps[0]) : 0;
        setView({ meta, shares, unclassified, hazards, regions: labelRegions(masked, r.size, meta), fps, ms: Math.round(r.latency), size: r.size, workers: pool.workers });
      };
      while (alive) {
        const v = traverse ? feedRef.current : videoRef.current;
        if (!v || (v.tagName === 'VIDEO' && v.readyState < 2) || document.hidden || live.current.paused) {
          await sleep(80);
          continue;
        }
        const p = pool.run(v, size, { standardize: live.current.standardize, white_balance: live.current.standardize || undefined }); // toma el cuadro ahora; null = todos los workers ocupados
        if (!p) {
          await sleep(2);
          continue;
        }
        p.then(onResult).catch((e) => alive && console.warn('[vision]', e));
        await sleep(0);
      }
    })();
    return () => {
      alive = false;
      pool.close();
    };
  }, [status, model, quality, traverse]);

  const className = (m, id) => (lang === 'en' ? m.classes_en[m.classes.indexOf(id)] : t(`vis.class.${id}`));
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : stageRef.current?.requestFullscreen?.());
  const ready = status === 'live';
  const m = view?.meta;
  const rgb = (cls) => `rgb(${m.colors[cls].join(',')})`;
  const darkText = (cls) => m.colors[cls][0] * 0.299 + m.colors[cls][1] * 0.587 + m.colors[cls][2] * 0.114 > 140;

  return (
    <div className="live" ref={stageRef}>
      <div className="live-main" ref={mainRef}>
        <div className="live-stage" style={{ width: fit?.w, height: fit?.h, display: ready ? 'block' : 'none' }}>
          {traverse ? (
            <canvas ref={feedRef} className="live-feed" width={FEED_W} height={FEED_H} />
          ) : (
            <video ref={videoRef} muted playsInline autoPlay onLoadedMetadata={(e) => setAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight || 16 / 9)} />
          )}
          <canvas ref={maskRef} className="live-mask" style={{ opacity: view && !paused ? opacity : 0 }} aria-hidden="true" />
          {view && !paused && (
            <div className="live-labels">
              {view.regions.map((r, i) => (
                <span key={`${r.id}-${i}`} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, background: rgb(r.cls), color: darkText(r.cls) ? '#111' : '#fff' }}>
                  {className(m, r.id)} {Math.round(r.share * 100)}%
                </span>
              ))}
            </div>
          )}
          <div className="live-hud">
            <span className="live-dot" />
            <b>{t('live.badge')}</b>
            {!view && <span>{t('live.loadingModel')}</span>}
            {view && <span>{t('live.fps', { fps: view.fps.toFixed(1), ms: view.ms, n: view.workers, size: view.size })}</span>}
          </div>
          {view?.hazards.length > 0 && (
            <div className="live-alert" role="alert">
              ⚠ {t('vis.hazard')} {view.hazards.map((h) => className(m, h)).join(', ')}
            </div>
          )}
        </div>
        {!ready && traverse && (
          <div className="live-start">
            <p>{photos === null ? t('live.tr.loading') : t('live.tr.none')}</p>
          </div>
        )}
        {!ready && !traverse && (
          <div className="live-start">
            <p>{status === 'starting' ? t('live.starting') : t('live.intro')}</p>
            {err && <p className="live-err">{err}</p>}
            <div className="live-start-row">
              <button type="button" className="btn primary" disabled={status === 'starting'} onClick={() => startCamera(deviceId)}>
                {t('live.connect')}
              </button>
              <label className="btn">
                {t('live.file')}
                <input type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && useFile(e.target.files[0])} />
              </label>
            </div>
            <p className="note">{t('live.privacy')}</p>
          </div>
        )}
      </div>

      <aside className="live-side">
        {traverse && frame && robotPos && (
          <p className="note">{t('live.tr.note', { sol: frame.sol, dist: Math.round(haversine(robotPos, [frame.lon, frame.lat])) })}</p>
        )}
        <div className="live-row" style={traverse ? { display: 'none' } : undefined}>
          {source === 'camera' && devices.length > 0 ? (
            <select value={deviceId} onChange={(e) => (setDeviceId(e.target.value), startCamera(e.target.value))} aria-label={t('live.camera')}>
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `${t('live.camera')} ${i + 1}`}
                </option>
              ))}
            </select>
          ) : (
            <span className="caption">{source === 'file' ? t('live.fileSrc') : t('live.camera')}</span>
          )}
          {ready && (
            <button type="button" className="btn" onClick={stop}>
              {t('live.stop')}
            </button>
          )}
        </div>
        <label className="live-field">
          <span className="caption">{t('vis.model')}</span>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {VISION_MODELS.map((id) => (
              <option key={id} value={id}>
                {metas[id]?.name || id}
                {metas[id] ? ` · mIoU ${metas[id].metrics.test_miou.toFixed(2)} · ${t('vis.class.arena').toLowerCase()} ${metas[id].metrics.iou_sand.toFixed(2)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="live-field">
          <span className="caption">{t('live.quality')}</span>
          <div className="chips" role="radiogroup">
            {QUALITIES.map((q) => (
              <button key={q} type="button" className="chip" role="radio" aria-checked={quality === q} aria-pressed={quality === q} onClick={() => setQuality(q)}>
                {t(`live.q.${q}`)}
              </button>
            ))}
          </div>
        </div>
        <label className="live-field">
          <span className="caption">
            {t('vis.thr')} <b>{Math.round(thr * 100)} %</b>
          </span>
          <input type="range" min="0.3" max="0.95" step="0.05" value={thr} onChange={(e) => setThr(+e.target.value)} />
        </label>
        <label className="live-field">
          <span className="caption">{t('vis.opacity')}</span>
          <input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
        </label>
        <label className="live-check">
          <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} /> {t('live.smooth')}
        </label>
        <label className="live-check" title={t('live.std.help')}>
          <input type="checkbox" checked={standardize} onChange={(e) => setStandardize(e.target.checked)} /> {t('live.std')}
        </label>
        <div className="live-row">
          <button type="button" className="btn" disabled={!ready} onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? t('live.resume') : t('live.pause')}
          </button>
          <button type="button" className="btn" disabled={!ready} onClick={fullscreen}>
            {t('live.full')}
          </button>
        </div>

        {view && (
          <ul className="live-legend">
            {view.shares
              .filter((s) => s.share != null && s.share >= 0.01)
              .sort((a, b) => b.share - a.share)
              .map((s) => (
                <li key={s.id} className={view.hazards.includes(s.id) ? 'hot' : ''}>
                  <i style={{ background: rgb(m.classes.indexOf(s.id)) }} />
                  <span>{className(m, s.id)}</span>
                  <b>{Math.round(s.share * 100)} %</b>
                </li>
              ))}
            {view.unclassified >= 0.01 && (
              <li>
                <i style={{ border: '1px dashed var(--slate-400)' }} />
                <span>{t('vis.unsure')}</span>
                <b>{Math.round(view.unclassified * 100)} %</b>
              </li>
            )}
          </ul>
        )}
        {view?.hazards.length > 0 && (
          <button type="button" className="btn" disabled={!canDetect(state)} title={canDetect(state) ? '' : t('vis.reportOff')} onClick={() => dispatch({ type: 'ROBOT_DETECT' })}>
            {t('vis.report')}
          </button>
        )}
        {metas[model] && (
          <details className="live-metrics">
            <summary>{t('live.metrics')}</summary>
            <ModelCard meta={metas[model]} other={metas[model === 'ai4mars' ? 's5mars' : 'ai4mars']} liveMs={view?.ms} t={t} />
          </details>
        )}
        <p className="note">{t('live.domain')}</p>
      </aside>
    </div>
  );
}

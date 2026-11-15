// Visor del robot explorador [CoM]: cámara a ras de suelo sobre el relieve REAL de Jezero
// (DEM MOLA–HRSC 200 m servido por /terrain-grid), en grises tipo navcam, con retícula, esquinas,
// indicador que parpadea y flechas para girar la cámara (.6s cubic-bezier(.4,0,.2,1)).
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { api } from '../lib/api.js';
import { easePan } from '../lib/ease.js';
import { MARS_RADIUS_M, cardinal, haversine } from '../lib/geo.js';
import { useSegmentation } from '../lib/useSegmentation.js';
import { colorize, loadMeta, VISION_MODELS } from '../lib/vision.js';
import { canDetect } from '../lib/sim.js';
import { useRegion, useStore } from '../state/store.jsx';

const EXAG = 3; // exageración vertical (se declara en pantalla)

// Fotos reales de la Hazcam de Perseverance a lo largo de su recorrido (MarsWalk-v2/scripts/fetch_robot_photos.py).
const FEED_DIRS = ['/img/robotfeed'];
const FEED_W = 768; // tamaño de los cuadros de la Hazcam (4:3)
const FEED_H = 576;
export const FEED_STEP_M = 60; // metros que camina el robot por cuadro del feed
const ZOOM = 0.16; // acercamiento a lo largo de un cuadro (sensación de avance)
const FADE = 0.25; // último 25 % del tramo: fundido al siguiente cuadro

/** Índice (con fracción) del cuadro del feed: arranca en el cuadro más cercano al robot y avanza con lo que camina. */
export function feedPosition(startIdx, odometer_m, n) {
  if (!n) return { idx: 0, next: 0, t: 0 };
  const f = startIdx + odometer_m / FEED_STEP_M;
  const idx = Math.floor(f) % n;
  return { idx, next: (idx + 1) % n, t: f - Math.floor(f) };
}
let photoIndex = null;
function loadPhotos() {
  photoIndex ??= (async () => {
    for (const dir of FEED_DIRS) {
      try {
        const r = await fetch(`${dir}/index.json`);
        if (!r.ok) continue;
        const ps = (await r.json()).photos || [];
        if (ps.length) return ps.map((p) => ({ ...p, url: `${dir}/${p.file}` }));
      } catch {
        /* siguiente carpeta */
      }
    }
    return [];
  })();
  return photoIndex;
}
/** Foto más cercana a la posición [lon, lat] y su distancia en metros. */
export function nearestPhoto(photos, pos) {
  let best = null;
  let bd = Infinity;
  let bi = -1;
  photos.forEach((p, i) => {
    const d = haversine(pos, [p.lon, p.lat]);
    if (d < bd) {
      bd = d;
      best = p;
      bi = i;
    }
  });
  return best ? { ...best, dist_m: bd, index: bi } : null;
}

const imgCache = new Map();
function frameImage(file) {
  if (!imgCache.has(file)) {
    const im = new Image();
    im.decoding = 'async';
    im.src = file;
    imgCache.set(file, im);
    if (imgCache.size > 40) imgCache.delete(imgCache.keys().next().value);
  }
  return imgCache.get(file);
}
const HALF_CELLS = 45; // ventana de ~18 km alrededor del robot
const MAST_M = 2; // altura de la cámara sobre el suelo (mástil)
const RAD = Math.PI / 180;

const grids = new Map(); // relieve por región (Jezero o sitio 016)
function loadGrid(regionId) {
  if (!grids.has(regionId)) {
    grids.set(
      regionId,
      api.terrainMeta(regionId).then(async (m) => {
        if (!m.ok) return null;
        const d = await api.terrainData(m.data.data_url);
        if (!d.ok) return null;
        return { meta: m.data, z: new Float32Array(d.data) };
      }),
    );
  }
  return grids.get(regionId);
}

function sampler(grid) {
  const { width: W, height: H, transform } = grid.meta;
  const [a, c, e, f] = transform;
  const z = grid.z;
  const at = (col, row) => {
    const v = z[Math.max(0, Math.min(H - 1, row)) * W + Math.max(0, Math.min(W - 1, col))];
    return Number.isFinite(v) ? v : null;
  };
  return (lon, lat) => {
    const x = (lon - c) / a - 0.5;
    const y = (lat - f) / e - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const v00 = at(x0, y0);
    const v10 = at(x0 + 1, y0);
    const v01 = at(x0, y0 + 1);
    const v11 = at(x0 + 1, y0 + 1);
    const vals = [v00, v10, v01, v11].filter((v) => v != null);
    if (!vals.length) return 0;
    const fb = vals.reduce((s, v) => s + v, 0) / vals.length;
    const q = (v) => (v == null ? fb : v);
    return (q(v00) * (1 - tx) + q(v10) * tx) * (1 - ty) + (q(v01) * (1 - tx) + q(v11) * tx) * ty;
  };
}


/** Métricas del modelo elegido (del informe de entrenamiento) y en qué es mejor frente al otro. */
function ModelCard({ meta, other, liveMs, t }) {
  const m = meta.metrics;
  const o = other?.metrics;
  const f2 = (v) => v.toFixed(2);
  const rows = [
    [t('vis.m.miou'), m.miou_strict != null ? `${f2(m.miou_strict)}–${f2(m.test_miou)}` : f2(m.test_miou), o && (o.miou_strict != null ? `${f2(o.miou_strict)}–${f2(o.test_miou)}` : f2(o.test_miou))],
    [t('vis.m.acc'), m.acc_strict != null ? `${f2(m.acc_strict)}–${f2(m.acc)}` : f2(m.acc), o && (o.acc_strict != null ? `${f2(o.acc_strict)}–${f2(o.acc)}` : f2(o.acc))],
    [t('vis.m.sand'), m.iou_sand_strict != null ? `${f2(m.iou_sand_strict)}–${f2(m.iou_sand)}` : f2(m.iou_sand), o && (o.iou_sand_strict != null ? `${f2(o.iou_sand_strict)}–${f2(o.iou_sand)}` : f2(o.iou_sand))],
    [t('vis.m.classes'), String(meta.classes.length), other && String(other.classes.length)],
    [t('vis.m.speed'), liveMs != null ? `${liveMs} ms` : `~${m.cpu_ms_ref} ms`, o && `~${o.cpu_ms_ref} ms`],
  ];
  return (
    <div className="vf-model-card">
      <table>
        <thead>
          <tr>
            <th />
            <th>{meta.name}</th>
            {other && <th>{other.name}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>
                <b>{a}</b>
              </td>
              {other && <td>{b}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t(`vis.best.${meta.id}`)}</p>
      <p className="vf-seg-note">{t('vis.m.note')}</p>
    </div>
  );
}

export default function Viewfinder({ robot, hazards = [], route, routeColor = 0x96d2ff, sol, regionId = 'jezero' }) {
  const { t, lang, state, dispatch } = useStore();
  const region = useRegion();
  // Segmentación semántica en tiempo real de lo que ve la cámara del robot (AI4Mars ↔ S5Mars, o apagada).
  const glRef = useRef(null);
  const maskRef = useRef(null);
  const [segModel, setSegModel] = useState('ai4mars');
  // Fuente de la cámara: foto real más cercana (por defecto) o render 3D del relieve.
  const [camMode, setCamMode] = useState('photo');
  const [photos, setPhotos] = useState(null); // null = cargando
  const feedRef = useRef(null);
  const feed = useRef({ start: -1, odo: 0, last: null, idx: -1 });
  const [frame, setFrame] = useState(null); // cuadro visible (para el crédito)
  useEffect(() => {
    let alive = true;
    loadPhotos().then((p) => alive && setPhotos(p));
    return () => {
      alive = false;
    };
  }, []);
  const photoMode = camMode === 'photo' && !!robot?.pos && !!photos?.length;

  // Odómetro del robot: el feed avanza un cuadro cada FEED_STEP_M metros caminados (pausa = video en pausa).
  useEffect(() => {
    if (!photoMode) return;
    const f = feed.current;
    const pos = robot.pos;
    const jump = f.last ? haversine(f.last, pos) : Infinity;
    if (f.start < 0 || jump > 500) {
      f.start = nearestPhoto(photos, pos).index; // nueva EVA o salto: resincroniza con la foto más cercana
      f.odo = 0;
    } else {
      f.odo += jump;
    }
    f.last = pos;
  }, [photoMode, photos, robot?.pos]);

  // Dibuja el feed a ~30 cuadros/s: cuadro actual con acercamiento lento y fundido al siguiente.
  useEffect(() => {
    if (!photoMode) return undefined;
    let raf = 0;
    let lastDraw = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < 33 || document.hidden) return;
      lastDraw = now;
      const cv = feedRef.current;
      if (!cv) return;
      const f = feed.current;
      const { idx, next, t: tt } = feedPosition(Math.max(0, f.start), f.odo, photos.length);
      const a = frameImage(photos[idx].url);
      const b = frameImage(photos[next].url);
      frameImage(photos[(next + 1) % photos.length].url); // precarga
      if (idx !== f.idx) {
        f.idx = idx;
        setFrame(photos[idx]);
      }
      const ctx = cv.getContext('2d');
      const put = (im, z, alpha) => {
        if (!im.complete || !im.naturalWidth) return;
        const w = FEED_W * z;
        const h = FEED_H * z;
        ctx.globalAlpha = alpha;
        ctx.drawImage(im, (FEED_W - w) / 2, (FEED_H - h) * 0.6, w, h); // se acerca hacia el horizonte
      };
      put(a, 1 + ZOOM * tt, 1);
      if (tt > 1 - FADE) put(b, 1, (tt - (1 - FADE)) / FADE);
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [photoMode, photos]);
  const photo = photoMode && frame ? { ...frame, dist_m: haversine(robot.pos, [frame.lon, frame.lat]) } : null;
  const photosLoading = camMode === 'photo' && photos === null;
  const [segOpacity, setSegOpacity] = useState(0.5);
  // La IA solo corre sobre fotos reales: sobre el render gris los modelos no reconocen nada (todo salía «arena»).
  const seg = useSegmentation(() => feedRef.current, photoMode ? segModel : null);
  // Metadatos de ambos modelos para la lista desplegable y la tarjeta de métricas.
  const [metas, setMetas] = useState({});
  useEffect(() => {
    let alive = true;
    Promise.all(VISION_MODELS.map((m) => loadMeta(m).catch(() => null))).then((ms) => {
      if (alive) setMetas(Object.fromEntries(VISION_MODELS.map((m, i) => [m, ms[i]])));
    });
    return () => {
      alive = false;
    };
  }, []);
  // Imagen real (CTX + color Viking) como textura: solo existe procesada para Jezero.
  const overview = regionId === 'jezero' ? region?.ortho?.overview || null : null;
  const overviewRef = useRef(overview);
  const box = useRef(null);
  const tagRef = useRef(null);
  const live = useRef({ robot, hazards, route, routeColor });
  live.current = { robot, hazards, route, routeColor };
  const [yaw, setYaw] = useState(0);
  const yawRef = useRef({ from: 0, to: 0, t0: 0 });
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const y = yawRef.current;
    y.from = y.current ?? 0;
    y.to = yaw;
    y.t0 = performance.now();
  }, [yaw]);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let renderer;
    const el = box.current;
    loadGrid(regionId).then((grid) => {
      if (disposed) return;
      if (!grid) {
        setStatus('error');
        return;
      }
      setStatus('ready');
      const elevAt = sampler(grid);
      const [a] = grid.meta.transform;
      const scene = new THREE.Scene();
      const sky = new THREE.Color('#1a1918'); // [CoM] slate-900
      scene.background = sky;
      scene.fog = new THREE.Fog(sky, 1500, 16000);
      const camera = new THREE.PerspectiveCamera(55, 1, 1, 30000);
      // preserveDrawingBuffer: la IA lee cada cuadro del canvas después de dibujarlo.
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      el.prepend(renderer.domElement);
      glRef.current = renderer.domElement;
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-4000, 2500, -3000); // sol bajo: realza el relieve
      scene.add(sun);

      // Con ortomosaico: la imagen real de Marte pintada sobre el relieve real. Sin él: gris tipo navcam.
      const ov = overviewRef.current;
      const mat = ov
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 })
        : new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 1, metalness: 0, flatShading: true });
      if (ov) {
        new THREE.TextureLoader().load(ov.url, (tex) => {
          if (disposed) return tex.dispose();
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          mat.map = tex;
          mat.needsUpdate = true;
        });
      }
      let terrain = null;
      let origin = null;
      let base = 0;
      const toLocal = (lon, lat) => [
        (lon - origin[0]) * RAD * MARS_RADIUS_M * Math.cos(origin[1] * RAD),
        -(lat - origin[1]) * RAD * MARS_RADIUS_M,
      ];
      const yAt = (lon, lat) => (elevAt(lon, lat) - base) * EXAG;

      const build = (center) => {
        origin = center;
        base = elevAt(center[0], center[1]);
        const n = HALF_CELLS * 2;
        const cellDeg = a;
        const geo = new THREE.PlaneGeometry(1, 1, n, n);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const uv = geo.attributes.uv;
        const ob = ov ? ov.bbox : null;
        for (let i = 0; i < pos.count; i++) {
          const gx = pos.getX(i); // −0.5..0.5 (este)
          const gz = pos.getZ(i); // −0.5..0.5 (sur positivo)
          const lon = center[0] + gx * n * cellDeg;
          const lat = center[1] - gz * n * cellDeg;
          const [x, z] = toLocal(lon, lat);
          pos.setXYZ(i, x, yAt(lon, lat), z);
          if (ob) uv.setXY(i, (lon - ob[0]) / (ob[2] - ob[0]), (lat - ob[1]) / (ob[3] - ob[1]));
        }
        geo.computeVertexNormals();
        if (terrain) {
          scene.remove(terrain);
          terrain.geometry.dispose();
        }
        terrain = new THREE.Mesh(geo, mat);
        scene.add(terrain);
      };

      const overlays = new THREE.Group();
      scene.add(overlays);
      let overlayKey = '';
      const drape = (coords, lift, color, loop = false) => {
        const pts = coords.map(([lon, lat]) => {
          const [x, z] = toLocal(lon, lat);
          return new THREE.Vector3(x, yAt(lon, lat) + lift, z);
        });
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, fog: true });
        return loop ? new THREE.LineLoop(g, m) : new THREE.Line(g, m);
      };
      const rebuildOverlays = () => {
        for (const o of overlays.children) {
          o.geometry.dispose();
          o.material.dispose();
        }
        overlays.clear();
        const { hazards: hz, route: rt, routeColor: rc } = live.current;
        if (rt && rt.length > 1) overlays.add(drape(rt, 4, rc));
        for (const h of hz) {
          const ring = [];
          for (let i = 0; i < 64; i++) {
            const th = (i / 64) * Math.PI * 2;
            const dLat = (h.radius_m * Math.cos(th)) / (RAD * MARS_RADIUS_M);
            const dLon = (h.radius_m * Math.sin(th)) / (RAD * MARS_RADIUS_M * Math.cos(h.pos[1] * RAD));
            ring.push([h.pos[0] + dLon, h.pos[1] + dLat]);
          }
          overlays.add(drape(ring, 3, 0xffd28c, true));
          const [x, z] = toLocal(h.pos[0], h.pos[1]);
          const y0 = yAt(h.pos[0], h.pos[1]);
          const beacon = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y0 + 90, z)]);
          overlays.add(new THREE.Line(beacon, new THREE.LineBasicMaterial({ color: 0xf09646 })));
        }
      };

      const cam = { x: 0, y: 0, z: 0, init: false };
      const resize = () => {
        const w = el.clientWidth || 1;
        const h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      let lastFrame = 0;
      const frame = (now) => {
        if (now - lastFrame < 33 || document.hidden) {
          raf = requestAnimationFrame(frame); // ~30 cuadros/s
          return;
        }
        lastFrame = now;
        const { robot: r, hazards: hz, route: rt } = live.current;
        if (r && r.pos) {
          if (!origin || Math.hypot(...toLocal(r.pos[0], r.pos[1])) > 4000) {
            build(r.pos);
            overlayKey = '';
            cam.init = false;
          }
          // El primer punto de la ruta avanza en cada tick: se redondea (~100 m) para no reconstruir la geometría 10 veces/s.
          const head = rt && rt[0] ? rt[0].map((v) => v.toFixed(3)).join() : '';
          const key = `${hz.length}:${rt ? rt.length : 0}:${head}:${origin.join()}`;
          if (key !== overlayKey) {
            rebuildOverlays();
            overlayKey = key;
          }
          // Giro de cámara con la curva de paneo.
          const y = yawRef.current;
          const k = Math.min(1, (now - y.t0) / 600);
          y.current = y.from + (y.to - y.from) * easePan(k);
          const heading = (r.bearing + y.current) * RAD;
          const [tx, tz] = toLocal(r.pos[0], r.pos[1]);
          const ty = yAt(r.pos[0], r.pos[1]) + MAST_M * EXAG + 4;
          if (!cam.init) Object.assign(cam, { x: tx, y: ty, z: tz, init: true });
          cam.x += (tx - cam.x) * 0.12;
          cam.y += (ty - cam.y) * 0.12;
          cam.z += (tz - cam.z) * 0.12;
          camera.position.set(cam.x, cam.y, cam.z);
          const look = 600;
          camera.lookAt(cam.x + Math.sin(heading) * look, cam.y - 18, cam.z - Math.cos(heading) * look);
          // Etiqueta del peligro proyectada a pantalla.
          const tag = tagRef.current;
          if (tag) {
            const h = hz[hz.length - 1];
            if (h) {
              const [hx, hzl] = toLocal(h.pos[0], h.pos[1]);
              const v = new THREE.Vector3(hx, yAt(h.pos[0], h.pos[1]) + 90, hzl).project(camera);
              const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
              tag.style.display = visible ? 'block' : 'none';
              tag.style.left = `${((v.x + 1) / 2) * el.clientWidth}px`;
              tag.style.top = `${((1 - v.y) / 2) * el.clientHeight}px`;
            } else tag.style.display = 'none';
          }
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      el._cleanup = () => {
        ro.disconnect();
        if (mat.map) mat.map.dispose();
        mat.dispose();
        if (terrain) terrain.geometry.dispose();
        for (const o of overlays.children) {
          o.geometry.dispose();
          o.material.dispose();
        }
        renderer.dispose();
        renderer.forceContextLoss(); // libera el contexto WebGL (si no, se acumulan al navegar entre vistas)
        renderer.domElement.remove();
      };
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (el._cleanup) {
        el._cleanup();
        el._cleanup = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId]);

  // Máscara de la IA (S×S) estirada sobre el visor.
  useEffect(() => {
    const cv = maskRef.current;
    const r = seg.res;
    if (!cv || !r) return;
    // La IA ve el cuadro reducido a S×S; la máscara se devuelve al tamaño 4:3 del feed para que calce.
    const tmp = document.createElement('canvas');
    tmp.width = r.size;
    tmp.height = r.size;
    tmp.getContext('2d').putImageData(new ImageData(colorize(r.labels, r.meta.colors), r.size, r.size), 0, 0);
    cv.width = FEED_W;
    cv.height = FEED_H;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(tmp, 0, 0, FEED_W, FEED_H);
  }, [seg.res]);
  useEffect(() => () => (glRef.current = null), []);

  const segRes = seg.res && seg.res.meta.id === segModel ? seg.res : null;
  const className = (m, id) => (lang === 'en' ? m.classes_en[m.classes.indexOf(id)] : t(`vis.class.${id}`));
  const visible = segRes ? segRes.shares.filter((s) => s.share != null && s.share >= 0.01).sort((a, b) => b.share - a.share) : [];
  const canReport = canDetect(state);

  const heading = robot ? (robot.bearing + yaw + 360) % 360 : null;
  return (
    <div ref={box} className={`viewfinder ${photoMode ? 'photo-mode' : ''}`}>
      <div className="vf-frame">
        {photoMode && <canvas ref={feedRef} className="vf-photo" width={FEED_W} height={FEED_H} aria-label={photo ? t('vis.photoAlt', { sol: photo.sol }) : ''} />}
        <canvas ref={maskRef} className="vf-seg-mask" style={{ opacity: segRes ? segOpacity : 0 }} aria-hidden="true" />
        {photosLoading && <div className="vf-loading caption">{t('vis.photosLoading')}</div>}
        {photoMode && segModel && <div className="vf-scan" aria-hidden="true" />}
      </div>
      <div className="vf-overlay">
        <div className="vf-seg">
          <div className="vf-seg-head caption">
            <span>{t('vis.live')}</span>
            {seg.status === 'loading' && <span>{t('vis.loading')}</span>}
            {seg.status === 'error' && <span className="warn">{t('vis.error')}</span>}
            {seg.status === 'live' && segRes && <span>{t('vis.fps', { fps: (seg.fps ?? 0).toFixed(1), ms: segRes.ms })}</span>}
          </div>
          <div className="chips" role="radiogroup" aria-label={t('vis.cam')}>
            {['photo', 'render'].map((m) => (
              <button key={m} type="button" className="chip" role="radio" aria-checked={camMode === m} aria-pressed={camMode === m} onClick={() => setCamMode(m)}>
                {t(`vis.cam.${m}`)}
              </button>
            ))}
          </div>
          <label className="vf-seg-select">
            <span className="caption">{t('vis.model')}</span>
            <select value={segModel || ''} disabled={!photoMode} onChange={(e) => setSegModel(e.target.value || null)}>
              <option value="">{t('vis.off')}</option>
              {VISION_MODELS.map((m) => {
                const mm = metas[m]?.metrics;
                return (
                  <option key={m} value={m}>
                    {metas[m]?.name || m}
                    {mm ? ` · mIoU ${mm.test_miou.toFixed(2)} · ${t('vis.class.arena').toLowerCase()} ${mm.iou_sand.toFixed(2)}` : ''}
                  </option>
                );
              })}
            </select>
          </label>
          {photoMode && segModel && metas[segModel] && (
            <ModelCard meta={metas[segModel]} other={metas[segModel === 'ai4mars' ? 's5mars' : 'ai4mars']} liveMs={segRes?.ms} t={t} />
          )}
          {!photoMode && <p className="vf-seg-note">{t('vis.renderOff')}</p>}
          {photoMode && segModel && (
            <input className="vf-seg-opacity" type="range" min="0.1" max="1" step="0.05" value={segOpacity} aria-label={t('vis.opacity')} onChange={(e) => setSegOpacity(+e.target.value)} />
          )}
          {segRes && (
            <ul className="vf-seg-legend">
              {visible.map((s) => (
                <li key={s.id} className={segRes.hazards.some((h) => h.id === s.id) ? 'hot' : ''}>
                  <i style={{ background: `rgb(${segRes.meta.colors[segRes.meta.classes.indexOf(s.id)].join(',')})` }} />
                  <span>{className(segRes.meta, s.id)}</span>
                  <b>{Math.round(s.share * 100)} %</b>
                </li>
              ))}
            </ul>
          )}
          {segRes && segRes.hazards.length > 0 && (
            <button type="button" className="btn vf-seg-report" disabled={!canReport} title={canReport ? '' : t('vis.reportOff')} onClick={() => dispatch({ type: 'ROBOT_DETECT' })}>
              {t('vis.report')}
            </button>
          )}
          {photoMode && segModel && <p className="vf-seg-note">{t('vis.photoNote')}</p>}
          {photo && <p className="vf-seg-note">{t('vis.photoCredit', { sol: photo.sol, dist: Math.round(photo.dist_m) })}</p>}
        </div>
        <div className="vf-caption caption">
          <span className="blink" />
          <span style={{ color: 'var(--white)' }}>{photoMode ? 'HAZCAM · SCOUT-1' : 'NAVCAM · SCOUT-1'}</span>
          {photoMode ? <span className="tag verified">{t('vis.realPhoto')}</span> : <span className="tag sim">{t('tag.sim')}</span>}
        </div>
        <span className="vf-corner tl" />
        <span className="vf-corner tr" />
        <span className="vf-corner bl" />
        <span className="vf-corner br" />
        <div className="cross">
          <button type="button" className="c-left" aria-label="←" onClick={() => setYaw((v) => v - 30)}>
            ‹
          </button>
          <span className="c-center" />
          <button type="button" className="c-right" aria-label="→" onClick={() => setYaw((v) => v + 30)}>
            ›
          </button>
        </div>
        <div ref={tagRef} className="hazard-tag" style={{ display: 'none' }}>
          {lang === 'en' ? 'Soft sand' : 'Arena blanda'} · {t('tag.sim')}
        </div>
        <div className="vf-meta caption">
          <span>{heading != null ? `${Math.round(heading)}° ${cardinal(heading, lang)}` : '—'}</span>
          <span>{photo ? `Perseverance · Front Hazcam · sol ${photo.sol} · NASA/JPL-Caltech` : status === 'error' ? 'NO DEM' : t('hab.vfNote')}</span>
          {sol != null && <span>{sol}</span>}
        </div>
      </div>
    </div>
  );
}

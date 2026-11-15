// 01 · Plan — el núcleo: imagen real + capas, varias paradas y un A* exacto por tramo con radio de regreso a pie.
import { useEffect, useMemo, useRef, useState } from 'react';
import CaptureModal from '../components/CaptureModal.jsx';
import { AstroPanel, Gauge, RobotPanel } from '../components/Gauges.jsx';
import { snapshotMap } from '../lib/findings.js';
import { liveVitals, projected } from '../lib/vitals.js';
import { useRadiation } from '../lib/radiation.js';
import MapView from '../components/MapView.jsx';
import PlaceSearch from '../components/PlaceSearch.jsx';
import PointInfo from '../components/PointInfo.jsx';
import Profile from '../components/Profile.jsx';
import { api } from '../lib/api.js';
import { formatKm, haversine } from '../lib/geo.js';
import { combineLegs } from '../lib/legs.js';
import { LAYER_INFO } from '../lib/marsTiles.js';
import { explainList } from '../lib/explain.js';
import { MAX_STOPS, routeFromApi, WALK_KMH, WALKBACK_M } from '../lib/sim.js';
import { useRegion, useStore } from '../state/store.jsx';

const PRESETS = ['safe', 'balanced', 'fast', 'science'];
const LAYER_GROUPS = [
  { id: 'base', items: [{ k: 'ortho', label: 'layer.mars', src: LAYER_INFO.color.source }, { k: 'hirise', label: 'layer.hirise' }] },
  { id: 'walk', items: [{ k: 'sand', label: 'layer.sand', raster: true }, { k: 'slope', label: 'layer.slope', raster: true }, { k: 'traversability', label: 'layer.trav', raster: true }, { k: 'hillshade', label: 'layer.shade', raster: true }] },
  { id: 'science', items: [{ k: 'geology', label: 'layer.geology', src: LAYER_INFO.geology.source }, { k: 'mola', label: 'layer.mola', src: LAYER_INFO.mola.source }, { k: 'themis', label: 'layer.themis', src: LAYER_INFO.themis.source }] },
  { id: 'ref', items: [{ k: 'places', label: 'layer.places', src: 'NASA Mars Trek · EZMars (2015) · nomenclatura IAU' }, { k: 'traverse', label: 'plan.traverse' }] },
];

export default function PlanView({ go }) {
  const { state, dispatch, t, lang, presetLabels } = useStore();
  const region = useRegion();
  const { plan } = state;
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const hasOrtho = !!region.ortho;
  const [layersOn, setLayersOn] = useState({
    ortho: true,
    hirise: true,
    mola: false,
    themis: false,
    geology: false,
    hillshade: false,
    slope: false,
    traversability: false,
    sand: true,
    traverse: true,
    places: true,
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const [picked, setPicked] = useState(null); // { pos, feature } con ficha abierta
  const [fly, setFly] = useState(null);
  const [settingHab, setSettingHab] = useState(false);
  const mapApi = useRef(null);
  const [cap, setCap] = useState(null); // { photo } con el modal abierto
  const [saved, setSaved] = useState(false);
  const capture = async () => setCap({ photo: await snapshotMap(mapApi.current) });
  const locked = state.phase !== 'plan';
  const stops = plan.stops;
  // Clave del plan vigente: si cambia mientras se calculan los tramos, el resultado ya no corresponde.
  const planKey = JSON.stringify([plan.habitat, stops.map((s) => s.id), plan.preset, plan.regionId]);
  const planKeyRef = useRef(planKey);
  planKeyRef.current = planKey;

  useEffect(() => {
    if (!plan.habitat && region.landing) dispatch({ type: 'PLAN_SET', patch: { habitat: region.landing } });
  }, [plan.habitat, region.landing, dispatch]);

  const sites = useMemo(() => {
    if (!plan.habitat) return [];
    return region.pois.features
      .map((f) => ({
        id: f.properties.poi_id,
        name: f.properties.name,
        pos: f.geometry.coordinates,
        dist: haversine(plan.habitat, f.geometry.coordinates),
      }))
      .sort((a, b) => a.dist - b.dist);
  }, [region.pois, plan.habitat]);
  const outOfRange = useMemo(() => new Set(sites.filter((s) => s.dist > WALKBACK_M).map((s) => s.id)), [sites]);
  const selected = useMemo(() => new Set(stops.map((s) => s.id)), [stops]);

  const setStops = (next) => {
    setError('');
    dispatch({ type: 'PLAN_SET', patch: { stops: next } });
  };
  const toggleStop = (s) => {
    if (selected.has(s.id)) setStops(stops.filter((x) => x.id !== s.id));
    else if (stops.length < MAX_STOPS) setStops([...stops, { id: s.id, name: s.name, pos: s.pos }]);
  };
  const move = (i, d) => {
    const next = [...stops];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setStops(next);
  };

  const onMapClick = ({ pos, poiId, feature }) => {
    if (locked) return;
    if (moving) {
      setMoving(false);
      setHabitatHere(pos);
      return;
    }
    if (poiId) {
      const s = sites.find((x) => x.id === poiId);
      if (s && !outOfRange.has(s.id)) toggleStop(s);
      return;
    }
    setPicked({ pos, feature }); // cualquier otro punto: ficha con geología, superficie y terreno
  };
  // 016: hábitat en cualquier lugar. El servidor arma el relieve de esa zona (o usa Jezero si cae dentro).
  const setHabitatHere = async (where = picked?.pos) => {
    if (!where) return;
    setSettingHab(true);
    setError('');
    const r = await api.site(where);
    setSettingHab(false);
    if (!r.ok) return setError(r.error.error);
    dispatch({
      type: 'PLAN_SET',
      patch: { habitat: where, stops: [], regionId: r.data.region_id, regionBbox: r.data.region_id === 'jezero' ? null : r.data.bbox },
    });
    setFly({ center: where, zoom: 11.5, key: Date.now() });
  };
  const addPicked = () => {
    if (!picked || stops.length >= MAX_STOPS) return;
    const n = stops.filter((s) => s.id.startsWith('custom')).length + 1;
    setStops([...stops, { id: `custom${Date.now()}`, name: picked.feature?.name || t('plan.custom', { n }), pos: picked.pos }]);
    setPicked(null);
  };

  // Un A* exacto por tramo: hábitat → P1 → P2 → … (el regreso se calcula al final de la EVA).
  const compute = async () => {
    setError('');
    const startKey = planKeyRef.current;
    const legs = [];
    let from = plan.habitat;
    for (let i = 0; i < stops.length; i++) {
      setBusy(t('plan.legOf', { n: i + 1, total: stops.length }));
      const res = await api.route({ from, to: stops[i].pos, habitat: plan.habitat, preset: plan.preset, maxRadius: WALKBACK_M, region: plan.regionId });
      if (!(res.ok && res.data.status === 'ok')) {
        setBusy('');
        setError(`${stops[i].name}: ${res.ok ? res.data.reason || t('plan.noroute') : res.error.error}`);
        return;
      }
      legs.push(routeFromApi(res.data));
      from = stops[i].pos;
    }
    setBusy('');
    if (planKeyRef.current !== startKey) return; // el usuario editó el plan a mitad del cálculo
    dispatch({ type: 'PLAN_LEGS', legs });
  };

  const start = () => {
    dispatch({ type: 'EVA_START' });
    go('habitat');
  };

  const summary = useMemo(() => combineLegs(plan.legs), [plan.legs]);
  const evaRoute = locked ? state.eva.route : null;
  const walkH = summary ? summary.distance_m / 1000 / WALK_KMH : null;
  const orthoMeta = region.ortho?.layers || [];
  const activeLayers = Object.values(layersOn).filter(Boolean).length;
  const vit = locked ? liveVitals(state) : null;
  const rad = useRadiation(state);
  const proj = useMemo(() => projected(plan, summary), [plan, summary]);

  return (
    <div className="plan-grid">
      <section className="screen stagger" style={{ '--i': 0 }}>
        <MapView
          region={region}
          layersOn={layersOn}
          habitat={plan.habitat}
          walkbackM={WALKBACK_M}
          pois={region.pois}
          selectedPois={selected}
          outOfRange={outOfRange}
          stops={stops}
          route={evaRoute ? evaRoute.coords : summary?.coords}
          routeOrigin={evaRoute?.origin}
          hazards={state.eva?.hazards}
          onClick={onMapClick}
          fitTo={summary?.coords}
          flyTo={fly}
          intro
          apiRef={mapApi}
        />
        <PlaceSearch
          onPick={(p) => {
            setFly({ center: [p.lon, p.lat], zoom: p.kind === 'ez' ? 7 : 8, key: Date.now() });
            setPicked({ pos: [p.lon, p.lat], feature: { name: p.name, kind: p.kind, type: p.type } });
          }}
        />
        <div className="map-overlay-caption caption">
          <span className="blink" style={{ background: 'var(--orbit-bright)' }} />
          <span style={{ color: 'var(--white)' }}>{moving ? t('plan.moving') : t('plan.title')}</span>
        </div>
        <button type="button" className="btn cap-btn" onClick={capture}>
          📷 {t('cap.btn')}
        </button>
        {saved && <div className="toast">{t('cap.saved')}</div>}
        {cap && (
          <CaptureModal
            photo={cap.photo}
            pos={picked?.pos || mapApi.current?.getCenter().toArray() || plan.habitat}
            simTime_s={locked ? state.simTime_s : null}
            t={t}
            onClose={() => setCap(null)}
            onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 2500); }}
          />
        )}
        {picked && (
          <PointInfo
            key={picked.pos.join()}
            pos={picked.pos}
            feature={picked.feature}
            habitat={plan.habitat}
            canAdd={!locked && stops.length < MAX_STOPS}
            onAdd={addPicked}
            onClose={() => setPicked(null)}
            regionId={plan.regionId}
            regionBbox={plan.regionBbox}
            onSetHabitat={locked ? null : () => setHabitatHere()}
            settingHabitat={settingHab}
          />
        )}
        <div className={`layer-panel ${layersOpen ? 'open' : ''}`}>
          <button type="button" className="layer-fab" aria-expanded={layersOpen} onClick={() => setLayersOpen((o) => !o)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 3 9 5-9 5-9-5 9-5Z" />
              <path d="m3 13 9 5 9-5" />
            </svg>
            {t('plan.layers')}
            <span className="count">{activeLayers}</span>
            <span className="chev" aria-hidden="true">{layersOpen ? '▾' : '▸'}</span>
          </button>
          {layersOpen && (
            <div className="layer-body">
              {LAYER_GROUPS.map((g) => (
                <fieldset key={g.id} className="layer-group">
                  <legend>{t(`lg.${g.id}`)}</legend>
                  <p className="lg-help">{t(`lg.${g.id}.help`)}</p>
                  {g.items
                    .filter((it) => (it.k === 'hirise' ? hasOrtho : it.raster ? region.layers.some((l) => l.layer_id === it.k) : true))
                    .map((it) => {
                      const meta = it.raster ? region.layers.find((l) => l.layer_id === it.k) : null;
                      const title = meta
                        ? `${meta.source_dataset} · ${meta.instrument} · ${meta.resolution_m} m — ${meta.limitations}`
                        : it.k === 'hirise'
                          ? orthoMeta.map((l) => `${l.source_dataset} · ${l.resolution_m} m/px · ${l.limitations}`).join(String.fromCharCode(10))
                          : it.src || '';
                      return (
                        <label key={it.k} className="layer-row" title={title}>
                          <input type="checkbox" checked={!!layersOn[it.k]} onChange={(e) => setLayersOn({ ...layersOn, [it.k]: e.target.checked })} />
                          <span className="lr-text">
                            <span className="lr-name">{meta ? meta.name : t(it.label)}</span>
                            <span className="lr-help">{t(`${it.label}.help`)}</span>
                          </span>
                          {meta && <span className="caption">{meta.resolution_m} m</span>}
                          {it.k === 'ortho' && <span className="tag sim">{t('plan.orthoColor')}</span>}
                        </label>
                      );
                    })}
                </fieldset>
              ))}
              <div className="row note">
                <span className="swatch" style={{ color: 'var(--orbit-mid)', borderTopStyle: 'dashed' }} />
                <span>{t('plan.walkback')}</span>
                <span className="tag verified">{t('tag.verified')}</span>
              </div>
              <div className="note">NASA Mars Trek · USGS · Esri (CTX Caltech/Murray Lab)</div>
            </div>
          )}
        </div>
      </section>

      <aside className="screen side stagger" style={{ '--i': 1 }}>
        <div className="scroll" style={{ flex: 1 }}>
          <div className="step">
            <h3>
              <span className="num">01</span>
              {t('plan.habitat')}
            </h3>
            <div className="row">
              <span className="mono" style={{ fontSize: 13 }}>
                {plan.habitat ? `${plan.habitat[1].toFixed(4)}° N · ${plan.habitat[0].toFixed(4)}° E` : '—'}
              </span>
              <button type="button" className="btn" disabled={locked} onClick={() => setMoving((m) => !m)}>
                {moving ? '×' : t('plan.move')}
              </button>
            </div>
            <p className="note">{t('plan.habitatNote')}</p>
          </div>

          <div className="step">
            <h3>
              <span className="num">02</span>
              {t('plan.dest')}
              <span className="caption" style={{ marginLeft: 'auto', letterSpacing: 0 }}>
                {stops.length}/{MAX_STOPS}
              </span>
            </h3>
            <p className="note" style={{ margin: 0 }}>
              {t('plan.stopsNote', { max: MAX_STOPS })}
            </p>
            {stops.length > 0 && (
              <ol className="stops">
                {stops.map((s, i) => (
                  <li key={s.id} className="stop-item">
                    <span className="stop-num">{i + 1}</span>
                    <span className="stop-name">{s.name}</span>
                    <button type="button" aria-label={t('plan.up')} disabled={locked || i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={t('plan.down')}
                      disabled={locked || i === stops.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={t('plan.remove')}
                      disabled={locked}
                      onClick={() => setStops(stops.filter((x) => x.id !== s.id))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <ul className="poi-list">
              {sites.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={selected.has(s.id)}
                    disabled={locked || outOfRange.has(s.id) || (!selected.has(s.id) && stops.length >= MAX_STOPS)}
                    onClick={() => toggleStop(s)}
                  >
                    <span>
                      {selected.has(s.id) && <span className="stop-num small">{stops.findIndex((x) => x.id === s.id) + 1}</span>}
                      {s.name}
                    </span>
                    <span className="dist">{outOfRange.has(s.id) ? t('plan.out') : formatKm(s.dist)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="step">
            <h3>
              <span className="num">03</span>
              {t('plan.preset')}
            </h3>
            <div className="chips">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="chip"
                  aria-pressed={plan.preset === p}
                  disabled={locked}
                  onClick={() => dispatch({ type: 'PLAN_SET', patch: { preset: p } })}
                >
                  {lang === 'es' ? presetLabels[p] || p : p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="step">
            <h3>
              <span className="num">04</span>
              {t('vit.status')}
            </h3>
            {vit ? (
              <div className="vit-grid">
                <AstroPanel v={vit.astro} t={t} rad={rad} />
                <RobotPanel v={vit.robot} t={t} rad={rad} />
              </div>
            ) : proj ? (
              <div className="vit-card">
                <div className="vit-title">
                  <span>{t('vit.preview')}</span>
                  <span className={`pill ${proj.level}`}>{t(`vit.level.${proj.level}`)}</span>
                </div>
                <div className="caption">
                  {t('vit.eta')}: {Math.floor(proj.hours)} h {Math.round((proj.hours % 1) * 60)} min
                </div>
                <Gauge label={t('vit.o2')} value={proj.o2} />
                <Gauge label={t('vit.suit')} value={proj.suit} />
                <Gauge label={t('vit.robotEnd')} value={proj.robotBat} />
                <div className="gauge-hint">{t('vit.previewNote')} {t('vit.assume')}</div>
              </div>
            ) : (
              <p className="note">{t('vit.noPlan')}</p>
            )}
          </div>

          {summary && (
            <div className="step reveal">
              <div className="metrics">
                <div className="metric">
                  <div className="caption">{t('plan.total')}</div>
                  <div className="value orbit">{formatKm(summary.distance_m)}</div>
                </div>
                <div className="metric">
                  <div className="caption">{t('m.maxSlope')}</div>
                  <div className="value">{summary.max_slope_deg.toFixed(1)}°</div>
                </div>
                <div className="metric">
                  <div className="caption">{t('m.gain')}</div>
                  <div className="value">{Math.round(summary.elevation_gain_m)} m</div>
                </div>
                <div className="metric">
                  <div className="caption">{t('m.risk')}</div>
                  <div className="value">{summary.pct_risk_cells.toFixed(1)}%</div>
                </div>
                <div className="metric wide">
                  <div className="caption">
                    {t('m.walkTime')} <span className="tag proposal">{t('m.walkTimeNote')}</span>
                  </div>
                  <div className="value">{`${Math.floor(walkH)} h ${Math.round((walkH % 1) * 60)} min`}</div>
                </div>
              </div>
              <div style={{ height: 110, marginTop: 12 }}>
                <Profile profile={summary.profile} t={t} />
              </div>
              <ol className="legs">
                {plan.legs.map((l, i) => (
                  <li key={i}>
                    <span className="stop-num small">{i + 1}</span>
                    <span>{stops[i]?.name}</span>
                    <span className="dist">{formatKm(l.distance_m)}</span>
                  </li>
                ))}
              </ol>
              <ul className="explain">
                {explainList(summary.explanations, t).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <div className="step note" style={{ color: 'var(--alert)' }}>
              {error}
            </div>
          )}
        </div>

        <div className="step" style={{ borderTop: '1px solid var(--slate-800)', borderBottom: 0, display: 'grid', gap: 8 }}>
          {locked ? (
            <button type="button" className="btn block" onClick={() => dispatch({ type: 'RESET' })}>
              {t('hab.reset')}
            </button>
          ) : (
            <>
              <button type="button" className="btn block" disabled={!stops.length || !!busy} onClick={compute}>
                {busy || (stops.length ? t('plan.compute') : t('plan.pick'))}
              </button>
              <button type="button" className="btn primary block" disabled={!plan.legs} onClick={start}>
                {t('plan.start')} →
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

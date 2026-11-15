// 05 · Comparar con Perseverance — sección simulada. Tres caminos sobre las mismas muestras reales:
//   1) Perseverance real: orden por sol y distancia por odómetro (NASA/JPL waypoints).
//   2) Mismo orden, con nuestro A* (aísla el efecto del CAMINO).
//   3) Orden del NSGA-II (004), con nuestro A* (aísla el efecto del ORDEN).
// Honestidad: el odómetro real incluye recorridos científicos y operativos que no modelamos.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart, OrderFlow } from '../components/Charts.jsx';
import MapView from '../components/MapView.jsx';
import { api } from '../lib/api.js';
import { missionLegs, pickFullMission, realLegs, realOrder, solOf, sum } from '../lib/compare.js';
import { cumulative, formatKm, pointAt } from '../lib/geo.js';
import { WALK_KMH } from '../lib/sim.js';
import { useRegion, useStore } from '../state/store.jsx';

const DEFAULT = ['s1_roubion', 's4_5_salette_coulettes', 's8_9_ha_ahoni_atsa', 's10_11_swift_run_skyland', 's16_kukaklek'];
const COLORS = { real: '#faf9f5', order: 'rgb(70,150,240)', nsga: 'rgb(150,210,255)' };
const PLAY_S = 20; // la animación dura 20 s para el camino más largo

const concat = (legs) => legs.flatMap((l, i) => (i ? (l.coords || []).slice(1) : l.coords || []));
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : 0);

export default function CompareView() {
  const { t } = useStore();
  const region = useRegion();
  const samples = useMemo(
    () =>
      region.pois.features
        .map((f) => ({ id: f.properties.poi_id, name: f.properties.name, sol: f.properties.sol, pos: f.geometry.coordinates }))
        .filter((s) => Number.isFinite(solOf(s)))
        .sort((a, b) => solOf(a) - solOf(b)),
    [region.pois],
  );
  const [sel, setSel] = useState(() => new Set(DEFAULT));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [res, setRes] = useState(null);
  const [tPlay, setTPlay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  const toggle = (id) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else if (next.size < 8) next.add(id);
    setSel(next);
  };

  const run = async () => {
    setError('');
    setRes(null);
    setPlaying(false);
    setTPlay(0);
    const ordered = realOrder(samples.filter((s) => sel.has(s.id)));
    if (!region.traverse?.points) return setError(t('cmp.noTraverse'));
    const real = realLegs(ordered, region.traverse.points);
    // 2) mismo orden, A* por tramo
    const orderLegs = [];
    for (let i = 1; i < ordered.length; i++) {
      setBusy(t('cmp.busyA', { n: i, total: ordered.length - 1 }));
      const r = await api.route({ from: ordered[i - 1].pos, to: ordered[i].pos, preset: 'safe', legacy: true });
      if (!(r.ok && r.data.status === 'ok')) {
        setBusy('');
        return setError(`${ordered[i].name}: ${r.ok ? r.data.reason : r.error.error}`);
      }
      orderLegs.push({ from: ordered[i - 1].id, to: ordered[i].id, distance_m: r.data.distance_m, max_slope_deg: r.data.max_slope_deg, coords: r.data.geometry.coordinates });
    }
    // 3) NSGA-II desde la primera muestra
    setBusy(t('cmp.busyG'));
    const m = await api.missions({ habitat: ordered[0].pos, poiIds: ordered.slice(1).map((s) => s.id) });
    setBusy('');
    if (!m.ok) return setError(m.error.error);
    const best = pickFullMission(m.data.front, ordered.slice(1).map((s) => s.id));
    if (!best) return setError(t('cmp.noFull'));
    const nsgaLegs = missionLegs(best.mission);
    setRes({
      ordered,
      nsgaOrder: [ordered[0].id, ...best.mission.sequence],
      real: { legs: real.legs, total: sum(real.legs) },
      order: { legs: orderLegs, total: sum(orderLegs), maxSlope: Math.max(...orderLegs.map((l) => l.max_slope_deg)) },
      nsga: { legs: nsgaLegs, total: sum(nsgaLegs), maxSlope: Math.max(...nsgaLegs.map((l) => l.max_slope_deg)), ms: m.data.compute_ms },
    });
  };

  // Animación: los tres avanzan a la misma velocidad; el más largo tarda PLAY_S.
  const paths = useMemo(() => {
    if (!res) return null;
    const mk = (legs) => {
      const coords = concat(legs);
      return { coords, cum: cumulative(coords) };
    };
    return { real: mk(res.real.legs), order: mk(res.order.legs), nsga: mk(res.nsga.legs) };
  }, [res]);
  const maxD = res ? Math.max(res.real.total, res.order.total, res.nsga.total) : 1;
  useEffect(() => {
    if (!playing) return undefined;
    let last = performance.now();
    const step = (now) => {
      setTPlay((v) => {
        const nv = Math.min(1, v + (now - last) / 1000 / PLAY_S);
        if (nv >= 1) setPlaying(false);
        return nv;
      });
      last = now;
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const at = (p, total) => {
    if (!p || p.coords.length < 2) return null;
    const pathLen = p.cum[p.cum.length - 1];
    return pointAt(p.coords, p.cum, Math.min(total, tPlay * maxD) * (pathLen / (total || 1)))?.pos;
  };
  const lines = useMemo(
    () =>
      paths
        ? [
            { coords: paths.real.coords, color: COLORS.real, width: 2.5 },
            { coords: paths.order.coords, color: COLORS.order, width: 2.5, dash: true },
            { coords: paths.nsga.coords, color: COLORS.nsga, width: 3.5 },
          ]
        : [],
    [paths],
  );
  const markers = paths
    ? [
        { id: 'real', pos: at(paths.real, res.real.total), cls: 'marker-cmp real' },
        { id: 'nsga', pos: at(paths.nsga, res.nsga.total), cls: 'marker-cmp nsga' },
      ].filter((m) => m.pos)
    : [];
  const fit = useMemo(() => (res ? res.ordered.map((s) => s.pos) : samples.filter((s) => sel.has(s.id)).map((s) => s.pos)), [res, samples, sel]);
  const nameOf = (id) => samples.find((s) => s.id === id)?.name.split(' (')[0] || id;
  const walk = (m) => `${(m / 1000 / WALK_KMH).toFixed(1)} h`;

  return (
    <div className="plan-grid">
      <section className="screen stagger" style={{ '--i': 0 }}>
        <MapView
          region={region}
          layersOn={{ ortho: true, hirise: true, traverse: false, places: false }}
          pois={region.pois}
          selectedPois={sel}
          stops={res ? res.ordered : []}
          extraLines={lines}
          extraMarkers={markers}
          fitTo={fit.length > 1 ? fit : undefined}
          onClick={({ poiId }) => poiId && toggle(poiId)}
        />
        <div className="map-overlay-caption caption">
          <span className="blink" style={{ background: 'var(--orbit-bright)' }} />
          <span style={{ color: 'var(--white)' }}>{t('cmp.title')}</span>
          <span className="tag sim">{t('tag.sim')}</span>
        </div>
        {res && (
          <div className="cmp-legend">
            <span><i style={{ background: COLORS.real }} /> {t('cmp.real')}</span>
            <span><i className="dash" style={{ borderColor: COLORS.order }} /> {t('cmp.order')}</span>
            <span><i style={{ background: COLORS.nsga }} /> {t('cmp.nsga')}</span>
            <button type="button" className="btn" onClick={() => { if (tPlay >= 1) setTPlay(0); setPlaying((p) => !p); }}>
              {playing ? '❚❚' : '▶'} {t('cmp.play')}
            </button>
          </div>
        )}
      </section>

      <aside className="screen side stagger" style={{ '--i': 1 }}>
        <div className="scroll" style={{ flex: 1 }}>
          <div className="step">
            <h3>
              <span className="num">01</span>
              {t('cmp.pick')}
              <span className="caption" style={{ marginLeft: 'auto', letterSpacing: 0 }}>{sel.size}/8</span>
            </h3>
            <p className="note" style={{ margin: 0 }}>{t('cmp.pickNote')}</p>
            <ul className="poi-list">
              {samples.map((s) => (
                <li key={s.id}>
                  <button type="button" aria-pressed={sel.has(s.id)} disabled={!sel.has(s.id) && sel.size >= 8} onClick={() => toggle(s.id)}>
                    <span>{s.name}</span>
                    <span className="dist">sol {s.sol}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {res && (
            <div className="step reveal">
              <h3>
                <span className="num">02</span>
                {t('cmp.results')}
              </h3>
              <div className="kpis">
                <div className="kpi">
                  <div className="caption">{t('cmp.nsga')}</div>
                  <div className="kpi-big" style={{ color: COLORS.nsga }}>{formatKm(res.nsga.total)}</div>
                  <div className="kpi-sub">
                    {t('cmp.planNote')}
                  </div>
                </div>
                <div className="kpi">
                  <div className="caption">{t('cmp.real')}</div>
                  <div className="kpi-big" style={{ color: COLORS.real }}>{formatKm(res.real.total)}</div>
                  <div className="kpi-sub">{t('cmp.odo')}</div>
                </div>
              </div>
              <BarChart
                title={`${t('cmp.kpi.dist')} (km)`}
                fmt={(v) => (v / 1000).toFixed(2)}
                rows={[
                  { label: t('cmp.real'), value: res.real.total, color: COLORS.real },
                  { label: t('cmp.order'), value: res.order.total, color: COLORS.order, dash: true },
                  { label: t('cmp.nsga'), value: res.nsga.total, color: COLORS.nsga },
                ]}
              />
              <BarChart
                title={`${t('cmp.kpi.time')} (h)`}
                fmt={(v) => (v / 1000 / WALK_KMH).toFixed(1)}
                rows={[
                  { label: t('cmp.real'), value: res.real.total, color: COLORS.real },
                  { label: t('cmp.order'), value: res.order.total, color: COLORS.order, dash: true },
                  { label: t('cmp.nsga'), value: res.nsga.total, color: COLORS.nsga },
                ]}
              />
              <BarChart
                title={`${t('cmp.kpi.slope')} (°)`}
                fmt={(v) => v.toFixed(1)}
                rows={[
                  { label: t('cmp.order'), value: res.order.maxSlope, color: COLORS.order, dash: true },
                  { label: t('cmp.nsga'), value: res.nsga.maxSlope, color: COLORS.nsga },
                ]}
              />
              <div className="cmp-flows">
                <OrderFlow title={t('cmp.real')} ids={res.ordered.map((x) => x.id)} nameOf={nameOf} color={COLORS.real} />
                <OrderFlow title={t('cmp.nsga')} ids={res.nsgaOrder} nameOf={nameOf} color={COLORS.nsga} refIds={res.ordered.map((x) => x.id)} />
              </div>
              <details className="cmp-tech">
                <summary className="caption">{t('cmp.tech')}</summary>
                <table className="cmp-table">
                  <thead>
                    <tr><th /><th>{t('m.distance')}</th><th>{t('m.walkTime')}</th><th>{t('m.maxSlope')}</th></tr>
                  </thead>
                  <tbody>
                    <tr><td><i style={{ background: COLORS.real }} />{t('cmp.real')}</td><td>{formatKm(res.real.total)}</td><td>{walk(res.real.total)}</td><td>—</td></tr>
                    <tr><td><i className="dash" style={{ borderColor: COLORS.order }} />{t('cmp.order')}</td><td>{formatKm(res.order.total)}</td><td>{walk(res.order.total)}</td><td>{res.order.maxSlope.toFixed(1)}°</td></tr>
                    <tr><td><i style={{ background: COLORS.nsga }} />{t('cmp.nsga')}</td><td>{formatKm(res.nsga.total)}</td><td>{walk(res.nsga.total)}</td><td>{res.nsga.maxSlope.toFixed(1)}°</td></tr>
                  </tbody>
                </table>
              </details>
              <ul className="explain">
                <li>
                  {res.nsgaOrder.join() === res.ordered.map((s) => s.id).join()
                    ? t('cmp.sameOrder')
                    : t('cmp.whyOrder', {
                        d: formatKm(Math.abs(res.order.total - res.nsga.total)),
                        p: Math.abs(pct(res.nsga.total, res.order.total)),
                        better: res.nsga.total <= res.order.total ? t('cmp.shorter') : t('cmp.longer'),
                      })}
                </li>
                <li>{t('cmp.whyPath', { a: formatKm(res.order.total), b: formatKm(res.real.total) })}</li>
                <li>{t('cmp.speed', { ms: res.nsga.ms })}</li>
              </ul>
              <p className="note cmp-honest">{t('cmp.honest')}</p>
            </div>
          )}
          {error && <div className="step note" style={{ color: 'var(--alert)' }}>{error}</div>}
        </div>
        <div className="step" style={{ borderTop: '1px solid var(--slate-800)', borderBottom: 0 }}>
          <button type="button" className="btn primary block" disabled={sel.size < 3 || !!busy} onClick={run}>
            {busy || (sel.size < 3 ? t('cmp.min') : t('cmp.run'))}
          </button>
        </div>
      </aside>
    </div>
  );
}

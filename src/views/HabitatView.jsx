// 03 · Hábitat — consola de la laptop: mapa en vivo, visor del robot, telemetría, aprobación y bitácora.
import { useEffect, useMemo, useRef, useState } from 'react';
import CaptureModal from '../components/CaptureModal.jsx';
import { AstroPanel, MissionTrack, RobotPanel } from '../components/Gauges.jsx';
import { Icon } from '../components/Icons.jsx';
import { useRadiation } from '../lib/radiation.js';
import SimOverlay from '../components/SimOverlay.jsx';
import { snapshotMap } from '../lib/findings.js';
import { liveVitals } from '../lib/vitals.js';
import MapView from '../components/MapView.jsx';
import Profile from '../components/Profile.jsx';
import LiveCamera from '../components/LiveCamera.jsx';
import Viewfinder from '../components/Viewfinder.jsx';
import { eventText } from '../lib/i18n.js';
import { cardinal, formatClock, formatKm } from '../lib/geo.js';
import { canDetect, ROBOT_LEAD_M, WALKBACK_M, WALK_KMH } from '../lib/sim.js';
import { derive } from '../state/derived.js';
import { useRegion, useStore } from '../state/store.jsx';

const SCALES = [30, 60, 120, 300];

export default function HabitatView({ go }) {
  const { state, dispatch, t, lang } = useStore();
  const region = useRegion();
  const d = derive(state);
  const eva = state.eva;
  const mapApi = useRef(null);
  const [cap, setCap] = useState(null);
  const [tab, setTab] = useState('status');
  const [camSrc, setCamSrc] = useState('live'); // cámara del robot: en vivo (real) o simulada (render 3D)
  const hasPending = !!state.eva?.pending;
  // Cuando el robot propone una ruta nueva, se abre la pestaña de aprobación.
  useEffect(() => {
    if (hasPending) setTab('approval');
  }, [hasPending]);
  const vit = liveVitals(state, d?.slope_deg);
  const rad = useRadiation(state);
  // Encuadre fijo a todos los tramos del plan (memo: no re-encuadrar en cada tick).
  const fit = useMemo(() => state.plan.legs?.flatMap((l) => l.coords), [state.plan.legs]);

  if (!d) {
    return (
      <div className="screen" style={{ height: '100%' }}>
        <div className="empty">
          <div>
            <p className="display" style={{ fontSize: 'var(--headline)' }}>
              {t('nav.habitat')}
            </p>
            <p>{t('hab.noEva')}</p>
            <button type="button" className="btn primary" onClick={() => go('plan')}>
              01 · {t('nav.plan')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ground = eva.route.origin === 'ground';
  const routeColor = ground ? 0xffd28c : 0x96d2ff;
  const alerts = [...vit.astro.alerts, ...vit.robot.alerts, ...(rad ? rad.alerts : [])].filter((a) => a.sev !== 'ok').length;
  const TABS = [
    { id: 'status', icon: 'eva', badge: alerts || null, hot: alerts > 0 },
    { id: 'camera', icon: 'camera' },
    { id: 'leg', icon: 'plan' },
    { id: 'approval', icon: 'alert', badge: eva.pending ? '!' : null, hot: !!eva.pending },
    { id: 'log', icon: 'findings', badge: state.events.length || null },
  ];

  return (
    <div className="hab2">
      <section style={{ '--i': 0 }} className="stagger screen hab-map">
        <MapView
          region={region}
          layersOn={{ ortho: true, hillshade: false, slope: false, traversability: false, traverse: true }}
          habitat={state.plan.habitat}
          walkbackM={WALKBACK_M}
          route={d.ahead}
          routeOrigin={eva.route.origin}
          done={d.done}
          pending={eva.pending?.coords}
          hazards={eva.hazards}
          astro={d.astro.pos}
          robot={d.robot.pos}
          stops={state.plan.stops}
          fitTo={fit}
          apiRef={mapApi}
        />
        <button type="button" className="btn cap-btn" onClick={async () => setCap({ photo: await snapshotMap(mapApi.current) })}>
          <Icon name="camera" size={16} /> {t('cap.btn')}
        </button>
        {cap && <CaptureModal photo={cap.photo} pos={d.astro.pos} simTime_s={state.simTime_s} t={t} onClose={() => setCap(null)} />}
        <div className="map-overlay-caption caption">
          <span className="blink" />
          <span style={{ color: 'var(--white)' }}>{t('nav.habitat')} · SIMULATED</span>
          <span className="tag verified" style={{ color: ground ? 'var(--ground-bright)' : 'var(--orbit-bright)' }}>
            {ground ? t('hab.newRoute') : 'A* · orbital'}
          </span>
        </div>
        <SimOverlay sims={eva.sims} t={t} />
        <div className="hab-controls">
          <button type="button" className="btn" disabled={eva.state === 'done'} onClick={() => dispatch({ type: 'TOGGLE_RUN' })}>
            {state.running ? `❚❚ ${t('hab.pause')}` : `▶ ${t('hab.resume')}`}
          </button>
          <button
            type="button"
            className="btn icon-btn"
            title={t('hab.restart')}
            aria-label={t('hab.restart')}
            onClick={() => {
              // Misma ruta, desde el hábitat: se reinicia la simulación sin volver a planear.
              dispatch({ type: 'RESET' });
              dispatch({ type: 'EVA_START' });
            }}
          >
            ↻
          </button>
          <div className="chips">
            {SCALES.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={state.timeScale === s} onClick={() => dispatch({ type: 'SET_SCALE', timeScale: s })}>
                ×{s}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section style={{ '--i': 1 }} className="stagger screen hab-panel">
        <div className="hab-tabs" role="tablist">
          {TABS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={x.hot ? 'hot' : ''} onClick={() => setTab(x.id)}>
              <Icon name={x.icon} size={18} />
              <span>{t(`habtab.${x.id}`)}</span>
              {x.badge != null && <b className="badge">{x.badge}</b>}
            </button>
          ))}
        </div>

        <div className="hab-tab-body" key={tab}>
          {tab === 'status' && (
            <div className="tab-status">
              <MissionTrack
                t={t}
                progress={eva.progress_m / (eva.route.total || 1)}
                robotProgress={Math.min(1, (eva.progress_m + ROBOT_LEAD_M) / (eva.route.total || 1))}
                legLabel={eva.leg === 'out' ? state.plan.stops[eva.legIndex].name : t('plan.habitat')}
              />
              <div className="tab-status-cards">
                <AstroPanel v={vit.astro} t={t} rad={rad} />
                <RobotPanel v={vit.robot} t={t} rad={rad} />
              </div>
            </div>
          )}

          {tab === 'camera' && (
            <div className="tab-camera">
              <div className="tab-camera-bar chips" role="radiogroup">
                {['live', 'traverse', 'sim'].map((m) => (
                  <button key={m} type="button" className="chip" role="radio" aria-checked={camSrc === m} aria-pressed={camSrc === m} onClick={() => setCamSrc(m)}>
                    {t(`live.src.${m}`)}
                  </button>
                ))}
              </div>
              <div className="tab-camera-view">
                {camSrc !== 'sim' ? (
                  <LiveCamera key={camSrc} mode={camSrc === 'traverse' ? 'traverse' : 'camera'} />
                ) : (
                  <Viewfinder regionId={state.plan.regionId} robot={d.robot} hazards={eva.hazards} route={d.aheadOfRobot} routeColor={routeColor} sol={`T+${formatClock(state.simTime_s)}`} />
                )}
              </div>
              {camSrc === 'sim' && <p className="tab-help">{t('habtab.camera.help')}</p>}
            </div>
          )}

          {tab === 'leg' && (
            <div className="tab-pad scroll">
              <h3 className="tab-title">
                {eva.leg === 'out' ? t('m.legOut') : t('m.legBack')} ·{' '}
                {eva.leg === 'out' ? `${eva.legIndex + 1}/${state.plan.stops.length} ${state.plan.stops[eva.legIndex].name}` : t('plan.habitat')}
              </h3>
              <div className="metrics big">
                <Metric label={t('m.walked')} value={formatKm(eva.walked_m)} />
                <Metric label={t('m.remaining')} value={formatKm(d.remaining_m)} cls={ground ? 'ground' : 'orbit'} />
                <Metric label={t('m.toHabitat')} value={formatKm(d.toHabitat_m)} />
                <Metric label={t('m.heading')} value={`${Math.round(d.astro.bearing)}° ${cardinal(d.astro.bearing, lang)}`} />
                <Metric label={t('m.elev')} value={d.elev_m != null ? `${Math.round(d.elev_m)} m` : '—'} />
                <Metric label={t('m.slope')} value={d.slope_deg != null ? `${d.slope_deg.toFixed(1)}°` : '—'} />
              </div>
              <div className="caption" style={{ margin: '18px 0 6px' }}>{t('habtab.profile')}</div>
              <div style={{ height: 160 }}>
                <Profile profile={eva.route.profile} at_m={eva.progress_m} total_m={eva.route.total} />
              </div>
            </div>
          )}

          {tab === 'approval' && (
            <div className="tab-pad scroll">
              <p className="tab-help">{t('habtab.approval.help')}</p>
              {eva.pending ? (
                <div className="approval big">
                  <div className="caption" style={{ color: 'var(--ground-bright)' }}>{t('hud.pending')}</div>
                  <div className="compare">
                    <Metric label={t(eva.route.origin === 'ground' ? 'hab.curRest' : 'hab.oldRest')} value={formatKm(d.remaining_m)} cls="orbit" />
                    <Metric label={t('hab.newRoute')} value={formatKm(eva.pending.total)} cls="ground" />
                  </div>
                  {/* Costo-beneficio del desvío: metros y minutos extra (a la velocidad de la simulación) y O₂ del tramo nuevo
                      según el modelo metabólico del planificador v4 (Pandolf + Santee a 0.38 g), si la API lo trae. */}
                  <div className="gauge-hint" style={{ marginTop: 8 }}>
                    {t('hab.cost', {
                      m: `${eva.pending.total - d.remaining_m >= 0 ? '+' : '−'}${Math.round(Math.abs(eva.pending.total - d.remaining_m))}`,
                      min: `${eva.pending.total - d.remaining_m >= 0 ? '+' : '−'}${Math.round(Math.abs(eva.pending.total - d.remaining_m) / 1000 / WALK_KMH * 60)}`,
                      kmh: WALK_KMH,
                    })}
                    {eva.pending.o2_l != null && ` · ${t('hab.costO2', { l: Math.round(eva.pending.o2_l) })}`}
                  </div>
                  <button type="button" className="btn approve block" onClick={() => dispatch({ type: 'APPROVE' })}>
                    <span className="pulse-dot" />
                    {t('hab.approve')}
                  </button>
                </div>
              ) : eva.request ? (
                <p className="note">{t('hab.waiting')}</p>
              ) : (
                <div className="empty-mini">{t('habtab.approval.none')}</div>
              )}
              <div className="caption" style={{ margin: '22px 0 8px' }}>{t('habtab.actions')}</div>
              <div className="action-grid">
                <button type="button" className="action" disabled={!canDetect(state)} onClick={() => dispatch({ type: 'ROBOT_DETECT' })}>
                  <Icon name="alert" size={22} />
                  <b>{t('hab.detect')}</b>
                  <span>{t('habtab.detect.help')}</span>
                </button>
                {[
                  ['sep', 'radiation'],
                  ['dust', 'wind'],
                  ['devil', 'devil'],
                ].map(([k, icon]) => {
                  const on = !!eva.sims?.[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`action ${on ? 'danger on' : ''}`}
                      aria-pressed={on}
                      disabled={eva.state === 'done'}
                      onClick={() => dispatch({ type: 'SIM_TOGGLE', kind: k })}
                    >
                      <Icon name={icon} size={22} />
                      <b>{t(on ? `sim.${k}.stop` : `sim.${k}.start`)}</b>
                      <span>{t(`sim.${k}.help`)}</span>
                    </button>
                  );
                })}
                <button type="button" className="action" onClick={() => dispatch({ type: 'RESET' })}>
                  <Icon name="home" size={22} />
                  <b>{t('hab.reset')}</b>
                  <span>{t('habtab.reset.help')}</span>
                </button>
              </div>
            </div>
          )}

          {tab === 'log' && (
            <div className="tab-pad scroll">
              <ul className="log big">
                {[...state.events].reverse().map((e) => (
                  <li key={e.id} className={e.sev}>
                    <span className="time">T+{formatClock(e.t_s)}</span>
                    <span>{eventText(lang, e)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, cls = '' }) {
  return (
    <div className="metric">
      <div className="caption">{label}</div>
      <div className={`value ${cls}`}>{value}</div>
    </div>
  );
}

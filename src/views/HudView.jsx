// 02 · HUD — la tablet del astronauta: mini-mapa que sigue al astronauta (track-up), ruta de regreso,
// alcance de regreso a pie, alertas por color y por voz. Botones táctiles ≥ 44 px.
import { useEffect, useRef, useState } from 'react';
import { Gauge, RadiationReadout } from '../components/Gauges.jsx';
import HabitatChat from '../components/HabitatChat.jsx';
import RobotCamera from '../components/RobotCamera.jsx';
import { parseRobotCommand, robotAvailable, robotCommand } from '../lib/robot.js';
import { useRadiation } from '../lib/radiation.js';
import MapView from '../components/MapView.jsx';
import { liveVitals } from '../lib/vitals.js';
import { eventText } from '../lib/i18n.js';
import { cardinal, formatKm, haversine } from '../lib/geo.js';
import { WALKBACK_M } from '../lib/sim.js';
import { derive } from '../state/derived.js';
import { useRegion, useStore } from '../state/store.jsx';

function hudState(state) {
  if (state.phase !== 'eva') return 'plan';
  const eva = state.eva;
  if (eva.state === 'done') return 'done';
  if (eva.pending) return 'pending';
  if (eva.state === 'hold') return 'hold';
  if (eva.state === 'atGoal') return 'atGoal';
  return 'nominal';
}

export default function HudView() {
  const { state, t, lang, dispatch } = useStore();
  const region = useRegion();
  const d = derive(state);
  const eva = state.eva;
  const [voice, setVoice] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [help, setHelp] = useState(() => {
    try {
      return localStorage.getItem('marswalk.hudHelp') === '1'; // cerrada por defecto: no tapa el mapa ni el estado
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('marswalk.hudHelp', help ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
  }, [help]);
  const spoken = useRef(state.events.length ? state.events[state.events.length - 1].id : 0);
  const mode = hudState(state);
  const vit = liveVitals(state, d?.slope_deg);
  const rad = useRadiation(state);

  // Alertas por voz (Web Speech API, sin red).
  useEffect(() => {
    const last = state.events[state.events.length - 1];
    if (!last || last.id <= spoken.current) return;
    spoken.current = last.id;
    if (!voice || !('speechSynthesis' in window) || last.sev === 'info') return;
    const u = new SpeechSynthesisUtterance(eventText(lang, last));
    u.lang = lang === 'es' ? 'es-MX' : 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [state.events, voice, lang]);

  const rangePct = d ? Math.min(100, (d.toHabitat_m / WALKBACK_M) * 100) : 0;
  const follow = d ? { center: d.astro.pos, bearing: d.astro.bearing, zoom: 13.4, recenter } : null;
  const dist = (a, b) => (a && b ? haversine(a, b) : null);
  const say = (text) => {
    if (!voice || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'es' ? 'es-MX' : 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };
  const approve = () => {
    if (!eva?.pending) return false;
    dispatch({ type: 'APPROVE' });
    return true;
  };
  // Comando de voz/texto local (no pasa por la IA): autorizar la ruta pendiente.
  const onCommand = (text) => {
    const s = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const yes = /(autoriz|aprueb|aprob|confirm|approv|authori[sz])/.test(s);
    const no = /\b(no|cancela|rechaz|deny|reject)\b/.test(s);
    // 1) Autorizar la ruta pendiente gana siempre (es la orden crítica del HUD).
    if (yes && !no) {
      const msg = approve() ? t('chat.approved') : t('chat.nothingPending');
      say(msg);
      return msg;
    }
    // 2) Orden al robot REAL ("turn left", "gira a la izquierda", "alto"): pulso corto por el túnel de la cámara.
    const cmd = robotAvailable() ? parseRobotCommand(text) : null;
    if (!cmd) return null;
    const msg = t(`robot.say.${cmd}`);
    robotCommand(cmd).then((r) => say(r.ok ? msg : t('robot.fail')));
    return `${msg}…`;
  };
  const telemetry = {
    state: mode,
    o2_pct: vit?.astro.o2 ?? null,
    suit_pct: vit?.astro.suit ?? null,
    robot_battery_pct: vit?.robot.battery ?? null,
    remaining_m: d ? Math.round(d.remaining_m) : null,
    to_habitat_m: d ? Math.round(d.toHabitat_m) : null,
    robot_distance_m: d ? Math.round(dist(d.astro.pos, d.robot.pos) ?? 0) : null,
    slope_deg: d?.slope_deg != null ? Math.max(0, Math.abs(d.slope_deg)) : null,
    hazards: eva?.hazards?.length ?? 0,
    pending_kind: eva?.pending ? 'reroute' : null,
    solar_storm: Boolean(rad?.sep),
    leg: eva?.leg ?? null,
  };

  return (
    <div className="hud">
      <div className="tablet stagger">
        <section className="screen">
          {region.status === 'ready' && (
            <MapView
              region={region}
              layersOn={{ ortho: true, hillshade: false, slope: false, traversability: false, traverse: false }}
              habitat={state.plan.habitat}
              walkbackM={WALKBACK_M}
              route={d ? d.ahead : undefined}
              routeOrigin={eva?.route.origin}
              done={d?.done}
              pending={eva?.pending?.coords}
              hazards={eva?.hazards}
              astro={d?.astro.pos}
              robot={d?.robot.pos}
              follow={follow}
              stops={state.plan.stops}
            />
          )}

          <div key={mode} className={`hud-banner ${mode}`} role="status" aria-live="assertive">
            <span className="blink" style={{ background: 'currentColor' }} />
            {t(`hud.${mode}`)}
          </div>

          {d && (
            <div className="hud-panel">
              <div className="hud-card">
                <div className="caption">{eva.leg === 'out' ? t('hud.next') : t('hud.home')}</div>
                <div className="compass" style={{ marginTop: 6 }}>
                  <div className="arrow" aria-hidden="true">
                    ↑
                  </div>
                  <div>
                    <div className={`big ${eva.route.origin === 'ground' ? 'ground' : ''}`}>{formatKm(d.remaining_m)}</div>
                    <div className="caption">
                      {Math.round(d.astro.bearing)}° {cardinal(d.astro.bearing, lang)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="hud-card">
                <div className="caption">
                  {t('hud.range')} <span className="tag verified">DRA 5.0</span>
                </div>
                <div className="big">{formatKm(d.toHabitat_m)}</div>
                <div className="range-bar">
                  <span className={rangePct > 90 ? 'warn' : ''} style={{ width: `${rangePct}%` }} />
                </div>
                <div className="row caption" style={{ marginTop: 6 }}>
                  <span>0</span>
                  <span>{WALKBACK_M / 1000} km</span>
                </div>
              </div>

              <div className="hud-card">
                <Gauge label={t('vit.o2')} value={vit.astro.o2} />
                <Gauge label={t('vit.suit')} value={vit.astro.suit} />
                <Gauge label={`${t('vit.robot')} · ${t('vit.battery')}`} value={vit.robot.battery} />
                {rad && <RadiationReadout rad={rad} t={t} />}
                {[...vit.astro.alerts, ...vit.robot.alerts].filter((a) => a.sev !== 'ok').map((a, i) => (
                  <div key={i} className={`alert-line ${a.sev}`}>! {t(a.key, { n: a.n })}</div>
                ))}
              </div>

              <div className="hud-card">
                <div className="row">
                  <div>
                    <div className="caption">{t('m.elev')}</div>
                    <div className="mono">{d.elev_m != null ? `${Math.round(d.elev_m)} m` : '—'}</div>
                  </div>
                  <div>
                    <div className="caption">{t('m.slope')}</div>
                    <div className="mono">{d.slope_deg != null ? `${d.slope_deg.toFixed(1)}°` : '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <aside className="hud-intro" aria-label={t('hud.title')}>
            <div className="hud-intro-head">
              <b>{t('hud.title')}</b>
              <button type="button" className="hud-help" aria-expanded={help} onClick={() => setHelp((h) => !h)}>
                {help ? t('hud.helpHide') : t('hud.helpShow')}
              </button>
            </div>
            {help && (
              <>
                <p>{t('hud.what')}</p>
                <ul className="hud-legend">
                  <li><i className="lg-astro" />{t('hud.lg.astro')}</li>
                  <li><i className="lg-robot" />{t('hud.lg.robot')}</li>
                  <li><i className="lg-habitat" />{t('hud.lg.habitat')}</li>
                  <li><i className="lg-stop">1</i>{t('hud.lg.stop')}</li>
                  <li><i className="lg-route" />{t('hud.lg.route')}</li>
                  <li><i className="lg-hazard" />{t('hud.lg.hazard')}</li>
                </ul>
              </>
            )}
            <HabitatChat t={t} lang={lang} telemetry={telemetry} onCommand={onCommand} onReply={say} />
            <div className="hud-tools">
              <button type="button" className="btn" aria-pressed={voice} onClick={() => setVoice((v) => !v)}>
                {voice ? t('hud.voiceOn') : t('hud.voiceOff')}
              </button>
              <button type="button" className="btn" disabled={!d} onClick={() => setRecenter((n) => n + 1)}>
                {t('hud.centerMe')}
              </button>
            </div>
          </aside>

          <div className="hud-bottom">
            <RobotCamera t={t} variant="pip" />
            <div className={`hud-do ${rad?.sep ? 'hold' : mode}`}>
              <div className="caption">{t('hud.now')}</div>
              <div className="hud-do-text">{rad?.sep ? t('hud.do.sep') : t(`hud.do.${mode}`)}</div>
              {mode === 'pending' && (
                <button type="button" className="btn approve" onClick={approve}>
                  {t('hud.approve')}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

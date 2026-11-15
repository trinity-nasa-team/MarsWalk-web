// Indicadores de estado (robot y astronauta), sensor de radiación/UV y la pista de la EVA con fotos reales.
import { levelOf } from '../lib/vitals.js';
import { Icon } from './Icons.jsx';

export function Gauge({ label, value, unit = '%', icon, display, level }) {
  const lvl = level || levelOf(value);
  return (
    <div className={`gauge ${lvl}`}>
      <div className="gauge-top">
        <span className="caption gauge-label">
          {icon && <Icon name={icon} size={14} />}
          {label}
        </span>
        <span className="gauge-val">{display ?? `${Math.round(value)}${unit}`}</span>
      </div>
      <div className="gauge-bar" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function Alerts({ list, t }) {
  if (!list.length) return <div className="alert-line ok">{t('vit.allOk')}</div>;
  return list.map((a, i) => (
    <div key={i} className={`alert-line ${a.sev}`}>
      {a.sev !== 'ok' && <Icon name="alert" size={14} />} {t(a.key, a.params || { n: a.n })}
    </div>
  ));
}

// Miniaturas estandarizadas: 256×256 WebP, sujeto centrado, misma gradación y viñeta (sin cargar los GLB).
function CrewCard({ photo, name, sub, pill, level, children }) {
  return (
    <div className={`crew-card ${level}`}>
      <div className="crew-strip">
        <div className="crew-thumb">
          <img src={photo} alt="" width="256" height="256" decoding="async" />
        </div>
        <div className="crew-id" title={sub}>
          <div className="crew-name">{name}</div>
        </div>
        <span className={`pill ${level}`}>{pill}</span>
      </div>
      <div className="crew-body">{children}</div>
    </div>
  );
}

export function RobotPanel({ v, t, rad }) {
  return (
    <CrewCard photo="/img/thumb-rover.webp" name={t('vit.robot')} sub={t('vit.robotRef')} pill={t(`vit.mode.${v.mode}`)} level={v.level}>
      <Gauge icon="battery" label={t('vit.battery')} value={v.battery} />
      {rad && <RadiationReadout rad={rad} t={t} />}
      <Alerts list={[...v.alerts, ...(rad ? rad.alerts : [])]} t={t} />
    </CrewCard>
  );
}

/** Lectura compacta: etiqueta, valor y nivel (verde / ámbar / rojo). */
function Readout({ label, value, unit, level = 'ok', hint }) {
  return (
    <div className={`readout ${level}`} title={hint}>
      <span className="ro-label">{label}</span>
      <span className="ro-value">
        {value}
        {unit && <small> {unit}</small>}
      </span>
    </div>
  );
}

export function AstroPanel({ v, t, rad }) {
  return (
    <CrewCard photo="/img/thumb-astronaut.webp" name={t('vit.astro')} sub={t('vit.astroRef')} pill={t(`vit.level.${v.level}`)} level={v.level}>
      <Gauge icon="o2" label={t('vit.o2')} value={v.o2} />
      <Gauge icon="battery" label={t('vit.suit')} value={v.suit} />
      <div className="readouts">
        <Readout
          label={t('vit.pressureL')}
          value={v.suit_kPa.toFixed(1)}
          unit="kPa"
          level={Math.abs(v.suit_kPa - 29.6) > 1.72 ? 'alert' : 'ok'}
          hint={t('vit.pressureHint')}
        />
        <Readout label={t('vit.co2L')} value={v.co2_mmHg.toFixed(1)} unit="mmHg" level={v.co2Level} hint={t('vit.co2Hint')} />
        <Readout label={t('vit.metL')} value={Math.round(v.met_W)} unit="W" level={v.metLevel} hint={t('vit.metHint')} />
        {rad && (
          <Readout
            label={t('rad.evaDose')}
            value={rad.evaDose_uGy.toFixed(rad.evaDose_uGy < 10 ? 1 : 0)}
            unit="µGy"
            level={rad.doseLevel}
            hint={t('rad.xrayHint', { n: rad.xrays.toFixed(rad.xrays < 1 ? 2 : 1) })}
          />
        )}
      </div>
      <div className="gauge-hint">{t('vit.suitSrc')}</div>
      <Alerts list={v.alerts} t={t} />
    </CrewCard>
  );
}

/** Lectura del sensor de radiación y UV del robot. */
export function RadiationReadout({ rad, t }) {
  const lmst = `${String(Math.floor(rad.lmst)).padStart(2, '0')}:${String(Math.floor((rad.lmst % 1) * 60)).padStart(2, '0')}`;
  return (
    <div className={`rad ${rad.level}`}>
      <div className="rad-head">
        <Icon name="radiation" size={14} /> {t('rad.sensor')}
      </div>
      <div className="readouts">
        <Readout label={t('rad.dose')} value={rad.rate_uGy_h.toFixed(1)} unit="µGy/h" level={rad.sep ? 'alert' : 'ok'} hint={t('rad.src')} />
        <Readout label={t('rad.uv')} value={rad.uvBC.toFixed(1)} unit="W/m²" level={rad.uvRatio > 5 ? 'warn' : 'ok'} hint={t('rad.uvHint', { x: rad.uvRatio.toFixed(1) })} />
        <Readout label="UV-A" value={rad.uvA.toFixed(1)} unit="W/m²" />
        <Readout label={t('rad.tau')} value={rad.tau.toFixed(1)} level={rad.tau >= 2 ? 'warn' : 'ok'} hint={t('rad.tauHint')} />
      </div>
      <div className="uv-scale">
        <span>{t('rad.uvVsEarth', { x: rad.uvRatio.toFixed(1) })}</span>
        <span>{t('rad.lmst')} {lmst}</span>
      </div>
      <div className="uv-bar" aria-hidden="true">
        <span style={{ left: `${rad.uvPct}%` }} />
      </div>
      <div className="gauge-hint">
        {t(rad.sep ? 'rad.srcSep' : 'rad.src')} · {t(`rad.donki.${rad.donki.status}`, { n: rad.donki.events.length, date: rad.donki.asOf?.slice(0, 10) })}
      </div>
      {rad.donki.marsCme !== undefined && (
        <div className="gauge-hint">
          {rad.donki.marsCme
            ? t(rad.donki.marsCme.glancing ? 'rad.marsCmeGlancing' : 'rad.marsCme', { date: rad.donki.marsCme.arrival?.slice(0, 10), n: rad.donki.marsCme30d })
            : t('rad.marsCmeNone')}
        </div>
      )}
    </div>
  );
}

/** Pista de la EVA sobre la foto real de Jezero: hábitat → destino, astronauta y robot por delante. */
export function MissionTrack({ progress, robotProgress, legLabel, t, hazard }) {
  return (
    <div className="track" style={{ backgroundImage: 'url(/img/mars-landscape.jpg)' }}>
      <div className="track-shade" />
      <div className="track-line">
        <span className="track-done" style={{ width: `${progress * 100}%` }} />
        <span className="track-end start">{t('plan.habitat')}</span>
        <span className="track-end goal">{legLabel}</span>
        {hazard != null && <span className="track-hz" style={{ left: `${hazard * 100}%` }} title={t('find.k.hazard')} />}
        <span className="track-dot astro" style={{ left: `${progress * 100}%` }}>
          <span className="lbl">{t('vit.astro')}</span>
        </span>
        <span className="track-dot robot" style={{ left: `${robotProgress * 100}%` }}>
          <span className="lbl">{t('vit.robotShort')}</span>
        </span>
      </div>
    </div>
  );
}

// 04 · Tierra — todo llega tarde: cola «guarda y reenvía» con el retraso de la luz.
import Orbits from '../components/Orbits.jsx';
import { EARTH_DELAY_MAX, EARTH_DELAY_MIN, partitionEarth } from '../lib/delayQueue.js';
import { formatClock } from '../lib/geo.js';
import { eventText } from '../lib/i18n.js';
import { useStore } from '../state/store.jsx';

export default function EarthView() {
  const { state, dispatch, t, lang } = useStore();
  const { inTransit, received } = partitionEarth(state.events, state.simTime_s, state.earthDelay_min);

  return (
    <div className="earth-grid">
      <section className="screen stagger" style={{ '--i': 0 }}>
        <Orbits
          delayMin={state.earthDelay_min}
          packets={inTransit}
          labels={{ sun: t('earth.sun'), earth: t('earth.earth'), mars: t('earth.mars') }}
        />
        <div className="map-overlay-caption caption">
          <span className="blink" style={{ background: 'var(--earth-accent)' }} />
          <span style={{ color: 'var(--white)' }}>{t('earth.title')}</span>
        </div>
        <p className="note" style={{ position: 'absolute', left: 14, bottom: 4, right: 14 }}>
          {t('earth.scheme')}
        </p>
      </section>

      <div className="earth-lists">
        <section className="screen stagger" style={{ '--i': 1 }}>
          <div className="body">
            <div className="row">
              <span className="caption">{t('earth.delay')}</span>
              <span className="mono" style={{ color: 'var(--earth-bright)', fontSize: 20 }}>
                {state.earthDelay_min} min
              </span>
            </div>
            <input
              type="range"
              min={EARTH_DELAY_MIN}
              max={EARTH_DELAY_MAX}
              step={1}
              value={state.earthDelay_min}
              aria-label={t('earth.delay')}
              onChange={(e) => dispatch({ type: 'SET_DELAY', min: Number(e.target.value) })}
            />
            <p className="note" style={{ marginBottom: 0 }}>
              {t('earth.note')}
            </p>
          </div>
        </section>

        <section className="screen scroll stagger" style={{ '--i': 2 }}>
          <header>
            <h2>{t('earth.transit')}</h2>
            <span className="caption">{inTransit.length}</span>
          </header>
          <div className="body">
            {inTransit.length === 0 && <p className="note">{t('earth.empty')}</p>}
            <ul className="packet">
              {inTransit.map((e) => (
                <li key={e.id}>
                  <div className="meta">
                    <span>T+{formatClock(e.t_s)}</span>
                    <span>{t('earth.eta', { min: e.eta_min.toFixed(1) })}</span>
                  </div>
                  {eventText(lang, e)}
                  <div className="bar">
                    <span style={{ width: `${Math.min(100, e.progress * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="screen scroll stagger" style={{ '--i': 3 }}>
          <header>
            <h2>{t('earth.received')}</h2>
            <span className="caption">{received.length}</span>
          </header>
          <div className="body">
            {received.length === 0 && <p className="note">{t('earth.empty')}</p>}
            <ul className="packet">
              {received.map((e) => (
                <li key={e.id}>
                  <div className="meta">
                    <span>T+{formatClock(e.t_s)}</span>
                    <span>{t('earth.age', { min: Math.round(e.age_min) })}</span>
                  </div>
                  {eventText(lang, e)}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

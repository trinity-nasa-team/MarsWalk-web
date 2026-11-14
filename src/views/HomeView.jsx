// Inicio — el menú único, como el boceto: Marte 3D a la izquierda, módulos a la derecha
// y Marte de fondo (escena 3D en HeroScene).
import FloatingAstronaut from '../components/FloatingAstronaut.jsx';
import HeroScene from '../components/HeroScene.jsx';
import { Icon } from '../components/Icons.jsx';
import { useFindings } from '../lib/findings.js';
import { useStore } from '../state/store.jsx';

export const CREDITS = [
  ['Viking MDIM 2.1', 'NASA/JPL/USGS'],
  ['Perseverance 3D', 'NASA/JPL-Caltech'],
  ['PIA23727', 'NASA/JPL-Caltech/ASU/MSSS'],
];

// Datos de Marte (NASA): duración del sol, gravedad superficial, diámetro de Jezero, periodo de Fobos.
const FACTS = [
  ['facts.sol', '24 h 39 min 35 s'],
  ['facts.g', '3.71 m/s²'],
  ['facts.jezero', '45 km'],
  ['facts.phobos', '7.66 h'],
];

export default function HomeView({ go }) {
  const { t, state } = useStore();
  const findings = useFindings();
  const evaOn = state.phase === 'eva';
  const items = [
    { id: 'plan', view: 'plan', icon: 'plan', stat: state.plan.stops.length ? t('home.stat.stops', { n: state.plan.stops.length }) : null },
    { id: 'findings', view: 'findings', icon: 'findings', stat: findings.length ? t('home.stat.findings', { n: findings.length }) : null },
    { id: 'eva', view: 'habitat', icon: 'eva', stat: evaOn ? t('home.stat.live') : null, live: evaOn },
    { id: 'compare', view: 'compare', icon: 'compare', stat: null },
  ];
  return (
    <div className="home home2">
      <HeroScene />
      <div className="home-shade" />

      <div className="home2-grid">
        <div className="home2-left">
          <FloatingAstronaut alt={t('home.astroAlt')} hint={t('home.astroHint')} />
        </div>

        <div className="home2-right">
          <div className="eyebrow">
            <span className="blink" /> {t('site')}
          </div>
          <h1>{t('home.title')}</h1>
          <p className="home2-sub">{t('home.sub')}</p>

          <nav className="mod-list" aria-label={t('nav.menu')}>
            {items.map((c, i) => (
              <button key={c.id} type="button" className="mod" style={{ '--i': i }} onClick={() => go(c.view)}>
                <span className="mod-ico">
                  <Icon name={c.icon} size={24} />
                </span>
                <span className="mod-txt">
                  <span className="mod-ttl">
                    <em>0{i + 1}</em> {t(`home.${c.id}.t`)}
                    {c.stat && <span className={`stat ${c.live ? 'live' : ''}`}>{c.stat}</span>}
                  </span>
                  <span className="mod-dsc">{t(`home.${c.id}.d`)}</span>
                </span>
                <span className="mod-go" aria-hidden="true">→</span>
              </button>
            ))}
          </nav>

          <button type="button" className="btn primary home-cta" onClick={() => go(evaOn ? 'habitat' : 'plan')}>
            {evaOn ? t('home.ctaLive') : t('home.cta')} →
          </button>
        </div>
      </div>

      <div className="home2-foot">
        <div className="facts">
          {FACTS.map(([k, v]) => (
            <div key={k} className="fact">
              <span className="caption">{t(k)}</span>
              <b>{v}</b>
            </div>
          ))}
          <span className="fact-src">NASA</span>
        </div>
        <div className="home-credits">
          {t('home.credits')}: {CREDITS.map(([what, who]) => `${what} — ${who}`).join(' · ')}
        </div>
      </div>
    </div>
  );
}

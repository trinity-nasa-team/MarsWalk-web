// Marswalk: un solo menú de íconos (inicio = menú completo; dentro, riel lateral con los mismos íconos).
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from './components/Icons.jsx';
import Marquee from './components/Marquee.jsx';
import Starfield from './components/Starfield.jsx';
import { formatClock } from './lib/geo.js';
import { useTheme } from './lib/theme.js';
import { derive } from './state/derived.js';
import { useRegion, useStore } from './state/store.jsx';
import CompareView from './views/CompareView.jsx';
import EarthView from './views/EarthView.jsx';
import HabitatView from './views/HabitatView.jsx';
import HudView from './views/HudView.jsx';
import PlanView from './views/PlanView.jsx';
import HomeView from './views/HomeView.jsx';
import FindingsView from './views/FindingsView.jsx';

const VIEWS = [
  { id: 'home', C: HomeView },
  { id: 'plan', C: PlanView },
  { id: 'findings', C: FindingsView },
  { id: 'habitat', C: HabitatView },
  { id: 'hud', C: HudView },
  { id: 'earth', C: EarthView },
  { id: 'compare', C: CompareView },
];
/** Cuatro módulos. La caminata EVA agrupa hábitat, HUD del astronauta y enlace con la Tierra. */
export const MODULES = [
  { id: 'plan', icon: 'plan', views: ['plan'] },
  { id: 'findings', icon: 'findings', views: ['findings'] },
  { id: 'eva', icon: 'eva', views: ['habitat', 'hud', 'earth'] },
  { id: 'compare', icon: 'compare', views: ['compare'] },
];
const EVA_TABS = ['habitat', 'hud', 'earth'];

function useHashView() {
  const read = () => {
    const h = window.location.hash.replace('#', '');
    return VIEWS.some((v) => v.id === h) ? h : 'home';
  };
  const [view, setView] = useState(read);
  useEffect(() => {
    // Cambio de vista con View Transitions (si el navegador lo soporta y no hay «reducir movimiento»).
    const on = () => {
      const next = read();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.startViewTransition && !reduce) document.startViewTransition(() => flushSync(() => setView(next)));
      else setView(next);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (id) => {
    window.location.hash = id;
  };
  return [view, go];
}

// La pantalla de entrada solo en la primera visita de la sesión (017: se sentía lento repetirla).
const showLanding = (() => {
  try {
    if (sessionStorage.getItem('marswalk.landing')) return false;
    sessionStorage.setItem('marswalk.landing', '1');
  } catch {
    /* almacenamiento bloqueado: se muestra */
  }
  return true;
})();

export default function App() {
  const { state, t, lang, setLang } = useStore();
  const region = useRegion();
  const [view, go] = useHashView();
  const [theme, toggleTheme] = useTheme();
  const d = derive(state);
  const status = state.phase === 'plan' ? 'plan' : d.status;
  const Current = VIEWS.find((v) => v.id === view).C;

  return (
    <>
      <Starfield />
      {showLanding && (
      <div className="landing" aria-hidden="true">
        <div className="inner">
          <div className="display">Marswalk</div>
          <div className="caption">
            <span className="blink" />
            {t('site')}
          </div>
        </div>
      </div>
      )}
      <div className="shell">
        <header className="topbar">
          <button type="button" className="brand" onClick={() => go('home')} aria-label={t('nav.home')}>
            <span className="display">Marswalk</span>
            <span className="caption">
              {state.plan.regionId === 'jezero' || !state.plan.habitat
                ? t('site')
                : `${t('site.custom')} · ${state.plan.habitat[1].toFixed(2)}° ${state.plan.habitat[1] >= 0 ? 'N' : 'S'} ${state.plan.habitat[0].toFixed(2)}° E`}
            </span>
          </button>
          <div className="topright">
            <div className={`status caption ${status}`}>
              <span className="blink" />
              <span>{t(`status.${status}`)}</span>
            </div>
            <div className="clock">
              <div className="caption">{t('clock.label')}</div>
              <div className="value">{formatClock(state.simTime_s)}</div>
            </div>
            <button
              type="button"
              className="theme-btn"
              onClick={toggleTheme}
              aria-label={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
              title={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.2" fill="currentColor" />
                  <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" fill="currentColor" />
                </svg>
              )}
            </button>
            <div className="lang" role="group" aria-label="language">
              {['es', 'en'].map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className={`body-row ${view === 'home' ? 'no-rail' : ''}`}>
          {view !== 'home' && (
            <nav className="rail" aria-label={t('nav.menu')}>
              <button type="button" className="rail-btn" onClick={() => go('home')}>
                <Icon name="home" />
                <span>{t('nav.home')}</span>
              </button>
              <span className="rail-sep" />
              {MODULES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="rail-btn"
                  aria-current={m.views.includes(view) ? 'page' : undefined}
                  onClick={() => go(m.views[0])}
                >
                  <Icon name={m.icon} />
                  <span>{t(`mod.${m.id}`)}</span>
                </button>
              ))}
            </nav>
          )}
          <main className={`view ${EVA_TABS.includes(view) ? 'with-tabs' : ''}`} key={view}>
            {region.status === 'error' && <div className="banner-error">{t('api.down')}</div>}
            {EVA_TABS.includes(view) && (
              <div className="subtabs" role="tablist">
                {EVA_TABS.map((v) => (
                  <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => go(v)}>
                    <Icon name={v} size={18} />
                    {t(`tab.${v}`)}
                  </button>
                ))}
              </div>
            )}
            {region.status === 'ready' && <Current go={go} />}
          </main>
        </div>
        <Marquee />
      </div>
    </>
  );
}

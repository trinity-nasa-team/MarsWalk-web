// Marquesina de eventos [CoM]: los últimos eventos de la EVA corriendo en la barra inferior.
import { useStore } from '../state/store.jsx';
import { eventText } from '../lib/i18n.js';
import { formatClock } from '../lib/geo.js';

export default function Marquee() {
  const { state, lang, t } = useStore();
  const items = state.events.slice(-8).reverse();
  const list = items.length
    ? items.map((e) => ({ id: e.id, sev: e.sev, text: `T+${formatClock(e.t_s)} · ${eventText(lang, e)}` }))
    : [{ id: 0, sev: 'info', text: `${t('site')} · ${t('brand.sub')}` }];
  // Se duplica la lista para que la traslación de −50% sea continua.
  const doubled = [...list, ...list];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="track">
        {doubled.map((it, i) => (
          <span key={`${it.id}-${i}`} className={`item ${it.sev}`}>
            {it.text}
          </span>
        ))}
      </div>
    </div>
  );
}

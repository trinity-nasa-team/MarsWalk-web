// Buscador de lugares de todo Marte: Zonas de Exploración (NASA 2015) y nombres oficiales IAU.
import { useMemo, useState } from 'react';
import { useRegion, useStore } from '../state/store.jsx';

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function PlaceSearch({ onPick }) {
  const { t } = useStore();
  const region = useRegion();
  const [q, setQ] = useState('');
  const items = useMemo(() => {
    if (!region.mars) return [];
    return [
      ...region.mars.exploration_zones.map((z) => ({ ...z, kind: 'ez', type: t('search.ez') })),
      ...region.mars.nomenclature.map((n) => ({ ...n, kind: 'iau' })),
    ];
  }, [region.mars, t]);
  const results = useMemo(() => {
    const k = norm(q.trim());
    if (k.length < 2) return [];
    return items.filter((p) => norm(p.name).includes(k)).slice(0, 8);
  }, [q, items]);

  return (
    <div className="place-search">
      <input
        type="search"
        value={q}
        placeholder={region.mars ? t('search.ph', { n: items.length }) : t('search.loading')}
        disabled={!region.mars}
        onChange={(e) => setQ(e.target.value)}
        aria-label={t('search.ph', { n: items.length })}
      />
      {results.length > 0 && (
        <ul>
          {results.map((p) => (
            <li key={`${p.kind}-${p.name}-${p.lat}`}>
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  onPick(p);
                }}
              >
                <span className={`dot ${p.kind}`} />
                <span>{p.name}</span>
                <span className="caption">
                  {p.type} · {p.lat.toFixed(1)}°, {p.lon.toFixed(1)}° E
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

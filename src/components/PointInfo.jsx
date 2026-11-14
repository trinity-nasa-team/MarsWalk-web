// Ficha de un punto cualquiera de Marte: geología (USGS SIM 3292, en vivo), tipo de superficie (THEMIS IR
// nocturno, lectura cualitativa), terreno de nuestra API si está dentro de Jezero, sitio de Perseverance más
// cercano y distancia al hábitat. Todo el texto externo se inserta como texto (React escapa).
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatKm, haversine } from '../lib/geo.js';
import { queryGeology, samplePixel, surfaceFromThemis } from '../lib/marsTiles.js';
import { WALKBACK_M } from '../lib/sim.js';
import { useRegion, useStore } from '../state/store.jsx';

const TRAV = { 0: 'trav.safe', 1: 'trav.risk', 2: 'trav.blocked' };

export default function PointInfo({ pos, feature, habitat, onAdd, onClose, canAdd, regionId = 'jezero', regionBbox, onSetHabitat, settingHabitat }) {
  const { t } = useStore();
  const region = useRegion();
  const [info, setInfo] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    setInfo({ loading: true });
    const [lon, lat] = pos;
    // Zona con relieve para rutas: el sitio activo, o la malla de Jezero (bbox de sus capas).
    const [w, s, e, n] = regionBbox || region.layers[0]?.bbox || region.bbox;
    const inside = lon >= w && lon <= e && lat >= s && lat <= n;
    Promise.all([
      queryGeology(lon, lat),
      samplePixel('themis', lon, lat, 9),
      inside ? api.cell(lat, lon, regionId) : Promise.resolve(null),
    ]).then(([geo, themis, cell]) => {
      if (!alive) return;
      let nearest = null;
      for (const f of region.pois.features) {
        const d = haversine(pos, f.geometry.coordinates);
        if (!nearest || d < nearest.d) nearest = { d, p: f.properties };
      }
      setInfo({ loading: false, geo, themis, surface: surfaceFromThemis(themis), cell: cell?.ok ? cell.data : null, inside, nearest });
    });
    return () => {
      alive = false;
    };
  }, [pos, region, regionId, regionBbox]);

  const toHab = habitat ? haversine(habitat, pos) : null;
  const inRange = toHab != null && toHab <= WALKBACK_M;

  return (
    <div className="point-info">
      <header>
        <span className="caption" style={{ color: 'var(--white)' }}>
          {t('pi.title')}
        </span>
        <button type="button" className="pi-close" aria-label="×" onClick={onClose}>
          ×
        </button>
      </header>
      {feature && (
        <div className="pi-name">
          <strong>{feature.name}</strong>
          <span className="pi-src">{feature.kind === 'ez' ? t('search.ez') : feature.type || 'IAU'}</span>
        </div>
      )}
      <div className="mono pi-coords">
        {pos[1].toFixed(4)}° N · {pos[0].toFixed(4)}° E
      </div>
      {info.loading ? (
        <p className="note">{t('pi.loading')}</p>
      ) : (
        <dl>
          <dt>{t('pi.geology')}</dt>
          <dd>
            {info.geo ? (
              <>
                <strong>{info.geo.unit}</strong> · {info.geo.desc}
              </>
            ) : (
              t('pi.noData')
            )}
            <span className="pi-src">USGS SIM 3292 · 1:20 M</span>
          </dd>

          <dt>{t('pi.surface')}</dt>
          <dd>
            {info.surface ? t(`pi.surface.${info.surface}`) : t('pi.noData')}
            {info.themis != null && <span className="pi-src">THEMIS IR noche · {t('pi.brightness', { v: info.themis })} · {t('pi.qualitative')}</span>}
          </dd>

          {info.inside && info.cell && (
            <>
              <dt>{t('pi.terrain')}</dt>
              <dd>
                {Math.round(info.cell.elevation_m)} m · {info.cell.slope_deg?.toFixed(1)}° ·{' '}
                {info.cell.traversability != null ? t(TRAV[info.cell.traversability]) : '—'}
                <span className="pi-src">{regionId === 'jezero' ? 'CTX DEM 30 m (USGS)' : 'MOLA–HRSC 200 m (USGS)'}</span>
              </dd>
            </>
          )}
          {!info.inside && (
            <>
              <dt>{t('pi.terrain')}</dt>
              <dd className="note">{t('pi.outside')}</dd>
            </>
          )}

          {info.nearest && (
            <>
              <dt>{t('pi.nearest')}</dt>
              <dd>
                {info.nearest.p.name} · {formatKm(info.nearest.d)}
                <span className="pi-src">
                  {info.nearest.p.sample_type} · {info.nearest.p.rock_type} · sol {info.nearest.p.sol}
                </span>
              </dd>
            </>
          )}

          {toHab != null && (
            <>
              <dt>{t('pi.toHabitat')}</dt>
              <dd style={{ color: inRange ? 'var(--orbit-bright)' : 'var(--alert)' }}>
                {formatKm(toHab)} · {inRange ? t('pi.inRange') : t('pi.outRange')}
              </dd>
            </>
          )}
        </dl>
      )}
      <div className="pi-actions">
        {canAdd && inRange && info.inside && (
          <button type="button" className="btn primary block" onClick={onAdd}>
            + {t('pi.add')}
          </button>
        )}
        {onSetHabitat && (
          <button type="button" className="btn block" disabled={settingHabitat} onClick={onSetHabitat}>
            {settingHabitat ? t('pi.building') : `⌂ ${t('pi.setHabitat')}`}
          </button>
        )}
      </div>
    </div>
  );
}

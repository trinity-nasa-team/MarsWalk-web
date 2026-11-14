// Hallazgos — galería de campo: fotos, notas, peligros, muestras y errores guardados desde Rutas y la EVA.
import { useMemo, useState } from 'react';
import { KINDS, removeFinding, updateFinding, useFindings } from '../lib/findings.js';
import { useStore } from '../state/store.jsx';

const ICON = { note: '📝', sample: '🧪', hazard: '⚠️', mistake: '❌' };

export default function FindingsView({ go }) {
  const { t, lang } = useStore();
  const all = useFindings();
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const list = useMemo(
    () => all.filter((f) => filter === 'all' || (filter === 'star' ? f.star : f.kind === filter)),
    [all, filter],
  );
  const sel = all.find((f) => f.id === open);
  const fmt = (ts) => new Date(ts).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="find screen">
      <header>
        <h2>
          {t('nav.findings')} <span className="caption">{all.length}</span>
        </h2>
        <div className="chips">
          {['all', ...KINDS, 'star'].map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k === 'all' ? t('find.all') : k === 'star' ? '★' : `${ICON[k]} ${t(`find.k.${k}`)}`}
            </button>
          ))}
        </div>
      </header>

      {all.length === 0 ? (
        <div className="empty">
          <div>
            <p className="display" style={{ fontSize: 'var(--headline)' }}>{t('nav.findings')}</p>
            <p>{t('find.empty')}</p>
            <button type="button" className="btn primary" onClick={() => go('plan')}>
              {t('find.goPlan')}
            </button>
          </div>
        </div>
      ) : (
        <div className="find-grid scroll">
          {list.map((f) => (
            <article key={f.id} className={`find-card ${f.kind}`}>
              <button type="button" className="thumb" onClick={() => setOpen(f.id)} aria-label={t('find.open')}>
                {f.photo ? <img src={f.photo} alt="" /> : <span className="noimg">{ICON[f.kind]}</span>}
              </button>
              <div className="meta">
                <div className="row">
                  <span className={`pill ${f.kind}`}>{ICON[f.kind]} {t(`find.k.${f.kind}`)}</span>
                  <button type="button" className={`star ${f.star ? 'on' : ''}`} aria-pressed={f.star} aria-label="★" onClick={() => updateFinding(f.id, { star: !f.star })}>
                    ★
                  </button>
                </div>
                <p className="note-text">{f.note || t('find.noNote')}</p>
                <div className="caption">
                  {fmt(f.ts)}
                  {f.pos ? ` · ${f.pos[1].toFixed(3)}° N ${f.pos[0].toFixed(3)}° E` : ''}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {sel && (
        <div className="modal-back" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {sel.photo && <img src={sel.photo} alt="" />}
            <p>{sel.note || t('find.noNote')}</p>
            <div className="row">
              <button type="button" className="btn" onClick={() => { removeFinding(sel.id); setOpen(null); }}>
                {t('find.delete')}
              </button>
              <button type="button" className="btn primary" onClick={() => setOpen(null)}>
                {t('find.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

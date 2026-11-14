// Captura de imagen + notas → se guarda en Hallazgos.
import { useState } from 'react';
import { addFinding, KINDS } from '../lib/findings.js';

const ICON = { note: '📝', sample: '🧪', hazard: '⚠️', mistake: '❌' };

export default function CaptureModal({ photo, pos, simTime_s = null, t, onClose, onSaved }) {
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('note');
  const [star, setStar] = useState(false);
  const save = () => {
    addFinding({ photo, pos, simTime_s, note: note.trim(), kind, star });
    onSaved?.();
    onClose();
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('cap.title')}>
        <h3 className="display" style={{ fontSize: 'var(--headline)', margin: 0 }}>{t('cap.title')}</h3>
        {photo ? <img src={photo} alt="" /> : <p className="note">{t('cap.nophoto')}</p>}
        <div className="chips">
          {KINDS.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {ICON[k]} {t(`find.k.${k}`)}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={star} onClick={() => setStar((s) => !s)}>★</button>
        </div>
        <textarea
          autoFocus
          rows={4}
          value={note}
          placeholder={t('cap.placeholder')}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>{t('cap.cancel')}</button>
          <button type="button" className="btn primary" onClick={save}>{t('cap.save')}</button>
        </div>
      </div>
    </div>
  );
}

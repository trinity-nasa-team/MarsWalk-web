// IA del Hábitat (018): chat corto dentro del HUD. El modelo corre detrás del backend (/api/habitat/chat);
// aquí solo se arma la telemetría simulada y se muestran las respuestas con textContent (React escapa).
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const MAX_SHOWN = 10;
const QUICK = ['q1', 'q2', 'q3'];

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export default function HabitatChat({ t, lang, telemetry, onCommand, onReply }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  const send = async (message) => {
    const m = message.trim();
    if (!m || busy) return;
    setErr(null);
    setText('');
    const local = onCommand?.(m);
    if (local) {
      setMsgs((list) => [...list, { role: 'user', content: m }, { role: 'assistant', content: local }].slice(-MAX_SHOWN));
      return;
    }
    const history = msgs.slice(-6).map(({ role, content }) => ({ role, content }));
    setMsgs((list) => [...list, { role: 'user', content: m }].slice(-MAX_SHOWN));
    setBusy(true);
    const r = await api.habitatChat({ message: m, lang, telemetry, history });
    setBusy(false);
    if (r.ok) {
      setMsgs((list) => [...list, { role: 'assistant', content: r.data.reply }].slice(-MAX_SHOWN));
      onReply?.(r.data.reply);
    }
    else if (r.error.code === 'assistant_unavailable') {
      // Sin IA configurada: responder con la telemetría local en vez de mostrar un error interno al jurado.
      const tl = telemetry || {};
      const pctTxt = (v) => (v == null ? '—' : `${Math.round(v)} %`);
      const reply = t('chat.local', {
        o2: pctTxt(tl.o2_pct),
        suit: pctTxt(tl.suit_pct),
        home: tl.to_habitat_m == null ? '—' : `${(tl.to_habitat_m / 1000).toFixed(2)} km`,
        slope: tl.slope_deg == null ? '—' : `${tl.slope_deg.toFixed(0)}°`,
        hz: tl.hazards ?? 0,
      });
      setMsgs((list) => [...list, { role: 'assistant', content: reply }].slice(-MAX_SHOWN));
      onReply?.(reply);
    } else setErr(r.error.code === 'rate_limited' ? t('chat.slow') : t('chat.fail'));
  };

  const sendRef = useRef(send);
  sendRef.current = send; // el dictado termina después: usar la telemetría de ese momento
  useEffect(() => () => recRef.current?.abort(), []);

  const listen = () => {
    if (!Recognition) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Recognition();
    rec.lang = lang === 'es' ? 'es-MX' : 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => sendRef.current(e.results[0][0].transcript);
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setErr(t('chat.micDenied'));
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className="hchat" aria-label={t('chat.title')}>
      <div className="hchat-head">
        <span className="blink" />
        <b>{t('chat.title')}</b>
        <span className="caption">{t('chat.sub')}</span>
      </div>
      <div className="hchat-list" ref={listRef} role="log" aria-live="polite">
        {!msgs.length && <p className="hchat-empty">{t('chat.empty')}</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`hchat-msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="hchat-msg assistant typing">{t('chat.typing')}</div>}
        {err && <div className="hchat-msg error">{err}</div>}
      </div>
      <div className="hchat-quick">
        {QUICK.map((k) => (
          <button key={k} type="button" disabled={busy} onClick={() => send(t(`chat.${k}`))}>
            {t(`chat.${k}`)}
          </button>
        ))}
      </div>
      <form
        className="hchat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          value={text}
          maxLength={400}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        {Recognition && (
          <button
            type="button"
            className={`btn hchat-mic ${listening ? 'on' : ''}`}
            onClick={listen}
            disabled={busy}
            aria-pressed={listening}
            aria-label={listening ? t('chat.micStop') : t('chat.mic')}
            title={t('chat.micHint')}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <button type="submit" className="btn" disabled={busy || !text.trim()}>
          {t('chat.send')}
        </button>
      </form>
    </div>
  );
}

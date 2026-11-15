// Chat del HUD con asistente de voz tipo «Cortana» (backend /api/assistant/*, Groq):
// - Voz: el micrófono GRABA audio (clic para empezar, clic para terminar o 8 s) → el backend lo transcribe y
//   lo traduce a inglés (Whisper) y lo interpreta (LLM): orden al robot o respuesta a una pregunta general.
// - Texto: mismo análisis con /api/assistant/text.
// - En pantalla todo va en INGLÉS: la frase del usuario traducida y la respuesta.
// - "Autoriza la ruta" (onCommand) gana siempre. Si el asistente no está disponible se usa el respaldo local
//   (reglas del robot y la IA del hábitat de antes). Los textos se muestran con textContent (React escapa).
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { blobToBase64, pickRecorderMime } from '../lib/voice.js';

const MAX_SHOWN = 10;
const QUICK = ['q1', 'q2', 'q3'];
const MAX_REC_MS = 8000;

const canRecord = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export default function HabitatChat({ t, lang, telemetry, onCommand, onAssistant, onFallback, onReply }) {
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

  const push = (...items) => setMsgs((list) => [...list, ...items].slice(-MAX_SHOWN));
  const history = () => msgs.slice(-6).map(({ role, content }) => ({ role, content }));

  /** Resultado del asistente (voz o texto): la frase en inglés y su respuesta; si hay orden, la ejecuta el HUD. */
  const showAssistant = (data) => {
    const local = onCommand?.(data.heard_en); // "Authorize the new route" dicho en cualquier idioma
    if (local) {
      push({ role: 'user', content: data.heard_en }, { role: 'assistant', content: local });
      return;
    }
    push({ role: 'user', content: data.heard_en }, { role: 'assistant', content: data.reply_en });
    onAssistant?.(data);
  };

  /** Respaldo sin asistente: reglas locales del robot y, si no, la IA del hábitat de antes. */
  const fallback = async (m) => {
    const robot = onFallback?.(m);
    if (robot) {
      push({ role: 'user', content: m }, { role: 'assistant', content: robot });
      return;
    }
    push({ role: 'user', content: m });
    const r = await api.habitatChat({ message: m, lang, telemetry, history: history() });
    if (r.ok) {
      push({ role: 'assistant', content: r.data.reply });
      onReply?.(r.data.reply);
    } else if (r.error.code === 'assistant_unavailable') {
      const tl = telemetry || {};
      const pctTxt = (v) => (v == null ? '—' : `${Math.round(v)} %`);
      const reply = t('chat.local', {
        o2: pctTxt(tl.o2_pct),
        suit: pctTxt(tl.suit_pct),
        home: tl.to_habitat_m == null ? '—' : `${(tl.to_habitat_m / 1000).toFixed(2)} km`,
        slope: tl.slope_deg == null ? '—' : `${tl.slope_deg.toFixed(0)}°`,
        hz: tl.hazards ?? 0,
      });
      push({ role: 'assistant', content: reply });
      onReply?.(reply);
    } else setErr(r.error.code === 'rate_limited' ? t('chat.slow') : t('chat.fail'));
  };

  const send = async (message) => {
    const m = message.trim();
    if (!m || busy) return;
    setErr(null);
    setText('');
    const local = onCommand?.(m);
    if (local) {
      push({ role: 'user', content: m }, { role: 'assistant', content: local });
      return;
    }
    setBusy(true);
    const r = await api.assistantText({ message: m, history: history() });
    if (r.ok) showAssistant(r.data);
    else if (r.error.code === 'rate_limited') setErr(t('chat.slow'));
    else await fallback(m);
    setBusy(false);
  };

  const sendVoice = async (blob, mime) => {
    setErr(null);
    setBusy(true);
    const audio_b64 = await blobToBase64(blob);
    const r = await api.assistantVoice({ audio_b64, mime, history: history() });
    setBusy(false);
    if (r.ok) showAssistant(r.data);
    else if (r.error.code === 'no_speech') setErr(t('chat.noSpeech'));
    else if (r.error.code === 'rate_limited') setErr(t('chat.slow'));
    else setErr(t('chat.voiceFail'));
  };

  useEffect(() => () => recRef.current?.stop?.(), []);

  const listen = async () => {
    if (!canRecord || busy) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    setErr(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErr(t('chat.micDenied'));
      return;
    }
    const { recorderMime, apiMime } = pickRecorderMime(window.MediaRecorder);
    const rec = new window.MediaRecorder(stream, recorderMime ? { mimeType: recorderMime } : undefined);
    const chunks = [];
    const timer = setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_REC_MS);
    rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
    rec.onstop = () => {
      clearTimeout(timer);
      stream.getTracks().forEach((tr) => tr.stop());
      setListening(false);
      const blob = new Blob(chunks, { type: apiMime });
      if (blob.size > 1000) sendVoice(blob, apiMime);
      else setErr(t('chat.noSpeech'));
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
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
        {listening && <div className="hchat-msg assistant typing">{t('chat.recording')}</div>}
        {busy && <div className="hchat-msg assistant typing">{t('chat.typing')}</div>}
        {err && <div className="hchat-msg error">{err}</div>}
      </div>
      <div className="hchat-quick">
        {QUICK.map((k) => (
          <button key={k} type="button" disabled={busy || listening} onClick={() => send(t(`chat.${k}`))}>
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
          disabled={busy || listening}
        />
        {canRecord && (
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
        <button type="submit" className="btn" disabled={busy || listening || !text.trim()}>
          {t('chat.send')}
        </button>
      </form>
    </div>
  );
}

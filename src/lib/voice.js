// Utilidades del micrófono del asistente: formato de grabación compatible y audio → base64 para la API.

// Formatos que acepta el backend (/api/assistant/voice) y que Whisper entiende.
const CANDIDATES = [
  ['audio/webm;codecs=opus', 'audio/webm'], // Chrome, Edge, Firefox
  ['audio/webm', 'audio/webm'],
  ['audio/ogg;codecs=opus', 'audio/ogg'],
  ['audio/mp4', 'audio/mp4'], // Safari
];

/** Elige el formato de grabación que el navegador soporte. { recorderMime, apiMime }. */
export function pickRecorderMime(Recorder) {
  const ok = (m) => {
    try {
      return !!Recorder?.isTypeSupported?.(m);
    } catch {
      return false;
    }
  };
  const hit = CANDIDATES.find(([m]) => ok(m));
  return hit ? { recorderMime: hit[0], apiMime: hit[1] } : { recorderMime: '', apiMime: 'audio/webm' };
}

/** Blob de audio → base64 sin el prefijo "data:...;base64,". */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

import { describe, expect, it } from 'vitest';
import { blobToBase64, pickRecorderMime } from '../src/lib/voice.js';

describe('micrófono del asistente', () => {
  it('elige un formato que el backend acepta', () => {
    const chrome = { isTypeSupported: (m) => m.startsWith('audio/webm') };
    expect(pickRecorderMime(chrome)).toEqual({ recorderMime: 'audio/webm;codecs=opus', apiMime: 'audio/webm' });
    const safari = { isTypeSupported: (m) => m === 'audio/mp4' };
    expect(pickRecorderMime(safari)).toEqual({ recorderMime: 'audio/mp4', apiMime: 'audio/mp4' });
    expect(pickRecorderMime(undefined)).toEqual({ recorderMime: '', apiMime: 'audio/webm' });
  });

  it('convierte el audio a base64 sin prefijo', async () => {
    const b64 = await blobToBase64(new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'audio/webm' }));
    expect(b64).toBe('AQID+g==');
  });
});

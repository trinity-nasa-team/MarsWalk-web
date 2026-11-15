// Cliente del servicio local de rocas (MarsWalk-v3/scripts/rock_service.py: Grounding DINO + SAM en la GPU del equipo).
// Va por el proxy /rocks de Vite (mismo origen: sin CORS). No corre en el navegador ni en la Raspberry.

/** ¿Está encendido el servicio? Lanza si no responde. */
export async function rocksHealth(signal) {
  const r = await fetch('/rocks/health', { signal, cache: 'no-store' });
  if (!r.ok) throw new Error(`rocks_health_${r.status}`);
  return r.json();
}

/**
 * Manda un cuadro (canvas o imagen) al servicio y devuelve { bitmap, n, share, ms }.
 * mode: 'fast' (una pasada) | 'full' (mosaico 3×3, más rocas y más lento).
 */
export async function analyzeRocks(source, mode, signal, maxWidth = 640) {
  const w0 = source.width || source.naturalWidth;
  const h0 = source.height || source.naturalHeight;
  const k = Math.min(1, maxWidth / w0);
  const grab = document.createElement('canvas');
  grab.width = Math.round(w0 * k);
  grab.height = Math.round(h0 * k);
  grab.getContext('2d').drawImage(source, 0, 0, grab.width, grab.height);
  const blob = await new Promise((resolve) => grab.toBlob(resolve, 'image/jpeg', 0.85));
  const res = await fetch(`/rocks/analyze?mode=${mode === 'full' ? 'full' : 'fast'}`, { method: 'POST', body: blob, signal });
  if (!res.ok) throw new Error(`rocks_analyze_${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  return {
    bitmap,
    n: Number(res.headers.get('X-Rock-Count')),
    share: Number(res.headers.get('X-Rock-Share')),
    ms: Number(res.headers.get('X-Ms')),
  };
}

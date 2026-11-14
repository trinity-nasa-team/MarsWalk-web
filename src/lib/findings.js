// Hallazgos: fotos, notas, peligros y muestras guardados en campo. Persisten en localStorage del navegador.
import { useSyncExternalStore } from 'react';

const KEY = 'marswalk.findings';
export const KINDS = ['note', 'sample', 'hazard', 'mistake'];

let items = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
})();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // cuota llena: reintenta sin fotos antiguas para no perder las notas
    try {
      localStorage.setItem(KEY, JSON.stringify(items.map((f, i) => (i < items.length - 3 ? { ...f, photo: null } : f))));
    } catch {
      /* solo en memoria */
    }
  }
  listeners.forEach((l) => l());
}

export function addFinding(f) {
  items = [{ id: `f${Date.now()}`, ts: Date.now(), star: false, photo: null, pos: null, ...f }, ...items];
  persist();
}
export function updateFinding(id, patch) {
  items = items.map((f) => (f.id === id ? { ...f, ...patch } : f));
  persist();
}
export function removeFinding(id) {
  items = items.filter((f) => f.id !== id);
  persist();
}

export function useFindings() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
  );
}

/** Foto del mapa actual (JPEG reducido). Devuelve null si el lienzo no se puede leer. */
export function snapshotMap(map, maxW = 720) {
  return new Promise((resolve) => {
    if (!map) return resolve(null);
    map.once('render', () => {
      try {
        const c = map.getCanvas();
        const k = Math.min(1, maxW / c.width);
        const o = document.createElement('canvas');
        o.width = Math.round(c.width * k);
        o.height = Math.round(c.height * k);
        o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
        resolve(o.toDataURL('image/jpeg', 0.7));
      } catch {
        resolve(null);
      }
    });
    map.triggerRepaint();
  });
}

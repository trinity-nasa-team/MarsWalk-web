// Tema claro / oscuro. Se guarda en localStorage y se aplica como data-theme en <html> antes del primer render.
import { useCallback, useState } from 'react';

const KEY = 'marswalk.theme';

export function readTheme() {
  const q = new URLSearchParams(window.location.search).get('theme'); // ?theme=light para enlaces de demo
  if (q === 'light' || q === 'dark') return q;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* almacenamiento bloqueado */
  }
  return 'dark'; // la identidad de Marswalk es oscura; el claro es opcional
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || readTheme());
  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* sin persistencia: solo esta sesión */
    }
    const run = () => {
      applyTheme(next);
      setTheme(next);
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduce) document.startViewTransition(run);
    else run();
  }, [theme]);
  return [theme, toggle];
}

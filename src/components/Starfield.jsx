// Fondo de estrellas a la deriva (el ambiente de partículas de ETH Zürich Space, con canvas propio).
import { useEffect, useRef } from 'react';

const COLORS = ['250,249,245', '163,184,255', '194,221,255']; // [CoM] white · [ETH] #A3B8FF · #C2DDFF

export default function Starfield() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let stars = [];
    let raf = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 16000);
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.2,
        vx: (Math.random() - 0.5) * 0.04,
        vy: (Math.random() - 0.5) * 0.04,
        a: Math.random() * 0.6 + 0.2,
        ph: Math.random() * Math.PI * 2,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
      }));
    };
    let lastDraw = 0;
    const draw = (t) => {
      // 15 cuadros/s bastan para la deriva lenta; en pausa si la pestaña no se ve.
      const covered = document.documentElement.dataset.theme === 'light' || !window.location.hash || window.location.hash === '#home';
      if (t - lastDraw < 66 || document.hidden || covered) {
        // Con "reducir movimiento" se sigue esperando hasta poder dibujar el primer cuadro.
        if (!reduce || covered || document.hidden || !lastDraw) raf = requestAnimationFrame(draw);
        return;
      }
      lastDraw = t;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        if (!reduce) {
          s.x = (s.x + s.vx * 4 + w) % w;
          s.y = (s.y + s.vy * 4 + h) % h;
        }
        const a = s.a * (0.7 + 0.3 * Math.sin(t / 1400 + s.ph));
        ctx.fillStyle = `rgba(${s.c},${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}

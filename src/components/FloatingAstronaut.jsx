// Astronauta flotante del Inicio: sigue al puntero con paralaje suave y da una voltereta al tocarlo.
// Solo anima transform (GPU) y el bucle rAF corre únicamente mientras el puntero se mueve.
import { useEffect, useRef } from 'react';

const SRC = '/img/astronaut-float.webp';

export default function FloatingAstronaut({ alt, hint }) {
  const wrap = useRef(null);
  const img = useRef(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const host = el.closest('.home') || window;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const tick = () => {
      x += (tx - x) * 0.07;
      y += (ty - y) * 0.07;
      el.style.setProperty('--px', x.toFixed(4));
      el.style.setProperty('--py', y.toFixed(4));
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.0008 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave);
    return () => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  const flip = () => {
    const node = img.current;
    if (!node?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (node.getAnimations().length) return; // no encadenar volteretas
    node.animate(
      [
        { transform: 'rotate(0deg) scale(1)' },
        { transform: 'rotate(-200deg) scale(0.92)', offset: 0.55 },
        { transform: 'rotate(-360deg) scale(1)' },
      ],
      { duration: 1800, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
    );
  };

  return (
    <div className="astro-fly" ref={wrap}>
      <button type="button" className="astro-fly-btn" onClick={flip} aria-label={hint} title={hint}>
        <span className="astro-fly-float">
          <img ref={img} src={SRC} alt={alt} width="613" height="547" decoding="async" fetchpriority="high" draggable="false" />
        </span>
      </button>
      <span className="astro-fly-hint caption">{hint}</span>
    </div>
  );
}

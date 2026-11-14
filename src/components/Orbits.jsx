// Esquema orbital Tierra–Marte con las paletas de galaxia de RS69 (gradientes radiales core→bright→mid).
// Marte en ámbar (suelo), Tierra en violeta (enlace con retraso), el Sol en oro. Los paquetes de datos
// viajan de Marte a la Tierra según el retraso de la luz elegido. Órbitas circulares: es un esquema.
import { useEffect, useRef } from 'react';
import { MARS_ORBIT_AU, separationAngle } from '../lib/delayQueue.js';

const PAL = {
  // [RS69] script.min.js — paletas { core, bright, mid, dark }
  mars: { core: [255, 250, 230], bright: [255, 210, 140], mid: [240, 150, 70], dark: [180, 80, 30] },
  earth: { core: [255, 240, 255], bright: [210, 170, 255], mid: [150, 90, 220], dark: [80, 40, 160] },
  orbit: { core: [240, 250, 255], bright: [150, 210, 255], mid: [70, 150, 240], dark: [30, 80, 180] },
  gold: [255, 179, 38], // [RS69] gold = vec3(1.0, 0.7, 0.15)
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function glow(ctx, x, y, r, p, a = 1) {
  // Mismo orden de paradas que las galaxias de RS69: core → bright → mid → transparente.
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(p.core, 0.95 * a));
  g.addColorStop(0.18, rgba(p.bright, 0.75 * a));
  g.addColorStop(0.45, rgba(p.mid, 0.25 * a));
  g.addColorStop(1, rgba(p.mid, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export default function Orbits({ delayMin, packets, labels }) {
  const ref = useRef(null);
  const live = useRef({ delayMin, packets, labels });
  live.current = { delayMin, packets, labels };

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let lastFrame = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = (now) => {
      if (document.hidden || now - lastFrame < 33) {
        raf = requestAnimationFrame(draw); // ~30 cuadros/s y en pausa con la pestaña oculta
        return;
      }
      lastFrame = now;
      const { delayMin: d, packets: pk, labels: lb } = live.current;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const unit = (Math.min(w, h) / 2 - 36) / MARS_ORBIT_AU; // px por UA
      const spin = reduce ? 0 : now / 60000; // rotación lenta del conjunto
      const theta = separationAngle(d);
      const aE = -Math.PI / 2 + spin;
      const aM = aE + theta;
      const E = [cx + Math.cos(aE) * unit, cy + Math.sin(aE) * unit];
      const M = [cx + Math.cos(aM) * unit * MARS_ORBIT_AU, cy + Math.sin(aM) * unit * MARS_ORBIT_AU];

      // Órbitas
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(PAL.earth.mid, 0.55);
      ctx.beginPath();
      ctx.arc(cx, cy, unit, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = rgba(PAL.mars.mid, 0.55);
      ctx.beginPath();
      ctx.arc(cx, cy, unit * MARS_ORBIT_AU, 0, Math.PI * 2);
      ctx.stroke();

      // Sol
      const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 46);
      sg.addColorStop(0, 'rgba(255,250,235,1)');
      sg.addColorStop(0.25, rgba(PAL.gold, 0.85));
      sg.addColorStop(1, rgba(PAL.gold, 0));
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.fill();

      // Enlace Marte → Tierra
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = rgba(PAL.earth.bright, 0.35);
      ctx.beginPath();
      ctx.moveTo(M[0], M[1]);
      ctx.lineTo(E[0], E[1]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Paquetes en tránsito
      for (const p of pk) {
        const k = Math.max(0, Math.min(1, p.progress));
        const x = M[0] + (E[0] - M[0]) * k;
        const y = M[1] + (E[1] - M[1]) * k;
        glow(ctx, x, y, 14, p.sev === 'alert' || p.sev === 'warn' ? PAL.mars : PAL.earth, 1);
      }

      // Planetas
      glow(ctx, M[0], M[1], 30, PAL.mars);
      glow(ctx, E[0], E[1], 30, PAL.earth);

      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#87867f';
      ctx.textAlign = 'center';
      ctx.fillText(lb.sun.toUpperCase(), cx, cy + 58);
      ctx.fillStyle = rgba(PAL.mars.bright, 1);
      ctx.fillText(lb.mars.toUpperCase(), M[0], M[1] + 44);
      ctx.fillStyle = rgba(PAL.earth.bright, 1);
      ctx.fillText(lb.earth.toUpperCase(), E[0], E[1] - 36);
      ctx.fillStyle = '#faf9f5';
      ctx.font = '13px "JetBrains Mono", monospace';
      ctx.fillText(`${d.toFixed(0)} min`, (M[0] + E[0]) / 2, (M[1] + E[1]) / 2 - 10);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="orbits">
      <canvas ref={ref} role="img" aria-label="Earth–Mars light-time diagram" />
    </div>
  );
}

// Animación sobre el mapa de la EVA cuando hay una simulación de entorno activa.
// Tormenta de polvo: bruma naranja que avanza y baja la visibilidad.
// Remolino de polvo: columna giratoria que cruza el mapa.
// Tormenta solar: destellos de partículas que «golpean» el detector y un borde violeta.
const HITS = Array.from({ length: 26 }, (_, i) => ({
  x: (i * 37) % 100,
  y: (i * 61) % 100,
  d: ((i * 13) % 20) / 10,
}));

export default function SimOverlay({ sims, t }) {
  if (!sims) return null;
  const on = Object.entries(sims).filter(([, v]) => v);
  if (!on.length) return null;
  return (
    <div className="sim-overlay" aria-hidden="true">
      {sims.dust && (
        <div className="sim-dust">
          <div className="haze h1" />
          <div className="haze h2" />
          <div className="haze h3" />
        </div>
      )}
      {sims.devil && (
        <div className="sim-devil">
          <svg viewBox="0 0 80 200">
            {Array.from({ length: 9 }, (_, i) => (
              <ellipse key={i} cx="40" cy={20 + i * 20} rx={6 + i * 3.4} ry={3 + i * 0.9} style={{ animationDelay: `${-i * 0.12}s` }} />
            ))}
          </svg>
        </div>
      )}
      {sims.sep && (
        <div className="sim-sep">
          {HITS.map((h, i) => (
            <span key={i} style={{ left: `${h.x}%`, top: `${h.y}%`, animationDelay: `${h.d}s` }} />
          ))}
        </div>
      )}
      <div className="sim-chips">
        {on.map(([k]) => (
          <span key={k} className={`sim-chip ${k}`}>
            <span className="blink" /> {t(`sim.${k}.label`)}
          </span>
        ))}
      </div>
    </div>
  );
}

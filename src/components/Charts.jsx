// Gráficas SVG simples para Comparar: barras horizontales por métrica y flujo del orden de visita.
export function BarChart({ title, rows, fmt, unit = '' }) {
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  return (
    <figure className="bars">
      <figcaption className="caption">{title}</figcaption>
      {rows.map((r) => (
        <div key={r.label} className="bar-row">
          <span className="bar-label">
            <i style={{ background: r.dash ? 'transparent' : r.color, borderColor: r.color }} className={r.dash ? 'dash' : ''} />
            {r.label}
          </span>
          <span className="bar-track" role="img" aria-label={`${r.label}: ${fmt(r.value)}${unit}`}>
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </span>
          <span className="bar-val">
            {fmt(r.value)}
            {unit}
          </span>
        </div>
      ))}
    </figure>
  );
}

/** Orden de visita como cadena de paradas numeradas; resalta las que cambian de posición. */
export function OrderFlow({ title, ids, nameOf, color, refIds }) {
  return (
    <div className="flow">
      <div className="caption" style={{ color }}>{title}</div>
      <ol>
        {ids.map((id, i) => (
          <li key={id} className={refIds && refIds[i] !== id ? 'moved' : ''} style={{ '--c': color }}>
            <b>{i + 1}</b>
            {nameOf(id)}
          </li>
        ))}
      </ol>
    </div>
  );
}

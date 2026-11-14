// Perfil de elevación de la ruta con la posición actual.
export default function Profile({ profile, at_m, total_m }) {
  if (!profile || profile.length < 2) return null;
  const W = 600;
  const H = 140;
  const P = 6;
  const maxD = profile[profile.length - 1].d_m || 1;
  const elevs = profile.map((p) => p.elev_m);
  const lo = Math.min(...elevs);
  const hi = Math.max(...elevs);
  const span = hi - lo || 1;
  const x = (d) => P + ((W - 2 * P) * d) / maxD;
  const y = (e) => H - P - ((H - 2 * P) * (e - lo)) / span;
  const line = profile.map((p, i) => `${i ? 'L' : 'M'}${x(p.d_m).toFixed(1)},${y(p.elev_m).toFixed(1)}`).join('');
  const area = `${line}L${x(maxD)},${H - P}L${x(0)},${H - P}Z`;
  const pos = at_m != null && total_m ? (at_m / total_m) * maxD : null;
  return (
    <div className="profile">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="profile">
        <path d={area} fill="rgb(70 150 240 / 0.12)" />
        <path d={line} fill="none" stroke="rgb(150 210 255)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        {profile
          .filter((p) => p.risk)
          .map((p, i) => (
            <circle key={i} cx={x(p.d_m)} cy={y(p.elev_m)} r="2.5" fill="rgb(255 115 13)" />
          ))}
        {pos != null && (
          <line x1={x(pos)} x2={x(pos)} y1={P} y2={H - P} stroke="rgb(255 210 140)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="row caption" style={{ marginTop: 4 }}>
        <span>{Math.round(lo)} m</span>
        <span>{Math.round(hi)} m</span>
      </div>
    </div>
  );
}

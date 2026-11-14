// Combina los tramos A* de una EVA de varias paradas en un resumen para el plan.
export function combineLegs(legs) {
  if (!legs || !legs.length) return null;
  const coords = [];
  const profile = [];
  let offset = 0;
  let distance = 0;
  let gain = 0;
  let risk = 0;
  let maxSlope = 0;
  for (const leg of legs) {
    coords.push(...(coords.length ? leg.coords.slice(1) : leg.coords));
    for (const p of leg.profile) profile.push({ ...p, d_m: p.d_m + offset });
    offset += leg.profile.length ? leg.profile[leg.profile.length - 1].d_m : leg.total;
    distance += leg.distance_m ?? leg.total;
    gain += leg.elevation_gain_m ?? 0;
    risk += (leg.pct_risk_cells ?? 0) * (leg.distance_m ?? leg.total);
    maxSlope = Math.max(maxSlope, leg.max_slope_deg ?? 0);
  }
  return {
    coords,
    distance_m: distance,
    elevation_gain_m: gain,
    pct_risk_cells: distance ? risk / distance : 0,
    max_slope_deg: maxSlope,
    profile,
    explanations: legs.flatMap((l) => l.explanations),
  };
}

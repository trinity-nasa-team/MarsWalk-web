// Valores derivados de la EVA para las vistas (posición, distancias, perfil local).
import { haversine, profileAt, sliceFrom, sliceTo } from '../lib/geo.js';
import { legTarget, positions } from '../lib/sim.js';

export function derive(state) {
  const eva = state.eva;
  if (state.phase !== 'eva' || !eva) return null;
  const p = positions(eva);
  const { coords, cum } = eva.route;
  const local = profileAt(eva.route.profile, eva.progress_m);
  const target = legTarget(state);
  return {
    astro: p.astro,
    robot: p.robot,
    remaining_m: p.remaining_m,
    toTarget_m: haversine(p.astro.pos, target),
    toHabitat_m: haversine(p.astro.pos, state.plan.habitat),
    done: sliceTo(coords, cum, eva.progress_m),
    ahead: sliceFrom(coords, cum, eva.progress_m),
    aheadOfRobot: sliceFrom(coords, cum, p.robotD),
    elev_m: local ? local.elev_m : null,
    slope_deg: local ? local.slope_deg : null,
    status: state.running || eva.state === 'done' ? eva.state : 'paused',
  };
}

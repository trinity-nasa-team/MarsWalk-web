// Cliente de la API. Nunca lanza: devuelve { ok, data } o { ok: false, error: { error, code } }.
const BASE = '/api';
export const REGION = 'jezero';

async function request(path, init, kind = 'json') {
  try {
    const res = await fetch(BASE + path, init);
    if (res.ok) return { ok: true, data: kind === 'buffer' ? await res.arrayBuffer() : await res.json() };
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* sin JSON */
    }
    return { ok: false, status: res.status, error: body && body.error ? body : { error: `HTTP ${res.status}`, code: 'http_error' } };
  } catch {
    return { ok: false, status: 0, error: { error: 'network', code: 'network' } };
  }
}

const post = (path, body) =>
  request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const ll = (p) => ({ lat: p[1], lon: p[0] });

export const api = {
  habitatChat: (body) => post('/habitat/chat', body),
  regions: () => request('/regions'),
  layers: () => request(`/regions/${REGION}/layers`),
  pois: () => request(`/regions/${REGION}/pois`),
  presets: () => request(`/regions/${REGION}/route/presets`),
  traverse: () => request(`/regions/${REGION}/traverse`),
  ortho: () => request(`/regions/${REGION}/ortho`),
  marsPois: () => fetch('/api/mars/pois').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  cell: (lat, lon, region = REGION) => request(`/regions/${region}/cell?lat=${lat}&lon=${lon}`),
  terrainMeta: (region = REGION) => request(`/regions/${region}/terrain-grid`),
  /** 016: región con relieve alrededor de cualquier punto de Marte (Jezero si cae dentro). */
  site: (pos) => post('/sites', ll(pos)),
  terrainData: (url) => request(url.replace(/^\/api/, ''), undefined, 'buffer'),
  /** Capa de arena (textura HiRISE) del planificador v4, con bbox lon/lat. */
  sandLayer: () => request(`/regions/${REGION}/eva/sand-layer`),
  /** Perfil de regreso del astronauta (energía, O2, punto de no retorno) para la EVA hábitat -> paradas -> hábitat. */
  returnProfile: ({ habitat, waypoints, budgetWh, kitKg }) =>
    post(`/regions/${REGION}/eva/return-profile`, { habitat: ll(habitat), waypoints: waypoints.map(ll), budget_wh: budgetWh, kit_kg: kitKg }),
  /**
   * Ruta de un tramo: from/to/habitat como [lon, lat]. En Jezero usa el planificador v4 (arena de Séítah,
   * pendiente fina, peligros del robot como celdas verificadas); fuera de Jezero, el A* legado con walkback.
   */
  route: ({ from, to, habitat, preset, hazards = [], maxRadius, region = REGION, agent = 'astronaut' }) =>
    region === REGION
      ? post(`/regions/${region}/eva/replan-leg`, {
          start: ll(from),
          goal: ll(to),
          preset,
          agent,
          obstacles: hazards.map((h) => ({ ...ll(h.pos), radius_m: h.radius_m })),
        })
      : post(`/regions/${region}/route`, {
      start: ll(from),
      goal: ll(to),
      preset,
      ...(habitat ? { habitat: ll(habitat), max_radius_m: maxRadius } : {}),
      obstacles: hazards.map((h) => ({ ...ll(h.pos), radius_m: h.radius_m })),
    }),
  /** Misiones NSGA-II (004): orden de visita óptimo de varios sitios desde `habitat`. */
  missions: ({ habitat, poiIds }) =>
    post(`/regions/${REGION}/missions`, {
      habitat: ll(habitat),
      poi_ids: poiIds,
      max_radius_m: 100000,
      max_time_h: 720,
      energy_budget_wh: 50000,
      open_path: true, // solo ida, como Perseverance (no regresa al inicio)
      pop_size: 40, // 3–8 sitios: población y generaciones pequeñas bastan
      n_generations: 40,
    }),
};
